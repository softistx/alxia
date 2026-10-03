/** What a plugin made by `definePlugin` needs from the app that uses it. */
import type { BaseContext } from './context';

/** Carries a plugin's requirement to `use`, which checks it against the app's context. */
export interface Requiring<Requires> {
	/** Never set: what the plugin reads from the context of the app that uses it. */
	readonly '~requires': Requires;
}

/**
 * `unknown` when the context `Ctx` gives what `Requires` reads; otherwise a
 * `'~requires'` whose type is the message, naming each key at fault.
 */
export type ProvidedBy<Ctx, Requires> = BaseContext & Ctx extends Requires
	? unknown
	: { readonly '~requires': Unprovided<BaseContext & Ctx, Requires> };

/** One message per key of `Requires` the context gives not at all, or with another type. */
type Unprovided<Given, Requires> = {
	[Key in keyof Requires]: Key extends keyof Given
		? Given[Key] extends Requires[Key]
			? never
			: `the plugin reads "${Key & string}", which this app's context gives with another type`
		: `the plugin reads "${Key & string}", which this app's context does not give: use the plugin that adds it first`;
}[keyof Requires];
