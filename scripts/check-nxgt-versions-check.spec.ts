import { describe, expect, test } from 'bun:test';
import { check } from './check-nxgt-versions';
import { lock, manifests } from './test/check-nxgt-versions-helpers';

describe('check', () => {
	const input = async () => ({ manifests, lockPackages: lock });
	const latest = (versions: Record<string, string>) => async (name: string) =>
		versions[name] ?? Promise.reject(new Error(`no answer for ${name}`));

	test('exits 0 when everything is current', async () => {
		expect(
			await check(
				input,
				latest({
					'@nxgt/i18n': '2.0.0',
					'@nxgt/redis': '0.3.1',
				}),
			),
		).toEqual({
			code: 0,
			lines: ['2 @nxgt/* devDependencies, all current'],
		});
	});

	test('exits 1 with one line per package behind', async () => {
		expect(
			await check(
				input,
				latest({
					'@nxgt/i18n': '2.1.0',
					'@nxgt/redis': '0.3.1',
				}),
			),
		).toEqual({
			code: 1,
			lines: [
				'- @nxgt/i18n: 2.0.0 → 2.1.0 (packages/i18n, peer ^2.0.0 admits it)',
			],
		});
	});

	test('exits 2 when the registry cannot say, rather than calling it current', async () => {
		expect(
			await check(input, async (name) => {
				throw new Error(`npm has no latest ${name}: 503 Service Unavailable`);
			}),
		).toEqual({
			code: 2,
			lines: ['npm has no latest @nxgt/i18n: 503 Service Unavailable'],
		});
	});

	test('exits 2 when the repository cannot be read', async () => {
		expect(
			await check(
				async () => {
					throw new Error('ENOENT: bun.lock');
				},
				async () => '0.0.0',
			),
		).toEqual({ code: 2, lines: ['ENOENT: bun.lock'] });
	});
});
