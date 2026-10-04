/**
 * The templates' Biome: the layer `regenerate-react-router-template.ts`
 * adds to React Router's scaffold, the same the `api` template has by
 * hand, and the check `verify-templates.ts` runs on a generated project.
 */
import { join } from 'node:path';
import { $ } from 'bun';
import { report } from './report';

/** What `addBiome` reads and writes of a manifest. */
export interface BiomeManifest {
	scripts: Record<string, string>;
	devDependencies?: Record<string, string>;
	[key: string]: unknown;
}

/**
 * The project's Biome: Biome's defaults but for spaces, the scaffold's own
 * style, so formatting it once changes three files; Tailwind's directives
 * in CSS, which `app.css` uses; nothing generated; and two rules off for
 * the scaffold's code: `meta({}: Route.MetaArgs)`, React Router's own
 * idiom, is an empty pattern, and the welcome page's logos have no
 * `<title>`.
 */
export const BIOME_CONFIG = {
	$schema: './node_modules/@biomejs/biome/configuration_schema.json',
	vcs: { enabled: true, clientKind: 'git', useIgnoreFile: true },
	files: { includes: ['**', '!!**/build', '!!**/.react-router'] },
	formatter: { enabled: true, indentStyle: 'space' },
	css: { parser: { tailwindDirectives: true } },
	linter: {
		enabled: true,
		rules: {
			preset: 'recommended',
			correctness: { noEmptyPattern: 'off' },
		},
	},
	assist: {
		enabled: true,
		actions: { source: { organizeImports: 'on' } },
	},
	overrides: [
		{
			includes: ['**/app/welcome/**'],
			linter: { rules: { a11y: { noSvgWithoutTitle: 'off' } } },
		},
	],
};

/** The scripts Biome adds, the `api` template's but for `verify`'s last step. */
export const BIOME_SCRIPTS = {
	lint: 'biome lint',
	format: 'biome format --write',
	check: 'biome check --write',
	'check:ci': 'biome ci',
	verify: 'bun run check:ci && bun run typecheck && bun run build',
};

/** The manifest with Biome's scripts, and `@biomejs/biome` pinned at `version`. */
export function addBiome<M extends BiomeManifest>(
	manifest: M,
	version: string,
): M {
	const devDependencies = manifest.devDependencies ?? {};
	return {
		...manifest,
		scripts: { ...manifest.scripts, ...BIOME_SCRIPTS },
		devDependencies: Object.fromEntries(
			Object.entries({ ...devDependencies, '@biomejs/biome': version }).sort(
				([a], [b]) => (a < b ? -1 : 1),
			),
		),
	};
}

/** The README's section on Biome, the `api` template's but for `verify`. */
export const LINT_SECTION = `## Lint and format

[Biome](https://biomejs.dev) lints and formats the project, as \`biome.json\`
sets it: Biome's recommended rules, spaces, double quotes, imports
sorted. What the build and \`react-router typegen\` write, \`build/\` and
\`.react-router/\`, is skipped.

\`\`\`bash
bun run check      # lint, format and sort imports, fixing what it can
bun run lint       # lint only
bun run format     # format only, in place
bun run check:ci   # what CI runs: changes nothing, fails on an error
bun run verify     # check:ci, then typecheck, then build
\`\`\`

\`bun run check:ci\`, not \`bun ci\`: \`bun ci\` is Bun's frozen-lockfile
install. In VS Code, \`.vscode/\` recommends Biome's extension and formats
on save with it.

\`@biomejs/biome\` is pinned exactly, since a release of Biome may format
differently. To move it:

\`\`\`bash
bun add --dev --exact @biomejs/biome@latest
bunx biome migrate --write
\`\`\`

`;

/** The README with `LINT_SECTION` before its Styling section. */
export function addLintSection(readme: string): string {
	if (!readme.includes('\n## Styling\n')) {
		throw new Error('README.md: expected a ## Styling section');
	}
	return readme.replace('\n## Styling\n', `\n${LINT_SECTION}## Styling\n`);
}

/** The version of Biome the workspace at `root` installed, which formats the template. */
export async function biomeVersion(root: string): Promise<string> {
	const { version } = await Bun.file(
		join(root, 'node_modules/@biomejs/biome/package.json'),
	).json();
	return version;
}

/**
 * `bun run check:ci` on the project, after its scripts wrote `dist/`,
 * `build/` and `.react-router/`, which its `biome.json` skips: no error,
 * warning or info. `biome ci` exits 0 on a warning; this does not.
 */
export async function biomeClean(
	template: string,
	dir: string,
	env: Record<string, string>,
): Promise<boolean> {
	console.log(`\n=== ${template}: bun run check:ci\n`);
	const run = await $`bun run check:ci --colors=off`
		.cwd(dir)
		.env(env)
		.nothrow()
		.quiet();
	const output = `${run.stdout}${run.stderr}`;
	console.log(output);
	const diagnostics = output.match(/Found \d+ (error|warning|info)s?/g) ?? [];
	const found =
		diagnostics.length > 0 ? `, ${diagnostics.join(', ')}` : ', no diagnostic';
	return report(
		run.exitCode === 0 && diagnostics.length === 0,
		`${template}: bun run check:ci exited ${run.exitCode}${found}`,
	);
}
