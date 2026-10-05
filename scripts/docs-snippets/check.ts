/** Checks one doc: its excerpts, then its project: generated, type-checked, and run where it has specs. */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { $ } from 'bun';
import { ROOT } from '../artifacts/packages';
import { missingFrom, problemsOf, type Snippet, snippetsOf } from './fences';
import { binOf, writeProject } from './project';

/** The text of every file of every template: what an excerpt may quote besides its own doc. */
function templateSources(): string[] {
	const files = new Bun.Glob('packages/create/templates/**/*').scanSync({
		cwd: ROOT,
		dot: true,
	});
	return [...files]
		.filter(
			(file) => !file.includes('/generated/') && !file.includes('node_modules'),
		)
		.map((file) => readFileSync(join(ROOT, file), 'utf8'));
}

/** Every line of an `excerpt` fence must be a line of a file of the doc, or of a template. */
function excerptProblems(
	doc: string,
	snippets: readonly Snippet[],
	files: readonly Snippet[],
): string[] {
	const sources = [
		...files.map((snippet) => snippet.code),
		...templateSources(),
	];
	return snippets
		.filter((snippet) => snippet.excerpt)
		.flatMap((snippet) =>
			missingFrom(snippet.code, sources).map(
				(line) =>
					`${doc}:${snippet.line}: the excerpt has a line no file of the doc or template holds: ${line}`,
			),
		);
}

/** Runs one command in the project, and says what it printed when it fails. */
async function run(
	doc: string,
	dir: string,
	label: string,
	command: ReturnType<typeof $>,
): Promise<string[]> {
	const done = await command.cwd(dir).quiet().nothrow();
	if (done.exitCode === 0) return [];
	return [`${doc}: ${label} failed\n${done.stdout}${done.stderr}`.trimEnd()];
}

/** The generators a doc's own files ask for, as `bun run generate` runs them in a template. */
async function generate(doc: string, dir: string): Promise<string[]> {
	const problems: string[] = [];
	if (existsSync(join(dir, 'openapi-codegen.config.ts'))) {
		problems.push(
			...(await run(
				doc,
				dir,
				'nxgt-openapi generate',
				$`bun ${binOf('nxgt-openapi')} generate`,
			)),
		);
	}
	if (existsSync(join(dir, 'codegen.ts'))) {
		problems.push(
			...(await run(
				doc,
				dir,
				'graphql-codegen',
				$`bun ${binOf('graphql-codegen')} --config codegen.ts`,
			)),
		);
	}
	return problems;
}

/** Whether a doc's specs can run here: one that needs a Redis waits for `REDIS_URL`. */
function runsSpecs(files: readonly Snippet[]): boolean {
	const specs = files.filter((snippet) => snippet.file?.endsWith('.spec.ts'));
	const needsRedis = specs.some((snippet) =>
		snippet.code.includes('REDIS_URL'),
	);
	return (
		specs.length > 0 && (!needsRedis || Bun.env['REDIS_URL'] !== undefined)
	);
}

/** Checks one doc; returns what failed, empty when it is sound. */
export async function checkDoc(path: string): Promise<string[]> {
	const doc = relative(ROOT, path);
	const snippets = snippetsOf(await Bun.file(path).text());
	const files = snippets.filter(
		(snippet) => snippet.file !== null && !snippet.skipped,
	);
	const early = [
		...problemsOf(doc, snippets),
		...excerptProblems(doc, snippets, files),
	];
	if (early.length > 0 || files.length === 0) return early;

	const dir = await writeProject(
		doc.replace(/\.md$/, '').replace(/[\\/]/g, '-'),
		files,
	);
	const generated = await generate(doc, dir);
	if (generated.length > 0) return generated;
	const tsc = join(ROOT, 'node_modules/typescript/bin/tsc');
	const typed = await run(doc, dir, 'tsc', $`bun --bun ${tsc} -p .`);
	if (typed.length > 0 || !runsSpecs(files)) return typed;
	return run(
		doc,
		dir,
		'bun test',
		$`bun test`.env({ ...Bun.env, NODE_ENV: 'test' }),
	);
}
