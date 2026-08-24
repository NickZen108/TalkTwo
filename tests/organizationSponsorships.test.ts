import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260824043000_organization_sponsorships.sql', 'utf8');
const service = fs.readFileSync('src/services/organizationSponsorships.ts', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');

test('organization sponsorships store a one-way email match, not plaintext recipient email', () => {
  assert.match(migration, /recipient_email_hash text not null/i);
  assert.match(migration, /extensions\.digest\(normalized_email, 'sha256'\)/i);
  assert.match(migration, /extensions\.digest\(verified_email, 'sha256'\)/i);
  assert.doesNotMatch(migration, /recipient_email text/i);
  assert.doesNotMatch(migration, /activation_code/i);
  assert.doesNotMatch(migration, /relationship_id/i);
});

test('only service role can issue sponsorships and users cannot browse the table', () => {
  assert.match(migration, /alter table public\.organization_sponsorships enable row level security/i);
  assert.match(migration, /revoke all on table public\.organization_sponsorships from public, anon, authenticated/i);
  assert.match(migration, /revoke execute on function public\.create_organization_sponsorship[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.create_organization_sponsorship[\s\S]*to service_role/i);
});

test('claiming requires the signed-in verified email and stacks existing entitlements', () => {
  assert.match(migration, /uid uuid := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /u\.id = uid[\s\S]*u\.email_confirmed_at is not null/i);
  assert.match(migration, /greatest\([\s\S]*plan_row\.premium_ends_at[\s\S]*plan_row\.trial_ends_at/i);
  assert.match(migration, /make_interval\(months => sponsorship\.duration_months\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
});

test('the app claims sponsorships automatically without exposing a redemption-code UI', () => {
  assert.match(service, /supabase\.rpc\('claim_my_organization_sponsorships'\)/i);
  assert.match(app, /claimMyOrganizationSponsorships\(\)/i);
  assert.match(app, /waitingForSponsorships/i);
  assert.match(app, /sponsorshipReadyForUserId !== session\.user\.id/i);
  assert.doesNotMatch(app, /activation code/i);
  assert.doesNotMatch(app, /redeem organization/i);
});
