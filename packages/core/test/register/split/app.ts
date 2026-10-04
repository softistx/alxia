// The app: the base, then the routes. It is not registered.
import { base } from './context';
import { todos } from './routes/todos';

export const app = base.use(todos);

app.get('/me', ({ user, reply }) => reply(200, user.id));
