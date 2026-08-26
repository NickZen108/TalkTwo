# TalkTwo production deployment plan

This is the launch runbook for the currently unmerged TalkTwo stack. It is intentionally fail-closed: **do not deploy a later phase when an earlier gate is red**.

Snapshot note (2026-08-24): the connected production Supabase project was observed to be materially behind this branch. Re-check the live state immediately before any real deployment; this snapshot is not permission to skip migrations. No production migration is authorized merely because it is listed here.

## Phase 0 — release prerequisites

Before changing production:

- finish the systematic account-independent audit and freeze one exact release commit;
- move `qa/full-stack-20260824` to that exact commit and require a normal full QA run to complete green;
- run `npm run release:preflight` with the final release environment and require `TalkTwo release preflight OK.`;
- Apple/Google product IDs and package IDs still match `src/domain/storeProducts.ts` and `com.talktwo.app`;
- required provider secrets are present in Supabase; no secret is stored in the mobile client or public-site bundle;
- the final HTTPS public site and verified app-link ownership are live before `EXPO_PUBLIC_TALKTWO_SITE_URL` is enabled in a signed release build;
- a production database backup/recovery point exists;
- explicit release authorization has been given.

## Phase 1 — database migrations

Apply repository migrations in **lexical filename order**. Never cherry-pick a later feature migration without all earlier migrations from the same frozen tree.

Current release sequence:

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
20. `20260824114000_premium_on_hold_projection.sql`
21. `20260824114500_extra_member_hold_lifecycle.sql`
22. `20260824115000_premium_gift_product_lock.sql`
23. `20260824115500_member_write_upgrade_store_flow.sql`
24. `20260824115600_member_write_upgrade_replacement_guard.sql`
25. `20260824115700_member_upgrade_checkout_recovery.sql`
26. `20260824115800_resumable_member_upgrade_checkout.sql`
27. `20260824115900_member_upgrade_approval_snapshot.sql`
28. `20260824120000_key_recovery_membership_revalidation.sql`

If later migrations exist on the eventual frozen release commit, append them in lexical order and update this plan before deployment.

### Mandatory database gates after migrations

- run `supabase/checks/account_deletion_schema.sql`; require `account_deletion_schema_ok`;
- run `supabase/checks/security_definer_schema.sql`; require `security_definer_schema_ok`;
- verify every public FK referencing `auth.users` is `CASCADE` or `SET NULL` where rows can survive deletion;
- run Supabase Security and Performance Advisors and resolve launch-blocking findings;
- verify RLS is enabled on user-facing tables and service-only tables/RPCs have no `anon`/`authenticated` direct privileges;
- verify AI budget reservation RPCs are executable by `service_role` only;
- verify partner timezone/window RPCs, store-verification internals, legacy edit/withdraw RPCs and legacy member-upgrade completion RPCs are not executable by authenticated clients;
- verify `notification_mutes` has no direct `anon`/`authenticated` table access;
- verify sender-visible message rows contain no recipient open/rejection/block/mute state;
- verify emoji/emoticon storage is rejected regardless of plan/client;
- verify an expired timed block cannot bypass an active recipient Personal Boundary for text or text documents;
- send disposable approved text/document messages through real RPCs and verify the persisted `public.messages.body` is immediately `NULL`, `plaintext_scrubbed_at` is populated, and ciphertext + verification hash remain available for the authorized open flow;
- before explicitly opening an incoming disposable message, verify `list_relationship_messages` returns `body`, `ciphertext` and `body_hash` as `NULL`; after `open_message`, verify ciphertext + hash are returned and decrypt to the approved text on the recipient device;
- verify Personal Boundary rejection never echoes the recipient's matching private word/phrase to the sender;
- verify a key-recovery request becomes unusable if the requester is no longer a current member of the active relationship, even when its bearer token has not expired;
- use disposable content only; never inspect real conversation plaintext as a release shortcut.

### Mandatory observer → participant database gates

Using disposable users and a sandbox/test store only:

- an observer cannot create a participant checkout before a fresh write-upgrade request is unanimously approved by every other current chat member;
- a rejection prevents checkout;
- an already-active account-wide participant entitlement can activate the newly approved chat without a second purchase;
- a 29 DKK observer entitlement does **not** grant writing access without approval plus verified replacement;
- authenticated clients cannot call `get_member_upgrade_verification_context`, `confirm_verified_member_write_upgrade`, legacy `confirm_member_write_upgrade`, `get_member_write_upgrade_offer` or `complete_billing_intent`;
- checkout is recurring 99 DKK/month and uses the normal `extra_participant_monthly` store product, never a TalkTwo-created one-time prorated charge;
- provider/platform must match the user's existing observer subscription;
- after checkout starts, the approved-member snapshot is stable so a member joining later cannot retroactively invalidate an already-authorized store purchase;
- cancelling an uncompleted native checkout returns the request to `awaiting_payment`; an interrupted checkout can resume the same still-valid intent rather than create parallel authorizations.

