# @alxia/events

An event bus for an application on [`@nxgt/mongo`](https://www.npmjs.com/package/@nxgt/mongo)
and [`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis), built on a
transactional outbox. A module writes an event in the same MongoDB transaction
as the change that caused it, so the two stand or fall together. A relay hands
each event to the modules that subscribed, through queues; each subscriber
applies it once, however many times it is delivered.

```sh
bun add @alxia/events @alxia/modules @alxia/tenancy @nxgt/mongo @nxgt/redis mongodb zod
bun add -d typescript
```

MongoDB must run as a **replica set** (transactions need one). See
[troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/events/docs/troubleshooting.md#transaction-numbers-are-only-allowed-on-a-replica-set-member-or-mongos).

## In 30 seconds

```ts
import { collectionsOf, defineModule } from '@alxia/modules';
import {
	createEvents,
	eventsModule,
	type EventEnvelope,
	type SubscriberContext,
} from '@alxia/events';
import { single } from '@alxia/tenancy';
import { connectMongo, defineMongo, openMongo } from '@nxgt/mongo';

// `Tenant` and `Core` are your tenant and core collection wirings
// (see the guide, "Write a subscriber").

// 1. Declare what a module emits and what it subscribes to.
export const shop = defineModule({
	name: 'shop',
	emits: ['shop.order.placed'],
});

export const billing = defineModule({
	name: 'billing',
	subscribers: {
		'shop.order.placed': async (
			event: EventEnvelope,
			context: SubscriberContext<'billing', Tenant, Core>,
		) => {
			// `context.mongo` is in the transaction that records the inbox row,
			// and narrowed to billing's collections and those of its dependsOn.
			const { mongo } = context;
			await mongo.db.invoices.create({ orderId: event.aggregate.id });
		},
	},
});

// 2. Put the kernel module in the registry you give the tenant store,
//    then build the bus from that store.
const modules = [eventsModule, shop, billing];
const { client } = await connectMongo(process.env.MONGO_URI!);
const mongo = await openMongo(
	defineMongo({ client, database: 'app', collections: collectionsOf(modules) }),
);
const tenancy = single({
	mongo,
	modules,
	tenant: { id: 'main', slug: 'main', name: 'Main' },
}); // or perOrganization(...), see @alxia/tenancy
const events = createEvents({ store: tenancy });
// `request` and `viewer` are the HTTP request and its signed-in account
const scope = await tenancy.scope(request, viewer);

// 3. Emit inside the transaction of the change.
await scope.mongo.transaction(async (tx) => {
	const order = await tx.db.orders.create({ label: 'Ada' });
	await events.emit(
		{ tenant: scope.tenant, mongo: tx },
		{
			type: 'shop.order.placed',
			aggregate: { type: 'order', id: order.id },
			payload: { label: 'Ada' },
		},
	);
});
```

## Delivery

In production, a relay and workers run beside the app. Each module that
subscribes gets a queue, `events.<module>`:

```ts
import { bindQueue, connectRedis } from '@nxgt/redis';
import { createEvents, eventsQueue } from '@alxia/events';

const redis = await connectRedis(process.env.REDIS_URL!);
const queues = { billing: bindQueue(redis.client, eventsQueue('billing')) };
const events = createEvents({ store: tenancy, queues }); // `tenancy` from above

const relay = events.relay({ redis: redis.client }); // one leader per deployment
relay.start();
const workers = events.work();

// on shutdown
await relay.stop();
await workers.stop();
```

Without Redis (dev, tests), run the subscribers in your process, in order:

```ts
await events.drain(scope.tenant.id); // omit the tenant to drain every tenant
```

## Guarantees

- **Atomic emit.** The event is in `_outbox` if and only if the transaction
  that emitted it committed.
- **At least once.** The relay enqueues a job per (event, subscriber) with
  `jobId = <eventId>:<module>:<type>`, then marks the event dispatched. A crash
  in between enqueues the same ids again, which the queue ignores.
- **Applied once.** A subscriber's effects and its `_inbox` row commit in one
  transaction; a second delivery finds the row and does nothing.
- **Order.** Per tenant, the relay sends events in `_id` order. There is no
  global order, and a subscriber must tolerate reordering.
- **Same on every store.** Emit, relay and `drain` run unchanged on
  `perOrganization` and `single` (one database, one fixed tenant).

## API

| Export | What it does |
| --- | --- |
| `eventsModule` | the kernel module owning `_outbox` (TTL 7 days after dispatch) and `_inbox` (30 days); add it to the registry |
| `createEvents({ store, queues?, batchSize? })` | the bus; checks the registry at once |
| `events.emit(source, event, options?)` | writes the event through `source.mongo`, a transaction's handle |
| `events.drain(tenant?)` | runs pending events through their subscribers in this process |
| `events.relay(options)` | `tick()`, `start()`, `stop()`: a leader-locked poll that enqueues jobs |
| `events.work(options?)` | one `@nxgt/redis` worker per subscribing module's queue |
| `events.deadLetters({ limit? })` | the jobs that used all their attempts |
| `eventsQueue(module, options?)`, `queueName(module)`, `EventsQueueOptions`, `EventQueue`, `EventJob` | the definition of `events.<module>`, its options, the bound queue's type and a job's payload |
| `deliver(store, mongo, tenant, event, subscription)`, `Delivery` | one subscriber, once: inbox row plus handler in a transaction, handed its module's narrowed scope |
| `emittedTypes(modules)`, `subscriptionsOf(modules)`, `Subscription` | the registry readers behind the boot checks, and one module's handler for one type |
| `outbox`, `inbox`, `OUTBOX_TTL`, `INBOX_TTL` | the collection definitions and TTLs |
| `EventsError`, `EventsErrorCode` | the refusals, with a stable `code` namespaced `events.` (`events.undeclared-type`, `events.missing-queue`, ...) |
| `EventEnvelope`, `EventInput`, `EmitOptions`, `EventWorkers`, `EmitSource`, `EventsMongo`, `Subscriber`, `SubscriberContext`, `DeadLetter`, `Relay`, `RelayOptions`, `Events`, `EventsOptions` | the types |

Peers: `@alxia/modules`, `@alxia/tenancy`, `@nxgt/mongo`, `@nxgt/redis`,
`mongodb`, `zod`, `typescript`.

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/events/docs/guide.md): the envelope, the outbox, subscribers, the relay and workers, `drain`, dead letters, tenants, testing.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/events/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/events/docs/roadmap.md): what is coming, and what is not planned.

## License

MIT
