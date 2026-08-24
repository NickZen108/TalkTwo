# New owner / buyer onboarding

This is the executive/technical entry point for a person or company taking full control of TalkTwo.

The target state is **independent operation**: the new owner can build, deploy, bill, recover, support and govern TalkTwo without relying on the previous owner's personal email, phone, machine, MFA device or API tokens.

## Phase A — understand what you are buying
Read:
1. `docs/PRODUCT_SPEC_V1.md`
2. `docs/PRIVACY_INVARIANTS.md`
3. `docs/ACCESS_ROLE_MODEL.md`
4. `docs/ASSET_REGISTER.md`
5. `docs/HANDOVER_RUNBOOK.md`

Confirm which legal entity, IP, domains, store apps, infrastructure accounts, contracts and user-data responsibilities are part of the transaction.

## Phase B — appoint four responsibilities
One person may hold more than one role in a small company, but the responsibilities should be explicit:
- **Business owner** — commercial decisions, legal entity, pricing and contracts.
- **Platform owner/admin** — infrastructure and access governance.
- **Release operator/developer** — builds, migrations, Edge Functions and QA.
- **Privacy/security contact** — privacy requests, incidents, access reviews and policy changes.

Do not make a municipality/customer organisation a platform owner merely because it buys many subscriptions.

## Phase C — create buyer-controlled identities
Before transfer:
- company-controlled primary email/domain;
- GitHub organisation admins;
- Supabase organisation admins/billing;
- Expo/EAS organisation/admin identities;
- Apple Developer/App Store Connect roles;
- Google Play Console roles;
- domain registrar/DNS admins;
- AI/provider billing/admin account;
- support/privacy mailboxes;
- recovery contacts and MFA owned by the buyer.

Avoid permanent dependencies on a seller's personal identity.

## Phase D — transfer assets
Follow `docs/HANDOVER_RUNBOOK.md` and track every item in `docs/ASSET_REGISTER.md`.

For each asset record:
- previous owner/account;
- new owner/account;
- transfer method;
- billing owner;
- recovery contacts;
- MFA owner;
- transfer date;
- verification evidence;
- whether old access has been revoked.

## Phase E — rotate and prove control
Rotate every secret known to the previous operator. Then prove the buyer can independently:
- clone/install/test the repository;
- run complete QA;
- rehearse database migrations safely;
- deploy/rehearse Edge Functions in an appropriate non-production/safe environment;
- build Android and iOS from buyer-controlled credentials;
- test cross-platform messaging;
- test notifications;
- test store sandbox purchase/restore;
- perform account recovery/deletion smoke tests;
- restore from backup/recovery procedures as appropriate.

If the buyer cannot do these things without the seller, handover is not complete.

## Phase F — privacy/data-controller review
A sale must not be used as a reason to build a master conversation-decryption portal. The service can transfer operational responsibility while preserving the same privacy boundaries users were promised.

Review and update as legally appropriate:
- privacy notice/data-controller identity;
- terms/legal entity;
- support/privacy contact;
- processor/subprocessor register;
- international transfer information;
- retention/deletion responsibilities;
- store privacy disclosures.

## Phase G — acceptance and seller removal
Technical acceptance requires:
- asset register complete;
- buyer-controlled billing/recovery/MFA;
- secrets rotated;
- full QA green on the accepted tree;
- buyer-operated release rehearsal completed;
- public/store/legal metadata reconciled;
- seller sessions/tokens/roles removed except any explicitly contracted transition access.

Record the acceptance date, accepted Git commit/tree, responsible owner and any remaining transition obligations.

## One-page test
A new owner should be able to answer **yes** to all of these:
- Can we build both iOS and Android without the seller?
- Can we operate Supabase and deploy migrations/functions safely?
- Can we receive store revenue and pay every provider from our accounts?
- Do we control domain, support/privacy email and recovery MFA?
- Can we rotate all production secrets?
- Can we recover from an incident/backup?
- Do we know which staff/admin roles can see which data?
- Can we remove the seller today without breaking production?

Any **no** is a handover blocker, not a documentation footnote.