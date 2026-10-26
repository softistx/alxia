import { describe, expect, test } from 'bun:test';
import type { Lang } from '../../test/errors/format';
import { plainErrors } from '../../test/errors/refusal';
import { END, posted } from '../../test/session/flow';
import { jsonActions } from '../errors';
import { authLinks, sessionCookies, signInFlow } from './index';

interface Caller {
	readonly ip: string;
	readonly language: string;
}

const caller: Caller = { ip: '203.0.113.7', language: 'fr' };
const signedIn = { status: 'signedIn', token: 'new', expiresAt: END } as const;

/** A flow whose `revoke` annotates its context: `C` is inferred as `Caller`. */
function callerFlow() {
	const seen: Array<Caller | undefined> = [];
	const flow = signInFlow({
		cookies: sessionCookies({
			session: 'my-app_session',
			challenge: 'my-app_challenge',
			secure: false,
		}),
		errors: plainErrors(),
		json: jsonActions(),
		revoke: async (_token, _request, context?: Caller) => {
			seen.push(context);
		},
		attemptsLeft: (count: number, language: Lang) => `${count} (${language})`,
	});
	return { flow, links: authLinks({ signIn: flow }), seen };
}

describe('the caller context reaches revoke', () => {
	test('signOut', async () => {
		const { flow, seen } = callerFlow();
		await flow.signOut(posted('/sign-out', 'old'), { context: caller });
		await flow.signOut(posted('/sign-out', 'old'));
		expect(seen).toEqual([caller, undefined]);
	});

	test('revokeSession', async () => {
		const { flow, seen } = callerFlow();
		await flow.revokeSession(posted('/x', 'old'), { context: caller });
		await flow.revokeSession(posted('/x', 'old'));
		expect(seen).toEqual([caller, undefined]);
	});

	test('landReplacing', async () => {
		const { flow, seen } = callerFlow();
		const request = posted('/sign-in', 'old');
		await flow.landReplacing(signedIn, '/', { request, context: caller });
		await flow.landReplacing(signedIn, '/', { request });
		expect(seen).toEqual([caller, undefined]);
	});

	test('signInStep', async () => {
		const { flow, seen } = callerFlow();
		const options = {
			request: posted('/sign-in', 'old'),
			language: 'en' as const,
			next: '/',
			extra: {},
		};
		await flow.signInStep(async () => signedIn, {
			...options,
			context: caller,
		});
		await flow.signInStep(async () => signedIn, options);
		expect(seen).toEqual([caller, undefined]);
	});

	test('landByLink and afterReset', async () => {
		const { links, seen } = callerFlow();
		const request = posted('/auth/link?token=t', 'old');
		const call = { request, language: 'en' as const };
		await links.landByLink(signedIn, { ...call, context: caller });
		await links.landByLink(signedIn, call);
		await links.afterReset(request, { context: caller });
		await links.afterReset(request);
		expect(seen).toEqual([caller, undefined, caller, undefined]);
	});

	test('a two-argument revoke still compiles and runs', async () => {
		const revoked: string[] = [];
		const flow = signInFlow<Lang>({
			cookies: sessionCookies({
				session: 'my-app_session',
				challenge: 'my-app_challenge',
				secure: false,
			}),
			errors: plainErrors(),
			json: jsonActions(),
			revoke: async (token, _request) => {
				revoked.push(token);
			},
			attemptsLeft: (count, language) => `${count} (${language})`,
		});
		await flow.signOut(posted('/sign-out', 'old'));
		expect(revoked).toEqual(['old']);
	});
});

describe('what the context type refuses', () => {
	test('a context that is not the revoke annotation’s type', async () => {
		const { flow, links } = callerFlow();
		const request = posted('/sign-out', 'old');
		// @ts-expect-error the context is a Caller, not a string
		const out = () => flow.signOut(request, { context: 'fr' });
		// @ts-expect-error the context is a Caller: `language` is missing
		const reset = () => links.afterReset(request, { context: { ip: 'x' } });
		expect([out, reset]).toHaveLength(2);
	});
});
