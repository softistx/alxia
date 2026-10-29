# Guide

## Register what points at what

One registry per application, filled once at startup, each pair beside the
model that holds the pointer:

```ts
import { createReferences } from '@alxia/records';

export const references = createReferences();
references.referencedBy(users, posts, 'authorId');
references.referencedBy(users, comments, 'author.userId'); // a dotted path is fine
```

An entity and a referrer are anything with a `name`: a model, a definition or
`{ name: 'users' }`. Registering the same pair twice throws.

`labelledBy(entity, referrer, field)` registers a field that is copied from a
parent (a bed's `wardId`, derived from its room). It shows in
`labelledFieldsOf(referrer)` and never in `referrersOf`, so it never blocks a
purge.

## Find the referrers

`findReferrers(entity, id, exists)` calls `exists(referrer, id)` for each
registered referrer, one at a time and in registration order, and returns the
ones that answered `true`. You supply the read, so it runs through the
transaction you are in:

```ts
references.findReferrers(users, id, (r, v) =>
	tx.collection(r.collection).countDocuments({ [r.field]: v }, { limit: 1 }).then(Boolean),
);
```

`id` is not interpreted: pass one id, or a list your `exists` matches with
`$in`.

## Wire the ports

`purge(ports, input)` never imports a driver. You give it five functions:

| Port | Does |
| --- | --- |
| `transaction(run)` | runs `run(tx)` in one transaction, committing on success and rolling back on a throw |
| `find(tx, entity, id)` | the record as the transaction reads it, or `undefined` |
| `referrers(tx, entity, id)` | usually `references.findReferrers(...)` with a read on `tx` |
| `remove(tx, entity, id)` | deletes the record **and its history** (revisions, versions…); whatever your application keeps for a deleted record belongs here |
| `log(tx, entry)` | writes one audit line; `tx` is the purge's transaction, or `undefined` for the line written after a refusal |

## The input

```ts
await purge(ports, {
	entity: patients,
	id,
	refuse: { notFound, referenced },
	guard: (record) => { if (record.status === 'active') throw new Conflict('active'); },
	before: async (tx, record) => { /* an async rule; throw to refuse */ },
	after: async (tx, record, remove) => {
		// what existed only for the record, in the same transaction;
		// the third argument is the subject of the extra line
		await remove(notes, record.noteId, { kind: 'patient', id: record.patientId });
	},
	subject: (record) => record.patientId && { kind: 'patient', id: record.patientId },
	label: 'patient', // names the entity in the errors the purge throws
});
```

The order is: find (`notFound`), `guard`, `before`, referrers (`referenced`),
`remove`, `log` the `delete`, `after`. `remove` in `after` deletes one more
record with its history and writes its own `delete` line, against the subject
you pass.

## A subject

When a record belongs to someone (a patient, a customer), pass `subject`. It
names who the audit line is against. It has two consequences:

- **Fail closed.** If `subject` returns nothing for the record, the purge
  throws `purge: <label> <id> has no subject to log the delete against` and
  the transaction aborts: a delete with no trace is refused.
- **A refusal is a read.** Saying that a collection still points at the record
  is a fact about its subject, so after the abort a `read` line is written with
  `log(undefined, …)`. If that write fails, its error replaces your refusal.

A refusal for a record whose `subject` returns nothing fails closed too, with the same error as the delete.

The driver may run the transaction's callback again on a transient error, so `guard`, `before`, `after` and `subject` must be safe to run twice. The referrers of a record removed by `after` are not checked, only those of the record purged.

A record with no `subject` option is logged without one: your `log` names it
by `entry.entity` and `entry.id`.

## Test a purge

Give `purge` in-memory ports whose `transaction` restores a snapshot on a
throw, as this package's own `purge.spec.ts` does, and assert on the data and on
the lines written.
