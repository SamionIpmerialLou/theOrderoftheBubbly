export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

function asString(value, maxLength, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength);
}

function asInt(value, min, max, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function asBool(value) {
  return value === true;
}

function slugify(value) {
  return String(value || 'record')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'record';
}

function uniqueId(base, used) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeMember(member, index, usedIds) {
  if (!member || typeof member !== 'object') {
    throw new ValidationError(`Member ${index + 1} is invalid.`);
  }

  const name = asString(member.name, 80);
  if (!name) throw new ValidationError(`Member ${index + 1} must have a name.`);

  const requestedId = asString(member.id, 80) || slugify(name);
  const id = uniqueId(requestedId, usedIds);
  const status = asString(member.status, 40, 'Active');
  const category = asString(member.category, 20, 'active').toLowerCase() === 'banished'
    ? 'banished'
    : 'active';

  return {
    id,
    name,
    role: asString(member.role, 120, 'Knight of the Order'),
    weekly: asInt(member.weekly, 0, 1000000000, 0),
    bp: asInt(member.bp, 0, 1000000000000, 0),
    tabs: asInt(member.tabs, 0, 1000000, 0),
    status,
    category,
    banishCount: asInt(member.banishCount, 0, 100, 0),
    sanction: asString(member.sanction, 160),
    dossier: asString(member.dossier, 80, 'pos-knight')
  };
}

function normalizeDecree(decree, index, usedIds) {
  if (!decree || typeof decree !== 'object') {
    throw new ValidationError(`Decree ${index + 1} is invalid.`);
  }

  const title = asString(decree.title, 200);
  if (!title) throw new ValidationError(`Decree ${index + 1} must have a title.`);

  const number = asInt(decree.number, 0, 1000000000, index + 1);
  const requestedId = asString(decree.id, 100) || `decree-${number}-${index + 1}`;
  const id = uniqueId(requestedId, usedIds);
  const contentHtml = typeof decree.contentHtml === 'string' ? decree.contentHtml.slice(0, 50000) : '';

  return {
    id,
    number,
    category: asString(decree.category, 80, 'Edict'),
    isPinned: asBool(decree.isPinned),
    title,
    date: asString(decree.date, 80),
    contentHtml,
    author: asString(decree.author, 120, 'Lord Bubly')
  };
}

export function normalizeState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('State payload must be an object.');
  }

  const settingsSource = input.settings && typeof input.settings === 'object' ? input.settings : {};
  const membersSource = Array.isArray(input.members) ? input.members : null;
  const decreesSource = Array.isArray(input.decrees) ? input.decrees : null;

  if (!membersSource) throw new ValidationError('State members must be an array.');
  if (!decreesSource) throw new ValidationError('State decrees must be an array.');
  if (membersSource.length === 0) throw new ValidationError('State must contain at least one member.');
  if (membersSource.length > 200) throw new ValidationError('Too many members.');
  if (decreesSource.length > 500) throw new ValidationError('Too many decrees.');

  const memberIds = new Set();
  const decreeIds = new Set();

  return {
    schemaVersion: asInt(input.schemaVersion, 1, 100, 1),
    settings: {
      weeklyQuota: asInt(settingsSource.weeklyQuota, 1, 100000, 75),
      rexPoolBp: asInt(settingsSource.rexPoolBp, 0, 1000000000000, 0)
    },
    members: membersSource.map((member, index) => normalizeMember(member, index, memberIds)),
    decrees: decreesSource.map((decree, index) => normalizeDecree(decree, index, decreeIds))
  };
}

export const APPLICATION_FLAVORS = [
  'Lime',
  'Grapefruit',
  'Blackberry',
  'Cherry',
  'Mango',
  'Strawberry',
  'Raspberry',
  'Peach',
  'Passionfruit'
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeApplication(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Application must be an object.');
  }

  const name = asString(input.name, 80);
  if (!name) throw new ValidationError('A name or alias is required.');

  const email = asString(input.email, 120);
  if (email && !EMAIL_PATTERN.test(email)) {
    throw new ValidationError('Contact email is not a valid address.');
  }

  const flavor = asString(input.flavor, 40);
  if (!APPLICATION_FLAVORS.includes(flavor)) {
    throw new ValidationError('Choose a valid signature essence.');
  }

  if (input.acceptedTerms !== true) {
    throw new ValidationError('You must accept the terms and conditions.');
  }
  if (input.submittedToLord !== true) {
    throw new ValidationError('You must submit to Lord Bubly.');
  }

  return {
    name,
    email: email || null,
    flavor,
    acceptedTerms: true,
    submittedToLord: true
  };
}
