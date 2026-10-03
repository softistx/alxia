import { createContext } from 'react-router';

/** A key of the app's own: shared with the server only when the server is built with the app. */
export const greetingContext = createContext<string>('unset');
