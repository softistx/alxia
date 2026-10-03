# @alxia/logger

Request logging for [alxia](https://www.npmjs.com/package/@alxia/core), with
no dependency: a request id, one structured entry per request,
`Server-Timing`, and a log bound to the request.

```sh
bun add @alxia/logger @alxia/core
bun add -d typescript
```

## Usage

```ts
import { logger } from '@alxia/logger';

const app = alxia()
	.use(logger())
	.get('/orders/:id', ({ log, requestId, reply }) => {
		log.info('order read', { id: requestId });
		return reply(200, ...);
	});
```

Every request gets an id — the incoming `X-Request-Id` when it is one, or a
new UUID — sent back on its response. Once answered, one entry:

```json
{"time":"…","level":"info","requestId":"…","message":"GET /orders/7 200","method":"GET","path":"/orders/7","status":200,"duration":1.42,"ip":"127.0.0.1"}
```

A 4xx is a `warn`, a 5xx an `error`. A streamed body (a page rendered as
it goes, an event stream) is logged once it has been sent, its `duration`
to the last byte, with `timeToHeaders` and an `outcome`: `completed`,
`aborted` (a `warn`: the client left) or `errored` (an `error`):

```json
{"time":"…","level":"warn","requestId":"…","message":"GET /events 200 aborted","method":"GET","path":"/events","status":200,"duration":5012.3,"timeToHeaders":0.84,"outcome":"aborted","ip":"127.0.0.1"}
```

The routes after the plugin read `requestId`, and `log`, whose entries
carry it.

## Options

| option | default | |
| --- | --- | --- |
| `write` | a JSON line on stdout | `(entry) => void`: pino, a file, a service; a throw or a rejection loses the entry, never the request |
| `header` | `'x-request-id'` | where the id is read and sent |
| `generateId` | `crypto.randomUUID` | an id that is not 1–128 of letters, digits, `_.:@-` becomes a UUID |
| `trustIncomingId` | `true` | keep an incoming id |
| `serverTiming` | `true` | `Server-Timing: total;dur=…` |
| `skip` | none | `(request, url) => boolean`: a health check; a throw logs the request |

## API

| export | |
| --- | --- |
| `logger(options?)` | the plugin: an app that derives `requestId` and `log` |
| `LogEntry`, `RequestLog`, `LoggerOptions` | its types |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/logger/docs): every option and default, the entry's fields, `log` and `requestId`, where the plugin sits among other hooks, and testing.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/logger/docs/troubleshooting.md): an error message or a missing header, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/logger/docs/roadmap.md): what is coming, and what is not planned.
