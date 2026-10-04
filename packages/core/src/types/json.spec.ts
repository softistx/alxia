import { describe, expect, expectTypeOf, test } from 'bun:test';
import type { Jsonify, Simplify } from './json';

describe('Jsonify', () => {
	test('what a body reads as once it has crossed the wire', () => {
		type Wire = Jsonify<{
			at: Date;
			tags: Set<string>;
			file: Blob;
			n: number;
			save(): void;
		}>;
		expectTypeOf<Wire>().toEqualTypeOf<{
			at: string;
			tags: Record<string, never>;
			file: Blob;
			n: number;
		}>();
		expectTypeOf<Jsonify<readonly Date[]>>().toEqualTypeOf<string[]>();
		expectTypeOf<Jsonify<AsyncIterable<{ at: Date }>>>().toEqualTypeOf<
			AsyncIterable<{ at: string }>
		>();
		expect(JSON.parse(JSON.stringify({ at: new Date(0) }))).toEqual({
			at: '1970-01-01T00:00:00.000Z',
		});
	});

	test('Simplify flattens an intersection', () => {
		expectTypeOf<Simplify<{ a: 1 } & { b: 2 }>>().toEqualTypeOf<{
			a: 1;
			b: 2;
		}>();
	});
});
