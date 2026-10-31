---
"@alxia/events": minor
---

New package: an event bus on `@nxgt/mongo` and `@nxgt/redis` with a transactional outbox. `events.emit` writes an enveloped event into the tenant's `_outbox` in the transaction of the change; a leader-locked relay enqueues one `events.<module>` job per (event, subscriber) with the job id `<eventId>:<module>:<type>`; each subscriber applies the event once through a unique `_inbox` row committed with its effects. `eventsModule` owns the two collections and their TTLs, `drain` runs the subscribers in process for runs without Redis, `deadLetters` lists exhausted jobs, and `createEvents` checks `emits` and subscribers at boot. Emit, relay and `drain` run unchanged on the `perOrganization` and `single` tenancy stores.
