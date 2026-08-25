# TalkTwo launch blocker matrix

Snapshot: 25 August 2026. This file separates repository work from external decisions/accounts. It does **not** authorize a merge, deployment, purchase, production migration, brand rename or store submission.

## Account-independent repository state

These items are implemented in the current unmerged audit stack, culminating in `feat/privacy-controls-handoff`, and must stay green in exact-tree QA:

- iOS + Android Expo application with API 36 Android target/compile SDK;
- Free deterministic filter and Premium AI message/document review;
- atomic AI budget reservation/settlement and trial/quota guards;
- account deletion, peer key recovery, Personal Boundaries and encrypted local message storage;
- SQLCipher is required at runtime for the local message database and Android app-data backup is disabled;
- new server message rows retain ciphertext + verification metadata rather than conversation plaintext after trusted send-time checks complete;
- unopened recipient APIs hide both ciphertext and deterministic verification hashes until the user explicitly opens the message;
- mobile magic-link authentication uses PKCE rather than importing access/refresh credentials from redirect URLs;
- public account-deletion login is explicitly PKCE, disables account creation and re-verifies the current authenticated user before deletion;
- auth, invitation, member, recovery and Premium-gift links share one fail-closed app-link boundary: development may use `talktwo://`, while a configured release origin uses same-origin HTTPS `/app/...` links only;
- production public-site configuration accepts a canonical HTTPS origin only rather than silently discarding a configured path/query/port;
- invitation/member/recovery possession tokens are fragment-only and stale path/query bearer forms fail closed;
- relationship invitation key material is bound to the invitation + relationship and concurrent key creation is serialized;
- text-document attachments, private push architecture and Danish/English localization;
- Coach explicit opt-in with owner-only aggregate statistics;
- organization-funded server-assigned Premium without consumer redemption-code UI;
- privacy-safe aggregate delivery acknowledgement that exposes no read/rejection side channel;
- private communication windows/timezones, app/chat/person notification mutes and timed/indefinite member blocks;
- storage-level Personal Boundary enforcement after timed-block resolution for text and text-document messages;
- Premium PDF export from locally visible ordinary messages only;
- store purchase/restore/webhook architecture and recurring entitlement lifecycle;
- observer → participant write-access upgrade requires fresh unanimous approval and verified native subscription replacement, including cross-store rejection and provider replacement-identity checks;
- interrupted observer → participant checkout can resume safely and its unanimously approved membership snapshot is frozen when checkout starts;
- key recovery revalidates current active relationship membership at approval, fulfillment and retrieval time so a removed participant cannot use an unexpired stale request;
- public multi-page site source for `/`, `/privacy/`, `/terms/`, `/support/`, `/delete-account/` and privacy-safe `/app/*` fallback;
- mobile and public-site release preflights;
- post-deploy account-deletion and SECURITY DEFINER database gates;
- fail-closed production deployment runbook through `20260824120000_key_recovery_membership_revalidation.sql`;
- WCAG-oriented palette contrast checks and >=44pt core mobile interaction targets protected by layout regression gates;
- current CI trigger/runtime plus APK and AAB validation;
- single-tree integration merge plan;
- finite systematic audit matrix in `docs/SYSTEMATIC_V1_AUDIT.md` defining the stop rule for broad repository hardening.

## Current blockers that require configuration, credentials or a human decision

### 1. Final brand / product name / artwork

`TalkTwo` has public name collisions. Final brand selection is intentionally unresolved before store metadata, public domain, verified-link ownership and artwork are frozen.

Current `app.json` also has no final `icon` or Android adaptive-icon assets. A production release must have approved app icon/adaptive icon/splash/store artwork and then pass `npm run release:preflight`.

Do not mechanically rename stable package/bundle/store identifiers merely because the display brand changes; make that a deliberate migration decision.

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
- `EXPO_PUBLIC_TALKTWO_SITE_URL` set to the canonical final live HTTPS **origin** (no path/query/fragment/nonstandard port) and therefore defining the only accepted production origin for `/app/auth`, `/app/invite`, `/app/member`, `/app/recover-key` and `/app/premium-gift` links.

