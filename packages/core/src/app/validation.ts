/**
 * What a `validate` step does in a route's chain: each part of the request
 * it has a schema for checked, and the request refused when one fails.
 */
import {
	type RequestPart,
	ValidationError,
	type ValidationIssue,
} from '../errors/errors';
import {
	type BodyParser,
	readBody,
	readHeaders,
	readQuery,
} from '../request/read';
import { check, type StandardSchemaV1 } from '../schema/standard-schema';
import type { RouteDefinition, SocketDefinition } from './definition';
import type { BaseContext, RequestContext, ResponseSettings } from './types';
import type { RequestSchemas } from './validate';

type Ctx = Record<string, unknown> & BaseContext;

/** What a step of a route's chain reads of the request it runs. */
export interface ChainRun {
	readonly definition: RouteDefinition | SocketDefinition;
	readonly request: RequestContext;
	readonly rawParams: Record<string, string>;
	readonly set: ResponseSettings;
	readonly parsers: readonly BodyParser[];
	readonly validateResponses: boolean;
	/** The body, read once by the first `validate` that reads it. */
	body?: ReturnType<typeof readBody>;
}

/**
 * The request checked by `schemas`: the context what follows reads, or a
 * `ValidationError` thrown, which the middlewares before it may answer,
 * and the route's `onRefusal` hooks or the default 400 otherwise. Each part is read as it arrived, `cookies`
 * included — those of the route's own context, never the output of an
 * earlier `validate`. A part it has no schema for is left as it is: what
 * a middleware of `use` passed `next` stays, the form of 0.3's validation
 * included.
 */
export async function validateStep(
	run: ChainRun,
	schemas: RequestSchemas,
	ctx: Ctx,
	cookies: unknown,
): Promise<Ctx> {
	const { request } = run;
	const issues: ValidationIssue[] = [];
	let part: RequestPart | undefined;
	const parts = [
		['params', schemas.params, () => run.rawParams],
		['query', schemas.query, () => readQuery(request.url)],
		['headers', schemas.headers, () => readHeaders(request.request.headers)],
	] as const;
	for (const [target, schema, read] of parts) {
		if (schema === undefined) continue;
		const checked = await check(schema, read(), target);
		if (checked.ok) ctx[target] = checked.value;
		else {
			part ??= target;
			issues.push(...checked.issues);
		}
	}
	// The request's cookies stay on `ctx`, where every hook reads them as
	// they arrived — an `onError` or an `onRefusal` included; what follows
	// the validation alone reads the validated ones, on a copy of it.
	let validCookies: { value: unknown } | undefined;
	if (schemas.cookies !== undefined) {
		const checked = await check(schemas.cookies, cookies, 'cookies');
		if (checked.ok) validCookies = { value: checked.value };
		else {
			part ??= 'cookies';
			issues.push(...checked.issues);
		}
	}
	if (schemas.body !== undefined) {
		const failed = await validateBody(run, schemas.body, ctx);
		if (failed !== undefined) {
			part ??= 'body';
			issues.push(...failed);
		}
	}
	if (part === undefined) {
		return validCookies === undefined ? ctx : withCookies(ctx, validCookies);
	}
	throw new ValidationError({ kind: 'validation', part, issues });
}

/** The body read and checked: set on `ctx`, or the issues that refuse it. */
async function validateBody(
	run: ChainRun,
	schema: StandardSchemaV1,
	ctx: Ctx,
): Promise<readonly ValidationIssue[] | undefined> {
	// A second `validate` of the body checks what the first read: the
	// request's stream is read once.
	run.body ??= readBody(ctx.request, run.parsers);
	const body = await run.body;
	if (!body.ok) return [body.issue];
	const checked = await check(schema, body.value, 'body');
	if (!checked.ok) return checked.issues;
	ctx['body'] = checked.value;
	return undefined;
}

/**
 * `ctx`, its cookies the validated ones: what follows the validation reads.
 * A copy, so that the route's own context keeps the request's cookies.
 * When two `validate`s check the cookies, each checks the request's, and a
 * middleware between them keeps the first copy it was given: what it
 * reads is the first validation's.
 */
function withCookies(ctx: Ctx, cookies: { value: unknown }): Ctx {
	const copy: Record<string, unknown> = { ...ctx };
	copy['cookies'] = cookies.value;
	return copy as Ctx;
}
