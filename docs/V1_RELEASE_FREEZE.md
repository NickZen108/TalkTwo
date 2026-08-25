# TalkTwo v1 release-freeze criteria

TalkTwo v1 is **not currently feature-frozen**. The current phase is a systematic launch audit of the account-independent code and configuration. The purpose is to inspect the complete v1 surface area once, area by area, and fix concrete, well-founded launch/security/privacy/billing defects before declaring the repository ready to freeze.

This document defines the criteria for the **future** freeze. It does not authorize endless speculative refactoring: audit findings should have a concrete failure mode, violated invariant, broken core flow, material privacy/security risk, billing risk, release-platform risk or testable launch benefit.

## Current audit rule

During the systematic audit, changes are appropriate when they address a concrete issue such as:

- account takeover, credential/secret exposure or unsafe auth/deep-link behavior;
- conversation plaintext/private recipient data exposure contrary to documented invariants;
- destructive data loss/corruption;
- incorrect, duplicate or unauthorized billing/entitlement changes;
- unauthorized relationship/message/key access;
- a broken documented core v1 flow on iOS or Android;
- configuration likely to make a signed production build unsafe or rejectable;
- a reproducible privacy/security/UX defect that materially affects launch use;
- a stale release/deployment assumption that could cause an unsafe launch.

Avoid broad refactors, architecture churn or cosmetic cleanup without a concrete benefit. Every substantive defect fix should get targeted regression coverage when practical.

## When the freeze becomes active

Activate the v1 freeze only after:

1. auth/deep links, cryptography/local storage, database/RLS/RPC trust boundaries, messaging/privacy controls, AI, billing/store lifecycle, push, deletion/recovery, native/public-site configuration, UX/accessibility/dark mode and release/handover have each received a deliberate audit pass;
2. no known concrete account-independent launch defect remains unresolved;
3. `feat/privacy-controls-handoff` and `qa/full-stack-20260824` are exact identical trees;
4. the exact candidate completes the full QA workflow green in a normal runner execution (a pre-checkout `steps=null` failure is neither green nor a code failure).

Once those conditions are met, record the exact freeze SHA in PR #41 and this document.

## Rules after freeze

After the freeze, only a demonstrated P0/P1 launch defect may change v1 code.

### P0
- account takeover or credential/secret exposure;
- plaintext/private recipient setting exposure;
- destructive data loss/corruption;
- incorrect/unauthorized billing or entitlement changes;
- unauthorized relationship/message/key access;
- crash/build failure preventing the release from functioning.

### P1
- documented core v1 flow broken on a supported launch platform;
- App Store / Google Play rejection or unsafe signed-build defect;
- regression of an existing privacy invariant;
- exact-tree QA finding a concrete defect rather than an external runner/account failure.

Any post-freeze fix should include targeted regression coverage and trigger a new exact-tree QA run.

## After repository freeze

Remaining work is release execution:

- final brand/name/domain decision and due diligence;
- final icon/adaptive icon/splash/store artwork;
- final HTTPS site plus AASA/assetlinks;
- EAS/APNs/FCM/Expo credentials and signed-device builds;
- reviewed public/legal configuration;
- Apple/Google developer accounts, products and sandbox/internal tests;
- explicitly approved Supabase/public-site/function deployment and production smoke tests.

## Safety boundary

Neither the current audit nor the future freeze authorizes merge, production migration, deployment, paid-product activation or store submission. Those remain explicit release decisions.
