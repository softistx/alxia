import { defineEnv } from '@alxia/env';
import { z } from 'zod';

export const env = defineEnv(
	{ PORT: z.coerce.number().default(3000), SENTRY_DSN: z.url().optional() },
	{ source: {} },
);
