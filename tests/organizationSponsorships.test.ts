import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260824043000_organization_sponsorships.sql', 'utf8');
const service = fs.readFileSync('src/services/organizationSponsorships.ts', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');

test('organization sponsorships use a one-way pending email match, not plaintext recipient email', () => {
  assert.match(migration, /recipient_email_hash text check/i);
  assert.match(migration, /extensions\.digest\(normalized_email, 'sha256'\)/i);
  assert.match(migration, /extensions\.digest\(verified_email, 'sha256'\)/i);
  assert.doesNotMatch(migration, /recipient_email text/i);
  assert.doesNotMatch(migration, /activation_code/i);
  assert.doesNotMatch(migration, /relationship_id/i);
});

test('recipient match hashes exist only while a sponsorship is pending', () => {
  assert.match(migration, /status = 'pending' and recipient_email_hash is not null/i);
  assert.match(migration, /status <> 'pending' and recipient_email_hash is null/i);
  assert.match(migration, /set status = 'claimed',[\s\S]*recipient_email_hash = null/i);
  assert.match(migration, /set status = 'expired',[\s\S]*recipient_email_hash = null/i);
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

test('claimed user linkage is removed automatically when the auth account is deleted', () => {
  assert.match(migration, /claimed_by uuid references auth\.users\(id\) on delete set null/i);
});

test('the app claims sponsorships automatically without exposing a redemption-code UI', () => {
  assert.match(service, /supabase\.rpc\('claim_my_organization_sponsorships'\)/i);
  assert.match(app, /claimMyOrganizationSponsorships\(\)/i);
  assert.match(app, /waitingForSponsorships/i);
  assert.match(app, /sponsorshipReadyForUserId !== session\.user\.id/i);
  assert.doesNotMatch(app, /activation code/i);
  assert.doesNotMatch(app, /redeem organization/i);
});
