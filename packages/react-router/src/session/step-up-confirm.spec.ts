import { describe, expect, test } from 'bun:test';
import type { Lang } from '../../test/errors/format';
import { refusal } from '../../test/errors/refusal';
import { body, stepCall, thrown } from '../../test/session/flow';
import { down, steps, wrong } from '../../test/session/step-up';
import type { StepUpStepsOptions } from './step-up-types';

describe('confirm', () => {
	const confirm = (
		error: unknown,
		via?: 'email' | 'secondFactor',
		overrides: Partial<StepUpStepsOptions<Lang>> = {},
	) =>
		steps(overrides)
			.confirm(() => Promise.reject(error), { ...stepCall(), via })
			.then(body);

	test('a code accepted is a plain ok', async () => {
		expect(
			await steps().confirm(async () => true, { ...stepCall(), via: 'email' }),
		).toEqual({ ok: true, intent: 'confirm-step-up' });
	});

	test('a 429 is throttled with retryAfter and does not end the challenge', async () => {
		const result = await confirm(
			refusal(
				'rate-limit.errors.too-many',
				'Slow down',
				{ retryAfter: 20 },
				429,
			),
			'email',
		);
		expect(result.data).toEqual({
			ok: false,
			intent: 'confirm-step-up',
			error: 'throttled',
			locked: false,
			message: 'Slow down',
			retryAfter: 20,
		});
		expect(result.init.status).toBe(429);
	});

	test('a 429 on a wrong-code code is throttled too, without retryAfter when none', async () => {
		const result = await confirm(refusal('CODE_INVALID', 'Slow down', {}, 429));
		expect(result.data['error']).toBe('throttled');
		expect(result.data).not.toHaveProperty('retryAfter');
	});

	test('a wrong code with tries left is invalid, with the count worded', async () => {
		const result = await confirm(wrong(3), 'email');
		expect(result.data).toEqual({
			ok: false,
			intent: 'confirm-step-up',
			error: 'invalid',
			attemptsLeft: 3,
			locked: false,
			message: 'Wrong code 3 left (en)',
		});
		expect(result.init.status).toBe(401);
	});

	test('a wrong code with no count is invalid, with the message alone', async () => {
		const result = await confirm(wrong(), 'secondFactor');
		expect(result.data).toEqual({
			ok: false,
			intent: 'confirm-step-up',
			error: 'invalid',
			locked: false,
			message: 'Wrong code',
		});
	});

	test('0 tries left on a mailed code is expired: ask again', async () => {
		const result = await confirm(wrong(0), 'email');
		expect(result.data).toEqual({
			ok: false,
			intent: 'confirm-step-up',
			error: 'expired',
			attemptsLeft: 0,
			locked: false,
			message: 'ask again (en)',
		});
	});

	test('0 tries left with no via is read as a mailed code', async () => {
		expect((await confirm(wrong(0))).data['error']).toBe('expired');
	});

	test('0 tries left on an app or recovery code is locked, with the wait', async () => {
		const result = await confirm(wrong(0), 'secondFactor');
		expect(result.data).toEqual({
			ok: false,
			intent: 'confirm-step-up',
			error: 'invalid',
			attemptsLeft: 0,
			locked: true,
			message: 'Wrong code wait (en)',
		});
	});

	test('locked without a `locked` wording is still locked, with the message alone', async () => {
		const result = await steps({}, ['locked'])
			.confirm(() => Promise.reject(wrong(0)), {
				...stepCall(),
				via: 'secondFactor',
			})
			.then(body);
		expect(result.data).toMatchObject({ locked: true, message: 'Wrong code' });
	});

	test.each([
		'TOKEN_UNKNOWN',
		'TOKEN_SPENT',
		'TOKEN_EXPIRED',
		'TOKEN_STALE',
		'SECOND_FACTOR_ACTIVE',
		'SECOND_FACTOR_NOT_ENROLLED',
	])('%s ends the challenge: expired, ask again', async (code) => {
		const result = await confirm(refusal(code, 'gone', {}, 400), 'email');
		expect(result.data).toEqual({
			ok: false,
			intent: 'confirm-step-up',
			error: 'expired',
			locked: false,
			message: 'ask again (en)',
		});
		expect(result.init.status).toBe(400);
	});

	test('wording words a challenge that is gone; spent stays for the tries running out and as fallback', async () => {
		const wording = (error: { code?: string | undefined }) =>
			error.code === 'TOKEN_EXPIRED' ? 'catalogue words' : undefined;
		const gone = await confirm(
			refusal('TOKEN_EXPIRED', 'x', {}, 400),
			'email',
			{
				wording,
			},
		);
		expect(gone.data).toMatchObject({
			error: 'expired',
			message: 'catalogue words',
		});
		const other = await confirm(refusal('TOKEN_SPENT', 'x', {}, 400), 'email', {
			wording,
		});
		expect(other.data).toMatchObject({ message: 'ask again (en)' });
		const none = await confirm(wrong(0), 'email', { wording: () => 'nope' });
		expect(none.data).toMatchObject({
			error: 'expired',
			message: 'ask again (en)',
		});
	});

	test('codes.challengeOver replaces the default list', async () => {
		const own = { codes: { challengeOver: ['my.errors.gone'] } };
		expect(
			(await confirm(refusal('my.errors.gone', 'gone'), 'email', own)).data[
				'error'
			],
		).toBe('expired');
		expect(
			(await confirm(refusal('TOKEN_SPENT', 'spent'), 'email', own)).data[
				'error'
			],
		).toBe('failed');
	});

	test('codes.invalidCode names the app’s wrong-code code', async () => {
		const result = await confirm(
			refusal('auth.errors.invalid-code', 'Wrong code', { attemptsLeft: 2 }),
			'email',
			{ codes: { invalidCode: 'auth.errors.invalid-code' } },
		);
		expect(result.data).toMatchObject({ error: 'invalid', attemptsLeft: 2 });
	});

	test('any other refusal is failed, in the app’s wording when it has one', async () => {
		const other = refusal('USER_INACTIVE', 'Inactive', {}, 403);
		const plain = await confirm(other, 'email');
		expect(plain.data).toEqual({
			ok: false,
			intent: 'confirm-step-up',
			error: 'failed',
			locked: false,
			message: 'Inactive',
		});
		expect(plain.init.status).toBe(403);
		const own = await confirm(other, 'email', { wording: () => 'Closed' });
		expect(own.data['message']).toBe('Closed');
	});

	test('an API it cannot reach is failed with a 503', async () => {
		const result = await confirm(down(), 'email');
		expect(result.data).toMatchObject({
			error: 'failed',
			locked: false,
			message: 'The service is unavailable.',
		});
		expect(result.init.status).toBe(503);
	});

	test('a failure that is not the API’s is rethrown', async () => {
		const bug = new TypeError('bug');
		expect(await thrown(() => confirm(bug, 'email'))).toBe(bug);
	});

	test('run is called with nothing: the page binds the challenge and the code', async () => {
		let received: unknown[] | undefined;
		await steps().confirm(
			async (...args: unknown[]) => {
				received = args;
			},
			{ ...stepCall(), via: 'email' },
		);
		expect(received).toEqual([]);
	});
});
