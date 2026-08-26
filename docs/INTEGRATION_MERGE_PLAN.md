# TalkTwo integration merge plan

Status: planning only. **Do not merge or deploy anything from this document without an explicit release decision.**

## Authoritative release tree

`feat/privacy-controls-handoff` / draft PR #41 is the authoritative account-independent launch tree. It is stacked on `feat/launch-readiness-audit` / draft PR #40 and includes the later privacy, quiet-control and storage-invariant hardening.

It contains the stacked work from #25, #26, #31–#36, #38 and #40, adapted equivalents of the parallel #27–#30 work, the CI trigger/action-runtime maintenance originally isolated in #37, plus the privacy-first follow-up in #41. QA PR #39 exists only to run the complete `main`-based workflow against an exact copy of the latest #41 tree.

This is deliberately a content/tree decision, not a claim that every older branch has perfect ancestry. One late #34 build-manifest repair was committed after #35 branched; the current #41 tree inherits the valid repaired dependency manifest through #40. The exact-tree QA is therefore the source of truth for what will ship.

## Preferred merge path

When a real merge is explicitly approved:

1. Freeze the exact #41 head. Make no code or documentation changes after the freeze without restarting this gate.
2. Advance QA mirror #39 to a commit whose Git tree is exactly the frozen #41 tree.
3. Require the complete QA workflow to be green: app/test TypeScript, all tests, public-site production build, layout/privacy gates, Expo Doctor, runtime audit, Android export/prebuild/release APK+AAB/merged-permission checks, and iOS export/prebuild/surface checks.
4. Re-run the launch blocker audit and confirm the release tree has no unresolved account-independent blocker.
5. Retarget draft PR #41 to `main` (or, if cleaner review history is desired, open a new integration PR from the **same frozen head** to `main`). Do not recreate or cherry-pick the tree by hand.
6. Confirm the retargeted PR has the same head/tree, remains mergeable, and its diff contains the intended migration/function/client/public-site stack.
7. Run/require QA again in the retargeted PR context if GitHub produces a materially different merge result or base interaction.
8. Only then make the integration PR ready for review and perform the separately approved merge.

A single integration merge avoids replaying a long stack whose intermediate branches were created at different times. Database migration ordering comes from migration filenames and the production deployment plan, not from the number/order of GitHub PR merges.

## Older PR disposition

Do **not** merge #25–#38 or #40 independently after the frozen #41 integration tree has been accepted unless a deliberate comparison proves a missing change. Their changes are represented in the integration tree and they should instead be closed as superseded/review history after the integration PR is safely accepted.

Specific notes:

- #27–#30 were parallel `main` PRs; their functionality was manually adapted into the newer integrated tree rather than blindly copied.
- #37's stacked-PR trigger and current action-runtime changes are integrated through #40 while preserving the later public-site and Android AAB QA steps.
- #40 is the launch-readiness base inherited by #41; it is not the final release head after the privacy follow-up.
- #39 is **QA-only and NEVER MERGE**. Close it after the final integration is accepted or otherwise no longer needs exact-tree validation.

Do not close the older PRs merely to tidy the list before the frozen integration tree is verified; they remain useful review/audit references until then.

## After merge — still no automatic production release

Merging the integration tree does not authorize production changes. Follow `docs/PRODUCTION_DEPLOYMENT_PLAN.md` as a separate fail-closed operation, including database backup/recovery preparation, ordered migrations, schema/security gates, Edge Function deployment, disposable-account smoke tests, reviewed public-site deployment, signed store builds and sandbox/internal testing.
