import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '../..');
const indexPath = path.join(projectRoot, 'index.html');
const outputPath = path.join(projectRoot, 'worker/seed/state.json');

function extractArray(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Could not find ${marker}`);
  const openIndex = source.indexOf('[', markerIndex);
  if (openIndex === -1) throw new Error(`Could not find array for ${marker}`);

  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(openIndex, i + 1);
        return new Function(`return ${literal}`)();
      }
    }
  }

  throw new Error(`Unclosed array for ${marker}`);
}

function slugify(value) {
  return String(value || 'member')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'member';
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function plainTextToHtml(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const html = fs.readFileSync(indexPath, 'utf8');
const activeMembers = extractArray(html, 'const DEFAULT_SHEET_MEMBERS =');
const canonicalDecrees = extractArray(html, 'const canonicalDecrees =');

const active = activeMembers.map((member, index) => ({
  id: slugify(member.name) || `member-${index + 1}`,
  name: String(member.name || 'Unnamed Knight').trim(),
  role: String(member.role || 'Knight of the Order').trim(),
  weekly: Math.max(0, parseInt(member.weekly, 10) || 0),
  bp: Math.max(0, parseInt(member.bp, 10) || 0),
  tabs: Math.max(0, parseInt(member.tabs, 10) || 0),
  status: String(member.status || 'Active').trim(),
  category: 'active',
  banishCount: 0,
  sanction: String(member.status || '').toLowerCase() === 'excused' ? 'Excused (Deceased)' : '',
  dossier: String(member.dossier || 'pos-knight').trim()
}));

const banished = [
  {
    id: 'simon',
    name: 'Simon',
    role: 'Banished Knight',
    weekly: 0,
    bp: 2000,
    tabs: 0,
    status: 'Bubbly Traitor',
    category: 'banished',
    banishCount: 0,
    sanction: 'Bubbly Traitor',
    dossier: 'pos-traitor'
  },
  {
    id: 'cal',
    name: 'Cal',
    role: 'Banished Knight',
    weekly: 0,
    bp: 1720,
    tabs: 0,
    status: 'Banished (1 Strike)',
    category: 'banished',
    banishCount: 1,
    sanction: 'Banished (1 Strike)',
    dossier: 'rank-imprisoned'
  },
  {
    id: 'boaz',
    name: 'Boaz',
    role: 'Banished Knight',
    weekly: 0,
    bp: 1760,
    tabs: 0,
    status: 'Bubbly Outlaw',
    category: 'banished',
    banishCount: 0,
    sanction: 'Bubbly Outlaw',
    dossier: 'pos-outlaw'
  },
  {
    id: 'father',
    name: 'Father',
    role: 'Banished Knight',
    weekly: 0,
    bp: 10,
    tabs: 0,
    status: 'Banished (2 Strikes)',
    category: 'banished',
    banishCount: 2,
    sanction: 'Banished (2 Strikes)',
    dossier: 'rank-imprisoned'
  }
];

const decrees = canonicalDecrees.map((decree) => ({
  id: String(decree.id || `decree-${decree.number || Date.now()}`),
  number: Math.max(0, parseInt(decree.number, 10) || 0),
  category: String(decree.category || 'Edict').trim(),
  isPinned: Boolean(decree.isPinned),
  title: String(decree.title || 'Untitled Decree').trim(),
  date: String(decree.date || '').trim(),
  contentHtml: plainTextToHtml(decree.content),
  author: String(decree.author || 'Lord Bubly').trim()
}));

const state = {
  schemaVersion: 1,
  settings: {
    weeklyQuota: 75,
    rexPoolBp: 5590
  },
  members: [...active, ...banished],
  decrees
};

fs.writeFileSync(outputPath, `${JSON.stringify(state, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
console.log(`Members: ${state.members.length} (${active.length} active, ${banished.length} banished)`);
console.log(`Decrees: ${state.decrees.length}`);
