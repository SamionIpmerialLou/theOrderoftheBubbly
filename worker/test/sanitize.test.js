import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStateHtml } from '../src/sanitize.js';

function makeState(html) {
  return {
    schemaVersion: 1,
    settings: { weeklyQuota: 75, rexPoolBp: 5590 },
    members: [],
    decrees: [{ id: 'd1', title: 'T', contentHtml: html }]
  };
}

test('sanitizeStateHtml removes scripts and event handlers', () => {
  const state = sanitizeStateHtml(makeState('<p onclick="alert(1)">Safe</p><script>alert(1)</script>'));
  assert.equal(state.decrees[0].contentHtml, '<p>Safe</p>');
});

test('sanitizeStateHtml preserves allowed formatting', () => {
  const state = sanitizeStateHtml(makeState('<p><strong>Bold</strong> and <em>italic</em></p>'));
  assert.match(state.decrees[0].contentHtml, /<strong>Bold<\/strong>/);
  assert.match(state.decrees[0].contentHtml, /<em>italic<\/em>/);
});

test('sanitizeStateHtml hardens links', () => {
  const state = sanitizeStateHtml(makeState('<p><a href="https://example.com">Link</a></p>'));
  assert.match(state.decrees[0].contentHtml, /target="_blank"/);
  assert.match(state.decrees[0].contentHtml, /rel="noopener noreferrer"/);
});
