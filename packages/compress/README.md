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

Compressed: text, JSON, JavaScript, XML and SVG of at least `threshold`
bytes (1 KiB), files included; a `ReadableStream` has no length, and is
compressed whatever its size. Never: an event stream (it would wait for a
block to fill), a `HEAD`, a 204, 206 or 304, a response already encoded, or
one marked `Cache-Control: no-transform`. `Vary: Accept-Encoding` is set, a
strong ETag becomes weak, and `Accept-Ranges` is dropped from a compressed
response. Brotli runs at quality 4, near gzip's speed; for the smallest
static assets, serve copies compressed at build time with `static`'s
`precompressed` option.

## Options

| option | default | |
| --- | --- | --- |
| `encodings` | `['zstd', 'br', 'gzip', 'deflate']` | offered, in the server's order of preference |
| `threshold` | `1024` | bytes under which a body is sent as it is |
| `compressible` | text, JSON, JS, XML, SVG | `(contentType) => boolean` |

## API

| export | |
| --- | --- |
| `compress(options?)` | the plugin |
| `negotiate(accept, offered)` | the encoding an `Accept-Encoding` gets |
| `CompressOptions`, `Encoding` | its types |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/compress/docs): what is compressed and what is not, every option, the headers written, the order among other hooks, testing, and `negotiate`.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/compress/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/compress/docs/roadmap.md): what is coming, and what is not planned.
