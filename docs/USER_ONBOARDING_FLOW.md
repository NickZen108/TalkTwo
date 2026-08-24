# User onboarding flow

TalkTwo onboarding should feel like joining a private chat, not configuring a case-management system.

## Success target
A new user should be able to reach the first usable conversation with no technical vocabulary and no more than a few meaningful decisions.

## Flow
1. **Choose language and understand the three rules.** The sign-in screen explains that invitations are controlled, sensitive communication can be opened on the user's terms, and private appearance/preferences remain local where possible.
2. **Sign in by email link.** No password creation is required.
3. **Create or accept a conversation.** A new account has a single primary action to start a chat. An invitation deep link should land on a clear accept flow.
4. **Optional quiet controls.** Message windows and notifications are optional. The default path must not force users to configure a schedule before they can chat.
5. **Write the first message.** The composer explains blocking reasons to the author. Emoji/emoticons are universally unavailable; rejected drafts remain invisible to the intended recipient.
6. **Learn advanced features only when needed.** Premium, extra people, observer access, exports, Personal Boundaries and key recovery belong in contextual screens rather than the critical first-run path.

## Privacy expectations taught during onboarding
- No automatic read receipts.
- Other participants do not see timezone, local clock, exact communication windows, block/mute state or rejected draft attempts.
- A sender may see only Sent/Delivered-to-app state, never whether the message was opened.
- Push alerts contain no message text or sender name.
- Public display names must be neutral.

## UX rules
- Avoid legal/technical vocabulary in the main path.
- Prefer one primary action per empty state.
- Do not require Premium purchase during onboarding.
- Do not request notification permission before explaining why it is useful.
- Do not force message-window setup.
- Do not show infrastructure concepts such as encryption keys unless recovery is actually required.
- Errors should say what the user can do next.

## Acceptance checklist
A usability tester who has never seen TalkTwo should be able to answer these after onboarding:
- How do I start or join a chat?
- Can the other person see when I read something? **No.**
- Can the other person see my timezone or quiet settings? **No.**
- What happens if TalkTwo blocks my draft? **Only I see the rejection and explanation.**
- Can I turn notifications off and still receive messages? **Yes.**

The current app already has sign-in onboarding and a one-action empty chat state. Physical iOS/Android usability testing remains required before store submission.