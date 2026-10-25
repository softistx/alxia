# Testing

`server.create(wiring)` makes the app in process, from a build: import
the server, and pass it React Router's build, which
`build/server/index.js` holds. The test needs Bun's types:
`bun add -d @types/bun`, and `"bun"` in the tsconfig's `types`.

```ts
// app/server.test.ts
import { expect, test } from 'bun:test';
import type { ServerBuild } from 'react-router';
import server from './server';

const BROWSER = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

test('the home page renders', async () => {
	// After `bun run build`: React Router's build is inside the server build.
	const build: ServerBuild = await import(new URL('../build/server/index.js', import.meta.url).href);
	const app = server.create({ build, client: new URL('../build/client', import.meta.url) });
	const response = await app.request('/', { headers: { 'user-agent': BROWSER } });
	expect(response.status).toBe(200);
});
```

Or drive the built app itself, the default export of
`build/server/index.js`: importing it starts no server. Or run it, as
[the example's spec](https://github.com/softistx/alxia/blob/develop/examples/react-router/app/server.spec.ts)
does: `bun build/server/index.js` with `PORT=0`, then read the URL from
its `alxia listening on <url>` line.

Send a browser's user agent. `isbot('Bun/1.4.2')` is true, and React
Router's entry waits for the whole page before it answers a bot, so a test
with Bun's own user agent never sees a page stream. An index route's action
is `POST /?index`, not `POST /`.

`app.request` runs without a server, so a loader's `alxiaOf(context).server`
is `undefined` there, and a `publish` it guards with `?.` sends nothing.
To test one, listen on a free port, `app.listen({ port: 0 })`, open the
socket, then post to the action (`/todos.data`, the single-fetch URL, for
its data rather than the page).
