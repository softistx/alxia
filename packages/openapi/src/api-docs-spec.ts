import { readFileSync } from 'node:fs';

/** A server of the document, as OpenAPI declares it. */
export interface DocsServer {
	readonly url: string;
	readonly description?: string;
}

/** The document, parsed once, and as the two files serve it. */
export interface LoadedSpec {
	readonly json: string;
	readonly yaml: string;
	/** The origins of its absolute `servers`: what "Try it out" may call. */
	readonly origins: readonly string[];
}

/**
 * Reads `spec`: an object, or a path to a YAML or JSON file, read once,
 * relative to the working directory. `servers` replaces the document's.
 * Throws a `TypeError` naming `apiDocs()`, at startup, rather than serve a
 * page that shows nothing.
 */
export function loadSpec(
	spec: string | object,
	servers: readonly DocsServer[] | undefined,
): LoadedSpec {
	let text: string | undefined;
	let document: unknown = spec;
	if (typeof spec === 'string') {
		text = read(spec);
		document = parse(spec, text);
	}
	if (
		typeof document !== 'object' ||
		document === null ||
		Array.isArray(document) ||
		typeof (document as { openapi?: unknown }).openapi !== 'string'
	) {
		throw new TypeError(
			`apiDocs(): ${typeof spec === 'string' ? `"${spec}"` : 'the spec'} is not an OpenAPI document: it has no "openapi" version`,
		);
	}
	const final = servers ? { ...document, servers } : document;
	const json = JSON.stringify(final, null, 2);
	// A file with its own servers kept is served as written, comments included.
	const yaml =
		text !== undefined && servers === undefined && !isJson(text)
			? text
			: Bun.YAML.stringify(final, null, 2);
	return { json, yaml, origins: originsOf(final) };
}

/**
 * The origin of each server whose URL is absolute and plain `http(s)`: a
 * relative one is the page's own origin, and a template
 * (`https://{region}.example.com`) names no origin a policy can allow.
 */
function originsOf(document: object): string[] {
	const servers = (document as { servers?: unknown }).servers;
	if (!Array.isArray(servers)) return [];
	const origins = new Set<string>();
	for (const server of servers) {
		const url = (server as { url?: unknown } | null)?.url;
		if (typeof url !== 'string' || url.includes('{')) continue;
		if (!/^https?:\/\//i.test(url)) continue;
		try {
			origins.add(new URL(url).origin);
		} catch {
			// Not a URL: nothing to allow.
		}
	}
	return [...origins];
}

function read(path: string): string {
	try {
		return readFileSync(path, 'utf8');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		throw new TypeError(
			`apiDocs(): cannot read the spec "${path}" (${code ?? 'unreadable'}), looked up from the working directory ${process.cwd()}`,
			{ cause: error },
		);
	}
}

function isJson(text: string): boolean {
	return /^\s*[{[]/.test(text);
}

function parse(path: string, text: string): unknown {
	try {
		return isJson(text) ? JSON.parse(text) : Bun.YAML.parse(text);
	} catch (error) {
		throw new TypeError(
			`apiDocs(): "${path}" is neither valid YAML nor valid JSON: ${(error as Error).message}`,
			{ cause: error },
		);
	}
}
