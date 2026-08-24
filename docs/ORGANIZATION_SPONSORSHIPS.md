# Organization-sponsored Premium

TalkTwo can support municipalities, family centres, clinics, employers, or other organizations that pay for a user's Premium access without becoming a participant in the user's conversations.

## Product rule

Organization sponsorship is a server-assigned entitlement, not an in-app activation-code purchase path.

- Do not add a user-entered license key, voucher, QR code, or external-payment call to action to the consumer app without a fresh App Store / Google Play policy review.
- Premium remains available through the configured Apple and Google in-app purchase products.
- A sponsoring organization receives no conversation membership, message access, read status, relationship identifier, Coach statistics, encryption key, or account activity.

## Data minimization

While a sponsorship is pending, the table stores only the information necessary to match it safely:

- organization name;
- SHA-256 hash of the normalized recipient email;
- sponsored duration;
- claim status and expiry;
- optional non-personal internal invoice/order reference;
- timestamps.

It never stores the recipient email in plaintext and has no relationship or message columns. The email match hash is erased atomically when the grant is claimed or expires, because it is no longer needed after matching. A claimed grant retains only the minimum entitlement/audit record; its `claimed_by` foreign key becomes `NULL` automatically if the TalkTwo auth account is deleted.

Do not put a recipient name, email address, phone number, conversation identifier or other private user data in `external_reference`. Use a non-personal invoice/order identifier.

## Issuing a sponsorship

Issuance is server/admin only through `create_organization_sponsorship(...)`. The RPC is not executable by `anon` or `authenticated` roles.

Inputs:

- `sponsor_name`: organization display name;
- `recipient`: recipient email, used only to calculate the temporary stored hash;
- `sponsored_months`: 1–24 months;
- `expires_at`: deadline for the recipient to claim the grant;
- `reference`: optional non-personal internal invoice/order reference.

Create sponsorships only after the organization's payment or contractual authorization has been verified outside the mobile app.

## Recipient claim

On verified sign-in, the mobile app calls `claim_my_organization_sponsorships()` before opening Home.

The RPC:

1. requires an authenticated user with a confirmed email;
2. hashes that confirmed email server-side;
3. locks claims for that user to avoid duplicate concurrent redemption;
4. finds only pending, unexpired sponsorships matching that hash;
5. stacks each sponsored period after the later of now, the existing Premium end, or an active trial end;
6. marks each sponsorship claimed atomically and erases the recipient email hash;
7. returns no other recipients or grants.

Expired matching grants are also stripped of the email match hash. The call is idempotent: after all matching grants are claimed, subsequent calls return no rows.

## Revocation

A pending sponsorship may be revoked administratively before it is claimed. Revocation must clear `recipient_email_hash` in the same update; the database lifecycle constraint rejects a non-pending grant that still contains a recipient match hash.

A claimed sponsorship should not be silently clawed back from a user's current entitlement; refunds or contractual corrections need a deliberate admin process and audit trail.

## Account deletion

Claimed sponsorship rows do not retain an email hash. Their `claimed_by` foreign key uses `ON DELETE SET NULL`, so deleting the TalkTwo account removes the remaining direct account link while allowing a minimal non-user-linked sponsorship/audit record to survive where needed for payment or accounting integrity.

Pending sponsorships are external paid/contractual grants that have not yet been attached to a TalkTwo account. They remain matched to the independently supplied recipient email hash until claim, expiry or administrative revocation.

## Store review notes

For store submission, explain that organization-funded access is assigned server-side to eligible accounts, does not expose an alternate consumer checkout inside the app, and that the same Premium functionality is also available through the app's configured in-app purchases. Re-check the current Apple and Google payment rules immediately before submission.
