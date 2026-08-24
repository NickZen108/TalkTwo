# TalkTwo v1 product specification

## Purpose
TalkTwo is a private messaging channel for people who need low-conflict communication, initially focused on separated and divorced parents.

The central rule is simple:

> If a sentence does not help the recipient know what happened, what is needed, or what practical action comes next, it probably does not belong in the message.

TalkTwo deliberately discourages criticism, emotional unloading, generalisations, sarcasm, insults and other material likely to escalate conflict.

## Account and relationships
- Email-based sign-in is the initial authentication method.
- A user can connect to multiple other users through separate relationships.
- Invitations use a shareable link that can be sent through SMS, email or another app.
- One user may pay Premium for the other user.
- Organisations can fund Premium without access to message content. Organisation-funded access is assigned server-side to a verified account; the consumer app does not use an activation-code or alternate-payment field.
- Public display names must be neutral. Hostile labels, insults, emoji and emoticons are rejected/neutralized before they can be shown to other users.
- A new account must not expose the local part of its email address as an automatic public display name.

## Universal message rules
These rules apply to Free, trial and Premium messages.
- No emoji.
- No text emoticons such as `:-)`, `:)`, `<3` or `^_^`.
- Users who want to communicate feelings must use words rather than symbolic tone.
- A draft rejected by TalkTwo remains private to its author; the intended recipient gets no message, alert, counter or indication that the attempt existed.

## Free plan
- Strict local rule-based filtering. No AI calls.
- Maximum 160 characters per message.
- No profanity.
- No exclamation marks.
- Block common generalisations such as always/never.
- Block criticism, personal attacks, accusatory questions and common emotional-reaction phrases.
- Block excessive capital letters.
- Every rejection clearly explains to the author what triggered it and how to rewrite it.
- Multiple separate relationships are allowed.
- Communication windows are supported.

The free version should be genuinely useful rather than intentionally crippled.

## Premium plan
Indicative pricing:
- Individual: 59 DKK/month.
- Two-person plan: 99 DKK/month.
- Annual two-person plan: 799 DKK/year.

Trial:
- 7 days.
- Maximum 25 AI message analyses per user per day.
- If the AI quota is reached, the strict local free filter remains available.

Premium adds:
- Maximum 480 characters per message.
- AI analysis using the current message plus up to 10 recent messages as context.
- Green / yellow / red classification.
- Optional Coach.
- Calm rewrite suggestions.
- Personal Boundaries with up to 10 user-defined blocked words or phrases, subject to anti-abuse rules.
- PDF export over a selected period or entire visible history.
- Text-document attachments, scanned for conflict content before delivery.

## Risk levels
### Green
The message is practical, neutral and necessary. It may be sent.

### Yellow
The message may be conflict-provoking but does not meet the blocking threshold. Examples include using children as rhetorical support in a dispute.

Before opening a yellow message, Premium recipients may see a warning and choose either:
- Read message
- Reject without reading

If the recipient rejects it, that decision is private to the recipient. The sender must not be told that the message was rejected or whether it was opened.

### Red
The message cannot be sent. The author receives a clear explanation. If Coach is enabled, Premium can offer a calmer rewrite. The intended recipient must not learn that the rejected draft existed.

## Communication windows
- Each recipient controls their own availability schedule, similar to business opening hours.
- Different schedules may be configured for different weekdays.
- Timezone is detected automatically but can be changed manually by the owner.
- Timezone, local clock time and exact communication-window schedule are private routing data and are not shown to other participants.
- Messages may be written and sent outside the recipient's window, but remain inaccessible until the next window opens.
- No push notification is sent before the window opens.
- Outside the window the recipient may manually use a Check waiting messages action. If messages are waiting, the recipient may voluntarily open them early.
- No emergency bypass in v1.

## Delivery and editing
- Push notifications never contain message text.
- A sender may see only whether a message is Sent or Delivered to the recipient app. Delivery is not a read receipt.
- A sender must not be shown open/read state, opening time, recipient rejection, recipient blocking, mute state, online state or last-seen information.
- In multi-person chats, delivery may be shown as an aggregate count, not recipient-level behavioural identities.
- Users communicate acknowledgment naturally by replying if they choose.
- A sender may edit or withdraw a message only while the server still records it as unopened, but that internal rule must not reveal the recipient's open state to the sender.
- Once opened, the message is immutable.

