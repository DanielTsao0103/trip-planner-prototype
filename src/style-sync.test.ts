import { test } from "node:test";
import assert from "node:assert/strict";
import { rowToStyle, styleToRow, loadAccountStyle, saveAccountStyle } from "./style-sync.ts";
import { DEFAULT_STYLE } from "./theme.ts";

const choice = { theme: "purple", matchDevice: false, mode: "dark", heading: "playfair", corners: "round" };

test("a style choice round-trips through its database row", () => {
  assert.deepEqual(rowToStyle(styleToRow("user-1", choice)), choice);
});

test("unknown or missing stored values fall back to the default style", () => {
  assert.equal(rowToStyle(null), null);
  assert.deepEqual(
    rowToStyle({ theme: "neon", match_device: "yes" as unknown as boolean, mode: "blinding", heading: "comic", corners: "spiky" }),
    DEFAULT_STYLE,
  );
});

test("saving upserts one row keyed by the account, and loading reads it back", async () => {
  const calls: unknown[] = [];
  const saveClient = {
    from: (table: string) => ({
      upsert: async (row: unknown, options: unknown) => {
        calls.push({ table, row, options });
        return { error: null };
      },
    }),
  };
  await saveAccountStyle("user-1", choice, saveClient as never);
  assert.deepEqual(calls, [{ table: "user_style", row: styleToRow("user-1", choice), options: { onConflict: "user_id" } }]);

  const loadClient = {
    from: () => ({
      select: () => ({ eq: (_col: string, id: string) => ({ maybeSingle: async () => ({ data: styleToRow(id, choice), error: null }) }) }),
    }),
  };
  assert.deepEqual(await loadAccountStyle("user-1", loadClient as never), choice);
});

test("database errors are surfaced instead of hidden", async () => {
  const failing = { from: () => ({ upsert: async () => ({ error: new Error("denied") }) }) };
  await assert.rejects(saveAccountStyle("user-1", choice, failing as never), /denied/);
});
