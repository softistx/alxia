# Errors

This page covers `janusErrors()`: the middleware that answers every refusal
`@nxgt/janus` throws — a wrong password, a login taken, a store down —
with its status and a body a client can act on, typed on the routes after
it; and `bodyOf` and `statusOf`, the two functions it is made of.

```ts
import { alxia, validate } from '@alxia/core';
import { janusErrors, session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const accounts = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email', minLength: 12 },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const SignUp = z.object({ email: z.string(), name: z.string(), password: z.string() });

const app = alxia()
	.use(janusErrors())
	.use(session(accounts))
	.post('/signup', validate({ body: SignUp }), async ({ body, auth, reply }) => {
		const signedUp = await accounts.signUp(body); // throws a JanusError when it refuses
		return reply.created({ id: auth.send(signedUp).id });
	});
```

A route needs no `try`: `signUp` throws, and the middleware answers.

```text
400 {"code":"PASSWORD_TOO_SHORT","minLength":12}
400 {"code":"USER_INVALID","issues":[{"path":["email"],"message":"Invalid email address"}]}
409 {"code":"LOGIN_TAKEN"}
401 {"code":"CREDENTIALS_INVALID"}
401 {"code":"CREDENTIALS_INVALID","retryAfter":900}      + Retry-After: 900
503 {"code":"STORE_FAILED"}
```

## Where to put it

`janusErrors()` is a try/catch middleware: it answers a `JanusError` thrown
**behind** it, by `session()`, by `permission()` or by a route. Give it to
`use` before `session()`:

```ts
const app = alxia().use(janusErrors(), session(accounts));
```

Declared after `session()`, it never sees what `session()` throws: a store
down while the session is read (`STORE_FAILED`) is the app's 500
`{"error":"internal"}`, not the 503. The same goes for a route declared
before it: a `JanusError` it throws is not behind `janusErrors()`.

It answers only a `JanusError`. Anything else goes on, thrown, to the
middlewares before it — a try/catch of your own around `await next()` — and,
when none answers it, to the route boundary: an `HttpError`'s status, else a 500.

An observer that settles `next()` (`logger()`, `secureHeaders()`,
`telemetry()`, `createI18n()`) reads the response the error would be
answered with, and lets the error go on: `janusErrors()` answers it
wherever it stands, `use(janusErrors()).use(i18n).use(session())`
included. Give the observers to `use` first, then `janusErrors()`, so
that they see its reply rather than the 500.

```ts
import { logger } from '@alxia/logger';

const app = alxia()
	.use(logger())                          // sees the 503 janusErrors() answers
	.use(janusErrors(), session(accounts));
```

## Statuses

`statusOf(code)` is `@nxgt/janus`'s, re-exported:

| Status | Codes |
| --- | --- |
| 400 | `USER_INVALID`, `PASSWORD_TOO_SHORT`, `HASH_UNSUPPORTED`, `TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`, `TOKEN_STALE`, `INVALID_CURSOR` |
| 401 | `CREDENTIALS_INVALID`, `CODE_INVALID` |
| 403 | `USER_INACTIVE`, `STEP_UP_REQUIRED` |
| 404 | `NOT_FOUND` |
| 409 | `LOGIN_TAKEN`, `VERSION_CONFLICT`, `SECOND_FACTOR_NOT_ENROLLED`, `SECOND_FACTOR_ACTIVE` |
| 500 | `PERMISSION_DEPTH` — a permission check walked past `maxDepth`: not a denial |
| 501 | `UNSUPPORTED` — a wiring mistake: a store lacks a method a flow needs |
| 503 | `STORE_FAILED` — **an outage, never a 401 or a 404** |

```ts
import { statusOf } from '@alxia/janus';

statusOf('STORE_FAILED'); // 503
statusOf('TOKEN_SPENT');  // 400
```

## Bodies

`bodyOf(error)` is the body: the `code`, and only what a client can act on.
**Never** the login, the `reason`, a hash prefix or a cause — those are for
your logs, and stay on the `JanusError`.

| Code | Body |
| --- | --- |
| `USER_INVALID` | `{ code, issues }` — `issues` is `[]` when the error carries none |
| `PASSWORD_TOO_SHORT` | `{ code, minLength? }` |
| `CODE_INVALID` | `{ code, attemptsLeft? }` |
| `CREDENTIALS_INVALID` | `{ code, retryAfter? }` — seconds; also sent as `Retry-After` |
| every other code | `{ code }` |

