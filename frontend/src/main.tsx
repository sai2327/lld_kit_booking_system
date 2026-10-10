import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

// Anti-flash: apply stored theme to <html> before first paint
(function () {
  const stored = localStorage.getItem('sek-theme');
  const theme = stored === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
