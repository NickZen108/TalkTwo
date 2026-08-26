# TalkTwo systematic v1 audit

This document is the finite finish line for the account-independent v1 audit. It exists to prevent an endless sequence of unstructured hardening ideas.

Statuses:
- **REVIEWED** — deliberately inspected; no unresolved concrete account-independent launch defect is known in this area.
- **FIXED** — concrete defects were found and corrected; targeted regression coverage/runbook gates exist where practical.
- **OPEN** — a concrete account-independent item remains.
- **EXTERNAL** — implementation is ready as far as the repository can take it, but final validation/configuration requires provider accounts, signing identity, final domain, legal approval, physical devices or another external input.

A final v1 freeze is appropriate only when every account-independent row is REVIEWED or FIXED and all remaining OPEN items are either a product-owner decision or explicitly accepted as non-blocking. EXTERNAL rows remain release gates, not reasons to keep redesigning repository code.

| Area | Status | Audit result / remaining gate |
| --- | --- | --- |
| Authentication / sessions | **FIXED** | Native auth uses PKCE, URL tokens are not accepted as sessions, callbacks reject token-bearing implicit forms, public account-deletion login is explicitly PKCE, account creation is disabled in deletion flow, and deletion re-verifies the current user. |
| App links / invitations / gifts | **FIXED** | Production accepts only exact same-origin verified HTTPS app links. Invitation/member/recovery bearer material is fragment-only; gift claim token is fragment-only; legacy path/query bearer forms fail closed. Production site URL must be a canonical HTTPS origin. |
| Relationship invitation key exchange | **FIXED** | Invitation encryption material is bound to both invitation token and relationship; concurrent key creation is serialized. |
| Local storage / SQLCipher | **FIXED** | SQLCipher is enabled natively, runtime verifies cipher availability and fails closed, device-only random key storage is used, orphan ciphertext cache recovery is safe when a device key cannot be restored, and Android backup is disabled where the platform honors it. |
| Server message storage | **FIXED** | New durable messages retain ciphertext/hash/metadata, not plaintext. Trusted send-time checks may see plaintext transiently; product must not claim zero-knowledge/E2EE. |
| Unopened-message privacy | **FIXED** | Incoming unopened/blocked message bodies, ciphertext and deterministic body hashes remain hidden until explicit open. |
| Delivery / read / rejection privacy | **FIXED** | Sender-facing status is aggregate Sent/Delivered only. Recipient rejection/open/block/mute state is not exposed as a per-recipient oracle. |
| Message mutation | **FIXED** | v1 messages are final after send. Client edit/withdraw APIs are removed and legacy server mutation RPCs are service-only. |
| Communication windows / timezone | **FIXED** | Exact windows/timezone/local clock are owner-private routing data. No emergency bypass. Waiting-message release exists. Mobile controls use accessible time inputs and save targets. |
| Blocking / notification mutes | **FIXED** | Blocks/mutes are private. Timed expiry affects future messages only. Push queue respects mute/block state and already queued jobs are cancelled when appropriate. |
| Personal Boundaries | **FIXED** | Premium-only boundary values are not echoed. Final helper returns only a generic marker. Expired block cannot bypass boundary enforcement. Sender can still infer that attempted content hit some boundary, so docs must not promise perfect non-inferability. |
| Text attachments | **REVIEWED** | Premium-only plain-text formats, 5 MB source cap, normalized text/page limits, whole-document review and privacy rules are documented and enforced. |
| AI review / Coach | **FIXED** | AI context is built only from locally visible cached context and server-validated against logical IDs/hashes before provider use; provider storage is disabled; budget/trial gates exist; prompts treat conversation text as untrusted data. |
| Premium lifecycle | **FIXED** | Renewal, grace/on-hold, cancellation, expiry/revoke/refund behavior is server verified; on-hold suspends entitlement. |
| Premium gifts | **FIXED** | v1 gift is locked to the intended one-month 59 DKK product and claim possession material is fragment-only. |
| Extra members | **FIXED** | Extra membership is monthly only, unanimous approval precedes payment/access, renewal approval can be withdrawn for future periods and read-only/participant roles have distinct products. |
| Observer → participant upgrade | **FIXED** | Fresh unanimous write-access approval is required. Upgrade is a real native subscription replacement, not a TalkTwo one-off proration. Cross-store replacement is blocked; Google linkedPurchaseToken and Apple original-subscription identity are verified; interrupted checkout is resumable; approval membership snapshot is frozen at checkout. |
| Organization-funded Premium | **REVIEWED** | Entitlement is server assigned; consumer activation-code flow is absent; sponsor does not receive conversation/private-behavior access. |
| Push notifications | **REVIEWED** | Payload is generic/content-free; device token is disabled on logout; global/chat/person mute and block routing behavior was inspected. Final APNs/FCM/Expo credentials and signed-device smoke tests are external. |
| Key recovery | **FIXED** | Recovery envelope authentication binds token + relationship. Requester and approver must still be current members of the active relationship at approval/fulfillment/retrieval time; stale membership invalidates recovery. |
| Account deletion | **FIXED** | Global refresh-session sign-out precedes Auth deletion; public deletion requires explicit DELETE confirmation and verified user. FK gate rejects public NO ACTION/RESTRICT references to auth.users and purchase history follows documented pseudonymization/retention rules. |
| Public website | **FIXED** | `/app/*` fallback is static/script-free, does not inspect URL fragments, uses no-referrer/noindex/restrictive CSP. Public deletion has PKCE/no-account-creation/verified-user preflight. Final hosting rewrites and reviewed legal values are external. |
| Native permissions / privacy surface | **REVIEWED** | Android explicitly blocks unrelated sensitive permissions and requires allowBackup=false; iOS gate rejects unrelated usage descriptions/capabilities, arbitrary network loads and verifies SQLCipher/privacy manifest aggregation. |
| Verified iOS/Android app links | **EXTERNAL** | Repository preflight requires exact final host, AASA, assetlinks, Apple Team ID and Android signing fingerprint. Signed-device verification requires final domain/accounts/signing identity. |
| Dark mode / palette contrast | **FIXED** | System/light/dark modes exist. Palette contrast tests cover normal text; light subtle text was darkened to meet WCAG AA on normal light surfaces. |
| Core mobile touch targets | **FIXED** | Core Chat, privacy, Home, Login, Feedback, communication-window and Chat Settings actions/selectors are >=44 pt. Layout-safety regression gate locks the key targets, including appearance chips and bubble-colour selectors. |
| Responsive layout / large text | **REVIEWED** | Core screens use shrink/wrap/minWidth guards and scrollable settings flows. Re-run native QA on the final audit head. |
| Languages / semantic filter scope | **REVIEWED** | v1 UI is DA/EN. Free semantic-filter quality is intentionally DA/EN; additional languages are post-v1 scope unless explicitly re-opened. |
| Store catalogue / IDs | **REVIEWED** | Canonical Apple/Google product IDs and prices are documented. Final store creation, grouping and sandbox/internal purchase tests are external. |
| Apple/Google subscription replacement | **EXTERNAL** | Code contract is implemented; final Apple subscription-group hierarchy and Google replacement behavior require configured store products and sandbox/internal testing. |
| Production migration order / smoke tests | **FIXED** | Deployment plan is explicit through `20260824120000_key_recovery_membership_revalidation.sql`, requires lexical-order deployment from one frozen tree, post-deploy schema gates and disposable smoke tests including stale-member recovery rejection. |
| GitHub exact-tree QA | **EXTERNAL** | Earlier candidate completed full native QA green. Newer hosted runs have terminated before checkout with jobs reporting steps=null. Eventual final audit/frozen SHA still requires a normal full QA run green. |
| Brand / product name | **OPEN** | `TalkTwo` has public name collisions, including an active UK AI call-management service and a prior therapy marketplace. This is now the first unresolved product-owner decision. Select a final brand before domain, artwork, AASA/assetlinks, legal publication and store metadata are frozen. Do not mechanically rename bundle/package identifiers unless separately decided. |
| Final domain / icon / splash / store artwork | **EXTERNAL** | Depends on final brand and controlled domain. Release preflight intentionally remains red until real assets/configuration exist. |
| Legal/privacy publication | **EXTERNAL** | Draft source and publication gate exist. Final legal entity/contact/consumer/privacy wording requires explicit review/approval before publication. |
| Handover / ownership transfer | **REVIEWED** | Asset register, configuration inventory, role model and handover material exist. Final provider ownership/credential transfer is operational work. |

## Account-independent audit conclusion

The broad account-independent repository audit is **complete** as of this checkpoint: every repository-controlled technical area is REVIEWED or FIXED, and the final deployment/handover consistency pass found no new concrete code defect. Do not continue speculative hardening merely to search for another possible improvement.

Next sequence:

1. Move `qa/full-stack-20260824` to the exact current audit head and confirm the trees are identical.
2. Attempt exact-tree QA. A pre-checkout hosted-runner failure remains EXTERNAL; a real test/build failure reopens only the specific affected audit row.
3. Select the final product name. After selection, perform a deliberate rename plan covering display copy/domain/legal/store metadata and explicitly decide whether stable technical identifiers should remain unchanged.
4. Complete external domain/artwork/accounts/signing/legal/store configuration, then freeze the actual release SHA and run the full release gates.

## Stop rule

Broad repository hardening stops here unless exact-tree QA, provider sandbox tests, signed-device tests or a newly demonstrated concrete defect produces evidence that reopens a specific row. Remaining imagined improvements go to post-v1 rather than moving the launch finish line again.
