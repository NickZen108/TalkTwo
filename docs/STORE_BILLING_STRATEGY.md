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
- Extra read-only member: 29 DKK/month.
- Extra participant with writing: 99 DKK/month.
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

A cancellation means access continues until the paid period ends unless the store reports a refund/revocation that requires earlier termination.

## Extra-member approval rule
An extra-member subscription cannot be offered until the invitation is in `awaiting_payment`, which only happens after every required current member has approved the candidate.

If a current member withdraws renewal approval, TalkTwo marks the membership to end at the current paid period. The store subscription must then be scheduled/cancelled so no next month is charged.

## Read-only to writing upgrade
The target policy is immediate upgrade with a prorated charge for the remainder of the current month, then 99 DKK/month on renewal.

The exact store implementation must preserve that economic result. Apple and Google subscription-change rules differ, so the backend calculates the TalkTwo policy while platform-specific purchase code chooses the permitted upgrade mechanism.

## Premium gifts
Apple permits gifting IAP-eligible digital items. A one-month Premium gift is therefore modelled as a one-time store purchase, not an auto-renewing subscription on the recipient's Apple/Google account.

After server verification, TalkTwo creates a durable recipient entitlement bound to the intended recipient identity. The invitation/deep link is only a recovery convenience. Losing the link does not lose the paid entitlement.

## EU alternative billing
Both Apple and Google provide special EU/EEA programs that can permit external or alternative payment flows subject to enrollment, technical APIs, disclosures, reporting and fees. TalkTwo does not depend on those programs for v1. Native store billing is the default so the first release can also operate outside the EU without maintaining two different purchase systems from day one.

Alternative billing can be evaluated later if its economics outweigh the added compliance and reporting complexity.

## Open product decision
A store account can normally hold only one active subscription to a given subscription product at a time. TalkTwo therefore needs a precise product rule for an extra member who participates as an extra member in more than one group chat: whether one paid extra-member subscription covers all such chats, or whether each chat requires a separate paid membership. This must be resolved before the extra-member store subscription design is finalized.
