import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// The package is linked from this workspace, not installed under
	// node_modules, so Vite would bundle a copy of it, with a second
	// `alxiaContext` the server never sets. An installed one is external.
	ssr: { external: ['@alxia/react-router'] },
	plugins: [reactRouter()],
});
