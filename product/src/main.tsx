import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, readStoredTheme } from './lib/theme';
import './styles.css';

// The dark forge palette is the default for every visitor (D-033). A stored choice wins; "system"
// is an explicit choice, never the default. `data-theme` is set before the first render.
applyTheme(readStoredTheme() ?? 'dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
