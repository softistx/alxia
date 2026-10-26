import { type AuthLinksOptions, authLinks } from '../../src/session';
import type { Lang } from '../errors/format';
import { asking, flowFor } from './flow';

/** Auth links over a sign-in flow on development cookies; `revoked` lists the tokens ended. */
export function linksFor(overrides: Partial<AuthLinksOptions<Lang>> = {}) {
	const { flow, cookies, revoked } = flowFor();
	const links = authLinks<Lang>({
		signIn: flow,
		...overrides,
	});
	return { links, flow, cookies, revoked };
}

export const PATH = '/auth/magic-link';

/** A JSON post to a token page, as its action receives it; `token` is the session cookie's. */
export const posting = (token?: string, body: unknown = {}) =>
	asking(`${PATH}?token=secret`, token, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});

/** A cross-site form post: `text/plain`, which needs no preflight. */
export const crossSite = (token?: string) =>
	asking(`${PATH}?token=secret`, token, {
		method: 'POST',
		headers: { 'content-type': 'text/plain', origin: 'http://evil.test' },
		body: '{}',
	});

/** A JSON post another site sent: only the headers tell it from the page's own. */
export const crossSiteJson = (token?: string) =>
	asking(`${PATH}?token=secret`, token, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			origin: 'http://evil.test',
			'sec-fetch-site': 'cross-site',
		},
		body: '{}',
	});
