---
"@alxia/react-router": minor
---

The production server serves the client build compressed. `react-router build` writes `.br` and `.gz` copies beside every compressible file of `build/client` (1 kB and over; `alxia({ precompress: false })` writes none, `precompress: { minSize }` moves the threshold), and the server sends the copy a browser accepts, with `Content-Encoding`, `Vary: Accept-Encoding` and the same `Cache-Control`, for `assets/` and for the files at the top of the build alike. `createServer({ precompressed: false })` and `reactRouter(app, { precompressed: false })` serve the files as they are.
