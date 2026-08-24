# SECURITY DEFINER audit

TalkTwo deliberately keeps sensitive tables behind RPC-only access. `SECURITY DEFINER` is therefore used only for narrow server-side entry points that must enforce the signed-in user's identity before touching protected state.

## Live re-check — 2026-08-24

The connected production database was re-checked read-only against the Postgres catalog:

- 46 public `SECURITY DEFINER` functions were executable by `authenticated`;
- all 46 contained an `auth.uid()` caller binding;
- all 46 had an explicit fixed `search_path` configuration;
- none were executable by `anon` or `PUBLIC`;
- neither `authenticated` nor `anon` had `CREATE` on the `public` schema.

This count describes the **current production schema before the pending launch migrations**. The count may legitimately increase when Coach, organization sponsorship, delivery and other reviewed RPCs are deployed. The release invariant is structural, not “exactly 46 functions”.

The same trust boundary is now encoded in `supabase/checks/security_definer_schema.sql`. A production release must require `security_definer_schema_ok` after migrations. The check is intentionally generic, so a later authenticated `SECURITY DEFINER` RPC fails the gate if it omits caller binding, fixed search path or narrow grants.

## Why the Supabase advisor still warns

Supabase correctly flags `SECURITY DEFINER` as a pattern requiring review. In TalkTwo, an advisor warning is not automatically a defect because authenticated clients are intentionally allowed to execute a small RPC surface while direct table access remains restricted. Each warning must still be reviewed; it must never be dismissed merely because another TalkTwo function uses the same pattern.

## Required invariant for authenticated RPCs

A public `SECURITY DEFINER` function executable by `authenticated` must:

1. derive authority from `auth.uid()` and reject missing/unauthorized callers;
2. use a fixed `search_path` and schema-qualify trusted objects;
3. expose only the minimum return data needed by the client;
4. revoke execution from `PUBLIC` and `anon`;
5. grant execution only to the intended role(s);
6. avoid dynamic SQL unless identifiers/values are independently constrained;
7. keep sensitive service-only mutation functions non-executable by `authenticated`.

## RPC-only tables

Advisor `rls_enabled_no_policy` INFO findings can be intentional for tables that are not a direct client API. RLS with no client policy, plus revoked direct privileges, provides deny-all direct access while reviewed RPCs mediate the operation. Do not add broad table policies merely to silence the INFO finding.

## Performance-advisor follow-up

The 2026-08-24 live advisor also reported seven unindexed foreign keys and the known `premium_gifts` policy init-plan/multiple-policy findings. These are addressed by the pending `20260820152500_database_advisor_hardening.sql` migration. `unused_index` notices are not a launch reason to drop indexes on a database with negligible production traffic; reassess them only after representative usage exists.

## Release review

After the complete migration stack is applied, run both:

- `supabase/checks/security_definer_schema.sql` and require `security_definer_schema_ok`;
- Supabase Security Advisor and inspect every remaining `SECURITY DEFINER` warning against this invariant.

No warning should be waived solely by function name or historical approval.
