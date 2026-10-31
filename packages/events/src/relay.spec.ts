import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from 'bun:test';
import { bindQueue } from '@nxgt/redis';
import { RedisClient } from 'bun';
import {
	databaseOf,
	handleOf,
	openOrganizations,
	openSingle,
	place,
	registry,
	soleTenant,
	type TestMongo,
} from '../test/harness';
import { createEvents, type EventsQueueOptions, eventsQueue } from '.';
import { toWire } from './envelope';

// Bun fails a test after 5 s. Each one starts a MongoDB replica-set client and
// a Redis connection, which a loaded CI runner cannot always do in that time.
setDefaultTimeout(30_000);

// These specs need Redis: `$REDIS_URL` (CI's service container), else a
// `redis-server` on PATH started on a free port. With neither they fail.
// Every module, queue and lock name is unique per test, and each test deletes
// its own keys, so a shared Redis is never flushed.
//
// The specs run on Redis database 7, not 0. `@alxia/redis`'s specs share the
// service container, run at the same time in CI, and they `FLUSHDB` and
// `KEYS *` database 0: a flush there deleted this file's queues mid-test (1 waiting job
// instead of 3, a worker that never ran).
const DATABASE = 7;
const inOwnDatabase = (base: string) => {
	const parsed = new URL(base);
	parsed.pathname = `/${DATABASE}`;
	return parsed.toString();
};
let url = process.env['REDIS_URL'];
let server: Bun.Subprocess | undefined;
beforeAll(async () => {
	if (url !== undefined) {
		url = inOwnDatabase(url);
		return;
	}
	const binary = Bun.which('redis-server');
	if (binary === null) {
		throw new Error(
			'These specs need Redis: set REDIS_URL, or put redis-server on PATH',
		);
	}
	const port = 20_000 + Math.floor(Math.random() * 20_000);
	server = Bun.spawn(
		[binary, '--port', String(port), '--save', '', '--appendonly', 'no'],
		{ stdout: 'ignore', stderr: 'ignore' },
	);
	url = inOwnDatabase(`redis://127.0.0.1:${port}`);
	for (let attempt = 0; ; attempt++) {
		try {
			const probe = new RedisClient(url);
			await probe.connect();
			probe.close();
			return;
		} catch (error) {
			if (attempt > 50) throw error;
			await Bun.sleep(20);
		}
	}
});
afterAll(() => server?.kill());

const until = async (check: () => Promise<boolean>, ms = 20_000) => {
	const deadline = Date.now() + ms;
	while (!(await check())) {
		if (Date.now() > deadline) throw new Error('timed out');
		await Bun.sleep(25);
	}
};

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const done of cleanup.splice(0)) await done();
});

async function setup(queueOptions: EventsQueueOptions = {}) {
	const client = new RedisClient(url as string);
	await client.connect();
	const applied: string[] = [];
	let failWith: string | undefined;
	const { modules, billing } = registry({
		'shop.order.placed': async (event, context) => {
			if (failWith) throw new Error(failWith);
			applied.push(event.id);
			await handleOf(context).db.invoices.create({
				orderId: event.aggregate.id,
				n: 1,
			});
		},
	});
	const definition = eventsQueue(billing, queueOptions);
	const queue = bindQueue(client, definition);
	cleanup.push(async () => {
		// The queue's keys are `queue:{<name>}:…`; the braces end the name, so
		// this one never matches another queue whose name it prefixes.
		const keys = (await client.send('KEYS', [
			`queue:{${definition.name}}:*`,
		])) as string[];
		if (keys.length) await client.send('DEL', keys);
		const locks = (await client.send('KEYS', [
			`lock:events:${billing}*`,
		])) as string[];
		if (locks.length) await client.send('DEL', locks);
		client.close();
	});
	return {
		client,
		modules,
		billing,
		queue,
		applied,
		lockKey: `events:${billing}`,
		queues: { [billing]: queue },
		failWith: (message: string | undefined) => {
			failWith = message;
		},
	};
}

const invoiceCount = (mongo: TestMongo) =>
	mongo.db.invoices.raw.countDocuments({});

