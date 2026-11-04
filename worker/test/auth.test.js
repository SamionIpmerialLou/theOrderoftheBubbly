import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import {
  createSessionToken,
  getBearerToken,
  verifyPassword,
  verifySessionToken
} from '../src/auth.js';

function makeHash(password) {
  const iterations = 100000;
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2_sha256$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

test('verifyPassword accepts the correct password', async () => {
  const stored = makeHash('correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery staple', stored), true);
});

test('verifyPassword rejects a wrong password', async () => {
  const stored = makeHash('correct horse battery staple');
  assert.equal(await verifyPassword('wrong password', stored), false);
});

test('verifyPassword rejects malformed hashes', async () => {
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
});

test('session tokens round-trip and reject tampering', async () => {
  const secret = 'test-session-secret';
  const session = await createSessionToken(secret, 3600);
  const payload = await verifySessionToken(session.token, secret);
  assert.equal(payload.sub, 'lord-bubly');
  assert.ok(payload.exp > Math.floor(Date.now() / 1000));

  const tampered = `${session.token.slice(0, -1)}x`;
  assert.equal(await verifySessionToken(tampered, secret), null);
  assert.equal(await verifySessionToken(session.token, 'different-secret'), null);
});

test('getBearerToken extracts a bearer token', () => {
  const request = new Request('https://example.com', {
    headers: { Authorization: 'Bearer abc.def' }
  });
  assert.equal(getBearerToken(request), 'abc.def');
});
