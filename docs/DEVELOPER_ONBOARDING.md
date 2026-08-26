# Developer/operator onboarding

This is the shortest safe path for a new engineer or operator taking responsibility for TalkTwo.

## 1. Read these first
In order:
1. `docs/START_HERE.md`
2. `docs/PRODUCT_SPEC_V1.md`
3. `docs/PRIVACY_INVARIANTS.md`
4. `docs/ACCESS_ROLE_MODEL.md`
5. `docs/PRODUCTION_DEPLOYMENT_PLAN.md`

Do not start by reading every migration or Edge Function. Understand the product/privacy contract first.

## 2. Repository map
- `src/` — Expo/React Native mobile app, domain rules and client services.
- `supabase/migrations/` — ordered database schema/RPC changes.
- `supabase/functions/` — trusted Edge Functions.
- `supabase/checks/` — post-deployment schema/security gates.
- `tests/` — regression, privacy, billing, migration and release tests.
- `public-site/` — privacy/terms/support/delete-account site.
- `docs/` — product, release, security, store, organisation and handover runbooks.

## 3. Local QA baseline
From a clean checkout:
```sh
npm install
npm run typecheck
npm run typecheck:tests
npm test
npm run layout:check
npm run privacy:check
npx expo-doctor
npm run audit:runtime
```

A local green run is necessary but not sufficient for release. GitHub Actions performs additional native Android/iOS checks.

## 4. Trust boundaries
- Mobile/public clients use publishable Supabase configuration only.
- Never ship `service_role`, OpenAI keys, store signing secrets or provider private credentials in the client.
- `service_role` is a machine credential, not a human admin role.
- SECURITY DEFINER RPCs are treated as security-sensitive APIs: fixed search path, explicit grants and `auth.uid()`/role checks where user-callable.
- A developer role does not imply a product feature for browsing conversation plaintext.
- Do not add timezone/read/rejection/block/mute behavioural metadata to participant-facing APIs.
- Universal symbolic-tone rules (emoji/emoticons) must be enforced at a trusted server boundary, not just in React Native.

## 5. Database work
Before changing Supabase code, review the current Supabase guidance and repository migration ordering.

For exploratory validation against the connected project, use read-only inspection or explicit `BEGIN … ROLLBACK` transactions. Do not leave schema/data changes in production while iterating.

Before a real release, use the exact migration order and gates in `docs/PRODUCTION_DEPLOYMENT_PLAN.md`.

## 6. Edge Functions and AI
- Treat message/context payloads as untrusted input.
- Keep AI storage disabled where supported by the provider configuration.
- Maintain budget reservation/fail-closed behavior.
- AI may assist classification/rewrite, but the database/send path remains authoritative.
- Never let Coach settings change sendability/classification.

## 7. Native app model
TalkTwo uses one shared backend and protocol for both Android and iOS. Cross-platform communication is therefore a backend/account concern, not an Android-vs-iOS chat split.

Before release, physical-device testing must include Android → iOS and iOS → Android message delivery, push behavior, key recovery and store/billing flows.

## 8. Safe change workflow
1. Create a feature branch from the current intended stack.
2. Make one coherent change.
3. Add regression tests, especially for privacy/security invariants.
4. Validate migrations safely.
5. Open a draft PR.
6. Run exact-tree QA before release.
7. Do not merge/deploy merely because the feature PR is mergeable.

## 9. When to stop and ask an owner/security reviewer
Stop for:
- a change that weakens privacy boundaries;
- any need to expose service credentials;
- irreversible production/store actions;
- a proposed admin feature that can reveal conversation plaintext;
- unclear legal/store-policy requirements;
- migration drift or failed schema gates;
- changes to account ownership, billing or deletion semantics.

A new developer should be able to get to a green local QA run and explain the trust model before receiving production write access.