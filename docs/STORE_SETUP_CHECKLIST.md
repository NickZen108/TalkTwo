# TalkTwo App Store / Google Play setup checklist

This is the external-account work required before native purchases and signed release behavior can be tested end to end.

## Apple

- Active Apple Developer Program membership.
- App Store Connect record for bundle ID `com.talktwo.app`.
- Paid Applications agreement, banking and tax setup complete.
- All product IDs from `src/domain/storeProducts.ts` created exactly.
- `com.talktwo.extra.observer.monthly` and `com.talktwo.extra.participant.monthly` are auto-renewable subscriptions in the **same subscription group**.
- Participant is ranked at a **higher subscription level** than observer. Apple treats movement to a higher-ranked subscription as an immediate upgrade; configure this deliberately rather than relying on accidental ordering.
- No annual extra-member product exists.
- Premium subscription products are placed in deliberate subscription groups/levels matching their intended switching behavior.
- App Store Server Notifications target `apple-store-events` after that function is deployed.
- Apple verification roots and `APPLE_ENVIRONMENT`, `APPLE_BUNDLE_ID`, production `APPLE_APP_ID` are configured as Supabase secrets.
- StoreKit client sends `appAccountToken` equal to the authenticated TalkTwo user UUID.
- Sandbox tester is available.
- Final Apple Team ID is used by `/.well-known/apple-app-site-association`; signed build claims only intended `/app/*` routes.

### Apple observer → participant test

1. Buy observer through the sandbox and confirm TalkTwo records the original transaction identity.
2. Obtain fresh unanimous write-access approval inside the target chat.
3. Start participant purchase from TalkTwo.
4. Confirm App Store presents it as an upgrade in the same subscription group.
5. Verify the new transaction keeps the expected original transaction identifier; TalkTwo must reject an unrelated subscription.
6. Confirm writing access appears only after server verification.
7. Verify a cancelled upgrade leaves observer access intact and can be retried.
8. Verify a process-kill after successful store purchase reconciles on next app launch/connection.

Apple determines the actual upgrade refund/charge. TalkTwo must not promise or calculate a specific prorated amount itself.

## Google

- Active Google Play Console developer account.
- App package is `com.talktwo.app`.
- Payments/merchant setup complete.
- All product/subscription IDs from `src/domain/storeProducts.ts` created exactly.
- `extra_observer_monthly` and `extra_participant_monthly` are monthly subscriptions; no annual extra-member plan.
- Each extra-member product exposes exactly one eligible offer expected by the client; ambiguous offers fail closed.
- Google Play Developer API service account is configured in `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
- Real-time developer notifications target `google-store-events` after deployment.
- Pub/Sub verification secrets `GOOGLE_PUBSUB_AUDIENCE`, `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PACKAGE_NAME=com.talktwo.app` are configured.
- Play Billing client sets `obfuscatedAccountId` to SHA-256(`talktwo:<TalkTwo user UUID>`).
- Internal testing track and licensed tester are available.
- Final Android release certificate SHA-256 fingerprint is served in `/.well-known/assetlinks.json`; signed app has `autoVerify` HTTPS App Link for `/app/`.

### Google observer → participant test

1. Buy observer and finish/acknowledge the verified purchase.
2. Obtain fresh unanimous write-access approval in the target chat.
3. Upgrade using the active observer purchase token as the old purchase token and replacement mode `2` (`CHARGE_PRORATED_PRICE`).
4. Confirm Google creates a new active participant purchase.
5. Through the Play Developer API, require the verified new subscription's `linkedPurchaseToken` to equal the old verified observer token.
6. TalkTwo must reject a new participant subscription that is not linked to the observer purchase.
7. Confirm writing access appears only after the replacement is verified.
8. Confirm cancel/process-kill/retry does not create parallel TalkTwo checkout authorizations.

Google Play determines and displays the actual prorated replacement charge; TalkTwo only binds the normal 99 DKK/month participant product and verifies the replacement relationship.

## Deployment gate

- Finish the systematic account-independent audit, freeze one exact release tree and move the QA mirror to it.
- Require a normal full QA run green; `steps=null` runner failures are not green validation.
- Run mobile `npm run release:preflight` with final environment values.
- Final HTTPS domain, AASA, assetlinks and `/app/*` privacy-minimized fallback must be live before `EXPO_PUBLIC_TALKTWO_SITE_URL` is enabled.
- Apply **all** migrations in lexical order through the eventual release head. For the current tree this includes `20260824114000` through `20260824115900`; do not stop at `20260824113000`.
- Run `supabase/checks/account_deletion_schema.sql` and require `account_deletion_schema_ok`.
- Run `supabase/checks/security_definer_schema.sql` and require `security_definer_schema_ok` after the complete migration stack.
- Re-run Supabase Security and Performance Advisors.
- Deploy `verify-store-purchase` with JWT verification enabled.
- Deploy Apple/Google provider webhook functions with provider verification intact.
- Deploy `dispatch-push-notifications` only with strong `PUSH_DISPATCH_SECRET` and Expo access token.
- Configure EAS/APNs/FCM and test push on physical devices before release.
- Final app/adaptive icon, splash and store artwork must be approved before submission builds.

## Product rules to preserve

- Extra-member payment is account-wide, not per chat.
- Observer is 29 DKK/month and read-only.
- Participant is 99 DKK/month and can write only in chats where writing access has been approved.
- Each chat independently requires unanimous approval.
- Existing participant entitlement can cover a newly approved write upgrade without a second purchase.
- A plain observer entitlement never grants writing access by itself.
- Observer → participant is a **native subscription replacement**, not a separate TalkTwo one-time upgrade charge.
- Store/platform must match the existing observer subscription; no Google→Apple or Apple→Google in-place upgrade.
- Once native checkout begins, the unanimous approval snapshot for that checkout is fixed so a person joining the chat later cannot retroactively invalidate an already-authorized purchase.
- Premium gifts are one month / 59 DKK one-time purchases and remain recoverable if a link is lost.
- Recurring Premium and extra-member lifecycle state comes only from verified provider data, never client claims.

## Minimum sandbox/internal test matrix

1. Observer purchase after unanimous approval.
2. Participant purchase after unanimous approval.
3. Payment impossible before unanimous approval.
4. Observer joins another approved chat read-only without second charge.
5. Participant joins another approved chat without second charge.
6. Observer requests writing access; one approver rejects; no checkout possible.
7. Existing participant entitlement receives fresh approval in another chat and gains writing access without another charge.
8. Apple observer→participant upgrade succeeds only inside configured subscription group/levels.
9. Google observer→participant upgrade verifies `linkedPurchaseToken`.
10. Cross-store upgrade is blocked before purchase starts.
11. Cancelled/interrupted upgrade is retryable without duplicate TalkTwo intents.
12. Store cancellation preserves paid access to the proper boundary; hold/pause suspends according to verified lifecycle state.
13. Refund/revocation removes affected entitlement.
14. Duplicate provider notifications are idempotent.
15. Receipt/account binding to another TalkTwo account is rejected.
16. Premium gift survives lost link and activates only for intended recipient.
17. Restore after reinstall/new device succeeds only for already-linked purchases.
18. Account deletion succeeds after purchase/sponsorship and does not destroy another beneficiary's already-paid entitlement.
19. Signed iOS/Android app links, PKCE auth, SQLCipher, dark mode and accessibility pass physical-device testing.
20. Disposable message/document rows are ciphertext-only at rest and unread content exposes no body hash before open.
