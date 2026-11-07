/** Apply only the OTP and confirmation templates to the linked Trip Planner project. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const project = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!project || !token) throw new Error("Set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN.");
const endpoint = `https://api.supabase.com/v1/projects/${project}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const invite = readFileSync(new URL("../supabase/templates/trip-invitation.html", import.meta.url), "utf8");
// Only the invitation callback selects this design, even for a former invitee.
const setup = '{{ $prefix := print .SiteURL "?trip_invite=" }}{{ $redirect := or .RedirectTo "" }}{{ $invited := and (gt (len $redirect) (len $prefix)) (eq (slice $redirect 0 (len $prefix)) $prefix) }}';
const subjectSetup = '{{$p:=print .SiteURL "?trip_invite="}}{{$r:=or .RedirectTo ""}}{{if and (gt (len $r) (len $p)) (eq (slice $r 0 (len $p)) $p)}}';
const context = '{{ $trip := false }}{{ with .Data.trip_mail }}{{ $trip = index . (slice $redirect (len $prefix)) }}{{ end }}';
const changes = {};
for (const [kind, subject, action] of [
  ["magic_link", "Your Trip Planner sign-in link", "Sign in to Trip Planner"],
  ["confirmation", "Confirm your Trip Planner email address", "Confirm your email address"],
]) {
  changes[`mailer_subjects_${kind}`] = subjectSetup + "You're invited to join a trip{{else}}" + subject + "{{end}}";
  changes[`mailer_templates_${kind}_content`] = setup + "{{ if $invited }}" + context + invite
    + '{{ else }}<h2>' + action + '</h2><p><a href="{{ .ConfirmationURL }}">' + action + '</a></p>{{ end }}';
}
async function config(method, body) {
  const response = await fetch(endpoint, { method, headers, body });
  if (!response.ok) throw new Error(`Auth config ${method} failed (HTTP ${response.status}).`);
  return response.json();
}
await config("PATCH", JSON.stringify(changes));
const saved = await config("GET");
for (const [field, value] of Object.entries(changes)) assert.equal(saved[field] === value, true, field);
console.log("Verified the two email templates and their subjects on the linked project.");
