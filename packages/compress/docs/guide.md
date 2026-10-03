# Guide

This page covers what `compress()` compresses, what it leaves alone, the
headers it writes, its options, and `negotiate` on its own.

```ts
import { alxia } from '@alxia/core';
import { compress } from '@alxia/compress';

const app = alxia()
	.use(compress())
	.get('/report', ({ reply }) => reply(200, { rows: Array.from({ length: 500 }, (_, i) => ({ i })) }));

app.listen(3000);
```

A client sending `Accept-Encoding: gzip, br, zstd` receives the JSON as
zstd; one sending `gzip` receives gzip; one sending nothing receives it as
it is.

## Signatures

```ts
type Encoding = 'zstd' | 'br' | 'gzip' | 'deflate';

interface CompressOptions {
	readonly encodings?: readonly Encoding[];
	readonly threshold?: number;
	readonly compressible?: (type: string) => boolean;
}

function compress(options?: CompressOptions): Plugin;

function negotiate(accept: string | null, offered: readonly Encoding[]): Encoding | undefined;
```

`compress` returns a function `Plugin` from `@alxia/core`: it adds one
`onResponse` hook and leaves the app's type unchanged, so routes, replies
and the client's types are the same with or without it.

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `encodings` | `readonly Encoding[]` | `['zstd', 'br', 'gzip', 'deflate']` | the encodings offered, in the server's order of preference |
| `threshold` | `number` | `1024` | a body whose `Content-Length` is under this many bytes is sent as it is |
| `compressible` | `(type: string) => boolean` | text, JSON, JavaScript, XML, SVG | whether a response's `Content-Type` is worth compressing |

### `encodings`

The client's `q` values decide first; among encodings the client weighs
equally, the first in `encodings` wins. Leave out what you do not want to
spend CPU on:

```ts
app.use(compress({ encodings: ['br', 'gzip'] }));
```

| `Accept-Encoding` | `encodings` | Sent |
| --- | --- | --- |
| `gzip, deflate, br, zstd` | default | `zstd` |
| `gzip, br` | `['br', 'gzip']` | `br` |
| `gzip, br` | `['gzip', 'br']` | `gzip` |
| `gzip;q=1, br;q=0.8` | `['br', 'gzip']` | `gzip`: the client prefers it |
| `zstd` | `['br', 'gzip']` | nothing: not offered |
| `identity`, or no header | any | nothing |

