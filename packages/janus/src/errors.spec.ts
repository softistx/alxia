import { describe, expect, it } from 'bun:test';
import { JanusError, type JanusErrorCode } from '@nxgt/janus';
import { bodyOf } from './errors';

/**
 * `MAIL_THROTTLED` is typed from @nxgt/janus 0.18 and the peer range still
 * admits 0.17, which has neither the code nor `MailThrottledError`: this
 * stands in for it on both.
 */
const mailThrottled = 'MAIL_THROTTLED' as JanusErrorCode;

class MailThrottled extends JanusError {
	override readonly code = mailThrottled;
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
