# @alxia/events

## 0.1.0

### Minor Changes

- [#472](https://github.com/softistx/alxia/pull/472) [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New package: an event bus on `@nxgt/mongo` and `@nxgt/redis` with a transactional outbox. `events.emit` writes an enveloped event into the tenant's `_outbox` in the transaction of the change; a leader-locked relay enqueues one `events.<module>` job per (event, subscriber) with the job id `<eventId>:<module>:<type>`; each subscriber applies the event once through a unique `_inbox` row committed with its effects. `eventsModule` owns the two collections and their TTLs, `drain` runs the subscribers in process for runs without Redis, `deadLetters` lists exhausted jobs, and `createEvents` checks `emits` and subscribers at boot. Emit, relay and `drain` run unchanged on the `perOrganization` and `single` tenancy stores.

- [#472](https://github.com/softistx/alxia/pull/472) [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `EventsError` codes are namespaced `events.` (`events.undeclared-type`, `events.missing-queue`, ...). `events.duplicate-emit` is gone: an event type two modules emit is `@alxia/modules`' `ModuleGraphError` (`modules.duplicate-declaration`). README API table completed. `EventsQueueOptions.backoff` is now typed `Duration` (`"5s"`, `"1m"`, ...) instead of `string`.

### Patch Changes

- Updated dependencies [[`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177), [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177), [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177), [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177)]:
  - @alxia/modules@0.1.0
  - @alxia/tenancy@0.1.0
