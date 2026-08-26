# Delete your TalkTwo account — DRAFT

> **Not for publication yet.** The external authenticated deletion flow is implemented in `public-site/delete-account/`, but it must still be deployed over the final HTTPS domain, configured in Supabase Auth and tested end to end with a disposable account before Google Play submission.

**Planned public URL:** `https://talktwo.app/delete-account/`

TalkTwo users can permanently delete their account at any time.

## Delete from the app

If you can sign in to TalkTwo:

1. Open **Account & privacy**.
2. Open **Delete TalkTwo account**.
3. Read the deletion information.
4. Type the confirmation word shown by the app.
5. Confirm permanent deletion.

## Delete without the app

The source under `public-site/delete-account/` provides the same authenticated deletion capability for people who no longer have the app installed.

The implemented external flow:

1. asks for the email address used for TalkTwo;
2. requests a TalkTwo magic sign-in link with account creation disabled;
3. deliberately shows the same request result whether the address belongs to an account or not, reducing account-enumeration leakage;
4. requires the user to follow the verified link and establish a valid TalkTwo session;
5. verifies the current authenticated user before exposing permanent deletion;
6. explains what deletion does and requires the user to type `DELETE`;
7. calls the same authenticated `delete-account` Edge Function used by the mobile app;
8. never deletes an account merely because someone typed its email address into a form.

Before publication, the final `/delete-account/` HTTPS URL must be allowlisted as a Supabase Auth redirect, the production magic-link template must preserve that redirect, and an end-to-end deletion must pass with an intentionally disposable account. Unknown emails must neither create accounts nor reveal whether an account exists.

## What deletion removes

Deletion is designed to remove:

- the TalkTwo authentication account and profile;
- conversation memberships and account settings;
- communication-window and related account preferences;
- server-side message data involving the deleted account;
- the deleted account's decrypted local messages and conversation keys on the current device when deletion is initiated there.

Other conversation participants may still have messages they already opened and stored on their own devices. TalkTwo cannot remotely erase private local data stored on another person's device.

## Purchases and subscriptions

Deleting a TalkTwo account does **not** cancel an Apple App Store or Google Play subscription. To stop future billing, cancel the subscription through the relevant store account.

TalkTwo may retain limited pseudonymized purchase-integrity or security records when genuinely necessary for fraud prevention, accounting, disputes or legal obligations. The final public privacy policy must describe the concrete retention rules in force at launch.

## Need help?

Contact `{{SUPPORT_EMAIL}}`.

Do not send private conversation content unless it is necessary to explain a support problem.
