import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, RefreshCw, RotateCcw, X } from 'lucide-react';

type NoticeLevel = 'error' | 'success' | 'info';
type Notice = { id: string; level: NoticeLevel; message: string };
const EVENT = 'attozap:notice';
let installed = false;

export function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? 'Erro desconhecido');
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim() || 'A operação não pôde ser concluída.';
}

function reportRendererError(error: unknown, kind: string, componentStack?: string) {
  const bridge = (window as any).attozap?.diagnostics?.reportRendererError;
  if (typeof bridge !== 'function') return;
  const normalized = error instanceof Error ? error : new Error(String(error ?? 'Erro desconhecido'));
  void bridge({
    kind,
    message: normalized.message,
    stack: normalized.stack ?? '',
    componentStack: componentStack ?? '',
    href: window.location.href,
  }).catch(() => undefined);
}

export function notify(message: string, level: NoticeLevel = 'info') {
  window.dispatchEvent(new CustomEvent(EVENT, {
    detail: { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, level, message },
  }));
}

export function notifyError(error: unknown) {
  notify(errorMessage(error), 'error');
}

export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;
  window.addEventListener('unhandledrejection', event => {
    event.preventDefault();
    reportRendererError(event.reason, 'unhandledrejection');
    notifyError(event.reason);
  });
  window.addEventListener('error', event => {
    if (event.error) {
      reportRendererError(event.error, 'window.error');
      notifyError(event.error);
    }
  });
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; resetting: boolean }> {
  state: { error: Error | null; resetting: boolean } = { error: null, resetting: false };

  static getDerivedStateFromError(error: Error) {
    return { error, resetting: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportRendererError(error, 'react.error-boundary', info.componentStack ?? '');
  }

  private async resetUi() {
    this.setState({ resetting: true });
    try {
      const reset = (window as any).attozap?.diagnostics?.resetUi;
      if (typeof reset === 'function') await reset();
    } finally {
      window.location.reload();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const message = errorMessage(this.state.error);
    return <div style={{ minHeight: '100vh', background: '#0b0d12', color: '#f4f7f5', display: 'grid', placeItems: 'center', padding: 28, fontFamily: 'Inter, Segoe UI, system-ui, sans-serif' }}>
      <main style={{ width: 'min(760px, 100%)', border: '1px solid #29322e', borderRadius: 20, background: '#111612', padding: 30, boxShadow: '0 24px 80px rgba(0,0,0,.32)' }}>
        <div style={{ color: '#78d79b', fontWeight: 800, letterSpacing: '.14em', fontSize: 11 }}>ATTOZAP RECOVERY</div>
        <h1 style={{ margin: '12px 0 8px', fontSize: 26 }}>A interface encontrou um erro.</h1>
        <p style={{ color: '#aeb8b2', lineHeight: 1.6, margin: '0 0 18px' }}>A janela continua funcionando. O erro foi registrado localmente e seus contatos, sessões e licença não foram apagados.</p>
        <div style={{ border: '1px solid #3b2b2f', background: '#160f12', color: '#ffadb4', padding: 14, borderRadius: 12, fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word' }}><b>RENDERER_CRASH</b><br/>{message}</div>
        <details style={{ marginTop: 14, color: '#909b94', fontSize: 12 }}><summary style={{ cursor: 'pointer' }}>Detalhes técnicos</summary><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 12, background: '#0c100d', borderRadius: 10 }}>{this.state.error.stack ?? message}</pre></details>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
          <button onClick={() => window.location.reload()} style={{ height: 40, padding: '0 16px', border: 0, borderRadius: 10, background: '#7657ff', color: 'white', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}><RefreshCw size={16}/> Recarregar</button>
          <button disabled={this.state.resetting} onClick={() => void this.resetUi()} style={{ height: 40, padding: '0 16px', border: '1px solid #344039', borderRadius: 10, background: '#151b17', color: '#e9eeeb', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}><RotateCcw size={16}/> {this.state.resetting ? 'Resetando...' : 'Resetar somente a interface'}</button>
        </div>
        <p style={{ color: '#66716a', margin: '16px 0 0', fontSize: 11 }}>O reset remove apenas preferências <code>ui_*</code>. Não remove banco, licença, sessões do WhatsApp, campanhas ou contatos.</p>
      </main>
    </div>;
  }
}

export function GlobalFeedback() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    const listener = (event: Event) => {
      const notice = (event as CustomEvent<Notice>).detail;
      setNotices(current => [...current.slice(-3), notice]);
      window.setTimeout(() => {
        setNotices(current => current.filter(item => item.id !== notice.id));
      }, notice.level === 'error' ? 7000 : 4200);
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, []);

  if (!notices.length) return null;
  return <div className="global-toast-stack" aria-live="polite">
    {notices.map(notice => <div key={notice.id} className={`global-toast ${notice.level}`}>
      <span className="global-toast-icon">
        {notice.level === 'error' ? <AlertCircle size={18}/> : notice.level === 'success' ? <CheckCircle2 size={18}/> : <Info size={18}/>}
      </span>
      <p>{notice.message}</p>
      <button onClick={() => setNotices(current => current.filter(item => item.id !== notice.id))} aria-label="Fechar"><X size={15}/></button>
    </div>)}
  </div>;
}
