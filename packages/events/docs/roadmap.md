# Roadmap

What `@alxia/events` gives an app, and what is coming. This page is a
direction, not a commitment.

## Now

- **The first release.** The envelope, `emit` in the caller's transaction, the
  `_outbox` and `_inbox` collections with their TTLs as a kernel module, the
  leader-locked relay onto `@nxgt/redis` queues, workers, `drain` for runs
  without Redis, dead-letter listing and the boot checks on `emits` and
  subscribers. It runs unchanged on the `perOrganization` and `single` stores.

## Next

- **A change stream instead of the poll.** The relay would wake on an insert
  into `_outbox` instead of polling, keeping the poll as a fallback.
- **Retrying a dead letter** from the package, rather than through the queue.

## Later

Nothing scheduled yet.

## Not planned

- **A global order.** Events are ordered per tenant by `_id` at the relay and
  may be reordered by retries. Strict per-aggregate order would need queue
  groups keyed by aggregate.
- **Exactly-once effects outside the database.** A mail or an HTTP call a
  subscriber makes must be idempotent by itself.
- **Other databases or brokers.** The outbox is MongoDB, the transport Redis.

## Shipped

Nothing published yet.
