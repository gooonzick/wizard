---
"@gooonzick/wizard-react": patch
---

Remove the orphaned, non-functional UMD build (`dist/index.umd.cjs`). It was never referenced by package.json exports and its globals mapping (wizard-core/wizard-state/jsx-runtime as browser globals) could not work standalone. The package is now ESM-only, consistent with the other packages.
