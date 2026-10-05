#!/usr/bin/env bun
/**
 * Type-checks, and where a doc has specs runs, the code in the root README,
 * in "Start in 5 minutes" and in every recipe, so a snippet cannot rot behind a renamed
 * export.
 *
 * A fence that starts with `// file: src/app.ts` (`# file: openapi.yaml` in
 * YAML or GraphQL) is a file of the doc's own project; a doc's fences are
 * written together, so one imports another as in an app. A `ts` fence that
 * names no file is an error, unless it says `ts excerpt`, whose every line
 * must be a line of a file of the doc or of a template (an explanation of a
 * part), or `ts no-check`: a signature, an output. Each doc is its own project under `.docs-check/`
 * (gitignored), because each is one app and each augments `Register` once.
 *
 * The project resolves what a consumer's would: `.docs-check/node_modules`
 * links every `@alxia/*` package (its `exports`, so `dist/`: build first) and
 * the dependencies the workspace installed under `packages/*`, `zod`,
 * `graphql-yoga`, `@nxgt/*` among them. A doc that holds an
 * `openapi-codegen.config.ts` or a `codegen.ts` has its code generated first,
 * as `bun run generate` does in the template. A doc with a `*.spec.ts` has
 * it run by `bun test`; one that needs Redis is skipped without `REDIS_URL`.
 *
 *   bun run check:doc-snippets [doc.md …]
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { $ } from 'bun';
import { ROOT } from './artifacts/packages';

export interface Snippet {
	/** The file it is written to, or null for a fragment. */
	readonly file: string | null;
	readonly lang: string;
	/** `ts no-check`: left alone. */
	readonly skipped: boolean;
	/** `ts excerpt`: every line of it is a line of a checked file of the doc, or of a template. */
	readonly excerpt: boolean;
	readonly code: string;
	/** The line of its opening fence. */
	readonly line: number;
}

