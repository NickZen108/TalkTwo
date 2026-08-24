# TalkTwo

TalkTwo is a private, low-conflict messaging app for conversations that deserve more care. The repository contains the Expo mobile client, Supabase migrations/Edge Functions, privacy-focused local storage, store billing integration, public account-deletion site source, and launch QA.

## Development

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

Native QA also prebuilds iOS/Android, verifies permissions and builds Android release artifacts through GitHub Actions.

## Release gates

Do not treat a successful local build as deployment approval. The current launch stack is intentionally kept in draft PRs and must not be merged or deployed merely because it compiles.

Use `docs/PRODUCTION_DEPLOYMENT_PLAN.md` as the fail-closed release runbook. In particular:

- freeze and validate the exact release tree;
- apply migrations in order;
- require the account-deletion and SECURITY DEFINER schema gates;
- deploy Edge Functions from the same frozen commit with the documented JWT/custom-auth boundaries;
- complete disposable-account, billing, push and public-site smoke tests;
- run `npm run release:preflight` only with final release environment values;
- complete Apple/Google account configuration and internal testing before submission.

The preflight is expected to fail until the final HTTPS site, real publishable key, EAS project ID and approved app/adaptive icon assets are configured.

See also `docs/STORE_SETUP_CHECKLIST.md` and `docs/STORE_SUBMISSION_PACK.md`.
