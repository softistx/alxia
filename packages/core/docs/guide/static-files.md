# Static files

This page covers serving files: a directory or any other source with
`static`, one file with `file`, and Bun's HTML bundles with `page`.

```ts
import { alxia } from '@alxia/core';

const app = alxia()
	.static('/assets', './public')            // GET /assets/* from ./public
	.file('/favicon.ico', './static/favicon.ico');

app.listen(3000);
```

`static` and `file` are `GET` routes like any other: every hook runs around
them — headers, compression, logging, a `derive` that guards them — and
they are in `app.routes`: `@alxia/openapi`'s `matchesSpec` sees them, so
leave them out with its `exclude` unless the document declares them.
`page` is the exception, below.

## `static(path, source, options?)`

```ts
static<const Path extends RoutePath>(path: Path, source: FileSource, options?: StaticOptions): Alxia<…>
```

`path/*` is checked as a route path: `static('/assets/*', …)` does not
compile, its route `/assets/*/*` having a `*` before the end. A function
forwarding a path generic in `P` types its parameter with the same check,
so the path is checked where the function is called:

```ts
import { alxia, type PathAt, type RoutePath, type StaticPath } from '@alxia/core';

export function servedAt<const P extends RoutePath>(path: PathAt<'', P, StaticPath<P>>) {
	return alxia().static(path, './public');
}
```

A `GET` route at `path/*` (`/*` for `/`). The rest of the URL is looked up
in `source`, then, for a path with no extension, with each of
`extensions`, then as a directory with each `index`.

| Request | `./public` holds | Served |
| --- | --- | --- |
| `/assets/app.js` | `app.js` | `app.js` |
| `/assets/` | `index.html` | `index.html` |
| `/assets/docs` | `docs/index.html` | `docs/index.html` |
| `/assets/about`, with `extensions: ['html']` | `about.html` | `about.html` |
| `/assets/.env` | `.env` | 404: a dotfile |
| `/assets/../secret`, `/assets/%2e%2e/etc/passwd`, `/assets/a%5C..%5Cb` | — | 404: leaves the source |
| `/assets/nope` | — | 404, or `fallback` |

### Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `index` | `string \| readonly string[] \| false` | `'index.html'` | the file a directory serves: one, several tried in order, or none |
| `extensions` | `readonly string[]` | none | tried for a path without an extension: `['html']` serves `/about` from `about.html` |
| `fallback` | `string` | none | a file, relative to the source, served with a 200 for a path that matches none: a single-page app's `index.html` |
| `dotfiles` | `boolean` | `false` | whether a file or directory starting with `.` is served |
| `precompressed` | `readonly ('br' \| 'zstd' \| 'gzip')[]` | none | codings stored beside each file (`app.js.br`, `app.js.zst`, `app.js.gz`), tried in this order for a client whose `Accept-Encoding` takes them |
| `cacheControl` | `string \| false \| ((path) => string \| false)` | `'public, max-age=0'` | `Cache-Control`: a value, none, or one per path |
| `headers` | `HeadersInit \| ((path, file) => HeadersInit \| undefined)` | none | headers added to every file, or to each; a `Vary` adds its names to the ones the file varies by — `Accept-Encoding` when `precompressed` names a coding — (`*` replaces them), and each `Set-Cookie` is sent |
| `types` | `Record<string, string>` | Bun's | content types by extension, over the ones Bun knows |
| `etag` | `boolean` | `true` | a weak `ETag`, answered 304 |
| `lastModified` | `boolean` | `true` | `Last-Modified`, answered 304 |
| `ranges` | `boolean` | `true` | `Range` requests, answered 206 |

The `path` the functions receive is the file found, relative to the source:
`docs/index.html` for `/assets/docs`.

### A built front end

Hashed assets cached for a year, the HTML revalidated, the compressed
copies the build wrote served when the client takes them, and every
unknown path answered with the app shell:

```ts
const app = alxia()
	.get('/api/health', ({ reply }) => reply(200, 'ok'))
	.static('/', './dist', {
		fallback: 'index.html',
		precompressed: ['br', 'gzip'],
		cacheControl: (path) =>
			/\.[0-9a-f]{8}\./.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
		types: { '.wasm': 'application/wasm' },
		headers: (path) => (path.endsWith('.html') ? { 'x-frame-options': 'DENY' } : undefined),
	});
```

