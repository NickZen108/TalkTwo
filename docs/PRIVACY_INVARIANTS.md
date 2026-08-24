# TalkTwo participant privacy invariants

These rules are product and security invariants, not optional UI preferences. A future client, admin surface or API must not weaken them without an explicit privacy review.

## What another participant may learn

A participant may learn only what is necessary to communicate through the shared relationship, including:

- the neutral public display name and role of another current member;
- messages that TalkTwo actually allows into the conversation and that become available under the recipient's own rules;
- for a message they themselves sent, whether the message has been delivered to the recipient app.

For multi-person chats, aggregate delivery counts may be shown. Recipient-level delivery identities must not be exposed.

## Presence and behavioural metadata that must stay private

Other participants must not be able to learn, directly or by a sender-facing side channel:

- timezone;
- local clock time;
- exact communication-window schedule;
- whether the app is open or the user is online;
- last-seen/activity information;
- whether a message was opened or read;
- when a message was opened;
- whether a recipient rejected a message without opening it;
- whether a recipient blocked the sender;
- whether the recipient muted the app, chat or sender;
- whether TalkTwo rejected a draft before it entered the conversation;
- Coach statistics, personal boundaries, device tokens or key-recovery information.

A sender-visible status is deliberately limited to **Sent** or **Delivered to app**. Delivery is not a read receipt.

## Rejected drafts never become social events

When TalkTwo rejects a draft for tone, symbolic tone, length, boundaries or other sending policy, that event belongs to the author only. The intended recipient must receive no message row, push, counter, status, audit event exposed to them or other indication that an attempted draft existed.

## No symbolic tone

TalkTwo messages do not allow emoji or text emoticons such as `:-)`, `:)`, `<3` or `^_^`, regardless of Free/Premium plan. Symbolic tone can be interpreted sarcastically or contemptuously. Users who want to express a feeling should use words.

This is enforced at more than one layer:

- fast client validation;
- Premium review entry validation;
- an authoritative database trigger for stored messages.

## Neutral public names

Public display names are participant-visible and may appear in notifications or membership screens, so they must not themselves become hostile messages.

Names containing insults, hostile labels, emoji or emoticons are rejected/neutralized. Examples such as `Hader Nicolai` or `Ekskone er sindssyg` must never be emitted as another user's public name. Local aliases that a user creates privately for their own device are not shared with other participants.

New-account creation must not expose the local part of the account email address as an automatic public name. If no suitable public name exists, use a neutral fallback such as `Member` until the account owner supplies a permitted name.

## Blocking

Blocking is an owner-only control. Supported choices are:

- 1 hour;
- 4 hours;
- 24 hours;
- until manually unblocked.

The blocked person is not told that they are blocked. Messages arriving while an active block applies remain unavailable to the blocker; expiry affects future messages rather than retroactively releasing blocked content.

## Notification mutes

Notification choice is separate from message delivery. A user may mute:

- the whole TalkTwo app;
- one relationship/chat;
- one person across shared chats.

Mute state is private. Muting stops alerts, not the underlying message-routing rules. Messages can still become available under the recipient's communication windows so the recipient can check them later when ready.

## Administrative access

Organization, support and platform roles do not gain conversation-content access merely because they administer billing, infrastructure or support. Privileged operational access must follow least privilege, be auditable and remain separate from user-content decryption.
