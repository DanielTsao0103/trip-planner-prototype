/** Wait for the preview, then run the same camera acceptance used locally. */
import { setTimeout as delay } from "node:timers/promises";
const site = process.env.TRIP_QA_URL || "http://127.0.0.1:4213/trip-planner-prototype/";
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try { if ((await fetch(site, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
  await delay(1000);
}
if (!ready) throw new Error("Receipt test preview did not start.");
await import("./test-receipt-camera.mjs");
