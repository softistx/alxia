import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('slow', 'routes/slow.tsx'),
	route('hang', 'routes/hang.tsx'),
	route('boom', 'routes/boom.tsx'),
	route('late-boom', 'routes/late-boom.tsx'),
	route('shell-boom', 'routes/shell-boom.tsx'),
	route('missing', 'routes/missing.tsx'),
	route('login', 'routes/login.tsx'),
	route('live', 'routes/live.tsx'),
	route('refused', 'routes/refused.tsx'),
	route('online', 'routes/online.tsx'),
] satisfies RouteConfig;
