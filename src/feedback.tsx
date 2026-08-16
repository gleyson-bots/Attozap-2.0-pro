import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

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
    notifyError(event.reason);
  });
  window.addEventListener('error', event => {
    if (event.error) notifyError(event.error);
  });
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
