// boss.ts — Stream-Boss-Logik (reiner State, keine Studio-Integration).
// Zuschauer fügen einem gemeinsamen "Boss" per Aktion (Gifts, Likes, …) Schaden
// zu. Bei HP 0 ist der Boss besiegt: Level + maxHp wachsen für den nächsten
// Spawn, und die Top-Damager werden für ein Kill-Moment ausgewertet.
import type { MomentPayload } from '@botexe/overlay-engine';

/** Minimaler Boss-Bezeichner (z.B. der herausfordernde Zuschauer). */
export interface BossIdentity {
  id: string;
  nickname: string;
  profilePic?: string;
}

/** Schadensquelle (wer den Treffer landet). */
export interface DamageSource {
  id: string;
  nickname: string;
}

/** Ein aggregierter Top-Damager (Schaden über alle Treffer summiert). */
export interface DamagerEntry {
  id: string;
  nickname: string;
  damage: number;
}

/** Vollständiger, serialisierbarer Boss-Zustand. */
export interface BossState {
  hp: number;
  maxHp: number;
  level: number;
  currentBoss?: BossIdentity;
  topDamagers: DamagerEntry[];
}

/** Ergebnis eines Schadens-Treffers. */
export interface DamageResult {
  killed: boolean;
  hpAfter: number;
}

/** Ergebnis eines Kills (Auswertung für das Kill-Moment). */
export interface KillResult {
  level: number;
  topDamagers: DamagerEntry[];
}

export interface BossOptions {
  /** Basis-HP auf Level 0 (Default 1000). */
  baseHp?: number;
  /** Wachstumsfaktor pro Level: maxHp = baseHp * hpGrowth^level (Default 1.5). */
  hpGrowth?: number;
}

const TOP_DAMAGERS = 5;

export class BossService {
  private readonly baseHp: number;
  private readonly hpGrowth: number;

  private hp = 0;
  private maxHp: number;
  private level = 0;
  private currentBoss?: BossIdentity;

  // Schaden pro Zuschauer-id aufsummiert; Reihenfolge der ersten Sichtung
  // bleibt erhalten, die Sortierung passiert erst bei der Ausgabe.
  private damagers = new Map<string, DamagerEntry>();

  constructor(opts?: BossOptions) {
    this.baseHp = opts?.baseHp ?? 1000;
    this.hpGrowth = opts?.hpGrowth ?? 1.5;
    this.maxHp = this.hpForLevel(this.level);
  }

  /** maxHp für ein bestimmtes Level: baseHp * hpGrowth^level (gerundet). */
  private hpForLevel(level: number): number {
    return Math.round(this.baseHp * Math.pow(this.hpGrowth, level));
  }

  /** Startet einen neuen Boss: volle HP nach aktuellem Level, Damager-Reset. */
  spawn(boss?: BossIdentity): void {
    this.maxHp = this.hpForLevel(this.level);
    this.hp = this.maxHp;
    this.currentBoss = boss;
    this.damagers.clear();
  }

  /**
   * Fügt dem Boss Schaden zu. Negative/0-Beträge werden ignoriert (kein Heal).
   * HP wird auf min 0 begrenzt; topDamagers werden pro id aufsummiert.
   */
  damage(source: DamageSource, amount: number): DamageResult {
    const dmg = amount > 0 ? Math.floor(amount) : 0;
    if (dmg > 0) {
      this.hp = Math.max(0, this.hp - dmg);
      const prev = this.damagers.get(source.id);
      if (prev) {
        prev.damage += dmg;
        prev.nickname = source.nickname; // jüngsten Nickname übernehmen
      } else {
        this.damagers.set(source.id, { id: source.id, nickname: source.nickname, damage: dmg });
      }
    }
    return { killed: this.hp <= 0, hpAfter: this.hp };
  }

  /**
   * Wertet einen Kill aus und bereitet den nächsten Spawn vor: Level steigt,
   * maxHp wächst entsprechend. Liefert das erreichte Level + die Top-Damager.
   */
  onKill(): KillResult {
    const result: KillResult = { level: this.level, topDamagers: this.computeTopDamagers() };
    this.level += 1;
    this.maxHp = this.hpForLevel(this.level);
    return result;
  }

  /** Aktueller Zustand (defensive Kopien, kein interner State leakt heraus). */
  getState(): BossState {
    return {
      hp: this.hp,
      maxHp: this.maxHp,
      level: this.level,
      currentBoss: this.currentBoss ? { ...this.currentBoss } : undefined,
      topDamagers: this.computeTopDamagers(),
    };
  }

  /** Top-N Damager, absteigend nach Schaden sortiert. */
  private computeTopDamagers(): DamagerEntry[] {
    return [...this.damagers.values()]
      .sort((a, b) => b.damage - a.damage)
      .slice(0, TOP_DAMAGERS)
      .map((d) => ({ ...d }));
  }
}

let momentCounter = 0;
function nextMomentId(prefix: string): string {
  momentCounter += 1;
  return `${prefix}-${Date.now()}-${momentCounter}`;
}

/**
 * Kleines Schadens-Moment (ein Treffer landet). Niedrige Priorität (~50), kurz —
 * dient als Feedback-Einblender, soll Kill-Momente nie verdrängen.
 */
export function bossDamageMoment(source: DamageSource, amount: number, state: BossState): MomentPayload {
  const dmg = amount > 0 ? Math.floor(amount) : 0;
  return {
    id: nextMomentId('boss-damage'),
    channel: 'boss',
    type: 'boss-damage',
    priority: 50,
    durationMs: 1500,
    user: { id: source.id, nickname: source.nickname },
    title: source.nickname,
    subtitle: `-${dmg} HP`,
    stats: { damage: dmg, hp: state.hp, maxHp: state.maxHp },
  };
}

/**
 * Kill-Moment (Boss besiegt). Höchste Priorität (100), zeigt Level + Top-Damager.
 */
export function bossKillMoment(state: BossState, topDamagers: DamagerEntry[]): MomentPayload {
  const stats: Record<string, number | string> = { level: state.level };
  topDamagers.forEach((d, i) => {
    stats[`top${i + 1}`] = d.nickname;
    stats[`top${i + 1}Damage`] = d.damage;
  });
  return {
    id: nextMomentId('boss-kill'),
    channel: 'boss',
    type: 'boss-kill',
    priority: 100,
    durationMs: 6000,
    user: state.currentBoss ? { ...state.currentBoss } : undefined,
    title: state.currentBoss ? `${state.currentBoss.nickname} besiegt!` : 'Boss besiegt!',
    subtitle: topDamagers[0] ? `MVP: ${topDamagers[0].nickname}` : undefined,
    stats,
    level: { value: state.level, title: `Boss Lvl ${state.level}`, currentWins: state.level },
  };
}
