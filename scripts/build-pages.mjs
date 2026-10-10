import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { loadEnv } from 'vite';

// GitHub Pages serves main:/docs. Rebuild that folder before committing a release.
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...loadEnv('production', root, 'VITE_'), ...process.env };
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
  throw new Error('Configure the project URL and publishable key before building GitHub Pages.');
}
const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

// Private admin and management credentials must never enter the published bundle.
const privateValues = ['.env.server.local', '.env.supabase.local'].flatMap(name => {
  const path = resolve(root, name);
  if (!existsSync(path)) return [];
  return Object.entries(parseEnv(readFileSync(path, 'utf8')))
    .filter(([key, value]) => /SECRET_KEY|ACCESS_TOKEN/.test(key) && value)
    .map(([, value]) => value);
});
const dist = resolve(root, 'dist');
function checkFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) checkFiles(path);
    else if (privateValues.some(value => readFileSync(path).includes(Buffer.from(value)))) {
      throw new Error('Private credential found in build. Publishing stopped.');
    }
  }
}
checkFiles(dist);
const docs = resolve(root, 'docs');
// Replace generated assets; preserve the existing screenshot viewer and other Pages content.
rmSync(resolve(docs, 'assets'), { recursive: true, force: true });
cpSync(dist, docs, { recursive: true });
writeFileSync(resolve(docs, '.nojekyll'), '');
console.log('Updated docs/ for GitHub Pages. Commit and push it with the source changes.');
