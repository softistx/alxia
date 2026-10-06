import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('slow', 'routes/slow.tsx'),
	route('boom', 'routes/boom.tsx'),
	route('missing', 'routes/missing.tsx'),
	route('login', 'routes/login.tsx'),
	route('live', 'routes/live.tsx'),
] satisfies RouteConfig;
