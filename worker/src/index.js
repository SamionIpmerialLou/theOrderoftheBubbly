import {
  createSessionToken,
  getBearerToken,
  verifyPassword,
  verifySessionToken
} from './auth.js';
import { normalizeApplication, normalizeState, ValidationError } from './validate.js';
import { sanitizeStateHtml } from './sanitize.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const MAX_BODY_BYTES = 262144;
const LOGIN_WINDOW_SECONDS = 900;
const MAX_LOGIN_ATTEMPTS = 8;
const SESSION_TTL_SECONDS = 28800;
const APPLICATION_WINDOW_SECONDS = 3600;
const MAX_APPLICATIONS_PER_WINDOW = 5;
const MAX_ADMIN_APPLICATIONS = 1000;

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };

  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
}

async function readJsonBody(request) {
  const declaredLength = Number.parseInt(request.headers.get('Content-Length') || '0', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new ValidationError('Request body is too large.');
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ValidationError('Request body is too large.');
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ValidationError('Request body must be valid JSON.');
  }
}

async function getStateRow(env) {
  return env.DB.prepare(
    'SELECT payload, version, updated_at FROM site_state WHERE id = 1'
  ).first();
}

async function requireAuth(request, env) {
  const token = getBearerToken(request);
  if (!token) return null;
  return verifySessionToken(token, env.SESSION_SECRET);
}

async function pruneLoginAttempts(env, nowSeconds) {
  await env.DB.prepare(
    'DELETE FROM login_attempts WHERE attempted_at < ?'
  ).bind(nowSeconds - LOGIN_WINDOW_SECONDS).run();
}

async function getLoginAttemptCount(env, ip, nowSeconds) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM login_attempts WHERE ip = ? AND attempted_at >= ?'
  ).bind(ip, nowSeconds - LOGIN_WINDOW_SECONDS).first();
  return Number(row?.count || 0);
}

async function recordLoginFailure(env, ip, nowSeconds) {
  await env.DB.prepare(
    'INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)'
  ).bind(ip, nowSeconds).run();
}

async function clearLoginFailures(env, ip) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
}

async function handleGetState(env, cors) {
  const row = await getStateRow(env);
  if (!row) {
    return jsonResponse({ error: 'Ledger has not been seeded.' }, 503, cors);
  }

  let state;
  try {
    state = JSON.parse(row.payload);
  } catch (error) {
    return jsonResponse({ error: 'Ledger payload is invalid.' }, 500, cors);
  }

  return jsonResponse({
    state,
    version: row.version,
    updatedAt: row.updated_at
  }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

async function handleLogin(request, env, cors) {
  if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) {
    return jsonResponse({ error: 'Admin authentication is not configured.' }, 500, cors);
  }

  const body = await readJsonBody(request);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password || password.length > 200) {
    return jsonResponse({ error: 'Password is required.' }, 400, cors);
  }

  const ip = getClientIp(request);
  const nowSeconds = Math.floor(Date.now() / 1000);
  await pruneLoginAttempts(env, nowSeconds);

  const attempts = await getLoginAttemptCount(env, ip, nowSeconds);
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    return jsonResponse(
      { error: 'Too many login attempts. Try again later.' },
      429,
      { ...cors, 'Retry-After': String(LOGIN_WINDOW_SECONDS) }
    );
  }

  const valid = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  if (!valid) {
    await recordLoginFailure(env, ip, nowSeconds);
    return jsonResponse({ error: 'Invalid credentials.' }, 401, cors);
  }

  await clearLoginFailures(env, ip);
  const session = await createSessionToken(env.SESSION_SECRET, SESSION_TTL_SECONDS);
  return jsonResponse({ token: session.token, expiresAt: session.expiresAt }, 200, cors);
}

async function handleSession(request, env, cors) {
  const session = await requireAuth(request, env);
  if (!session) {
    return jsonResponse({ authenticated: false }, 401, cors);
  }
  return jsonResponse({
    authenticated: true,
    expiresAt: new Date(session.exp * 1000).toISOString()
  }, 200, cors);
}

