import { app } from './app';

const server = app.listen(Number(Bun.env['PORT'] ?? 3000));
console.log(`listening on ${server.url}`);
