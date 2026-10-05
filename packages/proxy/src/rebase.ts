/**
 * The upstream's own addresses, rewritten back to the public side: a
 * `Location` that points at the upstream, and the `Domain` and `Path` of
 * the cookies it sets, so a browser follows the redirect and sends the
 * cookie back through the proxy.
 */
import type { Plan } from './options';

/** Rewrites `headers`, the upstream's response headers, under `plan.rebase`. */
export function rebaseResponse(plan: Plan, headers: Headers): void {
	const prefix = plan.rebase;
	if (prefix === undefined) return;
	const location = headers.get('location');
	if (location !== null) {
		const rebased = rebaseLocation(plan, prefix, location);
		if (rebased !== undefined) headers.set('location', rebased);
	}
	const cookies = headers.getSetCookie();
	if (cookies.length === 0) return;
	headers.delete('set-cookie');
	for (const cookie of cookies) {
		headers.append('set-cookie', rebaseCookie(plan, prefix, cookie));
	}
}

/**
 * `location` on the public side, or `undefined` to leave it: one on the
 * upstream's origin, or a path, under the target's path, moved under
 * `prefix` as a path. A location elsewhere, or relative, is left as is.
 */
function rebaseLocation(
	plan: Plan,
	prefix: string,
	location: string,
): string | undefined {
	const absolute =
		/^[a-z][a-z0-9+.-]*:/i.test(location) || location.startsWith('//');
	if (!absolute && !location.startsWith('/')) return undefined;
	let url: URL;
	try {
		url = new URL(location, plan.target);
	} catch {
		return undefined;
	}
	if (absolute && url.origin !== plan.target.origin) return undefined;
	const path = publicPath(plan, prefix, url.pathname);
	if (path === undefined) return undefined;
	return `${path}${url.search}${url.hash}`;
}

/** `path`, an upstream path, under `prefix`; `undefined` when it is not under the target's path. */
function publicPath(
	plan: Plan,
	prefix: string,
	path: string,
): string | undefined {
	const { base } = plan;
	if (base !== '' && path !== base && !path.startsWith(`${base}/`)) {
		return undefined;
	}
	const rest = path.slice(base.length);
	if (rest === '' || rest === '/') return prefix === '' ? '/' : prefix;
	return `${prefix}${rest}`;
}

/**
 * One `Set-Cookie` on the public side: a `Domain` naming the upstream's
 * host removed, so the cookie is the public host's; a `Path` under the
 * target's path moved under `prefix`.
 */
function rebaseCookie(plan: Plan, prefix: string, cookie: string): string {
	const [pair = '', ...attributes] = cookie.split(';');
	const kept: string[] = [pair];
	const host = plan.target.hostname.toLowerCase();
	for (const attribute of attributes) {
		const at = attribute.indexOf('=');
		const name = (at < 0 ? attribute : attribute.slice(0, at))
			.trim()
			.toLowerCase();
		const value = at < 0 ? '' : attribute.slice(at + 1).trim();
		if (name === 'domain') {
			if (value.replace(/^\./, '').toLowerCase() === host) continue;
		} else if (name === 'path' && value.startsWith('/')) {
			const path = publicPath(plan, prefix, value);
			if (path !== undefined) {
				kept.push(` Path=${path}`);
				continue;
			}
		}
		kept.push(attribute);
	}
	return kept.join(';');
}
