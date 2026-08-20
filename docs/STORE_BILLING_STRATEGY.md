# TalkTwo store billing strategy

TalkTwo launches on iOS and Android from the start.

## Default commerce path
- iOS: Apple In-App Purchase / StoreKit for digital subscriptions and in-app digital purchases.
- Android: Google Play Billing for digital subscriptions and in-app digital purchases.
- The TalkTwo backend remains the source of truth for chat membership and Premium entitlements after a store purchase has been verified server-side.
- The client never activates paid access based only on a local purchase-success callback.

## Product catalogue
The canonical product keys and store IDs live in `src/domain/storeProducts.ts`.

Initial products:
- Individual Premium monthly: 59 DKK/month.
- Two-person Premium monthly: 99 DKK/month.
- Two-person Premium annual: 799 DKK/year.
- Account-wide extra read-only access: 29 DKK/month.
- Account-wide extra participant access with writing: 99 DKK/month.
- One-month Premium gift: one-time digital purchase, initially 59 DKK.

Storefront prices are configured in App Store Connect and Google Play Console. The backend may record the expected Danish price for product-policy checks, but it must accept store-localized prices and taxes from verified store transactions rather than trusting a client-supplied amount.

## Verification and idempotency
Every purchase must be verified server-side before access changes.

For each store transaction TalkTwo records:
- platform (`apple` / `google`)
- product ID
- provider transaction/order ID
- provider original transaction/subscription ID where applicable
- TalkTwo user ID
- checkout intent ID
- verification status
- purchase/renewal/expiry timestamps
- raw provider status metadata only when needed for dispute/audit handling

Provider transaction IDs must be unique so retries and webhook re-deliveries cannot double-grant access.

## Subscription lifecycle
Store notifications are authoritative for renewal, cancellation, refund/revocation, billing retry and expiry. The app may refresh purchase state, but entitlement changes are finalized by the backend.

The native client stores the checkout-intent ID in device-protected storage before opening StoreKit or Play Billing. It passes the authenticated user UUID as Apple's `appAccountToken` and a SHA-256 account binding as Google's `obfuscatedAccountId`. The client finishes a transaction only after `verify-store-purchase` has accepted it.

For a new subscription, the verifier also requires an unrevoked Apple subscription with a future expiry or an active Google subscription with a future expiry. A valid but expired receipt cannot be replayed against a fresh checkout intent.

Restore is acknowledgement-only. A restored receipt must verify with Apple or Google and already match the same user, product and transaction/original-transaction identity in `store_purchase_events`. Restore never creates a new entitlement or guesses a missing checkout intent.

A cancellation means access continues until the paid period ends unless the store reports a refund/revocation that requires earlier termination.

## Account-wide extra-member access
Extra-member billing is per TalkTwo account, not per chat.

A 29 DKK read-only subscription can cover the same user as a read-only extra member in any number of chats where that user has separately been approved. A 99 DKK participant subscription can cover either read-only or writing access in any number of chats where that user has separately been approved.

Chat approval and billing entitlement are deliberately separate:
- each chat still decides whether the person may join that chat;
- an existing qualifying account-wide subscription means a newly approved chat can activate without another purchase;
- a user is never charged again merely because they are extra member in another chat.

If one chat withdraws approval, access to that chat ends at the paid period boundary and unrelated chats are unaffected. If the user still has at least one approved paid extra-member chat, the account-wide subscription keeps renewing. If no approved extra-member chat remains, TalkTwo marks the account-wide subscription to stop at the end of the current paid period so the user is not charged for access that no chat will accept.

If approval is restored before the paid period ends, renewal can resume as long as at least one eligible chat remains and the store subscription has not already become irreversibly expired.

## Extra-member approval rule
An extra-member purchase cannot be offered until the invitation is in `awaiting_payment`, which only happens after every required current member in that chat has approved the candidate.

If the candidate already has qualifying account-wide extra-member access, the backend skips checkout and activates that chat after approval.

## Read-only to writing upgrade
The target policy is immediate account-wide upgrade with a prorated charge for the remainder of the current month, then 99 DKK/month on renewal.

The exact store implementation must preserve that economic result. Apple and Google subscription-change rules differ, so the backend calculates the TalkTwo policy while platform-specific purchase code chooses the permitted upgrade mechanism.

An account-wide participant entitlement does not itself override a chat's local role. A chat that approved someone only as read-only remains read-only until that chat's role is changed through the appropriate approval flow.

## Premium gifts
A one-month Premium gift is modelled as a one-time digital purchase, not an auto-renewing subscription on the recipient's account.

After server verification, TalkTwo creates a durable recipient entitlement bound to the intended recipient identity. The invitation/deep link is only a recovery convenience. Losing the link does not lose the paid entitlement.

## Native build requirements
TalkTwo uses `expo-iap` and therefore requires a native development build for purchase testing. Expo Go is not sufficient.

The current native baseline is iOS 16.4+ and Android minSdk 24 with a Kotlin 2.2 toolchain. Development, internal preview and production EAS build profiles are defined in `eas.json`.

## EU alternative billing
Apple and Google provide special EU/EEA programs that can permit external or alternative payment flows subject to enrollment, technical APIs, disclosures, reporting and fees. TalkTwo does not depend on those programs for v1. Native store billing is the default so the first release can also operate outside the EU without maintaining two different purchase systems from day one.

Alternative billing can be evaluated later if its economics outweigh the added compliance and reporting complexity.
