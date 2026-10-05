/**
 * The lists the forwarding headers carry, read as the proxies write them:
 * split on every `,` and `;`, quoted or not. A proxy appends `, <entry>`
 * whatever stands left of it, so a quote a client opens can never swallow
 * the entries the proxies wrote after it; a valid value holds neither.
 */

/**
 * What an element of `Forwarded` says of one hop: its first `for`, as
 * `forwardedIp` has always read it, and its other parameters by lowercase
 * name, unquoted — `TWICE` for one it names twice (RFC 7239 §4: it must
 * not), which then says nothing.
 */
export interface ForwardedElement {
	readonly for: string | undefined;
	readonly params: ReadonlyMap<string, string>;
}

/** A parameter an element names twice. */
export const TWICE = '\u0000twice';

/** A quoted-string's content, its `\` escapes undone; any other value trimmed. */
export function unquote(value: string): string {
	const text = value.trim();
	if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"'))
		return text;
	return text.slice(1, -1).replace(/\\(.)/g, '$1');
}

/** A comma-separated header's entries, left to right, each trimmed; none for a missing header. */
export function listOf(value: string | null): string[] {
	return value === null ? [] : value.split(',').map((entry) => entry.trim());
}

/** `Forwarded`'s elements, left to right; none for a missing header. */
export function elementsOf(value: string | null): ForwardedElement[] {
	if (value === null) return [];
	return value.split(',').map((element) => {
		const params = new Map<string, string>();
		let first: string | undefined;
		for (const pair of element.split(';')) {
			const at = pair.indexOf('=');
			if (at < 0) continue;
			const name = pair.slice(0, at).trim().toLowerCase();
			const given = unquote(pair.slice(at + 1));
			if (name === 'for') first ??= given;
			params.set(name, params.has(name) ? TWICE : given);
		}
		return { for: first, params };
	});
}