`zstd` and `gzip` and `deflate` go through the runtime's
`CompressionStream`; `br` through `node:zlib`'s `createBrotliCompress`
at quality 4, not zlib's default of 11. Quality 11 is meant for
compressing once, ahead of time: paid on every request, it costs many
times gzip's CPU for a few percent, while 4 is still smaller than gzip at
about its speed. None of the codecs' levels is an option. For the smallest
static assets, let the build write `.br` and `.gz` copies at the highest
level and serve them with `static`'s
[`precompressed`](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/static-files.md#options)
option; the plugin leaves them alone. An empty list never compresses.

### `threshold`

Read from the response's `Content-Length`. A JSON or string reply has one
when the hook runs, and so does a binary one — a `Blob`, a `Bun.file(…)`,
what `static` and `file` serve, an `ArrayBuffer` or a typed array. A
`ReadableStream` does not: its size is unknown until it ends, and **a body
with no `Content-Length` is compressed whatever its size**:

```ts
app.use(compress({ threshold: 2048 }));
// reply(200, 'x'.repeat(1500))          → sent as it is: 1500 < 2048
// reply(200, { text: 'alxia '.repeat(1000) }) → compressed: 6011 bytes
// static('/s', '.') for a 117-byte file → sent as it is: 117 < 2048
// reply(200, readableStreamOfTwoBytes)  → compressed: no Content-Length
```

`threshold: 0` compresses every compressible body.

### `compressible`

Called with the response's `Content-Type` as it is, parameters included
(`text/plain;charset=utf-8`), or `''` when there is none. The default
accepts:

| Accepted | Examples |
| --- | --- |
| any `text/*` except `text/event-stream` | `text/html`, `text/css`, `text/csv`, `text/markdown` |
| `application/json`, `application/javascript`, `application/xml`, and their `+suffix` forms | `application/problem+json`, `application/ld+json`, `application/atom+xml` |
| `image/svg+xml` | |

Anything else — images, video, fonts, archives, `application/octet-stream`,
`application/wasm` — is sent as it is. To add a type, keep the default's
test and extend it:

```ts
const defaults = /^(text\/(?!event-stream)|application\/(.+\+)?(json|javascript|xml)|image\/svg\+xml)/i;

app.use(
	compress({
		compressible: (type) => defaults.test(type) || type.startsWith('application/wasm'),
	}),
);
```

A function that answers `true` for `text/event-stream` compresses event
streams, and the codec then holds each event until a block fills: see
[Troubleshooting](troubleshooting.md#server-sent-events-arrive-late-and-in-bursts).

## What is never compressed

Whatever `compressible` says, a response is sent as it is when:

| Condition | Why |
| --- | --- |
| it has no body | nothing to compress |
| the request is a `HEAD` | it has no body to send |
| its status is 204, 206 or 304 | no body, or a byte range of the uncompressed one |
| it already has a `Content-Encoding` | a precompressed file from `static(…, { precompressed })`, or a body a handler encoded |
| its `Cache-Control` holds `no-transform` | the sender asked for its bytes to be kept |
| its `Content-Length` is under `threshold` | the gain would be smaller than the headers |
| the client accepts none of `encodings` | |

## The headers it writes

On a compressed response:

| Header | What happens |
| --- | --- |
| `Content-Encoding` | set to the encoding chosen |
| `Content-Length` | removed: the body is streamed, its final size unknown |
| `Accept-Ranges` | removed: a range of the encoded body is not a range of the file |
| `ETag` | a strong one (`"v1"`) becomes weak (`W/"v1"`); a weak one is kept |
| `Vary` | `Accept-Encoding` added |

The status and status text are kept. `Vary: Accept-Encoding` is added to
**every** response whose type is compressible, compressed or not — a small
one, a 404, a `HEAD` — so a cache never serves the compressed body to a
client that did not ask for it. An existing `Vary` keeps its names, and
`Vary: *` is left as it is.

The weak `ETag` comes back in `If-None-Match` as `W/"v1"`; compare it
weakly:

```ts
app.get('/doc', ({ request, reply }) => {
	const etag = '"v1"';
	const match = request.headers.get('if-none-match')?.replace(/^W\//, '');
	return match === etag ? reply(304) : reply(200, document, { headers: { etag } });
});
```

## Order with other hooks

`compress()` is an `onResponse` hook, and `onResponse` hooks run in the
order they are declared. It reads the headers as the hooks before it left
them, and the hooks after it see the compressed response.

```ts
import { alxia, withHeaders } from '@alxia/core';
import { compress } from '@alxia/compress';

const app = alxia()
	// before: compress() reads this Cache-Control
	.onResponse((response, { request }) =>
		new URL(request.url).pathname.startsWith('/raw/')
			? withHeaders(response, (headers) => headers.set('cache-control', 'no-transform'))
			: undefined,
	)
	.use(compress())
	// after: sees Content-Encoding, and no Content-Length on a compressed body
	.onResponse((response, { request }) => {
		console.log(request.method, request.url, response.status, response.headers.get('content-encoding') ?? 'identity');
	});
```

Declare `compress()` after every hook that sets `Content-Type`,
`Cache-Control` or `Content-Encoding`, and before every hook that logs or
measures what is sent.

## A realistic app

An API, a built front end whose bundler already wrote `.br` and `.gz`
copies, and an event stream — compressed where it pays, and nowhere else:

```ts
import { alxia, eventStream } from '@alxia/core';
import { compress } from '@alxia/compress';
import { z } from 'zod';

const Tick = z.object({ at: z.number() });

const app = alxia()
	.use(compress({ encodings: ['zstd', 'br', 'gzip'] }))
	.get('/api/products', ({ reply }) => reply(200, products))  // JSON: compressed over 1 KiB
	.get('/api/ticks', { response: { 200: eventStream(Tick) } }, ({ reply }) =>
		reply(
			200,
			(async function* () {
				yield { at: Date.now() };                         // text/event-stream: never compressed
			})(),
		),
	)
	.static('/', './dist', {
		fallback: 'index.html',
		precompressed: ['br', 'gzip'],                         // app.js.br is served as it is
	});

app.listen(3000);
```

A file `static` serves without a precompressed copy — `index.html`, an SVG
— is compressed on the fly when it is at least
[`threshold`](#threshold) bytes, and sent without `Accept-Ranges`; one
with a copy keeps its `Content-Encoding` and is left alone; a range
request answered 206 is never compressed.

## Testing it

`app.request` runs the app in process, so the encoding can be asserted and
the body decoded with `node:zlib`:

```ts
import { expect, test } from 'bun:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { alxia } from '@alxia/core';
import { compress } from '@alxia/compress';

const big = 'alxia '.repeat(1000);
const app = alxia()
	.use(compress())
	.get('/big', ({ reply }) => reply(200, { text: big }));

const get = (encoding: string) => app.request('/big', { headers: { 'accept-encoding': encoding } });

test('gzip, then Brotli when the client prefers it', async () => {
	const gzip = await get('gzip');
	expect(gzip.headers.get('content-encoding')).toBe('gzip');
	expect(gzip.headers.get('vary')).toBe('Accept-Encoding');
	expect(JSON.parse(gunzipSync(new Uint8Array(await gzip.arrayBuffer())).toString()).text).toBe(big);

	const br = await get('gzip;q=0.5, br');
	expect(br.headers.get('content-encoding')).toBe('br');
	expect(JSON.parse(brotliDecompressSync(new Uint8Array(await br.arrayBuffer())).toString()).text).toBe(big);
});

test('identity only: sent as it is', async () => {
	expect((await get('identity')).headers.get('content-encoding')).toBeNull();
});
```

## `negotiate(accept, offered)`

The choice `compress()` makes, exported for a handler or a plugin that
encodes on its own — a file it caches per encoding, a proxy:

```ts
import { negotiate } from '@alxia/compress';

negotiate('gzip, deflate, br, zstd', ['zstd', 'br', 'gzip']); // 'zstd'
negotiate('gzip;q=1, br;q=0.8', ['br', 'gzip']);              // 'gzip'
negotiate('*', ['gzip']);                                     // 'gzip'
negotiate('*, gzip;q=0', ['gzip', 'br']);                     // 'br'
negotiate('br;q=0', ['br']);                                  // undefined
negotiate('identity', ['gzip']);                              // undefined
negotiate(null, ['gzip']);                                    // undefined
```

- `accept` is the raw `Accept-Encoding`, or `null` when the request has
  none: `request.headers.get('accept-encoding')`.
- Names are compared case-insensitively. A missing `q` is 1; a `q` that is
  not a number is 0.
- `*` stands for every encoding the header does not name; an encoding named
  with `q=0` is refused even under `*`.
- The highest `q` wins; on a tie, the first in `offered`.
- `undefined` means send the body as it is.

Something not behaving as described here: see
[Troubleshooting](troubleshooting.md).
