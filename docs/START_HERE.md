# TalkTwo — start here

This is the shortest entry point into TalkTwo. Pick the role that matches why you are here; do not read the whole repository first.

## I am a TalkTwo user
Start with `docs/USER_ONBOARDING_FLOW.md`.

Goal: sign in, create or accept one private conversation, understand message windows and privacy, and send the first practical message without needing technical knowledge.

## I represent a municipality, family centre, clinic or other sponsoring organisation
Start with `docs/ORGANIZATION_ADMIN_ONBOARDING.md`.

Goal: understand what the organisation pays for, issue or manage sponsored Premium safely, and know exactly which user data the organisation can and cannot access.

## I am a developer or operator
Start with `docs/DEVELOPER_ONBOARDING.md`.

Goal: get the repository running, understand the trust boundaries, run the full QA suite, rehearse migrations safely and know the release stop conditions before touching production.

## I am a new owner or buyer
Start with `docs/NEW_OWNER_ONBOARDING.md`, then use `docs/HANDOVER_RUNBOOK.md` and `docs/ASSET_REGISTER.md` during the actual transfer.

Goal: gain independent control of source, infrastructure, billing, stores, domains, credentials and recovery without inheriting a dependency on the previous owner's personal accounts.

## Non-negotiable privacy rule for every role
Administrative access is not conversation access. Organisation admins, support staff, developers and platform owners do not receive a normal product feature for browsing private conversation plaintext, recipient read/open state, rejection state, blocks, mutes, timezones or communication-window schedules.

Machine credentials such as Supabase `service_role` are not human roles. Never place them in mobile/public clients or use them as a substitute for a least-privilege admin workflow.

## Canonical references
- Product behaviour: `docs/PRODUCT_SPEC_V1.md`
- Privacy invariants: `docs/PRIVACY_INVARIANTS.md`
- Human/admin roles: `docs/ACCESS_ROLE_MODEL.md`
- Production release: `docs/PRODUCTION_DEPLOYMENT_PLAN.md`
- Store readiness: `docs/STORE_SETUP_CHECKLIST.md` and `docs/STORE_SUBMISSION_PACK.md`
- Ownership transfer: `docs/HANDOVER_RUNBOOK.md`
- Assets/accounts: `docs/ASSET_REGISTER.md`

If two documents disagree, stop and reconcile the contradiction before release or handover.