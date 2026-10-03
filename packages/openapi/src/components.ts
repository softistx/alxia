import type { JsonSchema } from './json-schema';

const ISSUE: JsonSchema = {
	type: 'object',
	properties: {
		target: { enum: ['params', 'query', 'headers', 'cookies', 'body'] },
		path: { type: 'array', items: { type: ['string', 'integer'] } },
		code: { type: 'string' },
		message: { type: 'string' },
	},
	required: ['target', 'path', 'code', 'message'],
};

/** The schemas of the errors the framework itself answers, under `components`. */
export const COMPONENTS: Record<string, JsonSchema> = {
	ValidationError: {
		type: 'object',
		properties: {
			error: { const: 'validation' },
			issues: { type: 'array', items: ISSUE },
		},
		required: ['error', 'issues'],
	},
	InternalError: {
		type: 'object',
		properties: { error: { const: 'internal' } },
		required: ['error'],
	},
};
