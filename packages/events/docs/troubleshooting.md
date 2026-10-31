# Troubleshooting

- [`Transaction numbers are only allowed on a replica set member or mongos`](#transaction-numbers-are-only-allowed-on-a-replica-set-member-or-mongos)
- [`emit("x") needs the handle of a transaction`](#emitx-needs-the-handle-of-a-transaction)
- [`"x" is not in any module's emits`](#x-is-not-in-any-modules-emits)
- [`the payload of "x" is not JSON data`](#the-payload-of-x-is-not-json-data)
- [`module "m" subscribes to "x", which no module in the registry emits`](#module-m-subscribes-to-x-which-no-module-in-the-registry-emits)
- [`the registry lacks eventsModule`](#the-registry-lacks-eventsmodule)
- [`invalid-type`, `duplicate-emit` and `foreign-type`](#invalid-type-duplicate-emit-and-foreign-type)
- [`tenant-mismatch`](#tenant-mismatch)
- [`this needs the bound events.<module> queues`](#this-needs-the-bound-eventsmodule-queues)
- [`module "m" has no subscriber for "x" in this process's registry`](#module-m-has-no-subscriber-for-x-in-this-processs-registry)
- [`module "m" has subscribers but no queue`](#module-m-has-subscribers-but-no-queue)
- [`collection "_outbox" of module "events" is not wired in the tenant database`](#collection-_outbox-of-module-events-is-not-wired-in-the-tenant-database)
- [`drain still found events after 100 rounds`](#drain-still-found-events-after-100-rounds)
- [Events stay pending](#events-stay-pending)
- [A subscriber ran twice](#a-subscriber-ran-twice)

## `Transaction numbers are only allowed on a replica set member or mongos`

**When:** the first `mongo.transaction(...)` of a domain write that emits, or
`drain`/a worker delivering an event, against a standalone `mongod`.

**Why:** the outbox is only atomic with the change because both are written in
one MongoDB transaction, and MongoDB runs transactions only on a replica set.
There is no mode of this package without them.

**Fix:** run MongoDB as a replica set, even a single node. In Docker,
`mongod --replSet rs0`, then `rs.initiate()` once. In specs,
`MongoMemoryReplSet.create({ replSet: { count: 1 } })` from
`mongodb-memory-server-core`, and connect with its `getUri()`.

## `emit("x") needs the handle of a transaction`

**When:** `events.emit` is given `scope.mongo` instead of the `tx` of a
`mongo.transaction(async (tx) => ...)`.

**Why:** an event written outside the transaction of its change could be kept
while the change rolls back, or the other way round.

**Fix:**

```ts
await scope.mongo.transaction(async (tx) => {
	await tx.db.orders.create({ label: 'a' });
	await events.emit({ tenant: scope.tenant, mongo: tx }, event);
});
```

If the event has no change to go with it, pass `{ standalone: true }`.

## `"x" is not in any module's emits`

`EventsError` `undeclared-type`. Add the type to the `emits` of the module that
owns it, in the registry the store and `createEvents` share.

## `the payload of "x" is not JSON data`

`EventsError` `invalid-payload`. The payload holds a `Date`, an `ObjectId`, a
`Map` or a class instance, which a queue would turn into something else. Send
`date.toISOString()` and `id.toHexString()`.

## `module "m" subscribes to "x", which no module in the registry emits`

`EventsError` `unknown-subscription`, at boot. The type is misspelled, or the
emitting module is not in the registry. Register it, or fix the key of
`subscribers`.

## `invalid-type`, `duplicate-emit` and `foreign-type`

`EventsError`, at boot. `module "m" emits "x", which is not <module>.<entity>.<verb> in lower case`: rename the type (`shop.order.placed`). `event type "x" is declared by two modules`: a type has one owner; keep it in one module's `emits`. `foreign-type`: `module "a" emits "b.order.placed"`, whose first segment is not its own name; a module emits only the types it owns (`a.…`), so move the entry to `b`.

## `tenant-mismatch`

`EventsError`, at run time (at `drain`, in the relay's `onError`, or in a worker): an `_outbox` row or a job names a tenant other than the database or job it was found in. The row is refused and stays pending, so that tenant's later events wait behind it (rows are dispatched in `_id` order) until it is dealt with. Find how it got there (a copied database, a hand-written row), then delete or correct the row; the next tick resumes.

## `the registry lacks eventsModule`

`EventsError` `module-missing`. Add `eventsModule` to the list given to the
tenant store (`modules`): it owns `_outbox` and `_inbox`.

## `module "m" has subscribers but no queue`

`EventsError` `missing-queue`. `queues` is given but has no entry for a module
that subscribes. Add `{ m: bindQueue(client, eventsQueue('m')) }`. The error
is also thrown by `relay()`, `work()` and `deadLetters()` when `queues` was not
given at all; `drain()` needs none.

## `this needs the bound events.<module> queues`

`EventsError` `missing-queue`, from `relay()`, `work()` or `deadLetters()` when `createEvents` was built without `queues`. Pass `{ queues }` (see the entry below). `drain()` needs none.

## `module "m" has no subscriber for "x" in this process's registry`

`EventsError` `unknown-subscription`, thrown in a worker. The job came from a process whose registry has a subscriber the worker's registry lacks (an older or different deploy). Deploy workers with the registry of the emitter; the job is retried and lands in the dead letters until then.

## `collection "_outbox" of module "events" is not wired in the tenant database`

A `ModuleWiringError` from `@alxia/tenancy`. The tenant databases were wired
with collections that do not include the registry's. Build the wiring from the
registry (`collectionsOf(modules)` of `@alxia/modules`) so `_outbox` and
`_inbox` are in it.

## `drain still found events after 100 rounds`

`EventsError` `drain-diverged`. A subscriber emits an event that, through its
own subscriber, emits again. Break the loop, or test it with the relay.

## Events stay pending

Events with `dispatchedAt: null` are not being relayed. Check, in order:
a relay is started in some process (`relay.start()`, or a worker calling
`relay.tick()`); Redis is reachable; the `onError` of the relay, which reports
a failed `queue.add` (the tenant's pass stops at the failing event, so later
events wait behind it); and that `tick()` returns `leader: true` in one
process, since a stale `lock:events:relay` Redis key (the `lockKey` option, prefixed with `lock:`) holds the lock for at most the
`lockTtl`.

## A subscriber ran twice

Delivery is at least once. The database effects written through
`context.mongo` apply once, because the `_inbox` row commits with them. An
effect outside the database (a mail, an HTTP call) is repeated when the
subscriber throws after making it, or when the job is retried. Make it
idempotent, or enqueue it with a deterministic job id.
