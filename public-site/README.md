# TalkTwo public site

This folder contains account-independent source for the public TalkTwo support surface. It is **not deployed by this repository**.

## External account deletion

The implemented page is intended to be served at:

`https://talktwo.app/delete-account/`

It uses the browser Supabase client with the public/publishable key only.

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

Required build variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPPORT_EMAIL`

Only the Supabase publishable key belongs in this browser build. Never place the service-role key, OpenAI key, store secrets, signing keys or other credentials in `VITE_*` variables.

## Final deployment gate

Before the page can be treated as launch-ready:

- choose/configure the real support email;
- deploy the built static site over HTTPS at the final public domain;
- configure `https://talktwo.app/delete-account/` in Supabase Auth's allowed redirect URLs;
- verify the production magic-link email template preserves the requested redirect URL;
- test an existing account end-to-end, including actual deletion, only with an intentionally disposable store-test account;
- verify an unknown email does not reveal account existence and is not auto-created;
- verify an expired/reused magic link cannot delete anything;
- verify the page contains no service-role or other private key in source/network bundles;
- publish final privacy/support/terms pages and replace all `{{...}}` placeholders in `docs/public/`;
- add working privacy/support/terms links inside the mobile app only after the public URLs are live;
- enter the final account-deletion URL in Google Play Console.

No deploy or production deletion should be performed as part of ordinary repository QA.
