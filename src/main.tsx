import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from '@/App.jsx';
import '@/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

registerSW({ immediate: true });
