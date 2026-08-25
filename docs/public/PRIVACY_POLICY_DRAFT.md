# TalkTwo Privacy Policy — DRAFT

> **Not for publication yet.** Replace every `{{...}}` field, verify the final production data flows and SDK versions, and obtain appropriate legal/privacy review before publishing or submitting TalkTwo to an app store.

**Last updated:** 24 August 2026

TalkTwo is a private communication service designed to help people slow down difficult conversations. This policy explains what information TalkTwo processes, why it is processed, how it is protected, and the choices available to users.

## 1. Who is responsible

**Service:** TalkTwo  
**Developer / data controller:** `{{LEGAL_ENTITY}}`  
**Postal address:** `{{POSTAL_ADDRESS}}`  
**Privacy contact:** `{{PRIVACY_EMAIL}}`

Questions about privacy or data rights can be sent to the privacy contact above.

## 2. Information TalkTwo processes

Depending on the features you use, TalkTwo processes:

- **Account information:** email address, account/user ID, display name, language preference and authentication records.
- **Conversation membership and settings:** conversation IDs, participant/observer roles, invitations and approvals, message-window settings, blocking state, local-feature configuration and subscription entitlements.
- **Messages and documents:** message text and supported plain-text document contents are processed transiently at the trusted send/review boundary when needed to apply TalkTwo's communication rules, Premium AI review and recipient Personal Boundaries. The release design removes plaintext from a new `messages` row in the database trigger before the row is persisted; the durable message row keeps encrypted content plus necessary hashes and operational metadata such as sender/recipient IDs, timestamps, availability state and risk level.
- **Encrypted message data:** TalkTwo encrypts message content for delivery and stores decrypted copies locally on a user's device after they become visible. This ciphertext-at-rest design must not be described as zero-knowledge or universal end-to-end encryption: TalkTwo's trusted backend processes plaintext during send-time policy enforcement, and Premium AI review sends selected plaintext to the configured AI provider when the user requests that feature.
- **AI review data:** when a Premium user requests message or document review, the submitted text and limited recent conversation context may be sent to the configured AI provider so the requested review can be produced. Current production code is designed to send these requests with provider-side storage disabled (`store: false`).
- **Coach data:** if Premium Coach is enabled, TalkTwo stores the user's own aggregate counts of reviewed attempts and green/yellow/red outcomes. These statistics do not contain message text and are not used to compare conversation partners.
- **Purchase and entitlement information:** product IDs, store transaction/subscription identifiers and status needed to verify purchases, restore access, handle refunds and prevent fraud. TalkTwo does not receive payment-card details from Apple or Google.
- **Organization-funded access:** when an organization funds Premium access, TalkTwo may temporarily store a one-way hash of the recipient's normalized verified email to match the grant. The match hash is designed to be erased after the grant is claimed or expires. The sponsor does not receive conversation membership, messages, read/open status, Coach statistics or encryption material.
- **Notifications:** if the user opts in, TalkTwo stores the device push token needed to deliver private notifications. Notification text is designed not to contain message text, sender names or document names.
- **Feedback/support:** information a user deliberately provides in feedback or support requests.
- **Security and operational data:** limited technical records needed for authentication, abuse prevention, purchase integrity, service reliability and security. The exact production diagnostics/SDK data collection must be re-audited against the signed release build before publication.

TalkTwo does not intentionally request access to contacts, photos, camera, microphone, precise/coarse location, SMS/call logs or advertising identifiers for its core service.

## 3. Why information is processed

TalkTwo uses information to:

- create and secure accounts;
- deliver and synchronize conversations;
- enforce participant roles, approvals, communication windows, blocking and message states;
- provide user-requested Free/Premium conflict review and optional Coach functionality;
- provide, verify and restore paid access;
- send optional privacy-minimized notifications;
- respond to feedback and support requests;
- prevent abuse, fraud and unauthorized access;
- comply with legal obligations and enforce service terms where applicable.

The final published policy must identify the applicable legal bases for each processing purpose in jurisdictions where that is required.

