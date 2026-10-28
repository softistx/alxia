/**
 * Checks, when the proxy is created, that each document the server holds
 * defines `subscription <key>` and nothing else. The documents are the app's
 * own text, never a client's, so a plain scan is enough to catch a mistake (a
 * mutation listed, a name that does not match its key); it is not a parser and
 * guards nothing against hostile input.
 */
function stripped(document: string): string {
	return document
		.replace(/"""[\s\S]*?"""/g, ' ')
		.replace(/"(?:\\.|[^"\\\n])*"/g, ' ')
		.replace(/#[^\n\r]*/g, ' ');
}

/** The top-level definitions of `document`: `[keyword, name]`, `{` for a shorthand query. */
function definitions(document: string): Array<[string, string | undefined]> {
	const found: Array<[string, string | undefined]> = [];
	let depth = 0;
	let open: string | undefined;
	let skipping = false;
	for (const m of stripped(document).matchAll(/[{}()]|[A-Za-z_]\w*/g)) {
		const t = m[0];
		if (t === '(') depth++;
		else if (t === ')') depth--;
		else if (t === '{') {
			if (depth === 0 && !skipping) {
				if (open !== undefined) {
					found.push([open, undefined]);
					open = undefined;
				} else found.push(['{', undefined]);
			}
			if (depth === 0) skipping = false;
			depth++;
		} else if (t === '}') depth--;
		else if (depth === 0) {
			if (open !== undefined && !skipping) {
				found.push([open, t]);
				open = undefined;
				skipping = true;
			} else if (t === 'fragment') skipping = true;
			else if (t === 'query' || t === 'mutation' || t === 'subscription')
				open = t;
		}
	}
	return found;
}

/** Throws a worded `TypeError` for a document that is not exactly `subscription <name>`. */
export function checkDocuments(allow: Readonly<Record<string, string>>): void {
	for (const [name, document] of Object.entries(allow)) {
		const operations = definitions(document).filter(
			([kind]) => kind !== 'fragment',
		);
		const ok =
			operations.length === 1 &&
			operations[0]?.[0] === 'subscription' &&
			operations[0]?.[1] === name;
		if (!ok)
			throw new TypeError(
				`createSubscriptionProxy(): allow[${JSON.stringify(name)}] must define exactly one operation, \`subscription ${name}\`; its document defines ${
					operations.length === 0
						? 'none'
						: operations.map(([k, n]) => `${k}${n ? ` ${n}` : ''}`).join(', ')
				}. Fragments are allowed.`,
			);
	}
}
