# TalkTwo billing and membership rules

## Extra members
- The first two relationship members are the core conversation members.
- Extra-member access is billed per TalkTwo account, not per chat.
- Read-only (`observer`) access costs 29 DKK/month and can cover read-only extra-member access in any number of chats where the user has been approved.
- Writing (`participant`) access costs 99 DKK/month and can cover either writing or read-only extra-member access in any number of chats where the user has been approved.
- A user never pays a second extra-member subscription merely because they join another eligible TalkTwo chat.
- Extra-member subscriptions are monthly only. They auto-renew one month at a time and cannot be prepaid annually.

## Approval before access or first payment
- A candidate accepts the invitation before payment.
- Every currently active relationship member in that specific chat must approve the candidate.
- If the candidate already has a qualifying account-wide extra-member subscription, approval activates the chat without another payment.
- If the candidate does not already have qualifying access, the payment flow remains unavailable until all approvals are affirmative.
- If any approval is rejected, no payment is captured for that invitation and the candidate is not activated in that chat.

## Withdrawing approval
- Existing members may withdraw renewal approval for an extra member in their chat.
- Withdrawal marks that chat membership to end at the current paid period boundary.
- It does not cancel the user's account-wide subscription or remove them from unrelated chats.
- The extra member keeps access to that chat until the current paid period boundary.
- Immediate distance remains a separate block/remove action.

## Read-only upgrade
- A read-only extra member may upgrade to account-wide writing access during a paid month.
- The immediate upgrade charge is the prorated difference between 29 DKK and 99 DKK for the remaining portion of the current period.
- Subsequent monthly renewals are 99 DKK.
- The upgraded account can satisfy participant-level billing in other chats, but each chat still controls whether that person is approved for writing access there.

## Premium paid for someone else
- A Premium purchase for another person creates a durable entitlement. The value belongs to the intended recipient, not to a fragile invitation URL.
- The entitlement is bound to the recipient's verified account email.
- A deep link may be used for convenience, but claiming still requires the signed-in account email to match.
- If the link is lost, the recipient can discover the pending gift after signing in with the matching email.
- The purchaser can rotate/resend the link without losing the paid entitlement.
- Reissuing a link rotates the token but does not create a second purchase.
- Paid gifts have a 90-day claim window. Expiry/refund handling is a payment-provider workflow and must not silently destroy the underlying payment record.

## Stores
- iOS and Android launch together.
- Digital subscriptions use Apple In-App Purchase on iOS and Google Play Billing on Android.
- Store product identifiers map to server-owned TalkTwo entitlements. The app never grants paid access merely because the client reports a purchase.
- Store transaction events are recorded idempotently so duplicate notifications cannot duplicate access.

## Appearance
- Light, dark and system appearance modes are supported.
- Foreground/background combinations must pass contrast checks. Theme changes must never permit message text, labels or controls to disappear into their backgrounds.
