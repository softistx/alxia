import { describe, expect, test } from 'bun:test';
import { asking, END, flowFor, thrown } from '../../test/session/flow';

const post = (payload: unknown, headers: Record<string, string> = {}) =>
	asking('/sign-in/second-factor?next=%2Forders', undefined, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: typeof payload === 'string' ? payload : JSON.stringify(payload),
	});

const statusOf = async (run: () => Promise<unknown>) =>
	((await thrown(run)) as { init?: { status?: number } }).init?.status;

describe('readCodeInput', () => {
	test('reads an issued code and a recovery code', async () => {
		const { flow } = flowFor();
		expect(
			await flow.readCodeInput(post({ kind: 'code', code: '123456' })),
		).toEqual({
			kind: 'code',
			code: '123456',
		});
		expect(
			await flow.readCodeInput(post({ kind: 'recovery', code: 'abcd-efgh' })),
		).toEqual({ kind: 'recovery', code: 'abcd-efgh' });
	});

	test('keeps nothing but the kind and the code', async () => {
		const { flow } = flowFor();
		const input = await flow.readCodeInput(
			post({ kind: 'code', code: '1', extra: true }),
		);
		expect(input).toEqual({ kind: 'code', code: '1' });
	});

	test('a native form post goes back to its page, which then posts JSON', async () => {
		const { flow } = flowFor();
		const form = post('code=1', {
			'content-type': 'application/x-www-form-urlencoded',
		});
		const caught = (await thrown(() => flow.readCodeInput(form))) as Response;
		expect(caught).toBeInstanceOf(Response);
		expect(caught.headers.get('location')).toBe(
			'/sign-in/second-factor?next=%2Forders',
		);
	});

	test('a cross-site post is a 403', async () => {
		const { flow } = flowFor();
		const evil = post(
			{ kind: 'code', code: '1' },
			{ origin: 'http://evil.test' },
		);
		expect(await statusOf(() => flow.readCodeInput(evil))).toBe(403);
		const cross = post(
			{ kind: 'code', code: '1' },
			{ 'sec-fetch-site': 'cross-site' },
		);
		expect(await statusOf(() => flow.readCodeInput(cross))).toBe(403);
	});

	test('a body of another shape is a 400', async () => {
		const { flow } = flowFor();
		const bad = [
			{ kind: 'totp', code: '123456' },
			{ method: 'code', code: '123456' },
			{ kind: 'code', code: 123456 },
			{ kind: 'code' },
			{ kind: 'code', code: 'x'.repeat(41) },
			null,
			'[]',
		];
		for (const payload of bad) {
			expect(await statusOf(() => flow.readCodeInput(post(payload)))).toBe(400);
		}
	});

	test('malformed JSON is a 400', async () => {
		const { flow } = flowFor();
		expect(await statusOf(() => flow.readCodeInput(post('{')))).toBe(400);
	});

	test('a code of 40 characters is the longest taken', async () => {
		const { flow } = flowFor();
		const code = 'x'.repeat(40);
		expect((await flow.readCodeInput(post({ kind: 'code', code }))).code).toBe(
			code,
		);
	});
});

describe('codeStep', () => {
	const answer = { status: 'signedIn', token: 't', expiresAt: END } as const;
	const steps = () => {
		const calls: string[][] = [];
		return {
			calls,
			confirm: async (...args: string[]) => {
				calls.push(['confirm', ...args]);
				return answer;
			},
			recover: async (...args: string[]) => {
				calls.push(['recover', ...args]);
				return answer;
			},
		};
	};

	test('an issued code is confirmed against the challenge', async () => {
		const { flow } = flowFor();
		const run = steps();
		expect(
			await flow.codeStep({ kind: 'code', code: '123456' }, 'c1', run),
		).toBe(answer);
		expect(run.calls).toEqual([['confirm', 'c1', '123456']]);
	});

	test('a recovery code is recovered against the challenge', async () => {
		const { flow } = flowFor();
		const run = steps();
		await flow.codeStep({ kind: 'recovery', code: 'abcd' }, 'c1', run);
		expect(run.calls).toEqual([['recover', 'c1', 'abcd']]);
	});
});
