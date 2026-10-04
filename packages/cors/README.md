# @alxia/cors

CORS for [alxia](https://www.npmjs.com/package/@alxia/core), with no
dependency: a preflight is answered before routing, and every response to an
allowed origin carries the headers a browser needs.

```sh
bun add @alxia/cors @alxia/core
bun add -d typescript
```

## Usage

```ts
import { alxia } from '@alxia/core';
import { cors } from '@alxia/cors';

const app = alxia()
	.use(cors({ origin: ['https://app.example.com', /\.example\.com$/], credentials: true }))
	.get(...);
```

With no options every origin is allowed, with `*`. With `credentials`, the
request's origin is echoed back instead, since `*` cannot carry them, and
`Vary: Origin` is set. A refused origin gets no CORS header: the browser
blocks the call.

`cors()` is a middleware: it answers a preflight itself, whatever its path,
and adds the headers to every response that comes back through it, a
404's and an error's included.

## Options

| option | default | |
| --- | --- | --- |
| `origin` | `true` | `true`, a string, a `RegExp`, a list of either, or `(origin) => boolean` |
| `methods` | all but `CONNECT` and `TRACE` | what a preflight allows |
| `allowedHeaders` | those the browser asks for | what a preflight allows |
| `exposedHeaders` | none | what a script may read |
| `credentials` | `false` | cookies and `Authorization` cross-origin |
| `maxAge` | none | seconds a preflight's answer is kept |
| `privateNetwork` | `false` | answers Private Network Access preflights |

## API

| export | |
| --- | --- |
| `cors(options?)` | the middleware, for `app.use` |
| `CorsOptions`, `CorsOrigin` | its options |
| `CorsMiddleware` | what `cors()` returns: a middleware that adds nothing to the context |

## Traps

`use` it first, on the app, not in a `group`: a middleware declared before
it that answers early (a guard's 401) hides its headers and refuses every
preflight, and a route declared before it gets none.

```ts
const app = alxia().use(cors({ origin: 'https://app.example.com' })).use(guard).get(...);
```

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/cors/docs): every option with its default and an example, what a refused origin gets, and where the middleware sits among an app's others.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/cors/docs/troubleshooting.md): a browser's CORS message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/cors/docs/roadmap.md): what is coming, and what is not planned.
