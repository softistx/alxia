/**
 * The part of [Standard Schema](https://standardschema.dev) v1 that `readInput`
 * calls, declared here so `/errors` names no other package, not even as a
 * type. It is structurally the specification's interface: a Zod 4, Valibot
 * or ArkType schema, or `@alxia/core`'s `StandardSchemaV1`, is accepted as is.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
	readonly '~standard': {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (
			value: unknown,
		) => StandardResult<Output> | Promise<StandardResult<Output>>;
		readonly types?:
			| { readonly input: Input; readonly output: Output }
			| undefined;
	};
}

/** What a schema's validation answers: the value, or the issues. */
export type StandardResult<Output> =
	| { readonly value: Output; readonly issues?: undefined }
	| { readonly issues: readonly StandardIssue[] };

/** One thing a schema refused. */
export interface StandardIssue {
	readonly message: string;
	readonly path?:
		| readonly (PropertyKey | { readonly key: PropertyKey })[]
		| undefined;
}

/** What a schema gives back once the value passed. */
export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
	Schema['~standard']['types']
>['output'];
