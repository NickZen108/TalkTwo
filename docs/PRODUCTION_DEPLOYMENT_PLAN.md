# TalkTwo production deployment plan

This is the launch runbook for the currently unmerged TalkTwo stack. It is intentionally fail-closed: **do not deploy a later phase when an earlier gate is red**.

Snapshot note (2026-08-24): the connected production Supabase project was observed to have migrations only through `20260820092832_sync_global_extra_access_with_chat_approvals` and only `analyze-message` deployed. Re-check the live state immediately before any real deployment; this snapshot is not an instruction to skip migrations.

## Phase 0 — release prerequisites

Before changing production:

- all draft feature PRs intended for the release have been reviewed and the exact release commit is frozen;
- the QA mirror for that exact tree is green for app TypeScript, test TypeScript, tests, public-site build, layout/privacy checks, Expo Doctor, runtime dependency audit, Android export/prebuild/release APK+AAB/merged permissions, and iOS export/prebuild/surface checks;
- run `npm run release:preflight` with the final release environment and require `TalkTwo release preflight OK.`;
- Apple/Google product IDs and package IDs still match `src/domain/storeProducts.ts` and `com.talktwo.app`;
- required provider secrets are present in Supabase; no secret is stored in the mobile client or public-site bundle;
- the final HTTPS public site is live before `EXPO_PUBLIC_TALKTWO_SITE_URL` is enabled in a release build;
- the final public host is verified as the native `/app/*` link owner for both iOS and Android before a signed production build is accepted;
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
16. `20260824110000_privacy_controls_and_notification_mutes.sql`
17. `20260824111000_cancel_muted_and_blocked_push_jobs.sql`
18. `20260824112000_delivery_and_open_state_privacy.sql`
19. `20260824113000_storage_boundary_enforcement.sql`

If additional migrations exist on the frozen release commit, they also run in lexical filename order.

### Mandatory database gates after migrations

- run `supabase/checks/account_deletion_schema.sql`; require `account_deletion_schema_ok`;
- run `supabase/checks/security_definer_schema.sql`; require `security_definer_schema_ok`;
- verify every public FK referencing `auth.users` is `CASCADE` or `SET NULL`, never `RESTRICT`/`NO ACTION` for a row that can exist when a user deletes their account;
- run Supabase security and performance advisors and resolve launch-blocking findings;
- verify RLS is enabled on user-facing tables and service-only tables/RPCs have no `anon`/`authenticated` direct privileges;
- verify AI budget reservation RPCs are executable by `service_role` only;
- verify authenticated participants cannot execute the partner timezone/window RPC;
- verify `notification_mutes` has no direct `anon`/`authenticated` table access;
- verify sender-visible message rows contain no recipient open/rejection state;
- verify emoji/emoticon storage is rejected regardless of plan/client;
- verify an expired timed block cannot bypass an active recipient Personal Boundary for either text messages or text-document attachments;
- insert a disposable approved text message and text-document message through the real send RPCs, then verify the newly persisted `public.messages.body` is immediately `NULL`, `plaintext_scrubbed_at` is populated, and ciphertext + verification hash remain available for the authorized open flow;
- before explicitly opening an incoming disposable message, verify `list_relationship_messages` returns `body`, `ciphertext` **and** `body_hash` as `NULL`; after `open_message`, verify ciphertext + hash are returned and decrypt to the already approved text on the recipient device;
- verify these storage-minimization checks with disposable content only; never inspect real user conversation plaintext as a release shortcut.

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
- Verify Unicode emoji and text emoticons are blocked for both Free and Premium paths.
- Verify an unsafe public display name is not exposed to other participants.
- Verify recipient timezone, local time and exact communication window cannot be fetched by another participant.
- Verify 1-hour, 4-hour, 24-hour and indefinite blocks remain private to the blocker.
- Verify an expired timed block resumes delivery without bypassing the recipient's active Personal Boundaries for text or text-document attachments.
- Verify global/chat/person notification mutes suppress alerts without stopping message routing.
- Verify queued alerts are cancelled immediately when the device, chat/person notification scope or sender is muted/blocked.
- AI hard-limit reservation, commit/finalize and fail-closed behavior.
- Document analysis.
- Communication-window release and private push payload.
- Delivery acknowledgement at app sync without read/open/rejection leakage.
- Verify editing/withdrawal cannot be used to probe recipient open state.
- Verify new message rows are ciphertext-only at rest immediately after trusted send-time checks; do not wait for recipient caching to satisfy this v1 invariant.
- Verify an unopened message exposes no deterministic body hash to the recipient before explicit open.
- Key recovery on a second device.
- Organization sponsorship claim using a disposable verified email.
- Store purchase verification/restore with a sandbox or licensed tester.
- Account deletion after a purchase/sponsorship: deletion succeeds, retained purchase history is pseudonymized, and another person's already-paid entitlement survives.

