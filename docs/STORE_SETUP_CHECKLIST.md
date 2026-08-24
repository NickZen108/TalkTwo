# TalkTwo App Store / Google Play setup checklist

This is the external-account work required before native purchases and signed release behavior can be tested end to end.

## Apple
- Active Apple Developer Program membership.
- App record in App Store Connect for bundle ID `com.talktwo.app`.
- Paid Applications agreement accepted, with banking and tax information completed.
- In-App Purchase products created with the IDs in `src/domain/storeProducts.ts`.
- Subscription products placed into appropriate subscription groups.
- App Store Server Notifications configured to call `apple-store-events` once deployed.
- Apple root CA certificates stored as DER/base64 JSON in `APPLE_ROOT_CA_DER_BASE64_JSON`.
- `APPLE_ENVIRONMENT`, `APPLE_BUNDLE_ID` and production `APPLE_APP_ID` configured as Supabase secrets.
- StoreKit client sets `appAccountToken` to the authenticated TalkTwo user UUID.
- Sandbox tester account available for test purchases.
- Final Apple Team ID is known and used to serve `/.well-known/apple-app-site-association` for `com.talktwo.app`; the signed build contains `applinks:<final-host>` and claims only the intended `/app/*` TalkTwo routes.

## Google
- Active Google Play Console developer account.
- App created with package `com.talktwo.app`.
- Payments profile / merchant setup completed.
- Products and subscriptions created with the IDs in `src/domain/storeProducts.ts`.
- Monthly extra-member products must not offer annual prepayment.
- Google Play Developer API service account configured in `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
- Real-time developer notifications configured to call `google-store-events` once deployed.
- Pub/Sub push authentication configured with `GOOGLE_PUBSUB_AUDIENCE` and `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL`.
- `GOOGLE_PACKAGE_NAME` configured as `com.talktwo.app`.
- Play Billing client sets `obfuscatedAccountId` to SHA-256(`talktwo:<TalkTwo user UUID>`).
- Each extra-member subscription product exposes exactly one eligible monthly Google Play offer; ambiguous offers fail closed in the client.
- Internal testing track and licensed tester account available.
- SHA-256 fingerprint of the **actual release signing certificate** is known and used in `/.well-known/assetlinks.json`; the signed build has an `autoVerify` HTTPS App Link for the final host with `pathPrefix: "/app/"`.

## Deployment gate
- Freeze the exact release tree and require its QA mirror to be green before any production change.
- Run `npm run release:preflight` with final release environment values; do not build for stores until it reports `TalkTwo release preflight OK.`
- Require the final HTTPS domain to be live, serve the signed-build Apple/Android association files, and route `/app/*` browser fallback to the static privacy-minimized page before enabling `EXPO_PUBLIC_TALKTWO_SITE_URL`.
- Allowlist the exact final `/app/auth` callback in Supabase Auth and verify mobile sign-in is PKCE code exchange; never accept an implicit URL carrying access/refresh tokens.
- Apply the account-wide lifecycle migration before `20260820112904_store_notification_event_ingestion.sql`.
- Apply `20260820125229_recurring_premium_subscription_lifecycle.sql` before enabling recurring Premium products. It implements initial activation plus renewal/recovery/grace-period, cancellation/on-hold, expiry and revocation/refund processing.
- Apply `20260820150217_account_deletion.sql` before enabling public account deletion, then run `supabase/checks/account_deletion_schema.sql` and require `account_deletion_schema_ok`.
- Run `supabase/checks/security_definer_schema.sql` after the complete migration stack and require `security_definer_schema_ok`.
- Apply `20260824084500_ai_budget_reservations.sql` before deploying the current AI review functions; the functions reserve the monthly budget atomically before calling OpenAI.
- Apply `20260824113000_storage_boundary_enforcement.sql` and verify new message rows retain no plaintext body after trusted send-time checks; unopened recipient APIs must not expose body, ciphertext or body hash.
- Re-run Supabase Security and Performance Advisors after migrations and resolve launch-blocking findings.
- Configure all provider secrets before deploying the functions; they fail closed when configuration is absent.
- Deploy `verify-store-purchase` with Supabase JWT verification enabled.
- Deploy Apple and Google webhook functions with their platform-specific verification code intact; these endpoints intentionally do not use TalkTwo JWT auth because providers authenticate their own callbacks.
- Deploy `dispatch-push-notifications` only with a strong `PUSH_DISPATCH_SECRET` and Expo access token configured.
- Do not expose the public website deletion link until the HTTPS site is live, its Supabase magic-link redirect is allowlisted and a disposable-account deletion test has passed.
- Do not release push notifications until the EAS project ID and platform push credentials are configured and tested on physical devices.
- Final app/adaptive icon and store artwork must be approved before signed submission builds.

## TalkTwo product rules to preserve
- Extra-member payment is account-wide, not per chat.
- Observer access is 29 DKK/month and covers read-only extra membership in all approved chats.
- Participant access is 99 DKK/month and covers participant or observer billing entitlement in all approved chats.
- Each chat still requires its own unanimous approval before access begins.
- An existing qualifying subscription means a newly approved chat activates without a second purchase.
- Observer-to-participant upgrade is prorated for the current period and renews at 99 DKK/month.
- Premium gifts are durable recipient entitlements; a lost link never destroys the paid value.
- Premium-gift possession tokens, invitation secrets and key-recovery secrets remain in URL fragments rather than query strings.
- Recurring Premium lifecycle state comes from verified Apple/Google transactions and notifications, not from client claims.

## Test cases before release
1. New observer purchase after unanimous approval.
2. New participant purchase after unanimous approval.
3. Payment is impossible before unanimous approval.
4. Existing observer subscription joins a second chat read-only with no second charge.
5. Existing participant subscription joins another approved chat with no second charge.
6. Observer entitlement does not cover a participant invitation until upgraded.
7. Mid-cycle observer-to-participant upgrade charges only the prorated difference.
8. One chat withdraws approval: that chat ends at the current period boundary while unrelated chats remain intact.
9. Store cancellation preserves access until the paid period ends.
10. Refund/revocation removes entitlement according to store status.
11. Duplicate store notifications do not duplicate access.
12. A receipt bound to another TalkTwo account is rejected.
13. Premium gift can be recovered after losing the original link.
14. Restore purchases works after reinstall / new device.
15. Dark mode purchase screens retain readable contrast.
16. Restore refuses a valid store receipt that belongs to another TalkTwo account or has no existing verified TalkTwo ledger entry.
17. Premium individual monthly: purchase, renewal, cancellation and expiry all update only the payer's entitlement.
18. Premium for two monthly/annual: both payer and selected beneficiary receive the verified period, and later renewal extends both.
19. Premium grace period remains available only through the provider-verified grace end; refund/revocation removes the affected store entitlement immediately.
20. Account deletion after a purchase/sponsorship succeeds while retained payment history is pseudonymized and another person's already-paid entitlement survives.
21. AI review cannot start when the atomic monthly budget reservation would exceed the configured hard limit; no send approval is created on failure.
22. Public deletion works end-to-end for a disposable account and an unknown email neither creates an account nor reveals whether one exists.
23. Signed iOS Universal Links for every `/app/*` family open TalkTwo; a look-alike domain does not.
24. Signed Android verified App Links for every `/app/*` family open TalkTwo without an app chooser after verification; a look-alike domain does not.
25. Mobile magic-link login succeeds through PKCE and rejects a legacy redirect containing `access_token` or `refresh_token`.
26. If an app link falls back to the website, the static `/app/` page does not read or transmit URL fragments and has no analytics/script execution.
27. A signed release reports non-empty SQLCipher `cipher_version`; Android app-data backup remains disabled.
28. A disposable sent text/document row is ciphertext-only at rest immediately, and an unopened recipient cannot retrieve its deterministic body hash.
