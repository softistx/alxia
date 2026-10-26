import { type AuthLinksOptions, authLinks } from '../../src/session';
import type { Lang } from '../errors/format';
import { plainErrors } from '../errors/refusal';
import { flowFor } from './flow';

/** Auth links over a sign-in flow on development cookies; `revoked` lists the tokens ended. */
export function linksFor(overrides: Partial<AuthLinksOptions<Lang>> = {}) {
	const { flow, cookies, revoked } = flowFor();
	const links = authLinks<Lang>({
		signIn: flow,
		cookies,
		errors: plainErrors(),
		...overrides,
	});
	return { links, flow, cookies, revoked };
}

export const PATH = '/auth/magic-link';
