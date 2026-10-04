# @alxia/compress

Response compression for [alxia](https://www.npmjs.com/package/@alxia/core):
zstd, Brotli, gzip and deflate, negotiated from `Accept-Encoding` and
streamed with Bun's and Node's own codecs. No dependency.

```sh
bun add @alxia/compress @alxia/core
bun add -d typescript
```

## Usage

```ts
import { compress } from '@alxia/compress';

app.use(compress());
app.use(compress({ encodings: ['br', 'gzip'], threshold: 2048 }));
```

`compress()` is a middleware: it compresses every response that comes back
through it, a 404's and an error's included.

Compressed: text, JSON, JavaScript, XML and SVG of at least `threshold`
bytes (1 KiB), files included; a `ReadableStream` has no length, and is
compressed whatever its size. Never: a `HEAD`, a 204, 206 or 304, a
response already encoded, or one marked `Cache-Control: no-transform`. An
event stream is left alone unless `compressible` lets it in.
`Vary: Accept-Encoding` is set, a strong ETag becomes weak, and
`Accept-Ranges` is dropped from a compressed response. Brotli runs at
quality 4, near gzip's speed; for the smallest static assets, serve copies
compressed at build time with `static`'s `precompressed` option.

## Streams

A body with no `Content-Length` — a `ReadableStream`, a server-rendered
page, an event stream let in — is flushed as it comes: what the source
yields in one turn of the event loop leaves at once, decodable, so a
page's shell reaches the browser before its deferred parts. A body with a
length is compressed whole, which compresses better.

```tsx
import { renderToReadableStream } from 'react-dom/server';

app.use(compress()).get('/page', async ({ reply }) =>
	reply(200, await renderToReadableStream(<App />), {
		headers: { 'content-type': 'text/html;charset=utf-8' },
	}),
);
// the shell arrives as soon as it is rendered, compressed
```

## Options

| option | default | |
| --- | --- | --- |
| `encodings` | `['zstd', 'br', 'gzip', 'deflate']` | offered, in the server's order of preference |
| `threshold` | `1024` | bytes under which a body is sent as it is |
| `compressible` | text, JSON, JS, XML, SVG | `(contentType) => boolean` |

## API

| export | |
| --- | --- |
| `compress(options?)` | the middleware, for `app.use` |
| `negotiate(accept, offered)` | the encoding an `Accept-Encoding` gets |
| `CompressOptions`, `Encoding` | its types |
| `CompressMiddleware` | what `compress()` returns: a middleware that adds nothing to the context |

## Traps

`use` it before the routes: a route declared before `app.use(compress())` is
not compressed. Declare it after `logger()` and `secureHeaders()`, so they
see the response as it leaves, and before a middleware that sets
`Cache-Control: no-transform` on the way out (see
[the guide](https://github.com/softistx/alxia/blob/develop/packages/compress/docs/guide.md#order-with-other-middlewares)).

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/compress/docs): what is compressed and what is not, streamed bodies, every option, the headers written, the order among other middlewares, testing, and `negotiate`.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/compress/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/compress/docs/roadmap.md): what is coming, and what is not planned.
