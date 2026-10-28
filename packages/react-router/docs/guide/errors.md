# An API's refusals, worded for the page

This page covers how an app that calls a GraphQL API words that API's refusals
for its pages: the error's shape, the request id it carries, the page a
request is for, the catalogue store of the API's messages, the form checks in
the API's words, the provider that fills the catalogue, the wording of a
refusal, the loaders, the error page and the actions that answer with it, the JSON those actions read and the fetcher hook that posts it, calling the API from a loader, and keeping the API's catalogue fresh.
The code is in `@alxia/react-router/errors`, which has no UI. Its one runtime
import is `react-router`, never `@alxia/core`, so a page can import it
(`boundary.spec.ts` checks the built files).

- [What the subpath holds](#what-the-subpath-holds)
- [Recognising an API error](#recognising-an-api-error)
- [The request id](#the-request-id)
- [The page a request is for](#the-page-a-request-is-for)
- [The catalogue store](#the-catalogue-store)
- [Form checks in the API's words](#form-checks-in-the-apis-words)
- [Wording a refusal](#wording-a-refusal)
- [Loaders and the error page](#loaders-and-the-error-page)
- [Actions](#actions)
- [JSON actions and CSRF](#json-actions-and-csrf)
- [Calling the API from a loader](#calling-the-api-from-a-loader)
- [Keeping the catalogue fresh](#keeping-the-catalogue-fresh)

## What the subpath holds

| export | what it is |
| --- | --- |
| `ApiErrorLike`, `isApiErrorLike(error)` | the shape of `@nxgt/graphql-client`'s `ApiError`, and the test for it |
| `ApiErrorEntryLike`, `ApiErrorExtensionsLike`, `ApiErrorParamsLike`, `ApiFieldErrorLike` | one error of the response, its `extensions`, their `params`, and one refused field |
| `waitMinutes(extensions)` | the minutes of a throttle's wait: `minutes` (at least one), else `retryAfter` rounded up to minutes |
| `retryAfterOf(error)` | the seconds a 429 asks to wait, for a countdown on your own forms: `retryAfter` of the first error's `params`, else of its `extensions`, rounded up and held at a day; `undefined` when none is usable |
| `attemptsLeftOf(error)` | the tries a refused code leaves, as `@nxgt/janus` counts them: `extensions.attemptsLeft` of the first error, else `params.attemptsLeft`; `undefined` when it is not a whole number from 0 up |
| `REQUEST_ID_HEADER`, `requestIdOf(response)` | the header an API echoes on every response, and its value |
| `nextOf(url)` | the page a request is for, as `next` carries it back after sign-in |
| `FormErrors` | what a form action answers when the API refused the input |
| `routeError(error, options?)`, `errorRequestId(error)`, `RouteErrorData`, `RouteErrorOptions` | what a loader throws for the API's error, and the support reference its error page reads |
| `createApiMessages`, `ApiMessages`, `ApiMessagesOptions`, `CatalogueMessage(s)`, `ParamKind`, `MessageFormat`, `MessageValues` | the catalogue of the API's messages, held by the app |
| `apiCodeResolver`, `ApiCodeResolver`, `ApiCodeResolverOptions`, `CodeIssueLike` | the words of a form's checks, from that catalogue; `CodeIssueLike` is the issue a custom `codeOf` receives |
| `ApiMessagesProvider`, `ApiMessagesProviderProps` | fills the catalogue in the browser from the root's data |
| `createApiErrors`, `ApiErrors`, `ApiErrorsOptions` | what a page says of a refusal, from that catalogue: the message, the fields, the status |
| `ApiRefusal` | a refused call as a page says it: `{ message, status }` |
| `jsonActions({ origin? })`, `JsonActions`, `JsonActionsOptions` | `readJson`, `requireJsonPost` and `readInput` for the actions: JSON only, from this site only |
| `useJsonFetcher(key?, action?)`, `JsonBody` | a fetcher that posts JSON: `{ fetcher, post(body, to?), busy }` |
| `apiCallFailure(error, options)`, `CallFailureOptions`, `operationName(document)`, `DocumentLike` | what a failed call to the API becomes for a loader to throw, logged with the request id, and the operation's name for the log |
| `createErrorCatalogue`, `ErrorCatalogue`, `ErrorCatalogueOptions`, `CatalogueReply` | reads the API's catalogue into the store and keeps it fresh: `fresh`, `freshAll`, `warm`, `clientMessages`; `reset`, `settled`, `heldVersion` and the `now` parameters are for tests |
| `StandardSchemaV1` | the Standard Schema v1 type `readInput` takes, declared here (type only; `readInput`'s output is inferred from the schema's `~standard.types`) |

## Recognising an API error

The subpath does not depend on `@nxgt/graphql-client`. `isApiErrorLike` tests
an `Error` named `ApiError` that has an `errors` array, like the client's
`isApiError`, plus a numeric `status`, which `ApiErrorLike` promises. It holds
when two copies of the client are installed.

```ts
import { isApiErrorLike } from '@alxia/react-router/errors';

export function codeOf(error: unknown) {
	return isApiErrorLike(error) ? error.code : undefined;
}
```

An `ApiError` is assignable to `ApiErrorLike` as it is. The shape's code is
the API's own `<module>.errors.<slug>`, such as `todos.errors.title-taken`
or `userProfiles.errors.slug-taken` (the module is kebab-case or camelCase).

`waitMinutes` reads a throttle's wait the way the API words it: the
`minutes` of `extensions.params` or beside it, at least one, else the
`retryAfter` seconds rounded up.

```ts
import { waitMinutes } from '@alxia/react-router/errors';

waitMinutes({ retryAfter: 90 }); // 2
waitMinutes({ params: { minutes: 4 } }); // 4
```

### The seconds a 429 asks to wait

`retryAfterOf(error)` reads the wait of a rate-limited call in seconds, from
`retryAfter` in the first error's `extensions.params`, else in its
`extensions`. Only a finite number from 0 or a decimal string counts; it is
rounded up and held at a day (86 400). It answers `undefined` when the API sent
no usable value, so a form can fall back to `waitMinutes` or to no countdown.
`/session`'s flows return the same value as `retryAfter` on a `throttled`
answer; use `retryAfterOf` on your own actions (sign-up, set password, any
rate-limited mutation).

```ts
import { data } from 'react-router';
import { isApiErrorLike, retryAfterOf } from '@alxia/react-router/errors';

export async function action({ request }: { request: Request }) {
  try {
    await signUp(await request.json());
  } catch (error) {
    if (isApiErrorLike(error) && error.status === 429) {
      return data({ retryAfter: retryAfterOf(error) }, { status: 429 });
    }
    throw error;
  }
}
```

### The tries a code leaves

A wrong second-factor or step-up code is refused with `@nxgt/janus`'s
`CODE_INVALID` and the tries left in `extensions.attemptsLeft`.
`attemptsLeftOf(error)` reads that count from the first error, else from its
`params`, and answers `undefined` for anything that is not a whole number from
0 up (a string, a negative number, a missing key). `0` is a count: no try is
left.

```ts
import { attemptsLeftOf } from '@alxia/react-router/errors';

attemptsLeftOf(error); // 3 after a wrong code, 0 on the last, undefined if uncounted
```

[`signInFlow`'s `codeRefusal`](session.md#the-second-factor) words it for a
sign-in's code page.

## The request id

An API that echoes `x-request-id` lets a page tell the user which request
failed, and the API's log find it.

```ts
import { requestIdOf } from '@alxia/react-router/errors';

export function idOf(response: Response) {
	return requestIdOf(response); // undefined when the API sent none
}
```

## The page a request is for

On a client navigation, `request.url` is `/todos/list.data?q=a&_routes=…`
(`/_.data` for `/`), React Router's single-fetch details. `nextOf` returns the
page itself, for the `next` a sign-in carries back. It never starts with two
slashes (`//evil.com` and `/\evil.com` both read as another site to a
redirect), but it is not a validation: an app must still check `next` before
redirecting to it after sign-in.


```ts
import { nextOf } from '@alxia/react-router/errors';

nextOf('https://app.test/todos/list.data?q=a&_routes=root'); // '/todos/list?q=a'
```

## The catalogue store

An API that words its refusals by code (`todos.errors.title-taken`) can list
its messages: the uninterpolated ICU text, and the kind of each argument.
`createApiMessages` holds them for the languages the app speaks. It is an
instance, not module state, so a spec makes its own and two copies of the
package never split it. Make one in a module of its own:

```ts
// app/api-messages.ts
import { formatMessage } from '@nxgt/material/i18n';
import { createApiMessages } from '@alxia/react-router/errors';

export const apiMessages = createApiMessages<'en' | 'fr'>({
	format: formatMessage,
});
```

`format` is the app's ICU formatter, the engine of its own translator, so the
API's messages and the app's read alike. It is called as
`format(message, language, values, { onError })` and reports a message it
could not format to `onError`; material's `formatMessage` fits as it is.

```ts
apiMessages.set('en', {
	'todos.errors.items-outside-list': {
		message: '{count, plural, one {One item is} other {# items are}} outside {name}.',
		params: [
			{ name: 'count', kind: 'PLURAL' },
			{ name: 'name', kind: 'TEXT' },
		],
	},
});

apiMessages.apiMessage('todos.errors.items-outside-list', { count: '3', name: 'Home' }, 'en');
// '3 items are outside Home.'
```

The `kind` of an argument says what to supply without parsing the message: a
`DATE` given as `YYYY-MM-DD` becomes a local `Date` (by calendar parts, so
the day is the same in every time zone), and a `NUMBER` or `PLURAL` given as a
numeric string a number. `apiMessage` returns `undefined` for a code the store
lacks or a message that cannot be formatted with those values (a missing
argument, a day it cannot read), so the caller falls back to the message the
API already worded.

`set(language, messages)` replaces a language, which is what a server does
with the whole catalogue. `add` merges, which is what the browser does with
the few messages its forms word. `clear` forgets everything, for specs.

In the browser, `ApiMessagesProvider` adds the messages the root's data
carries (`value` is the root loader's data, `messages` the store to fill) before the children render, since the resolver reads them
synchronously. It is a plain function with no JSX, and it imports React for its
types only:

```tsx
// app/root.tsx
import { ApiMessagesProvider } from '@alxia/react-router/errors';
import { apiMessages } from './api-messages';

export default function App({ loaderData }: Route.ComponentProps) {
	return (
		<ApiMessagesProvider messages={apiMessages} value={loaderData.apiMessages}>
			<Outlet />
		</ApiMessagesProvider>
	);
}
```

It writes in the browser only. A server render leaves the store as it is,
because the server holds the whole, fresher catalogue and a render's data may
be older than it.

## Form checks in the API's words

A form validates before it posts, and a check that mirrors the API's rule
should read as the API words it. A refinement carries the API's code in
`params.code`, and `apiCodeResolver` turns that into the catalogue's text:

```ts
// app/code-resolver.ts
import { apiCodeResolver } from '@alxia/react-router/errors';
import { apiMessages } from './api-messages';
import { getLanguage, translate } from './i18n';

export const CODE_RESOLVER = apiCodeResolver(apiMessages, {
	translate,
	language: getLanguage,
});
```

```tsx
import { useCodeResolver } from '@nxgt/material/components';

const schema = z.object({ title: z.string() }).refine(isFree, {
	path: ['title'],
	params: { code: 'todos.errors.title-taken' },
});

const resolver = useCodeResolver(schema, CODE_RESOLVER);
```

The result is `{ translate, codeOf }`, assignable to material's
`CodeResolverOptions`. An API code (`<module>.errors.<slug>`) takes the
catalogue's message in the page's language; any other key takes the app's
`translate`; a code the catalogue lacks comes back as it is, so the form
library words the issue with its own locale and never shows the code. Make
it once, at module scope: a new function re-creates the resolver.

Two options adapt it. `codeOf(issue)` says which code an issue carries (the
refinement's `params.code` by default); an app that also words an empty field
as the API's `validation.errors.required` passes its own. `isApiCode(key)`
says which keys are API codes (`<module>.errors.<slug>` by default, the
module in kebab-case or camelCase).

```ts
import { apiCodeResolver } from '@alxia/react-router/errors';
import { apiMessages } from './api-messages';
import { getLanguage, translate } from './i18n';

export const CODE_RESOLVER = apiCodeResolver(apiMessages, {
	translate,
	language: getLanguage,
	// An empty string field is the API's "required" refusal.
	codeOf: (issue) =>
		issue.code === 'too_small' && issue.origin === 'string'
			? 'validation.errors.required'
			: (issue.params?.code as string | undefined),
	// Only the API's own modules are worded by the catalogue.
	isApiCode: (key) => /^(todos|validation)\.errors\./.test(key),
});
```

The codes a browser can word are the ones the root's data brought, so the
app lists the few its forms use. A code missing from that list shows its
fallback ([troubleshooting](../troubleshooting.md#a-forms-own-check-shows-the-code-todoserrors-instead-of-words)).

## Wording a refusal

An action or a loader that calls the API meets a refusal as an `ApiError`.
`createApiErrors` says it in the page's language, from the catalogue the app
keeps. Make one beside the catalogue:

```ts
// app/api-errors.ts
import { createApiErrors } from '@alxia/react-router/errors';
import { apiMessages } from './api-messages';
import { translate } from './i18n';

export const apiErrors = createApiErrors<'en' | 'fr'>({
	messages: apiMessages,
	// The app's own word for an API it cannot reach: never an API code.
	unavailable: (language) => translate('app.error.unavailable', language),
});
```

- `apiErrorMessage(error, language)` is the catalogue's text of the error's
  code with its `params` filled in (`extensions.params` over the extensions
  themselves), else the message the API already worded.
- `fieldErrors(error, language)` is the message of each refused field by
  input path, from `extensions.fields`; a refusal that names one field
  (`extensions.field`) gives it the error's message. It is a `FormErrors`'
  `fieldErrors`.
- `apiRefusal(error, language)` is what a failed call says to the user, as
  `{ message, status }` (an `ApiRefusal`): the refusal's message with its
  status, or `unavailable` with 503 for a 503 `Response` (an API that could
  not be reached). It is `undefined` for anything else, which the caller
  rethrows.
- `translateCode(code, fallback, language, values?)` words one code; use it
  for a code the app words itself, such as a mail throttle's
  `notes.errors.too-many-attempts` with `{ minutes: waitMinutes(extensions) }`.

```ts
import { data } from 'react-router';
import { apiErrors } from './api-errors';
import type { Route } from './+types/todos';

// Your own call to the API, declared here as a stub.
declare function createTodo(input: unknown): Promise<void>;

export async function action({ request }: Route.ActionArgs) {
	try {
		await createTodo(await request.json());
		return { ok: true };
	} catch (error) {
		const refusal = apiErrors.apiRefusal(error, 'en');
		if (!refusal) throw error;
		return data(
			{ formError: refusal.message },
			{ status: refusal.status },
		);
	}
}
```

Two options are for an API that is stricter than the default. An error with
no API code (a raw `BAD_USER_INPUT`, from a constraint that failed before the
API's validation layer) says the API's own message unless the app gives
`refused`, its generic refusal, which then replaces it; the raw message is
never shown. `byCode` words given codes in the app's own way, for refusals
whose params differ and name no field, such as a query's depth or cost:

```ts
export const apiErrors = createApiErrors<'en' | 'fr'>({
	messages: apiMessages,
	unavailable: (language) => translate('app.error.unavailable', language),
	refused: (language) => translate('app.error.refused', language),
	byCode: {
		'validation.errors.query-too-deep': (_error, language) =>
			translate('app.error.too-heavy', language),
		'validation.errors.query-too-wide': (_error, language) =>
			translate('app.error.too-heavy', language),
	},
});
```

The order is exact. `refused` applies only when the error has no API code,
or a code that `isApiCode` rejects; it outranks `byCode`. Then comes the
catalogue, then the API's own message. `fieldErrors` uses the same order for
a single `extensions.field`, while the entries of `extensions.fields` go
straight to the catalogue.

`reword` words a whole family of codes once, after the text is worded, so
there is no list of codes to keep in step with the catalogue. It receives the
final text, the error, and `{ code, values, language }`: `values` are the
merged values the catalogue formats with (`extensions` and
`extensions.params`, the params winning). Return the text to show, or
`undefined` to keep it:

```ts
export const apiErrors = createApiErrors<'en' | 'fr'>({
	messages: apiMessages,
	unavailable: (language) => translate('app.error.unavailable', language),
	reword: (text, error, { code }) =>
		code.endsWith('.errors.referenced')
			? `${text} ${stillLinkedTo(error)}`
			: undefined,
});
```

`reword` sees the text `apiErrorMessage` returns for an error with a code,
whichever produced it: the catalogue, the API's own message, or `byCode`; so
`apiRefusal`, `fetcherResult`, `fetcherRefusal`, `submitForm` and a single
`extensions.field` are reworded too. It does not see `refused`'s text (an
error with no API code), `unavailable`'s (a network failure, which is no API
code), `translateCode`'s, nor the entries of `extensions.fields`, which go
straight to the catalogue.

`isApiCode` changes what counts as an API code (`<module>.errors.<slug>` by
default, the module in kebab-case or camelCase). Here only the codes of the
`todos` module are the catalogue's; any other code, even one shaped like a
catalogue code, says `refused`:

```ts
export const apiErrors = createApiErrors<'en' | 'fr'>({
	messages: apiMessages,
	unavailable: (language) => translate('app.error.unavailable', language),
	refused: (language) => translate('app.error.refused', language),
	isApiCode: (code) => code.startsWith('todos.errors.'),
});
```

`fieldErrors` gives a form its messages by input path:

```ts
import { data } from 'react-router';
import { isApiErrorLike } from '@alxia/react-router/errors';
import { apiErrors } from './api-errors';
import type { Route } from './+types/todos';

declare function createTodo(input: unknown): Promise<void>;

export async function action({ request }: Route.ActionArgs) {
	try {
		await createTodo(await request.json());
		return { ok: true };
	} catch (error) {
		const refusal = apiErrors.apiRefusal(error, 'en');
		if (!refusal || !isApiErrorLike(error)) throw error;
		return data(
			{ fieldErrors: apiErrors.fieldErrors(error, 'en') },
			{ status: refusal.status },
		);
	}
}
```

## Loaders and the error page

A loader that calls the API lets a refusal reach the error page. Throw
`routeError(error)`: an `ApiError` whose status is 401, 403, 404 or 503
becomes a route error response of that status, carrying the API's `code` and
`message` and the call's `requestId`; any other `ApiError` with a request id
becomes a 500 that carries only the id; anything else is returned as it is,
so `throw` it too.

```ts
import { routeError } from '@alxia/react-router/errors';
import type { Route } from './+types/todo';

// Your own call to the API, declared here as a stub.
declare function readTodo(id: string): Promise<{ title: string }>;

export async function loader({ params }: Route.LoaderArgs) {
	try {
		return await readTodo(params.id);
	} catch (error) {
		throw routeError(error);
	}
}
```

The root's `ErrorBoundary` words the error and shows the support reference
the user can quote, `errorRequestId(error)` (`undefined` for an error that
carries none):

```tsx
import { errorRequestId } from '@alxia/react-router/errors';
import { isRouteErrorResponse, useRouteError } from 'react-router';

export function ErrorBoundary() {
	const error = useRouteError();
	const requestId = errorRequestId(error);
	return (
		<main>
			<h1>{isRouteErrorResponse(error) ? error.status : 'Oops'}</h1>
			{requestId ? <p>Reference: {requestId}</p> : null}
		</main>
	);
}
```

A thrown `Response` of one of those statuses with an `x-request-id` header
becomes a route error too (a bare `Response` hands the browser its body
only). `routeError(error, { statuses })` changes the routed statuses (a
`ReadonlySet<number>`). The id is read from `x-request-id` (`REQUEST_ID_HEADER`,
through `requestIdOf`), the one header name the subpath knows.

An `ApiError` has a `requestId` only if the code that called the API set it
(read `requestIdOf(response)` and keep it on the error); see
[the error page shows no request id](../troubleshooting.md#the-error-page-shows-no-request-id).

## Actions

An action that calls the API answers a refusal as data, so the page stays
where it was. `apiErrors` (from [wording a refusal](#wording-a-refusal)) has
two helpers; each throws, through `routeError`, what the page cannot word (a
401, which the session code redirects first, or any failure that is not an
API refusal), for the error page.

`fetcherResult(language, about, run)` is for a fetcher's action: `{ ok: true }`
with `about` and the value `run` resolved, or `{ ok: false, error }` with
`about` and the worded message, answered with the refusal's HTTP status. An
unreachable API (a 503 `Response`) is worded too.

```ts
import { apiErrors } from './api-errors';
import type { Route } from './+types/todos';

// Your own call to the API, declared here as a stub.
declare function renameTodo(input: unknown): Promise<{ title: string }>;

export async function action({ request }: Route.ActionArgs) {
	const input = await request.json();
	return apiErrors.fetcherResult('en', { intent: 'rename' }, () =>
		renameTodo(input),
	);
}
```

`submitForm(language, run, fieldOf)` is for a form: `{ ok: true, value }`, or
the form's `FormErrors` with the refusal's status. `fieldOf` names the form
field of an input path (`undefined` when the form does not show it): a
placed field's message goes under that field (`fieldErrors`), and any other
message, with the API's own for the code, joins the `formError`. A 404 that
names none of the form's fields (the record itself is gone) goes to the error
page.

```ts
import { apiErrors } from './api-errors';
import type { Route } from './+types/todos';

// Your own call to the API, declared here as a stub.
declare function createTodo(input: unknown): Promise<{ id: string }>;

export async function action({ request }: Route.ActionArgs) {
	const input = await request.json();
	return apiErrors.submitForm(
		'en',
		() => createTodo(input),
		(path) => (path === 'todo.title' ? 'title' : undefined),
	);
}
```

`fetcherRefusal(error, language)` is the refusal both build on, for an action
of your own: it returns `apiRefusal`'s `{ message, status }`, or throws what
the page cannot word.

```ts
import { apiErrors } from './api-errors';
import type { Route } from './+types/todos';

// Your own call to the API, declared here as a stub.
declare function archiveTodo(id: string): Promise<{ archivedAt: string }>;

export async function action({ request }: Route.ActionArgs) {
	const { id } = await request.json();
	try {
		return { ok: true as const, ...(await archiveTodo(id)) };
	} catch (error) {
		// The API's refusal: { message, status }. A 401 or any other failure throws.
		const { message, status } = apiErrors.fetcherRefusal(error, 'en');
		return Response.json({ ok: false, error: message }, { status });
	}
}
```

The helpers route with `routeError`'s defaults (401, 403, 404 and 503). Each
takes an optional last argument, `route?: RouteErrorOptions`, passed to
`routeError` for what it throws: `apiErrors.fetcherRefusal(error, 'en', {
statuses })`, `fetcherResult(language, about, run, { statuses })` and
`submitForm(language, run, fieldOf, { statuses })`.

## JSON actions and CSRF

Every action of the examples above reads JSON. That is a choice: a page of
another site can post a form, or `text/plain`, to your URL without a
preflight, and the browser sends the user's cookies with it. Taking
`application/json` alone, and only from this site, stops that before the
session cookie's `SameSite` is even consulted. `jsonActions` holds the three
helpers that do it.

```ts
// app/json.ts
import { jsonActions } from '@alxia/react-router/errors';

export const { readJson, requireJsonPost, readInput } = jsonActions();
```

`readJson(request)` answers the parsed body, or throws a response: 403
`Cross-site request refused` when the `Origin` is not this site's, or the
`Sec-Fetch-Site` is neither `same-origin` nor `none`; 415 `Expected a JSON body`
when the content type is not `application/json`; 400 `Malformed JSON body`
when the body does not parse.

```ts
import { readJson } from './json';
import type { Route } from './+types/todos';

export async function action({ request }: Route.ActionArgs) {
	const body = (await readJson(request)) as { title?: string };
	// …
}
```

The body is limited only by the server's `maxRequestBodySize` (Bun's default
is 128 MB), so an app should set it to what its largest form needs.

`readInput(request, schema)` reads the body's `input` and checks it against
a [Standard Schema](https://standardschema.dev) (Zod 4, Valibot, ArkType,
or one of your own), awaiting the check when it is async. It answers the
schema's output, typed, or throws a 400 `The form sent an input the API would
refuse`. It checks the origin the same way, since it reads through `readJson`.

```ts
import { z } from 'zod';
import { apiErrors } from './api-errors';
import { readInput } from './json';
import type { Route } from './+types/todos';

const createTodo = z.object({ title: z.string().min(1) });

// Your own call to the API, declared here as a stub.
declare function create(input: { title: string }): Promise<{ id: string }>;

export async function action({ request }: Route.ActionArgs) {
	const input = await readInput(request, createTodo);
	return apiErrors.submitForm(
		'en',
		() => create(input),
		(path) => (path === 'title' ? 'title' : undefined),
	);
}
```

The Standard Schema types are declared in `/errors` itself (a few lines,
the specification's own interface), so the subpath never imports
`@alxia/core`, not even a type. `@alxia/core`'s `StandardSchemaV1`, and every
vendor's schema, fit them as they are.

`requireJsonPost(request)` is for an action that a native form also posts to:
before the page hydrates, a click posts the form natively, and `readJson`
would answer 415. `requireJsonPost` sends that post back to its page, its
search kept (`nextOf`), which then posts JSON once hydrated.

```ts
export async function action({ request }: Route.ActionArgs) {
	requireJsonPost(request);
	const body = await readJson(request);
	// …
}
```

### The origin behind a proxy

A request is "this site" when its `Origin` is the origin of `request.url`.
Behind a proxy that terminates TLS that origin is the internal one, so give
`jsonActions` the public one. A getter is read at each request, and when it
answers `undefined` the request's own origin is used:

```ts
export const { readJson, requireJsonPost, readInput } = jsonActions({
	origin: () => process.env.APP_ORIGIN,
});
```

Without it, every post is refused: see
[Behind a TLS proxy every action answers 403](../troubleshooting.md#behind-a-tls-proxy-every-action-answers-403).

### Posting from the page

`useJsonFetcher<Action, Body>(key?, action?)` is a React Router fetcher that
posts its body as JSON to the page's action (or to the `action` it is given):
`post(body, to?)` sends it, `busy` is true while it is in flight, and
`fetcher` is the fetcher, whose `data` is what the action answered. `key`
shares the fetcher between the component that posts and the one that reads
the answer. `post`'s second argument is the action of one call, for a list
whose rows each post to their own record.

```tsx
import { useJsonFetcher } from '@alxia/react-router/errors';
import type { action } from './todos';

export function RenameTodo({ id }: { id: string }) {
	const { fetcher, post, busy } = useJsonFetcher<typeof action>();
	return (
		<>
			<button
				type="button"
				disabled={busy}
				onClick={() => post({ input: { title: 'Done' } }, `/todos/${id}`)}
			>
				Rename
			</button>
			{fetcher.data && !fetcher.data.ok ? <p>{fetcher.data.error}</p> : null}
		</>
	);
}
```

The action answers `{ ok, error }`, the shape of `fetcherResult` and `submitForm`, so `fetcher.data` is read as above.

`Body` types what `post` takes: `useJsonFetcher<typeof action, { input: { title: string } }>()`.
The hook imports `react-router` alone, so a page can import it from `/errors`.

## Calling the API from a loader

The subpath does not send the call: the headers, the caller and the API's
address are the app's. It holds what happens once a call failed.
`apiCallFailure(error, options)` returns what the loader or action should
throw, and logs it:

| the call failed with | `apiCallFailure` returns | log |
| --- | --- | --- |
| an `ApiError` (the API refused) | the same error, with `requestId` set when you pass one | a warning for a 4xx, an error for a 5xx, with the status and the API's code |
| an `ApiStatusError` of 401, 403 or 404 (no GraphQL body) | a `Response` of that status and reason phrase, with an `x-request-id` header | a warning |
| an `ApiStatusError` of another status | a 503 `Response` with no body | an error |
| an `ApiUnavailableError` (`unreachable`, `timeout`, `invalid-response`) | a 503 `Response` with no body | an error with the reason |
| anything else, once `signal` is aborted | a 503 `Response` with no body | an error: `aborted` |
| anything else | the same error | none |

It recognises the client's errors by their `name`, never with `instanceof`, so
it imports nothing from `@nxgt/graphql-client` and holds across two copies of
it. Pass `requestId` from the response (`requestIdOf(response)`), and the id
rides on the `ApiError` and on the `Response`, where `routeError` reads it.
`passedThrough` replaces the statuses that keep their own (401, 403 and 404),
and `log` replaces `console`. A `passedThrough` status that cannot carry a
body (204 and the like) is answered with an empty body. The log lines start
with the `api` name you pass (`<api>: <operation> …`), not
`alxia-react-router:`, because they describe your app's call, not a package
diagnostic. Nothing logged holds a header, a variable or a token. A `log` that
throws never replaces the outcome: the error or `Response` is returned as if
the line had been written.

An app writes one `execute` that sends the call and ends in `apiCallFailure`.
The example uses `@nxgt/graphql-client`; `operationName` reads a document
structurally, so `graphql` is not imported by the subpath.

```ts
import { createGraphQLClient } from '@nxgt/graphql-client';
import {
	apiCallFailure,
	operationName,
	requestIdOf,
	routeError,
} from '@alxia/react-router/errors';
import type { DocumentNode } from 'graphql';

const url = 'https://api.example.com/graphql';

export async function execute(
	document: DocumentNode,
	variables: Record<string, unknown>,
	caller: { language: string; token?: string; signal?: AbortSignal },
) {
	let requestId: string | undefined;
	const client = createGraphQLClient({
		url,
		dedupe: false,
		fetch: async (request: Request) => {
			const response = await fetch(request);
			requestId = requestIdOf(response); // the client hands none back
			return response;
		},
	});
	try {
		return await client.execute(document as never, variables as never, {
			signal: caller.signal,
			headers: { 'accept-language': caller.language },
			timeout: 10_000,
		});
	} catch (error) {
		throw apiCallFailure(error, {
			api: `my-api ${url}`,
			operation: operationName(document),
			requestId,
			signal: caller.signal,
		});
	}
}

// A loader: throw routeError(error) for what execute() threw.
export async function loader() {
	try {
		return await execute(todosQuery, {}, { language: 'en' });
	} catch (error) {
		throw routeError(error);
	}
}

declare const todosQuery: DocumentNode;
```

Each log line is in the troubleshooting page:
[answered 403](../troubleshooting.md#api-operation-request-id-answered-status-code),
[answered 502 without GraphQL](../troubleshooting.md#api-operation-request-id-answered-status-without-graphql),
[unreachable, timeout, invalid-response](../troubleshooting.md#api-operation-request-id-unreachable-timeout-or-invalid-response)
and [aborted](../troubleshooting.md#api-operation-request-id-aborted).

## Keeping the catalogue fresh

The store of [the catalogue](#the-catalogue-store) is empty until something
fills it. On the server, `createErrorCatalogue` does: it reads each
language's messages from the API on first use, serves them from memory, and
checks the API's versions once per TTL, re-reading only the languages whose
version moved. It is an instance, made once in a module of the app's own, and
it imports nothing: the app's two calls to its API are options.

```ts
// app/catalogue.server.ts
import { createErrorCatalogue } from '@alxia/react-router/errors';
import { apiMessages } from './api-messages';
import { api } from './api.server';

export const catalogue = createErrorCatalogue<'en' | 'fr'>({
	messages: apiMessages,
	languages: ['en', 'fr'],
	// { version, messages: [{ code, message, params }] }
	read: (language) => api.errorCatalogue(language),
	// { en: 'v7', fr: 'v7' }: one call for every language
	versions: () => api.errorCatalogueVersions(),
	ttlMs: () => Number(process.env.CATALOGUE_TTL_MS ?? 60_000),
	// The codes the browser words itself, such as a form's checks.
	clientCodes: ['validation.errors.required', 'todos.errors.title-taken'],
});
```

`ttlMs` has no default and must be given: a number, or a getter read at each
check, so a value set at startup or changed by a test is found. A getter that
throws, or a value that is not a finite number of at least 0, is logged and
`retryMs` is used in its place (see
[`ttlMs is not a duration`](../troubleshooting.md#alxia-react-router-ttlms-is-not-a-duration-using-retryms)). `retryMs` (5000 by default) is how soon a
failed read or check is tried again, and `firstReadWaitMs` (1500 by default)
is how long a request waits for a language's first read. `log` receives the
failures (`console` by default); its lines start with `alxia-react-router:`.
`languages` may not be empty: it throws a `TypeError` otherwise.

### Awaiting it in the root's middleware

`freshAll()` makes every language ready before a loader or an action words a
refusal. It waits only for a language with no catalogue yet, and only up to
`firstReadWaitMs`; a held catalogue is served at once, and an old one is
checked in the background, so a request never waits for a check.

```ts
// app/root.tsx
import { catalogue } from './catalogue.server';

export const middleware = [
	async (_args: unknown, next: () => Promise<unknown>) => {
		await catalogue.freshAll();
		return next();
	},
];
```

A language whose first read is slow or failed is not waited for twice: the
wait is counted from when the read started, one read is in flight however many
requests ask, and a failure is retried after `retryMs`. Meanwhile the refusals
of that language read in the API's words: see
[Right after start](../troubleshooting.md#right-after-start-refusals-read-in-the-apis-words).

### Returning the browser's messages from the root's loader

The browser words a form's checks itself, so it needs the messages of the
`clientCodes`. `clientMessages()` returns them by language, leaving out a code
the catalogue does not hold; `ApiMessagesProvider` adds them to the browser's
store.

```tsx
// app/root.tsx
import { catalogue } from './catalogue.server';

export function loader() {
	return { catalogue: catalogue.clientMessages() };
}

// In the component:
// <ApiMessagesProvider messages={apiMessages} value={data.catalogue}>
```

### Warming it at startup

`warm()` reads every language without holding the boot back, so the first
request finds the messages held. It never throws: a failure is logged.

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';
import { catalogue } from './catalogue.server';

catalogue.warm();

export default createServer();
```

### In a spec

`fresh(language, now)` and `freshAll(now)` take the time as an argument, in
milliseconds, so a spec moves the clock instead of sleeping: a call at
`now = ttl` starts the check, `settled()` waits for it, and `heldVersion`
says which version is held. `reset()`, `settled()`, `heldVersion()`, the `now`
parameters and the store's `clear()` are for tests. `reset()` forgets what is held and empties the
store. It is for use between tests, with nothing in flight: a read or check
still running when it is called finishes and holds its result again.

```ts
await catalogue.fresh('en', 0);
await catalogue.fresh('en', 60_000); // past the TTL: checks in the background
await catalogue.settled();
```
