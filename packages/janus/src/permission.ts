import { type BaseContext, definePlugin, type RequiresOf } from '@alxia/core';
import type {
	CheckableOf,
	ModelConfig,
	ObjectTypeOf,
	Permissions,
	SubjectRef,
} from '@nxgt/janus/permissions';
import type { Awaitable, ObjectData, OptionsArgs } from './permission-options';

/** The body of each refusal. */
export interface PermissionRefusedBody {
	readonly error: 'unauthenticated' | 'not_found' | 'forbidden';
}

type LooseCan = (
	subject: SubjectRef<ModelConfig> | null,
	permission: string,
	object: { readonly type: string; readonly id: string },
	options?: { readonly ctx: unknown },
) => Promise<boolean>;

/**
 * A guard, as a plugin: the routes declared after it run only if the
 * subject holds `permission` on an object of `type`. It loads the object
 * once, checks it with `access.can`, and hands it to them as `object`.
 *
 * | the request | answered |
 * | --- | --- |
 * | anonymous | 401 — before the object is loaded |
 * | `load` answers `null` | 404 |
 * | a denial | 403 |
 * | allowed | the route runs, `object` set |
 *
 * Each refusal is typed on those routes. **A failure throws**: a store that
 * cannot answer is `STORE_FAILED`, never a 403 — `janusErrors()` answers
 * it 503. Scope it with `group`, so it guards only its routes:
 *
 * ```ts
 * app.use(session(accounts)).group('/records/:id', (records) =>
 *   records.use(permission(access, 'view', 'record', byParam('id', findRecord)))
 *     .get('/', ({ object, reply }) => reply(200, object)));
 * ```
 */
export function permission<
	C extends ModelConfig,
	const T extends ObjectTypeOf<C>,
	const P extends CheckableOf<C, T>,
	O extends ObjectData<C, T>,
	LoadCtx extends object = BaseContext,
	SubjectCtx extends object = BaseContext,
	CheckCtx extends object = BaseContext,
>(
	access: Pick<Permissions<C>, 'can'>,
	permission: P,
	type: T,
	load: (ctx: BaseContext & LoadCtx) => Awaitable<O | null>,
	...options: OptionsArgs<C, T, P, O, SubjectCtx, CheckCtx>
) {
	// `use` has checked that the app gives what `load`, `subject` and `ctx` read.
	const loadOf = load as (ctx: BaseContext) => Awaitable<O | null>;
	const { subject, ctx: ctxOf } = (options[0] ?? {}) as {
		readonly subject?: (
			ctx: BaseContext,
		) => Awaitable<SubjectRef<ModelConfig> | null>;
		readonly ctx?: (ctx: BaseContext, object: unknown) => Awaitable<unknown>;
	};
	const can = access.can as LooseCan;
	const refuse = (error: PermissionRefusedBody['error']) => {
		const body: PermissionRefusedBody = { error };
		return body;
	};
	return definePlugin<
		RequiresOf<
			LoadCtx & SubjectCtx & CheckCtx,
			AnnotatedAny<LoadCtx, SubjectCtx>
		>
	>()((app) =>
		app.derive(async (ctx) => {
			const who = subject === undefined ? userOf(ctx) : await subject(ctx);
			if (who === null) return ctx.reply(401, refuse('unauthenticated'));
			const object = await loadOf(ctx);
			if (object === null) return ctx.reply(404, refuse('not_found'));
			const allowed = await can(
				who,
				permission,
				view(object, type),
				ctxOf === undefined ? undefined : { ctx: await ctxOf(ctx, object) },
			);
			if (!allowed) return ctx.reply(403, refuse('forbidden'));
			return { object };
		}),
	);
}

/**
 * The callback to name when `RequiresOf` refuses one annotated `any`: `load`
 * or `subject` when it is that one, `ctx` otherwise. An `any` in any of the
 * three makes their intersection `any`, so `RequiresOf` cannot tell which;
 * a `Record<string, any>` passes the same test.
 */
type AnnotatedAny<LoadCtx, SubjectCtx> = [LoadCtx] extends [
	{ readonly '~any': 1 },
]
	? 'load'
	: [SubjectCtx] extends [{ readonly '~any': 1 }]
		? 'subject'
		: 'ctx';

/**
 * A `load` reading one path parameter, as it arrived: `find(id)`, or `null`
 * — a 404 — when the route has no such parameter.
 */
export function byParam<O>(
	name: string,
	find: (id: string) => Awaitable<O | null>,
): (ctx: BaseContext) => Awaitable<O | null> {
	return (ctx) => {
		const id = ctx.pathParams[name];
		return id === undefined ? null : find(id);
	};
}

/** The object as `can()` reads it: `type` added, every other field read from the object itself. */
function view(
	object: object,
	type: string,
): { readonly type: string; readonly id: string } {
	return new Proxy(object, {
		get: (target, key) => (key === 'type' ? type : Reflect.get(target, key)),
		has: (target, key) => key === 'type' || Reflect.has(target, key),
	}) as { readonly type: string; readonly id: string };
}

/** The `user` `session()` derived — or a wiring error when nothing did. */
function userOf(ctx: BaseContext): SubjectRef<ModelConfig> | null {
	const user = (ctx as { readonly user?: unknown }).user;
	if (user === undefined) {
		throw new TypeError(
			'permission(): no user in the context — use session(auth) before it, or pass { subject }',
		);
	}
	return user as SubjectRef<ModelConfig> | null;
}
