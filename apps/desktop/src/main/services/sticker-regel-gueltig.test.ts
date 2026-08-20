// Wächter: Übersteht eine von der Sticker-Seite gebaute Regel den ECHTEN
// Validator?
//
// Anlass: Die Seite baute die Sound-Aktion einmal als verschachteltes
// `{ kind: { kind: 'play_sound', soundId } }` statt flach — versteckt hinter
// einem `as unknown as`-Cast. Beim Speichern hätte validateTriggerAction sie
// verworfen (dort muss `kind` ein Text sein), die Regel wäre ohne Aktionen
// gelandet und die Sticker-Seite hätte schlicht nichts ausgelöst.
//
// Die Tests in sticker-mapping.test.ts konnten das NICHT sehen: Sie bauten die
// Aktion mit derselben Annahme wie der Code. Deshalb prüft dieser Test gegen
// den Validator, der beim Speichern wirklich läuft.
import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertStickerRule } from '@botexe/trigger-engine';
import { validateTriggerRule } from './validators';

test('eine Sticker-Regel mit Sound übersteht den Validator unverändert', () => {
  const [regel] = upsertStickerRule([], '7444741533452225312', [{ kind: 'play_sound', soundId: 'sound-7' }], 'Lachsticker');
  const geprueft = validateTriggerRule(regel);

  assert.ok(geprueft, 'die Regel wurde komplett verworfen');
  assert.equal(geprueft.event, 'emote');
  assert.equal(geprueft.actions.length, 1, 'die Aktion darf NICHT wegfallen — sonst passiert nichts');
  assert.deepEqual(geprueft.actions[0], { kind: 'play_sound', soundId: 'sound-7' });
  assert.deepEqual(
    geprueft.conditions,
    [{ kind: 'sticker_ist', value: '7444741533452225312' }],
    'ohne die Bedingung wuerde die Regel bei JEDEM Sticker feuern',
  );
});

test('eine verschachtelte Aktion wird vom Validator verworfen — der Fehler von damals', () => {
  // Belegt, dass der Validator die falsche Form wirklich aussortiert. Damit ist
  // der Test oben aussagekraeftig und nicht bloss immer gruen.
  const kaputt = {
    id: 'stickermap-42', name: 'Sticker: #42', event: 'emote',
    conditions: [{ kind: 'sticker_ist', value: '42' }],
    actions: [{ kind: { kind: 'play_sound', soundId: 's1' } }],
    enabled: true,
  };
  const geprueft = validateTriggerRule(kaputt);
  assert.equal(geprueft?.actions.length ?? 0, 0, 'die verschachtelte Aktion muss rausfliegen');
});
