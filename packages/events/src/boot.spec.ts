import { describe, expect, test } from 'bun:test';
import { defineModule } from '@alxia/modules';
import { openSingle, registry } from '../test/harness';
import { createEvents, type EventsError, eventsModule } from '.';

const refusal = (fn: () => unknown) => {
	try {
		fn();
	} catch (error) {
		return error as EventsError;
	}
	throw new Error('did not throw');
};

describe('boot checks', () => {
	test('a registry that is consistent boots, and lists what it emits', async () => {
		const { modules } = registry({ 'shop.order.placed': () => {} });
		const events = createEvents({ store: await openSingle(modules) });
		expect([...events.types].sort()).toEqual([
			'shop.order.cancelled',
			'shop.order.placed',
		]);
	});

	test('a subscriber of a type no module emits is refused, with both names', async () => {
		const { modules, billing } = registry({ 'shop.order.shipped': () => {} });
		const error = refusal(() => createEvents({ store: { modules } as never }));
		expect(error.code).toBe('unknown-subscription');
		expect(error.message).toContain(billing);
		expect(error.message).toContain('shop.order.shipped');
	});

	test('a malformed or twice-declared type is refused', async () => {
		const bad = (emits: string[], other: string[] = []) => [
			eventsModule,
			defineModule({ name: 'a', emits }),
			defineModule({ name: 'b', emits: other }),
		];
		expect(
			refusal(() =>
				createEvents({ store: { modules: bad(['Order']) } as never }),
			).code,
		).toBe('invalid-type');
		expect(
			refusal(() =>
				createEvents({
					store: { modules: bad(['a.x.y'], ['a.x.y']) } as never,
				}),
			).code,
		).toBe('duplicate-emit');
	});

	test('a registry without eventsModule is refused', async () => {
		const modules = [defineModule({ name: 'a', emits: ['a.x.y'] })];
		expect(
			refusal(() => createEvents({ store: { modules } as never })).code,
		).toBe('module-missing');
	});

	test('a module with subscribers needs its queue once queues are given', async () => {
		const { modules } = registry({ 'shop.order.placed': () => {} });
		const error = refusal(() =>
			createEvents({ store: { modules } as never, queues: {} }),
		);
		expect(error.code).toBe('missing-queue');
	});
});
