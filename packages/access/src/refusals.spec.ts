import { describe, expect, test } from 'bun:test';
import { forbidden, unauthenticated } from './errors';
import { refusalMapper, refusalOf, withRefusals } from './refusals';

class HostError extends Error {
	constructor(
		readonly extensions: { code: string; status: number },
		message: string,
	) {
		super(message);
	}
}
const toHost = (r: { code: string; status: number }) =>
	new HostError(
		{ code: r.code.replace('auth.errors.', 'AUTH_'), status: r.status },
		r.code,
	);

describe('refusalOf', () => {
	test('reads a guard refusal and a tenancy-shaped one, nothing else', () => {
		expect(refusalOf(forbidden('a:read'))).toMatchObject({
			code: 'auth.errors.forbidden',
			status: 403,
		});
		const tenancy = Object.assign(new Error('x'), {
			code: 'tenancy.errors.unknown-organization',
			status: 404,
			params: {},
		});
		expect(refusalOf(tenancy)?.status).toBe(404);
		expect(refusalOf(new Error('boom'))).toBeUndefined();
		expect(
			refusalOf(Object.assign(new Error('x'), { code: 'other', status: 400 })),
		).toBeUndefined();
		expect(refusalOf('text')).toBeUndefined();
		expect(refusalOf(null)).toBeUndefined();
	});
});

describe('refusalMapper', () => {
	const map = refusalMapper(toHost);
	test('maps refusals to the host error and leaves other errors alone', () => {
		const mapped = map(unauthenticated());
		expect(mapped).toBeInstanceOf(HostError);
		expect((mapped as HostError).extensions).toEqual({
			code: 'AUTH_unauthenticated',
			status: 401,
		});
		const other = new Error('boom');
		expect(map(other)).toBe(other);
	});
});

describe('withRefusals', () => {
	test('a resolver that refuses throws the mapped error, one that answers answers', async () => {
		const guarded = withRefusals(toHost, async (id: string) => {
			if (id === 'no') throw forbidden('a:manage');
			return id;
		});
		expect(await guarded('yes')).toBe('yes');
		await expect(guarded('no')).rejects.toBeInstanceOf(HostError);
	});
});
