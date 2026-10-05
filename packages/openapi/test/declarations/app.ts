// An app bound to its operations, behind exported functions whose return
// types are inferred: a declaration build must be able to name each one
// through `@alxia/openapi`, `@alxia/core` and `zod` alone (TS2883
// otherwise).
import { alxia } from '@alxia/core';
import {
	apiDocs,
	implemented,
	isApiDocsRoute,
	matchesSpec,
	type Operations,
} from '@alxia/openapi';
import { z } from 'zod';

// As `@nxgt/openapi-codegen` writes them with its `alxia` option.
const getPet = {
	method: 'GET',
	path: '/pets/:petId',
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		response: {
			200: z.object({ id: z.number(), name: z.string() }),
			404: z.object({ title: z.string() }),
		},
		detail: { operationId: 'getPet' },
	},
} as const;

const operations = { getPet } as const satisfies Operations;

export function bound() {
	return alxia().route(getPet, ({ params, reply }) =>
		params.petId === 1
			? reply(200, { id: 1, name: 'Rex' })
			: reply(404, { title: 'no such pet' }),
	);
}

export function checked() {
	const app = bound().get('/health', ({ reply }) => reply(200, 'ok'));
	implemented(app, operations);
	matchesSpec(app, operations, {
		exclude: (route) => route.path === '/health',
	});
	return app;
}

export function operationsOf() {
	return operations;
}

export function documented() {
	const app = bound().plugin(
		apiDocs({
			spec: { openapi: '3.1.0', info: { title: 'Pets', version: '1' } },
		}),
	);
	matchesSpec(app, operations, { exclude: isApiDocsRoute });
	return app;
}
