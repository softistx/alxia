/**
 * The parameters a path declares: `:name` segments, and `*`, a trailing
 * wildcard, read as the parameter `*`.
 *
 * ```ts
 * type P = PathParams<'/users/:id/files/*'>; // { id: string; '*': string }
 * ```
 */
export type PathParamName<Path extends string> =
	| NamedParams<Path>
	| WildcardParam<Path>;

type NamedParams<Path extends string> = Path extends `${string}:${infer Rest}`
	? Rest extends `${infer Name}/${infer Tail}`
		? Name | NamedParams<Tail>
		: Rest
	: never;

type WildcardParam<Path extends string> = Path extends `${string}*`
	? '*'
	: never;

export type PathParams<Path extends string> = {
	readonly [Name in PathParamName<Path>]: string;
};

/** A path a route may be declared at: absolute. */
export type RoutePath = `/${string}`;

/** The route `static(path, …)` declares: `path`, then a wildcard. */
export type StaticPath<Path extends string> = Path extends '/'
	? '/*'
	: `${Path}/*`;

/**
 * `Path` when a route may be declared there, else the message the app
 * would throw when it is declared, as `Invalid path: …`. A `string`, or a
 * path with a `${string}` hole, is left to the check the app makes when
 * the route is declared, as is a literal the URL percent-encodes, `/café`.
 *
 * ```ts
 * type A = CheckedPath<'/at/:time'>; // '/at/:time'
 * type B = CheckedPath<'/at/10:30'>;
 * // 'Invalid path: "/at/10:30": ":" may only start a segment, as a parameter'
 * ```
 */
export type CheckedPath<Path extends string> = [PathError<Path>] extends [never]
	? Path
	: PathError<Path>;

/**
 * `Path`, when the route it declares under `Prefix` — `Route`, the path
 * itself unless a method adds to it — may be declared; else why not, as
 * `Invalid path: …`, which `Path` is not assignable to. The joined path is
 * checked, but the message is read from `Route` alone: a message naming
 * `Prefix` would make every comparison of two apps walk the path again.
 */
export type PathAt<
	Prefix extends string,
	Path extends string,
	Route extends string = Path,
> = [PathError<JoinPath<Prefix, Route>>] extends [never]
	? Path
	: NoInfer<
			[PathError<Route>] extends [never]
				? `Invalid path: "${Route}" is refused under its prefix: the two declare one parameter twice, or the prefix holds a refused segment`
				: PathError<Route>
		>;

/** Why no route may be declared at `Path`, as the app throws it, or `never`. */
type PathError<Path extends string> = string extends Path
	? never
	: Path extends `/${infer Rest}`
		? SegmentsError<Path, Rest, never>
		: `Invalid path: The route path "${Path}" must start with "/"`;

/** The first segment of `Rest` refused, in the order the app reads them. */
type SegmentsError<
	Path extends string,
	Rest extends string,
	Seen extends string,
> = Rest extends `${infer Segment}/${infer Tail}`
	? SegmentError<Path, Segment, Seen, false> extends infer Error extends string
		? [Error] extends [never]
			? SegmentsError<Path, Tail, Seen | ParamOf<Segment>>
			: Error
		: never
	: SegmentError<Path, Rest, Seen, true>;

/** The parameter `Segment` declares, if it is readable. */
type ParamOf<Segment extends string> =
	IsPattern<Segment> extends true
		? never
		: Segment extends `:${infer Name}`
			? Name
			: never;

/**
 * Whether `Segment` holds a `${string}` hole, so stands for many segments:
 * a record keyed by a pattern has no required key.
 */
type IsPattern<Segment extends string> =
	Record<never, never> extends Record<Segment, 1> ? true : false;

type SegmentError<
	Path extends string,
	Segment extends string,
	Seen extends string,
	Last extends boolean,
> =
	IsPattern<Segment> extends true
		? never
		: Segment extends '*'
			? Last extends true
				? never
				: `Invalid path: "${Path}": "*" may only end a path`
			: Segment extends `:${infer Name}`
				? IsIdentifier<Name> extends false
					? `Invalid path: "${Path}": ":${Name}" is not a parameter name`
					: Name extends Seen
						? `Invalid path: "${Path}" declares ":${Name}" twice`
						: never
				: Segment extends `${string}:${string}`
					? `Invalid path: "${Path}": ":" may only start a segment, as a parameter`
					: Segment extends `${string}*${string}`
						? `Invalid path: "${Path}": "*" may only be a whole segment, as a wildcard`
						: Lowercase<Segment> extends DotSegment
							? `Invalid path: "${Path}": "${Segment}" is a dot segment, which a request's URL never keeps`
							: never;

/** What a URL reads as `.` or `..`, and drops. */
type DotSegment = '.' | '..' | '%2e' | '.%2e' | '%2e.' | '%2e%2e';

type IdentifierStart = Lowercase<Letter> | Letter | '_' | '$';
type Letter =
	| 'A'
	| 'B'
	| 'C'
	| 'D'
	| 'E'
	| 'F'
	| 'G'
	| 'H'
	| 'I'
	| 'J'
	| 'K'
	| 'L'
	| 'M'
	| 'N'
	| 'O'
	| 'P'
	| 'Q'
	| 'R'
	| 'S'
	| 'T'
	| 'U'
	| 'V'
	| 'W'
	| 'X'
	| 'Y'
	| 'Z';
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** Whether `Name` is a parameter name: `[A-Za-z_$][\w$]*`. */
type IsIdentifier<Name extends string> = string extends Name
	? true
	: Name extends `${infer First}${infer Rest}`
		? First extends IdentifierStart
			? IsIdentifierRest<Rest>
			: false
		: false;

type IsIdentifierRest<Rest extends string> =
	Rest extends `${infer First}${infer Tail}`
		? First extends IdentifierStart | Digit
			? IsIdentifierRest<Tail>
			: false
		: true;

/** `prefix` then `path`, without a doubled or trailing slash. */
export type JoinPath<
	Prefix extends string,
	Path extends string,
> = Prefix extends '' ? Path : Path extends '/' ? Prefix : `${Prefix}${Path}`;
