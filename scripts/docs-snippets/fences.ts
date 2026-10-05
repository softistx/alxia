/** What a doc's fences say: which are files of its project, which are excerpts, which are left alone. */

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
		const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[index] ?? '');
		if (open === null) continue;
		const [, ticks = '```', info = ''] = open;
		const [lang = '', ...flags] = info.trim().split(/\s+/);
		const body: string[] = [];
		let at = index + 1;
		while (
			at < lines.length &&
			!(lines[at] ?? '').trimStart().startsWith(ticks)
		) {
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

/**
 * What is wrong with a doc's snippets before any is written. `strict`: a
 * `ts` fence must name its file, or be an excerpt or `no-check`.
 */
export function problemsOf(
	doc: string,
	snippets: readonly Snippet[],
	strict = true,
): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();
	for (const snippet of snippets) {
		const where = `${doc}:${snippet.line}`;
		if (
			strict &&
			['ts', 'typescript', 'tsx'].includes(snippet.lang) &&
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
