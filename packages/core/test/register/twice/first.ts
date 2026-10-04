import { alxia } from '@alxia/core';

export const first = alxia().derive(() => ({ user: 'ada' }));

declare module '@alxia/core' {
	interface Register {
		context: typeof first;
	}
}
