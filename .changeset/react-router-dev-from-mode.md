---
"@alxia/react-router": patch
---

The app `createServer()` makes is in dev in React Router's `development` mode alone: a production build answers a 500 without its stack, and prints no route table, whatever `NODE_ENV` says.
