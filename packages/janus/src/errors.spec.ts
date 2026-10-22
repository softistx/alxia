import { describe, expect, it } from 'bun:test';
import { alxia } from '@alxia/core';
import { JanusError, type JanusErrorCode, statusOf } from '@nxgt/janus';
import { bodyOf, janusErrors } from './errors';

/**
 * `MAIL_THROTTLED` is typed from @nxgt/janus 0.18 and the peer range still
 * admits 0.17, which has neither the code nor `MailThrottledError`: this
 * stands in for it on both.
 */
const mailThrottled = 'MAIL_THROTTLED' as JanusErrorCode;

class MailThrottled extends JanusError {
	override readonly code = mailThrottled;
}

class CredentialsInvalid extends JanusError {
	override readonly code = 'CREDENTIALS_INVALID' as const;
}

describe('bodyOf', () => {
	it('carries retryAfter of a throttled e-mail', () => {
		const error = new MailThrottled('too many e-mails', { retryAfter: 600 });
		expect(bodyOf(error)).toEqual({ code: mailThrottled, retryAfter: 600 });
	});

	it('is the code alone when retryAfter is unknown', () => {
		const error = new MailThrottled('too many e-mails');
		expect(bodyOf(error)).toEqual({ code: mailThrottled });
	});
});

describe('janusErrors(), a throttled answer', () => {
	const appThrowing = (error: JanusError, format?: { errors: 'problem' }) =>
		alxia(format)
			.use(janusErrors())
			.get('/ask', () => {
				throw error;
			});

	it('answers MAIL_THROTTLED 429 with Retry-After and retryAfter in the body', async () => {
		const response = await appThrowing(
			new MailThrottled('too many e-mails', { retryAfter: 600 }),
		).request('/ask');
		expect(response.status).toBe(statusOf(mailThrottled));
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('600');
		expect(await response.json()).toEqual({
			code: 'MAIL_THROTTLED',
			retryAfter: 600,
		});
	});

	it('answers MAIL_THROTTLED as a 429 problem under errors: problem', async () => {
		const response = await appThrowing(
			new MailThrottled('too many e-mails', { retryAfter: 600 }),
			{ errors: 'problem' },
		).request('/ask');
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('600');
		expect(response.headers.get('content-type')).toBe(
			'application/problem+json',
		);
		expect(await response.json()).toEqual({
			type: 'about:blank',
			title: 'Too Many Requests',
			status: 429,
			detail: 'Too Many Requests',
			instance: '/ask',
			code: 'MAIL_THROTTLED',
			retryAfter: 600,
		});
	});

	it('sends no Retry-After when the wait is unknown', async () => {
		const response = await appThrowing(
			new MailThrottled('too many e-mails'),
		).request('/ask');
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBeNull();
	});

	it('carries Retry-After on a throttled CREDENTIALS_INVALID', async () => {
		const response = await appThrowing(
			new CredentialsInvalid('throttled', { retryAfter: 30 }),
		).request('/ask');
		expect(response.status).toBe(statusOf('CREDENTIALS_INVALID'));
		expect(response.headers.get('retry-after')).toBe('30');
		expect(await response.json()).toEqual({
			code: 'CREDENTIALS_INVALID',
			retryAfter: 30,
		});
	});
});
