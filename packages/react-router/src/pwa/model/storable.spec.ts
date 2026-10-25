import { describe, expect, test } from 'bun:test';
import { cachingFor } from './caching';
import { isStorable } from './storable';

// As alxia serves a static file: public, for a while.
const ok = (headers: Record<string, string> = {}) =>
	new Response('x', {
		status: 200,
		headers: {
			'content-type': 'text/javascript;charset=utf-8',
			'cache-control': 'public, max-age=3600',
			...headers,
		},
	});

describe('isStorable', () => {
	test('a public 200 is storable', () => {
		expect(isStorable(ok())).toBe(true);
		expect(
			isStorable(
				ok({ 'cache-control': 'public, max-age=31536000, immutable' }),
			),
		).toBe(true);
	});

	test('a private PDF is not', () => {
		expect(
			isStorable(
				new Response('%PDF-1.3', {
					headers: {
						'content-type': 'application/pdf',
						'cache-control': 'private, no-store',
					},
				}),
			),
		).toBe(false);
	});

	test("a response not marked public is not, a static-looking route's image included", () => {
		// `/teams/demo/members/1/photo.jpg` passes `cachingFor` (a static
		// extension), but a route answering it says nothing about sharing.
		expect(
			cachingFor(
				{
					method: 'GET',
					url: 'https://app.test/teams/demo/members/1/photo.jpg',
					mode: 'cors',
					destination: 'image',
					headers: new Headers(),
				},
				'https://app.test',
			),
		).toBe('static');
		const photo = new Response('jpeg', {
			status: 200,
			headers: { 'content-type': 'image/jpeg' },
		});
		expect(isStorable(photo)).toBe(false);
		expect(isStorable(ok({ 'cache-control': 'max-age=3600' }))).toBe(false);
		expect(isStorable(ok({ 'cache-control': '' }))).toBe(false);
	});

	test('scripts, styles, fonts and images are storable', () => {
		for (const type of [
			'application/javascript',
			'text/css; charset=utf-8',
			'font/woff2',
			'image/svg+xml',
			'image/png',
			'image/x-icon',
			'image/vnd.microsoft.icon',
		]) {
			expect(isStorable(ok({ 'content-type': type }))).toBe(true);
		}
	});

	test('a page, data or an unknown type is not, whatever its path', () => {
		for (const type of [
			'text/html; charset=utf-8',
			'application/xhtml+xml',
			'application/json',
			'text/x-script',
			'application/manifest+json',
			'text/plain',
			'application/octet-stream',
			'',
		]) {
			expect(isStorable(ok({ 'content-type': type }))).toBe(false);
		}
	});

	test('an error, a redirect or a partial response is not', () => {
		for (const status of [206, 304, 404, 500]) {
			expect(isStorable(new Response(null, { status }))).toBe(false);
		}
	});

	test('a private or no-store response is not', () => {
		expect(isStorable(ok({ 'cache-control': 'private, max-age=60' }))).toBe(
			false,
		);
		expect(isStorable(ok({ 'cache-control': 'public, no-store' }))).toBe(false);
	});

	test('a response varying on who asks is not', () => {
		expect(isStorable(ok({ vary: 'Cookie' }))).toBe(false);
		expect(isStorable(ok({ vary: 'Accept-Encoding, Authorization' }))).toBe(
			false,
		);
		expect(isStorable(ok({ vary: '*' }))).toBe(false);
		expect(isStorable(ok({ vary: 'Accept-Encoding' }))).toBe(true);
	});
});
