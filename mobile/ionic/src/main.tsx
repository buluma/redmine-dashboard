import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/capacitor';
import App from './App';

Sentry.init({
  dsn: 'https://b3676ccc7d5528b0b759c09646cf2f74@o4510889607430144.ingest.us.sentry.io/4510951252426752',
  tracesSampleRate: 1.0,
});

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);