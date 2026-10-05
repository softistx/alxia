// An app with a proxy, a mount and a relayed socket, behind exported
// functions whose return types are inferred: a declaration build must be
// able to name each one through `@alxia/proxy` and `@alxia/core` alone
// (TS2883 otherwise).
import { alxia, type BaseContext } from '@alxia/core';
import { type ProxyOptions, proxy } from '@alxia/proxy';

export function gateway() {
	return alxia()
		.use(async (_ctx, next) => next({ user: { id: 'u1' } }))
		.use(
			'/api',
			proxy('http://users.internal:8080', {
				rewrite: '/api',
				headers: {
					request: {
						'x-user-id': (ctx: BaseContext & { user: { id: string } }) =>
							ctx.user.id,
					},
				},
			}),
		)
		.plugin(proxy.mount('/legacy', 'http://old-app:3000'))
		.ws('/live/*', proxy.ws('ws://chat.internal:8080', { rewrite: '/live' }));
}

export function middleware(options: ProxyOptions) {
	return proxy('http://up.internal', options);
}

export function mounted() {
	return proxy.mount('/old', 'http://old-app:3000', { timeout: 5_000 });
}

export function relay() {
	return proxy.ws('wss://chat.internal');
}
