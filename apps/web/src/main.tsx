// apps/web/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { installGlobalErrorHandlers } from './lib/errorReporter';
import './index.css';

// Global hata yakalayıcılar (window.onerror + unhandledrejection)
// Uygulama mount olmadan ÖNCE kur — erken hatalar da yakalansın
installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);