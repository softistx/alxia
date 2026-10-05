import type { Manifest } from '../newest-peers';

export const manifests = new Map<string, Manifest>([
	[
		'packages/redis',
		{
			name: '@alxia/redis',
			peerDependencies: {
				'@alxia/core': 'workspace:^',
				'@nxgt/redis': '^0.3.1',
			},
			devDependencies: {
				'@alxia/core': 'workspace:^',
				'@nxgt/redis': '^0.3.1',
				zod: '^4.6.5',
			},
		},
	],
	[
		'packages/i18n',
		{
			name: '@alxia/i18n',
			peerDependencies: { '@nxgt/i18n': '^2.0.0' },
			devDependencies: { '@nxgt/i18n': '^2.0.0', '@nxgt/local': 'workspace:^' },
		},
	],
	[
		'packages/core',
		{ name: '@alxia/core', devDependencies: { '@nxgt/redis': '^0.3.1' } },
	],
]);

export const lock = {
	'@alxia/core': ['@alxia/core@workspace:packages/core'],
	'@nxgt/i18n': ['@nxgt/i18n@2.0.0', '', {}, 'sha512-a'],
	'@nxgt/redis': ['@nxgt/redis@0.3.1', '', {}, 'sha512-b'],
	zod: ['zod@4.6.5', '', {}, 'sha512-d'],
};
