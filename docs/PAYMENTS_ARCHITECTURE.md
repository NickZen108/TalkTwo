# TalkTwo payment architecture

## Goal
TalkTwo keeps entitlement rules in its own backend while treating payment providers as evidence that money was successfully collected. The client must never be able to grant itself access by claiming that a payment succeeded.

## Provider-neutral backend
`billing_checkout_intents` records the server-calculated purchase before any payment provider is contacted.

Supported intent kinds:
- `extra_member_start`: monthly extra-member subscription, 29 DKK read-only or 99 DKK writing.
- `extra_member_upgrade`: one-time prorated charge to move a paid read-only member to writing for the remainder of the current month; subsequent renewals are 99 DKK/month.
- `premium_gift`: fixed-duration Premium entitlement for a verified recipient email.

Only trusted backend/service-role code can attach provider session IDs or complete an intent. Completion calls the existing entitlement functions, which re-check membership/approval state before activating access.

## Native-store constraint
TalkTwo Premium and extra-member access are digital app functionality. Native store distribution therefore affects how checkout may be offered.

Do not hard-wire Stripe checkout into the React Native client. Keep the UI calling a provider adapter so the final implementation can use the permitted purchase route for each storefront and country.

Recommended release architecture:
1. Apple App Store build: use StoreKit / App Store in-app purchase for in-app subscriptions unless an approved regional external-purchase program is intentionally adopted.
2. Google Play build: use Play Billing by default. EEA alternative billing / external offers are possible only if TalkTwo is enrolled and the required APIs, disclosures, reporting and fees are implemented.
3. Web/PWA or direct Android distribution: a web payment provider such as Stripe can be used without Play/App Store billing restrictions.
4. Premium gifts for another person should remain a backend entitlement keyed to the recipient's verified TalkTwo email. The gift must survive loss of a link. The payment rail may differ by storefront.

## Payment completion
A provider webhook/server notification must be the source of truth. After provider verification, backend code completes the matching billing intent.

For extra-member start it must provide:
- provider subscription ID
- paid period start
- paid period end (maximum one month)

For read-only upgrade it records the one-time prorated payment, changes the relationship role to participant and changes future renewal price to the normal writing price.

For Premium gifts it creates the durable paid gift and a 90-day claim window. The purchaser can rotate/resend the convenience link without changing the payment record.

## Cancellation and approval withdrawal
Provider cancellation and TalkTwo membership approval are distinct states.

If any required existing member withdraws approval:
- TalkTwo immediately marks the extra membership `cancel_at_period_end`.
- The paid member keeps access through the paid period.
- The provider subscription must be scheduled not to renew.
- At period end the member is removed from the relationship.

Blocking remains immediate and separate from billing.

## Security rules
- Never trust price, role, duration, recipient or entitlement information supplied by the client when a server can derive it.
- Never complete an entitlement from a client callback alone.
- Verify provider signatures/server notifications.
- Make completion idempotent.
- Keep provider secrets out of the app bundle and repository.
- Do not expose service-role payment-completion RPCs to anonymous or authenticated client roles.
