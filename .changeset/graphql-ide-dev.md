---
"@alxia/graphql": minor
---

GraphiQL follows the serving app's dev switch: by default it answers a browser in dev alone (`NODE_ENV=development`, or `alxia({ dev: true })`), and nothing outside it — it used to be on everywhere unless `ide: false`. `ide: 'graphiql'` serves it everywhere, as before. Its page's `Content-Security-Policy` allows exactly the pinned `https://unpkg.com/@graphql-yoga/graphiql@<version>/` folder the page loads from, for its scripts, styles, fonts and the Monaco workers it fetches (which the old `connect-src 'self'` blocked), instead of all of unpkg.com, and adds `frame-ancestors 'none'`.
