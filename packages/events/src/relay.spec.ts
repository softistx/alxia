import { afterEach, describe, expect, test } from 'bun:test';
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

// These specs need Redis (CI's service container): set REDIS_URL to run them.
// Every module, queue and lock name is unique per test, and each test deletes
// its own keys, so a shared Redis is never flushed.
const url = process.env['REDIS_URL'];
const suite = url ? describe : describe.skip;

const until = async (check: () => Promise<boolean>, ms = 8_000) => {
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
		const keys = (await client.send('KEYS', [
			`*${definition.name}*`,
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

suite('relay', () => {
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
});