```ts
import { bodyOf } from '@alxia/janus';
import { NotFoundError } from '@nxgt/janus';

bodyOf(new NotFoundError('user')); // { code: 'NOT_FOUND' }
```

`CREDENTIALS_INVALID` is one code for an unknown login, a wrong password and
a login throttled for too many attempts: a client cannot tell a login exists
from it. `retryAfter` is set only once `janus()`'s throttle trips — ten
passwords in fifteen minutes by default — and the middleware then adds the
`Retry-After` header.

## Reporting the 5xx

```ts
const app = alxia().use(
	janusErrors({
		report: (error, ctx) => console.error(`${ctx.route}: ${error.code}`, error.cause),
	}),
	session(accounts),
);
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `report` | `(error: JanusError, ctx: BaseContext) => unknown` | none | called with every `JanusError` answered 500, 501 or 503 — `STORE_FAILED`, `UNSUPPORTED`, `PERMISSION_DEPTH` — the server's to fix |

`report` is started as the error is answered, not awaited: a slow report
never holds the response, and it cannot change the answer. One that throws
or rejects is a process warning, and the 503 is sent all the same:

```text
(node:13837) Warning: janusErrors(): report failed: Error: boom
```

The 4xx are not reported: they are the client's.

## On the wire

Every route after the middleware may answer these refusals: declare them in
your OpenAPI document, and the client you generate from it (with
`@nxgt/openapi-codegen`, say) reads them typed. A 401 from a route behind
`session(accounts, { required: true })` is either the session's
`{ error: 'unauthenticated' }` or janus's `{ code }`; a caller narrows on
the key:

```ts
import { alxia } from '@alxia/core';
import { janusErrors, session } from '@alxia/janus';

const app = alxia()
	.use(janusErrors(), session(accounts, { required: true }))
	.get('/me', ({ user, reply }) => reply(200, { name: user.name }));

const me = await app.request('/me');
const body = await me.json();
if (me.status === 401) {
	if ('error' in body) console.log('sign in first');   // the session's own 401
	else console.log(body.code);                          // a JanusErrorCode
}
if (me.status === 503) console.log(body.code);         // 'STORE_FAILED' and the like: try again later
```

### As problems

On an app that answers its errors as RFC 9457 problems, every answer of
this package is one, sent as `application/problem+json`, with the
`Retry-After` header kept: `janusErrors()`'s carries `bodyOf(error)` as
its extensions, `code` first among them (`JanusErrorProblem`); a
required `session()`'s 401 (`UnauthenticatedProblem`) and
`permission()`'s 401, 404 and 403 (`PermissionRefusedProblem`) carry
their five members alone. A caller narrows on `code` rather than on
`error`:

```text
503 {"type":"about:blank","title":"Service Unavailable","status":503,"detail":"Service Unavailable","instance":"/me","code":"STORE_FAILED"}
401 {"type":"about:blank","title":"Unauthorized","status":401,"detail":"The request has no session","instance":"/me"}
403 {"type":"about:blank","title":"Forbidden","status":403,"detail":"The view permission on this record is not granted","instance":"/records/r1"}
```

Each reads the format of the app serving the request, with
`@alxia/core`'s `errorFormat(ctx)`
([core's errors guide](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/errors.md)).

## Signatures

```ts
function janusErrors(options?: JanusErrorsOptions): JanusErrors;

// a middleware: answers the JanusErrors thrown behind it
type JanusErrors = Middleware<object, Promise<Next | Reply<JanusErrorStatus, JanusErrorBody | JanusErrorProblem>>>;

// under alxia({ errors: 'problem' })
type JanusErrorProblem = Problem<JanusErrorStatus, JanusErrorBody>;

interface JanusErrorsOptions {
	readonly report?: (error: JanusError, ctx: BaseContext) => unknown;
}

function bodyOf(error: JanusError): JanusErrorBody;

interface JanusErrorBody {
	readonly code: JanusErrorCode;
	readonly issues?: JanusError['issues'];
	readonly minLength?: number;
	readonly attemptsLeft?: number;
	readonly retryAfter?: number;
}

function statusOf(code: JanusErrorCode): JanusErrorStatus; // @nxgt/janus's
```

`JanusError`, `JanusErrorCode` and `JanusErrorStatus` are `@nxgt/janus`'s;
`Middleware`, `Next`, `Reply`, `Problem` and `BaseContext` are `@alxia/core`'s.

The permission guard's own refusals — `{ error: 'forbidden' }` and the
like — are not `JanusError`s; see [Permissions](permissions.md#refusals).
