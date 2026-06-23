// session-roles.ts — Rollen-Gedächtnis pro Stream (Mod/Teamherz/Follower).
// TikTok trägt den Rollen-Status NICHT zuverlässig in jeder Nachricht. Wer
// einmal als X erkannt wurde (per Event-Flag ODER Live-Follow), gilt für den
// Rest des Streams als X — damit das Vorlesen für eine Person nicht flackert
// (mal erkannt, mal übersprungen). Pro Stream zurückgesetzt.

interface RoleFlags {
  isMod?: boolean;
  isSub?: boolean;
  isFollower?: boolean;
}

type RoleUser = { id: string; userId?: string } & RoleFlags;

export class SessionRoles {
  private roles = new Map<string, RoleFlags>();

  /** Alle bekannten IDs eines Users (primär + rohe userId) — TikTok liefert mal
   *  die eine, mal die andere, daher unter beiden merken/nachschlagen. */
  private keysOf(user: RoleUser): string[] {
    return [user.id, user.userId].filter((k): k is string => !!k);
  }

  /** Aktuell erkannte Rollen eines Users ins Gedächtnis übernehmen (additiv). */
  remember(user: RoleUser | undefined | null): void {
    if (!user) return;
    if (!user.isMod && !user.isSub && !user.isFollower) return;
    for (const key of this.keysOf(user)) {
      const cur = this.roles.get(key) ?? {};
      if (user.isMod) cur.isMod = true;
      if (user.isSub) cur.isSub = true;
      if (user.isFollower) cur.isFollower = true;
      this.roles.set(key, cur);
    }
  }

  /** Gemerkte Rollen auf einen User anwenden (nur setzen, nie entfernen). */
  apply(user: RoleUser | undefined | null): void {
    if (!user) return;
    for (const key of this.keysOf(user)) {
      const r = this.roles.get(key);
      if (!r) continue;
      if (r.isMod) user.isMod = true;
      if (r.isSub) user.isSub = true;
      if (r.isFollower) user.isFollower = true;
    }
  }

  /** Neuer Stream → Gedächtnis leeren. */
  clear(): void {
    this.roles.clear();
  }

  get size(): number {
    return this.roles.size;
  }
}