If `EXPO_PUBLIC_TALKTWO_SITE_URL` is present but invalid, the app-link builder/parser fails closed rather than falling back to a custom scheme. Secret / service-role Supabase keys are forbidden in the mobile bundle.

### 4. Public domain + publication review + verified app links

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

The same final HTTPS host must also be proven as the native app-link owner before a production build can pass mobile preflight:

- iOS `associatedDomains` must contain `applinks:<final-host>`;
- the host must serve a valid `/.well-known/apple-app-site-association` bound to the final Apple Team ID + `com.talktwo.app`, scoped to the intended `/app/*` routes;
- Android must contain an `autoVerify` HTTPS intent filter for the same host with `pathPrefix: "/app/"`;
- the host must serve a valid `/.well-known/assetlinks.json` bound to `com.talktwo.app` and the SHA-256 certificate fingerprint of the actual release signing key;
- Supabase Auth must allow the final `/app/auth` redirect;
- signed-device smoke tests must prove that valid links open the app and look-alike domains/custom-scheme links cannot silently replace the verified production route.

Then `cd public-site && npm run release:preflight` must return `TalkTwo public-site release preflight OK.` before the site is deployed, and the mobile `npm run release:preflight` must also pass against the final native configuration.

### 5. Public deletion production wiring

The `/delete-account/` browser implementation exists. Production still requires:

- final HTTPS route deployed;
- exact redirect allowlisted in Supabase Auth;
- production magic-link template preserving the requested redirect;
- disposable-account end-to-end PKCE deletion test on the same browser/device that requested the link;
- confirmation that unknown email addresses neither create accounts nor disclose account existence;
- confirmation that expired/reused links cannot delete anything.

### 6. Apple / Google store accounts and products

End-to-end billing/store validation still requires the external store setup documented in `STORE_SETUP_CHECKLIST.md`, including developer accounts, agreements/payment profiles, exact product IDs/subscription groups, sandbox/internal testers, signed builds, store notification configuration and provider credentials.

Observer and participant extra-member products must support the documented native replacement flow; no store product should be considered live merely because its ID exists in source code.

### 7. Production Supabase deployment

The connected production project intentionally does not yet contain the full unmerged release stack. Real launch requires a separately approved deployment following `PRODUCTION_DEPLOYMENT_PLAN.md`:

- backup/recovery point;
- migrations in repository filename order through the final frozen tree;
- post-migration deletion/security gates;
- current Supabase advisor review;
- Edge Functions from the exact frozen release tree;
- provider secrets;
- disposable-user server smoke tests, including stale-member key-recovery rejection and observer→participant replacement.

Repository QA/rollback validation is not a substitute for this production gate.

### 8. Exact-tree QA runner

An earlier exact tree completed the full native QA workflow green. Hosted Actions on newer checkpoints have terminated before checkout with `steps=null` for both QA jobs. The eventual final audit/frozen SHA still needs one normal complete QA run green. A pre-checkout hosted-runner/account failure is an external execution blocker, not code validation either way.

### 9. Explicit release authorization

Even a fully green repository does not authorize:

- closing/merging the integration PR;
- applying production migrations;
- deploying Edge Functions or the public site;
- creating/activating paid store products;
- renaming the production brand/identifiers;
- submitting a signed app.

Those are separate release decisions.

## Preferred next boundary

Use `docs/SYSTEMATIC_V1_AUDIT.md` as the finite repository finish line. Once every account-independent row is REVIEWED/FIXED and the final consistency pass is complete, **stop broad speculative hardening**. Remaining work is final brand selection, exact-tree QA, external account/domain/artwork/legal/store configuration and explicit release execution. A real QA/code defect can reopen its specific audit row; merely imagining another possible improvement cannot.
