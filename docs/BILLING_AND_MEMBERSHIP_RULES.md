# TalkTwo billing and membership rules

## Extra members
- The first two relationship members are the core conversation members.
- Every additional member is billed separately.
- Read-only (`observer`) access costs 29 DKK/month.
- Writing (`participant`) access costs the normal 99 DKK/month extra-member price.
- Extra-member subscriptions are monthly only. They auto-renew one month at a time and cannot be prepaid annually.

## Approval before first payment
- A candidate accepts the invitation before payment.
- Every currently active relationship member must approve the candidate.
- The payment flow must remain unavailable until all approvals are affirmative.
- If any approval is rejected, no payment is captured and the candidate is not activated.

## Withdrawing approval
- Existing members may withdraw renewal approval for an extra member.
- Withdrawal disables auto-renewal and marks the subscription to end at the current paid period boundary.
- The extra member keeps their paid access until that boundary.
- Immediate removal remains a separate block/remove action.

## Read-only upgrade
- A read-only extra member may upgrade to writing access during a paid month.
- The immediate upgrade charge is the prorated difference between 29 DKK and 99 DKK for the remaining portion of the current period.
- Subsequent monthly renewals are 99 DKK.

## Premium paid for someone else
- A Premium purchase for another person creates a durable entitlement. The value belongs to the intended recipient, not to a fragile invitation URL.
- The entitlement is bound to the recipient's verified account email.
- A deep link may be used for convenience, but claiming still requires the signed-in account email to match.
- If the link is lost, the recipient can discover the pending gift after signing in with the matching email.
- The purchaser can rotate/resend the link without losing the paid entitlement.
- Reissuing a link rotates the token but does not create a second purchase.
- Paid gifts have a 90-day claim window. Expiry/refund handling is a payment-provider workflow and must not silently destroy the underlying payment record.

## Appearance
- Light, dark and system appearance modes are supported.
- Foreground/background combinations must pass contrast checks. Theme changes must never permit message text, labels or controls to disappear into their backgrounds.
