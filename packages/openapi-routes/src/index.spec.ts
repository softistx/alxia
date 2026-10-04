import { expect, test } from 'bun:test';
import * as openapi from '@alxia/openapi';
import * as routes from './index';

test('re-exports every function of @alxia/openapi it had, the same ones', () => {
	expect(routes.implemented).toBe(openapi.implemented);
	expect(routes.matchesSpec).toBe(openapi.matchesSpec);
	expect(routes.exactly).toBe(openapi.exactly);
	expect(Object.keys(routes).sort()).toEqual([
		'exactly',
		'implemented',
		'matchesSpec',
	]);
});
