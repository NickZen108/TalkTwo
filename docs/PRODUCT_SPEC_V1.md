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
- Organisations can buy activation codes without access to message content.

## Free plan
- Strict local rule-based filtering. No AI calls.
- Maximum 160 characters per message.
- No emoji or emoticons.
- No profanity.
- No exclamation marks.
- Block common generalisations such as always/never.
- Block criticism, personal attacks, accusatory questions and common emotional-reaction phrases.
- Block excessive capital letters.
- Every rejection clearly explains what triggered it and how to rewrite it.
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
- PDF export over a selected period or entire history.
- Text-document attachments, scanned for conflict content before delivery.

## Risk levels
### Green
The message is practical, neutral and necessary. It may be sent.

### Yellow
The message may be conflict-provoking but does not meet the blocking threshold. Examples include using children as rhetorical support in a dispute.

Before opening a yellow message, Premium recipients may see a warning and choose either:
- Read message
- Reject without reading

If rejected, the sender is told that the recipient rejected the message without reading it.

### Red
The message cannot be sent. The sender receives a clear explanation. If Coach is enabled, Premium can offer a calmer rewrite.

## Communication windows
- Each recipient controls their own availability schedule, similar to business opening hours.
- Different schedules may be configured for different weekdays.
- Timezone is detected automatically but can be changed manually.
- Connected users can see each other's current communication windows and relevant timezone difference.
- Messages may be written and sent outside the recipient's window, but remain inaccessible until the next window opens.
- No push notification is sent before the window opens.
- Outside the window the recipient may manually use a Check waiting messages action. If messages are waiting, the recipient may voluntarily open them early.
- No emergency bypass in v1.

## Delivery and editing
- Push notifications never contain message text.
- A delivered message has a received/delivered status, but no automatic read receipt.
- Users communicate acknowledgment naturally by replying if they choose.
- A sender may edit or withdraw a message only while the server still records it as unopened.
- Once opened, the message is immutable.

## Attachments
Free: no attachments.

Premium:
- UTF-8 plain-text `.txt`, `.md`, `.markdown` and `.csv` documents only in the first attachment release.
- No images, audio or video.
- The original file must be at most 5 MB. Normalized readable text is limited to 60,000 Unicode characters and 20 logical pages, calculated as 3,000 characters per page or explicit form-feed page breaks, whichever is greater.
- Entire extracted document text is scanned in one server review. Document content is treated as untrusted data, not AI instructions.
- If any disallowed passage is found, the entire document is blocked.
- The triggering passage is shown to the sender.
- Approved text is encrypted with the conversation key and follows the same communication-window, unopened-rejection, withdrawal and local-cache lifecycle as a message. The original file is not uploaded to object storage.
- Documents cannot be edited after sending. A sender can withdraw one only while it remains unopened.
- Recipients do not see the file name or text before opening. Personal Boundaries are enforced over the full document at send time.

## Personal Boundaries
Premium only.
- Up to 10 blocked words or phrases.
- The feature is visible but disabled in Free.
- Matching uses complete normalized words, ignores capitalisation and punctuation, and applies to new or edited messages while the recipient has active Premium or trial access.
- Essential logistics words such as child, school, doctor or emergency cannot be blocked on their own, preventing the feature becoming a communication weapon.
- If a message is rejected because of a personal boundary, the sender is told which word or phrase caused the rejection.

## Coach
Premium only and opt-in.
- Calm, short, respectful and non-therapeutic tone.
- May advise whenever enabled.
- Can suggest a practical rewrite.
- Can show only the user's own statistics, including percentage of attempts blocked.
- Never compares one partner's score against another's.

## Exports
Premium users can export sent message history to PDF for a chosen date interval or the entire history.

Export includes:
- sent messages
- sender/recipient
- dates and timestamps
- app branding and selected interval

Export excludes:
- blocked drafts
- AI judgments
- AI scores
- private Coach advice

## Privacy principles
- Local-first message history where feasible.
- Minimise central retention.
- Server stores only what is necessary for routing, account state, undelivered messages and synchronization.
- AI analysis only occurs for Premium/trial users and should use the minimum contextual data needed.
- Organisations paying for accounts get no access to conversations or private user statistics.

## Internationalisation
- UI architecture supports many languages from the start.
- English is the fallback language.
- Premium AI can support more message languages than the UI may officially localise.
- Free semantic filtering must be quality-tested language by language.
- Unsupported free-filter languages still receive universal checks such as character limits and formatting restrictions, with a clear notice that semantic filtering is limited.

## v1 deliberately excludes
- Voice messages
- Images
- Video
- Emergency bypass
- Automatic read receipts
- Shared calendars
- Therapy or mediation functionality
- Organisation access to private conversations
