import { describe, expect, expectTypeOf, test } from 'bun:test';
import type { ContentTooLargeBody } from '../errors/errors';
import type { Reply } from '../reply/reply';
import { type Alxia, alxia } from './alxia';

type ShortcutsOf<App> = App extends Alxia<any, any, infer S> ? S : never;

import type { BodyLimited, Refusing } from './types';

// The replies an app's hooks may end a request with, carried in its type as
// `Shortcuts` (the third argument): pinned, since no route reads them.
describe('Shortcuts', () => {
	test("a hook's reply, a bodyLimit and an onRefusal reply are carried", () => {
		const app = alxia()
			.derive(({ request, reply }) =>
				request.headers.has('x-user')
					? { user: 'ada' }
					: reply(401, { error: 'unauthorized' as const }),
			)
			.bodyLimit(1024)
			.onRefusal((_refusal, { reply }) =>
				reply(422, { error: 'invalid' as const }),
			);
		expectTypeOf<ShortcutsOf<typeof app>>().toEqualTypeOf<
			| Reply<401, { readonly error: 'unauthorized' }>
			| (Reply<413, ContentTooLargeBody> & BodyLimited)
			| (Reply<422, { readonly error: 'invalid' }> & Refusing)
		>();
		expect(app.routes).toEqual([]);
	});

	test("a plugin's are the using app's after it, its general onRefusal replacing the app's", () => {
		const plugin = alxia().onRefusal((_refusal, { reply }) =>
			reply(400, { error: 'plugin' as const }),
		);
		const app = alxia()
			.onRefusal((_refusal, { reply }) => reply(400, { error: 'app' as const }))
			.plugin(plugin);
		expectTypeOf<ShortcutsOf<typeof app>>().toEqualTypeOf<
			Reply<400, { readonly error: 'plugin' }> & Refusing
		>();
	});
});
