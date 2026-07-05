import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import '@/index.css';

// Handle OAuth callback: Google redirects to /?access_token=...
// Store the token and clean the URL before React boots.
const params = new URLSearchParams(window.location.search);
const oauthToken = params.get('access_token');
if (oauthToken) {
  localStorage.setItem('access_token', oauthToken);
  params.delete('access_token');
  const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
  window.history.replaceState({}, '', clean);
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
