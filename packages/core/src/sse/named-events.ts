/**
 * Server-sent events with names: `eventStream({ state: State, ping: Ping })`
 * maps each event name to the schema of its data. The handler yields
 * `{ event, data, id?, retry? }`, and the client reads `{ event, data, id? }`,
 * a union discriminated by `event`.
 */
import {
	check,
	type InferInput,
	type InferOutput,
	type StandardSchemaV1,
} from '../schema/standard-schema';
import { isAsyncIterable } from './async-iterable';
import { Frame, mismatch, refuseId, refuseName, refuseRetry } from './frame';

/** The schema of each event's data, by event name. */
export type EventSchemas = Readonly<Record<string, StandardSchemaV1>>;

/** The schemas by name of `Of`: itself, or those of the named stream it is. */
type SchemasOf<Of> = Of extends { readonly '~events': infer Events }
	? Events
	: Of;

/**
 * What a handler yields on a named stream: one of the declared events, with
 * data its schema accepts. `id` sets the client's last event id; `retry`, in
 * milliseconds, how long an `EventSource` waits before it reconnects. `Of`
 * is the stream's schema, `EventInput<typeof Push>`, or its schemas by name.
 */
export type EventInput<Of extends EventSchemas | AnyNamedEventStream> = {
	[Name in keyof SchemasOf<Of> & string]: {
		readonly event: Name;
		readonly data: InferInput<Extract<SchemasOf<Of>[Name], StandardSchemaV1>>;
		readonly id?: string;
		readonly retry?: number;
	};
}[keyof SchemasOf<Of> & string];

/** What the client reads of a named stream: the event, its data as its schema gives it back, and its id when it had one. */
export type EventOutput<Of extends EventSchemas | AnyNamedEventStream> = {
	[Name in keyof SchemasOf<Of> & string]: {
		readonly event: Name;
		readonly data: InferOutput<Extract<SchemasOf<Of>[Name], StandardSchemaV1>>;
		readonly id?: string;
	};
}[keyof SchemasOf<Of> & string];

/** Any named stream, whatever its events. */
interface AnyNamedEventStream {
	readonly '~events': EventSchemas;
}

/** The fields an event may carry besides its name and data. */
export interface EventFields {
	readonly id?: string;
	readonly retry?: number;
}

/** A response schema whose body is a stream of named events, each one's data checked by the schema of its name. */
export interface NamedEventStreamSchema<Events extends EventSchemas>
	extends StandardSchemaV1<
		AsyncIterable<EventInput<Events>>,
		AsyncIterable<EventOutput<Events>>
	> {
	readonly '~events': Events;
	/**
	 * One event to yield, typed by the schema of its name: its data is
	 * checked, and its literals kept, where a plain `{ event, data }` object
	 * yielded from a generator would widen `event` to `string`.
	 *
	 * ```ts
	 * yield Push.event('ping', { interval: 30 });
	 * ```
	 */
	event<Name extends keyof Events & string>(
		event: Name,
		data: InferInput<Events[Name]>,
		fields?: EventFields,
	): EventInput<Pick<Events, Name>>;
}

export function namedEventStream<Events extends EventSchemas>(
	events: Events,
): NamedEventStreamSchema<Events> {
	const names = Object.keys(events);
	if (names.length === 0) {
		throw new TypeError('A named event stream declares at least one event');
	}
	for (const name of names) {
		const refused = refuseName(name);
		if (refused !== undefined) throw new TypeError(refused);
		const schema: unknown = events[name];
		if (
			schema === null ||
			typeof schema !== 'object' ||
			!('~standard' in schema)
		) {
			throw new TypeError(
				`The event ${JSON.stringify(name)} is not a Standard Schema`,
			);
		}
	}
	return {
		'~events': events,
		event: (event: string, data: unknown, fields?: EventFields) => ({
			...fields,
			event,
			data,
		}),
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
				return { value: toFrames(events, value, true) };
			},
		},
	} as NamedEventStreamSchema<Events>;
}

export function isNamedEventStreamSchema(
	schema: StandardSchemaV1,
): schema is NamedEventStreamSchema<EventSchemas> {
	return '~events' in schema;
}

/**
 * Each value of `values` as a `Frame`: its name declared, its id and retry
 * safe to write, and, when `validate`, its data checked by its schema. The
 * fields are checked even when responses are not validated: a line break in
 * one would write a frame the handler never yielded.
 */
export async function* toFrames(
	events: EventSchemas,
	values: AsyncIterable<unknown>,
	validate: boolean,
): AsyncGenerator<Frame> {
	for await (const value of values) {
		if (value === null || typeof value !== 'object' || !('event' in value)) {
			throw new TypeError(
				'An event of a named stream is an object { event, data }',
			);
		}
		const { event, data, id, retry } = value as {
			event: unknown;
			data?: unknown;
			id?: unknown;
			retry?: unknown;
		};
		const schema =
			typeof event === 'string' && Object.hasOwn(events, event)
				? events[event]
				: undefined;
		if (schema === undefined) {
			throw new TypeError(
				`The event ${JSON.stringify(event)} is not declared: ${Object.keys(
					events,
				).join(', ')}`,
			);
		}
		const refused = refuseId(id) ?? refuseRetry(retry);
		if (refused !== undefined) throw new TypeError(refused);
		let output = data;
		if (validate) {
			const checked = await check(schema, data, 'body');
			if (!checked.ok) {
				throw mismatch(checked.issues, event as string);
			}
			output = checked.value;
		}
		yield new Frame(
			event as string,
			output,
			id as string | undefined,
			retry as number | undefined,
		);
	}
}
