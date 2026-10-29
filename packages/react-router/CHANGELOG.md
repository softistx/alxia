# @alxia/react-router

## 0.32.0

### Minor Changes

- [#438](https://github.com/softistx/alxia/pull/438) [`6747a0f`](https://github.com/softistx/alxia/commit/6747a0fcd4b1495a88dc08978b0ae91d9f040c80) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `useDebouncedFetcher` to `@alxia/react-router/fetcher`: a resource route loaded through a fetcher for what is typed, after a pause and from a minimum length, with the previous answer kept (`stale`, filtered by an optional `keep`) until the new one lands, and a stable `retry`. `/fetcher` now imports `react-router` as well as `react`.

## 0.31.1

### Patch Changes

- [#432](https://github.com/softistx/alxia/pull/432) [`0bd0675`](https://github.com/softistx/alxia/commit/0bd0675d3a09cb34edb67035d5f8ee1e44f60e8a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `FetcherResultOptions.reword` is typed `(error: ApiErrorLike) => string | undefined` and is called for an API's own refusal only, no longer for an API it cannot reach or another failure that `fetcherResult` words. A callback typed `(error: unknown)` still compiles.

## 0.31.0

### Minor Changes

- [#429](https://github.com/softistx/alxia/pull/429) [`573cf21`](https://github.com/softistx/alxia/commit/573cf218f42b0ce5d56aba17f99382c0a994a90a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `apiErrors.fetcherResult(language, about, run, options?)` takes `reword(error)` in its last argument (`FetcherResultOptions`, exported from `@alxia/react-router/errors`, which extends `RouteErrorOptions`): it receives the caught API error and returns the message to answer, or `undefined` to keep the worded one. The status stays the refusal's.

## 0.30.0

### Minor Changes

- [#423](https://github.com/softistx/alxia/pull/423) [`468cd5d`](https://github.com/softistx/alxia/commit/468cd5d81fdee4dc745cfa28a85c26071e1d366a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@alxia/react-router/fetcher` with `useFetcherAnswer(fetcher, onAnswer?)`: calls `onAnswer` once per answer a fetcher gives while idle, ignoring the data it already held at mount (a keyed fetcher outlives its page), reads the handler from a ref, and returns the latest answer handed over.

## 0.29.0

### Minor Changes

- [#418](https://github.com/softistx/alxia/pull/418) [`a7f95ef`](https://github.com/softistx/alxia/commit/a7f95effb830b8457554b5c0fb793d4f95a48a14) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `stepUpSteps({ onSignedOut: 'sign-in' })`: `route` now owns a signed-out user. An `UNAUTHENTICATED` answer (`codes.unauthenticated`) redirects from either step, and a bare 401 only from `request`, to sign-in with `next` from a same-site `Referer` (else the route's own path), while a wrong code stays a refusal and a second-factor-required answer is never a redirect.

## 0.28.2

### Patch Changes

- [#415](https://github.com/softistx/alxia/pull/415) [`ed17a6b`](https://github.com/softistx/alxia/commit/ed17a6bf0e015ddba15d9e17bd32cff9abcb9350) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `useStepUpReplay`'s `confirmedNotice` now clears as soon as `action` becomes another value (the user posted a new action), instead of lingering until that action's answer or `cancel()`. Behaviour change, on by default: a host that passes the same `action` reference for different posts must pass a new object for each. Documented that a `replay()` that posts nothing leaves the dialog confirming, so the host must call `cancel()`.

## 0.28.1

### Patch Changes

- [#412](https://github.com/softistx/alxia/pull/412) [`3c5f877`](https://github.com/softistx/alxia/commit/3c5f87798b62632f0cd411c030af3f60bd770938) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `dialogPropsOf` and `useStepUpReplay`'s `dialogProps` keep `via` in every phase once a challenge was granted (`code`, `expired`, `failed`, `confirmed`), not only in `code`, so a dialog can tell a mailed code from an authenticator-app code to offer "send a new code" or "retry".

## 0.28.0

### Minor Changes

- [#410](https://github.com/softistx/alxia/pull/410) [`146ba2b`](https://github.com/softistx/alxia/commit/146ba2b4779781145d3f32df67c6de2f07d8a0e8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `useStepUpReplay` and `useStepUp` to `@alxia/react-router/session/react`: open a step-up dialog when an action's answer carries `stepUp`, post the `request-step-up` and `confirm-step-up` intents through the host's own typed `post`s, and send the refused action again once the session is confirmed (not when it carries a one-time code the step-up just spent: `confirmedNotice` then says to type a new one). `stepUpSteps` gains `route(run, { request, language })`, the whole action of one resource route any page can post the step-up intents to.

### Patch Changes

- [#406](https://github.com/softistx/alxia/pull/406) [`fa09b42`](https://github.com/softistx/alxia/commit/fa09b428690e74b3d3416aa08ec09e8ea5aa71ce) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Correct the subscription proxy docs: Bun's default `idleTimeout` (10 s) is shorter than the 15 s heartbeat, so set `listen: { idleTimeout: 30 }`.
- Updated dependencies [[`fa09b42`](https://github.com/softistx/alxia/commit/fa09b428690e74b3d3416aa08ec09e8ea5aa71ce)]:
  - @alxia/core@0.17.1

## 0.27.0

### Minor Changes

- [#403](https://github.com/softistx/alxia/pull/403) [`e4ff32c`](https://github.com/softistx/alxia/commit/e4ff32c1746581a5b52a50a5b6fdfb3e556e2e79) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The production server serves the client build compressed. `react-router build` writes `.br` and `.gz` copies beside every compressible file of `build/client` (1 kB and over; `alxia({ precompress: false })` writes none, `precompress: { minSize }` moves the threshold), and the server sends the copy a browser accepts, with `Content-Encoding`, `Vary: Accept-Encoding` and the same `Cache-Control`, for `assets/` and for the files at the top of the build alike. `createServer({ precompressed: false })` and `reactRouter(app, { precompressed: false })` serve the files as they are.

### Patch Changes

- Updated dependencies [[`e4ff32c`](https://github.com/softistx/alxia/commit/e4ff32c1746581a5b52a50a5b6fdfb3e556e2e79)]:
  - @alxia/core@0.17.0

## 0.26.0

### Minor Changes

- [#398](https://github.com/softistx/alxia/pull/398) [`67632b9`](https://github.com/softistx/alxia/commit/67632b99ea13e39cf789b5956acc1292b408e1a8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New subpath `@alxia/react-router/link`: `RouterLink` and `RouterLinkProps`, React Router's `Link` as the link component of a UI library that hands an `href` and spreads anchor props (a `LinkComponentProvider`). It takes `href` (or `to`) and passes `className`, `children`, `ref` and every other prop on; imports `react` and `react-router` alone. Additive.

## 0.25.0

### Minor Changes

- [#395](https://github.com/softistx/alxia/pull/395) [`17dc44f`](https://github.com/softistx/alxia/commit/17dc44f01559220ee04372f251d6e8fd8fbdfbcb) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `/session`: the second factor is optional. `sessionCookies` takes no `challenge` (and returns `SessionCookies<false>`, with no `challengeOf`, `commitChallenge` or `destroyChallenge` on the type), and `signInFlow` takes no `attemptsLeft` (and returns `SignInFlow<L, C, false>`, with no `attemptsLeft`, `codeRefusal`, `readCodeInput` or `codeStep`). Without one, a `secondFactor` answer lands nowhere (`landing` returns `null`) and no challenge cookie is set or cleared. The two go together: a cookies set with a challenge and no `attemptsLeft` is a compile error, and `signInFlow` throws a TypeError when only one is given. `sessionCookies` with `challenge: string | undefined` returns `SessionCookies<boolean>`, which `signInFlow` does not take until it is narrowed. New types: `SessionCookiesWithoutChallengeOptions`, `SignInFlowWithoutSecondFactorOptions`, `SecondFactorSteps`, `ChallengeCookies`, `NoChallengeCookies`, `SessionCookiesBase`, `SignInFlowBase`. An app with a second factor is unchanged. Additive.

## 0.24.1

### Patch Changes

- [#393](https://github.com/softistx/alxia/pull/393) [`86cea04`](https://github.com/softistx/alxia/commit/86cea0443db43d63275a882b86f18792d33ba978) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The default API-code pattern (`API_CODE`, used by `createApiErrors` and `apiCodeResolver` when no `isApiCode` is given) accepts a camelCase module, such as `userProfiles.errors.slug-taken`. Before, such a code fell back to the generic refusal. A module must still start with a lowercase letter.

## 0.24.0

### Minor Changes

- [#391](https://github.com/softistx/alxia/pull/391) [`7b42bc2`](https://github.com/softistx/alxia/commit/7b42bc2cebac0b3ba4ae8316a25d89f02a827faa) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@alxia/react-router/lists` exports the loader half of `usePagedRows`: `orFailed(after, run)`, `FAILED` (`{ failed: true }`), `isFailedPage` and `FailedPage`. With no `after` an error is rethrown; with an `after` it answers `FAILED`, so the rows stay with a retry, except a 3xx `Response`, which is rethrown. Additive.

- [#388](https://github.com/softistx/alxia/pull/388) [`8734d1f`](https://github.com/softistx/alxia/commit/8734d1f4705a7a86485fc89584221c0142cd3c66) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `useSearchChange` (`/lists`) accepts, besides its record of changes, a whole `URLSearchParams` that replaces the search or an updater `(prev) => URLSearchParams`, with the same `replace` and `preventScrollReset` behaviour. `resetKeys` applies to the record form only. Additive.

## 0.23.0

### Minor Changes

- [#385](https://github.com/softistx/alxia/pull/385) [`f762f39`](https://github.com/softistx/alxia/commit/f762f39b4dacba9d490d3c7f96f3fd636fb730b1) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `createSubscriptionProxy`'s `headers` function now receives the route's loader or action arguments as a second argument, `headers(request, { request, context, params })`, so a BFF can send the trusted client address from its context (`X-Forwarded-For` from `context ? alxiaOf(context).ip : null`, the argument annotated `SubscriptionArgs<Readonly<RouterContextProvider>>`) and the language its session chose, instead of copying a header the browser could forge. `createSubscriptionProxy<Context>`, `SubscriptionProxy<Context>` and the new `SubscriptionArgs` type carry the context's type. A `(request) => headers` function, a record and `Headers` keep working, a `headers` function that throws is a 500 with fixed text, and the context never reaches the browser or the API.

## 0.22.0

### Minor Changes

- [#383](https://github.com/softistx/alxia/pull/383) [`4d864fe`](https://github.com/softistx/alxia/commit/4d864feac30fc87ca76e563af56d3c408fcc253b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `authLinks`' `codes.mailThrottled` accepts a list of codes as well as one: each listed 429 code exposes its `retryAfter` to the page, so an API that throttles per address and per e-mail gets a countdown on both. The single code keeps working.

## 0.21.0

### Minor Changes

- [#381](https://github.com/softistx/alxia/pull/381) [`1d2afb3`](https://github.com/softistx/alxia/commit/1d2afb36226339d3a933316b6b8dd371af486b70) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@alxia/react-router/errors` exports `retryAfterOf(error)`, the seconds a 429 asks to wait, so a page can show a countdown on its own rate-limited forms instead of copying the helper.

## 0.20.0

### Minor Changes

- [#379](https://github.com/softistx/alxia/pull/379) [`87f8392`](https://github.com/softistx/alxia/commit/87f8392f513a222d946cb075fa8b786164eb8269) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@alxia/react-router/lists`: the hooks of a list screen whose state is the URL. `useSearchChange({ resetKeys? })` returns `(changes) => void` that sets or deletes search parameters and drops the cursor (`after` by default), replacing the history entry and keeping the scroll position. `useSameRouteLoading()` is `true` while another search of the current pathname is loading. `usePagedRows(firstPage, rowsOf, { cursorParam?, nextOf? })` returns `{ rows, next, loading, error, loadMore }`: it appends the pages the same route answers to `?after=<next>` through `useFetcher`, starts over when the loader gives a new first page, and keeps the rows and sets `error` when a page fails. It imports `react` and `react-router` only. Additive.

## 0.19.0

### Minor Changes

- [#375](https://github.com/softistx/alxia/pull/375) [`911af23`](https://github.com/softistx/alxia/commit/911af232f664413ca196ac5245cf936181018cc4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@alxia/react-router/subscription`: `createSubscriptionProxy({ endpoint, allow, getToken, headers?, origin?, heartbeatMs? })`, a resource route's `loader` (GET) and `action` (POST) that expose GraphQL subscriptions to the browser of a BFF over SSE (graphql-sse's distinct connections mode). `allow` maps an operation name to the document the server sends for it: the client names an operation and sends variables, and its own `query` and `extensions` are ignored. Both methods refuse a cross-site request and a POST that is not JSON, the bearer comes from the session (401 without one), requests are size-limited, a heartbeat keeps the stream open, the relay is pulled and capped, the browser leaving aborts the upstream request, and an upstream 429 is passed on with `retryAfter`. It imports nothing and adds no peer. Additive.

## 0.18.0

### Minor Changes

- [#359](https://github.com/softistx/alxia/pull/359) [`9ce17b0`](https://github.com/softistx/alxia/commit/9ce17b0c76880c637620a6226631ca2dd25353e3) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `useLinkParam(name, { live: true })` follows the URL instead of reading the parameter once, so a parameter that a redirect or a link adds to the same mounted route (`?state=linked` after a mail-link action) is seen. Without `drop` it returns the parameter of the current location. With `drop` the value is kept after the address bar loses it, until a location carries a new one, and each new location is dropped again. Additive: the default stays a single read of the first render. `LinkParamOptions` gains `live?: boolean`.

## 0.17.0

### Minor Changes

- [#356](https://github.com/softistx/alxia/pull/356) [`06b1e19`](https://github.com/softistx/alxia/commit/06b1e192d59265927b03e3fd5ad5270d2d6ecb3c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New subpath `@alxia/react-router/session/react`: the page's hooks around the session flows, which apps each wrote their own copy of. `useSignOut({ action?, before? })` posts the JSON sign-out and returns `{ signOut, busy }` (a failing `before` never keeps the user signed in); `useLinkParam(name, { drop? })` reads a mail link's query parameter once and can remove it from the address bar with `history.replaceState`; `useCodeField(schema, refusal)` is a one-code field (TOTP or recovery) over any synchronous Standard Schema that clears the refused code and refocuses on each new refusal, and `useOnRefusal(refusal, handler)` is the form-library-agnostic core under it, for react-hook-form and the like. Additive: `react` and `react-router` are already peers, and no form library is added.

## 0.16.0

### Minor Changes

- [#354](https://github.com/softistx/alxia/pull/354) [`ca84d7a`](https://github.com/softistx/alxia/commit/ca84d7a0745a10e7d46cbbe4917db966b548e99a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `stepUpSteps` maps a rate limit to `error: 'throttled'`: `request` answers it for any 429 (not only the `MAIL_THROTTLED` code), and `confirm` answers it too, with `retryAfter` in seconds when the API says. `StepUpConfirmAnswer` gains an optional `retryAfter`, and `stepUpReducer` keeps the challenge, the tries and the code form on a throttled code and holds `retryAfter` (`stepUpProps` already passes it on), so `@nxgt/material`'s `VerificationCode` and `StepUpDialog` make Resend wait without locking. Additive types: nothing existing changes shape. Behaviour: a 429 that used to answer `failed` (`request`) or `invalid` / `failed` (`confirm`, even under the wrong-code code) now answers `throttled`; a consumer that branches on those for a 429 must handle `throttled`. The second-factor kind is already `'code' | 'recovery'`.

### Patch Changes

- [#352](https://github.com/softistx/alxia/pull/352) [`998efb2`](https://github.com/softistx/alxia/commit/998efb2d5171a7561d500d696f7c20b9be737055) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `stepUpSteps` takes a `signInFlow` typed with a caller context (`signInFlow<Lang, Caller>`) without a cast: `StepUpStepsOptions` gains a second type parameter `C`, `undefined` by default, so a flow with no context is unchanged. Fixes [#351](https://github.com/softistx/alxia/issues/351).

## 0.15.1

### Patch Changes

- Updated dependencies [[`c327cfd`](https://github.com/softistx/alxia/commit/c327cfd802fc87fe6f5405c0531338b3ecff1a61)]:
  - @alxia/core@0.16.0

## 0.15.0

### Minor Changes

- [#341](https://github.com/softistx/alxia/pull/341) [`192bbe2`](https://github.com/softistx/alxia/commit/192bbe2ed14dbab3bfd0b275d5cc039ed3b8f3c6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `signInFlow`'s `revoke` can now receive the caller's context, such as the visitor's resolved address and language, which a bare `Request` cannot carry. `revoke(token, request, context)` gets it as a third argument, and `signOut`, `revokeSession`, `landReplacing`, `signInStep` and `authLinks`' `landByLink` and `afterReset` take an optional `context` to pass along (for example `{ context: alxiaOf(context) }`). Annotate the `revoke` parameter and the type is inferred for every step. Without a context, `revoke` receives `undefined`, and a two-parameter callback keeps working.

## 0.14.0

### Minor Changes

- [#330](https://github.com/softistx/alxia/pull/330) [`86c3907`](https://github.com/softistx/alxia/commit/86c39074682268b6b3c7d31ab9d343a772209f1e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@alxia/react-router/session` and `/session/model`: the session of an app that is the backend of its own pages (a BFF) over a GraphQL API that signs users in with `@nxgt/janus`, with the token in an HttpOnly cookie. They speak janus's words (`signedIn`, `secondFactor`, `CODE_INVALID`, `via: 'email' | 'secondFactor'`) without importing it, and add no peer. See the new session guide.
  
  - `/session/model` imports nothing, so it is safe in a component as well as a loader: `safeNext` and `signInPath` (a redirect after sign-in that stays on the site; its `path` option must be a path of this site), `secondFactorPath`, `SIGN_IN_PATHS`, `TOTP_CODE`, `SecondFactorKind`, and the step-up's answers and state (`stepUpReducer`, `stepUpProps`). The state carries the refusal's `message` and a throttle's `retryAfter` until the next step; `StepUpProps` carries `retryAfter` (the dialog words its own texts, so not `message`); `StepUpError` is `'invalid' | 'expired' | 'failed' | 'throttled'`.
  - `/session` imports `react-router` and `/errors`' files, nothing else:
    - Every step that signs in, out, spends or mails runs one guard first (`signInStep`, `readCodeInput`, `landReplacing`, `revokeSession`, `linkArgs`, `spendToken`, `landByLink`, `afterReset`, `requestLink`, `stepUp.request`, `stepUp.confirm`), and `signIn.guard(request)` is the same check for an app's own POST step. `signInFlow` throws a `TypeError` for a `json` that did not come from `jsonActions()`: a native form post goes back to its page, and a JSON post from another site is a 403 (the Origin and Sec-Fetch-Site rule of `readJson`, headers only), before anything is read, spent, revoked or mailed.
    - Every per-request step takes `(…, { request, language, … })`: `signInStep`, `landByLink`, `requestLink(run, { request, language })`, `spendToken(run, { request, language, path, states, fields? })`, `stepUp.request(run, { request, language })` and `stepUp.confirm(run, { request, language, via? })`. `stepUpSteps({ signIn, spent, locked?, wording?, codes? })` reads `errors`, `json` and `attemptsLeft` from the flow.
    - `sessionCookies` names, writes, reads and removes the session and the second-factor challenge cookies (`__Host-` and `__Secure-` when `secure`; `names` gives them as sent), in the bytes an app that wrote its own cookies already sends, so live sessions survive adopting it; `serializeCookie`, `readCookie` and `secondsUntil` are exported for the cookies of your own.
    - `signInFlow` is where a sign-in lands (`landing`, `landReplacing`, which revokes the session the browser held), `signInStep` (an API refusal as the form's message, an unreachable API as a 503), the second factor (`readCodeInput`, `codeStep`, `codeRefusal` with the tries left), `viewer` and `requireViewer`, and `signOut` (JSON and same-origin only; it clears the challenge cookie too). It exposes `cookies`, `errors`, `json`, `attemptsLeft`, `unavailable(language)`, `clear()` and `guard(request)`.
    - `stepUpSteps` is the step-up's two steps for a route action: `request` (a challenge and how it is confirmed; a throttled mail is `error: 'throttled'` with `retryAfter` in seconds when the API gives them) and `confirm` (`invalid` with `attemptsLeft`, `expired`, `failed`; with no try left a mailed code is `expired` and an app or recovery code is `locked`), plus `isStepUpRequired` and the `codes` option (`invalidCode`, `challengeOver`, `stepUpRequired`, `mailThrottled`). The challenge stays in the fetcher's answer, never in a URL or the loader's data.
    - `authLinks({ signIn, codes?, wording?, start?, resetDone?, invalidState? })` is the server side of the pages a mail's link opens (a magic link, a password reset, an invitation), over the flow's cookies, errors and json: `linkArgs`, `spendToken`, `answerOf`, `landByLink`, `afterReset` (it clears the session, the challenge and the flow's cookies), `requestLink` (a wait is a 429 with `throttled: true` and `retryAfter`), `statePath` and `ended`; `TOKEN_PAGE_HEADERS` (`Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`) is for the token pages. The mail throttle is `codes.mailThrottled` (`AuthLinksCodes`), and `wording` words every refusal of `requestLink` that is not a field's, as the step-up's does.
    - `INVALID_CODE`, `CHALLENGE_OVER`, `MAIL_THROTTLED`, `STEP_UP_REQUIRED` and `STEP_UP_OVER` are exported, so an app can extend a list of codes.
    - Every optional input accepts `undefined` (`exactOptionalPropertyTypes`).
  - `/errors` gains `attemptsLeftOf(error)`, the tries a refused code leaves (`extensions.attemptsLeft`, else `params.attemptsLeft`). `readJson`, `requireJsonPost` and `readInput` behave as before.

## 0.13.0

### Minor Changes

- [#328](https://github.com/softistx/alxia/pull/328) [`0984939`](https://github.com/softistx/alxia/commit/09849396f63f6234ba54aa3f0fbcfe0f98975456) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `createApiErrors` takes an optional `reword(text, error, { code, values, language })` to word a whole family of codes once, such as adding a suffix to every `*.errors.referenced` refusal. It runs on the final text of an API error, whether the catalogue, the API's message or `byCode` produced it, receives the merged values the catalogue formats with, and returns the text to show or `undefined` to keep it. It does not apply to `refused`, `unavailable` or the entries of `extensions.fields`. Without it nothing changes.

## 0.12.1

### Patch Changes

- [#321](https://github.com/softistx/alxia/pull/321) [`1496765`](https://github.com/softistx/alxia/commit/149676531f6260a45ab23dec74fcb53b5e29f44a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Fix the `/document` guide, the README and the `react-router` template: the root passes `<Links nonce={useNonce()} />`. React Router's `<Links>` does not suppress the hydration warning for its development critical-CSS `<style nonce>`, so without the prop React reports a `nonce` mismatch; `<Scripts>` and `<ScrollRestoration>` need nothing. Troubleshooting has an entry for the warning.

## 0.12.0

### Minor Changes

- [#299](https://github.com/softistx/alxia/pull/299) [`6d5d031`](https://github.com/softistx/alxia/commit/6d5d0313b46a34da52370d3d21955c526a52b52c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@alxia/react-router/document`: the page's CSP nonce and inline boot scripts, for a root route. `DocumentNonce` provides the response's nonce to the server render, and `useNonce()` reads it there and, in the browser, the one the document's scripts carry, so hydration finds the attribute the server rendered. `InlineScript({ code, nonce? })` renders an inline `<script>` with that nonce (a theme's boot script, placed first in `<head>`, runs before the first paint), and `CspNonceMeta()` renders `<meta property="csp-nonce">`. `react` is its only import, an optional peer already.
  
  Add `@alxia/react-router/entry`: `entry.server.tsx` for an app on Bun, server only. `export { handleRequest as default, streamTimeout } from '@alxia/react-router/entry'` streams the shell, waits for the whole page for a bot (`isbot`) and in SPA mode, answers HEAD with no body, aborts the render after `streamTimeout + 1 000` ms (the timer is cleared when the body ends or is cancelled), and gives the router the response's nonce (`nonceOf` by default) and `DocumentNonce`. `createEntry({ streamTimeout, nonce, isBot, onError })` changes any of them. It renders with `renderToReadableStream`: no `@react-router/node`, no `node:stream`. `react-dom` and `isbot` are new optional peers. `alxia()` inlines `/entry` and `/document`, so they share the app's `react-router`: in dev it aliases both to themselves (Vite then skips its early externalisation of them), and in builds it bundles them even when the package is listed in `ssr.external`. `alxiaContext` and its "missing" sentinel are one pair per process whichever copy of the module asks. A throwing `isBot` or a rejected `allReady` cancels the render.
  
  Add to `/document` the page's language: `createPageLanguage({ languages, fallback })` returns `pageLanguage`, `metaLanguage`, `chooseLanguage` and `useChosenLanguage` for `<html lang>`, a route's `meta` and a language menu (the browser remembers the last language and the picked one wins there, the server remembers nothing), and `textDirection(language)` gives `'ltr'` or `'rtl'` for `<html dir>` from a fixed list of right-to-left base languages. Still only `react` imported.
  
  `InlineScript` throws a `TypeError` when its code holds `</script` or `<!--`, which end or confuse the element whatever the nonce: escape them in a string (the code holds `<\/script`, written `"<\\/script"` in source). `isbot` is needed only when no `isBot` option is given (it is imported on the first bot check), `createEntry` returns an `Entry` (exported), `streamTimeout` is typed `number`, and a client that leaves before the shell, or while a bot waits for the whole page, stops the render. Every optional prop and option accepts `undefined` (`exactOptionalPropertyTypes`). `useNonce()` reads the document's nonce from the `<head>` first. `/document`'s nonce context, like `alxiaContext`, is one per process under a versioned key. With `/entry`, `<ServerRouter>` gives `<Links>`, `<Scripts>` and `<ScrollRestoration>` the nonce, so their `nonce` props are optional.

## 0.11.0

### Minor Changes

- [#281](https://github.com/softistx/alxia/pull/281) [`cc24760`](https://github.com/softistx/alxia/commit/cc2476017cdc09b29b4319f49f276f09bd55139a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@alxia/react-router/errors`, the code with no UI that words an API's refusals for the page. It declares the shape of a GraphQL API's refusal structurally, so the subpath needs no `@nxgt/graphql-client` at runtime and never imports `@alxia/core`; its only runtime import is `react-router`, and `react` (an optional peer) is imported for types only.
  
  - **The API's error.** `ApiErrorLike` (with `ApiErrorEntryLike`, `ApiErrorExtensionsLike`, `ApiFieldErrorLike`), `isApiErrorLike` (like the client's `isApiError`, plus a numeric `status`; it holds across two copies of the client) and `waitMinutes` (the minutes of a throttle's wait). `REQUEST_ID_HEADER` and `requestIdOf(response)` give the id an API echoes on a response, `nextOf(url)` the page a request is for (the `next` that carries it back after sign-in; it never starts with two slashes, but an app still validates `next` before redirecting), and `FormErrors` what a form action answers when the API refused the input.
  - **The API's words.** `createApiMessages({ format })` holds the API's message catalogue as an instance, where the app injects its ICU formatter (a `DATE` argument is a calendar day in every time zone). `apiCodeResolver(messages, { translate, language })` is the `{ translate, codeOf }` a form's `useCodeResolver` takes: it words a refinement's API code as the API does and never shows the code. `ApiMessagesProvider` fills the store in the browser from the root's data and writes nothing during a server render.
  - **A refusal, worded.** `createApiErrors({ messages, unavailable })` returns `apiErrorMessage`, `fieldErrors`, `translateCode`, `unavailableMessage` and `apiRefusal` (an `ApiRefusal`, `{ message, status }`), with `refused` for the generic refusal of an error with no API code, `byCode` for the codes an app words itself and `isApiCode` for what counts as an API code (`<module>.errors.<slug>` by default).
  - **Answering with it.** `routeError(error, { statuses? })` is what a loader throws for the API's error: a 401, 403, 404 or 503 `ApiError`, or such a `Response` carrying an `x-request-id`, becomes a route error of that status with its `code`, `message` and `requestId`, and any other `ApiError` with an id becomes a 500 carrying it. `errorRequestId(error)` is the support reference an error page shows. On `createApiErrors`'s result, `fetcherResult(language, about, run, route?)` is a fetcher's action (`{ ok: true }` with the value, or `{ ok: false, error }`), `fetcherRefusal(error, language, route?)` its refusal, and `submitForm(language, run, fieldOf, route?)` a form's action, the refusal placed under the form's fields as a `FormErrors`; `route` is the `RouteErrorOptions` of the `routeError` they throw through.
  - **JSON actions.** `jsonActions({ origin? })` returns `readJson(request)` (JSON only, and only from this site: 403 `Cross-site request refused`, 415 `Expected a JSON body`, 400 `Malformed JSON body`; `origin` is a string or a getter, for an app behind a TLS-terminating proxy), `requireJsonPost(request)` (a native post goes back to its page) and `readInput(request, schema)` (the body's `input` through a Standard Schema, whose async validation is awaited; 400 `The form sent an input the API would refuse`). `useJsonFetcher(key?, action?)` is the fetcher that posts that JSON (`{ fetcher, post(body, to?), busy }`, with `JsonBody`). The Standard Schema v1 types are declared in the subpath (`StandardSchemaV1`, type only).
  - **A fresh catalogue.** `createErrorCatalogue({ messages, languages, read, versions, ttlMs, clientCodes, retryMs?, firstReadWaitMs?, log? })` returns `fresh(language, now?)`, `freshAll(now?)`, `warm()`, `clientMessages()`, `reset()`, `heldVersion(language)` and `settled()`. A language with no catalogue yet is awaited for at most `firstReadWaitMs` (1500 ms), read once however many requests ask, and retried `retryMs` (5000 ms) after a failure; a held one is served as it is and its version is checked in the background once per `ttlMs` (a number or a getter), re-reading only the languages whose version moved. The root's middleware awaits `freshAll()`, its loader returns `clientMessages()` and `server.ts` calls `warm()`. An empty `languages` throws a `TypeError`, and a `ttlMs` that throws or is not a finite number of at least 0 is logged and `retryMs` is used.
  - **A failed call.** `apiCallFailure(error, { api, operation?, requestId?, signal?, passedThrough?, log? })` returns what a loader or an action throws and logs it with the request id: an `ApiError` as it is (with `requestId`), a `Response` of its own status for a 401, 403 or 404 without a GraphQL body, a 503 `Response` with no body for an unreachable, slow, garbled or aborted API (the reason is in the log), and any other error as it is. Its log lines are prefixed by the app's `api`, and a `log` that throws never replaces the outcome. It recognises `@nxgt/graphql-client`'s `ApiStatusError` and `ApiUnavailableError` by `name` rather than `instanceof`, and a `passedThrough` status that cannot carry a body (101, 204, 205, 304) is answered with an empty one. `operationName(document)` names the operation for the log, over a structural `{ definitions }` so `graphql` is not imported. The call itself, its headers and its caller stay the app's.

## 0.10.0

### Minor Changes

- [#283](https://github.com/softistx/alxia/pull/283) [`cbd08e3`](https://github.com/softistx/alxia/commit/cbd08e391093319fc86fdf847e798f2389006566) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@alxia/react-router/pwa/worker`, the service worker on Workbox: `startWorker({ contract, caching?, assets?, static?, navigationPreload?, precache? })` registers the precache route, `NetworkOnly` for a page load (the precached offline page answers when the network fails), `CacheFirst` for hashed bundles and `StaleWhileRevalidate` for other static files, both storing only what `isStorable` accepts, sweeps the contract's obsolete caches on `activate` and applies `SKIP_WAITING`. The six `workbox-*` packages (`core`, `expiration`, `navigation-preload`, `precaching`, `routing`, `strategies`, `^7`) are optional peers and the subpath's only package imports; it does nothing when imported, uses no worker global (so it compiles under the app's DOM `tsconfig`), and reads the precache list from `globalThis.__ALXIA_PRECACHE__`, which a build defines, or from `options.precache`.
  
  Add `@alxia/react-router/pwa/build`, `buildWorker({ file, root?, client?, contract?, offline?, precacheAssets?, minify? })`: after `react-router build` it bundles the worker (Workbox included) with `Bun.build` into `build/client/service-worker.js`, with the precache list defined in: the offline page revisioned by its content, every route's code from React Router's browser manifest, and the `precacheAssets` files. It runs on Bun, imports only Node's built-ins and reads Bun's global inside the function.
  
  Make `alxia()` build the worker: when `app/service-worker.ts` exists, `react-router build` writes `build/client/service-worker.js` after the client build (a `buildApp` hook ordered after React Router's builder), so an app has no script to add. `alxia({ worker })` names another file, passes `buildWorker()`'s options (`file`, `contract`, `offline`, `precacheAssets`, `minify`) or turns it off with `false`; it needs Bun. An app with its own worker build drops that script and its `sw/` tsconfig.

## 0.9.0

### Minor Changes

- [#272](https://github.com/softistx/alxia/pull/272) [`cd045b4`](https://github.com/softistx/alxia/commit/cd045b49456472ffd82ce934e2ea1f727af3a2c2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@alxia/react-router/pwa`, the code with no UI an installable app shares and that imports nothing: `defineWorkerContract` (the worker's cache names from a required `cachePrefix`, `obsoleteCaches`, `clearableCaches`), `cachingFor` and `isStorable` (which requests a service worker caches and which responses it may store, with `never`, `immutable` and `contract` options), `parseBrowserManifest`, `precacheList` and `assetPrecache` (the precache list read from a build), and `clearAppCaches(contract)`; `defineWorkerContract` checks `cacheVersion` and owns a cache by the shape of its name, `<prefix>-<kind>-<version>`, so a retired kind is still swept; and the page's side: `registerServiceWorker`, `createUpdateNotice` (the update notice's store, with no React and no singleton), and the web app manifest (`webAppManifest`, `manifestHref`, `manifestLanguage`, `MANIFEST_PATH`, `MANIFEST_HEADERS`).
  
  Add `@alxia/react-router/pwa/react`, the page's hooks, whose only package import is `react` (an optional peer, `^19`): `useOnline`, `useServiceWorker({ enabled })` (the app passes `enabled`, such as `import.meta.env.PROD`; the package never reads it) and `useUpdateNotice`, with `updateNotice`, the page's one store; `useServiceWorker` reads its options when its effect runs and registers no cleanup.
  
  Add `@alxia/react-router/pwa/server`, whose only package import is `@alxia/core`: `noCache`, the middleware that serves the worker's script with `Cache-Control: no-cache` and the worker's policy (declare it with `createServer({ beforeAll })`, before the client's files), `revalidated(response, policy?)` and `WORKER_POLICY`.
  
  The package's guide moved from `docs/guide.md` to `docs/guide/`, one page per topic, and `docs/guide.md` keeps the old section anchors that links use, each pointing to its new page.

## 0.8.1

### Patch Changes

- Updated dependencies [[`6d3ab24`](https://github.com/softistx/alxia/commit/6d3ab24f06ab3d0a9c0febfb2e0507f6f1022421)]:
  - @alxia/core@0.15.0

## 0.8.0

### Minor Changes

- [#229](https://github.com/softistx/alxia/pull/229) [`5970afd`](https://github.com/softistx/alxia/commit/5970afd4c99bf048297077f1ae7ce36590c18a7e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Under `react-router dev` and `vite preview`, a loader's or an action's `alxiaOf(context).server` (core's `ctx.server`) is now the `Bun.Server` the plugin relays the app's sockets to, on a loopback port, rather than `undefined`: an action's `server.publish(topic, data)` reaches the app's WebSocket subscribers in dev as from the build. Its `url` is that loopback port's, and `requestIP` and `timeout` know nothing of a request Vite took, so `ctx.ip` stays `undefined` there as before.
  
  Add `context.alxia`, the shorthand for `alxiaOf(context)`: the package augments React Router's `RouterContextProvider` with a read-only `alxia`, typed by its `Register` (core's, then `BaseContext`, with none). It is a getter that reads `alxiaContext`, so it is set exactly when that key is, and on a provider no catch-all filled it throws `alxiaOf`'s error. It is typed with `LoaderFunctionArgs` and `ActionFunctionArgs` from `react-router`; with the generated `Route.LoaderArgs` it works at runtime but `tsc` reports TS2339, because react-router's `./internal` types point at a second declaration of the class, so `withAlxia` or `alxiaOf(context)` is the form there. `AlxiaContextOf<App>` names what `alxiaOf<App>(context)` returns.
  
  Add `withAlxia(fn)`: a loader, an action or a middleware given `alxia`, the alxia context, beside React Router's arguments, typed by `Register` (or the server `AlxiaArgs<typeof server>` names) even under the generated `Route.LoaderArgs`: `export const loader = withAlxia(({ alxia, params }: Route.LoaderArgs & AlxiaArgs) => …)`. It returns a function of React Router's arguments alone, with `fn`'s return type, so the page's `loaderData` and `actionData` are still inferred; a middleware's `next` is passed on, and outside alxia it throws `alxiaOf`'s error. New types `AlxiaArgs<App>` and `ProviderLike`.

### Patch Changes

- [#231](https://github.com/softistx/alxia/pull/231) [`02421e6`](https://github.com/softistx/alxia/commit/02421e678997db30d65abda5579a361aa5116ab2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The upgrading guide and the roadmap name 0.14.2 and 0.8.0.
- Updated dependencies [[`5970afd`](https://github.com/softistx/alxia/commit/5970afd4c99bf048297077f1ae7ce36590c18a7e), [`02421e6`](https://github.com/softistx/alxia/commit/02421e678997db30d65abda5579a361aa5116ab2)]:
  - @alxia/core@0.14.2

## 0.7.5

### Patch Changes

- Updated dependencies [[`71411e2`](https://github.com/softistx/alxia/commit/71411e26dd0d729bf16e10be6f43b1fa6726f6c8), [`3ed7f8e`](https://github.com/softistx/alxia/commit/3ed7f8e7df3dd3e9d97b38e004ee831055ebe163)]:
  - @alxia/core@0.14.0

## 0.7.4

### Patch Changes

- Updated dependencies [[`5d7438a`](https://github.com/softistx/alxia/commit/5d7438afa0909630611d3f0661bd012834760fb6), [`9de1c30`](https://github.com/softistx/alxia/commit/9de1c30e0ba8ab4cb20d38a5f5a14293726e9468), [`b4195c0`](https://github.com/softistx/alxia/commit/b4195c0518ce2c5c8c68181e5cb3de67890c2ae8)]:
  - @alxia/core@0.13.0

## 0.7.3

### Patch Changes

- Updated dependencies [[`4eac9ea`](https://github.com/softistx/alxia/commit/4eac9ea56b3ad3eb50a5cec27128ae3fce7c65ff), [`d462fd7`](https://github.com/softistx/alxia/commit/d462fd7bf5ddf4fd4601a5e146fa267d5df74297)]:
  - @alxia/core@0.12.0

## 0.7.2

### Patch Changes

- Updated dependencies [[`79fbd81`](https://github.com/softistx/alxia/commit/79fbd81a9e1d9e72cbd9d733085fbc8d73d3ed72), [`c7c994a`](https://github.com/softistx/alxia/commit/c7c994a48eeaa4b069bc81e0eeb73aa7217dd12e)]:
  - @alxia/core@0.11.0

## 0.7.1

### Patch Changes

- Updated dependencies [[`3385725`](https://github.com/softistx/alxia/commit/33857253e8a67fc33f39884d58bdd55377ae2915), [`da95f24`](https://github.com/softistx/alxia/commit/da95f24391b942db81c082c253aeeaa5fcade07b)]:
  - @alxia/core@0.10.0

## 0.7.0

### Minor Changes

- [#190](https://github.com/softistx/alxia/pull/190) [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Hand React Router its request at `originalUrl(ctx)`: behind a proxy the app trusts (`alxia({ proxy: trustProxy(…) })`), `request.url` in a loader or an action is the scheme and host the client asked for. `createServer({ proxy })` passes the option to the app it makes.

### Patch Changes

- Updated dependencies [[`86af86e`](https://github.com/softistx/alxia/commit/86af86e9c73dbc5084a468113de1ec98207cfdf0), [`17d28fe`](https://github.com/softistx/alxia/commit/17d28fe08a73e4c549f04b98411364ff5c6715f5), [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579)]:
  - @alxia/core@0.9.0

## 0.6.3

### Patch Changes

- [#181](https://github.com/softistx/alxia/pull/181) [`f76d073`](https://github.com/softistx/alxia/commit/f76d0738fe3d715ebd1aa15c3f9f7bf7327062b4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: update link to openapi prefix guide after docs restructure.
- Updated dependencies [[`89aa1df`](https://github.com/softistx/alxia/commit/89aa1df408840165fca6eb189aabedc3fee498ba), [`4a6df2b`](https://github.com/softistx/alxia/commit/4a6df2b1cfc4bf87c4f5b38a856c3157acf1e42f), [`e536262`](https://github.com/softistx/alxia/commit/e5362622a260faa3320bc1cdbd456bae07565953), [`d256d6a`](https://github.com/softistx/alxia/commit/d256d6a169bb9a532014814c3aea888fd592c762), [`9ab4a7f`](https://github.com/softistx/alxia/commit/9ab4a7fd3a62545b15f788e3c6da51ac73de2705)]:
  - @alxia/core@0.8.0

## 0.6.2

### Patch Changes

- Updated dependencies [[`28cdcfe`](https://github.com/softistx/alxia/commit/28cdcfe800ca90cfadacf48662fac0fc99b4f63b)]:
  - @alxia/core@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`137c5c8`](https://github.com/softistx/alxia/commit/137c5c8b618b961674c63a6242568e6b800939ab)]:
  - @alxia/core@0.6.0

## 0.6.0

### Minor Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core` 0.5: `reactRouter()`, `FreshApp` and `InvalidRegister` are typed by `Alxia<Ctx, Prefix>`, without the removed `Shortcuts` parameter; the docs show the single middleware form.

### Patch Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs are organised around tasks. Each README and docs index links the new "Start in 5 minutes" and the recipes of the repository (authentication, a spec-first CRUD, a GraphQL API, file uploads, SSE and WebSockets, testing, errors, health and shutdown, caching and rate limiting, deploying), whose code is type-checked. `@alxia/core`'s README names the four templates of `bun create @alxia`. `@alxia/redis`'s roadmap gains its 0.2.0 entry and says which release removed `app.plugin(idempotency(…))`, and its troubleshooting entry for a handle that wires nothing carries `@nxgt/redis` 0.5's whole message. The tables of contents of the `@alxia/env` and `@alxia/janus` troubleshooting pages link the right headings.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `start` prints `@alxia/core`'s route table in dev, and `alxia listening on <url>` otherwise; `listen: { onListen }` is given the core's `ListenInfo` and wins over the `onListen(server)` option.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The app `createServer()` makes is in dev in React Router's `development` mode alone: a production build answers a 500 without its stack, and prints no route table, whatever `NODE_ENV` says.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `start` relies on `@alxia/core`'s `listen` for `SIGINT` and `SIGTERM` rather than on handlers of its own: the same order as 0.1.2 — the handlers in place before `onListen` — with core's graceful shutdown: the requests in flight drain within `shutdownTimeout`, readiness turns 503, the `onStop` hooks run, and the process exits 0, or 1 when a hook throws.
- Updated dependencies [[`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787)]:
  - @alxia/core@0.5.0

## 0.5.0

### Minor Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `alxiaOf(context)` with no type argument reads the base `@alxia/core`'s `Register` names when this package's `Register` names no server; this package's still wins when both are declared. `RegisteredOf<R, Core>` takes that fallback as its second parameter, by default core's `RegisteredBase`.

### Patch Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the current forms throughout (`plugin(app)`, middlewares rather than the deprecated hooks), the exact compiler messages, a group's middlewares running on the requests under its prefix, and `settle` no longer swallowing an error.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs and examples give the package middlewares to `use` — `app.use(logger())`, `app.use(bearer({ jwt }))` — the request hooks being deprecated. `alxiaOf(context)` types `route` as the catch-all's `string`, `BaseContext.route` being `string | undefined` now.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs no longer name the `@alxia/openapi` that wrote a document from an app, which is retired: alxia is OpenAPI spec first, and `@alxia/openapi` is now the package that checks an app's routes against the operations generated from the document (`matchesSpec`). `isReactRouterRoute` is documented for `matchesSpec`'s `exclude`. `@alxia/core`'s upgrading guide covers the move.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs and examples mount each plugin app with `@alxia/core`'s new `app.plugin(…)` — `base.plugin(todoRoutes)`, `app.plugin(redis(client))` — `use(…)` being for middlewares, its plugin forms deprecated. `@alxia/i18n` mounts its language plugin the same way inside, and `@alxia/context-storage`'s factory, given uncalled, now says `contextStorage is a factory: use(contextStorage()), not use(contextStorage)`. `@alxia/openapi`'s guides say where `route(operation)` checks replies: the handler's, just before it, a middleware's reply sent as it is, unless `responds(operation)` stands among the middlewares.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Typed against `@alxia/core`'s `Alxia<Ctx, Prefix, Shortcuts>`, which has no route table any more: `session()`, `secureHeaders({ nonce: true })`, `contextStorage()`, `graphql()`, `reactRouter()` and `FreshApp` drop its `Routes` argument. `@alxia/graphql` no longer exports `GraphQLRoutes`, the route table entry of its endpoint.

- [#128](https://github.com/softistx/alxia/pull/128) [`fed8a44`](https://github.com/softistx/alxia/commit/fed8a44f6c97380d2cbca42eab1e77d05e60e08d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The README and guide start a new app with `bun create @alxia my-app --template react-router`, which writes the official template with alxia already set up; adding alxia to an existing app follows.
- Updated dependencies [[`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd)]:
  - @alxia/core@0.4.0

## 0.4.0

### Minor Changes

- [#115](https://github.com/softistx/alxia/pull/115) [`5da0f5e`](https://github.com/softistx/alxia/commit/5da0f5e1e5c715c12aa1d789c370b73d229b5147) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `react-router build` now bundles every package into `build/server/index.js`, React, React Router and alxia included: the `ssr` environment gets `resolve.noExternal: true` in the build, never in dev. `build/` runs on Bun with no `node_modules`, so a Docker image's final stage copies it alone. What the app sets wins: `ssr.external: ['sharp']` keeps those packages external, and `ssr.external: true` keeps every package external, as before.

## 0.3.0

### Minor Changes

- [#112](https://github.com/softistx/alxia/pull/112) [`c808d83`](https://github.com/softistx/alxia/commit/c808d836381bbcfb6a05b921483bfb088a1eb909) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `alxia()` now builds the server for Bun, with nothing to configure. In Vite's `ssr` environment, under `react-router dev` and `react-router build`, it adds the `bun` export condition to `resolve.conditions` and `resolve.externalConditions`, so a package that exports a `bun` variant is bundled, and loaded in dev, as that variant; adds `bun` and `bun:*` to `resolve.builtins`, so Bun's own modules stay imports of `build/server/index.js` whichever runtime runs Vite; and sets `build.target` to `esnext`. What the app sets is kept: its own conditions and builtins are merged with these, and a `build.target` it set, at the top level or on the environment, wins. An app that sets `ssr.target: 'webworker'` itself gets none of this. The guide has a Built for Bun section, and Deploying a multi-stage `Dockerfile` on `oven/bun:1`.

## 0.2.0

### Minor Changes

- [#101](https://github.com/softistx/alxia/pull/101) [`27aa8a7`](https://github.com/softistx/alxia/commit/27aa8a744941e10c7ca2600653a3bb67129b3ee8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `nonceOf(loadContext)` reads the request's CSP nonce in `entry.server.tsx`: the `nonce` that `@alxia/secure-headers`' `nonce: true`, or a `derive` of the app's own, put on the context, or `undefined`. Passed to `<ServerRouter nonce>` and React's renderer, it lands on every script the page renders. Neither package depends on the other.

### Patch Changes

- Updated dependencies [[`56ffcb9`](https://github.com/softistx/alxia/commit/56ffcb93a5155568ec002ab6fee332369bac3f30), [`a01ebed`](https://github.com/softistx/alxia/commit/a01ebed5745c5f863193f54bea8172abf51df85b), [`c9d43b7`](https://github.com/softistx/alxia/commit/c9d43b78f5ea9137e9ba56621e7ad89095621cff), [`f9a0ae7`](https://github.com/softistx/alxia/commit/f9a0ae7de698a63a94bb4aa4dfc2af33303827f2), [`8beb606`](https://github.com/softistx/alxia/commit/8beb606f81aa02bbdd068a674fa13385c4e52183)]:
  - @alxia/core@0.3.0

## 0.1.2

### Patch Changes

- [#91](https://github.com/softistx/alxia/pull/91) [`f5ac506`](https://github.com/softistx/alxia/commit/f5ac5061ab624351ae5987842e7f3cb57c868ad9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `start` now calls `onListen`, or prints `alxia listening on …`, only after its `SIGINT` and `SIGTERM` handlers are in place. Before, a supervisor that sent `SIGTERM` as soon as it read that line could kill the process (exit 143) before any `onStop` hook ran.
- Updated dependencies [[`69c815c`](https://github.com/softistx/alxia/commit/69c815c17ed26067b39ca5c731c48396f4da6377)]:
  - @alxia/core@0.2.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`d0eaf4a`](https://github.com/softistx/alxia/commit/d0eaf4a21354ae86f5ec6959cb06e796e750d086), [`26ea5c1`](https://github.com/softistx/alxia/commit/26ea5c1e985ac7fcb819b10fc4d847f7b55f9709), [`eab8ca4`](https://github.com/softistx/alxia/commit/eab8ca4eff8ab407abe3801d15e4f5c6df23a735)]:
  - @alxia/core@0.2.0

## 0.1.0

### Minor Changes

- [`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce) The first release of alxia: a zero-dependency, type-safe HTTP framework for Bun, its typed client, its OpenAPI document, its Zod and GraphQL Yoga integrations, its plugins, and its adapters to the nxgt suite: telemetry, Redis and janus.

### Patch Changes

- Updated dependencies [[`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce)]:
  - @alxia/core@0.1.0
