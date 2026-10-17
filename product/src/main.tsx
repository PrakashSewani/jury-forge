import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, readStoredTheme } from './lib/theme';
import './styles.css';

// Resolve the stored preference (defaulting to the system preference) before the first render,
// so `data-theme` is set from the start and the dark overrides apply immediately.
applyTheme(readStoredTheme() ?? 'system');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
