/** The hosts a key URL may name over plain `http`: this machine. */
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

export const isLocal = (url: string | URL): boolean =>
	LOCAL.has(new URL(url).hostname);

/** Parses a URL that keys may be fetched from: `https`, or `http` on the machine itself. */
export function keyUrl(
	value: string | URL,
	option: string,
	allowLocal = true,
): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new TypeError(`createJwt: ${option} is not a URL: ${String(value)}`);
	}
	if (
		url.protocol !== 'https:' &&
		!(allowLocal && url.protocol === 'http:' && LOCAL.has(url.hostname))
	) {
		throw new TypeError(`createJwt: ${option} must be an https URL`);
	}
	return url;
}
