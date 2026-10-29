import { describe, expect, test } from 'bun:test';
import {
	createReferences,
	type PurgeEntry,
	type PurgeInput,
	type PurgePorts,
	purge,
} from './index';

type Entity = { name: string };
type Doc = { _id: string; ownerId?: string };
type Subject = { kind: string; ownerId: string };
type Tx = { id: number };

const users: Entity = { name: 'users' };
const posts: Entity = { name: 'posts' };
const notes: Entity = { name: 'notes' };

// An in-memory store whose transaction rolls back on a throw, like a database.
function world(
	failLogOn?: (entry: PurgeEntry<Entity, string, Subject>) => boolean,
) {
	let data = new Map<string, Doc>();
	let trail: string[] = [];
	const refs = createReferences();
	refs.referencedBy(users, posts, 'authorId');
	const key = (e: Entity, id: string) => `${e.name}:${id}`;
	const ports: PurgePorts<Tx, Entity, string, Doc, Subject> = {
		async transaction(run) {
			const before = { data: new Map(data), trail: [...trail] };
			try {
				return await run({ id: 1 });
			} catch (error) {
				data = before.data;
				trail = before.trail;
				throw error;
			}
		},
		async find(_tx, e, id) {
			return data.get(key(e, id));
		},
		referrers: (_tx, e, id) =>
			refs.findReferrers(e, id, (r, v) =>
				[...data.entries()].some(
					([k, d]) =>
						k.startsWith(`${r.collection}:`) &&
						(d as Record<string, unknown>)[r.field] === v,
				),
			),
		async remove(_tx, e, id) {
			data.delete(key(e, id));
			trail.push(`remove ${key(e, id)}`);
		},
		async log(tx, entry) {
			if (failLogOn?.(entry)) throw new Error('log unavailable');
			trail.push(
				`${entry.action} ${key(entry.entity, entry.id)} ${tx ? 'tx' : 'after'} ${entry.subject?.ownerId ?? '-'}`,
			);
		},
	};
	return {
		ports,
		put: (e: Entity, doc: Doc & Record<string, unknown>) =>
			data.set(key(e, doc._id), doc),
		has: (e: Entity, id: string) => data.has(key(e, id)),
		trail: () => trail,
	};
}

const refuse = {
	notFound: () => new Error('not-found'),
	referenced: () => new Error('referenced'),
};
const base = (id: string): PurgeInput<Tx, Entity, string, Doc, Subject> => ({
	entity: users,
	id,
	refuse,
});
const ownedBy = (record: Doc) =>
	record.ownerId ? { kind: 'owner', ownerId: record.ownerId } : undefined;

