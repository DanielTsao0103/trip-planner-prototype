import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReceiptFields } from "./receipt-fields.ts";

test("receipt fields use the merchant, category, and final paid amount", () => {
  assert.deepEqual(parseReceiptFields("SALES RECEIPT\nCedar Café\nEspresso\nSubtotal 20.00\nTotal 22.00\nTotal Paid USD 24.95"), {
    purpose: "Cedar Café", amount: "24.95", category: "Food", needsManualAmount: false,
  });
  assert.deepEqual(parseReceiptFields("Harbor Hotel\nBreakfast included\nGrand Total USD 1,200.00"), {
    purpose: "Harbor Hotel", amount: "1200.00", category: "Stay", needsManualAmount: false,
  });
  assert.equal(parseReceiptFields("City Museum\nAdmission").category, "Activities");
  assert.equal(parseReceiptFields("Uber\nTotal 9.99").category, "Transport");
});

test("unclear totals and totals in another currency need manual review", () => {
  assert.equal(parseReceiptFields("City Market\nTotal 9.00\nTotal 10.00").amount, "");
  assert.equal(parseReceiptFields("City Market\nCurrency CAD\nTotal 10.00").amount, "");
  assert.equal(parseReceiptFields("City Market\nSubtotal 10.00").amount, "");
  assert.deepEqual(parseReceiptFields("Receipt\nDate 11/13/2026\nTotal 10.00"), {
    purpose: "", amount: "10.00", category: undefined, needsManualAmount: false,
  });
});

test("receipt totals can appear under the label or contain OCR spacing", () => {
  assert.equal(parseReceiptFields("Cedar Cafe\nTotal Charged\n$ 24 . 95").amount, "24.95");
  assert.equal(parseReceiptFields("Cedar Cafe\nSubtotal\n24.95").amount, "");
  assert.equal(parseReceiptFields("Cedar Cafe\nTotal items 3\n24.95").amount, "");
  assert.equal(parseReceiptFields("Cedar Cafe\nCAD\nTotal\n24.95").needsManualAmount, true);
});
