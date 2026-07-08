# WIZ-007 Docs Audit — Veto Safety, goBack visited, StrictMode

> **Status: Resolved (2026-07-08).** Finding 1 (strengthen the plugins-guide veto
> wording) was already merged at `packages/docs/guide/plugins.md:188` prior to this
> closure. Finding 2 (add `goBack` to the status diagram) and Finding 3 (StrictMode
> teardown) have been folded into / dismissed by
> `.agent/docs/sub-agent/wiz-007-docs-fix-spec.md` — Finding 2 was applied there as
> optional Edit 6 (`docs/core-concepts.md` and `packages/docs/guide/core-concepts.md`),
> and Finding 3 required no doc change. This file is kept as a historical artifact and
> needs no further action.

Date: 2026-05-31
Scope: Audit only — NO edits made. Findings + edit spec below.

## Source-of-truth behavior (verified in `packages/core/src/machine/wizard-machine.ts`)

- `navigateToStep` (line 828+) dispatches `beforeTransition` at the very top
  (line 859). On veto (`!proceed`), it returns immediately (line 860–863)
  **before** any `onLeave`, history mutation, status mutation, or state write.
  History pop/push happens at line 882–888; departing-step status is set at
  line 896–901; state object is rebuilt at line 908+. All of this is gated by
  the veto/stale checks. => Veto is a clean no-op: history, current step, and
  ALL step statuses are left untouched.
- `goPrevious` (line 596) and `goBack(steps)` (line 633) BOTH route through
  `navigateToStep(target, "previous", { pushToHistory:false, popHistory:n })`.
  In `navigateToStep`, `type !== "next"` => departing step is marked `"visited"`
  (line 896–901). => `goBack` now marks the departing step `"visited"`, matching
  `goPrevious`.
- StrictMode recreation is internal to React `useWizard`/`WizardProvider`; the
  public contract ("plugins destroyed on unmount") is unchanged.

---

## Finding 1 — Veto semantics (plugins guide): UNDERSPECIFIED, recommend strengthening

File: `packages/docs/guide/plugins.md`, section "Veto Semantics" (line 186–188).

Current text (line 188):

> If `beforeTransition` returns `false`, the transition is **silently cancelled** — no error is thrown, no `afterTransition` fires. The wizard remains on the current step. This is a no-op from the user's perspective. Note that the navigation method still resolves normally: `await goTo(...)` (and `goNext`/`goPrevious`) returns `Promise<void>` and resolves rather than rejects on a veto, so callers awaiting the call will not see a rejection.

Assessment: NOT wrong — it never claims partial state changes. But "remains on
the current step" / "no-op from the user's perspective" stops short of the
guarantee the recent fix added: history, current step, AND step statuses are all
left untouched. Recommend tightening so readers can rely on it.

Proposed replacement for line 188:

> If `beforeTransition` returns `false`, the transition is **silently cancelled** — no error is thrown, no `afterTransition` fires. A veto is a clean no-op: the wizard's current step, navigation history, and **all step statuses** are left completely unchanged (the veto is checked before any `onLeave`, history, or status mutation, so nothing is partially applied). This holds for every navigation method — `goNext`, `goTo`, `goPrevious`, and `goBack`. Note that the navigation method still resolves normally: `await goTo(...)` (and `goNext`/`goPrevious`/`goBack`) returns `Promise<void>` and resolves rather than rejects on a veto, so callers awaiting the call will not see a rejection.

Priority: recommended (accuracy/completeness), not a correction of a false claim.

---

## Finding 2 — `goBack` marks departing step "visited": NO doc states otherwise; one doc should add coverage

Searched every doc for any claim about `goBack`'s effect on step status. Results:

- `docs/core-concepts.md` "Automatic Transitions" diagram (line 483–489) and the
  "Key Behaviors" list (line 439–443) describe status transitions using
  `goNext` / `goPrevious` / `goTo` only. Line 486:
  `active ──(goPrevious / goTo)──▶ visited`. `goBack` is **not mentioned** in the
  status diagram. Since `goBack` is deprecated and behaves identically to
  `goPrevious` for status, this is not wrong, but it is silent on `goBack`.
- No doc anywhere claims `goBack` does NOT mark the departing step visited. So
  there is NO stale/incorrect statement to fix for this behavior.

Optional improvement (low priority) — `docs/core-concepts.md` line 486:

Current:

> active ──(goPrevious / goTo)──▶ visited

Proposed:

> active ──(goPrevious / goBack / goTo)──▶ visited

This is the only place where adding `goBack` would improve precision. Given
`goBack` is deprecated, omitting it is defensible; include only if you want the
status diagram exhaustive.

---

## Finding 3 — React StrictMode teardown: NO doc changes needed

File: `packages/docs/guide/plugins.md` line 114:

> Plugins are automatically destroyed (`machine.destroy()`) when the component unmounts.

Assessment: ACCURATE and not misleading. The StrictMode recreation fix is fully
internal (`useWizard`/`WizardProvider` transparently recreate a manager destroyed
by StrictMode's mount→unmount→remount probe). The documented public contract
(plugins torn down on real unmount) is unchanged. No mention of StrictMode is
warranted in user docs. No edits.

The `destroy()` JSDoc/API entries in `docs/api-reference.md` (line 507–510) and
`packages/docs/guide/api/core.md` are also accurate and untouched by this change.

---

## JSDoc / TSDoc in `packages/core/src`

- `WizardPlugin.beforeTransition` JSDoc (`packages/core/src/plugins/types.ts`
  line 50): `/** Return `false` to veto the transition (silent cancel). */`
  — accurate; no false status/state claim. Optional: could append
  "(leaves wizard state unchanged)" but not required.
- `goBack` JSDoc (`wizard-machine.ts` line 627–632): documents deprecation and
  history behavior; says nothing about step status. Not inaccurate. No edit
  required (could note "marks the departing step visited, like goPrevious" but
  optional).
- `goPrevious` JSDoc (line 591–595): accurate. No edit.
- `goNext` / `goTo` JSDoc: no inaccurate status/veto claims. No edit.

---

## ROADMAP.md (WIZ-007)

Checked `docs/ROADMAP.md`. The navigation-history table and WIZ-007 notes
describe history-stack design, not veto/visited status semantics. Nothing there
contradicts the recent fixes. No touch-up needed.

---

## Summary of recommended edits

| File | Line | Change | Priority |
| --- | --- | --- | --- |
| `packages/docs/guide/plugins.md` | 188 | Strengthen "Veto Semantics" to state history + current step + all step statuses are unchanged, and that it applies to goNext/goTo/goPrevious/goBack | Recommended |
| `docs/core-concepts.md` | 486 | Add `goBack` to the `→ visited` status transition (deprecated; optional) | Optional |

No INCORRECT/stale statements exist anywhere — no doc claims partial veto state
changes, and no doc claims `goBack` leaves status unchanged. The edits above are
completeness/precision improvements, not corrections. StrictMode requires no doc
change.
