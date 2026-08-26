import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const plan = fs.readFileSync('docs/PRODUCTION_DEPLOYMENT_PLAN.md', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');

const criticalMigrations = [
  '20260820110000_fix_account_wide_subscription_lifecycle.sql',
  '20260820112904_store_notification_event_ingestion.sql',
  '20260820121002_verified_store_restore.sql',
  '20260820125229_recurring_premium_subscription_lifecycle.sql',
  '20260820150217_account_deletion.sql',
  '20260820151327_secure_key_recovery.sql',
  '20260820152500_database_advisor_hardening.sql',
  '20260820161000_personal_boundaries.sql',
  '20260820173500_text_document_attachments.sql',
  '20260820174500_private_push_notifications.sql',
  '20260820181500_locale_preferences.sql',
  '20260824040500_coach_opt_in_stats.sql',
  '20260824043000_organization_sponsorships.sql',
  '20260824061500_delivery_acknowledgements.sql',
  '20260824084500_ai_budget_reservations.sql',
  '20260824110000_privacy_controls_and_notification_mutes.sql',
  '20260824111000_cancel_muted_and_blocked_push_jobs.sql',
  '20260824112000_delivery_and_open_state_privacy.sql',
  '20260824113000_storage_boundary_enforcement.sql',
];

test('production plan names every current critical launch migration in order', () => {
  let previous = -1;
  for (const migration of criticalMigrations) {
    assert.ok(fs.existsSync(`supabase/migrations/${migration}`), `missing migration ${migration}`);
    const position = plan.indexOf(migration);
    assert.ok(position > previous, `${migration} must appear after the previous migration`);
    previous = position;
  }
});

test('deployment plan preserves JWT/custom-auth boundaries', () => {
  for (const name of ['analyze-message', 'analyze-document', 'verify-store-purchase', 'delete-account']) {
    assert.match(config, new RegExp(`\\[functions\\.${name}\\][\\s\\S]*?verify_jwt\\s*=\\s*true`, 'i'));
  }
  for (const name of ['apple-store-events', 'google-store-events', 'dispatch-push-notifications']) {
    assert.match(config, new RegExp(`\\[functions\\.${name}\\][\\s\\S]*?verify_jwt\\s*=\\s*false`, 'i'));
  }
  assert.match(plan, /Never turn JWT verification off for a user-facing function/i);
});

test('deployment plan requires deletion, privacy, public-site, native and exact-tree gates', () => {
  assert.match(plan, /account_deletion_schema_ok/i);
  assert.match(plan, /security_definer_schema_ok/i);
  assert.match(plan, /partner timezone\/window RPC/i);
  assert.match(plan, /notification_mutes/i);
  assert.match(plan, /emoji\/emoticon storage is rejected/i);
  assert.match(plan, /expired timed block cannot bypass an active recipient Personal Boundary/i);
  assert.match(plan, /editing\/withdrawal cannot be used to probe recipient open state/i);
  assert.match(plan, /Android-to-iOS and iOS-to-Android chat delivery/i);
  assert.match(plan, /npm run release:preflight/i);
  assert.match(plan, /TalkTwo release preflight OK\./i);
  assert.match(plan, /TalkTwo public-site release preflight OK\./i);
  assert.match(plan, /VITE_PUBLICATION_APPROVED=true/i);
  assert.match(plan, /allowlist the exact[^\n]*\/delete-account\/[^\n]*redirect/i);
  assert.match(plan, /unknown email neither creates an account nor discloses account existence/i);
  assert.match(plan, /exact tree is green/i);
  assert.match(plan, /final app icon\/splash\/store artwork is approved/i);
});

test('deployment plan verifies ciphertext-only storage and unread hash privacy', () => {
  assert.match(plan, /public\.messages\.body[^\n]*immediately `NULL`/i);
  assert.match(plan, /`body`, `ciphertext` \*\*and\*\* `body_hash` as `NULL`/i);
  assert.match(plan, /ciphertext-only at rest immediately after trusted send-time checks/i);
  assert.match(plan, /unopened message exposes no deterministic body hash/i);
  assert.match(plan, /never inspect real user conversation plaintext/i);
});

test('deployment plan requires PKCE and verified HTTPS app-link ownership', () => {
  assert.match(plan, /apple-app-site-association/i);
  assert.match(plan, /assetlinks\.json/i);
  assert.match(plan, /pathPrefix: "\/app\/"/i);
  assert.match(plan, /allowlist the exact final `\/app\/auth` redirect/i);
  assert.match(plan, /magic-link sign-in uses PKCE/i);
  assert.match(plan, /access_token.*refresh_token/i);
  assert.match(plan, /possession secrets.*URL fragments/i);
  assert.match(plan, /public `\/app\/\*` fallback never logs/i);
  assert.match(plan, /valid final-domain `\/app\/auth`/i);
  assert.match(plan, /look-alike domain/i);
});

test('deployment plan keeps local encryption a signed-release gate', () => {
  assert.match(plan, /local SQLite database reports a non-empty `cipher_version`/i);
  assert.match(plan, /Android app-data backup remains disabled/i);
  assert.match(plan, /local SQLCipher failure/i);
});
