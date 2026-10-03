import type { BaseContext, Empty } from '@alxia/core';
import type {
	CheckableOf,
	CtxOf,
	FieldsOf,
	ModelConfig,
	ObjectTypeOf,
	SubjectRef,
} from '@nxgt/janus/permissions';

/**
 * An object of type `T` as the application loads it: its id, every field a
 * `fromField` of its type reads, and whatever else it carries.
 */
export type ObjectData<C extends ModelConfig, T extends ObjectTypeOf<C>> = {
	readonly id: string;
} & { readonly [F in FieldsOf<C, T>]: string | null };

export type Awaitable<V> = V | Promise<V>;

/**
 * What a callback whose parameter is annotated `Ctx` reads beyond
 * `BaseContext`: `{ user: User }` for `BaseContext & { user: User }`, and
 * `Empty` when it reads nothing more. A key of `BaseContext` annotated with
 * a type `BaseContext` does not give — `{ url: string }` — is kept, so `use`
 * refuses it. Kept twice, with `@alxia/language`'s.
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

/**
 * The options of `permission()`: `ctx` required exactly when a condition of
 * the permission is reachable, as for `can()`. `@nxgt/janus-hono`'s, over
 * alxia's context, kept twice on purpose — except that `SubjectCtx` and
 * `CheckCtx`, what `subject` and `ctx` read beyond `BaseContext`, are
 * inferred from their annotated parameters, which the Hono ones are not.
 */
export type PermissionOptions<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
	SubjectCtx extends object = BaseContext,
	CheckCtx extends object = BaseContext,
> = {
	/**
	 * Who asks. The `user` `session()` derived when absent. `null` is
	 * anonymous. Annotate its parameter to read what an earlier plugin adds.
	 */
	readonly subject?: (
		ctx: BaseContext & SubjectCtx,
	) => Awaitable<SubjectRef<C> | null>;
} & ([CtxOf<C, T, P>] extends [never]
	? { readonly ctx?: never }
	: {
			/**
			 * The condition's context, read from the request and the loaded
			 * object. Annotate its parameter to read what an earlier plugin adds.
			 */
			readonly ctx: (
				ctx: BaseContext & CheckCtx,
				object: O,
			) => Awaitable<CtxOf<C, T, P>>;
		});

export type OptionsArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
	SubjectCtx extends object = BaseContext,
	CheckCtx extends object = BaseContext,
> = [ObjectTypeOf<C>] extends [T]
	? IsSingle<ObjectTypeOf<C>> extends true
		? PermissionArgs<C, T, P, O, SubjectCtx, CheckCtx>
		: [options?: LooseOptions<SubjectCtx, CheckCtx>]
	: PermissionArgs<C, T, P, O, SubjectCtx, CheckCtx>;

type PermissionArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
	SubjectCtx extends object,
	CheckCtx extends object,
> = [CheckableOf<C, T>] extends [P]
	? IsSingle<CheckableOf<C, T>> extends true
		? StrictArgs<C, T, P, O, SubjectCtx, CheckCtx>
		: [options?: LooseOptions<SubjectCtx, CheckCtx>]
	: StrictArgs<C, T, P, O, SubjectCtx, CheckCtx>;

type StrictArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
	SubjectCtx extends object,
	CheckCtx extends object,
> = [CtxOf<C, T, P>] extends [never]
	? [options?: PermissionOptions<C, T, P, O, SubjectCtx, CheckCtx>]
	: [options: PermissionOptions<C, T, P, O, SubjectCtx, CheckCtx>];

type LooseOptions<SubjectCtx extends object, CheckCtx extends object> = {
	readonly subject?: (ctx: BaseContext & SubjectCtx) => unknown;
	readonly ctx?: (ctx: BaseContext & CheckCtx, object: never) => unknown;
};

type UnionToIntersection<U> = (
	U extends unknown
		? (union: U) => void
		: never
) extends (intersection: infer I) => void
	? I
	: never;

type IsSingle<U> = [U] extends [UnionToIntersection<U>] ? true : false;
