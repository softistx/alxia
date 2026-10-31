import { describe, expect, test } from 'bun:test';
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
import { createEvents, type EventsError, type Subscriber } from '.';

const first = <T>(rows: T[]): T => rows[0] as T;

const pendingOf = (mongo: TestMongo) =>
	mongo.db._outbox.raw.find({}).sort({ _id: 1 }).toArray();

describe('emit', () => {
	test('writes the event in the transaction of the change: commit keeps both', async () => {
		const store = await openSingle(registry({}).modules);
		const events = createEvents({ store });
		const { tenant, mongo } = await soleTenant(store);
		const orderId = await place(events, tenant, mongo, 'one');
		const row = first(await pendingOf(mongo));
		expect(row).toMatchObject({
			type: 'shop.order.placed',
			version: 1,
			tenant: 'only',
			actor: null,
			aggregate: { type: 'order', id: orderId },
			payload: { label: 'one' },
			dispatchedAt: null,
		});
		expect(row.occurredAt).toBeInstanceOf(Date);
	});

	test('a rolled-back transaction leaves no outbox row and no change', async () => {
		const store = await openSingle(registry({}).modules);
		const events = createEvents({ store });
		const { tenant, mongo } = await soleTenant(store);
		const failed = mongo.transaction(async (tx: TestMongo) => {
			await tx.db.orders.create({ label: 'doomed' });
			await events.emit(
				{ tenant, mongo: tx },
				{
					type: 'shop.order.placed',
					aggregate: { type: 'order', id: 'x' },
					payload: {},
				},
			);
			throw new Error('boom');
		});
		await expect(failed).rejects.toThrow('boom');
		expect(await pendingOf(mongo)).toEqual([]);
		expect(await mongo.db.orders.raw.countDocuments({})).toBe(0);
	});

	test('the actor of the handle is the event actor unless one is given', async () => {
		const store = await openSingle(registry({}).modules);
		const events = createEvents({ store });
		const { tenant, mongo } = await soleTenant(store);
		const emit = (actor?: string | null) =>
			mongo.as('account-1').transaction((tx) =>
				events.emit(
					{ tenant, mongo: tx as never },
					{
						type: 'shop.order.cancelled',
						aggregate: { type: 'order', id: '1' },
						payload: {},
						...(actor === undefined ? {} : { actor }),
					},
				),
			);
		expect((await emit()).actor).toBe('account-1');
		expect((await emit('system')).actor).toBe('system');
		expect((await emit(null)).actor).toBeNull();
	});

	test('refuses an undeclared type, a payload JSON cannot carry, and a call outside a transaction', async () => {
		const store = await openSingle(registry({}).modules);
		const events = createEvents({ store });
		const { tenant, mongo } = await soleTenant(store);
		const code = async (type: string, payload: unknown, standalone = false) =>
			mongo
				.transaction(async (tx: TestMongo) =>
					events.emit(
						{ tenant, mongo: standalone ? mongo : tx },
						{ type, aggregate: { type: 'order', id: '1' }, payload },
						standalone ? undefined : undefined,
					),
				)
				.catch((e: EventsError) => e.code);
		expect(await code('shop.order.shipped', {})).toBe('undeclared-type');
		expect(await code('shop.order.placed', { at: new Date() })).toBe(
			'invalid-payload',
		);
		expect(await code('shop.order.placed', {}, true)).toBe('no-transaction');
		// Written alone only on request.
		const alone = await events.emit(
			{ tenant, mongo },
			{
				type: 'shop.order.placed',
				aggregate: { type: 'order', id: '1' },
				payload: {},
			},
			{ standalone: true },
		);
		expect(alone.id).toHaveLength(24);
	});
});

