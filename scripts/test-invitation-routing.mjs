/** Hosted invite-routing checks. Generates disposable proof links without sending email. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyInvitationRouting({ admin, owner, client, tripIds, accountIds, ownerAccount, target, outsider }) {
  const check = (response) => {
    if (response.error) throw Error(response.error.message);
    return response.data;
  };
  const makeTrip = async () => {
    const id = randomUUID();
    tripIds.push(id);
    check(await owner.rpc("save_trip_bundle", {
      p_trip_id: id, p_expected_revision: null, p_request_id: randomUUID(),
      p_data: { id, title: "Invitation routing QA", destinations: ["Taipei"], start: "2027-01-01",
        end: "2027-01-02", zone: "Asia/Taipei", image: "test", budget: null, budgetMode: "group",
        members: [{ id: ownerAccount.id, email: ownerAccount.email, name: "QA Owner", role: "Owner",
          status: "accepted", days: [] }], events: [], expenses: [], prefs: {}, individual: {}, todos: [], dismissed: [] },
    }));
    return id;
  };
  const share = (id, email, delivered = false) => owner.rpc("share_trip_recipient", {
    p_trip: id, p_email: email, p_delivered: delivered,
  });
  const makeProof = async (id, email, setup = false) => {
    const generated = check(await admin.auth.admin.generateLink({ type: "magiclink", email,
      options: { redirectTo: target + "?trip_invite=" + id, ...(setup ? { data: { trip_account_setup: true } } : {}) } }));
    if (!accountIds.includes(generated.user.id)) accountIds.push(generated.user.id);
    const metadata = check(await admin.auth.admin.getUserById(generated.user.id)).user.user_metadata.trip_mail[id];
    assert.ok(metadata.invitation, "Email context must identify this delivery");
    assert.equal(metadata.setup, true);
    return { proof: client(), token: generated.properties.hashed_token,
      invitation: metadata.invitation, accountId: generated.user.id };
  };
  const open = (receipt, id, ticket) => receipt.proof.rpc("open_trip_token", {
    p_trip: id, p_token: receipt.token, p_invitation: receipt.invitation, ...(ticket ? { p_ticket: ticket } : {}),
  });

  for (const named of [true, false]) {
    const email = `invite-routing-${randomUUID()}@example.com`, password = randomUUID();
    const created = check(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: named ? { name: "Existing QA Traveler" } : {} }));
    accountIds.push(created.user.id);
    const registered = client();
    check(await registered.auth.signInWithPassword({ email, password }));
    const id = await makeTrip();
    assert.equal(check(await share(id, email)), "needs_email", "Existing accounts still require an invitation email");
    const visible = check(await registered.rpc("read_invited_trip", { p_trip: id }));
    assert.equal(visible.content.members.find(m => m.accountId === created.user.id).status, "accepted");
    assert.ok((await client().rpc("open_trip_notice", { p_trip: id })).error,
      "A signed-out caller cannot inspect a notification destination");
    assert.ok((await registered.rpc("open_trip_invite", { p_trip: id })).error, "A password session cannot inspect an OTP claim");
    const account = check(await admin.auth.admin.getUserById(created.user.id)).user;
    assert.equal(account.user_metadata.trip_mail[id].setup, false);
    const delivery = account.user_metadata.trip_mail[id].invitation;
    assert.ok(delivery);
    assert.equal(account.user_metadata.trip_mail[id].login_url, target + "?trip_notice=" + id + "&invitation=" + delivery,
      "Existing-account email contains a delivery-specific ordinary login URL");
    assert.equal(check(await share(id, email, true)), "sent");
    assert.equal(check(await share(id, email)), "sent", "An immediate duplicate does not resend mail");
    assert.ok((await outsider.rpc("open_trip_notice", { p_trip: id, p_invitation: delivery })).error,
      "A different signed-in account cannot open the notice destination");
    assert.ok((await registered.rpc("open_trip_notice", { p_trip: randomUUID(), p_invitation: delivery })).error,
      "A forged trip ID grants no membership");
    assert.ok((await registered.rpc("open_trip_notice", { p_trip: id })).error, "Bare old notices require a fresh email");
    assert.ok((await registered.rpc("open_trip_notice", { p_trip: id, p_invitation: randomUUID() })).error, "A forged delivery cannot open even an accepted member’s email link");
    assert.deepEqual(check(await registered.rpc("open_trip_notice", { p_trip: id, p_invitation: delivery })), { trip: id });
    assert.equal(check(await registered.rpc("read_invited_trip", { p_trip: id })).tripID, id);
  }

  // Simulate an auto-confirmed signup for an invited email without proving inbox access.
  const unprovenTrip = await makeTrip();
  const unprovenEmail = `invite-unproven-${randomUUID()}@example.com`, unprovenPassword = randomUUID();
  assert.equal(check(await share(unprovenTrip, unprovenEmail)), "needs_email");
  const unprovenUser = check(await admin.auth.admin.createUser({ email: unprovenEmail,
    password: unprovenPassword, email_confirm: true, user_metadata: { name: "Unproven QA account" } }));
  accountIds.push(unprovenUser.user.id);
  const unproven = client();
  check(await unproven.auth.signInWithPassword({ email: unprovenEmail, password: unprovenPassword }));
  const unprovenDelivery = check(await admin.auth.admin.getUserById(unprovenUser.user.id)).user.user_metadata.trip_mail[unprovenTrip].invitation;
  assert.ok(unprovenDelivery);
  assert.equal((await unproven.rpc("open_trip_notice", { p_trip: unprovenTrip, p_invitation: unprovenDelivery })).error?.code, "42501",
    "Merely signing up for an invited email cannot capture its pending membership");
  assert.ok((await unproven.rpc("read_invited_trip", { p_trip: unprovenTrip })).error);

  const first = await makeTrip(), second = await makeTrip();
  const email = `invite-reserved-${randomUUID()}@example.com`;
  assert.equal(check(await share(first, email)), "needs_email");
  const reserved = await makeProof(first, email, true);
  check(await share(first, email, true));
  const firstClaim = check(await open(reserved, first));
  assert.equal(firstClaim.tokenInvite, true);
  assert.equal(firstClaim.setupAccountId, reserved.accountId);
  assert.ok((await reserved.proof.rpc("open_trip_token", { p_trip: first, p_token: "forged", p_invitation: reserved.invitation })).error);
  assert.ok((await reserved.proof.rpc("open_trip_token", { p_trip: first, p_token: reserved.token, p_invitation: randomUUID() })).error);
  assert.ok((await reserved.proof.rpc("open_trip_token", { p_trip: second, p_token: reserved.token, p_invitation: reserved.invitation })).error);
  assert.equal(firstClaim.canSetup, true);
  assert.equal(firstClaim.accountId ?? null, null);
  assert.equal(check(await share(second, email)), "needs_email");
  const secondProof = await makeProof(second, email, true);
  check(await share(second, email, true));
  assert.equal(check(await open(secondProof, second)).canSetup, true,
    "An OTP-reserved identity still needs signup when invited to a second trip");
  const setup = client(), setupPassword = randomUUID();
  const signed = check(await setup.auth.signUp({ email, password: setupPassword, options: { data: { name: "Completed QA Traveler" } } }));
  assert.equal(signed.user.id, reserved.accountId);
  const current = check(await setup.auth.getUser()).user;
  assert.equal(current.id, reserved.accountId);
  assert.equal(current.app_metadata.trip_planner_needs_setup, true);
  check(await setup.auth.updateUser({ password: setupPassword, data: { name: "Completed QA Traveler" } }));
  const staleClaim = check(await open(reserved, first, firstClaim.ticket));
  assert.equal(staleClaim.canSetup, false, "An old setup link cannot offer password setup after signup finished");
  assert.equal(staleClaim.ticket, firstClaim.ticket);
  console.log("Verified existing-account email requests, delivery-specific authenticated notices, scoped email receipts, guarded setup, ticket refresh, and forgery rejection.");
}
