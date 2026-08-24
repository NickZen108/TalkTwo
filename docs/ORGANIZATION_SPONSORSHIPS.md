# Organization-sponsored Premium

TalkTwo can support municipalities, family centres, clinics, employers, or other organizations that pay for a user's Premium access without becoming a participant in the user's conversations.

## Product rule

Organization sponsorship is a server-assigned entitlement, not an in-app activation-code purchase path.

- Do not add a user-entered license key, voucher, QR code, or external-payment call to action to the consumer app without a fresh App Store / Google Play policy review.
- Premium remains available through the configured Apple and Google in-app purchase products.
- A sponsoring organization receives no conversation membership, message access, read status, relationship identifier, Coach statistics, encryption key, or account activity.

## Data minimization

The sponsorship table stores:

- organization name;
- SHA-256 hash of the normalized recipient email;
- sponsored duration;
- claim status and expiry;
- optional internal reference;
- claim timestamps and resulting Premium end date.

It does not store the recipient email in plaintext and has no relationship or message columns.

## Issuing a sponsorship

Issuance is server/admin only through `create_organization_sponsorship(...)`. The RPC is not executable by `anon` or `authenticated` roles.

Inputs:

- `sponsor_name`: organization display name;
- `recipient`: recipient email, used only to calculate the stored hash;
- `sponsored_months`: 1–24 months;
- `expires_at`: deadline for the recipient to claim the grant;
- `reference`: optional internal invoice/order/reference value.

Create sponsorships only after the organization's payment or contractual authorization has been verified outside the mobile app.

## Recipient claim

On verified sign-in, the mobile app calls `claim_my_organization_sponsorships()` before opening Home.

The RPC:

1. requires an authenticated user with a confirmed email;
2. hashes that confirmed email server-side;
3. locks claims for that user to avoid duplicate concurrent redemption;
4. finds only pending, unexpired sponsorships matching that hash;
5. stacks each sponsored period after the later of now, the existing Premium end, or an active trial end;
6. marks each sponsorship claimed atomically;
7. returns no other recipients or grants.

The call is idempotent: after all matching grants are claimed, subsequent calls return no rows.

## Revocation

A pending sponsorship may be revoked administratively before it is claimed. A claimed sponsorship should not be silently clawed back from a user's current entitlement; refunds or contractual corrections need a deliberate admin process and audit trail.

## Store review notes

For store submission, explain that organization-funded access is assigned server-side to eligible accounts, does not expose an alternate consumer checkout inside the app, and that the same Premium functionality is also available through the app's configured in-app purchases. Re-check the current Apple and Google payment rules immediately before submission.
