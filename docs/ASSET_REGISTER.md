# TalkTwo asset register

Keep this document free of passwords, secret values and personal recovery data. It records **what must exist and be transferable**, not the credential itself.

| Asset | Purpose | Ownership target | Transfer method / gate | Current repository status |
| --- | --- | --- | --- | --- |
| GitHub repository / organization | Source, PRs, CI | Organization/team owned | Transfer repository/org roles; verify buyer admin; remove seller after acceptance | Repository exists; handover strategy documented |
| Supabase project / organization | Auth, database, RPCs, Edge Functions | Organization/team owned | Add/transfer organization control, billing and recovery; rotate secrets | Project integration exists; production deployment intentionally not performed by launch-readiness branches |
| Expo / EAS project | Signed builds, push project identity | Organization/team owned | Buyer-controlled Expo org/project and build credentials | Final EAS project ID still a release blocker |
| Apple Developer / App Store Connect | iOS signing/distribution/IAP | Correct legal entity/team | Provider-supported app/account/team transfer as applicable | Account-dependent; final signed/store validation not performed |
| Google Play Console | Android distribution/IAP | Correct legal entity/team | Provider-supported app transfer and permissions | Account-dependent; final signed/store validation not performed |
| Public domain + DNS | Public site, legal/support/delete URLs | Business/company owned | Registrar/DNS transfer, recovery contacts and billing | Final domain must be selected/controlled before release |
| Public-site hosting | Privacy/Terms/Support/Delete account | Business/company owned | Transfer hosting project/team and deployment credentials | Static multipage source and preflight exist; no production deploy |
| Support/privacy mailboxes | User/legal contact | Business/company owned | Transfer mailbox/domain admin and recovery ownership | Final live addresses remain a launch/legal configuration item |
| AI provider account | Premium review | Business/company owned | Transfer billing/org access or create buyer project; rotate API key | Server integration exists; secret must remain backend-only |
| APNs / FCM / Expo push credentials | Private generic notifications | Business/company owned | Transfer/recreate provider credentials; smoke-test devices | Source support exists; physical signed-device activation is account-dependent |
| Store products / subscriptions | Premium billing | Store app owner | Transfer app/products with store ownership and verify IDs | Canonical product IDs documented in repository |
| Organization sponsorship operations | Municipality/organization Premium | Business/company owned | Transfer admin process, contracts and billing records | Server-side sponsorship model exists; no consumer activation-code UI |
| Monitoring / alerting | Reliability/security | Business/company owned | Transfer teams/integrations and rotate tokens | Final provider selection/config may still be operational work |
| Brand source assets | Icon, splash, store imagery, trademark/domain records | Business/company owned | Transfer editable sources and rights documentation | Final icon/artwork still a release blocker |
| Legal/privacy/store material | Terms, Privacy, store answers | Correct legal entity | Transfer reviewed source/docs and review history | Draft source/preflight exists; final legal approval required |
| Backups / recovery procedures | Business continuity | Business/company owned | Verify buyer access and perform recovery exercise | Deployment runbook requires production recovery point |

## Acceptance rule

An asset is not considered transferred merely because the buyer has been invited. For high-value assets, verify that a buyer-controlled administrator can change settings, recover access and perform the relevant operational action before removing the seller.

## Secret rule

Never add secret values to this file. Record secrets in the relevant provider secret manager and track only their existence, owner, rotation date and transfer state in an appropriately protected operational system.
