# TalkTwo organisation admin portal — v1

This is the intended self-service surface for municipalities, family centres, clinics and similar sponsors **after the manual organisation onboarding flow has been proven with real customers**.

It is deliberately a small commercial/admin portal, not a case-management or monitoring system.

## Primary jobs
An authorised Organisation/Sponsor Administrator can:
- sign in with organisation-controlled identity and MFA;
- see their own organisation name, contract/account state and authorised admins;
- request/create sponsored TalkTwo entitlements within an approved commercial limit;
- see sponsorship state: pending, active/claimed, expired or revoked where applicable;
- see duration, commercial/external reference and billing/admin metadata owned by the organisation;
- revoke an unclaimed/pending sponsorship when allowed;
- export organisation-owned invoice/admin records;
- reach support.

## Explicitly absent
The portal has no capability to:
- search or read messages/attachments;
- see chat or relationship activity;
- see whether a user opened, rejected, blocked or muted anything;
- see timezone, local time or exact communication windows;
- see AI reviews, blocked drafts, Coach data or Personal Boundaries;
- obtain conversation keys or message ciphertext for decryption;
- impersonate an end user;
- access arbitrary Supabase tables or dashboards;
- receive `service_role` or other infrastructure credentials.

## Identity and roles
Use organisation-scoped RBAC, not email-domain guessing.

Initial roles:
- **Organisation Owner** — manages organisation admins and commercial account settings.
- **Sponsorship Admin** — manages sponsorships within the organisation's approved limits.
- **Billing Viewer** — read-only access to organisation-owned invoices/billing metadata.

A person may hold more than one role. Roles are attached to a server-side organisation membership and must never be inferred from editable user metadata.

Require MFA before the portal is treated as production-ready.

## Tenant isolation
Every organisation-owned record carries an immutable organisation ID. Every human portal request is bound to the authenticated user's active organisation membership.

Do not implement tenant isolation as `TO authenticated` alone. User-callable database/API operations must additionally prove membership and permitted role for the target organisation.

Organisation A must not be able to enumerate organisation B, its administrators, sponsorships, references or billing metadata.

## Recipient data minimisation
Where the sponsor needs to nominate a recipient:
- normalise the submitted email only for matching;
- hash it server-side for the pending entitlement flow;
- do not expose the stored hash to portal users;
- do not retain plaintext recipient email in the sponsorship record merely for convenience;
- after claim/expiry, minimise matching data according to the sponsorship lifecycle/privacy rules.

If a future contract requires the organisation itself to retain a named roster, that roster should be designed as organisation-owned administrative data with its own legal basis/retention policy rather than silently broadening TalkTwo conversation data.

## Commercial guardrail
Do not give an organisation unlimited entitlement issuance by default. Before self-service issuance is enabled, the commercial model must define at least one server-enforced limit such as:
- prepaid seat/month balance;
- contractual monthly sponsorship cap;
- purchase-order budget; or
- operator-approved entitlement batch.

If no enforceable commercial limit exists yet, portal v1 should allow **requests** rather than immediate paid entitlement creation.

## Audit log
Record organisation-admin actions such as:
- admin added/removed/role changed;
- sponsorship requested/created/revoked;
- commercial limit changed;
- export generated.

Audit records should contain actor, organisation, action, target administrative record, outcome and timestamp — not conversation content.

## Support model
Support sees technical/admin metadata only by default. If escalation requires user-supplied evidence, collect the minimum necessary data and never turn that exception into a general conversation browser.

## First-customer rollout
Do not block consumer launch on this portal.

For the first organisation customers, use the documented manual server-administered sponsorship process. Build/enable self-service after real contract and workflow requirements are known, while preserving this privacy boundary.

Canonical references:
- `docs/ORGANIZATION_ADMIN_ONBOARDING.md`
- `docs/ACCESS_ROLE_MODEL.md`
- `docs/PRIVACY_INVARIANTS.md`
- `docs/CONFIGURATION_INVENTORY.md`
