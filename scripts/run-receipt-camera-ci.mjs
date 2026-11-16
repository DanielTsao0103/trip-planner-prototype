/** Run production camera acceptance, then isolated development-only recovery checks. */
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";

const site = process.env.TRIP_QA_URL || "http://127.0.0.1:4213/trip-planner-prototype/";
const output = resolve(process.env.TRIP_QA_OUTPUT || "/tmp/receipt-camera-evidence");
const recoverySite = "http://127.0.0.1:4220/";
const checks = [];
let server;
const report = { productionSite: site, recoverySite, checks, developmentServerClosed: false };
mkdirSync(output, { recursive: true });

async function waitForSite(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await delay(500);
  }
  throw new Error(`Receipt test server did not become ready: ${url}`);
}

/** Child processes isolate script globals and fail the required CI gate on timeout/error. */
async function runScript(script, url, timeoutMs) {
  const started = Date.now();
  const result = { script, site: url, passed: false };
  checks.push(result);
  console.log(`Running ${script} against ${url}`);
  try {
    await new Promise((resolveRun, reject) => {
      const child = spawn(process.execPath, [resolve("scripts", script)], {
        stdio: "inherit",
        env: { ...process.env, TRIP_QA_URL: url, TRIP_QA_OUTPUT: output, TRIP_QA_LIVE_RECEIPTS: "0" },
      });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        if (code === 0 && !timedOut) resolveRun();
        else reject(new Error(`${script} ${timedOut ? "timed out" : `failed (exit ${code}, signal ${signal || "none"})`}.`));
      });
    });
    result.passed = true;
  } catch (error) {
    result.failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally { result.elapsedMs = Date.now() - started; }
}

try {
  await waitForSite(site);
  await runScript("test-receipt-camera.mjs", site, 180_000);
  // These scripts import /src modules in the browser. Keep their origin separate
  // from the built preview and their Vite cache separate from other local tasks.
  server = await createServer({
    base: "/",
    cacheDir: resolve(output, "vite-recovery-cache"),
    server: { host: "127.0.0.1", port: 4220, strictPort: true,
      fs: { allow: [process.cwd(), realpathSync(resolve("node_modules"))] },
    },
  });
  await server.listen();
  await waitForSite(recoverySite);
  await runScript("test-receipt-outbox.mjs", recoverySite, 90_000);
  await runScript("test-receipt-recovery.mjs", recoverySite, 150_000);
  await runScript("test-receipt-recovery-flow.mjs", recoverySite, 150_000);
} finally {
  try {
    if (server) { await server.close(); report.developmentServerClosed = true; }
  } finally {
    writeFileSync(resolve(output, "ci-runner-results.json"), JSON.stringify(report, null, 2));
  }
}
