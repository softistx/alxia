/** What `@alxia/create`'s tarball must hold of each template. */
import type { Tarball } from '../artifacts/tarball';
import { report } from './report';

/**
 * `bun publish` leaves every `.gitignore` and `bunfig.toml` out of a
 * tarball, so the templates ship them as `gitignore` and `_bunfig.toml`,
 * renamed when they are copied; `biome.json` is `_biome.json`, which this
 * repository's Biome would refuse as a nested root. `.vscode/` ships as it is.
 */
/** The templates `@alxia/create` ships. */
export type TemplateName = 'minimal' | 'api' | 'graphql' | 'react-router';

const SHIPPED: Readonly<Record<TemplateName, readonly string[]>> = {
	minimal: [
		'gitignore',
		'_biome.json',
		'.dockerignore',
		'.vscode/extensions.json',
		'.vscode/settings.json',
		'Dockerfile',
		'package.json',
		'src/index.ts',
		'src/index.spec.ts',
	],
	api: [
		'gitignore',
		'_biome.json',
		'.dockerignore',
		'.env.example',
		'.vscode/extensions.json',
		'.vscode/settings.json',
		'Dockerfile',
		'openapi.yaml',
		'openapi-codegen.config.ts',
		'package.json',
		'src/app.ts',
		'src/context.ts',
		'src/env.ts',
		'src/generated/alxia.ts',
		'src/generated/operations.ts',
		'src/generated/paths.ts',
		'src/generated/types.ts',
		'src/generated/zod.ts',
		'src/routes/todos.ts',
	],
	graphql: [
		'gitignore',
		'_biome.json',
		'.dockerignore',
		'.env.example',
		'.vscode/extensions.json',
		'.vscode/settings.json',
		'Dockerfile',
		'codegen.ts',
		'package.json',
		'schema.graphql',
		'src/app.ts',
		'src/context.ts',
		'src/env.ts',
		'src/generated/resolvers.ts',
		'src/graphql.d.ts',
		'src/resolvers.ts',
		'src/schema.ts',
		'src/server.ts',
		'src/store.ts',
	],
	'react-router': [
		'gitignore',
		'_bunfig.toml',
		'_biome.json',
		'.dockerignore',
		'.vscode/extensions.json',
		'.vscode/settings.json',
		'Dockerfile',
		'package.json',
		'vite.config.ts',
	],
};

export function templateShipped(tarballs: readonly Tarball[]): boolean {
	const create = tarballs.find(
		({ manifest }) => manifest['name'] === '@alxia/create',
	);
	const entries = create?.entries ?? [];
	return Object.entries(SHIPPED).every(([template, files]) =>
		report(
			files.every((file) =>
				entries.includes(`package/templates/${template}/${file}`),
			),
			`@alxia/create's tarball holds templates/${template}: ${files.join(', ')}`,
		),
	);
}
