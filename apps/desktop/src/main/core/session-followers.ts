// session-followers.ts — merkt sich, wer WÄHREND des laufenden Streams gefolgt
// ist. TikTok trägt den Follow-Status in Chat-Events nicht zuverlässig; das
// Live-Follow-Event ist verlässlich. Damit kann der TTS-Filter "nur Follower"
// auch frisch Gefolgte vorlesen. Pro Stream zurückgesetzt.

export class SessionFollowers {
  private ids = new Set<string>();

  /** Eine Live-Follow-User-ID merken (leere/fehlende IDs werden ignoriert). */
  add(userId: string | undefined | null): void {
    if (userId) this.ids.add(userId);
  }

  /** Einen Chat-User als Follower markieren, falls er in dieser Session gefolgt
   *  ist. Lässt einen bereits gesetzten Status unangetastet. */
  enrich(user: { id: string; isFollower?: boolean } | undefined | null): void {
    if (user && !user.isFollower && this.ids.has(user.id)) user.isFollower = true;
  }

  /** Neuer Stream → Gedächtnis leeren. */
  clear(): void {
    this.ids.clear();
  }

  get size(): number {
    return this.ids.size;
  }
}
