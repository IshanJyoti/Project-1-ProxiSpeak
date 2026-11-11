import assert from 'node:assert/strict';
import test from 'node:test';
import { filterChatEvents } from '../src/chatSearch.js';

const events = [
  { displayName: 'Alex', type: 'message', text: 'Design review at noon' },
  { displayName: 'Sam', type: 'message', text: 'Thanks for sharing!' },
  { displayName: 'Alex', type: 'reaction', reaction: '🎉' },
];

test('chat search matches message text without case sensitivity', () => {
  assert.deepEqual(filterChatEvents(events, 'DESIGN'), [events[0]]);
});

test('chat search matches teammate names', () => {
  assert.deepEqual(filterChatEvents(events, 'sam'), [events[1]]);
});

test('chat search matches quick reactions', () => {
  assert.deepEqual(filterChatEvents(events, '🎉'), [events[2]]);
});

test('chat search trims whitespace and returns all events for a blank query', () => {
  assert.deepEqual(filterChatEvents(events, '  noon  '), [events[0]]);
  assert.equal(filterChatEvents(events, '  '), events);
});

test('chat search returns no events when nothing matches', () => {
  assert.deepEqual(filterChatEvents(events, 'missing'), []);
});
