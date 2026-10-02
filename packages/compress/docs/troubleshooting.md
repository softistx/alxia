# Troubleshooting

`@alxia/compress` throws nothing of its own: a mistake is either a
TypeScript error, or a response that is not encoded the way you expected.
Each entry is headed by the text you see — what `tsc` prints, or the
header you read in the response.

**Types**

- [`Type '"identity"' is not assignable to type 'Encoding'`](#type-identity-is-not-assignable-to-type-encoding)
- [`Type 'RegExp' is not assignable to type '(type: string) => boolean'`](#type-regexp-is-not-assignable-to-type-type-string--boolean)
- [`Type 'Alxia<…>' has no properties in common with type 'CompressOptions'`](#type-alxia-has-no-properties-in-common-with-type-compressoptions)

**Responses**

- [No `Content-Encoding` on a response](#no-content-encoding-on-a-response)
- [`Content-Encoding: gzip` on a tiny body, larger than the original](#content-encoding-gzip-on-a-tiny-body-larger-than-the-original)
- [`Cache-Control: no-transform` and `Content-Encoding` on the same response](#cache-control-no-transform-and-content-encoding-on-the-same-response)
- [Server-sent events arrive late and in bursts](#server-sent-events-arrive-late-and-in-bursts)
- [`ETag: W/"…"` where the handler set `"…"`](#etag-w-where-the-handler-set-)
- [No `Content-Length` on a compressed response](#no-content-length-on-a-compressed-response)
- [`Vary: Accept-Encoding` on a response that is not compressed](#vary-accept-encoding-on-a-response-that-is-not-compressed)

## Types

### `Type '"identity"' is not assignable to type 'Encoding'`

**When:** `encodings` names something other than `zstd`, `br`, `gzip` or
`deflate`.

```text
error TS2322: Type '"identity"' is not assignable to type 'Encoding'.
```

The same message comes for `'brotli'`, `'x-gzip'` or `'compress'`.

**Why:** `encodings` lists what the plugin can produce, by the token that
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

### `Type 'Alxia<…>' has no properties in common with type 'CompressOptions'`

**When:** passing `compress` to `use` without calling it.

```text
error TS2769: No overload matches this call.
  Overload 1 of 2, '(plugin: (app: Alxia<Empty, Empty, "", never>) => AnyAlxia): AnyAlxia', gave the following error.
    Argument of type '(options?: CompressOptions) => Plugin' is not assignable to parameter of type '(app: Alxia<Empty, Empty, "", never>) => AnyAlxia'.
      Types of parameters 'options' and 'app' are incompatible.
        Type 'Alxia<Empty, Empty, "", never>' has no properties in common with type 'CompressOptions'.
```

**Why:** `compress` builds the plugin from its options; the plugin is what
it returns.

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
| its `Content-Length` is under `threshold` (1024 by default) | a short JSON error, a small string |
| `compress()` is not on this app | it was `use`d on another app, or not at all |

**Fix:** ask for an encoding to check the plugin works:

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

**When:** a body of a few bytes comes back compressed — a short stream, or
a small file served by `static`, `file` or `reply(200, Bun.file(…))` —
and its compressed size is larger than the original (a 2-byte stream
becomes 22 bytes of gzip).

**Why:** `threshold` is read from `Content-Length`. A stream and a file
have none when the hook runs, so their size is unknown and they are
compressed whatever it is.

**Fix:** for a static directory whose files are small, store compressed
copies and serve them, which the plugin leaves alone; for a stream that is
always small, mark it:

```ts
app.static('/assets', './public', { precompressed: ['br', 'gzip'] });

app.get('/ping', ({ reply }) => reply(200, smallStream, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-transform' } }));
```

### `Cache-Control: no-transform` and `Content-Encoding` on the same response

**When:** a hook sets `Cache-Control: no-transform`, and the response is
compressed anyway.

**Why:** `onResponse` hooks run in the order declared, and the hook that
sets the header runs after `compress()`, which has already decided. Every
hook after it also sees the compressed body: one that reads or measures
the body reads the encoded bytes.

**Fix:** declare the hooks that set `Cache-Control`, `Content-Type` or
`Content-Encoding` before `compress()`, and those that log after it:

```ts
const app = alxia()
	.onResponse((response) => withHeaders(response, (headers) => headers.set('cache-control', 'no-transform')))
	.use(compress());
```

A `Cache-Control` set by the handler itself (`reply(200, body, { headers })`
or `set.headers`) is always seen.

### Server-sent events arrive late and in bursts

**When:** a `compressible` of your own answers `true` for
`text/event-stream`, and a client receives each event only when the next
ones push it out, or when the stream ends.

**Why:** a compressor holds its input until a block fills. An event
stream sends a few bytes at a time, so an event can sit in the codec until
the stream closes. The default `compressible` refuses `text/event-stream`
for that reason.

**Fix:** keep event streams out of your test:

```ts
app.use(
	compress({
		compressible: (type) => !type.startsWith('text/event-stream') && /^(text\/|application\/json)/.test(type),
	}),
);
```

### `ETag: W/"…"` where the handler set `"…"`

**When:** a handler sets a strong `ETag`, the client receives it weak, and
a comparison with `If-None-Match` never matches.

**Why:** a strong ETag promises the same bytes, and the compressed bytes
differ from the uncompressed ones, so the plugin weakens it. The client
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

### `Vary: Accept-Encoding` on a response that is not compressed

**When:** a small response, a 404, a `HEAD`, or a request with no
`Accept-Encoding` carries `Vary: Accept-Encoding`.

**Why:** this is on purpose. The same URL is compressed for a client that
accepts it, so a cache must key the response on `Accept-Encoding` whether
this copy was compressed or not. It is added to every response whose type
is compressible.

**Fix:** nothing to fix. A response whose type is not compressible gets no
`Vary` from the plugin.
