import type { RoutePath } from '../types/path';
import { type Alxia, type AnyAlxia, alxia } from './alxia';
import type { RoutesContext } from './register';
import type { Empty, Requiring } from './types';

/**
 * A plugin that reads what an earlier one added to the context. Name what it
 * needs, then build it on an app whose context already has it:
 *
 * ```ts
 * const tenant = definePlugin<{ user: { tenantId: string } }>()((app) =>
 *   app.derive(({ user }) => ({ tenant: tenants.get(user.tenantId) })),
 * );
 *
 * alxia().use(auth).use(tenant); // compiles: auth derives a user, or answers 401
 * alxia().use(tenant); // a compile error: this app gives no `user`
 * ```
 *
 * The plugin is an app, given to `use` like any other, built once, here.
 * `use` checks the app's context against `Requires`, so the plugin's hooks
 * never run without what they read.
 */
export function definePlugin<Requires extends object = Empty>() {
	return <Plugin extends AnyAlxia>(
		build: (app: Alxia<Requires>) => Plugin,
	): Plugin & Requiring<Requires> =>
		build(requiring<Requires, ''>(undefined)) as Plugin & Requiring<Requires>;
}

/**
 * Routes in a file of their own, reading the context `Register` names with
 * no import of the app: a plugin, built on that context, that requires it
 * of the app that mounts it.
 *
 * ```ts
 * // src/routes/todos.ts
 * export const todos = defineRoutes('/todos')
 *   .get('/', ({ db, user, reply }) => reply(200, db.todos.of(user.id)));
 *
 * // src/app.ts
 * export const app = base.use(todos);
 * alxia().use(todos); // a compile error: this app gives no `user`
 * ```
 *
 * At runtime it is `alxia({ prefix })`. Unregistered, it starts from the
 * base context and requires nothing.
 */
export function defineRoutes<const Prefix extends '' | RoutePath = ''>(
	prefix?: Prefix,
): Alxia<RoutesContext, Prefix, never> {
	return requiring<RoutesContext, Prefix>(prefix);
}

/**
 * A fresh app typed as already giving `Requires`: what `definePlugin` and
 * `defineRoutes` build on. Only a type: `use` checks the requirement.
 */
function requiring<Requires extends object, Prefix extends '' | RoutePath>(
	prefix: Prefix | undefined,
): Alxia<Requires, Prefix, never> {
	const app = prefix === undefined ? alxia() : alxia({ prefix });
	return app as unknown as Alxia<Requires, Prefix, never>;
}
