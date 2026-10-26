# Troubleshooting

Each entry is headed by the text you see: an error thrown at startup or in
a loader, a message React Router or the browser prints, or an error from
`tsc`. Paths, route ids and types in a message are the app's own, written
`…` below. A trap that prints nothing is under [Traps](#traps), by symptom.

**Thrown or printed**

- [`alxia-react-router: … is running on Node, and alxia's server runs on Bun. …`](#alxia-react-router--is-running-on-node-and-alxias-server-runs-on-bun-)
- [`alxia-react-router: react-router build with a service worker is running on Node, and the worker is bundled by Bun.build`](#alxia-react-router-react-router-build-with-a-service-worker-is-running-on-node-and-the-worker-is-bundled-by-bunbuild)
- [`ReferenceError: Bun is not defined`](#referenceerror-bun-is-not-defined)
- [`alxiaOf(): this request has no alxia context. …`](#alxiaof-this-request-has-no-alxia-context-)
- [`TypeError: undefined is not an object (evaluating 'context.alxia.user')`](#typeerror-undefined-is-not-an-object-evaluating-contextalxiauser)
- [`Error: No value found for context`](#error-no-value-found-for-context)
- [`alxia-react-router: … must export createServer() from @alxia/react-router as its default export: …`](#alxia-react-router--must-export-createserver-from-alxiareact-router-as-its-default-export-)
- [`alxia-react-router: the entry … does not exist. …`](#alxia-react-router-the-entry--does-not-exist-)
- [`alxia-react-router: the worker … does not exist. …`](#alxia-react-router-the-worker--does-not-exist-)
- [`alxia-react-router: React Router's Vite plugin is not in this config. …`](#alxia-react-router-react-routers-vite-plugin-is-not-in-this-config-)
- [`alxia-react-router: serverBundles splits React Router's server build in several, and alxia serves one. …`](#alxia-react-router-serverbundles-splits-react-routers-server-build-in-several-and-alxia-serves-one-)
- [`alxia-react-router: Vite's ssr environment does not run modules in this process, so the server cannot be loaded.`](#alxia-react-router-vites-ssr-environment-does-not-run-modules-in-this-process-so-the-server-cannot-be-loaded)
- [`alxia-react-router: a WebSocket upgrade failed: …`](#alxia-react-router-a-websocket-upgrade-failed-)
- [`The React Router Vite plugin requires the use of a Vite config file`](#the-react-router-vite-plugin-requires-the-use-of-a-vite-config-file)
- [`No route matches URL "/assets/…"`](#no-route-matches-url-assets)
- [``You made a POST request to "/" but did not provide an `action` for route "root", so there is no way to handle the request.``](#you-made-a-post-request-to--but-did-not-provide-an-action-for-route-root-so-there-is-no-way-to-handle-the-request)
- [`TypeError: reactRouter(): client is …, which is not a directory. …`](#typeerror-reactrouter-client-is--which-is-not-a-directory-)
- [`TypeError: reactRouter(): … cannot be served at a path of its own name; rename it. …`](#typeerror-reactrouter--cannot-be-served-at-a-path-of-its-own-name-rename-it-)
- [`Refused to execute inline script because it violates the following Content Security Policy directive: "default-src 'none'"`](#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-default-src-none)
- [`Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self' 'nonce-…'"`](#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-script-src-self-nonce-)
- [`A tree hydrated but some attributes of the server rendered HTML didn't match the client properties`](#a-tree-hydrated-but-some-attributes-of-the-server-rendered-html-didnt-match-the-client-properties)
- [`A tree hydrated but some attributes of the server rendered HTML didn't match the client properties` on a `<style>` with a `nonce`](#a-tree-hydrated-but-some-attributes-of-the-server-rendered-html-didnt-match-the-client-properties-on-a-style-with-a-nonce)
- [`useNonce()` is undefined on the server](#usenonce-is-undefined-on-the-server)
- [`TypeError: InlineScript(): the code contains "</script" or "<!--", which ends or confuses the script element; escape it, such as "<\/script" inside a string`](#typeerror-inlinescript-the-code-contains-script-or----which-ends-or-confuses-the-script-element-escape-it-such-as-script-inside-a-string)
- [`TypeError: createPageLanguage(): the fallback … is not one of the languages; got ….`](#typeerror-createpagelanguage-the-fallback--is-not-one-of-the-languages-got-)
- [The error page shows in the fallback language](#the-error-page-shows-in-the-fallback-language)
- [`Error: You must render this element inside a <HydratedRouter> element`](#error-you-must-render-this-element-inside-a-hydratedrouter-element)
- [`alxia-react-router: … already exists, and reveal leaves it as it is. Run alxia-react-router reveal --force to overwrite it.`](#alxia-react-router--already-exists-and-reveal-leaves-it-as-it-is-run-alxia-react-router-reveal---force-to-overwrite-it)
- [`alxia-react-router: no vite.config.ts in …. Run reveal from the app's root, beside vite.config.ts.`](#alxia-react-router-no-viteconfigts-in--run-reveal-from-the-apps-root-beside-viteconfigts)
- [`alxia-react-router: … gives alxia() an entry reveal cannot read. …`](#alxia-react-router--gives-alxia-an-entry-reveal-cannot-read-)
- [`alxia-react-router: … computes appDirectory, which reveal cannot read. …`](#alxia-react-router--computes-appdirectory-which-reveal-cannot-read-)
- [`alxia-react-router: unknown command ….`](#alxia-react-router-unknown-command-)
- [`alxia-react-router: unknown option … for reveal.`](#alxia-react-router-unknown-option--for-reveal)
- [`error: GET https://registry.npmjs.org/alxia-react-router - 404`](#error-get-httpsregistrynpmjsorgalxia-react-router---404)
- [`alxia-react-router: build/server/index.js does not exist. Run react-router build before vite preview.`](#alxia-react-router-buildserverindexjs-does-not-exist-run-react-router-build-before-vite-preview)
- [`alxia-react-router: build/server/index.js is not alxia's server: its default export has no fetch. …`](#alxia-react-router-buildserverindexjs-is-not-alxias-server-its-default-export-has-no-fetch-)
- [`warn: incorrect peer dependency "typescript@5.9.3"`](#warn-incorrect-peer-dependency-typescript593)
- [`Module "…" has been externalized for browser compatibility, imported by "…"`](#module--has-been-externalized-for-browser-compatibility-imported-by-)
- [`error: lockfile had changes, but lockfile is frozen`](#error-lockfile-had-changes-but-lockfile-is-frozen)
- [`EACCES: permission denied, open '/app/…'`](#eacces-permission-denied-open-app)
- [`error: Cannot find package '…' from '/app/build/server/index.js'`](#error-cannot-find-package--from-appbuildserverindexjs)
- [`TypeError: defineWorkerContract(): cachePrefix must be a non-empty name, …`](#typeerror-defineworkercontract-cacheprefix-must-be-a-non-empty-name-)
- [`TypeError: defineWorkerContract(): cacheVersion must be a non-empty name without '-', …`](#typeerror-defineworkercontract-cacheversion-must-be-a-non-empty-name-without---)
- [`parseBrowserManifest(): not React Router's browser manifest …`](#parsebrowsermanifest-not-react-routers-browser-manifest-)
- [`error: Cannot find package 'react' from '…/@alxia/react-router/dist/pwa/react/index.js'`](#error-cannot-find-package-react-from-alxiareact-routerdistpwareactindexjs)
- [`error: Cannot find package 'isbot' from '…/@alxia/react-router/dist/entry/index.js'`](#error-cannot-find-package-isbot-from-alxiareact-routerdistentryindexjs)
- [`startWorker(): no precache list. …`](#startworker-no-precache-list-)
- [`TypeError: startWorker(): contract is required: …`](#typeerror-startworker-contract-is-required-)
- [`error: Could not resolve: "workbox-core". Maybe you need to "bun install"?`](#error-could-not-resolve-workbox-core-maybe-you-need-to-bun-install)
- [`buildWorker() runs on Bun: it is running on Node`](#buildworker-runs-on-bun-it-is-running-on-node)
- [`buildWorker(): app/service-worker.ts does not exist.`](#buildworker-appservice-workerts-does-not-exist)
- [`buildWorker(): expected one React Router browser manifest`](#buildworker-expected-one-react-router-browser-manifest)
- [`buildWorker(): build/client/offline.html does not exist`](#buildworker-buildclientofflinehtml-does-not-exist)
- [`buildWorker(): … is outside ….`](#buildworker--is-outside-)
- [`buildWorker(): Bun.build failed:`](#buildworker-bunbuild-failed)
- [`Cross-site request refused`](#cross-site-request-refused)
- [`Expected a JSON body`](#expected-a-json-body)
- [`Malformed JSON body`](#malformed-json-body)
- [`The form sent an input the API would refuse`](#the-form-sent-an-input-the-api-would-refuse)
- [`alxia-react-router: the error catalogue (…) was not read`](#alxia-react-router-the-error-catalogue--was-not-read)
- [`alxia-react-router: the error catalogue was not checked, keeping what is held`](#alxia-react-router-the-error-catalogue-was-not-checked-keeping-what-is-held)
- [`alxia-react-router: the error catalogue was not warmed`](#alxia-react-router-the-error-catalogue-was-not-warmed)
- [`alxia-react-router: ttlMs threw, using retryMs`](#alxia-react-router-ttlms-threw-using-retryms)
- [`alxia-react-router: ttlMs is not a duration, using retryMs`](#alxia-react-router-ttlms-is-not-a-duration-using-retryms)
- [`TypeError: createErrorCatalogue(): needs at least one language.`](#typeerror-createerrorcatalogue-needs-at-least-one-language)
- [`<api>: <operation> (request <id>) answered <status> <code>`](#api-operation-request-id-answered-status-code)
- [`<api>: <operation> (request <id>) answered <status> without GraphQL`](#api-operation-request-id-answered-status-without-graphql)
- [`<api>: <operation> (request <id>) unreachable`, `timeout` or `invalid-response`](#api-operation-request-id-unreachable-timeout-or-invalid-response)
- [`<api>: <operation> (request <id>) aborted`](#api-operation-request-id-aborted)
- [`TypeError: sessionCookies(): the … name "…" is not a cookie name (an RFC 6265 token: …). Pass a name such as "my-app_session".`](#typeerror-sessioncookies-the--name--is-not-a-cookie-name-an-rfc-6265-token--pass-a-name-such-as-my-app_session)
- [`TypeError: sessionCookies(): the … name "…" already carries a prefix. Pass the base name: the package adds __Host- (session) or __Secure- (challenge) when secure is true.`](#typeerror-sessioncookies-the--name--already-carries-a-prefix-pass-the-base-name-the-package-adds-__host--session-or-__secure--challenge-when-secure-is-true)
- [`TypeError: sessionCookies(): challengeSeconds must be a positive integer; got ….`](#typeerror-sessioncookies-challengeseconds-must-be-a-positive-integer-got-)
- [`TypeError: sessionCookies(): challengePath must start with "/"; got ….`](#typeerror-sessioncookies-challengepath-must-start-with--got-)

**Types**

- [`Property 'alxia' does not exist on type 'Readonly<RouterContextProvider>'`](#property-alxia-does-not-exist-on-type-readonlyroutercontextprovider)
- [`Property '…' does not exist on type 'BaseContext & …'`](#property--does-not-exist-on-type-basecontext--)
- [`Type '…' does not satisfy the constraint 'AnyAlxia | ReactRouterServer<AnyAlxia>'`](#type--does-not-satisfy-the-constraint-anyalxia--reactrouterserveranyalxia)
- [`Type '(app: …) => void' is not assignable to type '(app: …) => AnyAlxia'`](#type-app---void-is-not-assignable-to-type-app---anyalxia)
- [`Property '…' does not exist on type 'BaseContext & { readonly 'Register.server must be typeof server, the default export of createServer()': never; }'`](#property--does-not-exist-on-type-basecontext---readonly-registerserver-must-be-typeof-server-the-default-export-of-createserver-never-)
- [`Subsequent property declarations must have the same type. Property 'server' must be of type …`](#subsequent-property-declarations-must-have-the-same-type-property-server-must-be-of-type-)
- [`Type '{ …; nonce: string | undefined; }' is not assignable to type 'ServerRouterProps' with 'exactOptionalPropertyTypes: true'`](#type---nonce-string--undefined--is-not-assignable-to-type-serverrouterprops-with-exactoptionalpropertytypes-true)

**Traps**

- [`bun build/server/index.js` exits at once, printing nothing](#bun-buildserverindexjs-exits-at-once-printing-nothing)
- [A script of the page has no nonce](#a-script-of-the-page-has-no-nonce)
- [A loader reads `null` from the app's own key](#a-loader-reads-null-from-the-apps-own-key)
- [A page answers alxia's JSON 404 or 405 instead of rendering](#a-page-answers-alxias-json-404-or-405-instead-of-rendering)
- [A streamed page arrives in one piece](#a-streamed-page-arrives-in-one-piece)
- [The logger times a streamed page at a few milliseconds](#the-logger-times-a-streamed-page-at-a-few-milliseconds)
- [A page, or a missing path, answers 401 behind a guard](#a-page-or-a-missing-path-answers-401-behind-a-guard)
- [The logger, CORS or secure headers miss the client's files](#the-logger-cors-or-secure-headers-miss-the-clients-files)
- [A `page()` is not served under `react-router dev`](#a-page-is-not-served-under-react-router-dev)
- [A `publish` under `react-router dev` misses the sockets opened before an edit](#a-publish-under-react-router-dev-misses-the-sockets-opened-before-an-edit)
- [The build has a package's Node variant, not its `bun` one](#the-build-has-a-packages-node-variant-not-its-bun-one)
- [`request.url` in a loader is `http://` and the internal host behind a proxy](#requesturl-in-a-loader-is-http-and-the-internal-host-behind-a-proxy)
- [An unhashed file under `public/assets/` is cached for a year](#an-unhashed-file-under-publicassets-is-cached-for-a-year)
- [A cache the contract did not make is swept](#a-cache-the-contract-did-not-make-is-swept)
- [The update notice never shows](#the-update-notice-never-shows)
- [The worker registers under `react-router dev`](#the-worker-registers-under-react-router-dev)
- [The service worker is not built](#the-service-worker-is-not-built)
- [Offline, a client navigation to a route never visited shows the offline page](#offline-a-client-navigation-to-a-route-never-visited-shows-the-offline-page)
- [An update waits an hour](#an-update-waits-an-hour)
- [The worker cannot fetch another origin](#the-worker-cannot-fetch-another-origin)
- [The manifest is in the wrong language](#the-manifest-is-in-the-wrong-language)
- [A form's own check shows the code (`todos.errors.…`) instead of words](#a-forms-own-check-shows-the-code-todoserrors-instead-of-words)
- [A message shows its `{braces}`](#a-message-shows-its-braces)
- [A refusal shows the API's raw message](#a-refusal-shows-the-apis-raw-message)
- [`apiRefusal` returns undefined](#apirefusal-returns-undefined)
- [The error page shows no request id](#the-error-page-shows-no-request-id)
- [An action shows the error page](#an-action-shows-the-error-page)
- [Behind a TLS proxy every action answers 403](#behind-a-tls-proxy-every-action-answers-403)
- [Right after start, refusals read in the API's words](#right-after-start-refusals-read-in-the-apis-words)
- [Sign-in loops on `http://localhost` in Safari](#sign-in-loops-on-httplocalhost-in-safari)
- [A `__Host-` cookie is dropped](#a-__host--cookie-is-dropped)

## Thrown or printed

### `alxia-react-router: … is running on Node, and alxia's server runs on Bun. …`

**When:** `bun run dev`, `vite preview`, or a `react-router build` that
prerenders or builds a service worker (`app/service-worker.ts`), on a machine
where a node is installed. The full message under `react-router dev`:

```
alxia-react-router: react-router dev is running on Node, and alxia's server runs on Bun. Add a bunfig.toml beside package.json with "[run]" and "bun = true", so bun run starts it on Bun, or run it as bun --bun react-router dev.
```

**Why:** the `react-router` and `vite` CLIs start with
`#!/usr/bin/env node`. `bun run` honours that line when a node is on the
`PATH`, so the dev server, and alxia's server inside it, run on Node,
where `Bun` does not exist.

**Fix:** a `bunfig.toml` beside `package.json`, so `bun run` starts every
script on Bun:

```toml
[run]
bun = true
```

Or run the one command on Bun: `bun --bun react-router dev`. Under
`vite preview` or a prerendering build, the message begins
`alxia-react-router: vite preview, or a react-router build that prerenders, is running on Node`
and names `bun --bun vite preview` and `bun --bun react-router build`. A
build that has a service worker reads
`alxia-react-router: react-router build with a service worker is running on Node, and the worker is bundled by Bun.build`
and names the same `bun --bun react-router build`.

### `alxia-react-router: react-router build with a service worker is running on Node, and the worker is bundled by Bun.build`

The same cause as
[the entry above](#alxia-react-router--is-running-on-node-and-alxias-server-runs-on-bun-):
the build runs on Node, and the worker is bundled with `Bun.build`. Run it as
`bun --bun react-router build`, or add a `bunfig.toml` beside `package.json`
with `[run]` and `bun = true`.

### `ReferenceError: Bun is not defined`

**When:** the first request to a page, with a stack through the app's
own code or alxia's, from a server running on Node that the plugin did
not start, so it could not refuse it: `node build/server/index.js`, or a
`start` script that runs one.

**Fix:** run the server on Bun: `bun build/server/index.js`. Under
`react-router dev` or `vite preview`, the plugin refuses Node at startup
with [the entry above](#alxia-react-router--is-running-on-node-and-alxias-server-runs-on-bun-).

### `alxiaOf(): this request has no alxia context. …`

```text
Error: alxiaOf(): this request has no alxia context. Serve the React Router app through alxia: add alxia() from @alxia/react-router/vite to vite.config.ts's plugins, or, with a server of your own, serve the build through reactRouter() from @alxia/react-router.
```

**When:** a loader calls `alxiaOf`, or reads `context.alxia`, and
`alxiaContext` was not set. `context.alxia` throws the same error: it reads
that key. With two copies of `@alxia/react-router` in one process (the
third case below), the getter is the copy loaded last, which reads its own
key: one copy is the fix for both.

**Why:** one of three:

- the request did not go through alxia: `vite.config.ts` has no `alxia()`,
  the build runs under `react-router-serve`, or a unit test calls the
  loader with a bare `RouterContextProvider`;
- a server of your own, without the plugin, serves the build without
  `reactRouter()`;
- a server of your own, without the plugin, in a monorepo: the server
  build holds **its own copy** of `@alxia/react-router`. Vite leaves a
  package external only when it resolves under `node_modules` to a `.js`
  file. A package linked from a workspace (`workspace:^`, `bun link`)
  resolves to its folder, outside `node_modules`, and Vite bundles it into
  `build/server/index.js` with a second `alxiaContext` the server never
  sets.

**Fix:** add `alxia()` to `vite.config.ts`, as in the
[setup](guide/getting-started.md). With a server of your own in a monorepo, tell
Vite to leave the package external:

```ts
// vite.config.ts
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	ssr: { external: ['@alxia/react-router'] },
	plugins: [reactRouter()],
});
```

`grep '@alxia/react-router' build/server/index.js` should show an
`import … from "@alxia/react-router"` line, not the package's code. In a
unit test, set the key yourself:

```ts
import { alxiaContext } from '@alxia/react-router';
import { RouterContextProvider } from 'react-router';

const context = new RouterContextProvider();
context.set(alxiaContext, { user: { name: 'Ada' } });
await loader({ context, request: new Request('http://localhost/'), params: {} } as never);
```

### `TypeError: undefined is not an object (evaluating 'context.alxia.user')`

**When:** a unit test calls a loader that reads `context.alxia` with a
`new RouterContextProvider()`, and nothing in the test imports
`@alxia/react-router`; destructured, `const { user } = context.alxia` fails
with `TypeError: Cannot destructure property 'user' from null or undefined
value`. A `clientLoader` or a `clientAction` reading it fails the same way
in the browser.

**Why:** `context.alxia` is a getter `@alxia/react-router` defines on React
Router's provider when it is first imported. The loader's module need not
import it, and the browser never loads it: the alxia context is the
server's.

**Fix:** in the test, set the key the getter reads, imported from
`@alxia/react-router`, which installs the getter:

```ts
import { alxiaContext } from '@alxia/react-router';
import { RouterContextProvider } from 'react-router';

const context = new RouterContextProvider();
context.set(alxiaContext, { user: { name: 'Ada' }, server: undefined });
await loader({ context, request: new Request('http://localhost/'), params: {} } as never);
```

On the client, read the data the server's loader returned instead.

### `Error: No value found for context`

**When:** a loader, action or middleware calls `context.get(key)` with a
key made by `createContext()` with no default value, in a file under
`app/`, and a server of your own, without the plugin, set it in
`getLoadContext`.

**Why:** `react-router build` bundles `app/context.ts` into
`build/server/index.js`. A server outside the build, which imports
`app/context.ts` itself, holds another `createContext()` object. React
Router matches keys by identity, so that server's
`context.set(userContext, user)` sets a key the loaders never read.

```ts
// server.ts, without the plugin: the trap
import { userContext } from './app/context'; // not the build's copy
reactRouter(app, { build, getLoadContext: ({ user }, context) => context.set(userContext, user) });
```

**Fix:** serve the app with the plugin, `alxia()` in `vite.config.ts`: the
server is then built with the routes, and `app/context.ts` is one module
for both, in dev and in the build. See
[the app's own context keys](guide/typing-the-loaders.md#the-apps-own-context-keys).

Without the plugin, read alxia's context with `alxiaOf`: its key,
`alxiaContext`, lives in this package under `node_modules`, which Vite
leaves external, so the build and the server load one module. A key
exported by a package installed under `node_modules` (`@acme/session`)
works for the same reason.

### `alxia-react-router: … must export createServer() from @alxia/react-router as its default export: …`

```text
TypeError: alxia-react-router: app/server.ts must export createServer() from @alxia/react-router as its default export: export default createServer({ … }).
```

Under `react-router dev`, Vite's error page shows it, and the request is a
500. In a build, `bun build/server/index.js` throws it at startup.

**When:** the server file has no default export, or its default is not
what `createServer()` returns: an alxia app, a named `export const server`,
or the options object itself.

**Why:** the plugin makes the app with the default export's `create`, and
listens with its `start`.

**Fix:** export the server as the default:

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';

const server = createServer({ configure: (app) => app });
export default server;
```

An alxia app of your own, with `reactRouter()` on it, is served without the
plugin: see [a server of your own](guide/customising-the-server.md#a-server-of-your-own-without-the-plugin).

### `alxia-react-router: the entry … does not exist. …`

```text
Error: alxia-react-router: the entry server/main.ts does not exist. Create it, or leave entry out to use app/server.ts, or the default server without it.
```

**When:** `alxia({ entry })` names a file that is not there, relative to
Vite's root. Under `react-router dev` each request is a 500 saying so;
`react-router build` fails.

**Why:** a missing `app/server.ts` falls back to the default server, but an
`entry` you named is taken as meant.

**Fix:** correct the path, or leave `entry` out.

### `alxia-react-router: the worker … does not exist. …`

```text
Error: alxia-react-router: the worker app/pwa/worker.ts does not exist. Create it, or leave worker out to build app/service-worker.ts when it exists.
```

**When:** `alxia({ worker })` names a file that is not there, relative to
Vite's root, and `react-router build` fails.

**Why:** a missing `app/service-worker.ts` just means no worker, but a
`worker` you named is taken as meant.

**Fix:** correct the path, or leave `worker` out.

### `alxia-react-router: React Router's Vite plugin is not in this config. …`

```text
Error: alxia-react-router: React Router's Vite plugin is not in this config. Add reactRouter() from @react-router/dev/vite beside alxia() in vite.config.ts.
```

**When:** Vite starts, for `react-router dev`, `react-router build` or
`vite`, with `alxia()` and no `reactRouter()`.

**Why:** the plugin reads React Router's config (the app directory, the
build directory, the server build's file name) from React Router's own
plugin.

**Fix:** list both, in any order:

```ts
// vite.config.ts
import { alxia } from '@alxia/react-router/vite';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [reactRouter(), alxia()] });
```

### `alxia-react-router: serverBundles splits React Router's server build in several, and alxia serves one. …`

```text
Error: alxia-react-router: serverBundles splits React Router's server build in several, and alxia serves one. Remove serverBundles from react-router.config.ts.
```

**When:** `react-router.config.ts` sets `serverBundles`.

**Why:** the plugin builds one server, `build/server/index.js`, with React
Router's build inside it. Server bundles make several, each its own
`index.js`.

**Fix:** remove `serverBundles`. One alxia server serves every route.

### `alxia-react-router: Vite's ssr environment does not run modules in this process, so the server cannot be loaded.`

**When:** under `react-router dev`, Vite's `ssr` environment is not a
runnable one: another plugin replaced it with an environment that runs
elsewhere, such as a worker runtime.

**Why:** the plugin loads the server with the `ssr` environment's module
runner, in Vite's own process, where Bun runs the app. The check reads the
environment's `runner` itself, so an app whose Vite is another copy than
the one this package was tested with passes it.

**Fix:** drop the plugin that replaces the `ssr` environment. alxia runs
under Bun, not in a worker runtime.

### `alxia-react-router: a WebSocket upgrade failed: …`

Printed by Vite's logger, followed by the error's stack.

**When:** under `react-router dev`, a client opens a WebSocket to the app,
and loading the server throws: `app/server.ts`, or a module it imports,
throws when it runs or does not compile, or the plugin itself fails (the
prefix is then followed by its own message, such as `Vite's ssr
environment does not run modules in this process`). Under `vite preview`,
the built server failed to load: the prefix is followed by
[`… does not exist. Run react-router build before vite preview.`](#alxia-react-router-buildserverindexjs-does-not-exist-run-react-router-build-before-vite-preview)
or [`… is not alxia's server: …`](#alxia-react-router-buildserverindexjs-is-not-alxias-server-its-default-export-has-no-fetch-),
whose fixes apply. The client's handshake gets a `500`, and no socket.

**Why:** the plugin loads the server, through Vite's SSR runner, on each
upgrade as on each request, so that an edit is used from the next
connection. An HTTP request with the same error goes to Vite's error
page; an upgrade has no page to show, so the error is printed.

**Fix:** fix the error the stack names. The next connection loads the
server again, with no restart.

### `The React Router Vite plugin requires the use of a Vite config file`

React Router's Vite plugin throws it.

**When:** a script or a test starts Vite with `createServer({
configFile: false, plugins: [alxia(), reactRouter()] })`.

**Why:** React Router's plugin reads its options from a config file, and
refuses inline ones.

**Fix:** write the config to a file, and point `configFile` at it:

```ts
import { createServer } from 'vite';

const server = await createServer({
	root,
	configFile: `${root}/vite.config.ts`,
	server: { port: 0 },
});
await server.listen();
```

### `No route matches URL "/assets/…"`

React Router's 404 page answers every file under `/assets`.

**When:** in a build, the server runs in `development`: `createServer({
mode: 'development' })`, or a server of your own with `reactRouter(app, {
mode: 'development' })`.

**Why:** in `development` the client's files are left to Vite's dev
server, so nothing serves `build/client`, and the catch-all gets the
assets. Under the plugin the mode follows the command, `production` in a
build, whatever `NODE_ENV` says; only an explicit `mode` changes it.

**Fix:** leave `mode` out, or set it from where the server runs:

```ts
// server.ts, without the plugin
reactRouter(app, { build, client: 'build/client', mode: 'production' });
```

### ``You made a POST request to "/" but did not provide an `action` for route "root", so there is no way to handle the request.``

React Router prints it, and answers `405`.

**When:** a `POST /` to an app whose index route has the action.

**Why:** a `POST /` is the root route's. The index route's action is
`POST /?index`; React Router's own `<Form>` adds `?index` when it posts
from an index route. This is React Router's behaviour, not alxia's.

**Fix:** post to `/?index`, as `<Form method="post">` does, or in a test:

```ts
await app.request('/?index', { method: 'POST', body: new URLSearchParams({ step: '2' }) });
```

The single-fetch form is `POST /_.data?index`.

### `TypeError: reactRouter(): client is …, which is not a directory. …`

```text
TypeError: reactRouter(): client is build/clinet, which is not a directory. Pass the client build, build/client by default.
```

**When:** at startup, `client` — `createServer`'s, `create`'s or
`reactRouter`'s — names a path that is missing or a file.

**Why:** the folder is read when the app is made, to declare a route per
top-level entry. A relative path is resolved against the process's
working directory, not the server file. Under the plugin, with no
`client` option, the folder is `build/client` resolved against the built
file, and is found wherever the process starts.

**Fix:** build first, leave `client` to the plugin, or pass the folder
relative to the file that names it:

```ts
reactRouter(app, { build, client: new URL('./build/client', import.meta.url) });
```

### `TypeError: reactRouter(): … cannot be served at a path of its own name; rename it. …`

**When:** at startup, a top-level file or folder of the client build — a
copy of `public/` — has a name no route can carry: `a:b.txt` (a `:` starts
a parameter), `*x` (a `*` is a wildcard). The message ends with the core's
refusal, which says which.

A name a URL only encodes is fine: `my file.pdf` is served at
`/my%20file.pdf`, `café.png` at `/caf%C3%A9.png`, as a browser asks for
them.

**Fix:** rename the file in `public/`, or move it into a folder: a file
inside a folder is served by that folder's `static` route, whatever its
name.

### `Refused to execute inline script because it violates the following Content Security Policy directive: "default-src 'none'"`

The browser's console prints it; the page renders on the server, then
never hydrates, and a `<Form>` does not post (`form-action 'none'`).

**When:** `@alxia/secure-headers` is used with its default policy.

**Why:** the default, `default-src 'none'; base-uri 'none'; form-action
'none'; frame-ancestors 'none'`, suits an API. A page loads its bundles
from `/assets`, runs React Router's inline scripts, and posts forms.

**Fix:** give the app a policy that allows the page's own scripts:

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';
import { secureHeaders } from '@alxia/secure-headers';

export default createServer({
	configure: (app) =>
		app.use(
			secureHeaders({
				contentSecurityPolicy:
					"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
			}),
		),
});
```

or `contentSecurityPolicy: false`. Better than `'unsafe-inline'`: a nonce
per request, with `nonce: true` and `nonceOf(loadContext)` in
`entry.server.tsx` ([guide](guide/csp-nonce.md#a-csp-nonce)).

### `Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self' 'nonce-…'"`

**When:** the root renders an `<InlineScript>` (a theme's boot script, say)
and the policy names a nonce.

**Why:** the script rendered with no `nonce` attribute, because
`useNonce()` found no nonce: the server render has no `<DocumentNonce>`
around the router (an entry of your own that does not provide it), so
`InlineScript` renders a bare `<script>`. The browser then refuses it, and
the page flashes the wrong theme.

**Fix:** wrap the router in the nonce `secureHeaders({ nonce: true })`
made, in `entry.server.tsx`, or pass one to the script:

```tsx
// app/entry.server.tsx
import { nonceOf } from '@alxia/react-router';
import { DocumentNonce } from '@alxia/react-router/document';

return (
	<DocumentNonce nonce={nonceOf(loadContext)}>
		<ServerRouter context={routerContext} url={request.url} />
	</DocumentNonce>
);
```

or, for one script, `<InlineScript code={THEME_BOOT} nonce={nonce} />`.

Check the response: `curl -s -A 'Mozilla/5.0 Chrome/130' http://localhost:5173/ | grep -o '<script[^>]*>'`
should show `nonce="…"` on the boot script too
([guide](guide/document.md#the-nonce-on-the-server)).

### `A tree hydrated but some attributes of the server rendered HTML didn't match the client properties`

**When:** the page hydrates, and the warning names `<html>` with a `class`
or `style` the server did not render.

**Why:** a boot script (a theme's) sets `class` and `style` on `<html>`
before React hydrates, so the DOM no longer equals the server's HTML.

**Fix:** keep `suppressHydrationWarning` on `<html>`. It silences that
element's own attributes only, not its children:

```tsx
// app/root.tsx
<html lang="en" suppressHydrationWarning>
	<head>
		<InlineScript code={THEME_BOOT} />
	</head>
	<body>{children}</body>
</html>
```

A warning on another element is a real mismatch: a `nonce` the browser hid
is read by `useNonce()` from the document, so never pass it from loader
data ([guide](guide/document.md#the-theme-boot-script)).

### `A tree hydrated but some attributes of the server rendered HTML didn't match the client properties` on a `<style>` with a `nonce`

**When:** in development (`react-router dev`) with a CSP nonce, the console
warns that a tree hydrated but some attributes did not match, and the diff
shows `nonce="…"` on the `<style data-react-router-critical-css>` in `<head>`.

**Why:** React Router renders the critical CSS as a `<style nonce>`. The
server writes the nonce from `<ServerRouter nonce>`, the browser hides the
attribute, and `<Links />` has no nonce to render on the client. Unlike
`<Scripts>` and `<ScrollRestoration>`, `<Links>` does not suppress that
warning.

**Fix:** pass it the nonce `useNonce()` reads, on both sides:

```tsx
// app/root.tsx
import { useNonce } from '@alxia/react-router/document';

export function Layout({ children }: { children: React.ReactNode }) {
	const nonce = useNonce();
	return (
		<html lang="en">
			<head>
				<Links nonce={nonce} />
			</head>
			<body>{children}</body>
		</html>
	);
}
```

`<Scripts>` and `<ScrollRestoration>` need nothing
([guide](guide/document.md#what-react-router-renders)).

### `useNonce()` is undefined on the server

**When:** the page's inline scripts or `<CspNonceMeta />` render with no
`nonce` attribute although `secureHeaders({ nonce: true })` set one, and
`useNonce()` returns `undefined` in the root.

**Why:** the server render has no `<DocumentNonce>` around the router. The
entry of `@alxia/react-router/entry` adds it; an entry of your own, such
as React Router's revealed one, does not, and `ServerRouter`'s own `nonce`
prop only reaches the scripts React Router writes.

**Fix:** re-export the package's entry, or wrap the router in your own:

```tsx
// app/entry.server.tsx
export {
	handleRequest as default,
	streamTimeout,
} from '@alxia/react-router/entry';
```

```tsx
// An entry of your own
import { nonceOf } from '@alxia/react-router';
import { DocumentNonce } from '@alxia/react-router/document';

<DocumentNonce nonce={nonceOf(loadContext)}>
	<ServerRouter context={routerContext} url={request.url} />
</DocumentNonce>;
```

([guide](guide/document.md#the-entry))

### `TypeError: InlineScript(): the code contains "</script" or "<!--", which ends or confuses the script element; escape it, such as "<\/script" inside a string`

**When:** a page renders an `<InlineScript code={…} />` whose code holds
`</script` (in any case) or `<!--`.

**Why:** the code is written into the page unescaped. A `</script` ends the
element early, so what follows is HTML, not script, and can be markup an
attacker chose; a `<!--` makes the HTML parser treat the following
`<script` as part of the script's text. A nonce does not help: it only says
the script may run. The component refuses the code instead of rendering it.

**Fix:** keep the code a constant of the app and escape the sequence inside
a string. The code that reaches `InlineScript` must contain `<\/`, which the
browser's script reads as `</`, and which is written `"<\\/script"` in a
source string literal:

```tsx
<InlineScript code={'document.title = "<\\/script>"'} />
```

Never build the code from user input; pass such a value through a `data-`
attribute and read it from the script.
([guide](guide/document.md#the-theme-boot-script))

### `TypeError: createPageLanguage(): the fallback … is not one of the languages; got ….`

```text
TypeError: createPageLanguage(): the fallback "de" is not one of the languages; got ["en","fr"].
```

**When:** the module that calls `createPageLanguage` loads.

**Why:** `fallback` is the language of a page whose root data gives none, so
it must be one of `languages`. The usual cause is a fallback in another
spelling (`en-US` for `en`), or a `languages` list built from a different
source than the fallback.

**Fix:** name a language of the list:

```ts
createPageLanguage({ languages: ['en', 'fr'], fallback: 'en' });
```

### The error page shows in the fallback language

**When:** on an error document, the root's `<html lang>` or text shows the
fallback language although the visitor uses another.

**Why:** a child route's error keeps the root's loader data. React Router
keeps `loaderData` for every loader that succeeded, so
`useRouteLoaderData('root')` still has it in `Layout` and `ErrorBoundary`.
The data is missing in only two cases:

- the URL matches no route, which is a 404 that runs no loader at all, the
  root's included;
- the root's own loader threw.

With no data, `pageLanguage(undefined)` has no language to read. In the
browser it keeps the last language it saw and the one picked with
`chooseLanguage`; a document the server renders as an error has seen
neither, so the fallback shows.

**Fix, 404:** add a splat route whose loader throws a 404, so the URL
matches and the root loader runs:

```ts
// app/routes.ts: add it last in your route config
import { route } from '@react-router/dev/routes';

route('*', 'routes/not-found.tsx');
```

```ts
// app/routes/not-found.tsx
import { data } from 'react-router';

export const loader = () => {
	throw data(null, { status: 404 });
};
```

**Fix, root loader:** keep the root loader to `{ language: alxia.language }`,
with nothing fallible in it. Load fallible data in child routes, or catch it
and return it as a field.

**Fix, client:** none is needed: a failed client navigation keeps the last
language through `pageLanguage`.

### `Error: You must render this element inside a <HydratedRouter> element`

**When:** under `react-router dev` or after `react-router build`, every page
answers "Unexpected Server Error" with this message, once
`entry.server.tsx` re-exports `@alxia/react-router/entry`.

**Why:** the server holds two copies of `react-router`: the one that
renders `ServerRouter` in the entry, and the one `<Links>` and `<Scripts>`
in the root read. They share no context. `alxia()` from
`@alxia/react-router/vite` keeps them to one (it inlines `/entry` and
`/document`, by an alias in dev and in the build, so they import the app's
`react-router`). The message means `@alxia/react-router` is listed in
`ssr.external` and `alxia()` is not in use.

**Fix:** add `alxia()` to `vite.config.ts` beside `reactRouter()`, or list
`@alxia/react-router` in `ssr.noExternal` and remove it from
`ssr.external`.

### `alxia-react-router: … already exists, and reveal leaves it as it is. Run alxia-react-router reveal --force to overwrite it.`

```text
alxia-react-router: app/server.ts already exists, and reveal leaves it as it is. Run alxia-react-router reveal --force to overwrite it.
```

**When:** `bunx alxia-react-router reveal` finds a server file where it
would write one: `app/server.ts`, or the file `alxia({ entry })` names. It
exits 1 and writes nothing.

**Why:** that file is the app's server, customised or not; reveal never
replaces it unasked.

**Fix:** keep it, or overwrite it with the default server, its options
commented:

```sh
bunx alxia-react-router reveal --force
```

### `alxia-react-router: no vite.config.ts in …. Run reveal from the app's root, beside vite.config.ts.`

**When:** `bunx alxia-react-router reveal` runs in a folder with no
`vite.config.ts` (nor `.mts`, `.cts`, `.js`, `.mjs` or `.cjs`): a
subfolder of the app, or another project.

**Why:** reveal reads where to write from the app's `vite.config.ts`,
`alxia({ entry })`, and writes relative to it.

**Fix:** `cd` to the folder that holds `vite.config.ts`, and run it there.

### `alxia-react-router: … gives alxia() an entry reveal cannot read. …`

```text
alxia-react-router: vite.config.ts gives alxia() an entry reveal cannot read. Write it as a string literal, alxia({ entry: 'app/server.ts' }), and run reveal again.
```

**When:** `vite.config.ts` passes `alxia()` an `entry` that is not a string
literal: a constant, a template with `${…}`, a call. Reveal exits 1 and
writes nothing.

**Why:** reveal reads the config as text, cheaply, and does not run it.
Guessing `app/server.ts` would write a file the plugin does not load.

**Fix:** write the path as a literal, run reveal, then compute it again if
you need to:

```ts
// vite.config.ts
import { alxia } from '@alxia/react-router/vite';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [reactRouter(), alxia({ entry: 'server/main.ts' })] });
```

### `alxia-react-router: … computes appDirectory, which reveal cannot read. …`

```text
alxia-react-router: react-router.config.ts computes appDirectory, which reveal cannot read. Write it as a string literal, appDirectory: 'app', and run reveal again.
```

**When:** `react-router.config.ts` sets `appDirectory` to something other
than a string literal, and `vite.config.ts` names no `entry`. Reveal exits
1 and writes nothing.

**Why:** the same as above: reveal does not run the config, and `app/`
might not be the folder the plugin reads.

**Fix:** write `appDirectory` as a literal for the time of the reveal, or
name the file in `vite.config.ts`, `alxia({ entry: 'src/server.ts' })`.

### `alxia-react-router: unknown command ….`

**When:** the bin is given a command other than `reveal`, such as
`bunx alxia-react-router reveal-server`. It prints its usage and exits 1.

**Fix:** `bunx alxia-react-router reveal`, or `--help` for the usage.

### `alxia-react-router: unknown option … for reveal.`

**When:** `reveal` is given an option other than `--force` or `--help`,
such as react-router-hono-server's `reveal file` or `reveal folder`. It
prints its usage and exits 1.

**Fix:** `bunx alxia-react-router reveal` writes the one server file the
plugin reads. For a server in a folder of its own, name it first,
`alxia({ entry: 'app/server/index.ts' })`, then run `reveal`: it writes
there.

### `error: GET https://registry.npmjs.org/alxia-react-router - 404`

**When:** `bunx alxia-react-router reveal` runs in a project where
`@alxia/react-router` is not installed.

**Why:** `bunx` looks for the bin in `node_modules/.bin`, then for an npm
package of the bin's name. The bin is `@alxia/react-router`'s, and no
package is named `alxia-react-router`.

**Fix:** install the package, then run the bin:

```sh
bun add @alxia/core @alxia/react-router
bunx alxia-react-router reveal
```

### `alxia-react-router: build/server/index.js does not exist. Run react-router build before vite preview.`

With another `buildDirectory` or `serverBuildFile`, the message names
that file.

Under `vite preview`, every request is a 500 with this text, and Vite's
terminal prints it.

**When:** the preview server starts before a build, or after
`build/server/index.js` was removed.

**Why:** under the plugin, the preview serves the built server, and there
is none yet.

**Fix:** build, then preview:

```sh
bun run build
bunx --bun vite preview
```

The next request after the build loads it, with no restart.

### `alxia-react-router: build/server/index.js is not alxia's server: its default export has no fetch. …`

With another `buildDirectory` or `serverBuildFile`, the message names
that file.

```text
alxia-react-router: build/server/index.js is not alxia's server: its default export has no fetch. Build it with alxia() in vite.config.ts's plugins, then run vite preview again.
```

**When:** under `vite preview`, the build in `build/` was made without
`alxia()`: before the plugin was added, or with another Vite config.

**Why:** React Router's own server build exports the routes and no app.
The plugin hands each request to the default export's `fetch`, which only
a build made with the plugin has.

**Fix:** add `alxia()` to `vite.config.ts`'s plugins, run `bun run build`,
then restart `vite preview`: a build already loaded is not read again.

### `warn: incorrect peer dependency "typescript@5.9.3"`

`bun add @alxia/core @alxia/react-router` prints it in the official
template.

**Why:** the template ships TypeScript 5.9, and alxia's packages declare
`typescript` 6 or 7 as a peer: their declarations are tested with those.
The template's own code, with a server file and typed loaders, typechecks
under 5.9 too.

**Fix:** none is needed to run. To silence it, and typecheck with what
alxia is tested on:

```sh
bun add -d typescript@^6
```

### `Module "…" has been externalized for browser compatibility, imported by "…"`

`react-router build` warns it while building the client, for
`Module "bun:sqlite"` or `Module "bun"`. What follows depends on Vite:

- **Vite 7** then fails the build:

  ```
  RollupError: app/routes/todos.tsx (1:9): "Database" is not exported by "__vite-browser-external", imported by "app/routes/todos.tsx".
  ```

- **Vite 8** builds, and the page fails in the browser instead, with
  `TypeError: … is not a constructor` or `… is not a function` once it
  hydrates.

**Why:** a route module imports one of Bun's modules, `bun` or `bun:*`,
and uses it outside its `loader` and `action`, in the component or at the
module's top level. React Router keeps that code in the client build, for
the browser, which has no such module. The server build leaves Bun's
modules external ([Built for Bun](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/how-it-works.md#built-for-bun));
the client build cannot.

**Fix:** use them only in the server's code: in `loader` and `action`, or
in a `.server.ts` module, which React Router keeps out of the client.

```ts
// app/db.server.ts
import { Database } from 'bun:sqlite';

export const db = new Database(':memory:');
```

```tsx
// app/routes/todos.tsx
import { db } from '../db.server';

export function loader() {
	return { version: db.query('select sqlite_version() as v').get() };
}
```

### `error: lockfile had changes, but lockfile is frozen`

`docker build` stops at `RUN bun install --frozen-lockfile`, followed by
`note: try re-running without --frozen-lockfile and commit the updated lockfile`.

**Why:** the `Dockerfile` installs exactly what `bun.lock` records, and
`package.json` asks for something it does not: a dependency added or
changed by hand, without `bun install`.

**Fix:** update the lockfile, commit it, and build again:

```sh
bun install
git add bun.lock
docker build -t my-app .
```

### `EACCES: permission denied, open '/app/…'`

The container starts, then a write fails: `Bun.write` gives this, and
`new Database('/app/data.sqlite')` gives
`SQLiteError: unable to open database file`.

**Why:** the `Dockerfile` runs the server as the image's `bun` user, not
root, and `/app` is root's: the user reads the build and cannot write
beside it.

**Fix:** write to a directory the user owns, a volume for what must
outlive the container:

```dockerfile
# Dockerfile, before USER bun
RUN mkdir /data && chown bun:bun /data
VOLUME /data
```

```ts
const db = new Database('/data/app.sqlite');
```

### `error: Cannot find package '…' from '/app/build/server/index.js'`

`bun build/server/index.js`, in the container or from a copy of `build/`
alone, stops at startup. For a package loaded with `require`, the message
can read `Cannot find module '…'`. Or it starts, and a request fails with
`ENOENT: no such file or directory, open '/app/build/…'`.

**When:** the image holds `build/` alone, as the template's `Dockerfile`
copies it, and the server imports a package that is not inside
`build/server/index.js`:

- the app keeps it external with `ssr.external`, and the image has no
  `node_modules`;
- or the build bundled it, but it reads a file of its own folder at
  runtime (`new URL('./data.json', import.meta.url)`), or loads a native
  addon (a `.node` file), neither of which bundling carries along.

The image runs `bun --no-install`: without the flag, Bun finds no
`node_modules` and fetches the missing package from npm at startup, at
whatever version npm has, instead of failing.

**Why:** under `react-router build` the plugin bundles every package into
`build/server/index.js` ([Self-contained](guide/how-it-works.md#self-contained)), so
the image needs no `node_modules`. What stays outside the file must be
installed beside it.

**Fix:** keep the package external, and give the image the production
dependencies:

```ts
// vite.config.ts
export default defineConfig({
	ssr: { external: ['sharp'] },
	plugins: [reactRouter(), alxia()],
});
```

```dockerfile
# Dockerfile, before the build stage
FROM oven/bun:1 AS production-dependencies
WORKDIR /app
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile --production

# Dockerfile, in the final stage, beside build/
COPY --from=production-dependencies /app/node_modules ./node_modules
```

`grep '^import' build/server/index.js` lists what the build still
imports: `node:*`, `bun`, `bun:*` and the packages `ssr.external` names.

The image runs on `oven/bun:1-alpine`, whose C library is musl. A native
addon built for glibc alone then stops it with
`… is linked against glibc (DT_NEEDED …), but this Bun build uses musl.`:
put the final stage back on `oven/bun:1`
([`@alxia/create`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/create/docs/troubleshooting.md#error--is-linked-against-glibc-dt_needed-libmso6-but-this-bun-build-uses-musl)).

### `TypeError: defineWorkerContract(): cachePrefix must be a non-empty name, …`

The full message is `defineWorkerContract(): cachePrefix must be a non-empty
name, such as 'my-app'; got ''.`, or `… must not end with '-', which the
contract adds; got 'my-app-'. Use 'my-app'.`

**Why:** every cache name is `<prefix>-<kind>-<version>`, and the worker
deletes the caches shaped `<prefix>-<kind>-<version>`. An empty prefix would own
every cache of the origin, and a trailing dash would be doubled.

**Fix:** pass the app's own name, without the dash:

```ts
import { defineWorkerContract } from '@alxia/react-router/pwa';

export const workerContract = defineWorkerContract({ cachePrefix: 'my-app' });
```

### `TypeError: defineWorkerContract(): cacheVersion must be a non-empty name without '-', …`

The full message is `defineWorkerContract(): cacheVersion must be a
non-empty name without '-', such as 'v2'; got 'v1-beta'.`

**Why:** every cache name is `<prefix>-<kind>-<version>`, and the contract
tells a version from the rest of the name by its dashes. A version with a `-`
(or an empty one) would make the name ambiguous.

**Fix:** use a name with no dash, such as `'v2'` or `'2026'`:

```ts
import { defineWorkerContract } from '@alxia/react-router/pwa';

export const workerContract = defineWorkerContract({
	cachePrefix: 'my-app',
	cacheVersion: 'v2',
});
```

### `parseBrowserManifest(): not React Router's browser manifest …`

The full message ends with `(build/client/assets/manifest-*.js).`

**Why:** the source holds no `{ … }` object. The build script read another
file, an empty one, or the build has not run.

**Fix:** run `react-router build` first, then read the file named
`manifest-<hash>.js` in `build/client/assets`, not the server's manifest:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { parseBrowserManifest } from '@alxia/react-router/pwa';

const assets = 'build/client/assets';
const file = readdirSync(assets).find((name) => /^manifest-.*\.js$/.test(name));
if (!file) throw new Error('Run react-router build first.');
export const manifest = parseBrowserManifest(readFileSync(`${assets}/${file}`, 'utf8'));
```

### `error: Cannot find package 'react' from '…/@alxia/react-router/dist/pwa/react/index.js'`

**Why:** `@alxia/react-router/pwa/react` imports `react`, an optional peer of
the package, so nothing installs it for you. An app with no `react` does not
need the subpath; a build script or the worker importing it by mistake meets
this message too.

**Fix:** add `react` where the page is built (`bun add react`), and import
`/pwa/react` from the page alone. The worker and a build script import
`@alxia/react-router/pwa`, which imports nothing.

### `error: Cannot find package 'isbot' from '…/@alxia/react-router/dist/entry/index.js'`

**When:** a request with a user agent reaches `entry.server.tsx` re-exporting
`@alxia/react-router/entry` (or a `createEntry()` with no `isBot` option).

```text
error: Cannot find package 'isbot' from '/app/node_modules/@alxia/react-router/dist/entry/index.js'
```

**Why:** with no `isBot` option, `/entry` asks `isbot` whether a request
comes from a crawler, which then gets the whole page, and imports it on the
first request that needs it. `isbot` and `react-dom` are optional peers of
the package, so nothing installs them for you. React Router's templates
install both; an app made another way may not.

**Fix:** add them where the server is built and run:

```sh
bun add isbot react-dom
```

Or give the `isBot` option, which replaces the check: `isbot` is then never
imported, and only `react-dom` is needed.

### `startWorker(): no precache list. …`

**Why:** the full message ends "Build this worker with `alxia()` from
`@alxia/react-router/vite` (`app/service-worker.ts`) or `buildWorker()` from
`@alxia/react-router/pwa/build`, which write it in." `startWorker` precaches
the list the build defines in the bundle (`globalThis.__ALXIA_PRECACHE__`);
a worker bundled by anything else has none, and the page would install a
worker that precaches nothing.

**Fix:** either build the worker with the build that writes the list
(`alxia()` or `buildWorker()`), or pass the list yourself, which works for a
worker bundled any other way:

```ts
startWorker({
	contract,
	precache: [{ url: '/offline.html', revision: 'v1' }],
});
```

`precache` wins over the list the build wrote. A bundle of your own may
instead define `globalThis.__ALXIA_PRECACHE__`.

### `TypeError: startWorker(): contract is required: …`

**Why:** the full message continues "pass `defineWorkerContract({ cachePrefix })`
from `@alxia/react-router/pwa`." The worker's cache names, its offline page
and its URL come from the contract the page shares, so there is no default.

**Fix:**

```ts
// file: app/service-worker.ts
import { defineWorkerContract } from '@alxia/react-router/pwa';
import { startWorker } from '@alxia/react-router/pwa/worker';

startWorker({ contract: defineWorkerContract({ cachePrefix: 'my-app' }) });
```

### `error: Could not resolve: "workbox-core". Maybe you need to "bun install"?`

**Why:** `@alxia/react-router/pwa/worker` imports six `workbox-*` packages,
optional peers of the package, so nothing installs them for you. They are
bundled into the worker, never loaded at run time.

**Fix:** add them as development dependencies:

```sh
bun add -d workbox-core workbox-expiration workbox-navigation-preload \
  workbox-precaching workbox-routing workbox-strategies
```

The `buildWorker()` messages below are the ones a script of your own sees.
Under `alxia()` each of them begins with `alxia-react-router: `.

### `buildWorker() runs on Bun: it is running on Node`

```text
buildWorker() runs on Bun: it is running on Node. Run it with bun, or run react-router build with bun --bun.
```

**When:** a script of your own calls `buildWorker()` and runs on Node. Under
`alxia()` the check comes first and reads
[`… is running on Node, and the worker is bundled by Bun.build`](#alxia-react-router--is-running-on-node-and-alxias-server-runs-on-bun-).

**Why:** the worker is bundled with `Bun.build`, which Node does not have.

**Fix:** run the script with `bun scripts/build-worker.ts`, or
`react-router build` as `bun --bun react-router build`.

### `buildWorker(): app/service-worker.ts does not exist.`

```text
buildWorker(): app/service-worker.ts does not exist.
```

**Why:** `file` is read from `root` (`process.cwd()` by default), not from the
script's folder. Under `alxia()` the message begins
`alxia-react-router: buildWorker(): …`.

**Fix:** pass the path relative to the project root, or pass `root`.

### `buildWorker(): expected one React Router browser manifest`

```text
buildWorker(): expected one React Router browser manifest, build/client/assets/manifest-*.js, found 0. Run react-router build first.
```

The message ends `found 2` when two are left.

**Why:** the precache list is read from React Router's browser manifest,
which `react-router build` writes. None means the build did not run, or
`client` is wrong. Two mean a stale build folder.

**Fix:** run `react-router build` first, check `client`, and delete `build/`
when two manifests are left.

### `buildWorker(): build/client/offline.html does not exist`

```text
buildWorker(): build/client/offline.html does not exist. Add public/offline.html, or pass offline: false (`worker: { offline: false }` in alxia()), or pass the app's contract (`worker: { contract }` in alxia()).
```

**Why:** the offline page is precached by default and is read from the client
build, where `public/offline.html` is copied. The build reads the contract's
`offlineUrl` from the `contract` option, and the worker from the contract it
is given: two objects can disagree.

**Fix:** add the page to `public/`, or pass `offline: false` for a worker with
no offline page. If the contract's `offlineUrl` is another path, pass the same
contract object to the build (`alxia({ worker: { contract } })`, or
`buildWorker({ contract })`).

### `buildWorker(): … is outside ….`

```text
buildWorker(): /../service-worker.js is outside /app/build/client.
```

**Why:** the contract's `serviceWorkerUrl` or `offlineUrl` is joined onto the
client build, and the result leaves it, or is the client build itself (`/`).
The build refuses to write or read a file there. It also refuses an absolute
URL (`https://example.com/sw.js`), a protocol-relative one (`//host/sw.js`) and
one that does not start with `/`, since none names a file of the build.

**Fix:** use a root-relative URL inside the site, such as
`/service-worker.js`, in the contract.

### `buildWorker(): Bun.build failed:`

```text
buildWorker(): Bun.build failed:
```

Bun's logs follow the message.

**Why:** the worker's source or one of its imports did not bundle: a missing
`workbox-*` package, a wrong import path.

**Fix:** read the first log line. The six `workbox-*` packages are optional
peers, installed as
[`Could not resolve: "workbox-core"`](#error-could-not-resolve-workbox-core-maybe-you-need-to-bun-install)
shows.

### `Cross-site request refused`

**When:** an action reads its body with `readJson` or `readInput` (from
`jsonActions()`), and the page's post answers 403 with this text.

**Why:** the request carried an `Origin` other than the app's own, or a
`Sec-Fetch-Site` that is neither `same-origin` nor `none`. That is what a
post from another site looks like, so it is refused before the body is read.
The usual honest cause is that the app's origin is not the one the request
reaches: see [Behind a TLS proxy every action answers 403](#behind-a-tls-proxy-every-action-answers-403).

**Fix:** if the post comes from another site, nothing: the refusal is the
point. If it comes from your own page, give `jsonActions` the origin your
users see:

```ts
export const { readJson } = jsonActions({
	origin: 'https://app.example.com',
});
```

### `Expected a JSON body`

**When:** an action answers 415 with this text.

**Why:** `readJson` takes only `application/json`. A native form post
(`application/x-www-form-urlencoded` or `multipart/form-data`), a
`text/plain` body and a request with no content type are refused, since only
JSON needs a preflight from another site.

**Fix:** post from `useJsonFetcher`, which sets the content type
(`encType: 'application/json'`), or set `Content-Type: application/json` on
your own `fetch`. For an action that a native form also posts to before the
page hydrates, call `requireJsonPost(request)` first: it sends that post back
to its page, which then posts JSON.

```ts
const { requireJsonPost, readJson } = jsonActions();

export async function action({ request }: Route.ActionArgs) {
	requireJsonPost(request);
	const body = await readJson(request);
	// …
}
```

### `Malformed JSON body`

**When:** an action answers 400 with this text.

**Why:** the request declared `application/json`, but `request.json()` could
not parse the body: it is empty, truncated, or not JSON at all (a form's
`FormData` posted with the JSON content type, for example).

**Fix:** post an object through `useJsonFetcher`'s `post(body)`, or
`JSON.stringify` the body of your own `fetch`. Do not set the content type by
hand on a `FormData` body.

### `The form sent an input the API would refuse`

**When:** an action that reads its body with `readInput(request, schema)`
answers 400 with this text.

**Why:** the body was JSON, but its `input` field did not pass the schema: it
is missing, or one of the checks failed. `readInput` reads `{ input }`, not
the whole body, and it answers a bare 400 on purpose: the schema is the API's
own input, so a form that passed its own checks never gets here.

**Fix:** post `{ input: … }`, and make the form's checks the schema's. To see
what the schema refused while you debug, call it yourself:

```ts
const body = (await readJson(request)) as { input?: unknown };
const result = await schema['~standard'].validate(body.input);
console.log(result.issues);
```

### `alxia-react-router: the error catalogue (…) was not read`

**When:** the server logs this line (with the error after it, at the level of
`log.error`) while a language's catalogue is read for the first time, and the
refusals in that language read in the API's own words.

**Why:** the app's `read(language)` threw: the API was down, slow past its own
timeout, or answered an error. The catalogue keeps no partial result. It tries
again once `retryMs` (5 seconds by default) has passed since the failure, on
the next request that asks for that language; one read is in flight at a time.

**Fix:** read the error that follows the line. Once the API answers, the next
request after the delay reads the catalogue and the refusals are worded; no
restart is needed. To see the calls, give `createErrorCatalogue` a `log`
that records them.

### `alxia-react-router: the error catalogue was not checked, keeping what is held`

**When:** the server logs this line (with the error after it) once a held
catalogue is older than the TTL and the check of the versions failed.

**Why:** `versions()` threw. The catalogue keeps serving the messages it
holds, which may be stale, and asks again after `retryMs` instead of after a
whole TTL.

**Fix:** read the error that follows. Nothing to restart: when the API
answers, the check goes on and re-reads the languages whose version moved.
If it repeats while the API is up, check that `versions()` returns a version
for every language in `languages`: a language missing from its answer is read
again at each check.

### `alxia-react-router: the error catalogue was not warmed`

**When:** the server logs this line at startup, after `warm()`.

**Why:** `warm()` reads every language without holding the boot back, and
the promise it started rejected. The reads themselves report their failures
(`the error catalogue (…) was not read`), so this line means something else
threw.

**Fix:** read the error that follows. The first request that asks for a
language reads it anyway, so the server is not left without a catalogue.

### `alxia-react-router: ttlMs threw, using retryMs`

**When:** the server logs this line (with the error after it) each time the
catalogue reads its TTL and the `ttlMs` getter throws.

**Why:** `ttlMs` is a getter of the app's, such as one that reads a setting,
and it threw. The catalogue does not let it break a request: it uses
`retryMs` as the TTL for that read, so the held messages are still served
and the versions are checked again soon.

**Fix:** read the error that follows and fix the getter, or pass a number.

```ts
const catalogue = createErrorCatalogue({
	// …
	ttlMs: () => settings.catalogueTtlMs ?? 60_000,
});
```

### `alxia-react-router: ttlMs is not a duration, using retryMs`

**When:** the server logs this line each time the catalogue reads its TTL and
`ttlMs` is not a finite number of at least 0: `NaN`, `Infinity`, a negative
number, or a value that is not a number, such as the string a setting
returned.

**Why:** a TTL that is not a duration would never expire a held catalogue
(`Infinity`) or make every comparison false (`NaN`). The catalogue treats it
like a getter that threw: it uses `retryMs` for that read.

**Fix:** pass a number of milliseconds, converted where the setting is read:

```ts
const catalogue = createErrorCatalogue({
	// …
	ttlMs: () => Number(process.env.CATALOGUE_TTL_MS ?? 60_000),
});
```

### `TypeError: createErrorCatalogue(): needs at least one language.`

**When:** the server starts, or the module that calls `createErrorCatalogue`
is imported.

**Why:** `languages` is empty, usually a list built from an environment
variable or a config that was not set.

**Fix:** pass the languages the app serves, the same list the page's
translator knows:

```ts
const catalogue = createErrorCatalogue({
	messages: apiMessages,
	languages: ['en', 'fr'],
	// …
});
```

### `<api>: <operation> (request <id>) answered <status> <code>`

Logged by `apiCallFailure` (a warning for a 4xx, an error for a 5xx), after the
`api` the app gave it, when the
API refused a call with a GraphQL body, or answered a status that is passed
through, such as a 404, which has no `<code>`. For example
`my-api https://api.example.com/graphql: Todos (request r-1) answered 403 todos.errors.forbidden`.

**Why:** the API answered, and refused: `<status>` and `<code>` are the
`ApiError`'s. A 4xx is expected (a forbidden page, a missing record), which is
why it is a warning. The `(request …)` part is there only if the API sent an
`x-request-id` and your code passed it as `requestId`; without it the line
carries no id and an error page can show none.

**Fix:** nothing to fix in the package. To find the API's own log line, search
for the id. To get the id in the line, pass `requestId: requestIdOf(response)`
from the `fetch` the client calls:

```ts
import { apiCallFailure, requestIdOf } from '@alxia/react-router/errors';

let requestId: string | undefined;
const send = async (request: Request) => {
	const response = await fetch(request);
	requestId = requestIdOf(response);
	return response;
};

export const failed = (error: unknown) =>
	apiCallFailure(error, { api: 'my-api', requestId });
```

### `<api>: <operation> (request <id>) answered <status> without GraphQL`

Logged as an error by `apiCallFailure`, and the loader gets a 503 `Response`
with no body (the reason is in the log).

**Why:** the API, or a gateway in front of it, answered a status that is not
401, 403 or 404 with a body that is not GraphQL (an HTML 502 page, a 429
from a rate limiter). The log line's second argument is that body.

**Fix:** read the body in the log and fix the gateway. If a status such as 429
should reach the page as its own, name it:

```ts
import { apiCallFailure } from '@alxia/react-router/errors';

export const failed = (error: unknown) =>
	apiCallFailure(error, {
		api: 'my-api',
		passedThrough: new Set([401, 403, 404, 429]),
	});
```

### `<api>: <operation> (request <id>) unreachable`, `timeout` or `invalid-response`

Logged as an error by `apiCallFailure`, and the loader gets a 503 `Response`
with no body (the reason is in the log line).

**Why:** `@nxgt/graphql-client` could not get an answer: `unreachable` is a
refused connection or a DNS failure, `timeout` is a call past the deadline the
app gave it, and `invalid-response` is an answer that is no GraphQL response
(a 2xx with no `data`, garbled JSON). The log line's second argument is the
cause.

**Fix:** check the API's address and that it is up. For a `timeout`, the call's
`timeout` option is the app's, not the package's. The 503 reaches the error
page through `routeError`, which words it with the request id when there is
one.

### `<api>: <operation> (request <id>) aborted`

Logged as an error by `apiCallFailure`, and the loader gets a 503 `Response`.

**Why:** the `signal` you passed was aborted, so the visitor closed the tab or
navigated away, and the call failed with whatever error that produced. Nobody
sees the 503.

**Fix:** none. To keep it out of the logs, test `request.signal.aborted` in
your own `catch` before calling `apiCallFailure`.

### `TypeError: sessionCookies(): the … name "…" is not a cookie name (an RFC 6265 token: …). Pass a name such as "my-app_session".`

```
TypeError: sessionCookies(): the session name "Bad Name" is not a cookie name (an RFC 6265 token: letters, digits and ! # $ % & ' * + - . ^ _ ` | ~). Pass a name such as "my-app_session".
```

**When:** the server starts, or the module that calls `sessionCookies` is imported.

**Why:** `session` or `challenge` is empty or holds a character a cookie name cannot, such as a space, a semicolon, a comma or `=`. The message says which of the two (`session` or `challenge`) it is. A name from an environment variable that was not set is the usual cause.

**Fix:** pass a plain name, such as the app's name and the role:

```ts
import { sessionCookies } from '@alxia/react-router/session';

export const cookies = sessionCookies({
	session: 'my-app_session',
	challenge: 'my-app_challenge',
	secure: !import.meta.env.DEV,
});
```

### `TypeError: sessionCookies(): the … name "…" already carries a prefix. Pass the base name: the package adds __Host- (session) or __Secure- (challenge) when secure is true.`

```
TypeError: sessionCookies(): the session name "__Host-my-app_session" already carries a prefix. Pass the base name: the package adds __Host- (session) or __Secure- (challenge) when secure is true.
```

**When:** the server starts, or the module that calls `sessionCookies` is imported.

**Why:** the name starts with `__Host-` or `__Secure-`. The package adds the prefix itself when `secure` is `true` and drops it when `secure` is `false` (development over plain HTTP, where a prefixed cookie would be refused); a name that carries it would be doubled or stuck in development.

**Fix:** pass the base name: `'my-app_session'`, not `'__Host-my-app_session'`. The name the browser sees is in `cookies.names`. If the app reads or clears the cookie elsewhere by its full name, read it from `cookies.names.session`.

### `TypeError: sessionCookies(): challengeSeconds must be a positive integer; got ….`

```
TypeError: sessionCookies(): challengeSeconds must be a positive integer; got 0.
```

**When:** the server starts, or the module that calls `sessionCookies` is imported.

**Why:** `challengeSeconds`, the most the second-factor challenge's cookie lives, is `0`, negative, fractional or `NaN` (a lifetime read from an environment variable that is empty gives `NaN`). With `0` the browser would drop the cookie at once and the code page would never find its challenge.

**Fix:** pass whole seconds above 0, or leave it out for the default of 300, the lifetime of an `@nxgt/janus` challenge. A longer value gains nothing: the cookie also ends with the challenge itself.

### `TypeError: sessionCookies(): challengePath must start with "/"; got ….`

```
TypeError: sessionCookies(): challengePath must start with "/"; got "sign-in".
```

**When:** the server starts, or the module that calls `sessionCookies` is imported.

**Why:** `challengePath`, where the browser sends the challenge cookie, is a relative path such as `'sign-in'`. A cookie's `Path` must be absolute, or the browser ignores it.

**Fix:** pass the path of the sign-in pages with its leading slash. The default is `'/sign-in'`, which covers `/sign-in` and the pages under it; not `/sign-in/code` alone, since a client navigation fetches `/sign-in/code.data`, which that path would not match.

## Types

### `Property 'alxia' does not exist on type 'Readonly<RouterContextProvider>'`

```text
app/routes/home.tsx: error TS2339: Property 'alxia' does not exist on type 'Readonly<RouterContextProvider>'.
```

**When:** a loader or an action typed with the generated `Route.LoaderArgs`
or `Route.ActionArgs` reads `context.alxia`. At runtime it is there; only
`tsc` refuses it.

**Why:** this package augments `RouterContextProvider` as `react-router`
exports it, whose types are `dist/production`'s. The generated `+types`
files read their argument types from `react-router/internal`, whose types,
in react-router 8.4 and 8.5, point at `dist/development`: a second declaration of
the class, which no exported path reaches, so no augmentation can add
`alxia` to it.

**Fix:** wrap the loader in `withAlxia`, which hands it `alxia` typed the
same way, and keeps the generated `loaderData`:

```ts
import { type AlxiaArgs, withAlxia } from '@alxia/react-router';
import type { Route } from './+types/home';

export const loader = withAlxia(({ alxia }: Route.LoaderArgs & AlxiaArgs) => {
	return { name: alxia.user?.name ?? null };
});
```

Or read `alxiaOf(context)` inside the plain function.

Or type the arguments with `LoaderFunctionArgs` from `react-router`, which
sees `context.alxia`, at the cost of the generated `params`. Typing it under
`Route.LoaderArgs` waits on react-router pointing both entries at the same
declarations.

### `Property '…' does not exist on type 'BaseContext & …'`

```text
error TS2339: Property 'tenant' does not exist on type 'BaseContext & Empty & { requestId: string; log: RequestLog; } & { user: { name: string; } | null; }'.
```

**When:** a loader reads, through `alxiaOf`, or `getLoadContext`
destructures, something no middleware of the server derives. With the type
`'BaseContext & Empty'` alone, `alxiaOf(context)` has no server to read:
`app/server.ts` has no `Register` declaration, or there is no
`app/server.ts`, and `@alxia/core`'s `Register` names no base either.
With core's `Register` alone, `alxiaOf` reads that base: a key
`configure` adds after it is missing.

**Why:** the type is the app's context at the point of the catch-all, as
for any route: "order is meaning".

**Fix:** derive it in `configure`, and register the server once:

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';

const server = createServer({
	configure: (app) =>
		app.derive(({ request }) => ({ tenant: request.headers.get('x-tenant') ?? 'default' })),
});
export default server;

declare module '@alxia/react-router' {
	interface Register {
		server: typeof server;
	}
}
```

### `Type '…' does not satisfy the constraint 'AnyAlxia | ReactRouterServer<AnyAlxia>'`

```text
error TS2344: Type '{ user: string; }' does not satisfy the constraint 'AnyAlxia | ReactRouterServer<AnyAlxia>'.
```

**When:** `alxiaOf<T>()` is given a type that is neither a server nor an
alxia app, such as the context's own shape.

**Why:** the type argument is what the context is read from, as
`ContextOf<App>` reads an app.

**Fix:** pass the server's type, or register it and pass nothing:

```ts
// app/server.ts
export type Server = typeof server;

// app/routes/home.tsx
import type { Server } from '../server';
const { user } = alxiaOf<Server>(context);
```

### `Type '(app: …) => void' is not assignable to type '(app: …) => AnyAlxia'`

```text
error TS2322: Type '(app: FreshApp) => void' is not assignable to type '(app: FreshApp) => AnyAlxia'.
  Type 'void' is not assignable to type 'AnyAlxia'.
```

**When:** `configure` or `beforeAll` has a body that declares on `app` and
returns nothing.

**Why:** each returns the app it built: that return is how its types reach
the loaders and `getLoadContext`.

**Fix:** return the chain:

```ts
createServer({
	configure: (app) => app.get('/api/health', ({ reply }) => reply.ok({ ok: true })),
});
```

### `Property '…' does not exist on type 'BaseContext & { readonly 'Register.server must be typeof server, the default export of createServer()': never; }'`

```text
error TS2339: Property 'user' does not exist on type 'BaseContext & { readonly 'Register.server must be typeof server, the default export of createServer()': never; }'.
```

**When:** every `alxiaOf(context)` read fails with it: `Register`'s
`server` names something that is neither a server nor an alxia app, most
often the module rather than its default export,
`server: typeof import('./server')`.

**Why:** a wrong registration types the context as one marker key, so
that each read is a compile error rather than `never`, which would let
anything through.

**Fix:** name the default export's type:

```ts
// app/server.ts
const server = createServer({ configure: (app) => app });
export default server;

declare module '@alxia/react-router' {
	interface Register {
		server: typeof server;
	}
}
```

### `Subsequent property declarations must have the same type. Property 'server' must be of type …`

```text
error TS2717: Subsequent property declarations must have the same type.  Property 'server' must be of type 'ReactRouterServer<…>', but here has type 'ReactRouterServer<…>'.
```

**When:** two files of one TypeScript program declare `Register`'s
`server`: two React Router apps under one tsconfig, or a copy of the
declaration left in a second file.

**Why:** a program has one `Register`, and it names one server: the one
whose catch-all every loader of the build runs behind.

**Fix:** keep one declaration per app, beside its server. Give each app of
a monorepo its own tsconfig, or drop `Register` and pass the type
argument, `alxiaOf<Server>(context)`.

### `Type '{ …; nonce: string | undefined; }' is not assignable to type 'ServerRouterProps' with 'exactOptionalPropertyTypes: true'`

**When:** `entry.server.tsx` passes `nonceOf(loadContext)` to
`<ServerRouter nonce>` under `exactOptionalPropertyTypes`.

```text
error TS2375: Type '{ context: EntryContext; url: string; nonce: string | undefined; }' is not assignable to type 'ServerRouterProps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
```

**Why:** `nonceOf` returns `undefined` when no middleware set a nonce, and
`ServerRouterProps.nonce` is optional without `undefined`. React's
`nonce` option takes `undefined`, so only the prop complains.

**Fix:** use `@alxia/react-router/entry`, whose `handleRequest` does it
([guide](guide/document.md#the-entry)), or spread the prop in only when
there is a nonce, in an entry of your own:

```tsx
const nonce = nonceOf(loadContext);
<ServerRouter
	context={routerContext}
	url={request.url}
	{...(nonce === undefined ? {} : { nonce })}
/>
```

## Traps

### `bun build/server/index.js` exits at once, printing nothing

**Why:** the build was made without the plugin, so `build/server/index.js`
is React Router's plain server build: a module of exports, which listens
on nothing. Or it was imported, not run: the server listens only when it
is the process's entry point.

**Fix:** add `alxia()` to `vite.config.ts` and build again; the start line
`alxia listening on <url>` then comes up. Run the file itself,
`bun build/server/index.js`, not through another module's `import`.

### A script of the page has no nonce

The policy names `'nonce-…'`, and the browser refuses some or all of the
page's scripts: `Refused to execute inline script because it violates the
following Content Security Policy directive: "script-src 'self'
'nonce-…'"`. The page renders, then never hydrates.

**Why:** one of these:

- the app has no `entry.server.tsx`, so React Router's default renders
  with no nonce;
- the entry does not pass it to both `<ServerRouter nonce>` and the
  renderer's `nonce` option: the first covers React Router's scripts, the
  second React's own streaming ones;
- a `<script>` of the app's own, in `root.tsx` say, has no `nonce`
  attribute.

**Fix:** reveal the entry and pass `nonceOf(loadContext)` to both
([guide](guide/csp-nonce.md#a-csp-nonce)). A script of your own reads the nonce
through a loader, where `nonceOf(context)` works as well:

```tsx
// app/root.tsx
import { nonceOf } from '@alxia/react-router';
import type { Route } from './+types/root';

export function loader({ context }: Route.LoaderArgs) {
	return { nonce: nonceOf(context) };
}

// in Layout: <script nonce={useRouteLoaderData('root')?.nonce}>…</script>
```

Check what was sent with
`curl -s -A 'Mozilla/5.0 Chrome/130' http://localhost:5173/ | grep -o '<script[^>]*>'`:
every tag should hold `nonce="…"`, the value of the response's
`Content-Security-Policy`.

### A loader reads `null` from the app's own key

The same cause as [`Error: No value found for context`](#error-no-value-found-for-context),
with a key that has a default: `createContext<User | null>(null)`. The
loader silently reads the default. Serve the app with the plugin, or read
the context through `alxiaOf`.

### A page answers alxia's JSON 404 or 405 instead of rendering

`{"error":"not_found"}` or `{"error":"method_not_allowed"}` where a page
was expected.

**Why:** an alxia route's path covers the page's, and the core ranks it
first wherever it was declared: segment by segment, a literal beats a
parameter, which beats the catch-all's `/*`. Then the path is chosen
before the method. So:

- `GET /:slug` takes `/about`, and every other one-segment page;
- `POST /account` alone makes `GET /account` a 405, not the page;
- a folder of `public/`, `public/blog/`, becomes `static('/blog', …)`, and
  `/blog/first-post` is its 404.

**Fix:** keep alxia's routes under a prefix the pages do not use, and
`public/`'s folders apart from the page paths:

```ts
createServer({
	configure: (app) =>
		app.get('/api/posts/:slug', ({ params, reply }) => reply.ok({ slug: params.slug })),
});
```

### A streamed page arrives in one piece

The shell and its `<Suspense>` fallback should come first, and the
deferred value later. If the whole page comes at once:

- **The client is a bot to `isbot`.** React Router's entry waits for
  `allReady` before it answers a bot, and `isbot('Bun/1.4.2')` is `true`:
  Bun's `fetch`, `curl` and most test clients get the finished page. Send a
  browser's user agent:

  ```ts
  const BROWSER = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  await fetch(url, { headers: { 'user-agent': BROWSER } });
  ```

- **A compressor holds the stream.** One that does not flush after each
  chunk sends the page when it ends. `@alxia/compress` flushes a body with
  no `Content-Length` as it comes, so the cause is elsewhere: a proxy or a
  CDN in front of the server that buffers to compress. Compare with
  `accept-encoding: identity`, then without the proxy.

### The logger times a streamed page at a few milliseconds

`@alxia/logger` writes its entry when the response's headers leave, so a
page that streams for 800 ms is logged at its first byte. The duration is
the server's time to first byte, not the page's.

### A page, or a missing path, answers 401 behind a guard

A guard given to `use` in `configure` or `beforeAll` runs on every request
it is in front of, a request no route matches included, and answers before
the 404. An anonymous request to `/nope` gets the 401, not the 404, and so
does the login page the guard sits in front of. Scope the guard to what it
guards, with a path. A path-scoped `use` takes a middleware that adds nothing
to the context, so `bearer`, which adds `user`, does not compile there: write
the guard as a middleware that only refuses. The pages are a catch-all outside
any `group`, so a `group` would not reach them.

```ts
import { defineMiddleware } from '@alxia/core';

const account = defineMiddleware(async ({ request, reply }, next) => {
	const token = request.headers.get('authorization')?.slice('Bearer '.length) ?? '';
	return (await jwt.verify(token)).ok ? next() : reply(401, { error: 'unauthorized' as const });
});

createServer({
	configure: (app) => app.use('/account', account), // the pages under /account only
});
```

### The logger, CORS or secure headers miss the client's files

A middleware in `configure` runs for the routes declared after it. The
client's files are declared before `configure`, after `beforeAll`: what must
see them too goes in `beforeAll`.

```ts
createServer({
	beforeAll: (app) => app.use(logger()).use(secureHeaders()),
});
```

### A `page()` is not served under `react-router dev`

The app declares a `page()`, or reads `ctx.server.url`, `requestIP` or
`timeout`, or `ctx.ip`, under `react-router dev` or `vite preview`; the same
code works from `bun build/server/index.js`.

**Why:** under `@alxia/react-router/vite`, Vite owns the dev server, and
the preview server under `vite preview`: a `node:http` server, not a
`Bun.Server`. An HTTP request reaches the app through
`app.fetch(request, side)`, where `side` is the loopback `Bun.serve` the
plugin relays the app's sockets to. So `ctx.server` is that side server: its
`publish` reaches the app's sockets, but its `url` is the loopback port's,
and its `requestIP` and `timeout` know nothing of a request Vite took, so
the default `ctx.ip` is `undefined`. A `page()` (Bun's HTML bundle) is not
served: Vite answers the HTML
([The server](guide/typing-the-loaders.md#the-server-server)).

**Fix:** read `ctx.server` as optional, which also covers `app.request` in
a test, and take nothing from its `url` or `requestIP` in dev:

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';

export default createServer({
	configure: (app) =>
		app.get('/api/uptime', ({ server, reply }) =>
			reply.ok({ pending: server?.pendingRequests ?? null }),
		),
});
```

Let Vite and React Router serve the HTML in dev; a `page()` is for an app
without React Router.

### A `publish` under `react-router dev` misses the sockets opened before an edit

Two clients in one room; after an edit to `app/server.ts`, a message one
sends no longer reaches the other.

**Why:** an edit to the server makes a new app, and the plugin starts a
new `Bun.serve` for it on the next upgrade or request, so that new connections use
the new handlers. A socket opened before the edit stays on the previous
server, with the handlers it opened with, and a topic is one server's.

**Fix:** reconnect the clients after an edit: reload their pages. From
the build there is one server, and every socket shares its topics.

### The build has a package's Node variant, not its `bun` one

A dependency ships a `bun` variant, and the server runs its other one.

**Why:** the plugin adds the `bun` condition, and the package's `exports`
decides which of its conditions comes first: read top to bottom, the
first one the build has wins. A package listing `node` or `import` before
`bun` gives that variant, under the plugin as under Bun itself.

**Fix:** none in the config can reorder a package's `exports`; that is
the package's to change. To check which file a condition picks, ask Bun:

```sh
bun -e "console.log(import.meta.resolve('some-package'))"
```

### `request.url` in a loader is `http://` and the internal host behind a proxy

**Why:** a proxy that terminates TLS asks the app over plain HTTP, on an
address of its own, and React Router reads the request as it reached the
app unless the server trusts the proxy. Without `proxy`, or from a
connection `trusted` does not name, the forwarded headers are ignored.

**Fix:** give `createServer` (or `alxia()`, for a server of your own) the
proxies, and have the proxy set `X-Forwarded-Proto` and `X-Forwarded-Host`:

```ts
// app/server.ts
import { trustProxy } from '@alxia/core';
import { createServer } from '@alxia/react-router';

export default createServer({ proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) });
```

React Router then gets its request at `originalUrl(ctx)`
([Behind a proxy](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/serving.md#behind-a-proxy-proxy)).

### An unhashed file under `public/assets/` is cached for a year

A file you put in `public/assets/` (a sprite, an icon) changes on a deploy,
and visitors keep the old one.

**Why:** Vite copies `public/` into `build/client/`, and the client's files
under `build/client/assets/` are served `public, max-age=31536000,
immutable`, hashed or not. The worker's `cachingFor` agrees by default:
everything under `/assets/` is `immutable`, cache-first.

**Fix:** keep unhashed files out of `assets/`: `public/icons/` is served for
an hour and is `static` for the worker. If they must stay there, give
`cachingFor` an `immutable` option that leaves their folder out, so the worker
revalidates them ([the option](guide/pwa.md#what-the-worker-caches)),
and expect the HTTP cache to hold them for a year until the file's name
changes.

### A cache the contract did not make is swept

Signing out, or a new worker activating, deletes a cache the app made itself.

**Why:** a contract owns every cache named exactly
`<prefix>-<kind>-<version>`, kind being lowercase letters and digits and
version having no `-`. That includes a kind the app retired (`my-app-pages-v0` is swept once
it is not current). It is also why `app` and `app-admin` can share an origin:
`app-admin-assets-v1` has one segment too many to be `app`'s. Contracts never
take each other's caches; only a cache made by other code, such as
`my-app-runtime-v1`, matches the shape and is swept.

**Fix:** name your own caches outside the shape. A name is outside it when it
has more than `<kind>-<version>` after `<prefix>-`, with the prefix `my-app`:
`my-app-runtime-v1-x`. A kind with an uppercase letter, `_` or `.`
(`my-app-Runtime-v1`, `my-app-run_time-v1`), or a different prefix, is outside
too.

### The update notice never shows

A new version is deployed and the page offers no "Reload".

**Why:** the notice is offered only when a worker finished installing while
an older one controls the page. A first install controls nothing, so it
offers nothing; the next visit, with the first worker in control, does. And
nothing is registered at all where the app does not call
`registerServiceWorker` (for example while `useServiceWorker({ enabled })`
is given `false`, as `import.meta.env.PROD` is under `react-router dev`). A
tab that chose "Later" stays quiet until the next session.

**Fix:** build, serve and load the page twice, then deploy a change and load
it again. In the console, `navigator.serviceWorker.controller` must not be
`null` and `(await navigator.serviceWorker.getRegistration()).waiting` must
hold the new worker.

### The worker registers under `react-router dev`

The dev server serves stale code after an edit, or a page keeps an old
version of itself, and `navigator.serviceWorker.controller` is not `null`.

**Why:** `useServiceWorker` registers whenever `enabled` is `true`, and the
package does not know the mode: it never reads `import.meta.env`. A worker
under a dev server caches the code you are editing.

**Fix:** pass the mode from the app, `useServiceWorker({ enabled:
import.meta.env.PROD })` ([the hook](guide/pwa.md#in-react)). Then unregister
the worker the dev server already took (DevTools, Application, Service
Workers, Unregister) and clear its site data.

### The service worker is not built

`react-router build` ends and there is no `build/client/service-worker.js`.

**Why:** `alxia()` builds no worker when the file is not at
`app/service-worker.ts` (the `appDirectory` of `react-router.config.ts` may
hold another) and no `worker` option names it, when `worker: false` is set,
or when the version of `@alxia/react-router` is older than 0.10.

**Fix:** put the file at `app/service-worker.ts`, or name it with
`alxia({ worker: 'app/pwa/worker.ts' })`, and update the package.

### Offline, a client navigation to a route never visited shows the offline page

The page opens offline, but a link to a route the user never opened leads to
`/offline.html`.

**Why:** React Router asks `/__manifest` for the routes a link needs, and the
worker never caches that request.

**Fix:** set `routeDiscovery: { mode: 'initial' }` in `react-router.config.ts`,
so the client has every route from its first load.

### An update waits an hour

A new worker is deployed and tabs still run the old one for up to an hour.

**Why:** the worker's script was served with the client's hour of
`Cache-Control`, so the browser's update check found the cached script.
Either `noCache` is not declared, or it is declared in `configure`, which
runs after the client's files: they answer first and the middleware never
sees the request.

**Fix:** declare it in `beforeAll`
([serving the worker's script](guide/pwa.md#serving-the-workers-script)), and
check with `curl -I https://your.app/service-worker.js` that `cache-control` is
`no-cache`.

### The worker cannot fetch another origin

The console reports `Refused to connect to 'https://api.example.com/…' because it violates the following Content Security Policy directive: "connect-src 'self'"` from the worker.

**Why:** `noCache` gives the worker's script `WORKER_POLICY`,
`default-src 'none'; connect-src 'self'`: the worker fetches this site only.

**Fix:** if the worker really must reach another origin, serve the script
with a wider policy through `revalidated(response, policy)` in a middleware of
your own ([serving the worker's script](guide/pwa.md#serving-the-workers-script)),
rather than loosening the pages' policy.

### The manifest is in the wrong language

The installed app's name and description are in the default language,
whatever the user chose.

**Why:** the browser fetches the manifest without cookies, so the `language`
cookie never reaches the server. Only the link's query does.

**Fix:** link `manifestHref(language)` (`/manifest.webmanifest?lang=fr`), and
read it with `manifestLanguage(url, supported, fallback)`; the fallback is a
supported language the app resolves from the request's `Accept-Language`, not
from the cookie ([the manifest route](guide/pwa.md#the-web-app-manifest-and-why-the-language-travels-in-lang)).

### A form's own check shows the code (`todos.errors.…`) instead of words

A refinement with `params: { code: 'todos.errors.title-taken' }` shows the
code itself, or the form library's generic text, where the API's words should
be.

**Why:** `apiCodeResolver` returns the code unchanged when its `messages`
store has no text for it in the page's language, and the form library then
words the issue itself. In the browser the store holds only what the root's
data brought: the code is not in that list (the app's `clientCodes`), or
`ApiMessagesProvider` is not around the routes, or it was given another store
than the resolver's.

**Fix:** add the code to the few the root sends, and wrap the routes with the
provider on the same instance the resolver reads:

```tsx
<ApiMessagesProvider messages={apiMessages} value={loaderData.apiMessages}>
	<Outlet />
</ApiMessagesProvider>
```

Check it with `apiMessages.messageOf('fr', code)` in the browser's console
or a spec ([the catalogue store](guide/errors.md#the-catalogue-store)).

### A message shows its `{braces}`

A refusal reads `{count, plural, one {One item} other {# items}} outside {name}.`
or `Hello {name}`, braces and all.

**Why:** the `format` given to `createApiMessages` is not an ICU formatter
(an identity function, a plain `replace`), or a value the message names is
missing and the formatter handed back the raw message. `apiMessage` returns
`undefined` for a message the formatter reported to `onError`, but a
formatter that never calls it returns the text as it found it.

**Fix:** pass the app's ICU formatter, such as `@nxgt/material`'s
`formatMessage`, and make it call `onError` for a message it cannot format:

```ts
const apiMessages = createApiMessages<'en' | 'fr'>({ format: formatMessage });
```

A value is missing when the API's `extensions.params` lacks an argument the
message names; the same call in a spec shows which.

### A refusal shows the API's raw message

A page shows `Variable "$email" got invalid value …` or another message the
API worded for developers, instead of the app's words.

**Why:** the error has no API code (a raw `BAD_USER_INPUT`, from a check that
failed before the API's validation layer), or a code that `isApiCode`
rejects. Without `refused`, `createApiErrors` says the API's own message for
such an error.

**Fix:** pass `refused`, the app's generic refusal; it replaces the raw
message for every error that is not an API code
([wording a refusal](guide/errors.md#wording-a-refusal)):

```ts
export const apiErrors = createApiErrors<'en' | 'fr'>({
	messages: apiMessages,
	unavailable: (language) => translate('app.error.unavailable', language),
	refused: (language) => translate('app.error.refused', language),
});
```

### `apiRefusal` returns undefined

`apiErrors.apiRefusal(error, language)` gives `undefined` for a call that
failed, and the action returns nothing useful.

**Why:** the error is neither an API error (`isApiErrorLike`) nor a 503
`Response`: a network failure, a `TypeError` of the app's own code, a 404.
`apiRefusal` words only what the API refused or could not be reached for.

**Fix:** rethrow what it does not word, so the route's error boundary shows
it:

```ts
const refusal = apiErrors.apiRefusal(error, 'en');
if (!refusal) throw error;
```

### The error page shows no request id

The root's `ErrorBoundary` calls `errorRequestId(error)` and gets `undefined`,
though the API logged the request.

**Why:** `routeError` carries the `requestId` the error already has; it never
reads it from the network. An `ApiError` has none unless the code that called
the API set it, and a thrown `Response` is turned into a route error only when
it has the `x-request-id` header. A loader that returns `routeError(error)`
instead of throwing it never reaches the boundary at all.

**Fix:** keep the id on the error where the API is called, and `throw` what
`routeError` gives back
([loaders and the error page](guide/errors.md#loaders-and-the-error-page)):

```ts
import { requestIdOf, routeError } from '@alxia/react-router/errors';

// Your own call to the API, declared here as a stub.
declare function call(): Promise<Response>;

export async function loader() {
	const response = await call();
	if (!response.ok) {
		// A Response of 401, 403, 404 or 503 with the header is a route error.
		throw routeError(response);
	}
	return { requestId: requestIdOf(response) };
}
```

### An action shows the error page

An action that calls `fetcherResult`, `fetcherRefusal` or `submitForm` ends on
the route's error page instead of answering `{ ok: false }` or the form's
errors.

**Why:** by design, these helpers answer only what the page can word. They
throw `routeError(error)` for a 401 (the session code redirects to the sign-in
first), for a failure that is not an API refusal (a network error, a bug of the
app's own code), and, for `submitForm`, for a 404 that names none of the
form's fields: the record itself is gone, and no field message could say so.

**Fix:** none is needed for a 401 or a real failure: the error page is the
right answer. For a 404 that is about a field, name it in `fieldOf`
(`(path) => (path === 'todo.id' ? 'id' : undefined)`) so it sits under that
field. For a refusal you would rather word yourself, build on `apiRefusal`,
which returns `undefined` instead of throwing:

```ts
const refusal = apiErrors.apiRefusal(error, 'en');
if (!refusal) throw error;
return Response.json(
	{ ok: false, error: refusal.message },
	{ status: refusal.status },
);
```

### Behind a TLS proxy every action answers 403

Every action that reads JSON answers 403 `Cross-site request refused`
in production, yet works under `react-router dev` and in the specs.

**Why:** `jsonActions()` compares the browser's `Origin` (`https://app.example.com`)
with the origin of `request.url`. Behind a proxy that terminates TLS the
app is asked over plain HTTP on an internal host (`http://10.0.0.5:3000`),
so no post matches. See also
[`request.url` in a loader is `http://`](#requesturl-in-a-loader-is-http-and-the-internal-host-behind-a-proxy).

**Fix:** name the proxy with `createServer({ proxy: trustProxy(…) })`
(`trustProxy` is `@alxia/core`'s; see
[Behind a proxy](guide/customising-the-server.md#behind-a-proxy)). The
catch-all hands React Router the URL `originalUrl` reads from the trusted
proxy's `X-Forwarded-Proto` and `X-Forwarded-Host`, so an action's
`request.url` already carries the public origin and `jsonActions()` needs no
`origin`. Without a trusted proxy, or when the proxy does not send those
headers, pass the public origin, as a string or as a getter read at each
request (so a value set at startup is found):

```ts
import { jsonActions } from '@alxia/react-router/errors';

export const { readJson, requireJsonPost, readInput } = jsonActions({
	origin: () => process.env.APP_ORIGIN,
});
```

When the getter returns `undefined`, the request's own origin is used, so
development needs no setting. An empty string is not `undefined`: it is
kept, and every request with an `Origin` is refused.

### Right after start, refusals read in the API's words

For the first seconds after the server starts, a refusal shows the message
the API worded (in its default language, say) instead of the page's language.
It reads right a few seconds later.

**Why:** a language's catalogue is read on first use, and a request waits for
it only up to `firstReadWaitMs` (1.5 seconds by default), counted from when the
read started. A slow API, or a failed read, lets the request go on with the
API's own words; the read carries on in the background (or is retried after
`retryMs`), and the next request finds it held.

**Fix:** read both languages at startup, so the first request finds them held.
In `server.ts`:

```ts
import { catalogue } from './catalogue.server';

catalogue.warm();
```

Raise `firstReadWaitMs` only if the page should wait longer for the first
words; it holds every cold request that long when the API hangs.

### Sign-in loops on `http://localhost` in Safari

Signing in works in Chromium and Firefox. In Safari the app signs in, redirects, and lands back on the sign-in page, with no error.

**Why:** Safari (WebKit) drops a `Secure` cookie set over `http://localhost`, where the other browsers keep it. The session cookie never arrives, so the next request has no session.

**Fix:** pass `secure: false` in development. `secure: !import.meta.env.DEV` does it, and also drops the `__Host-` and `__Secure-` prefixes, which require `Secure`:

```ts
import { sessionCookies } from '@alxia/react-router/session';

export const cookies = sessionCookies({
	session: 'my-app_session',
	challenge: 'my-app_challenge',
	secure: !import.meta.env.DEV,
});
```

Never write `secure: false` for a deployed app: the token would travel over HTTP.

### A `__Host-` cookie is dropped

The browser's cookie panel shows no `__Host-` session cookie after a sign-in, or the response's `Set-Cookie` is ignored.

**Why:** a browser accepts a `__Host-` cookie only when it is `Secure`, has `Path=/` and no `Domain`, and the page is served over HTTPS (or `localhost` in Chromium and Firefox, never in Safari). The cookie the package writes always has `Path=/` and no `Domain`, so one of the others is wrong:

- the app is served over plain HTTP, such as a Docker image or a preview opened by its IP address, while `secure` is `true`;
- a proxy in front of the app rewrites or strips `Set-Cookie`, or adds a `Domain` attribute;
- another `Set-Cookie` header of the same name, set by the app, overwrites it.

**Fix:** serve the app over HTTPS, and keep `secure` `true` only there. Read `cookies.names.session` for the exact name, check the response header in the network panel, and make the proxy pass `Set-Cookie` as it is. In development over HTTP, `secure: !import.meta.env.DEV` sets an unprefixed cookie instead.
