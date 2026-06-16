// sport-normalize.ts — Provider-Antworten in ein gemeinsames Match-Modell.
// Pure & defensiv (APIs liefern wechselnde/teils fehlende Felder).
/* eslint-disable @typescript-eslint/no-explicit-any -- externe API-Payloads sind dynamisch */

export type SportProvider = 'football-data' | 'openligadb';
export type MatchStatus = 'scheduled' | 'live' | 'finished';

export interface SportMatch {
  id: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  minute?: number;
  homeCrest?: string;
  awayCrest?: string;
  kickoff?: string;
  competition?: string;
}

/** Eine Tabellenzeile (Liga-/Gruppen-Tabelle). */
export interface SportStandingRow {
  position: number;
  team: string;
  crest?: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalDiff: number;
  /** Bei Turnieren (WM/EM): Gruppen-Label, sonst leer. */
  group?: string;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** football-data.org Status → unser Modell. */
function fdStatus(s: unknown): MatchStatus {
  const v = String(s ?? '').toUpperCase();
  if (v === 'IN_PLAY' || v === 'PAUSED' || v === 'LIVE') return 'live';
  if (v === 'FINISHED' || v === 'AWARDED') return 'finished';
  return 'scheduled';
}

export function normalizeMatches(provider: SportProvider, raw: unknown): SportMatch[] {
  try {
    if (provider === 'football-data') {
      const matches = (raw as { matches?: unknown })?.matches;
      if (!Array.isArray(matches)) return [];
      return matches.map((m) => {
        const x = m as Record<string, any>;
        return {
          id: String(x.id ?? `${x.homeTeam?.name}-${x.awayTeam?.name}`),
          home: str(x.homeTeam?.name) || '—',
          away: str(x.awayTeam?.name) || '—',
          homeScore: num(x.score?.fullTime?.home),
          awayScore: num(x.score?.fullTime?.away),
          status: fdStatus(x.status),
          ...(num(x.minute) !== null ? { minute: num(x.minute) as number } : {}),
          ...(x.homeTeam?.crest ? { homeCrest: str(x.homeTeam.crest) } : {}),
          ...(x.awayTeam?.crest ? { awayCrest: str(x.awayTeam.crest) } : {}),
          ...(x.utcDate ? { kickoff: str(x.utcDate) } : {}),
          ...(x.competition?.name ? { competition: str(x.competition.name) } : {}),
        };
      });
    }
    // openligadb: Array von Matches.
    if (!Array.isArray(raw)) return [];
    return raw.map((m) => {
      const x = m as Record<string, any>;
      const results = Array.isArray(x.matchResults) ? x.matchResults : [];
      // Höchster resultTypeID = aktuellster Stand (Endergebnis > Halbzeit).
      const latest = results.slice().sort((a: any, b: any) => (b?.resultTypeID ?? 0) - (a?.resultTypeID ?? 0))[0];
      const finished = x.matchIsFinished === true;
      const started = x.matchDateTime ? new Date(x.matchDateTime).getTime() <= Date.now() : false;
      return {
        id: String(x.matchID ?? `${x.team1?.teamName}-${x.team2?.teamName}`),
        home: str(x.team1?.teamName) || '—',
        away: str(x.team2?.teamName) || '—',
        homeScore: latest ? num(latest.pointsTeam1) : null,
        awayScore: latest ? num(latest.pointsTeam2) : null,
        status: finished ? 'finished' : started ? 'live' : 'scheduled',
        ...(x.team1?.teamIconUrl ? { homeCrest: str(x.team1.teamIconUrl) } : {}),
        ...(x.team2?.teamIconUrl ? { awayCrest: str(x.team2.teamIconUrl) } : {}),
        ...(x.matchDateTime ? { kickoff: str(x.matchDateTime) } : {}),
        ...(x.leagueName ? { competition: str(x.leagueName) } : {}),
      };
    });
  } catch {
    return [];
  }
}

/** Provider-Tabellen-Antwort → gemeinsames Zeilen-Modell. Pure & defensiv. */
export function normalizeStandings(provider: SportProvider, raw: unknown): SportStandingRow[] {
  try {
    if (provider === 'football-data') {
      const groups = (raw as { standings?: unknown })?.standings;
      if (!Array.isArray(groups)) return [];
      const out: SportStandingRow[] = [];
      for (const g of groups) {
        const gr = g as Record<string, any>;
        if (String(gr.type ?? 'TOTAL').toUpperCase() !== 'TOTAL') continue; // nur Gesamt-Tabelle
        const table = Array.isArray(gr.table) ? gr.table : [];
        const group = gr.group ? str(gr.group) : '';
        for (const r of table) {
          const x = r as Record<string, any>;
          out.push({
            position: int(x.position),
            team: str(x.team?.name) || '—',
            ...(x.team?.crest ? { crest: str(x.team.crest) } : {}),
            played: int(x.playedGames),
            won: int(x.won),
            draw: int(x.draw),
            lost: int(x.lost),
            points: int(x.points),
            goalDiff: int(x.goalDifference),
            ...(group ? { group } : {}),
          });
        }
      }
      return out;
    }
    // openligadb: Array von Tabellen-Einträgen, Reihenfolge = Platzierung.
    if (!Array.isArray(raw)) return [];
    return raw.map((r, i) => {
      const x = r as Record<string, any>;
      return {
        position: i + 1,
        team: str(x.teamName) || '—',
        ...(x.teamIconUrl ? { crest: str(x.teamIconUrl) } : {}),
        played: int(x.matches),
        won: int(x.won),
        draw: int(x.draw),
        lost: int(x.lost),
        points: int(x.points),
        goalDiff: int(x.goalDiff),
      };
    });
  } catch {
    return [];
  }
}