Do not use real user conversation content in smoke tests.

## Phase 4 — public site and verified app links

Before the app exposes production public links:

- fill every final reviewed `public-site` environment value and set `VITE_PUBLICATION_APPROVED=true` only after the intended legal/privacy review;
- from `public-site`, run `npm run release:preflight` and require `TalkTwo public-site release preflight OK.`;
- run the production `npm run build` from the same reviewed environment;
- verify the built bundle contains no service-role, OpenAI, store, signing or other private secret;
- deploy that exact built `public-site` over HTTPS;
- verify `/`, `/privacy/`, `/terms/`, `/support/` and `/delete-account/` all resolve correctly on the final domain;
- serve `/.well-known/apple-app-site-association` over HTTPS with no redirect that breaks platform verification; bind only the final Apple Team ID + `com.talktwo.app` and scope TalkTwo links to the intended `/app/*` routes;
- serve `/.well-known/assetlinks.json` over HTTPS using `com.talktwo.app` and the SHA-256 certificate fingerprint of the actual Android release signing key; never ship a guessed or debug fingerprint;
- verify the final `app.json` contains `applinks:<final-host>` and an Android `autoVerify` HTTPS intent filter for the same host with `pathPrefix: "/app/"`;
- allowlist the exact final `/app/auth` redirect in Supabase Auth and verify mobile magic-link sign-in uses PKCE (`code` exchange) rather than access/refresh credentials in the URL;
- verify invitation/member/recovery possession secrets and the Premium-gift claim token are kept in URL fragments, so browser fallback requests do not send those secrets to the public web server;
- verify the public `/app/*` fallback never logs, renders, forwards to analytics, or copies URL fragments into a network request;
- allowlist the exact final `/delete-account/` redirect in Supabase Auth and verify the production deletion magic-link template preserves it;
- verify an unknown email neither creates an account nor discloses account existence;
- perform an end-to-end deletion with an intentionally disposable account and verify an expired/reused link cannot delete anything;
- only then set `EXPO_PUBLIC_TALKTWO_SITE_URL` for the signed release build.

## Phase 5 — native store build and test

- EAS production builds use `appVersionSource: remote` and `autoIncrement: true`;
- Android `compileSdkVersion` and `targetSdkVersion` remain at least 36;
- final app icon/splash/store artwork is approved and present;
- create signed store builds using the Apple/Google accounts;
- on a signed iOS device, verify a valid final-domain `/app/auth`, `/app/invite`, `/app/member`, `/app/recover-key` and `/app/premium-gift` Universal Link opens TalkTwo; verify a look-alike domain does not;
- on a signed Android device, verify the same `/app/*` families open through the verified App Link without an app chooser after domain verification succeeds; verify look-alike domains and unverified routes do not gain equivalent trust;
- verify mobile magic-link auth completes by PKCE code exchange on both platforms and a legacy redirect containing `access_token`/`refresh_token` is rejected;
- verify the release binary's local SQLite database reports a non-empty `cipher_version`, otherwise stop; confirm Android app-data backup remains disabled in the merged release manifest/configuration;
- complete TestFlight and Play internal testing, including Android-to-iOS and iOS-to-Android chat delivery, billing, restore, notifications, account deletion, dark mode, accessibility and fresh-install/new-device flows;
- submit only after store metadata, privacy answers and public URLs match the shipped binary and backend.

## Stop conditions

Stop the release immediately for any failed schema gate, failed mobile or public-site `release:preflight`, missing secret, mismatched store product ID, broken public URL, failed verified-link ownership, PKCE regression, local SQLCipher failure, server plaintext-retention regression, unread-hash leak, failed disposable-account deletion, unexpected permission, failed provider verification, red QA job, privacy-invariant failure, or migration drift that has not been reconciled.
