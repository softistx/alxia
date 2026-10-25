# An API's refusals, worded for the page

This page covers how an app that calls a GraphQL API words that API's refusals
for its pages: the error's shape, the request id it carries, and the page a
request is for. The code is in `@alxia/react-router/errors`, which has no UI.
It imports nothing at runtime (it may import `react-router`, never
`@alxia/core`), so a page can import it (`boundary.spec.ts` checks the built files).

- [What the subpath holds](#what-the-subpath-holds)
- [Recognising an API error](#recognising-an-api-error)
- [The request id](#the-request-id)
- [The page a request is for](#the-page-a-request-is-for)

## What the subpath holds

| export | what it is |
| --- | --- |
| `ApiErrorLike`, `isApiErrorLike(error)` | the shape of `@nxgt/graphql-client`'s `ApiError`, and the test for it |
| `ApiErrorEntryLike`, `ApiErrorExtensionsLike`, `ApiErrorParamsLike`, `ApiFieldErrorLike` | one error of the response, its `extensions`, their `params`, and one refused field |
| `waitMinutes(extensions)` | the minutes of a throttle's wait |
| `REQUEST_ID_HEADER`, `requestIdOf(response)` | the header an API echoes on every response, and its value |
| `nextOf(url)` | the page a request is for, as `next` carries it back after sign-in |
| `FormErrors` | what a form action answers when the API refused the input |

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