describe('relay', () => {
	test('enqueues one job per (event, subscriber) in _id order, then marks the events dispatched', async () => {
		const s = await setup();
		const store = await openSingle(s.modules);
		const events = createEvents({ store, queues: s.queues });
		const { tenant, mongo } = await soleTenant(store);
		for (const label of ['a', 'b', 'c'])
			await place(events, tenant, mongo, label);

		const relay = events.relay({ redis: s.client, lockKey: s.lockKey });
		expect(await relay.tick()).toEqual({ leader: true, dispatched: 3 });

		const jobs = await s.queue.list('waiting');
		expect(jobs).toHaveLength(3);
		const ids = (
			await mongo.db._outbox.raw.find({}).sort({ _id: 1 }).toArray()
		).map((row) => row._id.toHexString());
		expect(jobs.map((job) => job.id)).toEqual(
			ids.map((id) => `${id}:${s.billing}:shop.order.placed`),
		);
		expect(
			await mongo.db._outbox.raw.countDocuments({ dispatchedAt: null }),
		).toBe(0);
		expect(await relay.tick()).toEqual({ leader: true, dispatched: 0 });

		const workers = events.work();
		await until(async () => (await invoiceCount(mongo)) === 3);
		await workers.stop();
		expect(s.applied).toEqual(ids);
	});

	test('a crash between the enqueue and dispatchedAt is deduplicated by the job id', async () => {
		const s = await setup();
		const store = await openSingle(s.modules);
		const events = createEvents({ store, queues: s.queues });
		const { tenant, mongo } = await soleTenant(store);
		await place(events, tenant, mongo, 'a');

		// The first relay enqueued the job and died before it marked the event.
		const relay = events.relay({ redis: s.client, lockKey: s.lockKey });
		await relay.tick();
		await mongo.db._outbox.raw.updateMany({}, { $set: { dispatchedAt: null } });

		expect(await relay.tick()).toEqual({ leader: true, dispatched: 1 });
		expect((await s.queue.counts()).waiting).toBe(1);

		const workers = events.work();
		await until(async () => (await invoiceCount(mongo)) === 1);
		await Bun.sleep(100);
		await workers.stop();
		expect(await invoiceCount(mongo)).toBe(1);
	});

	test('a duplicate job (same event, another job id) has one effect', async () => {
		const s = await setup();
		const store = await openSingle(s.modules);
		const events = createEvents({ store, queues: s.queues });
		const { tenant, mongo } = await soleTenant(store);
		await place(events, tenant, mongo, 'a');
		await events.relay({ redis: s.client, lockKey: s.lockKey }).tick();
		const [job] = await s.queue.list('waiting');
		await s.queue.add(job?.data as never, { id: 'a-redelivery' });

		const workers = events.work();
		await until(async () => (await s.queue.counts()).completed === 2);
		await workers.stop();
		expect(s.applied).toHaveLength(1);
		expect(await invoiceCount(mongo)).toBe(1);
	});

	test('only the process holding the leader lock relays', async () => {
		const s = await setup();
		const store = await openSingle(s.modules);
		const events = createEvents({ store, queues: s.queues });
		const { tenant, mongo } = await soleTenant(store);
		await place(events, tenant, mongo, 'a');
		await s.client.send('SET', [
			`lock:${s.lockKey}`,
			'another-process',
			'PX',
			'20000',
		]);

		const relay = events.relay({ redis: s.client, lockKey: s.lockKey });
		expect(await relay.tick()).toEqual({ leader: false, dispatched: 0 });
		expect((await s.queue.counts()).waiting).toBe(0);
		await s.client.send('DEL', [`lock:${s.lockKey}`]);
		expect((await relay.tick()).dispatched).toBe(1);
	});

	test('start polls until stop', async () => {
		const s = await setup();
		const store = await openSingle(s.modules);
		const events = createEvents({ store, queues: s.queues });
		const { tenant, mongo } = await soleTenant(store);
		const relay = events.relay({
			redis: s.client,
			lockKey: s.lockKey,
			interval: 20,
		});
		relay.start();
		await place(events, tenant, mongo, 'late');
		await until(async () => (await s.queue.counts()).waiting === 1);
		await relay.stop();
	});

	test('a job that used its attempts is listed as a dead letter with its event and error', async () => {
		const s = await setup({ attempts: 1 });
		s.failWith('mail server down');
		const store = await openSingle(s.modules);
		const events = createEvents({ store, queues: s.queues });
		const { tenant, mongo } = await soleTenant(store);
		await place(events, tenant, mongo, 'a');
		await events.relay({ redis: s.client, lockKey: s.lockKey }).tick();

		const workers = events.work();
		await until(async () => (await events.deadLetters()).length === 1);
		await workers.stop();
		const [letter] = await events.deadLetters();
		expect(letter).toMatchObject({
			module: s.billing,
			queue: `events.${s.billing}`,
			attempts: 1,
			event: { type: 'shop.order.placed', tenant: 'only' },
			error: { message: expect.stringContaining('mail server down') },
		});
		expect(await invoiceCount(mongo)).toBe(0);
	});

	test('two tenants: each tenant is relayed from its own outbox and applied in its own database', async () => {
		const s = await setup();
		const { store, tenants } = await openOrganizations(s.modules);
		const events = createEvents({ store, queues: s.queues });
		const [a, b] = tenants as [(typeof tenants)[0], (typeof tenants)[0]];
		const dbA = await databaseOf(store, a.id);
		const dbB = await databaseOf(store, b.id);
		await place(events, a, dbA, 'a1');
		await place(events, b, dbB, 'b1');
		await place(events, a, dbA, 'a2');

		expect(
			(await events.relay({ redis: s.client, lockKey: s.lockKey }).tick())
				.dispatched,
		).toBe(3);
		const workers = events.work();
		await until(
			async () =>
				(await invoiceCount(dbA)) === 2 && (await invoiceCount(dbB)) === 1,
		);
		await workers.stop();
		expect(s.applied).toHaveLength(3);
	});

	test('one tenant whose enqueue fails is reported, and the other is still relayed', async () => {
		const s = await setup();
		const { store, tenants } = await openOrganizations(s.modules);
		const [a, b] = tenants as [(typeof tenants)[0], (typeof tenants)[0]];
		const queues = {
			[s.billing]: {
				...s.queue,
				add: (data: { tenant: string }, options: never) => {
					if (data.tenant === a.id) throw new Error('queue refused');
					return s.queue.add(data as never, options);
				},
			},
		};
		const events = createEvents({ store, queues: queues as never });
		await place(events, a, await databaseOf(store, a.id), 'a1');
		await place(events, b, await databaseOf(store, b.id), 'b1');

		const errors: unknown[] = [];
		const relay = events.relay({
			redis: s.client,
			lockKey: s.lockKey,
			onError: (error) => errors.push(error),
		});
		expect(await relay.tick()).toEqual({ leader: true, dispatched: 1 });
		expect(errors).toHaveLength(1);
		expect((errors[0] as Error).message).toBe('queue refused');
		const jobs = await s.queue.list('waiting');
		expect(jobs.map((job) => job.data?.tenant)).toEqual([b.id]);
		const dbA = await databaseOf(store, a.id);
		expect(
			await dbA.db._outbox.raw.countDocuments({ dispatchedAt: null }),
		).toBe(1);
	});

	test('a pass that outlives the leader lock still reports what it dispatched', async () => {
		const s = await setup();
		const store = await openSingle(s.modules);
		const queues = {
			[s.billing]: {
				...s.queue,
				add: async (data: never, options: never) => {
					await Bun.sleep(300);
					return s.queue.add(data, options);
				},
			},
		};
		const events = createEvents({ store, queues: queues as never });
		const { tenant, mongo } = await soleTenant(store);
		await place(events, tenant, mongo, 'a');
		const relay = events.relay({
			redis: s.client,
			lockKey: s.lockKey,
			lockTtl: 100,
		});
		expect(await relay.tick()).toEqual({ leader: true, dispatched: 1 });
	});

	test('a job for a type the module does not subscribe to fails as unknown-subscription', async () => {
		const s = await setup({ attempts: 1 });
		const store = await openSingle(s.modules);
		const events = createEvents({ store, queues: s.queues });
		await s.queue.add({
			tenant: 'only',
			module: s.billing,
			event: toWire({
				id: '0'.repeat(24),
				type: 'shop.order.cancelled',
				version: 1,
				tenant: 'only',
				occurredAt: new Date(),
				actor: null,
				aggregate: { type: 'order', id: '1' },
				payload: {},
			}),
		});
		const workers = events.work();
		await until(async () => (await events.deadLetters()).length === 1);
		await workers.stop();
		const [letter] = await events.deadLetters();
		expect(letter?.error?.message).toContain('has no subscriber for');
	});

	test('a job whose tenant differs from its event is refused, never delivered', async () => {
		const s = await setup({ attempts: 1 });
		const store = await openSingle(s.modules);
		const events = createEvents({ store, queues: s.queues });
		await s.queue.add({
			tenant: 'only',
			module: s.billing,
			event: toWire({
				id: '0'.repeat(24),
				type: 'shop.order.placed',
				version: 1,
				tenant: 'other',
				occurredAt: new Date(),
				actor: null,
				aggregate: { type: 'order', id: '1' },
				payload: {},
			}),
		});
		const workers = events.work();
		await until(async () => (await events.deadLetters()).length === 1);
		await workers.stop();
		const [letter] = await events.deadLetters();
		expect(letter?.error?.message).toContain('is for tenant');
		const { mongo } = await soleTenant(store);
		expect(await invoiceCount(mongo)).toBe(0);
	});
});
