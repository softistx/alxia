import { describe, expect, test } from 'bun:test';
import { secretOf } from './proxy-secret';

const value = 'k3y-0f-sixteen+chars';
const headers = (record: Record<string, string>) => new Headers(record);

describe('judge', () => {
	const { judge } = secretOf(
		{ header: 'x-app-proxy-secret', value },
		'test',
		'x-forwarded-for',
	);

	test('the right value', () => {
		expect(judge(headers({ 'x-app-proxy-secret': value }))).toBe('right');
	});

	test('a wrong value, of the same length or not', () => {
		expect(judge(headers({ 'x-app-proxy-secret': value.toUpperCase() }))).toBe(
			'wrong',
		);
		expect(judge(headers({ 'x-app-proxy-secret': `${value}x` }))).toBe('wrong');
		expect(judge(headers({ 'x-app-proxy-secret': 'short' }))).toBe('wrong');
	});

	test('no header at all', () => {
		expect(judge(headers({}))).toBe('absent');
	});

	test('the header name is read without case', () => {
		expect(judge(headers({ 'X-App-Proxy-Secret': value }))).toBe('right');
	});
});

describe('rotation', () => {
	const next = 'the-new-secret-value-1234';
	const { judge } = secretOf(
		{ header: 'x-app-proxy-secret', value: [next, value] },
		'test',
		'x-forwarded-for',
	);

	test('either accepted value is right, any other wrong', () => {
		expect(judge(headers({ 'x-app-proxy-secret': value }))).toBe('right');
		expect(judge(headers({ 'x-app-proxy-secret': next }))).toBe('right');
		expect(
			judge(headers({ 'x-app-proxy-secret': 'a-third-secret-value-1' })),
		).toBe('wrong');
	});
});

describe('declaration', () => {
	const make = (option: unknown) => () =>
		secretOf(option as never, 'trustProxy', 'x-forwarded-for');
	const message = (option: unknown) => {
		try {
			make(option)();
		} catch (error) {
			return (error as Error).message;
		}
		return undefined;
	};

	test('a header that is no token, or one the proxy contract owns, is refused', () => {
		for (const header of [
			'',
			'bad header',
			'x-secret\n',
			'host',
			'Forwarded',
			'x-forwarded-for',
			'X-Forwarded-Anything',
		])
			expect(make({ header, value })).toThrow(TypeError);
		expect(make({ header: 'x-real-ip', value })).not.toThrow();
		expect(() =>
			secretOf({ header: 'x-real-ip', value }, 'trustProxy', 'x-real-ip'),
		).toThrow(TypeError);
	});

	test('a value under 16 characters, empty or no string is refused', () => {
		for (const bad of [
			'',
			'short',
			'a'.repeat(15),
			42,
			[],
			[value, 'short'],
			undefined,
		])
			expect(make({ header: 'x-secret', value: bad })).toThrow(TypeError);
		expect(make({ header: 'x-secret', value: 'a'.repeat(16) })).not.toThrow();
	});

	test('a missing option is refused', () => {
		expect(make(undefined)).toThrow(TypeError);
		expect(make('x-secret')).toThrow(TypeError);
	});

	test('no error quotes a value', () => {
		const seen = [
			message({ header: 'host', value }),
			message({ header: 'x-secret', value: 'tiny-secret' }),
			message({ header: 'x-secret', value: [value, 'tiny-secret'] }),
			message({ header: 'x-secret', value: 42 }),
		];
		for (const text of seen) {
			expect(text).toBeString();
			expect(text).not.toContain(value);
			expect(text).not.toContain('tiny-secret');
		}
	});
});
