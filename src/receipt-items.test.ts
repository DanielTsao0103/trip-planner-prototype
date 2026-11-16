import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeReceiptDocument, parseReceiptDocument, receiptCents, reconcileReceipt } from "./receipt-items.ts";

test("receipt line totals retain quantity without multiplying twice", () => {
  const result = parseReceiptDocument("Cedar Cafe\nUSD\n2 x Latte   9.00\nSandwich 12.00\nSubtotal 21.00\nTax 1.68\nTip 3.00\nTotal 25.68\nVisa 25.68");
  assert.deepEqual(result.items, [{ description: "Latte", quantity: 2, amountCents: 900 }, { description: "Sandwich", quantity: null, amountCents: 1200 }]);
  assert.equal(result.amount, "25.68");
  assert.equal(result.reconciliation.matches, true);
  assert.equal(result.reconciliation.itemTotalCents, 2100);
});

test("discounts, subtotal, tax, tip, tender and change are not purchased items", () => {
  const result = parseReceiptDocument("Travel Market\nUSD\nApples 4.00\nBread 6.00\nCoupon -1.00\nSubtotal 9.00\nSales Tax 0.72\nGrand Total 9.72\nCash 20.00\nChange 10.28\nSuggested tip 20% 1.94");
  assert.equal(result.items.length, 2);
  assert.equal(result.discountCents, 100);
  assert.equal(result.taxCents, 72);
  assert.equal(result.tipCents, null);
  assert.equal(result.totalCents, 972);
  assert.equal(result.reconciliation.matches, true);
});

test("unreadable or contradictory totals stay unconfirmed and mismatches remain visible", () => {
  const conflict = parseReceiptDocument("Cafe\nUSD\nTea 3.00\nTotal 3.00\nTotal 30.00");
  assert.equal(conflict.amount, "");
  assert.equal(conflict.totalCents, null);
  assert.equal(conflict.needsManualAmount, true);
  const missing = parseReceiptDocument("Cafe\nUSD\nTea 3.00\nSubtotal 8.00\nTax 0.64\nTotal 8.64");
  assert.equal(missing.reconciliation.matches, false);
  assert.ok(missing.warnings.some(value => value.includes("do not agree")));
  const noTotal = parseReceiptDocument("Cafe\nUSD\nTea 3.00");
  assert.equal(noTotal.totalCents, null);
  assert.equal(noTotal.amount, "");
});

test("USD must be confirmed instead of assuming all dollar receipts use USD", () => {
  const unknown = parseReceiptDocument("Cafe\nTea $3.00\nTotal $3.00");
  assert.equal(unknown.currency, null);
  assert.equal(unknown.totalCents, 300);
  assert.equal(unknown.amount, "");
  const cad = parseReceiptDocument("Cafe\nCAD\nTea 3.00\nTotal 3.00");
  assert.equal(cad.currency, "CAD");
  assert.equal(cad.totalCents, 300);
  assert.equal(cad.amount, "");
  const euro = parseReceiptDocument("Cafe\nTea 3.00\nTotal €3.00");
  assert.equal(euro.currency, "EUR");
  assert.equal(euro.totalCents, 300);
  assert.equal(euro.amount, "");
});

test("separate total value lines and OCR decimal spacing remain readable", () => {
  const result = parseReceiptDocument("Cafe\nUSD\nLatte 4 . 50\nSubtotal\n4.50\nTax\n0.36\nTOTAL\n4.86");
  assert.equal(result.items[0].amountCents, 450);
  assert.equal(result.amount, "4.86");
  assert.equal(result.reconciliation.matches, true);
  assert.equal(receiptCents("USD 1,234.56"), 123456);
  assert.equal(receiptCents("12.345"), null);
  assert.equal(receiptCents("999999999.00"), null);
});

test("normalizer bounds untrusted values and excludes raw transcription", () => {
  const result = normalizeReceiptDocument({ purpose: "x".repeat(200), category: "fake", currency: "USD", totalCents: 100,
    rawText: "credit card information", items: [{ description: "Tea", quantity: 2, amountCents: 100 }, { description: "bad", amountCents: -5 }, { description: "huge", amountCents: 999999999 }, { description: "fraction", amountCents: 1.5 }],
    subtotalCents: 100, confidence: 999, warnings: ["\u200bTest", 1] });
  assert.equal(result.purpose.length, 130);
  assert.equal(result.category, undefined);
  assert.equal(result.items.length, 1);
  assert.equal(result.confidence, 100);
  assert.equal(Object.hasOwn(result, "rawText"), false);
  assert.equal(result.warnings[0], "Test");
  assert.equal(normalizeReceiptDocument({currency:"USD",totalCents:0}).amount, "");
  assert.equal(normalizeReceiptDocument({items: Array(120).fill({description:"Item",amountCents:100})}).items.length,100);
});

test("reconciliation checks both printed subtotal and final total with integer cents", () => {
  const items = [{description:"Item",quantity:3,amountCents:99}];
  assert.deepEqual(reconcileReceipt(items,99,8,null,null,107),{itemTotalCents:99,expectedTotalCents:107,differenceCents:0,matches:true});
  assert.equal(reconcileReceipt(items,100,8,null,null,108).matches,false);
  assert.equal(reconcileReceipt([],null,null,null,null,100).matches,null);
});


test("wrapped item prices and tax breakdowns do not duplicate printed aggregates", () => {
  const result = parseReceiptDocument("Cafe\nUSD\n2 x Latte\n9.00\nSubtotal 9.00\nState Tax 0.36\nCity Tax 0.36\nTax 0.72\nTotal 9.72");
  assert.deepEqual(result.items, [{description:"Latte", quantity:2, amountCents:900}]);
  assert.equal(result.taxCents,72);
  assert.equal(result.reconciliation.matches,true);
});


test("review corrections remove obsolete generated warnings", () => {
  const unknown = parseReceiptDocument("Cafe\nLatte 4.00\nTotal 4.00");
  assert.ok(unknown.warnings.some(value=>value.includes("currency")));
  const reviewed = normalizeReceiptDocument({...unknown,currency:"USD",needsManualAmount:false});
  assert.equal(reviewed.amount,"4.00");
  assert.equal(reviewed.warnings.some(value=>value.includes("currency")),false);
  assert.equal(normalizeReceiptDocument({currency:"USD",subtotalCents:100,totalCents:100,items:[]}).reconciliation.matches,null);
});
