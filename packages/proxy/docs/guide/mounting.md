# Mounting a prefix

This page covers `proxy.mount`: giving everything under a prefix to another
app, and `rebase`, which puts the upstream's redirects and cookies back under
that prefix.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia()
	.get('/local', ({ reply }) => reply(200, 'local'))
	.plugin(proxy.mount('/legacy', 'http://old-app:3000'));
```

`/legacy/orders/9?force=1` reaches `/orders/9?force=1` on the upstream, whatever
the method. `/legacy` reaches `/`. `/legacyish` is not matched: the app answers
its own 404.

```ts no-check
function mount<Prefix extends `/${string}`, Ctx>(prefix: Prefix, target: string | URL, options?: ProxyOptions<Ctx>): ProxyMount<Prefix, Ctx>;
```

## What it does for you

| | `proxy.mount(prefix, …)` | `use(path, proxy(…))` |
| --- | --- | --- |
| `rewrite` | the prefix | none |
| `rebase` | the prefix | `false` |
| matches | the prefix and below | the path and below |
| runs | behind the `use()` middlewares declared before the plugin | likewise |

The prefix starts with `/` and does not end with one; `'/'` and `'/legacy/'` throw a
`TypeError`. A `rewrite` or `rebase` in the options replaces the default.

Mount after your auth and rate limit, and they cover it:

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia()
	.use(async (ctx, next) =>
		ctx.request.headers.get('x-key') === 'k' ? next() : ctx.reply(401, 'no key'),
	)
	.plugin(proxy.mount('/legacy', 'http://old-app:3000', { timeout: 5_000 }));
```

A mount whose header callbacks read `user` requires of the app what they read: a
compile error on `plugin()` otherwise, `the plugin reads "user", which this app's context does not give: add the plugin or middleware that gives it first`.

## `rebase`

An upstream knows nothing of the prefix. Without `rebase`, its redirect to
`/orders/9` sends the browser to `/orders/9` on your host, not `/legacy/orders/9`.

| `rebase` | Effect |
| --- | --- |
| `false` | nothing rewritten (the default of `proxy()`) |
| `true` | under the prefix `rewrite` strips (`''` with a function) |
| `'/app'` | under that prefix |

- **`Location`**: a path, or an absolute URL on the upstream's origin under the
  target's path, moves under the prefix, query and fragment kept. Another
  origin, or a relative location, is left.
- **`Set-Cookie`**: a `Domain` equal to the upstream's hostname is dropped, so
  the cookie belongs to the public host; a `Path` under the target's path moves
  under the prefix. Other domains are kept.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().use('/shop', proxy('http://shop.internal:3000/app', {
	rewrite: '/shop',
	rebase: true,
}));
// Location: http://shop.internal:3000/app/cart -> /shop/cart
// Set-Cookie: sid=1; Path=/app; Domain=shop.internal -> sid=1; Path=/shop
```

## Spec-first apps

`proxy.mount()` declares no route, so `@alxia/openapi`'s `matchesSpec` has
nothing to match it against. See [The basics](basics.md#spec-first-apps).

Next: [Failures](failures.md).
