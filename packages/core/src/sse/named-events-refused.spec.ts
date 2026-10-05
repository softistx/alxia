/** A named event stream refuses what would write a frame its handler never yielded. */
import { describe, expect, test } from 'bun:test';
import { Ping, Push, quietly, readAll } from '../../test/fixtures/events';
import { alxia } from '../app/alxia';
import { responds } from '../app/validate';
import { eventStream } from './event-stream';
import { type EventInput, isNamedEventStreamSchema } from './named-events';

/** The stream of an app that yields `frames`, cast past the types. */
async function streamOf(
	frames: unknown[],
	options: { validateResponses?: boolean } = {},
) {
	const app = alxia(options).get(
		'/push',
		responds({ 200: Push }),
		({ reply }) =>
			reply(
				200,
				(async function* () {
					yield { event: 'ping', data: { interval: 1 } } as const;
					for (const frame of frames)
						yield frame as EventInput<{ ping: typeof Ping }>;
				})(),
			),
	);
	return quietly(async (logged) => ({
		...(await readAll(await app.request('/push'))),
		logged,
	}));
}

const first = 'event: ping\ndata: {"interval":1}\n\n';

describe('what would write a frame the handler never yielded is refused', () => {
	for (const validateResponses of [true, false]) {
		describe(`validateResponses: ${validateResponses}`, () => {
			test('an id with a line break ends the stream before it is written', async () => {
				for (const id of ['1\ndata: forged', '1\rx', '1\0']) {
					const { text, error, logged } = await streamOf(
						[{ event: 'ping', data: { interval: 2 }, id }],
						{ validateResponses },
					);
					expect(text).toBe(first);
					expect(error).toBeDefined();
					expect(String(logged[0])).toContain(
						'An event id must not hold a line break or a NUL',
					);
				}
			});

			test('a retry that is not a whole number of milliseconds ends the stream', async () => {
				for (const retry of [1.5, -1, '5', Number.NaN]) {
					const { text, error, logged } = await streamOf(
						[{ event: 'ping', data: { interval: 2 }, retry }],
						{ validateResponses },
					);
					expect(text).toBe(first);
					expect(error).toBeDefined();
					expect(String(logged[0])).toContain(
						'An event retry must be a whole number of milliseconds, 0 or more',
					);
				}
			});

			test('an undeclared event, or one with a line break in its name, ends the stream', async () => {
				for (const event of ['pong', 'ping\ndata: forged', undefined]) {
					const { text, error, logged } = await streamOf(
						[{ event, data: { interval: 2 } }],
						{ validateResponses },
					);
					expect(text).toBe(first);
					expect(error).toBeDefined();
					expect(String(logged[0])).toContain('is not declared: state, ping');
				}
			});

			test('a value that is not { event, data } ends the stream', async () => {
				const { text, logged } = await streamOf([{ interval: 2 }], {
					validateResponses,
				});
				expect(text).toBe(first);
				expect(String(logged[0])).toContain(
					'An event of a named stream is an object { event, data }',
				);
			});
		});
	}
});

describe('what its schemas refuse', () => {
	test('data its schema refuses ends the stream, named by its event', async () => {
		const { text, logged } = await streamOf([
			{ event: 'ping', data: { interval: 'x' } },
		]);
		expect(text).toBe(first);
		expect(String(logged[0])).toContain(
			'An event does not match its schema: ping.interval:',
		);
	});

	test('without validation, the data is not checked, but the event is still named', async () => {
		const { text, error } = await streamOf(
			[{ event: 'ping', data: { interval: 'x' } }],
			{ validateResponses: false },
		);
		expect(error).toBeUndefined();
		expect(text).toBe(`${first}event: ping\ndata: {"interval":"x"}\n\n`);
	});

	test('a name that cannot be written is refused when the stream is declared', () => {
		expect(() => eventStream({ 'a\nb': Ping })).toThrow(
			'An event name must not hold a line break or a NUL: "a\\nb"',
		);
		expect(() => eventStream({ 'a\rb': Ping })).toThrow(
			'An event name must not hold a line break or a NUL',
		);
		// @ts-expect-error: an empty name is refused by the types too
		expect(() => eventStream({ '': Ping })).toThrow(
			'An event name must not be empty',
		);
		// @ts-expect-error: a stream of no event is refused by the types too
		expect(() => eventStream({})).toThrow(
			'A named event stream declares at least one event',
		);
		expect(() =>
			eventStream({ ping: { interval: 1 } as unknown as typeof Ping }),
		).toThrow('The event "ping" is not a Standard Schema');
		const Odd = eventStream({ '~standard': Ping });
		expect(isNamedEventStreamSchema(Odd)).toBe(true);
	});
});
