/** What a plugin made by `definePlugin` needs from the app that uses it. */
import type { Empty } from './common';
import type { BaseContext } from './context';

/** Carries a plugin's requirement to `use`, which checks it against the app's context. */
export interface Requiring<Requires> {
	/** Never set: what the plugin reads from the context of the app that uses it. */
	readonly '~requires': Requires;
}

/**
 * Carries, inside an app's context, what that app requires of the one that
 * mounts it: what `defineRoutes` starts from. A function of it, never set,
 * so that a route reading `'~requires'` gets nothing it could use.
 */
export interface RequiringContext<Requires> {
	/** Never set: what the app that mounts this one must give. */
	readonly '~requires': (provided: Requires) => void;
}

/**
 * `unknown` when the context `Ctx` gives what `Requires` reads; otherwise a
 * `'~requires'` whose type is the message: one per key the context gives
 * not at all, or with another type, or one for the whole requirement when
 * no key can be named (a symbol key, a union). The messages are written
 * inline, not behind an alias, so that an error prints them.
 *
 * A `RequiresOf` of a callback annotated `any` carries its own message
 * under `'~any'`, which every app is refused with: a requirement whose key
 * is `'~any'` is taken for that message, so no plugin should name one.
 *
 * The first test adds `request` to the target so that a requirement of
 * optional keys alone is no weak type: an app without them still passes.
 */
export type ProvidedBy<Ctx, Requires> = [AnyMessage<Requires>] extends [never]
	? BaseContext & Ctx extends {
			readonly request: Request;
		} & Requires
		? unknown
		: {
					[Key in keyof Requires]-?: Key extends keyof (BaseContext & Ctx)
						? (BaseContext & Ctx)[Key] extends Requires[Key]
							? never
							: `the plugin reads "${Key & (string | number)}", which this app's context gives with another type`
						: `the plugin reads "${Key & (string | number)}", which this app's context does not give: add the plugin or middleware that gives it first`;
				}[keyof Requires] extends infer Message
			? {
					readonly '~requires': [Message] extends [never]
						? "this app's context does not give what the plugin reads"
						: Message;
				}
			: never
	: { readonly '~requires': AnyMessage<Requires> };

/** The message of a `RequiresOf` refusing an `any`, `never` for any other requirement. */
type AnyMessage<Requires> = [Requires] extends [never]
	? never
	: [Requires] extends [{ readonly '~any': infer Message }]
		? Message
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
 *   return definePlugin<RequiresOf<Ctx, 'who'>>()((app) => app.onResponse(…));
 * }
 * ```
 *
 * A parameter annotated `any` — or `Record<string, any>`, any key as `any` —
 * would read anything and require nothing, so the check would be off
 * without a word: it gives a requirement `plugin` refuses on every app,
 * naming `Callback` — `resolve`, `load` — in its message. `unknown` and
 * `object` read nothing without a cast, and give `Empty`, as an unannotated
 * parameter does.
 *
 * The mapped type is written twice, not behind an alias, so that an error
 * prints `{ user: User }` rather than the alias's name.
 */
export type RequiresOf<Ctx, Callback extends string = 'callback'> =
	ReadsAnything<Ctx> extends true
		? {
				readonly '~any': `the plugin's ${Callback} reads its context as any: annotate what it reads, or leave it unannotated`;
			}
		: RequiresOfTyped<Ctx>;

/** `RequiresOf` of a `Ctx` that is not `any`. */
type RequiresOfTyped<Ctx> = [
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

/** Whether `Ctx` is `any`, or gives any string key as `any`. */
type ReadsAnything<Ctx> =
	IsAny<Ctx> extends true
		? true
		: string extends keyof Ctx
			? IsAny<Ctx[string & keyof Ctx]>
			: false;

/**
 * Whether `T` is `any`: besides `never`, which is ruled out first, only
 * `any` is assignable to two disjoint types.
 * `0 extends 1 & T` would not do: under `T extends object`, `1 & T`
 * reduces to `never` before `T` is known.
 */
type IsAny<T> = [T] extends [never]
	? false
	: [T] extends [{ readonly '~any': 1 }]
		? [T] extends [{ readonly '~any': 2 }]
			? true
			: false
		: false;
