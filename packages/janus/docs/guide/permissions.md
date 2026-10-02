# Permissions

This page covers `permission()`: a guard on `@nxgt/janus/permissions` that
lets the routes after it run only when the subject holds a permission on
the object they are about, loads that object once, and hands it to them.

```ts
import { alxia } from '@alxia/core';
import { byParam, janusErrors, permission, session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { createMemoryRelations, defineModel, permissions } from '@nxgt/janus/permissions';
import { z } from 'zod';

const relations = createMemoryRelations();
const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	relations,
	hasher: scryptHasher(),
});
const access = permissions({
	model: defineModel({
		subjects: auth.types,
		types: {
			record: {
				related: { owners: ['user'] },
				permits: { view: ['owners'] },
			},
		},
	}),
	store: relations,
});

const records = new Map([['r1', { id: 'r1', title: 'Blood test' }]]);
const findRecord = (id: string) => records.get(id) ?? null;

const app = alxia()
	.use(janusErrors())
	.use(session(auth))
	.group('/records/:id', (record) =>
		record
			.use(permission(access, 'view', 'record', byParam('id', findRecord)))
			.get('/', ({ object, reply }) => reply(200, { title: object.title })),
	);
```

`object` is what `findRecord` answered, typed as such. Granting access is
`@nxgt/janus`'s:

```ts
await access.grant({ type: 'record', id: 'r1' }, 'owners', user); // user: what janus() answered
```

## `permission(access, permission, type, load, options?)`

| Argument | Type | Effect |
| --- | --- | --- |
| `access` | what `permissions()` answered | only its `can` is called |
| `permission` | a permission of `type` in the model | what the subject must hold; a name the model does not define does not compile |
| `type` | an object type of the model | the type `can` checks the object as |
| `load` | `(ctx: BaseContext) => O \| null \| Promise<O \| null>` | finds the object; `null` is a 404 |
| `options.subject` | `(ctx: BaseContext) => SubjectRef \| null \| Promise<…>` | who asks; default: the `user` `session()` derived |
| `options.ctx` | `(ctx: BaseContext, object: O) => …` | the context a condition of the permission reads; **required exactly when the permission has one**, refused otherwise |

It runs once per request, before the route:

1. the subject — `null` is a 401, **before** anything is loaded;
2. `load(ctx)` — `null` is a 404;
3. `access.can(subject, permission, object, { ctx })` — `false` is a 403;
4. the route runs, with `object` set.

## Scope it with `group`

The guard applies to every route declared after it, in the app or group it
is used in. Use it inside a `group` so it guards only the routes about that
object: a guard used at the top of the app would run for `/health` too,
and answer it 401 or 404.

## Refusals

Each refusal is in the type of the guarded routes, with the body
`PermissionRefusedBody`:

| The request | Answered |
| --- | --- |
| anonymous | `401 {"error":"unauthenticated"}` |
| `load` answers `null` | `404 {"error":"not_found"}` |
| `can` answers `false` | `403 {"error":"forbidden"}` |
| allowed | the route runs, `object` set |

**A failure throws.** A relation store that cannot answer throws
`STORE_FAILED`, never a 403; a check that walks past `maxDepth` throws
`PERMISSION_DEPTH`. Both are `JanusError`s: [`janusErrors()`](errors.md)
answers them 503 and 500. An error `load` or `ctx` throws is not caught
either: a `JanusError` reaches `janusErrors()`, anything else is the app's
500.

## Loading the object: `byParam`

`byParam(name, find)` is a `load` that reads one path parameter and calls
`find` with it:

```ts
byParam('id', (id) => db.records.findOne({ id })); // find may be async
```

The parameter is the string from the path, decoded (`/records/a%20b` reads
`'a b'`), before the route's `params` schema: a guard runs before the route
validates anything. A group whose path has no such parameter answers 404 to
every request — a typo in `name` is not a compile error.

Any other `load` is a function of the context:

```ts
permission(access, 'view', 'record', async (ctx) => {
	const id = ctx.url.searchParams.get('record');
	return id === null ? null : findRecord(id);
});
```

### What the object must carry

`can` reads the object as `{ type, id, … }`: the guard adds `type`, and
every other field is read from the object `load` answered. So the object
must hold an `id`, and **every field a `fromField` relation of its type
reads**, as a `string` or `null` — `ObjectData` says so, and a `load`
answering an object without one does not compile:

```ts
import { createMemoryRelations, defineModel, fromField, permissions } from '@nxgt/janus/permissions';

const access = permissions({
	model: defineModel({
		subjects: auth.types,
		types: {
			record: {
				related: { owners: ['user'], doctors: fromField('doctorId', 'user') },
				permits: { view: ['owners', 'doctors'] },
			},
		},
	}),
	store: createMemoryRelations(),
});

const records = new Map([['r1', { id: 'r1', doctorId: null as string | null, title: 'Blood test' }]]);

permission(access, 'view', 'record', byParam('id', (id) => records.get(id) ?? null)); // doctorId: present
```

