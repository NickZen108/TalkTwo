# TalkTwo account deletion

TalkTwo offers permanent account deletion inside the signed-in app under **Account & privacy**.

## What deletion removes

- the TalkTwo authentication account and profile;
- chat memberships, settings and message-window preferences;
- server-side encrypted message rows involving the deleted account;
- the deleted account's decrypted local messages and conversation keys on the current device.

Other participants may retain messages they already opened and stored on their own devices. A TalkTwo account cannot remotely erase another person's private local storage.

## Purchases and records

Deleting a TalkTwo account does not itself cancel an Apple App Store or Google Play subscription. The user must cancel the subscription in the relevant store to stop future charges. TalkTwo stops renewing app access for a deleted payer and preserves only pseudonymized store records required for payment integrity. A paid gift or already-paid beneficiary period is not destroyed merely because its purchaser deletes their TalkTwo account.

## External deletion page

The public support site should expose a **Delete my TalkTwo account** page before store submission. It must use email magic-link verification to create a valid TalkTwo session and then call the same authenticated `delete-account` Edge Function used by the app. It must not accept deletion based only on an email address typed into a form.

The final public URL belongs in Google Play's Data safety account-deletion field and in TalkTwo's privacy policy/support material once the support domain has been selected.
