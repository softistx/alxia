/**
 * The check of a fragment: a `ts` fence of a package's README or guide
 * that names no file. It is no app of its own, so it is not type-checked,
 * but it must parse, and every name it imports from an `@alxia/*` package
 * must be one that package declares: a comment that swallows a call, an
 * unclosed brace or a renamed export fails here.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../artifacts/packages';
import type { Snippet } from './fences';

/** The languages a fragment is parsed in, by the fence's info string. */
const LOADERS: Readonly<Record<string, 'ts' | 'tsx'>> = {
	ts: 'ts',
	typescript: 'ts',
	tsx: 'tsx',
	js: 'ts',
	javascript: 'ts',
	jsx: 'tsx',
};

/** Whether `snippet` is a fragment to parse: a code fence of a language above, no file, not left alone. */
export function isFragment(snippet: Snippet): boolean {
	return (
		snippet.lang in LOADERS &&
		snippet.file === null &&
		!snippet.skipped &&
		!snippet.excerpt
	);
}

/**
 * A fragment as code: `…`, and a `...` standing for arguments or a body
 * (before `)`, `,`, `;`, `]`, `}`, a comment or the end of a line), are a
 * placeholder name; a fragment that starts a chain, `.get(…)`, is given
 * a receiver.
 */
export function asCode(code: string): string {
	const filled = code
		.replace(/…/g, '__')
		.replace(/\.\.\.(?=\s*(?:[),;\]}]|\/\/|$))/gm, '__');
	return /^\s*\./.test(filled) ? `__${filled.trimStart()}` : filled;
}

/**
 * What a fragment may be part of, beyond a module: a function's body
 * (`return`, `yield`, `await`), an object's members (`login: async () =>
 * …,`), a class's members or signatures (`get(key: string): Promise<…>`).
 * Its imports stay at the top.
 */
function wrappings(code: string): string[] {
	const lines = code.split('\n');
	const imports = lines.filter((line) => /^import\s/.test(line)).join('\n');
	const body = lines.filter((line) => !/^import\s/.test(line)).join('\n');
	return [
		code,
		`${imports}\nasync function* __fragment() {\n${body}\n}`,
		`${imports}\nconst __fragment = {\n${body}\n};`,
		`${imports}\ndeclare class __Fragment {\n${body}\n}`,
		`${imports}\n__fragment(\n${body}\n);`,
	];
}

/** A name declared twice is a before and an after in one fence, not a broken one. */
const TOLERATED = /has already been declared/;

/** Why `code` does not parse as any of `wrappings`, or null. */
export function parseProblem(code: string, lang: string): string | null {
	const loader = LOADERS[lang] ?? 'ts';
	let first: string | null = null;
	for (const candidate of wrappings(asCode(code))) {
		try {
			new Bun.Transpiler({ loader }).transformSync(candidate);
			return null;
		} catch (error) {
			const errors = (error as { errors?: { message: string }[] }).errors;
			const message = errors?.[0]?.message ?? String(error);
			if (TOLERATED.test(message)) return null;
			first ??= message;
		}
	}
	return first;
}

/** The methods an app is declared with: one at the end of a comment is code a line break left in it. */
const CHAINED =
	'(?:plugin|use|group|get|post|put|patch|delete|route|derive|decorate|listen|ws|static|file)';

/**
 * A line after code whose comment ends on a word with an app's method
 * chained on it, `g.use(requireAdmin) // your own middleware.plugin(apiDocs())`:
 * the line break before the call went missing, and the call is commented
 * out. A comment that says what not to write (`// not app.use(…)`) is
 * no such line.
 */
export function swallowedCalls(code: string): string[] {
	const swallowed = new RegExp(
		`^\\s*[^\\s/].*\\s//\\s(?![^\\n]*\\bnot\\b)[^\\n\`'"]*[a-z]\\.${CHAINED}\\(`,
	);
	return code.split('\n').filter((line) => swallowed.test(line));
}

/** The names each `@alxia/*` specifier is imported for, `import { a, b as c }` read as `a`, `b`. */
export function importsOf(code: string): Map<string, string[]> {
	const found = new Map<string, string[]>();
	const pattern =
		/import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"](@alxia\/[^'"]+)['"]/g;
	for (const [, list = '', specifier = ''] of code.matchAll(pattern)) {
		const names = list
			.split(',')
			.map((part) =>
				part
					.trim()
					.replace(/^type\s+/, '')
					.split(/\s+as\s+/)[0]
					?.trim(),
			)
			.filter((name): name is string => name !== undefined && name !== '');
		found.set(specifier, [...(found.get(specifier) ?? []), ...names]);
	}
	return found;
}

/** The declaration text of a built package, `dist/**\/*.d.ts`, by its name; none when not built or unknown. */
const declarations = new Map<string, string | null>();

function declarationsOf(name: string): string | null {
	const known = declarations.get(name);
	if (known !== undefined) return known;
	const dir = readdirSync(join(ROOT, 'packages')).find((one) => {
		try {
			const manifest = readFileSync(
				join(ROOT, 'packages', one, 'package.json'),
				'utf8',
			);
			return JSON.parse(manifest).name === name;
		} catch {
			return false;
		}
	});
	let text: string | null = null;
	if (dir !== undefined) {
		const files = [
			...new Bun.Glob('dist/**/*.d.ts').scanSync(join(ROOT, 'packages', dir)),
		];
		if (files.length > 0) {
			text = files
				.map((file) => readFileSync(join(ROOT, 'packages', dir, file), 'utf8'))
				.join('\n');
		}
	}
	declarations.set(name, text);
	return text;
}

/** The package an `@alxia/*` specifier names: `@alxia/core/testing` is `@alxia/core`. */
function packageOf(specifier: string): string {
	return specifier.split('/').slice(0, 2).join('/');
}

/** What is wrong with one fragment: it does not parse, or imports a name its package never declares. */
export function fragmentProblems(doc: string, snippet: Snippet): string[] {
	const where = `${doc}:${snippet.line}`;
	const parse = parseProblem(snippet.code, snippet.lang);
	if (parse !== null) {
		return [
			`${where}: the snippet does not parse (${parse}); fix it, or mark the fence "ts no-check"`,
		];
	}
	const problems = swallowedCalls(snippet.code).map(
		(line) =>
			`${where}: a comment holds a call, a line break missing before it? ${line.trim()}`,
	);
	for (const [specifier, names] of importsOf(snippet.code)) {
		const text = declarationsOf(packageOf(specifier));
		if (text === null) {
			problems.push(
				`${where}: ${specifier} is no built package of the workspace (run bun run build)`,
			);
			continue;
		}
		for (const name of names) {
			if (!new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(text)) {
				problems.push(`${where}: ${specifier} declares no ${name}`);
			}
		}
	}
	return problems;
}
