// profile-layout-isolation.test.ts — P2-1-Audit-Regressionstest.
//
// LayoutStore + ProfileStore teilen sich EIN userDataDir; Layouts liegen NICHT
// pro Profil, sondern in einem einzigen gemeinsamen Verzeichnis (siehe
// layout-store.ts). Studio#switchProfile importiert das Ziel-Profil-Bundle in
// diesen gemeinsamen Store, OHNE vorher die Layouts des vorherigen Profils zu
// entfernen — ohne pruneExcept() (layout-store.ts) blieben sie global sichtbar
// UND würden beim nächsten Zurückwechseln über exportConfig()/saveBundle() ins
// falsche, gerade verlassene Profil-Bundle zurückgeschrieben.
//
// Dieser Test bildet exakt die relevanten Schritte aus Studio#switchProfile
// nach (export → saveBundle → import → prune → setActiveId), ohne die
// schwergewichtige Studio-Klasse selbst zu instanziieren (TikTok/OBS/TTS-
// Abhängigkeiten).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LayoutStore } from './layout-store';
import { ProfileStore } from './profile-store';

function layout(id: string, name: string) {
  return {
    schemaVersion: 1,
    id,
    name,
    canvas: { width: 1920, height: 1080, background: 'transparent' },
    layers: [],
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-06-10T12:00:00.000Z',
  };
}

/** Minimal-Nachbau von Studio#switchProfile — nur der layout-relevante Teil. */
function switchProfile(
  layouts: LayoutStore,
  profiles: ProfileStore,
  targetId: string,
  exportBundle: () => Record<string, unknown>,
): void {
  const target = profiles.get(targetId);
  assert.ok(target, 'Ziel-Profil muss existieren');
  const activeId = profiles.getActiveId();
  if (activeId && activeId !== targetId) profiles.saveBundle(activeId, exportBundle(), Date.now());
  for (const l of (target!.bundle.layouts as unknown[]) ?? []) layouts.save(l);
  const targetLayoutIds = new Set(
    ((target!.bundle.layouts as { id?: unknown }[]) ?? [])
      .map((l) => (l && typeof l.id === 'string' ? l.id : undefined))
      .filter((v): v is string => typeof v === 'string'),
  );
  layouts.pruneExcept(targetLayoutIds);
  profiles.setActiveId(targetId);
}

test('Profilwechsel: Layouts des vorherigen Profils bleiben nach dem Wechsel NICHT global sichtbar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bx-profile-iso-'));
  const layouts = new LayoutStore(dir);
  const profiles = new ProfileStore(dir);

  // Profil A anlegen + aktivieren, mit Layout "a1".
  layouts.save(layout('a1', 'A-Overlay'));
  const exportA = () => ({ schemaVersion: 1, settings: {}, layouts: layouts.list(), viewers: [] });
  const profileA = profiles.create('Profil A', exportA(), Date.now());
  profiles.setActiveId(profileA.id);

  // Profil B anlegen (eigenes Layout "b1", KEIN a1).
  const profileB = profiles.create('Profil B', {
    schemaVersion: 1, settings: {}, layouts: [layout('b1', 'B-Overlay')], viewers: [],
  }, Date.now());

  // A → B wechseln.
  switchProfile(layouts, profiles, profileB.id, exportA);

  const idsInB = layouts.list().map((l) => l.id).sort();
  assert.deepEqual(idsInB, ['b1'], 'nach dem Wechsel darf a1 nicht mehr sichtbar sein');

  // B → A zurückwechseln: B darf jetzt NICHT mit a1 verunreinigt worden sein —
  // sonst würde saveBundle() beim (nächsten) Verlassen von B a1 fälschlich in
  // Bs Bundle zurückschreiben.
  const exportB = () => ({ schemaVersion: 1, settings: {}, layouts: layouts.list(), viewers: [] });
  switchProfile(layouts, profiles, profileA.id, exportB);

  const savedB = profiles.get(profileB.id);
  const bBundleIds = ((savedB!.bundle.layouts as { id: string }[]) ?? []).map((l) => l.id).sort();
  assert.deepEqual(bBundleIds, ['b1'], 'Profil Bs gesichertes Bundle darf a1 NICHT enthalten (kein Bleed-Through)');

  const idsInA = layouts.list().map((l) => l.id).sort();
  assert.deepEqual(idsInA, ['a1'], 'zurück in A darf b1 nicht mehr sichtbar sein');
});
