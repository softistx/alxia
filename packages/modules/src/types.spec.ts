import { expect, expectTypeOf, test } from 'bun:test';
import { defineModule } from './module';
import type {
	ModuleHandle,
	ModuleMongo,
	ModuleName,
	Registered,
} from './types';

// Nothing is registered in this program: the fallback is any list and any name
// (the registered case is `test/register/app`).
test('with nothing registered, the types stay open', () => {
	expectTypeOf<ModuleName>().toEqualTypeOf<string>();
	expectTypeOf<ModuleMongo<'anything'>>().toEqualTypeOf<
		Readonly<Record<string, unknown>>
	>();
	expectTypeOf<Registered>().toMatchTypeOf<readonly unknown[]>();
	interface Handle {
		readonly db: { a: 1 };
		transaction<T>(fn: (tx: Handle) => Promise<T>): Promise<T>;
	}
	expectTypeOf<ModuleHandle<'x', Handle>['db']>().toEqualTypeOf<{ a: 1 }>();
});

test('defineModule keeps the manifest literal', () => {
	const m = defineModule({ name: 'a', dependsOn: ['b'] });
	expectTypeOf(m.name).toEqualTypeOf<'a'>();
	expect(m.dependsOn).toEqual(['b']);
});
