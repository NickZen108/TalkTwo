# Delete your TalkTwo account — DRAFT

> **Not for publication yet.** This page describes the intended external deletion flow. The public web implementation must be completed and tested before Google Play submission.

**Planned public URL:** `https://talktwo.app/delete-account`

TalkTwo users can permanently delete their account at any time.

## Delete from the app

If you can sign in to TalkTwo:

1. Open **Account & privacy**.
2. Open **Delete TalkTwo account**.
3. Read the deletion information.
4. Type the confirmation word shown by the app.
5. Confirm permanent deletion.

## Delete without the app

The public website must provide the same authenticated deletion capability for people who no longer have the app installed.

The external flow must:

1. ask for the email address used for TalkTwo;
2. send a TalkTwo magic sign-in link to that address;
3. require the user to follow the verified link and establish a valid TalkTwo session;
4. show exactly what deletion does before asking for final confirmation;
5. call the same authenticated account-deletion backend used by the mobile app;
6. never delete an account merely because someone typed its email address into a form.

`{{IMPLEMENT_EXTERNAL_MAGIC_LINK_DELETION_FLOW_BEFORE_PUBLICATION}}`

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
