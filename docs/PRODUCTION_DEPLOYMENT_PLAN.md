# TalkTwo production deployment plan

This is the launch runbook for the currently unmerged TalkTwo stack. It is intentionally fail-closed: **do not deploy a later phase when an earlier gate is red**.

Snapshot note (2026-08-24): the connected production Supabase project was observed to have migrations only through `20260820092832_sync_global_extra_access_with_chat_approvals` and only `analyze-message` deployed. Re-check the live state immediately before any real deployment; this snapshot is not an instruction to skip migrations.

## Phase 0 — release prerequisites

Before changing production:

- all draft feature PRs intended for the release have been reviewed and the exact release commit is frozen;
- the QA mirror for that exact tree is green for app TypeScript, test TypeScript, tests, public-site build, layout/privacy checks, Expo Doctor, runtime dependency audit, Android export/prebuild/release APK/merged permissions, and iOS export/prebuild/surface checks;
- run `npm run release:preflight` with the final release environment and require `TalkTwo release preflight OK.`;
- Apple/Google product IDs and package IDs still match `src/domain/storeProducts.ts` and `com.talktwo.app`;
- required provider secrets are present in Supabase; no secret is stored in the mobile client or public-site bundle;
- the final HTTPS public site is live before `EXPO_PUBLIC_TALKTWO_SITE_URL` is enabled in a release build;
- a database backup/recovery point appropriate for the production plan exists.

## Phase 1 — database migrations

Apply repository migrations in filename order. Never cherry-pick only a later feature migration.

Critical ordering invariants:

1. `20260820110000_fix_account_wide_subscription_lifecycle.sql`
2. `20260820112904_store_notification_event_ingestion.sql`
3. `20260820121002_verified_store_restore.sql`
4. `20260820125229_recurring_premium_subscription_lifecycle.sql`
5. `20260820150217_account_deletion.sql`
6. `20260820151327_secure_key_recovery.sql`
7. `20260820152500_database_advisor_hardening.sql`
8. `20260820161000_personal_boundaries.sql`
9. `20260820173500_text_document_attachments.sql`
10. `20260820174500_private_push_notifications.sql`
11. `20260820181500_locale_preferences.sql`
12. `20260824040500_coach_opt_in_stats.sql`
13. `20260824043000_organization_sponsorships.sql`
14. `20260824061500_delivery_acknowledgements.sql`
15. `20260824084500_ai_budget_reservations.sql`

If additional migrations exist on the frozen release commit, they also run in lexical filename order.

### Mandatory database gates after migrations

- run `supabase/checks/account_deletion_schema.sql`; require `account_deletion_schema_ok`;
- run `supabase/checks/security_definer_schema.sql`; require `security_definer_schema_ok`;
- verify every public FK referencing `auth.users` is `CASCADE` or `SET NULL`, never `RESTRICT`/`NO ACTION` for a row that can exist when a user deletes their account;
- run Supabase security and performance advisors and resolve launch-blocking findings;
- verify RLS is enabled on user-facing tables and service-only tables/RPCs have no `anon`/`authenticated` direct privileges;
- verify AI budget reservation RPCs are executable by `service_role` only.

## Phase 2 — Edge Functions

Deploy from the same frozen release commit. JWT mode must match `supabase/config.toml`:

### TalkTwo-JWT protected

- `analyze-message`
- `analyze-document`
- `verify-store-purchase`
- `delete-account`

### Provider/custom-auth endpoints

- `apple-store-events` — no TalkTwo JWT; verify Apple signed payload cryptographically;
- `google-store-events` — no TalkTwo JWT; verify Google Pub/Sub identity/audience/email/package;
- `dispatch-push-notifications` — no TalkTwo JWT; require the dedicated dispatcher bearer secret.

Never turn JWT verification off for a user-facing function merely to make a test request pass.

## Phase 3 — server smoke tests

Use disposable test identities and sandbox/store-test transactions only.

- Free message send and receive.
- Premium message analysis and send-approval receipt.
- AI hard-limit reservation, commit/finalize and fail-closed behavior.
- Document analysis.
- Communication-window release and private push payload.
- Delivery acknowledgement without read/open leakage.
- Key recovery on a second device.
- Organization sponsorship claim using a disposable verified email.
- Store purchase verification/restore with a sandbox or licensed tester.
- Account deletion after a purchase/sponsorship: deletion succeeds, retained purchase history is pseudonymized, and another person's already-paid entitlement survives.

Do not use real user conversation content in smoke tests.

## Phase 4 — public site

Before the app exposes public links:

- fill every final reviewed `public-site` environment value and set `VITE_PUBLICATION_APPROVED=true` only after the intended legal/privacy review;
- from `public-site`, run `npm run release:preflight` and require `TalkTwo public-site release preflight OK.`;
- run the production `npm run build` from the same reviewed environment;
- verify the built bundle contains no service-role, OpenAI, store, signing or other private secret;
- deploy that exact built `public-site` over HTTPS;
- verify `/`, `/privacy/`, `/terms/`, `/support/` and `/delete-account/` all resolve correctly on the final domain;
- allowlist the exact final `/delete-account/` redirect in Supabase Auth and verify the production magic-link template preserves it;
- verify an unknown email neither creates an account nor discloses account existence;
- perform an end-to-end deletion with an intentionally disposable account and verify an expired/reused link cannot delete anything;
- only then set `EXPO_PUBLIC_TALKTWO_SITE_URL` for the release build.

## Phase 5 — native store build and test

- EAS production builds use `appVersionSource: remote` and `autoIncrement: true`;
- Android `compileSdkVersion` and `targetSdkVersion` remain at least 36;
- final app icon/splash/store artwork is approved and present;
- create signed store builds using the Apple/Google accounts;
- complete TestFlight and Play internal testing, including billing, restore, notifications, account deletion, dark mode, accessibility and fresh-install/new-device flows;
- submit only after store metadata, privacy answers and public URLs match the shipped binary and backend.

## Stop conditions

Stop the release immediately for any failed schema gate, failed mobile or public-site `release:preflight`, missing secret, mismatched store product ID, broken public URL, failed disposable-account deletion, unexpected permission, failed provider verification, red QA job, or migration drift that has not been reconciled.
