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

It keeps the server each app it was given to started (`onStart` is given
it), and disposes of the Container when the last of them stops (`onStop`
is given the server that stopped). The count is per Container, across
every `di()` over it: two apps each with their own `di(services)` over one
`services` share it, and the Container is disposed of when the last of the
two stops, not the first. Giving `deps.lifecycle` twice to one app still
disposes once. That is what makes forks safe. Requires `@alxia/core` 0.14 or
later, where `onStop` receives the server.

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
- An app that never listened, such as one a spec calls with
  `app.request()`, still runs every `onStop` on `stop()`, given `undefined`:
  `deps.lifecycle` ignores it. A fork that never listened can be stopped
  while another serves; the Container stays with the one serving.

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
