/**
 * What `di` and `expose` refuse at compile time, each beside the same code
 * written correctly. The `@ts-expect-error` lines are checked by `tsc`;
 * the routes are built, never requested.
 */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { container, type Scope, token } from '@nxgt/di';
import {
	Config,
	Greeting,
	Principal,
	services,
	type User,
} from '../test/services';
import { di } from './di';

const Unprovided = token<number>()('unprovided');
describe('di: the options', () => {
	test('slots is required exactly when the Container has Slots', () => {
		const refused = () => {
			void di(services(), { slots: () => ({ principal: { id: 'x' } }) });
			// @ts-expect-error the Container has a Slot, so slots is required
			void di(services());
			// @ts-expect-error slots must give every Slot: principal is missing
			void di(services(), { slots: () => ({}) });
			// @ts-expect-error a Slot's value has its Token's type
			void di(services(), { slots: () => ({ principal: 'ada' }) });
			void di(container().provide(Config, () => ({ region: 'eu' })));
			const noSlot = container().provide(Config, () => ({ region: 'eu' }));
			void di(noSlot, { onDisposeError: () => {} });
			// @ts-expect-error no Slot to fill: slots would never be read
			void di(noSlot, { slots: () => ({}) });
		};
		expect(refused).toBeFunction();
	});

	test('what slots reads is required where the middleware stands', () => {
		const deps = di(services(), {
			slots: ({ user }: { user: User }) => ({ principal: user }),
		});
		const refused = () => {
			alxia()
				.use((_ctx, next) => next({ user: { id: 'u' } as User }))
				.use(deps);
			// @ts-expect-error slots reads user, which this context does not give
			alxia().use(deps);
			const any = di(services(), {
				slots: (ctx: any) => ({ principal: ctx.user }),
			});
			// @ts-expect-error slots reads its context as any: refused everywhere
			alxia().use(any);
		};
		expect(refused).toBeFunction();
	});
});

describe('di: the context', () => {
	test('the routes after it read scope, typed by the Container', () => {
		const deps = di(services(), { slots: () => ({ principal: { id: 'x' } }) });
		alxia()
			.use(deps)
			.get('/', ({ scope, reply }) => {
				expectTypeOf(scope).toEqualTypeOf<
					Scope<
						{ config: { region: string } },
						{ principal: User; greeting: string }
					>
				>();
				return reply(200, 'ok');
			});
		const refused = () =>
			// @ts-expect-error a route declared before the di reads no scope
			alxia().get('/', ({ scope, reply }) => reply(200, String(scope)));
		expect(refused).toBeFunction();
	});
});

describe('expose', () => {
	const deps = di(services(), { slots: () => ({ principal: { id: 'x' } }) });

	test('adds each value, typed by its Token', () => {
		alxia()
			.use(deps)
			.use(deps.expose({ config: Config, me: Principal, greeting: Greeting }))
			.get('/', ({ config, me, greeting, reply }) => {
				expectTypeOf(config).toEqualTypeOf<{ region: string }>();
				expectTypeOf(me).toEqualTypeOf<User>();
				expectTypeOf(greeting).toEqualTypeOf<string>();
				return reply(200, 'ok');
			});
	});

	test('refuses a Token the Container does not provide, or a key the context holds', () => {
		const refused = () => {
			const app = alxia().use(deps);
			app.use(deps.expose({ config: Config }));
			// @ts-expect-error unprovided is a Token this Container does not provide
			app.use(deps.expose({ n: Unprovided }));
			// @ts-expect-error scope is the Scope's own key
			app.use(deps.expose({ scope: Config }));
			// @ts-expect-error reply is a key of the base context
			app.use(deps.expose({ reply: Config }));
			// @ts-expect-error a value that is not a Token
			app.use(deps.expose({ config: 'config' }));
		};
		expect(refused).toBeFunction();
	});

	test('must stand after its di', () => {
		const refused = () => {
			alxia()
				.use(deps)
				.use(deps.expose({ config: Config }));
			// @ts-expect-error no di before it: scope is missing from the context
			alxia().use(deps.expose({ config: Config }));
			const other = di(container().provide(Config, () => ({ region: 'us' })));
			const elsewhere = alxia().use(other);
			// @ts-expect-error another Container's Scope is not this one's
			elsewhere.use(deps.expose({ config: Config }));
		};
		expect(refused).toBeFunction();
	});
});
