---
"@alxia/records": minor
---

New package: `createReferences()`, a registry of what points at what (`referencedBy`, `referrersOf`, `labelledBy`, `findReferrers`), `kindOf` and `kindsOf`, and `purge(ports, input)`, a hard delete in one transaction that refuses while a referrer holds the record, deletes it with its history, writes an audit line and runs a cascade, over ports for the database and the audit log.
