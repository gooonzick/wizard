---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-vue": minor
---

Add `onDataChange` event, `watchField(field, cb)` method, and the `onDataChange` plugin hook (WIZ-010). Fired on data mutations (updateField/updateData/setData) with shallow-diffed `changedFields`; not fired on reset/restore. Plugin hook payloads are DeepReadonly; subscriber errors are isolated and routed to onError (phase "data").
