#!/usr/bin/env bun
/**
 * Type-checks, and where a doc has specs runs, the code in the root README,
 * in "Start in 5 minutes" and in every recipe, so a snippet cannot rot behind a
 * renamed export.
 *
 * A fence that starts with `// file: src/app.ts` (`# file: openapi.yaml` in
 * YAML or GraphQL) is a file of the doc's own project; a doc's fences are
 * written together, so one imports another as in an app. A `ts` fence that
 * names no file is an error, unless it says `ts excerpt`, whose every line
 * must be a line of a file of the doc or of a template (an explanation of a
 * part), or `ts no-check`: a signature, an output. Each doc is its own project
 * under `.docs-check/` (gitignored), because each is one app and each augments
 * `Register` once.
 *
 * The project resolves what a consumer's would: `.docs-check/node_modules`
 * links every `@alxia/*` package (its `exports`, so `dist/`: build first) and
 * the dependencies the workspace installed under `packages/*`, `zod`,
 * `graphql-yoga`, `@nxgt/*` among them. A doc that holds an
 * `openapi-codegen.config.ts` or a `codegen.ts` has its code generated first,
 * as `bun run generate` does in the template. A doc with a `*.spec.ts` has
 * it run by `bun test`; one that needs Redis is skipped without `REDIS_URL`.
 *
 * Every package's README (its npm page) and guides (`docs/**`), and the
 * design notes, are checked too, as fragments: each `ts` fence that names
 * no file must parse and import only names its `@alxia/*` package
 * declares (`docs-snippets/syntax.ts`); `ts no-check` leaves one alone.
 *
 * The fences are read by `docs-snippets/fences.ts`, the project written by
 * `docs-snippets/project.ts`, and one doc checked by `docs-snippets/check.ts`.
 *
 *   bun run check:doc-snippets [doc.md …]
 */
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checkDoc } from './docs-snippets/check';
import { docsToCheck } from './docs-snippets/docs';
import { linkModules, WORK } from './docs-snippets/project';

async function main(): Promise<void> {
	const given = Bun.argv.slice(2).map((doc) => join(process.cwd(), doc));
	const docs = docsToCheck(given);
	mkdirSync(WORK, { recursive: true });
	await linkModules();
	const results = await Promise.all(
		docs.map(({ path, strict }) => checkDoc(path, strict)),
	);
	const problems = results.flat();
	if (problems.length > 0) {
		console.error(problems.join('\n\n'));
		console.error(
			`\nThe snippets of ${results.filter((one) => one.length > 0).length} doc(s) fail.`,
		);
		process.exit(1);
	}
	console.log(
		`${docs.length} docs: the snippets of ${docs.filter((doc) => doc.strict).length} (${docs
			.filter((doc) => doc.strict)
			.map((doc) => basename(doc.path))
			.join(', ')}) type-check, and every fragment of the others parses.`,
	);
}

if (import.meta.main) await main();
