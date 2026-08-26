# TalkTwo public site

This folder contains the account-independent source for TalkTwo's store-facing public support surface. It is **not deployed by this repository**.

## Routes

The Vite production build includes:

- `/` — public landing page;
- `/privacy/` — Privacy Policy;
- `/terms/` — Terms of Service;
- `/support/` — support information;
- `/delete-account/` — authenticated external account-deletion flow;
- `/app/` — static privacy-minimized browser fallback for verified mobile app links.

Privacy, Terms, Support and the landing page can be built in draft mode during ordinary CI. They display a visible publication warning until every required reviewed field is configured **and** `VITE_PUBLICATION_APPROVED=true` is deliberately supplied. This prevents a technically successful build from being mistaken for legal/publication approval.

## Verified mobile app-link fallback

Production mobile links use the final site origin under `/app/...`, for example `/app/auth`, `/app/invite/<token>` and `/app/recover-key/<token>`. A signed iOS/Android app should claim those URLs through Universal Links / verified App Links. If the app is not installed or platform verification does not open it, the web host must rewrite **only** the `/app/*` namespace to the built `/app/index.html` fallback while preserving the requested URL in the browser.

The fallback is deliberately static. It contains no JavaScript, analytics, forms, external resources or code that reads `location.hash` / `location.search`. It uses `no-referrer`, `noindex` and a restrictive Content Security Policy. Do not add analytics, tag managers, error-reporting SDKs or a redirect script to this page. Invitation, recovery and Premium-gift possession secrets live in URL fragments specifically so they are not sent to the web server.

The PKCE auth callback is different: Supabase returns a short-lived `code` in the query string, but the device-local verifier is required to exchange it. Hosting/access logs should still be minimized and protected; do not deliberately record or forward `/app/*` query strings to analytics.

Platform association files are deployment configuration, not generic source placeholders:

- `/.well-known/apple-app-site-association` must use the final Apple Team ID + `com.talktwo.app` and scope app links to `/app/*`;
- `/.well-known/assetlinks.json` must use `com.talktwo.app` and the SHA-256 fingerprint of the actual Android release signing certificate.

Do not create these with guessed, debug or example trust identifiers.

## External account deletion

The deletion page uses the browser Supabase client with the public/publishable key only.

Flow:

1. User enters the email already attached to an existing TalkTwo account.
2. `signInWithOtp` requests a magic link with `shouldCreateUser: false`.
3. The response shown in the browser is intentionally the same whether the address exists or not, to reduce account enumeration.
4. The magic link redirects back to `/delete-account/` and establishes a browser session.
5. The page validates the current user with `auth.getUser()`.
6. The user must explicitly type `DELETE`.
7. The authenticated browser calls the existing `delete-account` Edge Function with `{ confirmation: 'DELETE' }`.
8. The Edge Function performs the authoritative JWT/user check and permanent account deletion.

The page never contains or accepts a Supabase service-role key.

## Local build

```sh
cd public-site
cp .env.example .env
npm install
npm run build
```

Ordinary draft-mode builds do not require final legal values.

## Publication preflight

Before deploying a store-facing build, fill the final reviewed environment values and run:

```sh
npm run release:preflight
npm run build
```

The publication preflight requires the final Supabase public configuration, legal entity/address, support/privacy contacts, minimum-age/capacity rule, professional-services wording, consumer-rights text, governing-law text, international-transfer disclosure, privacy effective date, and explicit `VITE_PUBLICATION_APPROVED=true`.

Only the Supabase publishable key belongs in this browser build. Never place the service-role key, OpenAI key, store secrets, signing keys or other private credentials in `VITE_*` variables.

## Final deployment gate

Before the public site can be treated as launch-ready:

- obtain appropriate final legal/privacy review and set `VITE_PUBLICATION_APPROVED=true` only after that review;
- run the public-site release preflight successfully;
- deploy the built static site over HTTPS at the final public domain;
- configure a host-level rewrite from `/app/*` to the static `/app/index.html` fallback without adding client-side secret parsing, analytics or redirects;
- serve and externally verify the final Apple AASA and Android asset-links files using the actual signing identities;
- configure the exact final `/app/auth` callback and `/delete-account/` URL in Supabase Auth's allowed redirect URLs;
- verify the production magic-link email templates preserve the requested redirect URLs;
- test mobile PKCE login and each `/app/*` link family on signed iOS and Android builds;
- test an existing account end-to-end, including actual deletion, only with an intentionally disposable store-test account;
- verify an unknown email does not reveal account existence and is not auto-created;
- verify an expired/reused magic link cannot delete anything;
- verify the built bundle contains no service-role or other private key;
- verify all public routes and the `/app/*` fallback work without redirects to missing pages;
- only then enable `EXPO_PUBLIC_TALKTWO_SITE_URL` in the mobile release build and enter the final URLs in App Store Connect / Google Play Console.

No deploy or production deletion should be performed as part of ordinary repository QA.
