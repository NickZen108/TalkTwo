# TalkTwo full ownership-transfer runbook

A sale of the product should be treated as an **asset transfer / ownership transfer / technical handover**. If the legal entity itself is sold, it may also be a **change of control**. The technical goal is the same: the buyer can operate, build, deploy, bill, recover and support TalkTwo without relying on the seller's personal accounts.

## Handover principle

Prefer organization/team-owned resources, named environment variables, documented setup and renewable credentials. Avoid source code that depends on a particular person's email address, home machine, local filesystem or private token.

Do not give a buyer a zip file and a password list. Transfer each asset through the provider's supported ownership/team mechanism, then rotate credentials and remove the seller's access.

## Asset categories

The final transfer inventory must include at least:

- source code repository and GitHub organization/team settings;
- Supabase organization/project, database, Edge Functions, secrets, backups and billing;
- Expo/EAS project, builds, credentials and push configuration;
- Apple Developer / App Store Connect app and associated agreements;
- Google Play Console app and associated agreements;
- domain registrar, DNS and TLS/public-site hosting;
- support/privacy email mailboxes and outbound email provider;
- AI/provider accounts and API keys;
- APNs/FCM/Expo push credentials;
- monitoring, error reporting and uptime services;
- billing/store product identifiers and commercial configuration;
- organization-sales/admin tooling;
- privacy/terms/store-review material and records of legal review;
- backups, recovery procedures and incident documentation;
- brand assets, source artwork and trademark/domain records.

## Before a transaction

1. Keep `docs/ASSET_REGISTER.md` current.
2. Ensure production secrets live in provider secret stores rather than source control.
3. Keep setup, migration and deployment procedures in the repository.
4. Keep package/bundle IDs, product IDs and public URLs centrally documented.
5. Ensure at least one clean-machine/operator can reproduce QA without the founder's personal computer.
6. Keep human admin roles separate from machine credentials.
7. Maintain a list of contractual/vendor dependencies and recurring costs.

## Transfer sequence

### 1. Freeze and inventory

Freeze the agreed release commit and record the Git tree. Export/currently verify the asset register, outstanding incidents, dependency advisories, migrations and launch blockers.

### 2. Buyer creates buyer-controlled identities

The buyer should create or nominate its own organization accounts, administrators, billing contacts, recovery contacts and MFA devices. Do not make the buyer permanently dependent on a seller-owned email or phone number.

### 3. Transfer non-secret ownership

Transfer repository/organization access, domain/DNS, store applications, Supabase/Expo organization membership and other provider resources through supported provider workflows.

Where a provider does not support direct transfer, document the supported migration/copy procedure and verify data integrity before cutover.

### 4. Rotate secrets

After buyer control exists, rotate every production credential that the seller or previous operator could know, including:

- Supabase secret/service credentials where applicable;
- AI provider keys;
- push/notification secrets;
- CI/CD tokens;
- webhooks/signing secrets;
- email provider credentials;
- monitoring integrations;
- deployment/provider API tokens.

Publishable client keys are identifiers rather than secrets, but should still be verified against the buyer-controlled project configuration.

### 5. Transfer billing and legal contacts

Move vendor billing, tax/merchant details, payout information, store agreements, support contacts, privacy contacts and data-controller/processor documentation to the buyer's correct legal entity.

A store app transfer and a company/share transaction are separate legal/technical concepts; use the route appropriate to the transaction and current provider rules.

### 6. Prove independent operation

The buyer/operator should independently perform, from buyer-controlled access:

- repository checkout;
- dependency installation;
- complete QA;
- public-site build/preflight;
- staging/sandbox database migration rehearsal;
- Edge Function deployment rehearsal where safe;
- Android/iOS build through the buyer-controlled build account;
- store sandbox billing/restore test;
- push notification test;
- account deletion/recovery smoke test;
- backup restore/recovery exercise appropriate to the platform.

Do not declare technical handover complete merely because ownership labels changed.

### 7. Revoke seller access

After acceptance:

- remove seller from organization/team roles that are not contractually retained;
- revoke old sessions/tokens/keys;
- remove seller recovery email/phone/MFA devices;
- verify no personal mailbox is still a production dependency;
- review audit logs and IAM membership;
- record acceptance date and new responsible owner.

## Data and privacy during sale

A buyer acquiring the service does not automatically need a plaintext export of private conversations. Handle user data according to the transaction structure, privacy notices, contracts and applicable law. Minimize transferred operational data to what is needed for service continuity.

Do not create a special export/decryption mechanism merely to make due diligence easier. Product privacy boundaries remain product privacy boundaries during a sale.

## Current repository transfer-readiness practices

TalkTwo should continue to enforce these conventions:

- public client configuration through environment variables;
- no service-role/private provider secrets in mobile or public-site bundles;
- reproducible migrations in source control;
- fail-closed release preflights;
- documented deployment order and stop conditions;
- organization-neutral role names rather than founder-specific authorization checks;
- exact-tree QA before release/transfer acceptance.
