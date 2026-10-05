// The app: the base, then the routes. It is not registered.
import { base } from './context';
import { todos } from './routes/todos';

export const app = base
	.plugin(todos)
	.group((group) => group.plugin(todos))
	.plugin((plain) => plain.plugin(todos));

app.get('/me', ({ user, reply }) => reply(200, user.id));

// Two apps on one base, each on a fork of it: typed as the base, so the
// routes mount on both, and what one adds stays its own.
export const real = base.fork().plugin(todos);
export const variant = base
	.fork()
	.derive(() => ({ fake: true }))
	.plugin(todos)
	.get('/fake', ({ fake, user, reply }) => reply(200, `${fake} ${user.id}`));

// @ts-expect-error: the variant's derive is not on the real app
real.get('/fake', ({ fake, reply }) => reply(200, fake));
