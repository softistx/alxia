import { type AnyToken, ScopeDisposedError } from '@nxgt/di';

/** A Scope as the runtime sees it, its types erased. */
export interface RuntimeScope extends AsyncDisposable {
	resolve(token: AnyToken): Promise<unknown>;
}

/**
 * A request's Scope, created on its first `resolve` and not before: a request
 * that never resolves anything creates no Scope and computes no Slot.
 *
 * `create` runs at most once. When it fails (a Slot function that threw, a
 * Container already disposed), every `resolve` of that request rejects with
 * its error, and there is nothing to dispose of.
 */
export class LazyScope implements RuntimeScope {
	readonly #create: () => Promise<RuntimeScope>;
	#scope: Promise<RuntimeScope> | undefined;
	#disposal: Promise<void> | undefined;

	constructor(create: () => Promise<RuntimeScope>) {
		this.#create = create;
	}

	// Arrow properties, not methods: `const { resolve } = ctx.scope` keeps
	// working, as it does on a Scope of `@nxgt/di`.

	readonly resolve = async (token: AnyToken): Promise<unknown> => {
		// Once disposed, a Scope never created stays uncreated: making one now
		// would leave it with no owner to dispose of it.
		if (this.#disposal && !this.#scope)
			throw new ScopeDisposedError(token.name);
		this.#scope ??= this.#create();
		return (await this.#scope).resolve(token);
	};

	/** Disposes of the Scope if it was created. A second call does nothing. */
	readonly [Symbol.asyncDispose] = (): Promise<void> => {
		this.#disposal ??= this.#dispose();
		return this.#disposal;
	};

	async #dispose(): Promise<void> {
		if (!this.#scope) return;
		const scope = await this.#scope.then(
			(created) => created,
			// Creation failed: its error went to whoever resolved, and there is
			// no Scope to dispose of.
			() => undefined,
		);
		await scope?.[Symbol.asyncDispose]();
	}
}
