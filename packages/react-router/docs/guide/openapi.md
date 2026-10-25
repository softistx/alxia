# OpenAPI

alxia is OpenAPI spec first: the document is written by hand, the API's
routes are bound to the operations generated from it, and
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi)'s
`matchesSpec` checks, in a test, that every operation has its route; with
`strict: true`, that `app.routes` and the operations match both ways. The
catch-all and the client's files are routes of `app.routes`, and no
operation of the document. Under `strict`, leave them out with
`isReactRouterRoute`, which is true for each route this package declared:

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';
import { operations } from './generated/alxia';

export default createServer({
	configure: (app) =>
		app
			.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
			.route(operations.listOrders, ({ reply }) => reply.ok([])),
});
```

```ts
// app/server.test.ts
import { test } from 'bun:test';
import { matchesSpec } from '@alxia/openapi';
import { isReactRouterRoute } from '@alxia/react-router';
import type { ServerBuild } from 'react-router';
import { operations } from './generated/alxia';
import server from './server';

test('the API routes every operation of openapi.yaml, and nothing else', async () => {
	const build: ServerBuild = await import(new URL('../build/server/index.js', import.meta.url).href);
	const app = server.create({ build });
	matchesSpec(app, operations, {
		strict: true,
		exclude: (route) => isReactRouterRoute(route) || route.path === '/api/health',
	});
});
```

When the app puts the operations under a prefix the document's paths
leave out, `app.group('/api', (api) => api.route(…))`, give `matchesSpec`
the same `prefix: '/api'`. See
[`@alxia/openapi`'s matching](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/matching.md#under-a-prefix).
