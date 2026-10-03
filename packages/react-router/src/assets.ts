/**
 * The client build's files, served before the catch-all: the hashed
 * `assets/` immutable, every other top-level file or folder — what React
 * Router copied from `public/` — with an hour's cache.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** A hashed asset never changes under its name. */
export const IMMUTABLE = 'public, max-age=31536000, immutable';
/** A public file keeps its name across builds: revalidated after an hour. */
export const AN_HOUR = 'public, max-age=3600';

interface Serving {
	static(path: string, source: string, options: object): unknown;
	file(path: string, file: string, options: object): unknown;
}

/** Declares the client build's routes on `app`. */
export function serveClient(app: Serving, client: string): void {
	if (!isDirectory(client)) {
		throw new TypeError(
			`reactRouter(): client is ${client}, which is not a directory. Pass the client build, build/client by default.`,
		);
	}
	for (const name of readdirSync(client).sort()) {
		if (name.startsWith('.')) continue;
		const path = join(client, name);
		const cacheControl = name === 'assets' ? IMMUTABLE : AN_HOUR;
		// Declared as a request's URL carries the name: `my file.pdf` is
		// `/my%20file.pdf`, `café.png` is `/caf%C3%A9.png`.
		const route = new URL(`/${name}`, 'http://localhost').pathname;
		try {
			if (isDirectory(path)) app.static(route, path, { cacheControl });
			else app.file(route, path, { cacheControl });
		} catch (error) {
			throw new TypeError(
				`reactRouter(): ${path} cannot be served at a path of its own name; rename it. ${(error as Error).message}`,
			);
		}
	}
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
