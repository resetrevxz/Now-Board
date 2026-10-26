import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/edit.css';
import './styles/present.css';
import './styles/screens.css';

const container = document.getElementById('root');
if (!container) throw new Error('Now Board could not find its root element.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
