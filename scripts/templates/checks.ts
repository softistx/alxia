/** The templates `verify-templates.ts` creates, and what each project must hold and answer. */
import { pageAndAsset } from './serve';
import type { TemplateName } from './shipped';

/** What `verify-templates.ts` proves of one template. */
export interface Check {
	readonly template: TemplateName;
	/** Files the project must hold, as a template copied them. */
	readonly files: readonly string[];
	readonly scripts: readonly string[];
	readonly request: (base: string) => Promise<Response>;
	readonly expected: number;
}

export const CHECKS: readonly Check[] = [
	{
		template: 'minimal',
		files: [
			'.gitignore',
			'.dockerignore',
			'.vscode/extensions.json',
			'.vscode/settings.json',
			'biome.json',
			'Dockerfile',
			'src/index.ts',
			'src/index.spec.ts',
		],
		// verify: check:ci, typecheck, then test.
		scripts: ['verify', 'build'],
		request: (base) => fetch(`${base}/`),
		expected: 200,
	},
	{
		template: 'api',
		files: [
			'.gitignore',
			'.dockerignore',
			'.env.example',
			'.vscode/extensions.json',
			'.vscode/settings.json',
			'biome.json',
			'Dockerfile',
			'openapi.yaml',
			'openapi-codegen.config.ts',
			'src/app.ts',
			'src/context.ts',
			'src/env.ts',
			'src/generated/alxia.ts',
			'src/routes/todos.ts',
		],
		// verify: generate --check, check:ci, typecheck, then test.
		scripts: ['verify', 'build'],
		request: (base) =>
			fetch(`${base}/todos`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-api-key': 'dev-key' },
				body: JSON.stringify({ title: 'From the template check' }),
			}),
		expected: 201,
	},
	{
		template: 'graphql',
		files: [
			'.gitignore',
			'.dockerignore',
			'.env.example',
			'.vscode/extensions.json',
			'.vscode/settings.json',
			'biome.json',
			'Dockerfile',
			'codegen.ts',
			'schema.graphql',
			'src/app.ts',
			'src/context.ts',
			'src/env.ts',
			'src/generated/resolvers.ts',
			'src/resolvers.ts',
		],
		// verify: generate --check, check:ci, typecheck, then test.
		scripts: ['verify', 'build'],
		// The query a client sends first: the endpoint answers, schema inside dist/.
		request: (base) =>
			fetch(`${base}/graphql`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: '{ __typename }' }),
			}),
		expected: 200,
	},
	{
		template: 'react-router',
		files: [
			'.gitignore',
			'.vscode/extensions.json',
			'biome.json',
			'bunfig.toml',
			'Dockerfile',
			'vite.config.ts',
			'app/root.tsx',
		],
		scripts: ['typecheck', 'build'],
		request: pageAndAsset,
		expected: 200,
	},
];
