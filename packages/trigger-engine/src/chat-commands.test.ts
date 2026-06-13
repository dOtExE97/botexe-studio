import test from 'node:test';
import assert from 'node:assert/strict';
import { matchChatCommand, renderSpeakTemplate, type ChatCommand, type StudioEvent } from './index';

function cmd(overrides: Partial<ChatCommand> = {}): ChatCommand {
  return { id: 'c1', command: '!discord', response: 'Discord: x.gg', speak: true, sendToChat: false, enabled: true, ...overrides };
}

test('matchChatCommand: erster aktivierter Treffer, deaktivierte ignoriert', () => {
  const cmds = [
    cmd({ id: 'off', command: '!discord', enabled: false }),
    cmd({ id: 'on', command: '!discord' }),
    cmd({ id: 'other', command: '!regeln' }),
  ];
  assert.equal(matchChatCommand(cmds, '!discord')?.id, 'on');
  assert.equal(matchChatCommand(cmds, '!discord jetzt')?.id, 'on', 'mit Argument auch');
  assert.equal(matchChatCommand(cmds, '!regeln')?.id, 'other');
  assert.equal(matchChatCommand(cmds, 'kein befehl'), null);
  assert.equal(matchChatCommand(cmds, '!gibtsnicht'), null);
});

test('Antwort-Platzhalter {user} wird gefüllt', () => {
  const event: StudioEvent = { type: 'chat', ts: 1, user: { id: 'u', nickname: 'Mia' }, text: '!hug' };
  assert.equal(renderSpeakTemplate('Hallo {user}! 💜', event), 'Hallo Mia! 💜');
});
