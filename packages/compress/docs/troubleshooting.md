# Troubleshooting

`@alxia/compress` throws nothing of its own: a mistake is either a
TypeScript error, or a response that is not encoded the way you expected.
Each entry is headed by the text you see — what `tsc` prints, or the
header you read in the response.

**Types**

- [`Type '"identity"' is not assignable to type 'Encoding'`](#type-identity-is-not-assignable-to-type-encoding)
- [`Type 'RegExp' is not assignable to type '(type: string) => boolean'`](#type-regexp-is-not-assignable-to-type-type-string--boolean)
- [`Type 'CompressMiddleware' is not assignable to type 'MiddlewareReturn'`](#type-compressmiddleware-is-not-assignable-to-type-middlewarereturn)

**Responses**

- [No `Content-Encoding` on a response](#no-content-encoding-on-a-response)
- [`Content-Encoding: gzip` on a tiny body, larger than the original](#content-encoding-gzip-on-a-tiny-body-larger-than-the-original)
- [`Cache-Control: no-transform` and `Content-Encoding` on the same response](#cache-control-no-transform-and-content-encoding-on-the-same-response)
- [A streamed page or server-sent events arrive late and in bursts](#a-streamed-page-or-server-sent-events-arrive-late-and-in-bursts)
- [A streamed body is larger compressed than the same body sent whole](#a-streamed-body-is-larger-compressed-than-the-same-body-sent-whole)
- [`ETag: W/"…"` where the handler set `"…"`](#etag-w-where-the-handler-set-)
- [No `Content-Length` on a compressed response](#no-content-length-on-a-compressed-response)
- [No `Accept-Ranges: bytes` on a compressed file](#no-accept-ranges-bytes-on-a-compressed-file)
- [`Vary: Accept-Encoding` on a response that is not compressed](#vary-accept-encoding-on-a-response-that-is-not-compressed)

## Types

### `Type '"identity"' is not assignable to type 'Encoding'`

**When:** `encodings` names something other than `zstd`, `br`, `gzip` or
`deflate`.

```text
error TS2322: Type '"identity"' is not assignable to type 'Encoding'.
```

The same message comes for `'brotli'`, `'x-gzip'` or `'compress'`.

**Why:** `encodings` lists what the middleware can produce, by the token that
goes in `Content-Encoding`. `identity` is not an encoding to offer — it is
what a client gets when none is chosen — and Brotli's token is `br`.

**Fix:** use the tokens, and leave `identity` out:

```ts
app.use(compress({ encodings: ['br', 'gzip'] }));
```

### `Type 'RegExp' is not assignable to type '(type: string) => boolean'`

**When:** `compressible` is given a regular expression.

```text
error TS2322: Type 'RegExp' is not assignable to type '(type: string) => boolean'.
  Type 'RegExp' provides no match for the signature '(type: string): boolean'.
```

**Why:** `compressible` is a function of the `Content-Type`.

**Fix:** wrap the expression:

```ts
app.use(compress({ compressible: (type) => /json|text\//.test(type) }));
```

### `Type 'CompressMiddleware' is not assignable to type 'MiddlewareReturn'`

**When:** passing `compress` to `app.use` without calling it.

```text
error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type '(options?: CompressOptions) => CompressMiddleware' is not assignable to parameter of type 'ScopeMiddleware<Empty, [], MiddlewareReturn>'.
      Type '(options?: CompressOptions) => CompressMiddleware' is not assignable to type '(ctx: BaseContext & Empty, next: NextFunction) => MiddlewareReturn'.
        Type 'CompressMiddleware' is not assignable to type 'MiddlewareReturn'.
```

TypeScript 7 prints the last overload alone, as above; TypeScript 6 lists the deprecated plugin forms of `use` first, then this one as `Overload 3 of 11`.

**Why:** `compress` builds the middleware from its options; the middleware
is what it returns.

**Fix:**

```ts
app.use(compress());
```

## Responses

### No `Content-Encoding` on a response

**When:** a response you expected compressed arrives as it is.

**Why:** one of these holds:

| Check | How to see it |
| --- | --- |
| the request sent no `Accept-Encoding`, only `identity`, or none of `encodings` | `curl` sends none unless given `--compressed`; `fetch` in a test sends what you pass |
| the `Content-Type` is not compressible | images, fonts, archives, `application/octet-stream`, `text/event-stream`; see [`compressible`](guide.md#compressible) |
| the request is a `HEAD`, or the status is 204, 206 or 304 | a range request answers 206 |
| the response already has a `Content-Encoding` | a precompressed file from `static(…, { precompressed })` |
| its `Cache-Control` holds `no-transform` | |
| its `Content-Length` is under `threshold` (1024 by default) | a short JSON error, a small string, a small file from `static` or `file` |
| `compress()` does not run for this route | it was given to `use` on another app, not at all, or after the route: a route declared before `app.use(compress())` is not compressed |

**Fix:** ask for an encoding to check the middleware works:

```sh
curl -s -D - -o /dev/null -H 'accept-encoding: gzip' localhost:3000/report
# Vary: Accept-Encoding
# Content-Encoding: gzip
# Transfer-Encoding: chunked
```

then lower `threshold` or widen `compressible` if the response is one you
want compressed:

```ts
app.use(compress({ threshold: 256 }));
```

### `Content-Encoding: gzip` on a tiny body, larger than the original

**When:** a `ReadableStream` of a few bytes comes back compressed, and
its compressed size is larger than the original (a 2-byte stream becomes
22 bytes of gzip).

**Why:** `threshold` is read from `Content-Length`. A stream has none when
the middleware sees it, so its size is unknown and it is compressed whatever it is.
A string, JSON or binary body — a file included — has one, and is measured.

**Fix:** for a stream that is always small, mark it, or send it as a
string or a `Blob` instead:

```ts
app.get('/ping', ({ reply }) => reply(200, smallStream, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-transform' } }));
```

### `Cache-Control: no-transform` and `Content-Encoding` on the same response

**When:** a middleware sets `Cache-Control: no-transform`, and the response is
compressed anyway.

**Why:** middlewares nest, and the first one declared is the outermost. A
middleware declared **before** `compress()` sets its header on the way out,
after `compress()` has already decided. Every middleware before it also sees
the compressed body: one that reads or measures the body reads the encoded
bytes.

**Fix:** declare the middlewares that set `Cache-Control`, `Content-Type` or
`Content-Encoding` after `compress()`, and those that log before it:

```ts
import { alxia, defineMiddleware, settle, withHeaders } from '@alxia/core';
import { compress } from '@alxia/compress';

const noTransform = defineMiddleware(async (ctx, next) =>
	withHeaders(await settle(ctx, next()), (headers) => headers.set('cache-control', 'no-transform')),
);

const app = alxia()
	.use(compress())
	.use(noTransform);
```

A `Cache-Control` set by the handler itself (`reply(200, body, { headers })`
or `set.headers`) is always seen.

### A streamed page or server-sent events arrive late and in bursts

**When:** a server-rendered page's shell, or the events of an event stream
that `compressible` lets in, reach the client only when later chunks push
them out, or when the stream ends.

**Why:** not the middleware. A body with no `Content-Length` is flushed after
the chunks of each turn of the event loop, in every encoding: see
[Streamed bodies](guide.md#streamed-bodies). An earlier `@alxia/compress`
held a stream in the codec until a block filled, and the default
`compressible` left event streams out for that reason; it still leaves
them out, now because events are small. What holds a stream back now is
outside the middleware:

| Cause | How to see it |
| --- | --- |
| a proxy in front of the server buffers the response | the delay is gone with `curl -N` against the server itself; nginx honours the `X-Accel-Buffering: no` that alxia sets on an event stream, not on a page |
| a middleware before `compress()` reads the body, as `await response.text()` does, and answers a new one | the middleware's response has a `Content-Length` |
| the response has a `Content-Length` | a body with one is compressed whole; a stream handed to `reply` has none |
| the renderer waits for everything before it writes | React Router's default entry waits for `allReady` when the user agent looks like a bot, as Bun's default user agent does: send a browser's |

**Fix:** check the server alone first, and decode as it comes:

```sh
curl -N -s -H 'accept-encoding: gzip' localhost:3000/page | gunzip
# the shell prints at once, the deferred part after it
```

### A streamed body is larger compressed than the same body sent whole

**When:** a `ReadableStream` that yields many small chunks, each in a turn
of its own — a row at a time from a cursor, a token at a time — comes out
much larger than the same text compressed in one piece: on a 41 KB page
of 308 small chunks, 56% larger in gzip and deflate, and 89–94% in br and
zstd.

**Why:** a streamed body is flushed after each turn of the event loop, so
what the source yields leaves at once. Each flush ends a block, and a
block costs bytes. Chunks yielded in the same turn share one flush, which
costs almost nothing: the same page written in three turns came out within
2% of the whole.

**Fix:** batch in the source what has no reason to leave alone, or, for a
body that need not stream, send it with a length:

```ts
// a row at a time, batched by 100 before it is yielded
async function* batched(rows: AsyncIterable<string>) {
	let batch = '';
	let count = 0;
	for await (const row of rows) {
		batch += row;
		if (++count % 100 === 0) {
			yield batch;
			batch = '';
		}
	}
	if (batch !== '') yield batch;
}

app.get('/report', async ({ reply }) =>
	reply(200, ReadableStream.from(batched(rows())).pipeThrough(new TextEncoderStream()), {
		headers: { 'content-type': 'text/csv' },
	}),
);
```

### `ETag: W/"…"` where the handler set `"…"`

**When:** a handler sets a strong `ETag`, the client receives it weak, and
a comparison with `If-None-Match` never matches.

**Why:** a strong ETag promises the same bytes, and the compressed bytes
differ from the uncompressed ones, so the middleware weakens it. The client
then sends `If-None-Match: W/"…"`.

**Fix:** compare the tag weakly, ignoring the `W/` prefix:

```ts
const match = request.headers.get('if-none-match')?.replace(/^W\//, '');
if (match === etag) return reply(304);
```

### No `Content-Length` on a compressed response

**When:** a client, a proxy or a test expects a `Content-Length`.

**Why:** the body is compressed as it is streamed, so its final size is not
known when the headers leave; the header is removed rather than left
wrong, and the response is sent chunked.

**Fix:** read the body to know its size; to keep a `Content-Length` on a
response, keep it out of compression:

```ts
reply(200, body, { headers: { 'cache-control': 'no-transform' } });
```

### No `Accept-Ranges: bytes` on a compressed file

**When:** a file served by `static` or `file` carries `Accept-Ranges:
bytes` when fetched without `Accept-Encoding`, and none when it comes back
compressed.

**Why:** a byte range of the encoded body is not a range of the file, so
the middleware removes the header rather than advertise ranges of a body that
is not the one sent. A request that carries `Range` is answered 206 with
the slice, uncompressed: the middleware never compresses a 206.

**Fix:** nothing to fix: a client that seeks sends `Range` and gets the
slice. To keep `Accept-Ranges` on every response for a file type, keep it
out of compression:

```ts
// The default test, as the guide's `compressible` section spells it.
const defaults = /^(text\/(?!event-stream)|application\/(.+\+)?(json|javascript|xml)|image\/svg\+xml)/i;

app.use(compress({ compressible: (type) => defaults.test(type) && !type.startsWith('text/csv') }));
```

### `Vary: Accept-Encoding` on a response that is not compressed

**When:** a small response, a 404, a `HEAD`, or a request with no
`Accept-Encoding` carries `Vary: Accept-Encoding`.

**Why:** this is on purpose. The same URL is compressed for a client that
accepts it, so a cache must key the response on `Accept-Encoding` whether
this copy was compressed or not. It is added to every response whose type
is compressible.

**Fix:** nothing to fix. A response whose type is not compressible gets no
`Vary` from the middleware.
