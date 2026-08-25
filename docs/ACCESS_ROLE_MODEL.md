# TalkTwo access and administrative role model

## Terminology

The overall model is **RBAC (Role-Based Access Control)** inside an **IAM (Identity and Access Management)** design. Human administrative interfaces are commonly called an **admin portal**, **admin console**, **operations console** or **back office**.

TalkTwo should separate roles by purpose. `service_role` is a machine credential used by trusted backend processes; it is not a human job role and must never be placed in a browser-based admin portal.

## Recommended human roles

### Platform owner

Business ownership and high-level account control. Can manage platform administrators and major commercial settings. This should be a small break-glass role, protected with strong MFA and audit logging.

It does **not** imply a feature for reading user conversations.

### Platform administrator

Operates the service: release state, provider configuration, aggregate service health, abuse-resistant account support and billing integration. Access is limited to what the operational task requires.

Do not expose message plaintext, conversation keys, personal boundaries, Coach statistics, read/open metadata or participant timezones through this role.

### Support agent

Handles user support with the minimum useful account metadata, for example account ID, membership status, subscription state, app version and technical error identifiers. Support must not browse message content.

High-risk account actions should require re-authentication, a reason code and an audit event.

### Organization / sponsor administrator

For municipalities, family centres, clinics, employers or similar organizations that pay for access. This is a tenant-like role and can be called `organization_sponsor_admin` or `organization_billing_admin`.

Allowed scope should be limited to:

- organization identity and billing contacts;
- sponsorship/entitlement creation and status;
- recipient matching/claim state where legally justified;
- invoices/contract metadata;
- aggregate commercial reporting that does not reveal conversation behaviour.

It must not provide access to:

- conversations or message content;
- message open/read/reject state;
- blocks or notification mutes;
- exact communication windows or timezones;
- Personal Boundaries or Coach statistics;
- device tokens, encryption keys or recovery envelopes.

An organization paying for Premium does not become a participant in the user's private relationship.

### Auditor / security reviewer

Read-only access to security-relevant configuration and audit events needed for review. No conversation plaintext or decryption capability.

## Architecture rule

Human authorization should be represented by explicit server-side roles/permissions, preferably in trusted application metadata or dedicated authorization tables. Do not authorize from user-editable profile metadata.

Every privileged action should have:

1. explicit permission check;
2. least-privilege data response;
3. reason/context where appropriate;
4. immutable audit event;
5. no reusable backend secret exposed to the browser.

## Separate admin application

A municipality/organization portal and an internal TalkTwo operations console should be separate surfaces, even if they share backend infrastructure. The organization portal is customer-facing multi-tenant software. The operations console is internal and more privileged.

Do not put a hidden "developer mode" in the consumer app. Administrative access should use dedicated authentication, dedicated routes/applications and narrowly scoped backend endpoints.

## No god-mode conversation reader

TalkTwo should deliberately avoid implementing a generic human role that can browse all conversation plaintext. Infrastructure administrators may necessarily control systems and deploy code, but the product should not turn that operational power into an everyday data-browsing feature.

Where operational access to sensitive production systems is unavoidable, use MFA, short-lived access, audit logs, separation of duties and documented break-glass procedures.