## 4. Service providers and data sharing

TalkTwo does not sell personal data or use it for cross-app advertising or tracking.

Information may be processed by service providers that are necessary to operate the service, currently expected to include:

- **Supabase** for authentication, database and backend/edge-function infrastructure;
- **OpenAI** for user-requested Premium AI message/document review;
- **Expo** and the underlying Apple/Google push infrastructure for optional push notifications;
- **Apple App Store / Google Play** for purchases, subscription events and entitlement verification.

Only the information necessary for the relevant service should be provided. The final published policy must verify the actual production providers, regions, contracts/subprocessors and transfer safeguards in force at launch.

A sponsoring organization that pays for a user's Premium access is not given access to that user's private TalkTwo conversations or activity merely because it is the sponsor.

## 5. Local device data

TalkTwo deliberately keeps some information local to the user's device, including decrypted visible messages, conversation keys and local appearance preferences such as aliases, bubble colours and backgrounds. The native release configuration requires SQLCipher for the local database and uses device-protected SecureStore for database keys, authentication sessions and conversation secrets. The app fails closed rather than opening the local message cache if SQLCipher is unavailable. Android app-data backup is disabled for the release configuration.

Deleting the app or losing a device may affect locally held information. Other conversation participants may retain messages they have already opened and securely stored on their own devices.

## 6. Retention and deletion

For newly inserted message rows in the release design, TalkTwo applies required send-time policy checks before persistence and then stores ciphertext rather than message plaintext in the `messages` table. Legacy rows from earlier schema versions retain a separate plaintext-scrubbing lifecycle as a migration/compatibility safeguard. Different operational, security, hash/metadata and purchase-integrity records may need different retention periods.

A signed-in user can permanently delete their TalkTwo account from **Account & privacy → Delete account**. Account deletion is designed to remove the authentication account, profile, memberships, settings and server-side message data involving that account, and to remove that account's decrypted local messages and conversation keys from the current device.

TalkTwo cannot remotely erase copies of messages already opened and stored on another participant's device. Certain pseudonymized purchase/security records may be retained where genuinely necessary for fraud prevention, accounting, dispute handling or legal obligations; the final published version must state the concrete retention rules in force at launch.

Deleting a TalkTwo account does not itself cancel an Apple App Store or Google Play subscription. Store subscriptions must be cancelled through the relevant store to stop future billing.

The public account-deletion page will be available at `{{ACCOUNT_DELETION_URL}}` before Google Play submission.

## 7. User choices and rights

Users can, depending on the feature and applicable law:

- turn optional notifications off;
- enable or disable Premium Coach;
- choose communication-window settings;
- block another member privately;
- export selected locally visible ordinary messages to a readable PDF after an explicit warning that the exported file is not encrypted by TalkTwo;
- delete their account;
- contact `{{PRIVACY_EMAIL}}` to ask about applicable access, correction, objection, restriction, portability, consent-withdrawal or deletion rights.

## 8. Security

TalkTwo uses HTTPS/TLS for data in transit and is designed around encryption, least-privilege backend access, authenticated database functions, fail-closed encrypted local storage and data minimization. No online service can guarantee absolute security.

Users should protect access to their email account and device because TalkTwo uses passwordless email sign-in and local device storage.

## 9. Children

`{{AGE_POLICY_AND_MINIMUM_AGE}}`

The launch team must set and legally review the minimum-age/children policy before publication and ensure App Store/Google Play age-rating and data declarations match it.

## 10. International processing

`{{INTERNATIONAL_TRANSFER_DISCLOSURE}}`

Complete this section after confirming production hosting regions, service-provider locations and applicable transfer mechanisms.

## 11. Changes to this policy

TalkTwo may update this policy when the service, providers or legal requirements change. Material changes should be communicated appropriately, and the current public version should always show its effective date.

## 12. Contact

Privacy questions: `{{PRIVACY_EMAIL}}`  
General support: `{{SUPPORT_EMAIL}}`
