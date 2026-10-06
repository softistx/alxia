# Lifecycle

`di` never creates the Container and, unless asked, never disposes of it.
This page covers booting it, disposing of it when the app stops, and
sharing it between forks.

## Boot: `init()` before `listen()`

Singletons are lazy. `await container.init()` creates them all, in provide
order, so a failing connection stops the boot rather than the first
request:

```ts
import { alxia } from '@alxia/core';
import { di } from '@alxia/di';
import { container, token } from '@nxgt/di';

interface Db { close(): Promise<void> }
declare function connect(): Promise<Db>;
const DbT = token<Db>()('db');

const services = container().provide(DbT, () => connect(), {
	dispose: (db) => db.close(),
});
const deps = di(services);
const app = alxia().plugin(deps.lifecycle).use(deps);

await services.init(); // rejects with the first factory's error
app.listen(3000);
```

Call it before `listen()`, never in `onStart`: `onStart` is not awaited,
and an error it throws is only logged, so the server would serve requests
with a Container that failed to boot.

## Dispose on stop: `deps.lifecycle`

`app.plugin(deps.lifecycle)` disposes of the Container when the app stops:
on `SIGTERM` or `SIGINT`, or `stop()`, after the requests in flight have
finished, within `listen`'s `stopTimeout`. Disposing runs every value's
`dispose` in reverse creation order.

It counts the apps it was given to that are serving, and disposes of the
Container when the last one stops. That is what makes forks safe.

## Forks

`app.fork()` copies a base, its `onStart` and `onStop` hooks included, and
each fork runs them once of its own. Two forks of a base that disposed of
the Container in a plain `onStop` would break each other: stopping the
first would dispose of the Container while the second still serves, and its
next request would fail with `ContainerDisposedError`.

```ts
import { alxia } from '@alxia/core';
import { di } from '@alxia/di';
import { container } from '@nxgt/di';

const services = container();
const deps = di(services);
const base = alxia().plugin(deps.lifecycle).use(deps);

const publicApi = base.fork();
const adminApi = base.fork();
publicApi.listen(3000);
adminApi.listen(3001);

await publicApi.stop(); // adminApi keeps the Container
await adminApi.stop(); // the last one: the Container is disposed of
```

- Disposing twice does nothing, so an app that also disposes of the
  Container itself does no harm.
- A disposed Container stays disposed: an app listening again after its
  stop needs a new Container, and a new `di`.
- An app that only answers `app.request()`, as a spec does, never starts,
  and `deps.lifecycle` never disposes of anything there.

## Without `deps.lifecycle`

The Container is then the application's: dispose of it where the
application decides, once nothing serves from it any more.

```ts
import { alxia } from '@alxia/core';
import { di } from '@alxia/di';
import { container } from '@nxgt/di';

const services = container();
const app = alxia()
	.use(di(services))
	.onStop(() => services[Symbol.asyncDispose]());
```

Do this on one app only, never on a base that is forked.
