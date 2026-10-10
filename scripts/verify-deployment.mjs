/** Fail visibly if Pages does not serve the exact source revision just deployed. */
const [site, expected] = process.argv.slice(2);
if (!site || !/^[a-f0-9]{40}$/.test(expected || '')) throw new Error('Usage: node scripts/verify-deployment.mjs URL COMMIT');
for (let attempt = 0; attempt < 18; attempt++) {
  try {
    const url = new URL('version.json', site.endsWith('/') ? site : `${site}/`);
    url.searchParams.set('verify', `${expected}-${Date.now()}`);
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const version = response.ok ? await response.json() : null;
    if (version?.commit === expected && typeof version.entryScript === 'string') {
      const indexUrl = new URL(site);
      indexUrl.searchParams.set('release', expected);
      const html = await fetch(indexUrl, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const scriptUrl = new URL(version.entryScript, site);
      if (scriptUrl.origin !== indexUrl.origin) throw new Error('Unexpected asset origin.');
      const script = await fetch(scriptUrl, { signal: AbortSignal.timeout(10000) });
      if (html.ok && script.ok && (await html.text()).includes(version.entryScript) && (await script.text()).includes(expected)) {
        console.log(`Verified live Pages HTML and application bundle for revision ${expected}`);
        process.exit(0);
      }
    }
  } catch { /* CDN propagation is retried; stale or unavailable releases still fail. */ }
  await new Promise(resolve => setTimeout(resolve, 10000));
}
throw new Error(`Pages did not serve expected revision ${expected}. Check the deployment before reporting it published.`);