The user whose id is in `doctorId` may view the record, with no tuple
granted.

## A condition: `options.ctx`

A permission whose rule is a `when(…)` condition needs a context to decide.
`ctx` builds it from the request and the loaded object, and the types
require it for that permission, and refuse it for one without a condition:

```ts
import { when } from '@nxgt/janus/permissions';

const model = defineModel({
	subjects: auth.types,
	types: {
		record: {
			related: { owners: ['user'] },
			permits: {
				view: ['owners'],
				edit: [when('owners', (ctx: { locked: boolean }) => !ctx.locked)],
			},
		},
	},
});
const access = permissions({ model, store: relations });

const records = new Map([['r1', { id: 'r1', title: 'Blood test', locked: false }]]);

const app = alxia()
	.use(janusErrors())
	.use(session(auth))
	.group('/records/:id', (record) =>
		record
			.use(
				permission(access, 'edit', 'record', byParam('id', (id) => records.get(id) ?? null), {
					ctx: (_ctx, object) => ({ locked: object.locked }), // object: the loaded record
				}),
			)
			.put('/', ({ object, reply }) => reply(200, { title: object.title })),
	);
```

An owner gets 200 while the record is unlocked, and 403 once it is.

## Another subject: `options.subject`

By default the subject is the `user` [`session()`](sessions.md) derived,
so `session()` must be used before the guard: without it, every guarded
request throws a `TypeError` and answers 500
([troubleshooting](../troubleshooting.md#typeerror-permission-no-user-in-the-context--use-sessionauth-before-it-or-pass--subject-)).

`subject` names another — an API key's service account, a user read from a
header set by a gateway. It reads the `BaseContext`, so the request, the
URL and the path parameters, not the route's validated headers. `null` is
anonymous, a 401:

```ts
permission(access, 'view', 'record', byParam('id', findRecord), {
	subject: (ctx) => {
		const id = ctx.request.headers.get('x-user');
		return id === null ? null : { type: 'user' as const, id };
	},
});
```

## Testing it

```ts
import { expect, test } from 'bun:test';

test('403 to a denial, 404 to nothing loaded, the object once granted', async () => {
	const { token, user } = await auth.signUp({ email: 'ada@example.com', password: 'correct horse' });
	const headers = { authorization: `Bearer ${token}` };

	expect((await app.request('/records/r1', { headers })).status).toBe(403);
	expect((await app.request('/records/gone', { headers })).status).toBe(404);
	expect((await app.request('/records/r1')).status).toBe(401);

	await access.grant({ type: 'record', id: 'r1' }, 'owners', user);
	expect(await (await app.request('/records/r1', { headers })).json()).toEqual({ title: 'Blood test' });
});
```

## Signatures

```ts
function permission<
	C extends ModelConfig,
	const T extends ObjectTypeOf<C>,
	const P extends CheckableOf<C, T>,
	O extends ObjectData<C, T>,
>(
	access: Pick<Permissions<C>, 'can'>,
	permission: P,
	type: T,
	load: (ctx: BaseContext) => Awaitable<O | null>,
	...options: OptionsArgs<C, T, P, O>
): Alxia<
	Empty & { object: O },
	Empty,
	'',
	Reply<401, PermissionRefusedBody> | Reply<404, PermissionRefusedBody> | Reply<403, PermissionRefusedBody>
>;

function byParam<O>(name: string, find: (id: string) => Awaitable<O | null>): (ctx: BaseContext) => Awaitable<O | null>;

type PermissionOptions<C, T, P, O> = {
	readonly subject?: (ctx: BaseContext) => Awaitable<SubjectRef<C> | null>;
} & ([CtxOf<C, T, P>] extends [never]
	? { readonly ctx?: never }
	: { readonly ctx: (ctx: BaseContext, object: O) => Awaitable<CtxOf<C, T, P>> });

type ObjectData<C extends ModelConfig, T extends ObjectTypeOf<C>> = {
	readonly id: string;
} & { readonly [F in FieldsOf<C, T>]: string | null };

interface PermissionRefusedBody {
	readonly error: 'unauthenticated' | 'not_found' | 'forbidden';
}

type Awaitable<V> = V | Promise<V>;
```

`OptionsArgs<C, T, P, O>` is the rest of the arguments, exported for a
wrapper that forwards them: `[options?: PermissionOptions<C, T, P, O>]`, or
`[options: PermissionOptions<C, T, P, O>]` when the permission has a
condition — and a looser `[options?]` when `type` or `permission` is typed
as the union of several, not one literal.

`ModelConfig`, `ObjectTypeOf`, `CheckableOf`, `CtxOf`, `FieldsOf`,
`SubjectRef` and `Permissions` are `@nxgt/janus/permissions`'s; its
permissions guide covers the model itself.
