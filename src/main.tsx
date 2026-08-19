import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary, GlobalFeedback, installGlobalErrorHandlers } from './feedback';
import './styles.css';
import './license.css';
import './sender.css';
import './campaign-center.css';
import './campaign-warmup.css';
import './group-tools.css';
import './feedback.css';
import './final-ui.css';
import './warmup-monitor.css';
import './rc3.css';
import './rc4.css';
import './system.css';
import './ui-polish.css';
import './ui-pages.css';
import './delivery-center.css';
import './support.css';

installGlobalErrorHandlers();
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('ROOT_ELEMENT_MISSING');
const root = createRoot(rootElement);

if (!(window as any).attozap) {
  root.render(
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b0d12', color: '#f4f7f5', fontFamily: 'Inter, system-ui, sans-serif', padding: 32 }}>
      <div style={{ maxWidth: 680, padding: 28, border: '1px solid #2b3430', borderRadius: 18, background: '#111612' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.16em', color: '#78d79b', marginBottom: 10 }}>ATTOZAP DIAGNOSTIC</div>
        <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>A ponte do aplicativo não foi carregada.</h1>
        <p style={{ margin: 0, lineHeight: 1.6, color: '#aeb8b2' }}>Código: PRELOAD_BRIDGE_MISSING. Feche o aplicativo e use a versão mais recente.</p>
      </div>
    </div>,
  );
} else {
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <GlobalFeedback />
        <App />
      </AppErrorBoundary>
    </React.StrictMode>,
  );
}
