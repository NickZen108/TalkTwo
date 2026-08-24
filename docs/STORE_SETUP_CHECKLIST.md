# TalkTwo App Store / Google Play setup checklist

This is the external-account work required before native purchases can be tested end to end.

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

## Deployment gate
- Apply the account-wide lifecycle migration before `20260820112904_store_notification_event_ingestion.sql`.
- Apply `20260820125229_recurring_premium_subscription_lifecycle.sql` before enabling recurring Premium products. It implements initial activation plus renewal/recovery/grace-period, cancellation/on-hold, expiry and revocation/refund processing.
- Apply `20260820150217_account_deletion.sql` before enabling public account deletion, then run `supabase/checks/account_deletion_schema.sql` and require `account_deletion_schema_ok`.
- Configure all provider secrets before deploying the functions; they fail closed when configuration is absent.
- Deploy `verify-store-purchase` with Supabase JWT verification enabled.
- Deploy Apple and Google webhook functions with their platform-specific verification code intact; these endpoints intentionally do not use TalkTwo JWT auth because providers authenticate their own callbacks.
- Deploy `dispatch-push-notifications` only with a strong `PUSH_DISPATCH_SECRET` and Expo access token configured.
- Do not expose the public website deletion link until the HTTPS site is live, its Supabase magic-link redirect is allowlisted and a disposable-account deletion test has passed.

## TalkTwo product rules to preserve
- Extra-member payment is account-wide, not per chat.
- Observer access is 29 DKK/month and covers read-only extra membership in all approved chats.
- Participant access is 99 DKK/month and covers participant or observer billing entitlement in all approved chats.
- Each chat still requires its own unanimous approval before access begins.
- An existing qualifying subscription means a newly approved chat activates without a second purchase.
- Observer-to-participant upgrade is prorated for the current period and renews at 99 DKK/month.
- Premium gifts are durable recipient entitlements; a lost link never destroys the paid value.
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
