import assert from "node:assert/strict";
import { test } from "node:test";
import { readReceiptWithVision, VisionServiceError } from "../supabase/functions/read-receipt/vision.ts";

const photo = new Blob(["fixture"], { type: "image/png" });
const model = "qwen/qwen3.8-27b";

test("Groq receives a receipt image and returns only a valid USD total", async () => {
  const invoke = (fields: object) => readReceiptWithVision(photo, "test-key", model, async (url, request) => {
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    const payload = JSON.parse(String(request?.body));
    assert.equal(payload.model, model);
    assert.equal(payload.messages[1].content[1].image_url.url, "data:image/png;base64,Zml4dHVyZQ==");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(fields) } }] });
  });
  assert.deepEqual(await invoke({ cents: 7452, currency: "USD", category: "Other", purpose: "Walmart" }), {
    purpose: "Walmart", category: "Other", amount: "74.52", needsManualAmount: false,
  });
  assert.equal((await invoke({ cents: 7452, currency: "CAD", category: "Food" })).amount, "");
  assert.equal((await invoke({ cents: null, currency: "USD", category: "Food" })).amount, "");
  await assert.rejects(invoke({ cents: 7452, currency: "USD", category: "Invalid" }));
});

test("Groq rate limits surface without making another provider call", async () => {
  let calls = 0;
  await assert.rejects(readReceiptWithVision(photo, "test-key", model, async () => {
    calls++;
    return new Response(null, { status: 429 });
  }), error => error instanceof VisionServiceError && error.status === 429);
  assert.equal(calls, 1);
});
