# Serving the document and its page

This page covers `docs`: the plugin that serves the document at
`/openapi.json` and an API reference page at `/docs`, its options, and
where to `use` it so it documents — and is reachable by — the right
routes.

```ts
import { alxia } from '@alxia/core';
import { docs } from '@alxia/openapi';

const app = alxia().get('/ping', ({ reply }) => reply(200, 'pong'));
app.use(docs(app, { info: { title: 'Ping', version: '1.0.0' } }));

app.listen(3000);
// GET /openapi.json → 200, the document: paths ['/ping']
// GET /docs         → 200, a reference page that reads /openapi.json
```

`docs` takes the app it documents, and returns a plugin — an app holding
the two routes — which you give to that same app's `use`.

```ts
function docs(
	app: { readonly routes: readonly RouteDefinition[] },
	options: DocsOptions,
): Alxia<…>;
```

## Options

`DocsOptions` is every option of [`openapi`](document.md#options), and two
more:

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `info` | `OpenApiInfo` | required | The document's `info`; its `title` is also the page's `<title>`. |
| `servers` | `readonly { url; description? }[]` | none | The document's `servers`. |
| `convert` | `Converter` | none | See [Schemas and converters](converters.md). |
| `exclude` | `(route) => boolean` | none | Leaves a route out of the document. The plugin's own routes are always left out. |
| `path` | `` `/${string}` `` | `'/openapi.json'` | Where the document is served. |
| `ui` | `` `/${string}` `` \| `false` | `'/docs'` | Where the reference page is served; `false` serves none. |

```ts
interface DocsOptions extends OpenApiOptions {
	readonly path?: `/${string}`;
	readonly ui?: `/${string}` | false;
}
```

```ts
app.use(
	docs(app, {
		info: { title: 'Users', version: '1.0.0' },
		path: '/spec.json',
		ui: '/reference',
		exclude: (route) => route.path.startsWith('/internal'),
	}),
);
// GET /spec.json, GET /reference; /internal/* is not documented
```

`ui: false` serves the document alone — for a gateway, a client
generator, or a reference page hosted elsewhere:

```ts
app.use(docs(app, { info: { title: 'Users', version: '1.0.0' }, ui: false }));
// GET /openapi.json → 200; GET /docs → 404
```

## The document is made once, at its first request

`docs` does not build the document when it is called; it builds it when
`path` is first requested, and serves that same object afterwards. So it
holds every route declared before that first request — including those
declared after `use(docs(...))`:

```ts
const app = alxia();
app.use(docs(app, { info: { title: 'Users', version: '1.0.0' } }));
app.get('/users', ({ reply }) => reply(200, []));
// GET /openapi.json lists /users
```

A route added once the app is serving is not added to the document. Declare
every route before `listen`.

## The reference page

The page at `ui` is a small HTML document that loads
[Scalar](https://scalar.com) from `cdn.jsdelivr.net` and points it at
`path`, under the same prefix as the page. It is served with:

```text
content-type: text/html;charset=utf-8
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self'
```

So the browser that opens it needs to reach `cdn.jsdelivr.net`, and the
page can only fetch the document from the same origin. Where the CDN is
out of reach, serve the document with `ui: false` and host a reference
page yourself.

## Where to `use` it

The plugin's routes are routes of your app: they run the hooks declared
before `use`, like any route.

**Before a guard**, the document and the page are public, and the guarded
routes are still documented — the document is made at the first request,
when they exist:

```ts
const app = alxia().get('/health', ({ reply }) => reply(200, 'ok'));
app.use(docs(app, { info: { title: 'Users', version: '1.0.0' } }));

app
	.derive(({ request, reply }) => {
		if (request.headers.get('authorization') !== 'Bearer ada') {
			return reply(401, { error: 'unauthenticated' as const });
		}
		return { user: 'ada' };
	})
	.get('/me', ({ user, reply }) => reply(200, { user }));
// GET /openapi.json → 200, lists /health and /me; GET /me without a token → 401
```

**After a guard**, the document and the page need a token too.

**Only outside production**, wrap the `use` in a condition:

```ts
if (Bun.env['NODE_ENV'] !== 'production') {
	app.use(docs(app, { info: { title: 'Users', version: '1.0.0' } }));
}
```

**With a prefix**, or inside a group — one with a parameter too, such as
`/:tenant` — `path` and `ui` are under it like any route, and the page asks
for the document under the path it was itself asked at:

```ts
const api = alxia({ prefix: '/api' }).get('/ping', ({ reply }) => reply(200, 'pong'));
api.use(docs(api, { info: { title: 'Ping', version: '1.0.0' } }));
// GET /api/openapi.json lists /api/ping; GET /api/docs reads /api/openapi.json

const app = alxia().get('/ping', ({ reply }) => reply(200, 'pong'));
app.group('/v1', (group) =>
	group.use(docs(app, { info: { title: 'Ping', version: '1.0.0' }, ui: '/' })),
);
// GET /v1 reads /v1/openapi.json
```

Two `docs` plugins on one app, in two groups, each leave both out of
their document.

## Testing it

The plugin answers `app.fetch` like any route, so a test needs no server:

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { docs } from '@alxia/openapi';

test('serves the document and a page, and leaves itself out of it', async () => {
	const app = alxia().get('/ping', ({ reply }) => reply(200, 'pong'));
	app.use(docs(app, { info: { title: 'Ping', version: '1' } }));

	const json = await app.fetch(new Request('http://localhost/openapi.json'));
	expect(Object.keys((await json.json()).paths)).toEqual(['/ping']);

	const page = await app.fetch(new Request('http://localhost/docs'));
	expect(page.headers.get('content-type')).toContain('text/html');
	expect(await page.text()).toContain('data-url="/openapi.json"');
});
```

## Related

- [The document](document.md) — `openapi`, to write the document to a
  file instead of serving it.
- [How a route is documented](routes.md) — what the served document holds.