describe('purge', () => {
	test('deletes the record and writes a delete line in the transaction, returning the record', async () => {
		const w = world();
		w.put(users, { _id: 'u1' });
		const record = await purge(w.ports, base('u1'));
		expect(record).toEqual({ _id: 'u1' });
		expect(w.has(users, 'u1')).toBe(false);
		expect(w.trail()).toEqual(['remove users:u1', 'delete users:u1 tx -']);
	});

	test('an unknown id is the module not-found', async () => {
		const w = world();
		await expect(purge(w.ports, base('nope'))).rejects.toThrow('not-found');
		expect(w.trail()).toEqual([]);
	});

	test('a guard that throws refuses on the record as read: nothing deleted or logged', async () => {
		const w = world();
		w.put(users, { _id: 'u1' });
		await expect(
			purge(w.ports, {
				...base('u1'),
				guard: () => {
					throw new Error('guarded');
				},
			}),
		).rejects.toThrow('guarded');
		expect(w.has(users, 'u1')).toBe(true);
		expect(w.trail()).toEqual([]);
	});

	test('before runs after guard and before the referrers; its refusal wins over a referrer', async () => {
		const w = world();
		w.put(users, { _id: 'u1' });
		w.put(posts, { _id: 'p1', authorId: 'u1' } as Doc);
		const order: string[] = [];
		await expect(
			purge(w.ports, {
				...base('u1'),
				guard: () => void order.push('guard'),
				before: async () => {
					order.push('before');
					throw new Error('before-refused');
				},
			}),
		).rejects.toThrow('before-refused');
		expect(order).toEqual(['guard', 'before']);
	});

	test('is refused while a registered referrer holds the record', async () => {
		const w = world();
		w.put(users, { _id: 'u1' });
		w.put(posts, { _id: 'p1', authorId: 'u1' } as Doc);
		await expect(purge(w.ports, base('u1'))).rejects.toThrow('referenced');
		expect(w.has(users, 'u1')).toBe(true);
		expect(w.trail()).toEqual([]);
	});

	test('the referenced refusal gets the referrers', async () => {
		const w = world();
		w.put(users, { _id: 'u1' });
		w.put(posts, { _id: 'p1', authorId: 'u1' } as Doc);
		let given: unknown;
		await expect(
			purge(w.ports, {
				...base('u1'),
				refuse: {
					notFound: refuse.notFound,
					referenced: (r) => {
						given = r;
						return new Error('referenced');
					},
				},
			}),
		).rejects.toThrow();
		expect(given).toEqual([{ collection: 'posts', field: 'authorId' }]);
	});

	test('a record with a subject is logged against it; a refusal is a read of the subject written after the abort', async () => {
		const w = world();
		w.put(users, { _id: 'u1', ownerId: 'o1' });
		await purge(w.ports, { ...base('u1'), subject: ownedBy });
		expect(w.trail()).toEqual(['remove users:u1', 'delete users:u1 tx o1']);

		const r = world();
		r.put(users, { _id: 'u2', ownerId: 'o2' });
		r.put(posts, { _id: 'p1', authorId: 'u2' } as Doc);
		await expect(
			purge(r.ports, { ...base('u2'), subject: ownedBy }),
		).rejects.toThrow('referenced');
		expect(r.trail()).toEqual(['read users:u2 after o2']);
	});

	test('a refusal of a record with no subject writes no read line', async () => {
		const w = world();
		w.put(users, { _id: 'u1' });
		w.put(posts, { _id: 'p1', authorId: 'u1' } as Doc);
		await expect(purge(w.ports, base('u1'))).rejects.toThrow('referenced');
		expect(w.trail()).toEqual([]);
	});

	test('when the read line cannot be written its error replaces the refusal', async () => {
		const w = world((e) => e.action === 'read');
		w.put(users, { _id: 'u1', ownerId: 'o1' });
		w.put(posts, { _id: 'p1', authorId: 'u1' } as Doc);
		await expect(
			purge(w.ports, { ...base('u1'), subject: ownedBy }),
		).rejects.toThrow('log unavailable');
	});

	test('a subject mapping that finds none fails closed: nothing is purged, nothing is logged', async () => {
		const w = world();
		w.put(users, { _id: 'u1' });
		await expect(
			purge(w.ports, { ...base('u1'), subject: ownedBy, label: 'user' }),
		).rejects.toThrow('user u1 has no subject');
		expect(w.has(users, 'u1')).toBe(true);
		expect(w.trail()).toEqual([]);
	});

	test('a failed delete line takes the purge back', async () => {
		const w = world((e) => e.action === 'delete');
		w.put(users, { _id: 'u1' });
		await expect(purge(w.ports, base('u1'))).rejects.toThrow('log unavailable');
		expect(w.has(users, 'u1')).toBe(true);
		expect(w.trail()).toEqual([]);
	});

	test('after removes what existed only for the record, each with its own line, in the same transaction', async () => {
		const w = world();
		w.put(users, { _id: 'u1', ownerId: 'o1' });
		w.put(notes, { _id: 'n1' });
		const record = await purge(w.ports, {
			...base('u1'),
			subject: ownedBy,
			after: async (_tx, rec, remove) => {
				await remove(notes, 'n1', {
					kind: 'owner',
					ownerId: rec.ownerId ?? '',
				});
			},
		});
		expect(record._id).toBe('u1');
		expect(w.has(notes, 'n1')).toBe(false);
		expect(w.trail()).toEqual([
			'remove users:u1',
			'delete users:u1 tx o1',
			'remove notes:n1',
			'delete notes:n1 tx o1',
		]);
	});

	test('an after that throws takes the whole purge back', async () => {
		const w = world();
		w.put(users, { _id: 'u1' });
		w.put(notes, { _id: 'n1' });
		await expect(
			purge(w.ports, {
				...base('u1'),
				after: async (_tx, _rec, remove) => {
					await remove(notes, 'n1');
					throw new Error('cascade failed');
				},
			}),
		).rejects.toThrow('cascade failed');
		expect(w.has(users, 'u1')).toBe(true);
		expect(w.has(notes, 'n1')).toBe(true);
		expect(w.trail()).toEqual([]);
	});

	test('a transaction that runs the callback again leaves no read line from the first attempt', async () => {
		const w = world();
		w.put(users, { _id: 'u1', ownerId: 'o1' });
		let reads = 0;
		const retrying: typeof w.ports = {
			...w.ports,
			// The driver retries once on a transient error: the callback runs twice.
			async transaction(run) {
				try {
					return await w.ports.transaction(run);
				} catch {
					return w.ports.transaction(run);
				}
			},
			// The first attempt sees a referrer (and refuses); the second does not.
			referrers: async () =>
				reads++ === 0 ? [{ collection: 'posts', field: 'authorId' }] : [],
		};
		const record = await purge(retrying, { ...base('u1'), subject: ownedBy });
		expect(record._id).toBe('u1');
		expect(w.has(users, 'u1')).toBe(false);
		expect(w.trail().some((l) => l.startsWith('read'))).toBe(false);
	});

	test('a transaction that wraps the refusal as a cause still gets the read line', async () => {
		const w = world();
		w.put(users, { _id: 'u1', ownerId: 'o1' });
		w.put(posts, { _id: 'p1', authorId: 'u1' } as Doc);
		const wrapping: typeof w.ports = {
			...w.ports,
			async transaction(run) {
				try {
					return await w.ports.transaction(run);
				} catch (error) {
					throw new Error('aborted', { cause: error });
				}
			},
		};
		await expect(
			purge(wrapping, { ...base('u1'), subject: ownedBy }),
		).rejects.toThrow('aborted');
		expect(w.trail()).toEqual(['read users:u1 after o1']);
	});

	test('a refusal of a record whose subject resolves to nothing writes no read line', async () => {
		const w = world();
		w.put(users, { _id: 'u1' });
		w.put(posts, { _id: 'p1', authorId: 'u1' } as Doc);
		await expect(
			purge(w.ports, { ...base('u1'), subject: () => null }),
		).rejects.toThrow('referenced');
		expect(w.trail()).toEqual([]);
	});
});
