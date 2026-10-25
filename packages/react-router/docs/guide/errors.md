# An API's refusals, worded for the page

This page covers how an app that calls a GraphQL API words that API's refusals
for its pages: the error's shape, the request id it carries, the page a
request is for, the catalogue store of the API's messages, the form checks in
the API's words and the provider that fills the catalogue. The code is in `@alxia/react-router/errors`, which has no UI.
It imports nothing at runtime (it may import `react-router`, never
`@alxia/core`), so a page can import it (`boundary.spec.ts` checks the built files).

- [What the subpath holds](#what-the-subpath-holds)
- [Recognising an API error](#recognising-an-api-error)
- [The request id](#the-request-id)
- [The page a request is for](#the-page-a-request-is-for)
- [The catalogue store](#the-catalogue-store)
- [Form checks in the API's words](#form-checks-in-the-apis-words)

## What the subpath holds

| export | what it is |
| --- | --- |
| `ApiErrorLike`, `isApiErrorLike(error)` | the shape of `@nxgt/graphql-client`'s `ApiError`, and the test for it |
| `ApiErrorEntryLike`, `ApiErrorExtensionsLike`, `ApiErrorParamsLike`, `ApiFieldErrorLike` | one error of the response, its `extensions`, their `params`, and one refused field |
| `waitMinutes(extensions)` | the minutes of a throttle's wait |
| `REQUEST_ID_HEADER`, `requestIdOf(response)` | the header an API echoes on every response, and its value |
| `nextOf(url)` | the page a request is for, as `next` carries it back after sign-in |
| `FormErrors` | what a form action answers when the API refused the input |
| `createApiMessages`, `ApiMessages`, `ApiMessagesOptions`, `CatalogueMessage(s)`, `ParamKind`, `MessageFormat`, `MessageValues` | the catalogue of the API's messages, held by the app |
| `apiCodeResolver`, `ApiCodeResolver`, `ApiCodeResolverOptions`, `CodeIssueLike` | the words of a form's checks, from that catalogue; `CodeIssueLike` is the issue a custom `codeOf` receives |
| `ApiMessagesProvider`, `ApiMessagesProviderProps` | fills the catalogue in the browser from the root's data |

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
the API's own `<module>.errors.<slug>`, such as `todos.errors.title-taken`.

`waitMinutes` reads a throttle's wait the way the API words it: the
`minutes` of `extensions.params` or beside it, at least one, else the
`retryAfter` seconds rounded up.

```ts
import { waitMinutes } from '@alxia/react-router/errors';

waitMinutes({ retryAfter: 90 }); // 2
waitMinutes({ params: { minutes: 4 } }); // 4
```

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
page itself, for the `next` a sign-in carries back:

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
carries before the children render, since the resolver reads them
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
says which keys are API codes (`<module>.errors.<slug>` by default).

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