## Phase 2 — Edge Functions

Deploy from the same frozen release commit. JWT mode must match `supabase/config.toml`.

TalkTwo-JWT protected:

- `analyze-message`
- `analyze-document`
- `verify-store-purchase`
- `delete-account`

Provider/custom-auth endpoints:

- `apple-store-events` — verify Apple signed payload cryptographically;
- `google-store-events` — verify Google Pub/Sub identity/audience/email/package;
- `dispatch-push-notifications` — require the dedicated dispatcher bearer secret.

Never disable JWT verification for a user-facing function merely to make a test pass.

## Phase 3 — server smoke tests

Use disposable test identities and sandbox/store-test transactions only.

- Free and Premium message send/receive.
- AI review hard budget reservation/finalization and prompt/context integrity.
- Document analysis/send/open.
- Communication-window release without partner timezone/window disclosure.
- 1h/4h/24h/indefinite private blocks and global/chat/person private notification mutes.
- Queued alerts are cancelled when muted/blocked; new alerts are not queued while the relevant mute is active.
- Push payload contains no message text, sender name, relationship id, risk label or document name.
- Delivery acknowledgement occurs at app sync without read/open/rejection leakage.
- Editing/withdrawal cannot probe recipient open state.
- New message rows are ciphertext-only at rest immediately after trusted checks.
- Unopened messages expose no deterministic body hash.
- Key recovery on a second device, including relationship-bound recovery AAD and stale-membership invalidation.
- Organization sponsorship claim with a disposable verified email.
- Store purchase verification/restore with sandbox/licensed testers.
- Observer → participant upgrade on Apple and Google as described below.
- Account deletion after purchase/sponsorship: deletion succeeds, retained payment history is pseudonymized, and another person's already-paid entitlement survives.

## Phase 4 — public site and verified app links

- publish the reviewed HTTPS site and set `VITE_PUBLICATION_APPROVED=true` only after intended legal/privacy review;
- run public-site preflight/build and verify no private secret is bundled;
- verify `/`, `/privacy/`, `/terms/`, `/support/`, `/delete-account/` and `/app/*` fallback routes;
- serve `/.well-known/apple-app-site-association` with final Apple Team ID + `com.talktwo.app`, scoped to intended `/app/*` routes;
- serve `/.well-known/assetlinks.json` with `com.talktwo.app` and the SHA-256 fingerprint of the actual Android release signing key;
- final `app.json` must contain `applinks:<final-host>` and Android `autoVerify` HTTPS intent filter with `pathPrefix: "/app/"`;
- allowlist final `/app/auth` in Supabase Auth and verify PKCE code exchange; legacy access/refresh-token redirects must be rejected;
- invitation/member/recovery/gift possession secrets remain in URL fragments and the `/app/*` fallback must not read/transmit them;
- verify public account deletion with a disposable account; unknown email must neither create an account nor disclose account existence;
- only then set `EXPO_PUBLIC_TALKTWO_SITE_URL` for the signed release build.

## Phase 5 — native store setup and signed-device tests

### Apple

- `extra_observer_monthly` and `extra_participant_monthly` must be in the **same auto-renewable subscription group**;
- participant must be a higher subscription level than observer, so observer → participant is an immediate App Store upgrade rather than a downgrade/crossgrade;
- sandbox-test the upgrade and verify the new transaction keeps the expected original transaction identity;
- verify App Store UI shows the actual charge/refund; TalkTwo must not invent a proration amount;
- Premium products must be grouped/configured consistently with their intended switching behavior.

### Google

- both extra-member products must be monthly subscriptions with exactly one eligible offer as expected by the client;
- observer → participant replacement must pass the old observer purchase token and use `CHARGE_PRORATED_PRICE`/replacement mode 2;
- Google Play Developer API must return `linkedPurchaseToken` equal to the old verified observer token; otherwise TalkTwo rejects the upgrade;
- acknowledge/finish the new verified purchase after server verification;
- sandbox-test cancellation, process death during checkout, restore and retry.

### Native security and UX

- EAS production builds use remote app versions and auto-increment;
- Android compile/target SDK remains at least the required release level;
- signed iOS and Android devices pass every final-domain app-link family and reject look-alike domains;
- local SQLite reports non-empty SQLCipher `cipher_version`; Android merged manifest keeps app-data backup disabled;
- TestFlight/Play internal testing covers cross-platform delivery, billing/upgrade/restore, notifications, deletion, new-device key recovery, dark mode and accessibility;
- store metadata/privacy answers/public URLs match the shipped binary and backend.

## Stop conditions

Stop release for any red exact-tree QA job, failed schema gate, migration drift, failed preflight, missing secret, mismatched store product, broken verified app link, PKCE regression, SQLCipher failure, server plaintext retention, unread-hash leak, Personal Boundary privacy leak, stale-member key-recovery authorization, unverified/incorrect subscription replacement, billing double-charge risk, account-deletion failure, unexpected native permission or failed provider verification.
