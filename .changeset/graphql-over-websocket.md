---
"@alxia/graphql": minor
---

Serve GraphQL over WebSocket with `ws: true`: the `graphql-transport-ws` protocol of `graphql-ws`, an optional peer, the default of Apollo Client's `GraphQLWsLink` and urql's `subscriptionExchange`, at the endpoint's path beside server-sent events. The upgrade runs the app's middlewares, so a guard refuses the socket and a resolver reads what they added; each operation runs through Yoga's plugins, with the client's `connectionParams` in its context (`GraphQLWsContext`); a shutdown closes the sockets with 1001 and completes their subscriptions. `ws: { path, keepAlive }` moves the socket or spaces its pings.
