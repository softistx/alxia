import { alxia } from '@alxia/core';

export const second = alxia().derive(() => ({ tenant: 'acme' }));

declare module '@alxia/core' {
	interface Register {
		context: typeof second;
	}
}
