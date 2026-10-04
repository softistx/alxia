// The app that mounts the routes, registered instead of its base: the
// routes' type reads `Register`, which reads the app, which mounts them.
import { alxia } from '@alxia/core';
import { todos } from './todos';

export const app = alxia()
	.derive(() => ({ user: { id: 'ada' } }))
	.use(todos);

declare module '@alxia/core' {
	interface Register {
		context: typeof app;
	}
}
