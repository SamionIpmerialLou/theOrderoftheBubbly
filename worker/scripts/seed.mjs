import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(scriptDir, '..');
const statePath = path.join(workerRoot, 'seed/state.json');
const sqlPath = path.join(workerRoot, 'seed/seed.sql');
const mode = process.argv.includes('--remote') ? '--remote' : '--local';

if (!fs.existsSync(statePath)) {
  console.error('Missing seed/state.json. Run npm run build:seed first.');
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const payload = JSON.stringify(state).replace(/'/g, "''");
const updatedAt = new Date().toISOString().replace(/'/g, "''");
const sql = [
  'DELETE FROM site_state;',
  `INSERT INTO site_state (id, payload, version, updated_at) VALUES (1, '${payload}', 1, '${updatedAt}');`
].join('\n');

fs.writeFileSync(sqlPath, `${sql}\n`);

execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'order_of_bubly', mode, '--file=seed/seed.sql'],
  { cwd: workerRoot, stdio: 'inherit' }
);
