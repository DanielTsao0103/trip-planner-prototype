import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { loadEnv } from 'vite';

// Publish a fresh artifact from source; GitHub Actions deploys dist/ directly.
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...loadEnv('production', root, 'VITE_'), ...process.env };
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
  throw new Error('Configure the project URL and publishable key before building GitHub Pages.');
}
const url = new URL(env.VITE_SUPABASE_URL);
if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
  throw new Error('Expected the HTTPS Supabase project URL.');
}
const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Missing valid build commit.');
const build = spawnSync('npm', ['run', 'build', '--', '--base=/trip-planner-prototype/'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, ...env, VITE_BUILD_SHA: commit },
});
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
    else {
      const content = readFileSync(path);
      if (privateValues.some(value => content.includes(Buffer.from(value))) ||
          /\b(?:sb_secret_|sbp_)[A-Za-z0-9_-]{20,}/.test(content.toString('utf8'))) {
        throw new Error('Private credential found in build. Publishing stopped.');
      }
    }
  }
}
checkFiles(dist);
const entryScript = readFileSync(resolve(dist, 'index.html'), 'utf8').match(/<script[^>]+src="([^"]+)"/)?.[1];
if (!entryScript) throw new Error('Built HTML is missing the application script.');
writeFileSync(resolve(dist, 'version.json'), JSON.stringify({ commit, entryScript, builtAt: new Date().toISOString() }) + '\n');
writeFileSync(resolve(dist, '.nojekyll'), '');
console.log(`Validated Pages artifact for ${commit}. GitHub Actions publishes dist/.`);
