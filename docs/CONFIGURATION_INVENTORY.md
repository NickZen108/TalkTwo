# TalkTwo configuration and secret inventory

This document lists **configuration names and ownership**, never secret values. A buyer/operator should be able to recreate every environment from this inventory plus the relevant provider consoles.

## Classification
- **Public/mobile**: intentionally bundled into the native app. Never put a private credential here.
- **Public/web**: intentionally bundled into the public website. Never put a private credential here.
- **Backend secret**: stored only in Supabase/approved server secret storage.
- **Backend configuration**: server-side value; may not be secret, but is not a mobile trust anchor.

## Mobile app (`.env` / EAS build environment)
| Name | Class | Purpose | Transfer owner |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Public/mobile | Supabase project URL | Platform owner |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public/mobile | Current Supabase publishable client key | Platform owner |
| `EXPO_PUBLIC_TALKTWO_SITE_URL` | Public/mobile | Final HTTPS site base for Privacy/Terms/Support/Delete Account links **and** canonical production origin for `/app/auth`, invitation, member, recovery and Premium-gift links | Business/platform owner |

`EXPO_PUBLIC_*` is public by design. Never place service-role/secret keys, AI keys, store credentials or dispatcher secrets in variables with that prefix.

When `EXPO_PUBLIC_TALKTWO_SITE_URL` is empty, development builds may use the `talktwo://` custom scheme. When it is configured, TalkTwo generates and accepts only same-origin HTTPS `/app/...` links. An invalid non-empty value fails closed. Production release additionally requires matching iOS Universal Link and Android verified App Link ownership for the same host.

## Public website (`public-site/.env`)
All `VITE_*` values are browser-visible.

| Name | Class | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public/web | Supabase URL used by public account-deletion flow |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public/web | Publishable Supabase key only |
| `VITE_SUPPORT_EMAIL` | Public/web | Public support contact |
| `VITE_PRIVACY_EMAIL` | Public/web | Public privacy contact |
| `VITE_LEGAL_ENTITY` | Public/web | Reviewed legal entity name |
| `VITE_POSTAL_ADDRESS` | Public/web | Reviewed legal postal address |
| `VITE_MINIMUM_AGE_RULE` | Public/web | Reviewed minimum-age/capacity wording |
| `VITE_PROFESSIONAL_SERVICES_WORDING` | Public/web | Reviewed emergency/professional-services wording |
| `VITE_CONSUMER_RIGHTS_TEXT` | Public/web | Reviewed consumer-rights wording |
| `VITE_GOVERNING_LAW_TEXT` | Public/web | Reviewed law/dispute wording |
| `VITE_INTERNATIONAL_TRANSFER_TEXT` | Public/web | Reviewed international-transfer disclosure |
| `VITE_PRIVACY_EFFECTIVE_DATE` | Public/web | Effective date shown in privacy material |
| `VITE_PUBLICATION_APPROVED` | Public/web gate | Must remain false until publication text is explicitly approved |

The final public host must also serve the platform-association files used by signed builds: `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`. Their identifiers/fingerprints are configuration derived from the final Apple team and Android release signing identity; do not invent placeholder trust values.

## Supabase / common Edge Function environment
Supabase may provide some project variables automatically. The release operator must still understand which credential class each function consumes.

| Name | Class | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Backend configuration | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEYS` | Backend configuration | User-scoped client construction for JWT-authenticated requests |
| `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEYS` | **Backend secret** | Privileged server client. Never expose to a human/customer portal or public bundle. |

Prefer current publishable/secret-key forms when the deployment environment supports them; compatibility fallbacks in source do not make legacy keys suitable for new client configuration.

## AI review
| Name | Class | Purpose | Rotation/transfer |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | **Backend secret** | Premium message/document analysis | Buyer-controlled provider project; rotate during ownership transfer |
| `OPENAI_MODEL` | Backend configuration | Optional model override; current code fails closed unless the supported priced model is configured | Review against cost/quality tests before changing |

AI provider credentials never belong in Expo/public-site builds.

## Push delivery
| Name | Class | Purpose |
| --- | --- | --- |
| `PUSH_DISPATCH_SECRET` | **Backend secret** | Dedicated bearer secret protecting the non-JWT push dispatcher |
| `EXPO_ACCESS_TOKEN` | **Backend secret** | Authenticates TalkTwo to Expo push services with enhanced security |

APNs/FCM/EAS signing and provider credentials may be managed in provider consoles rather than repository env files. They still belong in `docs/ASSET_REGISTER.md` and must transfer to buyer-controlled accounts.

## Apple App Store verification
| Name | Class | Purpose |
| --- | --- | --- |
| `APPLE_ROOT_CA_DER_BASE64_JSON` | Backend configuration | Trusted Apple root certificate material used to verify signed store payloads |
| `APPLE_ENVIRONMENT` | Backend configuration | `Sandbox` or `Production` |
| `APPLE_BUNDLE_ID` | Backend configuration | Must match the shipped iOS bundle identifier |
| `APPLE_APP_ID` | Backend configuration | Numeric App Store app ID; required by the verifier in Production |

Apple signing keys/certificates and App Store Connect roles are provider-managed transfer assets even when they do not appear as Edge Function env variables.

## Google Play verification
| Name | Class | Purpose |
| --- | --- | --- |
| `GOOGLE_PACKAGE_NAME` | Backend configuration | Must match the Android application ID |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | **Backend secret** | Google Play Developer API service account credential |
| `GOOGLE_PUBSUB_AUDIENCE` | Backend configuration | Expected OIDC audience for Real-time Developer Notifications |
| `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL` | Backend configuration | Expected verified Pub/Sub caller identity |

Google Play Console, Google Cloud IAM/Pub/Sub and service-account ownership all need buyer-controlled administrators before seller access is removed.

## Transfer procedure
For every backend secret:
1. buyer creates or controls the destination provider organisation/project;
2. buyer adds its own recovery/MFA/billing administrators;
3. generate a **new** credential rather than handing over an old personal token where practical;
4. install it in the server secret manager;
5. verify the dependent smoke test;
6. revoke the old credential;
7. record rotation/ownership evidence outside the repository.

## Forbidden patterns
- no secret values in this document or `.env.example` files;
- no `service_role`, Supabase secret key, OpenAI key, Google service-account JSON, Expo access token or dispatcher secret in mobile/web bundles;
- no personal email/phone as a permanent infrastructure recovery dependency after ownership transfer;
- no municipality/customer receives infrastructure secrets as its administration interface.

Canonical transfer references: `docs/ASSET_REGISTER.md`, `docs/HANDOVER_RUNBOOK.md`, `docs/NEW_OWNER_ONBOARDING.md`.
