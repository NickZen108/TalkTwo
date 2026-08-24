# SECURITY DEFINER and RPC-only table audit

Audit date: 2026-08-20. Project: TalkTwo Supabase production schema. This is a read-only audit; no production privileges, policies or data were changed.

## Result

The current Supabase security advisor reports 46 `public` `SECURITY DEFINER` functions executable by `authenticated`. These are intentional client RPC entry points, not accidental public helpers. The warning should remain visible and be re-reviewed whenever one of these functions changes; it is not safe to suppress it globally.

Live catalog checks confirmed:

- all 46 are owned by `postgres`;
- all 46 explicitly set `search_path=public`;
- all 46 call `auth.uid()` to bind work to the signed-in account;
- `PUBLIC` and `anon` have no execute privilege on any of the 46 functions;
- only `authenticated` has the expected client execute path;
- `PUBLIC`, `anon` and `authenticated` cannot create objects in the `public` schema, so an untrusted role cannot shadow objects on that search path;
- all 20 tables reported as “RLS enabled, no policy” deny direct SELECT/INSERT/UPDATE/DELETE to both `anon` and `authenticated` and are intentionally RPC-only.

## Why SECURITY DEFINER remains intentional

TalkTwo denies direct client table access for messages, invitations, membership, AI budgets, feedback and billing ledgers. The client instead calls narrow RPCs that check the caller and apply multi-row invariants in one transaction. Converting these functions mechanically to `SECURITY INVOKER` would break the RPC-only boundary; granting direct table access to compensate would widen the attack surface.

## Required review for every changed or new RPC

1. Revoke execute from `PUBLIC` and `anon`, then grant only the minimum required role.
2. Set a fixed search path and schema-qualify security-sensitive objects.
3. Reject a missing `auth.uid()` before reading or writing user data.
4. Check relationship membership, role, ownership and current subscription period inside the function; never trust IDs supplied by the client.
5. Bound text, arrays, row counts and time windows before writes.
6. Use a single transaction and lock rows where duplicate approvals, purchases or claims could race.
7. Return only the minimum columns required by the app.
8. Add a negative test for anonymous callers, non-members, self-approval, expired tokens and cross-account receipts as applicable.
9. Re-run both Supabase security and performance advisors after the migration.

## RPC-only tables checked

`ai_budget_settings`, `ai_cost_events`, `ai_message_reviews`, `ai_usage_daily`, `billing_checkout_intents`, `extra_member_access_subscriptions`, `feedback`, `invitations`, `member_invitation_approvals`, `member_invitations`, `messages`, `personal_boundaries`, `premium_sponsorship_credits`, `relationship_blocks`, `relationship_entitlements`, `relationship_member_subscriptions`, `relationship_members`, `relationships`, `store_purchase_events`, `user_plans`.

The “RLS enabled, no policy” advisor notices are expected for these tables only while the direct DML grants remain absent. A future direct grant must be treated as a security regression even if RLS is enabled.

## Post-audit additions

Later launch-stack migrations add Coach aggregate statistics and organization sponsorship RPCs. Those newer functions use fixed empty search paths with schema-qualified objects and have their own privilege/regression tests. Re-run the live catalog audit after the complete migration stack is staged, because the counts above intentionally describe the 2026-08-20 production schema rather than claiming to describe undeployed work.
