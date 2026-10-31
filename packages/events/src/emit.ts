import { ObjectId } from 'mongodb';
import type { EventEnvelope, EventInput } from './envelope';
import { isJson } from './envelope';
import { EventsError } from './errors';
import type { EmitSource } from './types';

export interface EmitOptions {
	/**
	 * Allow a handle that is not in a transaction. The event is then written
	 * alone, which is only right when no domain write goes with it.
	 */
	standalone?: boolean;
}

/**
 * Writes one event into the tenant's `_outbox` through the source's handle,
 * so it is in the same transaction as the domain write beside it.
 */
export async function emitEvent(
	declared: ReadonlySet<string>,
	source: EmitSource,
	input: EventInput,
	options: EmitOptions = {},
): Promise<EventEnvelope> {
	if (!declared.has(input.type)) {
		throw new EventsError(
			'events.undeclared-type',
			`"${input.type}" is not in any module's emits`,
		);
	}
	if (!isJson(input.payload)) {
		throw new EventsError(
			'events.invalid-payload',
			`the payload of "${input.type}" is not JSON data (a Date, an ObjectId or a class instance does not survive a queue): send ISO strings and hex ids`,
		);
	}
	const { mongo } = source;
	if (mongo.session === undefined && !options.standalone) {
		throw new EventsError(
			'events.no-transaction',
			`emit("${input.type}") needs the handle of a transaction (mongo.transaction(tx => ...)), so the event commits with the change; pass { standalone: true } to write it alone`,
		);
	}
	const actor =
		input.actor !== undefined
			? input.actor
			: typeof mongo.actor === 'string'
				? mongo.actor
				: mongo.actor === undefined || mongo.actor === null
					? null
					: String(mongo.actor);
	const _id = new ObjectId();
	const envelope: EventEnvelope = {
		id: _id.toHexString(),
		type: input.type,
		version: input.version ?? 1,
		tenant: source.tenant.id,
		occurredAt: input.occurredAt ?? new Date(),
		actor,
		aggregate: { type: input.aggregate.type, id: input.aggregate.id },
		payload: input.payload,
	};
	await mongo.db._outbox.create({
		_id,
		type: envelope.type,
		version: envelope.version,
		tenant: envelope.tenant,
		occurredAt: envelope.occurredAt,
		actor,
		aggregate: envelope.aggregate,
		payload: envelope.payload,
	});
	return envelope;
}
