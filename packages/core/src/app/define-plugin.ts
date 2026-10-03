import { type Alxia, type AnyAlxia, alxia } from './alxia';
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
		build(alxia() as unknown as Alxia<Requires>) as Plugin &
			Requiring<Requires>;
}