describe('drain', () => {
	test('runs each subscriber once, in _id order, and marks the events dispatched', async () => {
		const seen: string[] = [];
		const handler: Subscriber = async (event, context) => {
			const mongo = handleOf(context);
			seen.push((event.payload as { label: string }).label);
			await mongo.db.invoices.create({ orderId: event.aggregate.id, n: 1 });
		};
		const { modules } = registry({ 'shop.order.placed': handler });
		const store = await openSingle(modules);
		const events = createEvents({ store });
		const { tenant, mongo } = await soleTenant(store);
		for (const label of ['a', 'b', 'c'])
			await place(events, tenant, mongo, label);

		expect(await events.drain('only')).toBe(3);
		expect(seen).toEqual(['a', 'b', 'c']);
		expect(await mongo.db.invoices.raw.countDocuments({})).toBe(3);
		expect(
			await mongo.db._outbox.raw.countDocuments({ dispatchedAt: null }),
		).toBe(0);
		expect(await events.drain('only')).toBe(0);
	});

	test('a handler that throws rolls its effects and its inbox row back, and a second drain applies them', async () => {
		let fail = true;
		const handler: Subscriber = async (event, context) => {
			const mongo = handleOf(context);
			await mongo.db.invoices.create({ orderId: event.aggregate.id, n: 1 });
			if (fail) throw new Error('subscriber down');
		};
		const store = await openSingle(
			registry({ 'shop.order.placed': handler }).modules,
		);
		const events = createEvents({ store });
		const { tenant, mongo } = await soleTenant(store);
		await place(events, tenant, mongo, 'a');

		await expect(events.drain('only')).rejects.toThrow('subscriber down');
		expect(await mongo.db.invoices.raw.countDocuments({})).toBe(0);
		expect(await mongo.db._inbox.raw.countDocuments({})).toBe(0);
		expect(
			await mongo.db._outbox.raw.countDocuments({ dispatchedAt: null }),
		).toBe(1);

		fail = false;
		expect(await events.drain('only')).toBe(1);
		expect(await mongo.db.invoices.raw.countDocuments({})).toBe(1);
	});

	test('an event nobody subscribes to is dispatched at once', async () => {
		const store = await openSingle(registry({}).modules);
		const events = createEvents({ store });
		const { tenant, mongo } = await soleTenant(store);
		await place(events, tenant, mongo, 'a');
		expect(await events.drain()).toBe(1);
	});
});

describe('tenants', () => {
	test('two tenants: events stay in their own database and drain(tenant) touches only that one', async () => {
		const handler: Subscriber = async (event, context) => {
			const { tenant } = context;
			const mongo = handleOf(context);
			await mongo.db.invoices.create({
				orderId: `${tenant}:${event.aggregate.id}`,
				n: 1,
			});
		};
		const { store, tenants } = await openOrganizations(
			registry({ 'shop.order.placed': handler }).modules,
		);
		const events = createEvents({ store });
		const [a, b] = tenants as [any, any];
		const dbA = await databaseOf(store, a.id);
		const dbB = await databaseOf(store, b.id);
		await place(events, a, dbA, 'for-a');
		await place(events, b, dbB, 'for-b');
		expect(await dbA.db._outbox.raw.countDocuments({})).toBe(1);
		expect(await dbB.db._outbox.raw.countDocuments({})).toBe(1);

		expect(await events.drain(a.id)).toBe(1);
		expect(await dbA.db.invoices.raw.countDocuments({})).toBe(1);
		expect(await dbB.db.invoices.raw.countDocuments({})).toBe(0);
		expect(
			await dbB.db._outbox.raw.countDocuments({ dispatchedAt: null }),
		).toBe(1);

		const invoice = first(await dbA.db.invoices.raw.find({}).toArray());
		expect(invoice.orderId.startsWith(`${a.id}:`)).toBe(true);

		expect(await events.drain()).toBe(1);
		expect(await dbB.db.invoices.raw.countDocuments({})).toBe(1);
	});
});

describe('inbox', () => {
	test('a duplicate delivery of the same event is a no-op', async () => {
		const { deliver, subscriptionsOf } = await import('.');
		let calls = 0;
		const handler: Subscriber = async () => {
			calls += 1;
		};
		const { modules } = registry({ 'shop.order.placed': handler });
		const store = await openSingle(modules);
		const events = createEvents({ store });
		const { tenant, mongo } = await soleTenant(store);
		await place(events, tenant, mongo, 'a');
		const row = first(await mongo.db._outbox.raw.find({}).toArray());
		const event = {
			id: row._id.toHexString(),
			type: row.type,
			version: 1,
			tenant: 'only',
			occurredAt: row.occurredAt,
			actor: null,
			aggregate: row.aggregate,
			payload: row.payload,
		};
		const subscription = subscriptionsOf(modules).get(
			'shop.order.placed',
		)?.[0] as never;
		const results = await Promise.all([
			deliver(mongo, store.core, event, subscription),
			deliver(mongo, store.core, event, subscription),
			deliver(mongo, store.core, event, subscription),
		]);
		expect(results.filter((r) => r === 'applied')).toHaveLength(1);
		expect(calls).toBe(1);
		expect(await mongo.db._inbox.raw.countDocuments({})).toBe(1);
	});
});
