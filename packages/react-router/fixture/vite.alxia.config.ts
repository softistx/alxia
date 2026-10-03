import { alxia } from '@alxia/react-router/vite';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// See vite.config.ts: these are linked, not installed.
	ssr: { external: ['@alxia/react-router', '@alxia/core'] },
	// After React Router's: the plugin runs first wherever it is listed.
	plugins: [reactRouter(), alxia()],
});
