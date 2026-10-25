import { describe, expect, test } from 'bun:test';
import { wantsWholePage } from './whole-page';

const request = (agent?: string) =>
	new Request('http://localhost/', {
		headers: agent === undefined ? {} : { 'user-agent': agent },
	});

const BOT =
	'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BROWSER =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

describe('wantsWholePage', () => {
	test('a bot, by isbot', () => {
		expect(wantsWholePage(request(BOT), false)).toBe(true);
		expect(wantsWholePage(request(BROWSER), false)).toBe(false);
	});

	test('SPA mode always', () => {
		expect(wantsWholePage(request(BROWSER), true)).toBe(true);
		expect(wantsWholePage(request(), true)).toBe(true);
	});

	test('no user agent is not a bot', () => {
		expect(wantsWholePage(request(), false)).toBe(false);
	});

	test('isBot replaces isbot', () => {
		expect(wantsWholePage(request(BOT), false, () => false)).toBe(false);
		expect(wantsWholePage(request(BROWSER), false, () => true)).toBe(true);
	});

	test('isBot is not asked without a user agent', () => {
		const asked: string[] = [];
		wantsWholePage(request(), false, (agent) => !asked.push(agent));
		expect(asked).toEqual([]);
	});
});
