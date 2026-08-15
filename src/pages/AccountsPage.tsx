import { useEffect, useState } from 'react';
import { Cable, Link2, LogOut, Plus, QrCode, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';

export function AccountsPage({ accounts, reload }: { accounts: any[]; reload: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [qr, setQr] = useState<{ accountId: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const offQr = window.attozap.accounts.onQr((payload: any) => setQr(payload));
    const offState = window.attozap.accounts.onState(async (payload: any) => {
      if (payload.status === 'connected' && qr?.accountId === payload.accountId) setQr(null);
      await reload();
    });
    const offError = window.attozap.accounts.onError((payload: any) => setError(payload.message));
    return () => { offQr?.(); offState?.(); offError?.(); };
  }, [reload, qr?.accountId]);

  async function create() {
    if (!name.trim()) return;
    setError('');
    await window.attozap.accounts.create(name.trim());
    setName('');
    await reload();
  }

  async function act(id: string, action: () => Promise<any>) {
    setBusy(id); setError('');
    try { await action(); await reload(); } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(null); }
  }

  return <div className="page-stack">
    <div className="page-head">
      <div><span className="kicker">MULTI ACCOUNT</span><h2>Contas do WhatsApp</h2><p>Cada conta possui sessão independente e persistente.</p></div>
      <button className="button ghost" onClick={() => void reload()}><RefreshCw size={16}/> Atualizar</button>
    </div>

    {error && <div className="notice error">{error}</div>}

    <section className="card account-create">
      <div className="field grow"><label>Nome da nova conta</label><input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && void create()} placeholder="Ex.: Comercial 01" /></div>
      <button className="button primary" onClick={() => void create()}><Plus size={17}/> Adicionar conta</button>
    </section>

    <section className="account-grid">
      {accounts.length === 0 && <div className="empty card"><QrCode size={30}/><h3>Nenhuma conta criada</h3><p>Adicione uma conta e conecte escaneando o QR Code no WhatsApp.</p></div>}
      {accounts.map(account => <article className="account-card card" key={account.id}>
        <div className="account-card-top">
          <div className={`account-logo ${account.status === 'connected' ? 'online' : ''}`}><Wifi size={20}/></div>
          <div className="grow"><h3>{account.name}</h3><p>{account.phone ? `+${account.phone}` : 'Ainda não identificado'}</p></div>
          <span className={`status-chip ${account.status}`}>{account.status === 'connected' ? 'Conectado' : account.status === 'qr' ? 'Aguardando QR' : account.status}</span>
        </div>
        <div className="account-meta"><span><Cable size={14}/> Baileys</span><span><Link2 size={14}/>{account.proxy ? ' Proxy configurado' : ' Sem proxy'}</span></div>
        <div className="account-actions">
          {account.status !== 'connected'
            ? <button className="button primary" disabled={busy === account.id} onClick={() => void act(account.id, () => window.attozap.accounts.connect(account.id))}><QrCode size={16}/> Conectar</button>
            : <button className="button ghost" disabled={busy === account.id} onClick={() => void act(account.id, () => window.attozap.accounts.disconnect(account.id, false))}><WifiOff size={16}/> Desconectar</button>}
          <button className="icon-button danger" title="Sair e apagar sessão" onClick={() => void act(account.id, () => window.attozap.accounts.disconnect(account.id, true))}><LogOut size={16}/></button>
          <button className="icon-button danger" title="Remover conta" onClick={() => void act(account.id, () => window.attozap.accounts.remove(account.id))}><Trash2 size={16}/></button>
        </div>
      </article>)}
    </section>

    {qr && <div className="modal-backdrop" onMouseDown={() => setQr(null)}><div className="qr-modal card" onMouseDown={e => e.stopPropagation()}><div className="qr-icon"><QrCode size={20}/></div><h3>Conectar WhatsApp</h3><p>No celular, abra <b>Aparelhos conectados</b> e leia este QR Code.</p><img src={qr.dataUrl} alt="QR Code de conexão"/><small>O QR é renovado automaticamente quando necessário.</small><button className="button ghost full" onClick={() => setQr(null)}>Fechar</button></div></div>}
  </div>;
}
