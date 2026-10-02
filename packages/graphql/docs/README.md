# @alxia/graphql documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [Mounting the endpoint](guide/endpoint.md) | adding GraphQL to an app, choosing its path under a prefix, putting it behind a guard, reading what it answers, or testing it without a server |
| [The typed context](guide/context.md) | typing a schema with the app's context, reading `user` or a database handle in a resolver, setting a cookie, adding per-request loaders, or reading the `missing …` compile error |
| [Yoga's plugins and options](guide/yoga.md) | adding Yoga or Envelop plugins, exposing or masking errors, batching, serving subscriptions, or calling the endpoint from another origin |
| [GraphiQL and Apollo Sandbox](guide/ide.md) | choosing the IDE a browser gets, configuring it, keeping it working under a strict `Content-Security-Policy`, or turning it off in production |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |
