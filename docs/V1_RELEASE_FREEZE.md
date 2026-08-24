# TalkTwo v1 release freeze

TalkTwo v1 is **feature-frozen** on the `feat/privacy-controls-handoff` release-candidate stack.

The purpose of this freeze is to stop moving the finish line. Passing exact-tree QA and completing external release configuration are still required, but ordinary refactoring, speculative hardening and new product ideas do not belong in v1 anymore.

## What may break the freeze

Only a demonstrated launch-critical defect may change v1 code:

### P0
- account takeover or credential/secret exposure;
- conversation plaintext or private recipient settings exposed contrary to the documented privacy invariants;
- destructive data loss/corruption;
- incorrect or unauthorized billing/entitlement changes;
- a security bypass that permits unauthorized relationship/message/key access;
- an app crash or build failure that prevents the release from functioning at all.

### P1
- a documented core v1 flow is broken on a supported launch platform;
- a code/configuration defect would cause App Store / Google Play rejection or make a signed production build unsafe;
- a regression violates an existing v1 privacy invariant;
- exact-tree QA finds a concrete defect rather than an external runner/account failure.

Any fix that breaks the freeze must include a targeted regression test and must be followed by a new exact-tree QA run.

## What goes to v1.1 instead

Unless it fixes a P0/P1 issue above, defer it to v1.1. Examples:

- new features or additional product modes;
- aesthetic/UX refinements that do not block a core flow;
- speculative security improvements without a demonstrated v1 vulnerability;
- broad refactors or cleanup of harmless dormant code;
- additional languages or wider linguistic/filter tuning;
- new analytics, admin, reporting or organization-portal functionality;
- performance work without a demonstrated launch blocker.

## Current v1 finish line

Repository work is complete when:

1. `feat/privacy-controls-handoff` and `qa/full-stack-20260824` are exact identical trees;
2. the exact frozen tree completes the full QA workflow green;
3. no unresolved P0/P1 code defect remains.

After that, remaining work is **release execution**, not continued product development:

- final brand/name/domain decision and due diligence;
- final app icon/adaptive icon/splash/store artwork;
- final HTTPS site plus AASA/assetlinks configuration;
- EAS/APNs/FCM/Expo credentials and signed device builds;
- reviewed public/legal configuration;
- Apple/Google developer accounts, products and sandbox/internal tests;
- explicitly approved Supabase/public-site/function deployment and production smoke tests.

## Safety boundary

This freeze does not authorize merging, production migrations, deployment, paid-product activation or store submission. Those remain explicit release decisions.
