/**
 * Server-sent events, typed. A handler replies with an async iterable — an
 * `async function*` — and each value it yields is one event, sent as JSON.
 * The client reads the same values back as an async iterable.
 */
import {
	check,
	type InferInput,
	type InferOutput,
	type StandardSchemaV1,
} from '../schema/standard-schema';
import { isAsyncIterable } from './async-iterable';
import { frameText, mismatch } from './frame';
import {
	type EventSchemas,
	type NamedEventStreamSchema,
	namedEventStream,
} from './named-events';

/** A response schema whose body is a stream of events, each one checked by `item`. */
export interface EventStreamSchema<Item extends StandardSchemaV1>
	extends StandardSchemaV1<
		AsyncIterable<InferInput<Item>>,
		AsyncIterable<InferOutput<Item>>
	> {
	readonly '~eventStream': Item;
}

/**
 * The schema of a reply that streams events.
 *
 * Given one schema, each value the handler yields is checked by it and sent
 * as its output, on `data:` lines alone:
 *
 * ```ts
 * app.get('/ticks', { response: { 200: eventStream(Tick) } }, ({ reply }) =>
 *   reply(200, (async function* () { yield { n: 1 }; })()));
 * ```
 *
 * Given a schema per event name, the handler yields `{ event, data, id?,
 * retry? }`: only a declared name, with data its schema accepts. Each is
 * sent with its `event:` line, and the client reads `{ event, data, id? }`:
 *
 * ```ts
 * const Push = eventStream({ state: StateChange, ping: Ping });
 * app.get('/push', { response: { 200: Push } }, ({ reply }) =>
 *   reply(200, (async function* () { yield { event: 'ping', data: { interval: 30 } }; })()));
 * ```
 *
 * An event name that is empty or holds a line break throws a `TypeError`.
 */
export function eventStream<Item extends StandardSchemaV1>(
	item: Item,
): EventStreamSchema<Item>;
export function eventStream<Events extends EventSchemas>(
	events: Events & Declarable<Events>,
): NamedEventStreamSchema<Events>;
export function eventStream(
	schema: StandardSchemaV1 | EventSchemas,
): EventStreamSchema<StandardSchemaV1> | NamedEventStreamSchema<EventSchemas> {
	if (!isStandardSchema(schema))
		return namedEventStream(schema as EventSchemas);
	const item = schema as StandardSchemaV1;
	return {
		'~eventStream': item,
		'~standard': {
			version: 1,
			vendor: 'alxia',
			validate: (value) => {
				if (!isAsyncIterable(value)) {
					return {
						issues: [
							{ message: 'An event stream replies with an async iterable' },
						],
					};
				}
				return { value: checkEach(item, value) };
			},
		},
	} as EventStreamSchema<StandardSchemaV1>;
}

async function* checkEach(
	item: StandardSchemaV1,
	values: AsyncIterable<unknown>,
): AsyncGenerator<unknown> {
	for await (const value of values) {
		const checked = await check(item, value, 'body');
		if (!checked.ok) throw mismatch(checked.issues);
		yield checked.value;
	}
}

/**
 * `unknown` for a map of events the stream can write, `never` for one with
 * no event or an empty name: a compile error, as it is a `TypeError` at run
 * time.
 */
type Declarable<Events> = [keyof Events] extends [never]
	? never
	: '' extends keyof Events
		? never
		: unknown;

/** A schema, as opposed to a map of them: an event may be named `~standard`. */
function isStandardSchema(value: object): value is StandardSchemaV1 {
	const standard = (
		value as { '~standard'?: { version?: unknown; vendor?: unknown } }
	)['~standard'];
	return standard?.version === 1 && typeof standard.vendor === 'string';
}

export function isEventStreamSchema(
	schema: StandardSchemaV1,
): schema is EventStreamSchema<StandardSchemaV1> {
	return '~eventStream' in schema;
}

/** How often a comment keeps an idle stream open: Bun closes a silent one. */
export const KEEP_ALIVE_MS = 8_000;

/**
 * The events of `values` as a `text/event-stream` body: each value as
 * `data:` lines of JSON, after its `event:`, `id:` and `retry:` lines on a
 * named stream, a comment while nothing is sent, and the iterator closed
 * when `signal` aborts: the client went away, or the app is shutting down.
 */
export function toEventStream(
	values: AsyncIterable<unknown>,
	signal?: AbortSignal,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const iterator = values[Symbol.asyncIterator]();
	let timer: ReturnType<typeof setInterval> | undefined;
	// Set once the reader is gone: an event still awaited then has nowhere
	// to go, and is neither sent nor reported.
	let cancelled = false;
	const stop = () => {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
	};
	return new ReadableStream<Uint8Array>({
		start(controller) {
			timer = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': keep-alive\n\n'));
				} catch {
					stop();
				}
			}, KEEP_ALIVE_MS);
			signal?.addEventListener('abort', () => {
				cancelled = true;
				stop();
				void iterator.return?.();
				// Ended for the server's sake — it is shutting down — the client
				// reads the end of the stream; one that left reads nothing.
				try {
					controller.close();
				} catch {}
			});
		},
		async pull(controller) {
			try {
				const next = await iterator.next();
				if (cancelled) return;
				if (next.done) {
					stop();
					controller.close();
					return;
				}
				controller.enqueue(encoder.encode(frameText(next.value)));
			} catch (error) {
				stop();
				// A real failure of the generator is reported even after the
				// reader left; only the stream, gone already, is not errored.
				console.error(error);
				if (cancelled) return;
				controller.error(error);
			}
		},
		cancel() {
			cancelled = true;
			stop();
			void iterator.return?.();
		},
	});
}
