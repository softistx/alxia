import { describe, expect, test } from 'bun:test';
import { refusal } from '../../test/errors/refusal';
import {
	asking,
	body,
	END,
	flowFor,
	setCookies,
	thrown,
} from '../../test/session/flow';

const api = (status: number) =>
	refusal('auth.errors.x', 'Refused', { http: { status } });
const viewer = { id: 'u1', sessionExpiresAt: END.toISOString() };
const read = async () => viewer;
const expiresAt = (v: typeof viewer) => v.sessionExpiresAt;

describe('nextParam', () => {
	test('the next of the URL, safe to redirect to', () => {
		const { flow } = flowFor();
		expect(flow.nextParam(asking('/sign-in?next=%2Forders%3Fp%3D2'))).toBe(
			'/orders?p=2',
		);
		expect(flow.nextParam(asking('/sign-in?next=%2F%2Fevil.test'))).toBe('/');
		expect(flow.nextParam(asking('/sign-in'))).toBe('/');
	});
});

describe('viewer', () => {
	test('without a cookie: undefined, and the API is not asked', async () => {
		const { flow } = flowFor();
		let asked = false;
		const found = await flow.viewer(asking('/sign-in'), async () => {
			asked = true;
			return viewer;
		});
		expect(found).toBeUndefined();
		expect(asked).toBe(false);
	});

	test('a live session: the viewer, read with the cookie’s token', async () => {
		const { flow } = flowFor();
		let token = '';
		const found = await flow.viewer(asking('/sign-in', 'tok'), async (t) => {
			token = t;
			return viewer;
		});
		expect(found).toBe(viewer);
		expect(token).toBe('tok');
	});

	test('a 401 is a dead session: null', async () => {
		const { flow } = flowFor();
		const dead = () => Promise.reject(api(401));
		expect(await flow.viewer(asking('/sign-in', 'tok'), dead)).toBeNull();
	});

	test('a 503, an unreachable API or another failure cannot tell: undefined', async () => {
		const { flow } = flowFor();
		for (const error of [
			api(503),
			new Response('x', { status: 503 }),
			new Error('x'),
		]) {
			const found = await flow.viewer(asking('/sign-in', 'tok'), () =>
				Promise.reject(error),
			);
			expect(found).toBeUndefined();
		}
	});

	test('a token given asks for another session: one just opened', async () => {
		const { flow } = flowFor();
		let token = '';
		await flow.viewer(
			asking('/sign-in', 'old'),
			async (t) => {
				token = t;
				return viewer;
			},
			'new',
		);
		expect(token).toBe('new');
	});
});

describe('signInRedirect', () => {
	test('to the sign-in page, coming back to the page, the session cookie cleared', () => {
		const { flow } = flowFor();
		const response = flow.signInRedirect(
			asking('/orders/42.data?p=2&_routes=x'),
		);
		expect(response.headers.get('location')).toBe(
			'/sign-in?next=%2Forders%2F42%3Fp%3D2',
		);
		expect(setCookies(response)).toEqual([
			'my-app_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
		]);
	});

	test('the home page adds no next, and the app’s sign-in path is used', () => {
		const { flow } = flowFor({ paths: { signIn: '/login' } });
		expect(flow.signInRedirect(asking('/')).headers.get('location')).toBe(
			'/login',
		);
	});
});

describe('requireViewer', () => {
	test('without a cookie: the sign-in redirect is thrown', async () => {
		const { flow } = flowFor();
		const caught = (await thrown(() =>
			flow.requireViewer(asking('/orders'), read, expiresAt),
		)) as Response;
		expect(caught.status).toBe(302);
		expect(caught.headers.get('location')).toBe('/sign-in?next=%2Forders');
	});

	test('a 401 with a cookie is the redirect, saying the session ended when endedParam is set', async () => {
		const dead = () => Promise.reject(api(401));
		const plain = flowFor().flow;
		const ended = flowFor({ endedParam: 'expired' }).flow;
		const request = () => asking('/orders', 'tok');
		const without = (await thrown(() =>
			plain.requireViewer(request(), dead, expiresAt),
		)) as Response;
		const withParam = (await thrown(() =>
			ended.requireViewer(request(), dead, expiresAt),
		)) as Response;
		expect(without.headers.get('location')).toBe('/sign-in?next=%2Forders');
		expect(withParam.headers.get('location')).toBe(
			'/sign-in?expired=1&next=%2Forders',
		);
		expect(setCookies(withParam)[0]).toStartWith('my-app_session=; Max-Age=0');
	});

	test('endedParam says nothing for a request with no cookie', async () => {
		const { flow } = flowFor({ endedParam: 'expired' });
		const caught = (await thrown(() =>
			flow.requireViewer(asking('/orders'), read, expiresAt),
		)) as Response;
		expect(caught.headers.get('location')).toBe('/sign-in?next=%2Forders');
	});

	test('no viewer behind a live token is the redirect too', async () => {
		const { flow } = flowFor();
		const caught = (await thrown(() =>
			flow.requireViewer(asking('/orders', 'tok'), async () => null, expiresAt),
		)) as Response;
		expect(caught.headers.get('location')).toBe('/sign-in?next=%2Forders');
	});

	test('another failure goes to the error page, through routeError', async () => {
		const { flow } = flowFor();
		const caught = body(
			await thrown(() =>
				flow.requireViewer(
					asking('/orders', 'tok'),
					() => Promise.reject(api(503)),
					expiresAt,
				),
			),
		);
		expect(caught.init.status).toBe(503);
	});

	test('the viewer, with no header when the session’s end did not move', async () => {
		const { flow, cookies } = flowFor();
		const request = asking('/orders', 'tok');
		const session = cookies.read(request);
		const found = await flow.requireViewer(request, read, expiresAt);
		expect(found.viewer).toBe(viewer);
		expect(session?.expiresAt).toBe(END.getTime());
		expect(found.headers).toEqual({});
	});

	test('a header that sets the cookie again when the API moved the end', async () => {
		const { flow } = flowFor();
		const later = new Date(END.getTime() + 3_600_000).toISOString();
		const found = await flow.requireViewer(
			asking('/orders', 'tok'),
			async () => ({ ...viewer, sessionExpiresAt: later }),
			expiresAt,
		);
		expect((found.headers as Record<string, string>)['Set-Cookie']).toContain(
			`my-app_session=${Date.parse(later)}.tok`,
		);
	});
});
