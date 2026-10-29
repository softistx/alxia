# @alxia/records

## 0.1.0

### Minor Changes

- [#435](https://github.com/softistx/alxia/pull/435) [`368bebb`](https://github.com/softistx/alxia/commit/368bebb40d4843c5640e087f8aa754329883f989) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New package: `createReferences()`, a registry of what points at what (`referencedBy`, `referrersOf`, `labelledBy`, `findReferrers`), `kindOf` and `kindsOf`, and `purge(ports, input)`, a hard delete in one transaction that refuses while a referrer holds the record, deletes it with its history, writes an audit line and runs a cascade, over ports for the database and the audit log.
