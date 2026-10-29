# @alxia/records

Referential integrity and hard delete for records, without a database or an
audit log of its own: a registry of what points at what, and a purge that
runs in one transaction and refuses while something still points at the
record. The database and the audit trail are ports your application gives
it. No dependency, and no tie to the rest of alxia.

```sh
bun add @alxia/records
bun add -d typescript
```

## In 30 seconds

```ts
import { createReferences, kindsOf, purge } from '@alxia/records';

export const references = createReferences();

// Once, beside the model that holds the pointer.
references.referencedBy(users, posts, 'authorId');

const ports = {
	transaction: (run) => db.withTransaction(run),
	find: (tx, entity, id) => tx.collection(entity.name).findOne({ _id: id }),
	referrers: (tx, entity, id) =>
		references.findReferrers(entity, id, (r, v) =>
			tx.collection(r.collection).exists({ [r.field]: v }),
		),
	remove: async (tx, entity, id) => void (await tx.collection(entity.name).deleteOne({ _id: id })),
	log: (tx, entry) => auditLog.write(entry, tx),
};

const removed = await purge(ports, {
	entity: users,
	id,
	refuse: {
		notFound: () => new NotFound('user'),
		referenced: (referrers) => new Conflict('user', { kinds: kindsOf(referrers) }),
	},
});
```

A purge finds the record, runs your `guard` and `before`, refuses while a
referrer holds it, deletes it, writes a `delete` line in the audit trail, and
runs your `after` cascade, all in the one transaction: a failure anywhere,
the audit line included, takes the delete back.

See [the documentation](docs/README.md): the [guide](docs/guide.md), the
[troubleshooting](docs/troubleshooting.md) and the [roadmap](docs/roadmap.md).

## API

| Export | What it does |
| --- | --- |
| `createReferences()` | a registry: `referencedBy`, `referrersOf`, `labelledBy`, `labelledFieldsOf`, `referenceFieldsOf`, `findReferrers` |
| `purge(ports, input)` | the transaction described above; returns the record as it was |
| `kindOf(referrer)`, `kindsOf(referrers)` | the stable snake_case code of a referring collection, and the sorted comma-joined list for a refusal's params |
| `PurgePorts`, `PurgeInput`, `PurgeEntry`, `RemoveRecord`, `Referrer`, `Exists`, `Named`, `References` | the types |

The permission check, the parsing of the id and the refusal of an entity that
soft deletes stay yours, before the call.
