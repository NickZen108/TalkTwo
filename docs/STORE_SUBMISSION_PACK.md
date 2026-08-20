# TalkTwo store submission pack

Status: account-independent draft for Apple App Store and Google Play. Re-check every declaration against the release binary, production Supabase configuration and current SDK privacy manifests immediately before submission.

## Store identity

| Field | Value |
|---|---|
| App name | TalkTwo |
| Apple bundle ID | `com.talktwo.app` |
| Google package | `com.talktwo.app` |
| Primary category | Social Networking / Communication |
| Secondary category | Lifestyle |
| Default locale | English (UK) |
| Danish locale | Danish |
| Support URL | `https://talktwo.app/support` — must be live before submission |
| Privacy policy URL | `https://talktwo.app/privacy` — must be live before submission |
| Terms URL | `https://talktwo.app/terms` — must be live before subscriptions are submitted |
| Account deletion URL | `https://talktwo.app/delete-account` — authenticated deletion path, must be live before Google Play submission |

## English listing copy

### Apple

- Subtitle: `Calmer private conversations`
- Promotional text: `Slow difficult conversations down. Review tone, choose when messages can arrive, and keep personal boundaries and chat appearance under your control.`
- Keywords: `communication,relationships,conflict,reflection,messages,boundaries,private,calm`

### Google Play short description

`Pause, review and share difficult messages with the people you choose.`

### Full description

TalkTwo is a calmer space for conversations that deserve more care.

Write privately with one person or a small group. TalkTwo helps slow the exchange down, gives you control over when messages can appear, and lets you choose whether to open a potentially sensitive message.

What you can do:

- Invite only the people you choose.
- Require everyone already in a chat to approve an extra member before access or payment begins.
- Keep unopened text hidden until you choose to read it.
- Reject a flagged message without opening it.
- Block someone privately so their future messages remain unreadable to you.
- Set local nicknames, bubble colours and conversation backgrounds that only you see.
- Export messages already visible on your device when you intentionally want a readable PDF copy.
- Use Premium AI review for longer drafts and additional reflection support.

TalkTwo uses passwordless email sign-in. Extra-member access renews monthly only: read-only observer access is 29 DKK/month and writing access is 99 DKK/month. Prices shown by the App Store or Google Play are authoritative for your storefront. Subscriptions renew automatically unless cancelled through your store account. Access continues until the end of a paid period where applicable.

TalkTwo supports calmer communication. It is not emergency, medical, legal or crisis support.

## Danish listing copy

### Apple

- Undertitel: `Ro til svære samtaler`
- Salgstekst: `Sæt tempoet ned i svære samtaler. Tjek tonen, vælg hvornår beskeder må komme frem, og behold kontrollen over dine egne grænser.`
- Nøgleord: `kommunikation,relationer,konflikt,refleksion,beskeder,grænser,privat,ro`

### Google Play kort beskrivelse

`Sæt tempoet ned, og del svære beskeder med de mennesker, du vælger.`

### Fuld beskrivelse

TalkTwo er et roligere sted til samtaler, der fortjener mere omtanke.

Skriv privat med én person eller en lille gruppe. TalkTwo hjælper med at sætte tempoet ned, giver dig kontrol over, hvornår beskeder må komme frem, og lader dig vælge, om du vil åbne en potentielt følsom besked.

Du kan blandt andet:

- Invitere præcis de mennesker, du vælger.
- Kræve enstemmig godkendelse, før et ekstra medlem får adgang eller kan betale.
- Holde uåbnet tekst skjult, til du vælger at læse den.
- Afvise en markeret besked uden at åbne den.
- Blokere privat, så fremtidige beskeder fra personen ikke kan læses af dig.
- Vælge lokale kaldenavne, boblefarver og baggrunde, som kun du ser.
- Eksportere beskeder, der allerede er synlige på din enhed, når du bevidst ønsker en læsbar PDF-kopi.
- Bruge Premium AI-gennemgang til længere kladder og ekstra refleksion.

TalkTwo bruger login via e-mail-link uden adgangskode. Adgang for ekstra medlemmer fornyes kun månedligt: læseadgang koster 29 kr./måned, og skriveadgang koster 99 kr./måned. Prisen i App Store eller Google Play gælder for din butik. Abonnementer fornyes automatisk, indtil de opsiges via din butikskonto. Adgang fortsætter som udgangspunkt til slutningen af den betalte periode.

TalkTwo understøtter roligere kommunikation. Appen er ikke akut-, læge-, juridisk eller krisehjælp.

## Products and subscription groups

