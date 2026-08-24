# TalkTwo launch blocker matrix

Snapshot: 24 August 2026. This file separates repository work from external decisions/accounts. It does **not** authorize a merge, deployment, purchase, production migration or store submission.

## Account-independent repository state

These items are implemented in the current unmerged release-candidate stack, culminating in `feat/privacy-controls-handoff`, and must stay green in exact-tree QA:

- iOS + Android Expo application with API 36 Android target/compile SDK;
- Free deterministic filter and Premium AI message/document review;
- atomic AI budget reservation/settlement and trial/quota guards;
- account deletion, peer key recovery, Personal Boundaries and encrypted local message storage;
- text-document attachments, private push architecture and Danish/English localization;
- Coach explicit opt-in with owner-only aggregate statistics;
- organization-funded server-assigned Premium without consumer redemption-code UI;
- privacy-safe aggregate delivery acknowledgement that exposes no read/rejection side channel;
- private communication windows/timezones, app/chat/person notification mutes and timed/indefinite member blocks;
- storage-level Personal Boundary enforcement after timed-block resolution for text and text-document messages;
- Premium PDF export from locally visible ordinary messages only;
- store purchase/restore/webhook architecture and recurring entitlement lifecycle;
- public multi-page site source for `/`, `/privacy/`, `/terms/`, `/support/`, `/delete-account/`;
- mobile and public-site release preflights;
- post-deploy account-deletion and SECURITY DEFINER database gates;
- fail-closed production deployment runbook;
- current CI trigger/runtime plus APK and AAB validation;
- single-tree integration merge plan.

## Current blockers that require configuration, credentials or a human decision

### 1. App identity / artwork

Current `app.json` has no final `icon` or Android adaptive-icon assets. A production release must have approved app icon/adaptive icon/splash/store artwork and then pass `npm run release:preflight`.

This is a visual/brand decision, not a coding defect.

### 2. EAS / push credentials

Current `app.json` has no `extra.eas.projectId`. Production push/build setup still requires:

- an EAS project ID;
- APNs credentials for iOS;
- FCM v1 credentials for Android;
- Expo push access token/enhanced-security setup;
- a strong `PUSH_DISPATCH_SECRET`;
- deployment plus scheduling of the push dispatcher.

Do not place these secrets in client/public `EXPO_PUBLIC_*` variables.

### 3. Final mobile environment

The mobile client now reads the same values checked by the native release preflight. Final build configuration must provide:

- `EXPO_PUBLIC_SUPABASE_URL`;
- a current `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` beginning with `sb_publishable_`;
- `EXPO_PUBLIC_TALKTWO_SITE_URL` pointing at the final live HTTPS site.

Secret / service-role Supabase keys are forbidden in the mobile bundle.

### 4. Public domain + publication review

The public site is implemented but intentionally remains in draft mode. Before publication it needs:

- a final HTTPS domain and hosting target;
- final legal entity and postal address;
- support and privacy email addresses;
- reviewed minimum-age/capacity rule;
- reviewed professional-services disclaimer;
- reviewed consumer-rights/liability wording;
- reviewed governing-law/dispute wording;
- reviewed international-transfer disclosure;
- privacy-policy effective date;
- final Supabase public URL + `sb_publishable_...` key;
- explicit `VITE_PUBLICATION_APPROVED=true` only after the intended legal/privacy review.

Then `cd public-site && npm run release:preflight` must return `TalkTwo public-site release preflight OK.` before the site is deployed.

### 5. Public deletion production wiring

The `/delete-account/` browser implementation exists. Production still requires:

- final HTTPS route deployed;
- exact redirect allowlisted in Supabase Auth;
- production magic-link template preserving the requested redirect;
- disposable-account end-to-end deletion test;
- confirmation that unknown email addresses neither create accounts nor disclose account existence;
- confirmation that expired/reused links cannot delete anything.

### 6. Apple / Google store accounts and products

End-to-end billing/store validation still requires the external store setup documented in `STORE_SETUP_CHECKLIST.md`, including developer accounts, agreements/payment profiles, exact product IDs/subscription groups, sandbox/internal testers, signed builds, store notification configuration and provider credentials.

No store product should be considered live merely because its ID exists in source code.

### 7. Production Supabase deployment

The connected production project intentionally does not yet contain the full unmerged release stack. Real launch requires a separately approved deployment following `PRODUCTION_DEPLOYMENT_PLAN.md`:

- backup/recovery point;
- migrations in repository filename order;
- post-migration deletion/security gates;
- current Supabase advisor review;
- Edge Functions from the exact frozen release tree;
- provider secrets;
- disposable-user server smoke tests.

Repository QA/rollback validation is not a substitute for this production gate.

### 8. Brand/domain due diligence

`TalkTwo` is not unique on the public web; unrelated services/projects have used the same name. Before committing store listings, artwork and a public domain, perform the intended domain/trademark/brand-confusion review. Do not infer legal clearance from an empty web search or from source-code use of `talktwo.app`.

### 9. Explicit release authorization

Even a fully green repository does not authorize:

- closing/merging the integration PR;
- applying production migrations;
- deploying Edge Functions or the public site;
- creating paid store products;
- submitting a signed app.

Those are separate release decisions.

## Preferred next boundary

Continue autonomous account-independent fixes while any are found. Once exact-tree QA is green and no further repository blocker is found, the first unresolved product decision is final brand/artwork (and, closely related, final public domain/name due diligence). External account setup can proceed after that without changing the core architecture.
