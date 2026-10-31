import { describe, expect, test } from 'bun:test';
import { defineModule, type ModuleGraphError } from '@alxia/modules';
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
		expect(error.code).toBe('events.unknown-subscription');
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
		).toBe('events.invalid-type');
		// A type two modules declare is the registry's error, not the bus's.
		const twice = refusal(() =>
			createEvents({
				store: { modules: bad(['a.x.y'], ['a.x.y']) } as never,
			}),
		) as unknown as ModuleGraphError;
		expect(twice.name).toBe('ModuleGraphError');
		expect(twice.code).toBe('modules.duplicate-declaration');
		expect(twice.message).toContain('"a.x.y" is declared by two modules');
	});

	test("a module emitting a type that is not its own name's is refused", async () => {
		const modules = [
			eventsModule,
			defineModule({ name: 'a', emits: ['b.order.placed'] }),
			defineModule({ name: 'b' }),
		];
		const error = refusal(() => createEvents({ store: { modules } as never }));
		expect(error.code).toBe('events.foreign-type');
		expect(error.message).toContain('"a"');
		expect(error.message).toContain('b.order.placed');
	});

	test('a registry without eventsModule is refused', async () => {
		const modules = [defineModule({ name: 'a', emits: ['a.x.y'] })];
		expect(
			refusal(() => createEvents({ store: { modules } as never })).code,
		).toBe('events.module-missing');
	});

	test('a module with subscribers needs its queue once queues are given', async () => {
		const { modules } = registry({ 'shop.order.placed': () => {} });
		const error = refusal(() =>
			createEvents({ store: { modules } as never, queues: {} }),
		);
		expect(error.code).toBe('events.missing-queue');
	});
});
