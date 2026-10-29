import type { Referrer } from './references';

/** One line for the audit trail. */
export interface PurgeEntry<E, Id, S> {
	/** `delete`: the record is gone. `read`: a refusal that told something about the subject. */
	readonly action: 'delete' | 'read';
	readonly entity: E;
	readonly id: Id;
	/** Who the record belongs to, when it belongs to someone. */
	readonly subject?: S;
}

/**
 * What the application provides: its database and its audit log. The package
 * never imports either.
 */
export interface PurgePorts<Tx, E, Id, Doc, S> {
	/**
	 * Runs `run` in ONE transaction: committed when it resolves, rolled back
	 * when it throws (and retried by the driver when it says so).
	 */
	transaction<R>(run: (tx: Tx) => Promise<R>): Promise<R>;
	/** The record as the transaction reads it. */
	find(tx: Tx, entity: E, id: Id): Promise<Doc | undefined>;
	/** What still points at the record, read through the transaction. */
	referrers(tx: Tx, entity: E, id: Id): Promise<Referrer[]>;
	/** Deletes the record and its history in the transaction. */
	remove(tx: Tx, entity: E, id: Id): Promise<void>;
	/**
	 * Writes one audit line. Inside the purge it is given the transaction, so
	 * the delete and its trace stand or fall together. A refusal's `read` line
	 * is written after the abort, with no transaction.
	 */
	log(tx: Tx | undefined, entry: PurgeEntry<E, Id, S>): Promise<void>;
}

/** Deletes one more record, with its history and its audit line, in the purge's transaction. */
export type RemoveRecord<E, Id, S> = (
	entity: E,
	id: Id,
	subject?: S,
) => Promise<void>;

export interface PurgeInput<Tx, E, Id, Doc, S> {
	/** The entity's model. */
	entity: E;
	id: Id;
	/** The module's own refusals. */
	refuse: {
		notFound(): Error;
		referenced(referrers: Referrer[]): Error;
	};
	/**
	 * The module's rule for a record that may be purged, run in the
	 * transaction on the record as it reads it (after the not-found check,
	 * before the referrers). It throws to refuse.
	 */
	guard?: (record: Doc) => void;
	/** The module's asynchronous rule, run right after `guard`. It throws to refuse. */
	before?: (tx: Tx, record: Doc) => Promise<void>;
	/**
	 * What goes with the record, run once the record and its audit line are
	 * written: `remove` deletes one more record with its history and its own
	 * `delete` line, or the module repairs what pointed at it.
	 */
	after?: (
		tx: Tx,
		record: Doc,
		remove: RemoveRecord<E, Id, S>,
	) => Promise<void>;
	/**
	 * Present when the record belongs to a subject. It names it; when it
	 * returns nothing the purge fails closed (a delete with no trace is
	 * refused), and the transaction aborts.
	 */
	subject?: (record: Doc) => S | null | undefined;
	/** The name of the entity, for the messages of the errors the purge throws. */
	label?: string;
}

/**
 * The hard delete of a record created by mistake, in ONE transaction: find it
 * (`refuse.notFound`), `guard`, `before`, refuse while a registered referrer
 * holds it (`refuse.referenced`), delete it with its history, write the
 * `delete` line, then `after`. Returns the record as it was.
 *
 * The permission check, the id parsing and the refusal of an entity that soft
 * deletes stay the application's, before this call.
 *
 * A refusal for a referrer names the collection that points at the record: a
 * fact about its subject. When the record has one, a `read` line is written
 * after the abort (the refusal cannot roll it back); if that write fails, its
 * error replaces the refusal.
 */
export async function purge<Tx, E, Id, Doc, S = never>(
	ports: PurgePorts<Tx, E, Id, Doc, S>,
	input: PurgeInput<Tx, E, Id, Doc, S>,
): Promise<Doc> {
	let revealing: { refusal: Error; subject: S } | undefined;
	try {
		return await ports.transaction(async (tx) => {
			revealing = undefined;
			const { entity, id } = input;
			const label = input.label ?? 'record';
			const record = await ports.find(tx, entity, id);
			if (!record) throw input.refuse.notFound();
			input.guard?.(record);
			await input.before?.(tx, record);
			const referrers = await ports.referrers(tx, entity, id);
			if (referrers.length > 0) {
				const refusal = input.refuse.referenced(referrers);
				const found = input.subject?.(record);
				if (found != null) revealing = { refusal, subject: found };
				throw refusal;
			}
			await ports.remove(tx, entity, id);
			const subject = input.subject?.(record);
			if (input.subject && subject == null) {
				// Fail closed: a purge that cannot name its subject would commit
				// with no trace. The throw aborts the transaction.
				throw new Error(
					`purge: ${label} ${String(id)} has no subject to log the delete against`,
				);
			}
			await ports.log(tx, {
				action: 'delete',
				entity,
				id,
				...(subject != null && { subject }),
			});
			if (input.after) {
				await input.after(tx, record, async (other, otherId, who) => {
					await ports.remove(tx, other, otherId);
					await ports.log(tx, {
						action: 'delete',
						entity: other,
						id: otherId,
						...(who !== undefined && { subject: who }),
					});
				});
			}
			return record;
		});
	} catch (error) {
		if (revealing && error === revealing.refusal) {
			await ports.log(undefined, {
				action: 'read',
				entity: input.entity,
				id: input.id,
				subject: revealing.subject,
			});
		}
		throw error;
	}
}
