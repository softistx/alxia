import { expect, test } from 'bun:test';
import * as openapi from '@alxia/openapi';
import * as routes from './index';

// The types are re-exported too: each still names what it did.
const operations: routes.Operations = [];
const options: routes.MatchesSpecOptions &
	routes.ImplementedOptions &
	routes.ExactlyOptions = { prefix: '/api' };

test('re-exports every function of @alxia/openapi it had, the same ones', () => {
	expect(routes.implemented).toBe(openapi.implemented);
	expect(routes.matchesSpec).toBe(openapi.matchesSpec);
	expect(routes.exactly).toBe(openapi.exactly);
	expect(Object.keys(routes).sort()).toEqual([
		'exactly',
		'implemented',
		'matchesSpec',
	]);
	expect(() =>
		routes.matchesSpec({ routes: [] }, operations, options),
	).not.toThrow();
});