/** Every fenced block of a Markdown file, with the file it names. */
export function snippetsOf(markdown: string): Snippet[] {
	const snippets: Snippet[] = [];
	const lines = markdown.split('\n');
	for (let index = 0; index < lines.length; index++) {
		const open = /^(`{3,})(.*)$/.exec(lines[index] ?? '');
		if (open === null) continue;
		const [, ticks = '```', info = ''] = open;
		const [lang = '', ...flags] = info.trim().split(/\s+/);
		const body: string[] = [];
		let at = index + 1;
		while (at < lines.length && !(lines[at] ?? '').startsWith(ticks)) {
			body.push(lines[at] ?? '');
			at++;
		}
		const marker = /^(?:\/\/|#) file: (\S+)\s*$/.exec(body[0] ?? '');
		snippets.push({
			file: marker?.[1] ?? null,
			lang,
			skipped: flags.includes('no-check'),
			excerpt: flags.includes('excerpt'),
			code: `${(marker === null ? body : body.slice(1)).join('\n')}\n`,
			line: index + 1,
		});
		index = at;
	}
	return snippets;
}

/** What is wrong with a doc's snippets before any is written. */
export function problemsOf(
	doc: string,
	snippets: readonly Snippet[],
): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();
	for (const snippet of snippets) {
		const where = `${doc}:${snippet.line}`;
		if (
			snippet.lang === 'ts' &&
			snippet.file === null &&
			!snippet.skipped &&
			!snippet.excerpt
		) {
			problems.push(
				`${where}: a ts fence starts with "// file: <path>", or says "ts excerpt" or "ts no-check"`,
			);
		}
		if (snippet.file === null) continue;
		if (snippet.file.startsWith('/') || snippet.file.includes('..')) {
			problems.push(
				`${where}: "${snippet.file}" is not a path inside the project`,
			);
		}
		if (seen.has(snippet.file))
			problems.push(`${where}: ${snippet.file} is written twice`);
		seen.add(snippet.file);
	}
	return problems;
}

/** The lines of an excerpt that must be found: not blank, not a comment, not an ellipsis. */
export function linesOf(code: string): string[] {
	return code
		.split('\n')
		.map((line) => line.trim())
		.filter(
			(line) =>
				line !== '' &&
				!/^(\/\/|#)/.test(line) &&
				line !== '…' &&
				line !== '...',
		);
}

/** The lines of an excerpt found in none of the sources. */
export function missingFrom(
	excerpt: string,
	sources: readonly string[],
): string[] {
	const known = new Set(sources.flatMap(linesOf));
	return linesOf(excerpt).filter((line) => !known.has(line));
}

const WORK = join(ROOT, '.docs-check');

/** `.docs-check/node_modules`: the packages of the workspace, and what they installed. */
export async function linkModules(): Promise<void> {
	const modules = join(WORK, 'node_modules');
	rmSync(modules, { recursive: true, force: true });
	mkdirSync(join(modules, '@alxia'), { recursive: true });
	const link = (target: string, name: string): void => {
		const path = join(modules, name);
		if (existsSync(path)) return;
		mkdirSync(dirname(path), { recursive: true });
		symlinkSync(target, path);
	};
	for (const dir of readdirSync(join(ROOT, 'packages'))) {
		const manifest = Bun.file(join(ROOT, 'packages', dir, 'package.json'));
		if (!(await manifest.exists())) continue;
		link(join(ROOT, 'packages', dir), (await manifest.json()).name);
	}
	link(join(ROOT, 'node_modules/@types'), '@types');
	for (const dir of readdirSync(join(ROOT, 'packages'))) {
		const installed = join(ROOT, 'packages', dir, 'node_modules');
		if (!existsSync(installed)) continue;
		for (const name of readdirSync(installed)) {
			if (
				name.startsWith('.') ||
				name === '@alxia' ||
				name === '@types' ||
				name === 'typescript'
			)
				continue;
			if (name.startsWith('@')) {
				for (const inner of readdirSync(join(installed, name))) {
					link(join(installed, name, inner), `${name}/${inner}`);
				}
			} else link(join(installed, name), name);
		}
	}
}

function binOf(name: string): string {
	for (const dir of readdirSync(join(ROOT, 'packages'))) {
		const bin = join(ROOT, 'packages', dir, 'node_modules/.bin', name);
		if (existsSync(bin)) return bin;
	}
	throw new Error(`${name} is installed in no package: run bun install`);
}

const TSCONFIG = {
	compilerOptions: {
		types: ['bun'],
		lib: ['ESNext', 'DOM'],
		target: 'ESNext',
		module: 'ESNext',
		moduleDetection: 'force',
		moduleResolution: 'bundler',
		verbatimModuleSyntax: true,
		noEmit: true,
		skipLibCheck: true,
		strict: true,
		noImplicitOverride: true,
		noImplicitReturns: true,
		noUncheckedIndexedAccess: true,
		exactOptionalPropertyTypes: true,
		noPropertyAccessFromIndexSignature: true,
		noUnusedLocals: true,
		noUnusedParameters: true,
	},
	include: ['**/*.ts'],
};

/** Checks one doc; returns what failed, empty when it is sound. */
async function checkDoc(path: string): Promise<string[]> {
	const doc = relative(ROOT, path);
	const snippets = snippetsOf(await Bun.file(path).text());
	const problems = problemsOf(doc, snippets);
	const files = snippets.filter(
		(snippet) => snippet.file !== null && !snippet.skipped,
	);
	const sources = [
		...files.map((snippet) => snippet.code),
		...[
			...new Bun.Glob('packages/create/templates/**/*').scanSync({
				cwd: ROOT,
				dot: true,
			}),
		]
			.filter(
				(file) =>
					!file.includes('/generated/') && !file.includes('node_modules'),
			)
			.map((file) => readFileSync(join(ROOT, file), 'utf8')),
	];
	for (const snippet of snippets.filter((one) => one.excerpt)) {
		for (const line of missingFrom(snippet.code, sources)) {
			problems.push(
				`${doc}:${snippet.line}: the excerpt has a line no file of the doc or template holds: ${line}`,
			);
		}
	}
	if (problems.length > 0 || files.length === 0) return problems;

	const name = doc.replace(/\.md$/, '').replace(/[\\/]/g, '-');
	const dir = join(WORK, name);
	rmSync(dir, { recursive: true, force: true });
	for (const snippet of files) {
		await Bun.write(join(dir, snippet.file ?? ''), snippet.code);
	}
	await Bun.write(
		join(dir, 'package.json'),
		'{ "private": true, "type": "module" }\n',
	);
	await Bun.write(
		join(dir, 'tsconfig.json'),
		JSON.stringify(TSCONFIG, null, 2),
	);

	const has = (file: string): boolean => existsSync(join(dir, file));
	const run = async (
		label: string,
		command: ReturnType<typeof $>,
	): Promise<void> => {
		const done = await command.cwd(dir).quiet().nothrow();
		if (done.exitCode !== 0) {
			problems.push(
				`${doc}: ${label} failed\n${done.stdout}${done.stderr}`.trimEnd(),
			);
		}
	};
	if (has('openapi-codegen.config.ts')) {
		await run(
			'nxgt-openapi generate',
			$`bun ${binOf('nxgt-openapi')} generate`,
		);
	}
	if (has('codegen.ts')) {
		await run(
			'graphql-codegen',
			$`bun ${binOf('graphql-codegen')} --config codegen.ts`,
		);
	}
	if (problems.length > 0) return problems;
	await run(
		'tsc',
		$`bun --bun ${join(ROOT, 'node_modules/typescript/bin/tsc')} -p .`,
	);
	if (problems.length > 0) return problems;
	const specs = files.filter((snippet) => snippet.file?.endsWith('.spec.ts'));
	const needsRedis = specs.some((snippet) =>
		snippet.code.includes('REDIS_URL'),
	);
	if (specs.length > 0 && (!needsRedis || Bun.env['REDIS_URL'] !== undefined)) {
		await run('bun test', $`bun test`.env({ ...Bun.env, NODE_ENV: 'test' }));
	}
	return problems;
}

async function main(): Promise<void> {
	const given = Bun.argv.slice(2);
	const docs =
		given.length > 0
			? given.map((doc) => join(process.cwd(), doc))
			: [
					join(ROOT, 'README.md'),
					join(ROOT, 'docs/start.md'),
					...[...new Bun.Glob('docs/recipes/*.md').scanSync(ROOT)]
						.sort()
						.map((doc) => join(ROOT, doc)),
				];
	mkdirSync(WORK, { recursive: true });
	await linkModules();
	const results = await Promise.all(docs.map(checkDoc));
	const problems = results.flat();
	if (problems.length > 0) {
		console.error(problems.join('\n\n'));
		console.error(
			`\nThe snippets of ${results.filter((one) => one.length > 0).length} doc(s) fail.`,
		);
		process.exit(1);
	}
	console.log(
		`${docs.length} docs (${docs.map((doc) => basename(doc)).join(', ')}): every snippet type-checks.`,
	);
}

if (import.meta.main) await main();