A more specific route wins over the wildcard, whichever is declared first
([Which route answers](routes.md#which-route-answers)): `/api/health` is
not looked up in `./dist`.

### Any source

`source` is a directory, or a function from the relative path to a `Blob`.
`null` or `undefined` is a 404.

```ts
type FileSource =
	| string
	| ((path: string, ctx: BaseContext) => MaybePromise<Blob | null | undefined>);
```

```ts
// files held in memory
const files = new Map([
	['data.json', new File(['{"a":1}'], 'data.json', { type: 'application/json' })],
]);
app.static('/mem', (path) => files.get(path));

// an S3 bucket
app.static('/media', async (path) => {
	const file = Bun.s3.file(`media/${path}`);
	return (await file.exists()) ? file : null;
});
```

The function also receives the request's context, a `BaseContext`: a
source can depend on the request's URL, headers or host.

## `file(path, file, options?)`

One file at one path: `/favicon.ico`, `/robots.txt`, a generated sitemap.

```ts
app
	.file('/favicon.ico', './static/favicon.ico')          // a path, read anew on each request
	.file('/robots.txt', new Blob(['User-agent: *'], { type: 'text/plain' }))
	.file('/sitemap.xml', async () =>
		new Blob([await renderSitemap()], { type: 'application/xml' }),
	)
	.file('/beta.js', ({ request }) =>
		request.headers.get('x-beta') === 'yes' ? Bun.file('./beta.js') : null, // null is a 404
	);
```

It takes the options shared with `static` — `cacheControl`, `headers`,
`types`, `etag`, `lastModified`, `ranges` (`FileOptions`) — not `index`,
`extensions`, `fallback`, `dotfiles` or `precompressed`. A path on disk
that does not exist is a 404.

## What a file route answers

| Status | When | Body |
| --- | --- | --- |
| 200 | the file | the file |
| 304 | `If-None-Match` matches the `ETag`, or, without it, `If-Modified-Since` is not older than the file | none |
| 206 | a single `Range` the file satisfies; with `If-Range`, only when it names the current copy | the slice, with `Content-Range` |
| 416 | a `Range` past the end; on an empty file, any range but a non-zero suffix (`bytes=-5`, served whole as a 200) | `{ "error": "range_not_satisfiable" }`, `Content-Range: bytes */<size>` |
| 404 | no file, a dotfile, a path that leaves the source | `{ "error": "not_found" }` |

- `HEAD` answers the same headers without the body, as for every `GET`
  route.
- The `ETag` is weak, from the size and modification time. A `Blob` with
  neither — one built in memory, not a `File` — gets no `ETag` and no
  `Last-Modified`.
- A request with several ranges, or a malformed one, gets the whole file.
- A weak `If-Range` never validates a range: the whole file is sent.
- A precompressed copy is sent with `Content-Encoding` and
  `Vary: Accept-Encoding`, and without ranges. With `precompressed`
  naming a coding, every reply for a file carries `Vary: Accept-Encoding` —
  the plain file included, whether or not a copy exists — so a shared cache
  never hands one client's answer to another.

`parseRange(header, size)` is the parser the routes use, exported for a
handler that serves ranges of its own:

```ts
import { parseRange } from '@alxia/core';

parseRange('bytes=0-9', 100);   // { start: 0, end: 9 }
parseRange('bytes=-20', 100);   // { start: 80, end: 99 }
parseRange('bytes=100-', 100);  // 'unsatisfiable'
parseRange('bytes=0-1,3-4', 100); // undefined: serve the whole file
parseRange('bytes=-5', 0);      // undefined: an empty file is served whole
```

In the types, a file route answers `StaticReply`: a `Blob` with 200 or
206, nothing with 304, `FileNotFoundBody` with 404 and
`RangeNotSatisfiableBody` with 416.

## Bun HTML bundles

```ts
import { alxia } from '@alxia/core';
import dashboard from './dashboard/index.html';

const app = alxia()
	.get('/api/stats', ({ reply }) => reply(200, { users: 1 }))
	.page('/dashboard', dashboard);

app.listen({ port: 3000, development: true }); // hot reloading
```

`page(path, bundle)` hands a page of Bun's full-stack bundling to
`Bun.serve`: its scripts and styles are bundled by Bun, and hot-reloaded
under `development`. Because Bun serves it itself:

- it works through **`listen` only** — `app.fetch` and `app.request`
  answer it 404;
- the app's hooks do **not** run around it;
- it is not in `app.routes`, so `matchesSpec` does not see it, and a client
  generated from the document does not call it.

A page of a plugin app is mounted under the prefix of the app that uses it.
A path served twice — or two paths of the same shape, `/u/:id` and
`/u/:name` — throws, in either order, and through a group or a plugin too:

- two pages, or a page where a route is already declared, throw
  `page(): /dashboard is already served`;
- a route or a socket where a page is already declared throws
  `GET /dashboard is already served by a page` (`WS …` for a socket).

A page's path is checked as a route's is, so a page at `/café` or `/*.js`
throws the same `TypeError` ([Paths](routes.md#paths)). Bun matches a page
on the request's target as it was sent, unresolved dot segments and all.

A page at `/dashboard` beside a route at `/:id` is no conflict: Bun serves
the page at `/dashboard`, and the route every other path.

## See also

- [Replies](replies.md#how-a-body-is-sent): a handler can also reply with a
  `Bun.file`, without the 304s and ranges.
- [Serving](serving.md): `listen` and `development`.