| Capability | Apple product ID | Google product ID | Type | Danish reference price | Store grouping |
|---|---|---|---|---:|---|
| Individual Premium | `com.talktwo.premium.individual.monthly` | `premium_individual_monthly` | Monthly auto-renewing subscription | 59 DKK | TalkTwo Premium |
| Premium for two | `com.talktwo.premium.two.monthly` | `premium_two_monthly` | Monthly auto-renewing subscription | 99 DKK | TalkTwo Premium |
| Premium for two | `com.talktwo.premium.two.annual` | `premium_two_annual` | Annual auto-renewing subscription | 799 DKK | TalkTwo Premium |
| Extra observer | `com.talktwo.extra.observer.monthly` | `extra_observer_monthly` | Monthly auto-renewing subscription | 29 DKK | TalkTwo Extra Access |
| Extra participant | `com.talktwo.extra.participant.monthly` | `extra_participant_monthly` | Monthly auto-renewing subscription | 99 DKK | TalkTwo Extra Access |
| One-month Premium gift | `com.talktwo.premium.gift.1m` | `premium_gift_1m` | One-time product | 59 DKK | Non-consumable managed entitlement |

Configuration notes:

- Do not create annual base plans or offers for either extra-member product.
- The two extra-member tiers belong in the same store subscription group so an observer can upgrade to participant without overlapping access.
- The Premium gift is not a subscription and must never auto-renew.
- Store price and billing period must appear next to the purchase action; the store-returned localized price is authoritative.
- Explain automatic renewal and how to cancel before every subscription purchase.
- Do not offer payment for an extra member until every current chat member has approved.

## Draft Apple App Privacy answers

This is a working matrix, not a submission shortcut. Apple requires the answers to cover TalkTwo and every third-party SDK in the release build.

| Data type | Collected | Linked to identity | Tracking | Purpose / notes |
|---|---:|---:|---:|---|
| Email address | Yes | Yes | No | Passwordless authentication, invitations, gift recovery |
| Name | Yes | Yes | No | Account display name and conversation membership |
| User ID | Yes | Yes | No | Account, security, entitlements and abuse prevention |
| Messages / user content | Yes | Yes | No | Core messaging, moderation choices and user-requested AI review |
| Customer support content | Yes | Yes | No | Feedback and support requests |
| Purchase history | Yes | Yes | No | Verify purchases, restore access, refunds and fraud prevention |
| Payment card details | No | No | No | Handled by Apple/Google, not TalkTwo |
| Precise/coarse location | No | No | No | Not requested |
| Contacts, photos, audio, camera | No | No | No | Permissions are blocked in the release configuration |
| Advertising identifiers | No | No | No | No advertising or cross-app tracking |
| Diagnostics | Verify | Verify | No | Re-check Expo, Supabase and store SDK manifests/configuration in the exact release binary |

## Draft Google Play Data safety answers

- Account creation: yes, by passwordless email link.
- Account deletion: in-app initiation exists in PR #25; a separately authenticated public web path is still required before submission.
- Data shared for advertising: no.
- Cross-app tracking: no.
- Data encrypted in transit: yes, through HTTPS/TLS; do not describe the whole product as end-to-end encrypted.
- Deletion request handling: delete authentication and user-associated data unless retention is legally/security required; pseudonymize retained purchase-integrity records.
- Collected categories: personal info (email/name/user ID), messages and other user content, app interactions required for product operation, and purchase history.
- Optional vs required: email and account identifiers are required; message content is required to use messaging; purchases and feedback are optional.
- Re-run the Data safety form from the final release binary and production data flows. The developer remains responsible for complete and accurate declarations.

## Reviewer notes

1. TalkTwo uses a magic-link sign-in. Provide App Review/Play Review with a dedicated review inbox and a way to receive the link promptly; never place real user credentials in review notes.
2. Provide two review accounts so invitation, approval, sensitive-message opening and blocking can be tested.
3. Extra-member purchase buttons appear only after unanimous approval. Give reviewers an exact prepared state or step-by-step path.
4. State that extra observers renew at 29 DKK/month and extra participants at 99 DKK/month; both are monthly only.
5. Explain that blocking and renewal withdrawal are different: blocking is immediate and private, while paid access normally ends at the paid-period boundary.
6. Point reviewers to Account & privacy → Delete account. Deletion does not cancel an App Store/Google Play subscription, which is managed separately by the store.
7. Include working privacy, terms, support and authenticated account-deletion URLs.
8. Attach the relevant in-app products/subscriptions to the first submitted app version and ensure every product is review-ready.

## Final account-dependent gate

- Apple Developer Program, App Store Connect app, agreements, banking and tax complete.
- Google Play organization account, identity verification, payments profile and merchant setup complete.
- D-U-N-S/legal organization details match both stores.
- All product IDs above created exactly once and localized prices checked.
- Store notification endpoints and provider secrets configured only after backend deployment approval.
- Sandbox/internal testers complete purchase, renewal, cancellation, refund, restore and account-mismatch scenarios.
- Public URLs above live and reviewed by counsel/privacy owner.
- Screenshots, icon, feature graphic, age rating/content declarations and final release notes completed from the signed release build.
