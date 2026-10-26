import { describe, expect, test } from 'bun:test';
import type { Lang } from '../../test/errors/format';
import { plainErrors } from '../../test/errors/refusal';
import { posted } from '../../test/session/flow';
import { jsonActions } from '../errors';
import { sessionCookies, signInFlow, stepUpSteps } from './index';

interface Caller {
	readonly ip: string;
}

/** A flow typed with a caller context: `C` is inferred as `Caller`. */
function callerFlow() {
	return signInFlow({
		cookies: sessionCookies({
			session: 'my-app_session',
			challenge: 'my-app_challenge',
			secure: false,
		}),
		errors: plainErrors(),
		json: jsonActions(),
		revoke: async (_token, _request, _context?: Caller) => {},
		attemptsLeft: (count: number, language: Lang) => `${count} (${language})`,
	});
}

describe('stepUpSteps() over a flow with a caller context', () => {
	test('takes the flow with no cast, and answers', async () => {
		const signIn = callerFlow();
		// The type test: this line fails `tsc` on 0.15.x (TS2322).
		const steps = stepUpSteps({
			signIn,
			spent: (language: Lang) => `ask again (${language})`,
		});
		const answer = await steps.request(
			async () => ({ challenge: 'c', via: 'email' }),
			{ request: posted('/step-up', 'old'), language: 'en' },
		);
		expect(answer).toEqual({
			ok: true,
			intent: 'request-step-up',
			challenge: 'c',
			via: 'email',
		});
	});
});
