import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeState, ValidationError } from '../src/validate.js';

function sampleState() {
  return {
    schemaVersion: 1,
    settings: { weeklyQuota: 75, rexPoolBp: 5590 },
    members: [
      { name: 'Abby', role: 'Recruit', weekly: 165, bp: 3050, tabs: 16, status: 'Active' },
      { name: 'Abby', role: 'Recruit', weekly: 10, bp: 100, tabs: 0, status: 'Active' }
    ],
    decrees: [
      {
        id: 'decree-1',
        number: 1,
        category: 'Edict',
        isPinned: true,
        title: 'Test decree',
        date: 'Today',
        contentHtml: '<p>Hello</p>',
        author: 'Lord Bubly'
      }
    ]
  };
}

test('normalizeState clamps values and assigns unique ids', () => {
  const state = normalizeState(sampleState());
  assert.equal(state.settings.weeklyQuota, 75);
  assert.equal(state.members.length, 2);
  assert.equal(state.members[0].id, 'abby');
  assert.equal(state.members[1].id, 'abby-2');
  assert.equal(state.members[0].category, 'active');
  assert.equal(state.members[0].banishCount, 0);
});

test('normalizeState normalizes banished members', () => {
  const input = sampleState();
  input.members[0].category = 'banished';
  input.members[0].banishCount = 99;
  input.members[0].sanction = 'Outlaw';
  const state = normalizeState(input);
  assert.equal(state.members[0].category, 'banished');
  assert.equal(state.members[0].banishCount, 99);
  assert.equal(state.members[0].sanction, 'Outlaw');
});

test('normalizeState rejects empty member lists', () => {
  const input = sampleState();
  input.members = [];
  assert.throws(() => normalizeState(input), ValidationError);
});

test('normalizeState rejects non-array decrees', () => {
  const input = sampleState();
  input.decrees = null;
  assert.throws(() => normalizeState(input), ValidationError);
});
