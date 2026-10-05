import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import {
	getPet,
	operations,
	searchEmployees,
	watchPets,
} from '../test/openapi-helpers';
import { implemented, matchesSpec, type Operations } from './routes';

describe('the operations it takes', () => {
	test('the generated object, a list, and core’s RouteOperation', () => {
		const asRecord: Operations = operations;
		const asList: Operations = [searchEmployees, getPet, watchPets];
		const asData: Operations = [{ method: 'DELETE', path: '/pets/:petId' }];
		expect([asRecord, asList, asData]).toHaveLength(3);
		const _refused = () => {
			// @ts-expect-error a method alxia cannot route
			implemented(alxia(), [{ method: 'TRACE', path: '/x' }]);
			// @ts-expect-error a path must start with "/"
			implemented(alxia(), { x: { method: 'GET', path: 'pets' } });
			// @ts-expect-error an object that is not an app
			implemented({}, operations);
			// @ts-expect-error a prefix starts with "/", as the app's does
			implemented(alxia(), operations, { prefix: 'api' });
			// @ts-expect-error matchesSpec takes the same prefix
			matchesSpec(alxia(), operations, { prefix: 'api' });
			// @ts-expect-error exclude reads a route and answers a boolean
			matchesSpec(alxia(), operations, { exclude: (route: string) => route });
		};
		expect(_refused).toBeFunction();
	});
});
