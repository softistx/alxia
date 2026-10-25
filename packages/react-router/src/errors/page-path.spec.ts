import { describe, expect, test } from 'bun:test';
import { nextOf } from './page-path';

const of = (path: string) => nextOf(`https://app.test${path}`);

describe('nextOf', () => {
	test('keeps the path and the search of a document request', () => {
		expect(of('/todos/demo/list?q=a')).toBe('/todos/demo/list?q=a');
		expect(of('/todos')).toBe('/todos');
	});

	test("strips single fetch's .data and _routes", () => {
		expect(of('/todos/demo/list.data?q=a&_routes=root')).toBe(
			'/todos/demo/list?q=a',
		);
	});

	test('names the home page for /_.data', () => {
		expect(of('/_.data')).toBe('/');
		expect(of('/_.data?_routes=root')).toBe('/');
	});

	test('drops an empty index, keeps a valued one', () => {
		expect(of('/todos.data?index')).toBe('/todos');
		expect(of('/todos?index=')).toBe('/todos');
		expect(of('/todos?index=2')).toBe('/todos?index=2');
	});

	test('never starts with two slashes, which a redirect reads as another site', () => {
		expect(of('//evil.com/x')).toBe('/evil.com/x');
		expect(of('/\\evil.com')).toBe('/evil.com');
		expect(of('///evil.com.data?q=a')).toBe('/evil.com?q=a');
	});
});
