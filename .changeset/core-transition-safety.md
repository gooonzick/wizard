---
"@gooonzick/wizard-core": patch
---

Guard concurrency and resolver safety in the wizard machine:

- submit() now acquires the busy lock atomically and rejects a concurrent submit()/goNext() (WizardNavigationError, reason 'busy'), so onSubmit runs exactly once.
- goNext() broadcasts onStateChange after writing an 'error' step status.
- Synchronous throws in user when/resolve/enabled callbacks are caught (reported deferred + deduped) and no longer break snapshot/serialize; isLastStep is now false (not true) when the next step is resolved asynchronously.
- A throwing onEnter emits the committed target snapshot before the error propagates.
- validate() is generation-guarded so a slow validation can't clobber freshly reset() state.
- Hygiene: snapshot.progress is frozen; restore()'s background validate() has a catch; setData clones its input.

Note: submit()-while-busy now rejects instead of running, and isLastStep reports false for async-resolved next steps — behavior changes that fix double-submit and premature 'Finish' bugs respectively.