async function handlePutState(request, env, cors) {
  const session = await requireAuth(request, env);
  if (!session) {
    return jsonResponse({ error: 'Unauthorized.' }, 401, cors);
  }

  const body = await readJsonBody(request);
  const expectedVersion = Number.parseInt(body?.version, 10);
  if (!Number.isFinite(expectedVersion) || expectedVersion < 0) {
    return jsonResponse({ error: 'A valid version is required.' }, 400, cors);
  }

  const normalized = normalizeState(body?.state);
  const sanitized = sanitizeStateHtml(normalized);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    'UPDATE site_state SET payload = ?, version = version + 1, updated_at = ? WHERE id = 1 AND version = ?'
  ).bind(JSON.stringify(sanitized), now, expectedVersion).run();

  if (!result.meta || result.meta.changes !== 1) {
    const current = await getStateRow(env);
    return jsonResponse({
      error: 'Version conflict. Reload the ledger before saving.',
      currentVersion: current?.version ?? null
    }, 409, cors);
  }

  return jsonResponse({
    state: sanitized,
    version: expectedVersion + 1,
    updatedAt: now
  }, 200, cors);
}

function generateApplicationId() {
  const digits = new Uint32Array(1);
  crypto.getRandomValues(digits);
  const suffix = String(100000 + (digits[0] % 900000));
  return `REC-${new Date().getUTCFullYear()}-${suffix}`;
}

async function handleSubmitApplication(request, env, cors) {
  const body = await readJsonBody(request);

  const ip = getClientIp(request);
  const nowSeconds = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    'DELETE FROM application_attempts WHERE attempted_at < ?'
  ).bind(nowSeconds - APPLICATION_WINDOW_SECONDS).run();

  const attemptRow = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM application_attempts WHERE ip = ? AND attempted_at >= ?'
  ).bind(ip, nowSeconds - APPLICATION_WINDOW_SECONDS).first();
  if (Number(attemptRow?.count || 0) >= MAX_APPLICATIONS_PER_WINDOW) {
    return jsonResponse(
      { error: 'Too many applications from this connection. Try again later.' },
      429,
      { ...cors, 'Retry-After': String(APPLICATION_WINDOW_SECONDS) }
    );
  }

  const application = normalizeApplication(body);
  const createdAt = new Date().toISOString();

  let id = null;
  for (let attempt = 0; attempt < 5 && !id; attempt += 1) {
    const candidate = generateApplicationId();
    try {
      await env.DB.prepare(
        'INSERT INTO applications (id, name, email, flavor, accepted_terms, submitted_to_lord, created_at) VALUES (?, ?, ?, ?, 1, 1, ?)'
      ).bind(candidate, application.name, application.email, application.flavor, createdAt).run();
      id = candidate;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }

  await env.DB.prepare(
    'INSERT INTO application_attempts (ip, attempted_at) VALUES (?, ?)'
  ).bind(ip, nowSeconds).run();

  return jsonResponse({ application: { id, createdAt } }, 201, cors);
}

async function handleListApplications(request, env, cors) {
  const session = await requireAuth(request, env);
  if (!session) {
    return jsonResponse({ error: 'Unauthorized.' }, 401, cors);
  }

  const { results } = await env.DB.prepare(
    'SELECT id, name, email, flavor, accepted_terms, submitted_to_lord, created_at FROM applications ORDER BY created_at DESC LIMIT ?'
  ).bind(MAX_ADMIN_APPLICATIONS).all();

  const applications = (results || []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    flavor: row.flavor,
    acceptedTerms: row.accepted_terms === 1,
    submittedToLord: row.submitted_to_lord === 1,
    createdAt: row.created_at
  }));

  return jsonResponse({ applications }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return jsonResponse({ ok: true }, 200, cors);
      }

      if (url.pathname === '/api/state' && request.method === 'GET') {
        return await handleGetState(env, cors);
      }

      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        return await handleLogin(request, env, cors);
      }

      if (url.pathname === '/api/auth/session' && request.method === 'GET') {
        return await handleSession(request, env, cors);
      }

      if (url.pathname === '/api/applications' && request.method === 'POST') {
        return await handleSubmitApplication(request, env, cors);
      }

      if (url.pathname === '/api/admin/applications' && request.method === 'GET') {
        return await handleListApplications(request, env, cors);
      }

      if (url.pathname === '/api/admin/state' && request.method === 'PUT') {
        return await handlePutState(request, env, cors);
      }

      return jsonResponse({ error: 'Not found.' }, 404, cors);
    } catch (error) {
      if (error instanceof ValidationError) {
        return jsonResponse({ error: error.message }, error.status || 400, cors);
      }
      console.error(error);
      return jsonResponse({ error: 'Internal server error.' }, 500, cors);
    }
  }
};
