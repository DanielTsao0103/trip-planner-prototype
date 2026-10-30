import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlToText, parseBooking, senderEmail } from "./parse.ts";

const NOW = new Date("2026-10-29T12:00:00Z");

test("hotel email with labelled dates, address and confirmation code", () => {
  const text = [
    "Hi Ivy,",
    "",
    "---------- Forwarded message ---------",
    "From: Marriott <res@marriott.com>",
    "Date: Mon, Oct 12, 2026 at 3:02 PM",
    "Subject: Your reservation is confirmed",
    "To: ivy@example.com",
    "",
    "Hotel: Seattle Waterfront Hotel",
    "Check-in: December 20, 2026",
    "Check-out: December 24, 2026",
    "Address: 2411 Alaskan Way, Seattle, WA",
    "Confirmation number: 84KD72QX",
  ].join("\n");
  const r = parseBooking({ subject: "Fwd: Your reservation is confirmed", text, html: null }, NOW);
  assert.equal(r.kind, "lodging");
  assert.equal(r.title, "Your reservation is confirmed");
  assert.equal(r.startDate, "2026-12-20");
  assert.equal(r.endDate, "2026-12-24");
  assert.equal(r.location, "2411 Alaskan Way, Seattle, WA");
  assert.equal(r.confirmationCode, "84KD72QX");
  assert.equal(r.originalSender, "Marriott <res@marriott.com>");
  assert.equal(r.source, "text");
});

test("the forwarded header date is not used as a booking date", () => {
  const text = [
    "---------- Forwarded message ---------",
    "From: Air <no-reply@air.com>",
    "Date: Mon, Oct 12, 2026 at 3:02 PM",
    "Subject: Flight confirmation",
    "",
    "Your flight departs January 5, 2027.",
  ].join("\n");
  const r = parseBooking({ subject: "Fwd: Flight confirmation", text, html: null }, NOW);
  assert.equal(r.startDate, "2027-01-05");
  assert.equal(r.endDate, null);
  assert.equal(r.kind, "flight");
});

test("dates without a year or impossible dates are ignored", () => {
  const r = parseBooking(
    { subject: "Trip", text: "Check-in: Dec 20\nCheck-out: February 31, 2027", html: null },
    NOW,
  );
  assert.equal(r.startDate, null);
  assert.equal(r.endDate, null);
});

test("years far outside the window are ignored", () => {
  const r = parseBooking({ subject: "Old", text: "Check-in: May 1, 2009", html: null }, NOW);
  assert.equal(r.startDate, null);
});

test("structured reservation data wins over text", () => {
  const html = `<html><body><script type="application/ld+json">${JSON.stringify({
    "@context": "http://schema.org",
    "@type": "LodgingReservation",
    reservationNumber: "ZX81PL",
    checkinTime: "2026-12-20T15:00:00-08:00",
    checkoutTime: "2026-12-24T11:00:00-08:00",
    reservationFor: {
      "@type": "LodgingBusiness",
      name: "Seattle Waterfront Hotel",
      address: { streetAddress: "2411 Alaskan Way", addressLocality: "Seattle", addressRegion: "WA" },
    },
  })}</script><p>Thanks</p></body></html>`;
  const r = parseBooking({ subject: "Fwd: Confirmed", text: null, html }, NOW);
  assert.equal(r.source, "structured");
  assert.equal(r.kind, "lodging");
  assert.equal(r.title, "Seattle Waterfront Hotel");
  assert.equal(r.confirmationCode, "ZX81PL");
  assert.equal(r.startDate, "2026-12-20");
  assert.equal(r.endDate, "2026-12-24");
  assert.equal(r.location, "2411 Alaskan Way, Seattle, WA");
});

test("broken structured data falls back to the subject", () => {
  const html = `<script type="application/ld+json">{not json</script><p>Hello</p>`;
  const r = parseBooking({ subject: "Fwd: Fwd: Dinner reservation", text: null, html }, NOW);
  assert.equal(r.title, "Dinner reservation");
  assert.equal(r.source, "subject");
});

test("empty subject gets a default title", () => {
  const r = parseBooking({ subject: "  ", text: "", html: null }, NOW);
  assert.equal(r.title, "Forwarded booking");
  assert.equal(r.kind, "other");
});

test("an end date before the start date is dropped or swapped, never saved reversed", () => {
  const r = parseBooking(
    { subject: "Rental", text: "Pick-up: March 10, 2027\nDrop-off: March 3, 2027", html: null },
    NOW,
  );
  assert.ok(!r.startDate || !r.endDate || r.endDate >= r.startDate);
});

test("confirmation code ignores plain words", () => {
  const r = parseBooking({ subject: "x", text: "Confirmation details below\nBooking reference: ABC123", html: null }, NOW);
  assert.equal(r.confirmationCode, "ABC123");
});

test("htmlToText strips tags and scripts", () => {
  assert.equal(htmlToText("<style>a{}</style><p>Hi &amp; bye</p><script>x()</script>"), "Hi & bye");
});

test("senderEmail extracts and lowercases the address", () => {
  assert.equal(senderEmail('"Ivy S" <Ivy@Example.com>'), "ivy@example.com");
  assert.equal(senderEmail("ivy@example.com"), "ivy@example.com");
  assert.equal(senderEmail("not an address"), null);
});
