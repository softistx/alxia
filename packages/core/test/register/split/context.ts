// The base: what builds the context, and its registration. It imports no
// route file, so its type never reads `Register`.
import { alxia } from '@alxia/core';

export interface User {
	readonly id: string;
}

export const base = alxia()
	.decorate({ greeting: 'hello' })
	.derive(({ request, reply }) => {
		const id = request.headers.get('x-user');
		if (id === null) return reply(401, { error: 'unauthorized' as const });
		const user: User = { id };
		return { user };
	});

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
