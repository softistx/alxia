import { alxia } from '@alxia/core';
import { env } from './env';

export const base = alxia().decorate({ env });

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
