// An app behind di, behind exported values whose types are inferred: a
// declaration build must be able to name each one through `@alxia/di`,
// `@alxia/core` and `@nxgt/di` alone (TS2883 otherwise).
import { alxia } from '@alxia/core';
import { di } from '@alxia/di';
import { container, token } from '@nxgt/di';

interface Orders {
	list(): Promise<string[]>;
}
declare const orders: Orders;

const User = token<string>()('user');
const OrdersT = token<Orders>()('orders');

export const services = container()
	.slot(User)
	.provide(OrdersT, () => orders, { lifetime: 'scoped' });

export const deps = di(services, {
	slots: ({ request }) => ({ user: request.headers.get('x-user') ?? '' }),
});

export const exposeOrders = deps.expose({ orders: OrdersT });

export function app() {
	return alxia()
		.plugin(deps.lifecycle)
		.use(deps)
		.group('/orders', (g) =>
			g
				.use(exposeOrders)
				.get('/', async ({ orders: o, reply }) => reply(200, await o.list())),
		);
}