## Blocking and notification control
Blocking and notifications are separate owner-only controls.

Blocking choices:
- 1 hour;
- 4 hours;
- 24 hours;
- until manually unblocked.

The blocked person is not told that they are blocked. Messages arriving during an active block remain unavailable to the blocker; expiry governs future messages rather than becoming a behavioural signal to the sender.

Notifications can be muted for:
- the whole app;
- one chat/relationship;
- one person across shared chats.

Muting does not stop message routing. Messages still become available under the recipient's communication-window rules, but no matching alert is generated. Mute state is private.

## Attachments
Free: no attachments.

Premium:
- UTF-8 plain-text `.txt`, `.md`, `.markdown` and `.csv` documents only in the first attachment release.
- No images, audio or video.
- The original file must be at most 5 MB. Normalized readable text is limited to 60,000 Unicode characters and 20 logical pages, calculated as 3,000 characters per page or explicit form-feed page breaks, whichever is greater.
- Entire extracted document text is scanned in one server review. Document content is treated as untrusted data, not AI instructions.
- If any disallowed passage is found, the entire document is blocked.
- The triggering passage is shown to the author only.
- Approved text is encrypted with the conversation key and follows the same communication-window, unopened-rejection, withdrawal and local-cache lifecycle as a message. The original file is not uploaded to object storage.
- Documents cannot be edited after sending. A sender can withdraw one only while it remains unopened.
- Recipients do not see the file name or text before opening. Personal Boundaries are enforced over the full document at send time.

## Personal Boundaries
Premium only.
- Up to 10 blocked words or phrases.
- The feature is visible but disabled in Free.
- Matching uses complete normalized words, ignores capitalisation and punctuation, and applies to new or edited messages while the recipient has active Premium or trial access.
- Essential logistics words such as child, school, doctor or emergency cannot be blocked on their own, preventing the feature becoming a communication weapon.
- If a draft is rejected because of a personal boundary, the author is told which word or phrase caused the rejection; the intended recipient receives no indication that the draft existed.

## Coach
Premium only and opt-in.
- Calm, short, respectful and non-therapeutic tone.
- May advise whenever enabled.
- Can suggest a practical rewrite.
- Can show only the user's own aggregate statistics, including percentage of attempts blocked.
- Never compares one partner's score against another's.
- Coach statistics do not store message text, relationship IDs or partner scores.

## Exports
Premium users can export locally visible ordinary message history to PDF for a chosen date interval or the entire visible history.

Export includes:
- ordinary text messages
- sender and recipient/conversation context
- dates and timestamps
- app branding and selected interval

Export excludes:
- unopened or locally unavailable messages
- blocked drafts
- withdrawn messages
- text-document attachment contents
- AI judgments
- AI scores
- private Coach advice

The generated PDF is readable and unencrypted. The app warns the user before creating it and uses the device share sheet instead of uploading the PDF to TalkTwo.

## Privacy principles
- Local-first message history where feasible.
- Minimise central retention.
- Server stores only what is necessary for routing, account state, undelivered messages and synchronization.
- AI analysis only occurs for Premium/trial users and should use the minimum contextual data needed.
- Participants learn as little behavioural metadata about one another as practical: no timezone, local time, exact windows, read/open state, rejection state, block/mute state, online state or rejected-draft attempts.
- Organisations paying for accounts get no access to conversations, relationship identifiers or private user statistics.
- Pending organisation sponsorships store only a one-way hash of the normalized recipient email, not the recipient email in plaintext.
- Administrative roles follow least privilege and do not gain conversation plaintext merely because they administer billing, support or infrastructure.

## Internationalisation
- UI architecture supports many languages from the start.
- English is the fallback language.
- Premium AI can support more message languages than the UI may officially localise.
- Free semantic filtering must be quality-tested language by language.
- Unsupported free-filter languages still receive universal checks such as character limits and symbolic-tone restrictions, with a clear notice that semantic filtering is limited.

## v1 deliberately excludes
- Voice messages
- Images
- Video
- Emergency bypass
- Automatic read receipts
- Online/last-seen presence
- Participant-visible timezone/local-time information
- Shared calendars
- Therapy or mediation functionality
- Organisation access to private conversations
- Human admin roles that can routinely browse conversation plaintext
