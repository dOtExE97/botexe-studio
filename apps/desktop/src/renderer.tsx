import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './renderer/App';
import './renderer/styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root fehlt im index.html');
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
