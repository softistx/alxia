# Guide

- [Declare events](#declare-events)
- [Register the kernel module](#register-the-kernel-module)
- [Emit in a transaction](#emit-in-a-transaction)
- [Write a subscriber](#write-a-subscriber)
- [Run the relay and the workers](#run-the-relay-and-the-workers)
- [Run without Redis: drain](#run-without-redis-drain)
- [Dead letters](#dead-letters)
- [Tenants](#tenants)
- [Guarantees](#guarantees)
- [Testing](#testing)

## Declare events

A module lists the event types it emits in `emits`, and its handlers by type in
`subscribers` (both are fields of `@alxia/modules`' `defineModule`). A type is
`<module>.<entity>.<verb>`, in lower case.

```ts
import { defineModule } from '@alxia/modules';

export const invoicing = defineModule({
	name: 'invoicing',
	emits: ['invoicing.invoice.overdue'],
});

export const notifications = defineModule({
	name: 'notifications',
	dependsOn: ['invoicing'],
	subscribers: {
		'invoicing.invoice.overdue': async (event, context) => {
			// event.aggregate, event.payload ...
		},
	},
});
```

`createEvents` checks the registry when it is built and throws an
`EventsError` before the app serves anything:

| `code` | The registry has |
| --- | --- |
| `invalid-type` | an `emits` entry that is not `<module>.<entity>.<verb>` |
| `duplicate-emit` | one type declared by two modules |
| `unknown-subscription` | a subscriber of a type no module emits |
| `module-missing` | no `eventsModule` |
| `missing-queue` | a module with subscribers and no `events.<module>` queue, once `queues` is given |

## Register the kernel module

`eventsModule` owns `_outbox` and `_inbox`. Put it in the registry you give
the tenant store, so each tenant database is wired with both collections and
`sync` creates their indexes (the unique inbox index and the TTLs).

```ts
import { eventsModule } from '@alxia/events';
import { single } from '@alxia/tenancy';

const modules = [eventsModule, invoicing, notifications];
const tenancy = single({ mongo, tenant: { id: 'main', slug: 'main', name: 'Main' }, modules });
await tenancy.prepare('main');
```

| Collection | Holds | Indexes |
| --- | --- | --- |
| `_outbox` | the envelope, plus `dispatchedAt` (`null` until relayed) | `(dispatchedAt, _id)` for the relay's scan; a TTL of 7 days on `dispatchedAt` |
| `_inbox` | `eventId`, `subscriber`, `at` | unique `(eventId, subscriber)`; a TTL of 30 days on `at` |

A TTL index ignores a `null` date, so a pending event never expires.

## Emit in a transaction

```ts
import { createEvents } from '@alxia/events';

const events = createEvents({ store: tenancy });

await scope.mongo.as(viewer.id).transaction(async (tx) => {
	const invoice = await tx.db.invoices.update(invoiceId, { status: 'overdue' });
	await events.emit(
		{ tenant: scope.tenant, mongo: tx },
		{
			type: 'invoicing.invoice.overdue',
			aggregate: { type: 'invoice', id: invoice.id },
			payload: { dueOn: '2026-10-01' },
		},
	);
});
```

`emit` returns the envelope:

| Field | Value |
| --- | --- |
| `id` | the `_outbox` `_id` as 24 hex digits |
| `type`, `version` | the type, and `version` (default 1) |
| `tenant` | `source.tenant.id`; the fixed tenant's id on a `single` store |
| `occurredAt` | now, or the date given |
| `actor` | the handle's actor (`mongo.as(...)`), else `null`; or the `actor` given |
| `aggregate` | `{ type, id }`, what the event is about |
| `payload` | JSON data |

Three things are refused with an `EventsError`:

- `undeclared-type`: the type is in no module's `emits`.
- `invalid-payload`: the payload is not plain JSON. A `Date` or an `ObjectId`
  would be turned into a string by the queue and arrive changed; send ISO
  strings and hex ids.
- `no-transaction`: the handle is not a transaction's. An event written
  outside the transaction of its change can be lost or can describe a change
  that never happened. `emit(source, event, { standalone: true })` writes it
  alone when there is no change to go with it.

The driver may run the callback again after a transient error: each run emits
a new event, and only the committed run's stays.

## Write a subscriber

A subscriber receives the envelope and a context:

```ts
import type { Subscriber } from '@alxia/events';

export const onOverdue: Subscriber = async (event, context) => {
	const { mongo } = tenancy.forModule(context, 'notifications');
	await mongo.db.items.create({
		kind: 'invoice-overdue',
		invoiceId: event.aggregate.id,
	});
};
```

`context` has `mongo` (the tenant's database, **in the transaction** that also
writes the `_inbox` row), `core`, `tenant` and `module`. Write database
effects through `context.mongo`: if the handler throws, the effects and the
inbox row roll back together and the retry starts clean; if the event is
delivered twice, the second delivery finds the row and does nothing.

An effect outside the database (a mail, an HTTP call) is not rolled back.
Make it idempotent by itself, or enqueue it as a job with a deterministic id
(`<event.id>:mail`) so a redelivery adds nothing.

Events can arrive reordered. Compare `occurredAt` or the aggregate's version,
and never assume an earlier event arrived.

## Run the relay and the workers

Each module that subscribes has a queue, `events.<module>`. Define it with
`eventsQueue`, bind it with `@nxgt/redis`, and hand the bound queues to
`createEvents`.

```ts
import { bindQueue } from '@nxgt/redis';
import { createEvents, eventsQueue } from '@alxia/events';

const queues = {
	notifications: bindQueue(redis.client, eventsQueue('notifications', { attempts: 8 })),
};
const events = createEvents({ store: tenancy, queues });

const relay = events.relay({ redis: redis.client });
relay.start();
const workers = events.work({ concurrency: 4 });
```

`eventsQueue(module, { attempts, backoff })` defaults to 5 attempts with a
backoff doubling from 5 s, and keeps failed jobs 30 days.

**The relay** runs in one process of the deployment at a time: each pass takes a
`@nxgt/redis` lock (`events:relay`, 30 s), and a process that does not get it
does nothing. A pass visits every tenant (`eachTenant`), reads at most
`batchSize` (100) pending events per query in `_id` order, adds one job per
(event, subscriber) with `jobId = <eventId>:<module>:<type>`, then sets
`dispatchedAt`. An event nobody subscribes to is marked at once. If an add
fails the tenant's pass stops at that event, so order holds, and the error goes
to `onError`; the other tenants go on.

| Option | Default | Effect |
| --- | --- | --- |
| `redis` | required | the Bun client the lock lives on |
| `interval` | 1000 ms | wait between passes while events keep coming |
| `maxInterval` | 10 000 ms | the wait doubles up to this while the outbox is idle |
| `lockKey` | `events:relay` | the lock (stored as `lock:<lockKey>`); change it to run independent buses on one Redis |
| `lockTtl` | 30 000 ms | how long a crashed leader holds the lock |
| `onError` | ignore | a failed pass |

`relay.tick()` runs one pass and returns `{ leader, dispatched }`, which is what
a spec or a cron-driven worker calls.

**The workers** (`events.work(options)`, `options` those of `@nxgt/redis`'
`queue.work`) start one worker per subscribing module. A job carries the
envelope, so it does not read the outbox: a TTL cannot expire an event that is
still being retried. The worker opens the tenant's database, then runs the
subscriber as above. `workers.stop()` stops taking jobs and waits for the
running ones.

## Run without Redis: drain

```ts
await events.drain(scope.tenant.id); // that tenant
await events.drain(); // every tenant
```

`drain` reads the pending events in `_id` order and runs each subscriber in
this process, through the same inbox, until none is pending, so events a
subscriber emits are drained too. It returns the number of events dispatched.
A subscriber that throws stops the drain with its error and leaves the event
pending; the next `drain` retries it. It needs no `queues`. Use it in dev and
in specs; call it explicitly after the action under test.

## Dead letters

A job that uses all its attempts stays in the queue's `failed` list.

```ts
for (const letter of await events.deadLetters()) {
	console.error(letter.queue, letter.event.type, letter.error?.message);
}
```

Each `DeadLetter` has `queue`, `module`, `jobId`, `event` (the envelope),
`attempts`, `error` (`{ name, message }`) and `failedAt`. Once the cause is
fixed, retry the job from its bound queue: `await queues.notifications.retry(letter.jobId)`.
A failed job is kept 30 days.

## Tenants

Everything goes through the `TenantStore`: the relay and `drain()` visit
tenants with `eachTenant`, a worker finds a tenant's database with
`databaseOf`. On a `perOrganization` store each tenant's events live in its own
database; one tenant's `_outbox` is never read in another's pass. On a `single`
store there is one database and one fixed tenant, and nothing else changes: the
same code, the same collections, `tenant` being the fixed id.

## Guarantees

| Failure | What happens |
| --- | --- |
| the domain transaction rolls back | no `_outbox` row |
| the relay crashes after enqueueing, before `dispatchedAt` | the next pass adds the same job ids; the queue keeps one job |
| the queue forgot the id (completed jobs are kept 1 h by default, `keepCompleted`) and the job is added again | the `_inbox` row makes the second run a no-op |
| a subscriber throws | its effects and inbox row roll back; the queue retries with backoff, then the job is a dead letter |
| two workers get the same event | one inbox insert wins; the other is a no-op |
| a lock holder overruns its TTL | two relays may add the same ids; the queue and the inbox absorb it |

Order: per tenant, committed events are sent in `_id` order. `_id`s are
allocated at emit time, so a transaction that commits late can be relayed after
a later one. There is no global order across tenants or subscribers.

## Testing

Use a single-node replica set. With `mongodb-memory-server-core`:

```ts
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';

const replSet = await MongoMemoryReplSet.create({
	replSet: { count: 1, storageEngine: 'wiredTiger' },
});
const uri = replSet.getUri();
```

Build a `single` store with `[eventsModule, ...yourModules]`, `prepare` it,
emit in a transaction, then `await events.drain()` and assert the effects. To
test the relay, run Redis (`REDIS_URL`), use a unique module name per test so
queues never collide, and call `relay.tick()` then `events.work()`.
