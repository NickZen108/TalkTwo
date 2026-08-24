# Organisation administrator onboarding

For municipalities, family centres, clinics, employers and similar organisations that fund TalkTwo access.

## What this role is
The organisation is a **sponsor/payer**, not a participant in the private conversation unless an individual employee is separately invited as a normal TalkTwo member under the ordinary unanimous-approval rules.

The human role is an **Organisation/Sponsor Administrator**. The access model is RBAC (Role-Based Access Control) with least privilege.

## What an organisation admin should be able to do
- create or request sponsored Premium entitlements for verified recipient accounts;
- see sponsorship status, duration, commercial reference and aggregate billing/usage administration needed for the contract;
- revoke a still-pending sponsorship when appropriate;
- export invoices/administrative records when that commercial feature exists;
- contact TalkTwo support without sending conversation content.

## What the organisation must not be able to see
- conversation messages or attachments;
- conversation encryption keys;
- relationship/chat identifiers except where strictly necessary for an explicitly invited participant role;
- read/open state or timestamps;
- whether a recipient rejected a message;
- blocked drafts or AI classifications belonging to users;
- block or mute settings;
- timezone, local clock or exact communication windows;
- Personal Boundaries;
- Coach text or private Coach statistics;
- local aliases, themes or other device-local presentation preferences.

Paying for access does not grant monitoring rights.

## Recommended first-time workflow
1. Organisation signs a commercial/data-processing arrangement appropriate to the service and identifies its authorised sponsor administrators.
2. TalkTwo creates/approves the organisation account or controlled admin identity. Require MFA when the admin portal is implemented.
3. Admin receives a short role summary and confirms: **I administer sponsorships, not conversations.**
4. Admin supplies the recipient identifier through the approved workflow. The mobile consumer app does not expose organisation activation-code or alternative-payment UI.
5. Backend creates a server-assigned sponsorship. Pending matching uses the normalized verified-email hash rather than retaining plaintext recipient email in the sponsorship table.
6. Recipient signs in with the verified email; the mobile app claims the entitlement automatically.
7. Organisation admin sees only the administrative outcome needed to manage the sponsorship.

## Admin portal v1 requirements
The dedicated organisation portal is a future operational surface; do not expose Supabase dashboards or `service_role` to customers as a shortcut.

When built, it should have:
- organisation-scoped authentication and MFA;
- role-scoped API endpoints rather than direct unrestricted table access;
- a small dashboard: sponsored accounts, pending/active/expired/revoked state, period, external reference and billing status;
- an audit log for administrator actions;
- no message-search screen and no decrypt/export feature;
- explicit privacy copy on every recipient-management screen;
- export limited to organisation-owned commercial/admin data.

## Support handoff
If an organisation reports a technical problem, collect the smallest reproducible technical facts: account/sponsorship reference, app version, platform, approximate time and error wording. Do not ask for screenshots containing private conversation text unless absolutely necessary and voluntarily supplied.

## Offboarding an organisation administrator
- remove their human admin role;
- revoke active sessions/tokens;
- preserve required organisation audit records under the applicable retention policy;
- do not change end-user conversation access merely because an organisation staff member leaves.

Canonical access rules: `docs/ACCESS_ROLE_MODEL.md` and `docs/PRIVACY_INVARIANTS.md`.