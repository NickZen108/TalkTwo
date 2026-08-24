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

test('deployment plan requires deletion, public-site and exact-tree QA gates', () => {
  assert.match(plan, /account_deletion_schema_ok/i);
  assert.match(plan, /exact \/delete-account\/ redirect/i);
  assert.match(plan, /unknown emails are not auto-created/i);
  assert.match(plan, /exact tree is green/i);
  assert.match(plan, /final app icon\/splash\/store artwork is approved/i);
});
