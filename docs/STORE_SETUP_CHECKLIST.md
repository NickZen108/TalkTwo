# TalkTwo App Store / Google Play setup checklist

This is the external-account work required before native purchases can be tested end to end.

## Apple
- Active Apple Developer Program membership.
- App record in App Store Connect for bundle ID `com.talktwo.app`.
- Paid Applications agreement accepted, with banking and tax information completed.
- In-App Purchase products created with the IDs in `src/domain/storeProducts.ts`.
- Subscription products placed into appropriate subscription groups.
- App Store Server Notifications configured to point to the TalkTwo backend verification endpoint once deployed.
- App Store Server API key created for server-side verification.
- Sandbox tester account available for test purchases.

## Google
- Active Google Play Console developer account.
- App created with package `com.talktwo.app`.
- Payments profile / merchant setup completed.
- Products and subscriptions created with the IDs in `src/domain/storeProducts.ts`.
- Monthly extra-member products must not offer annual prepayment.
- Google Play Developer API service account configured for server-side verification.
- Real-time developer notifications configured once the TalkTwo verification endpoint is deployed.
- Internal testing track and licensed tester account available.

## TalkTwo product rules to preserve
- Extra-member payment is account-wide, not per chat.
- Observer access is 29 DKK/month and covers read-only extra membership in all approved chats.
- Participant access is 99 DKK/month and covers participant or observer billing entitlement in all approved chats.
- Each chat still requires its own unanimous approval before access begins.
- An existing qualifying subscription means a newly approved chat activates without a second purchase.
- Observer-to-participant upgrade is prorated for the current period and renews at 99 DKK/month.
- Premium gifts are durable recipient entitlements; a lost link never destroys the paid value.

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
12. Premium gift can be recovered after losing the original link.
13. Restore purchases works after reinstall / new device.
14. Dark mode purchase screens retain readable contrast.
