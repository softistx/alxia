import { z } from 'zod';
import { defineEnv } from '../../src/define';

// Nothing is set: the bin reads the schema, not the environment.
export const env = defineEnv(
	{
		DATABASE_URL: z.url().describe('Where the data lives'),
		PORT: z.coerce.number().default(3000),
	},
	{ source: {} },
);
