/** What a plugin made by `definePlugin` needs from the app that uses it. */
import type { Empty } from './common';
import type { BaseContext } from './context';

/** Carries a plugin's requirement to `use`, which checks it against the app's context. */
export interface Requiring<Requires> {
	/** Never set: what the plugin reads from the context of the app that uses it. */
	readonly '~requires': Requires;
}

/**
 * `unknown` when the context `Ctx` gives what `Requires` reads; otherwise a
 * `'~requires'` whose type is the message: one per key the context gives
 * not at all, or with another type, or one for the whole requirement when
 * no key can be named (a symbol key, a union). The messages are written
 * inline, not behind an alias, so that an error prints them.
 *
 * The first test adds `request` to the target so that a requirement of
 * optional keys alone is no weak type: an app without them still passes.
 */
export type ProvidedBy<Ctx, Requires> = BaseContext & Ctx extends {
	readonly request: Request;
} & Requires
	? unknown
	: {
				[Key in keyof Requires]-?: Key extends keyof (BaseContext & Ctx)
					? (BaseContext & Ctx)[Key] extends Requires[Key]
						? never
						: `the plugin reads "${Key & (string | number)}", which this app's context gives with another type`
					: `the plugin reads "${Key & (string | number)}", which this app's context does not give: use the plugin that adds it first`;
			}[keyof Requires] extends infer Message
		? {
				readonly '~requires': [Message] extends [never]
					? "this app's context does not give what the plugin reads"
					: Message;
			}
		: never;

/**
 * What a callback whose parameter is annotated `Ctx` reads beyond
 * `BaseContext`: `{ user: User }` for `BaseContext & { user: User }`, and
 * `Empty` when it reads nothing more. A key of `BaseContext` annotated with
 * a type `BaseContext` does not give — `{ url: string }` — is kept, so `use`
 * refuses it. What a plugin factory passes to `definePlugin` when it infers
 * its requirement from a callback it is given:
 *
 * ```ts
 * function audit<Ctx extends object = BaseContext>(
 *   who: (ctx: BaseContext & Ctx) => string,
 * ) {
 *   return definePlugin<RequiresOf<Ctx>>()((app) => app.onResponse(…));
 * }
 * ```
 *
 * The mapped type is written twice, not behind an alias, so that an error
 * prints `{ user: User }` rather than the alias's name.
 */
export type RequiresOf<Ctx> = [
	keyof {
		[Key in keyof Ctx as Key extends keyof BaseContext
			? BaseContext[Key] extends Ctx[Key]
				? never
				: Key
			: Key]: Ctx[Key];
	},
] extends [never]
	? Empty
	: {
			[Key in keyof Ctx as Key extends keyof BaseContext
				? BaseContext[Key] extends Ctx[Key]
					? never
					: Key
				: Key]: Ctx[Key];
		};
