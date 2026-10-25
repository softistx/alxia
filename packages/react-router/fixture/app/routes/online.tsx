import { manifestHref } from '@alxia/react-router/pwa';
import { useOnline } from '@alxia/react-router/pwa/react';

export default function Online() {
	const online = useOnline();
	return (
		<main>
			<p id="online">{online ? 'online' : 'offline'}</p>
			<p id="manifest">{manifestHref('en')}</p>
		</main>
	);
}
