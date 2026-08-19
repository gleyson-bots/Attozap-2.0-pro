import { useEffect, useState } from 'react';
import { BriefcaseBusiness, ExternalLink, FileUp, Linkedin, Plus, RefreshCw, Trash2, UserRoundSearch } from 'lucide-react';

export function RecruitingPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobId, setJobId] = useState('');
  const [message, setMessage] = useState('');
  const [job, setJob] = useState({ title: '', company: '', location: '', description: '' });

  async function reload() {
    const loadedJobs = await window.attozap.recruiting.jobs();
    setJobs(loadedJobs);
    setCandidates(await window.attozap.recruiting.candidates(jobId || undefined));
  }
  useEffect(() => { void reload(); }, [jobId]);

  async function saveJob() {
    try {
      const saved = await window.attozap.recruiting.saveJob(job);
      setJobId(saved.id); setJob({ title: '', company: '', location: '', description: '' }); setMessage('Vaga salva localmente.'); await reload();
    } catch (e: any) { setMessage(e?.message ?? String(e)); }
  }
  async function importCsv() {
    const result = await window.attozap.recruiting.importCsv(jobId || undefined);
    setMessage(`${result.imported} candidato(s) importado(s); ${result.skipped} linha(s) ignorada(s).`); await reload();
  }

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">RECRUTAMENTO</span><h2>Candidaturas & portais</h2><p>Central local para vagas, candidatos e acesso aos portais oficiais sem armazenar senhas.</p></div><button className="button ghost" onClick={() => void reload()}><RefreshCw size={15}/> Atualizar</button></div>
    {message && <div className="notice info">{message}</div>}
    <div className="notice info">O navegador integrado mantém a sessão do próprio site em uma partição isolada. O ATTOZAP não lê senha, cookies de autenticação nem raspa contatos privados. LinkedIn permite dados de conexões/contatos apenas para integrações aprovadas e sujeitas às permissões do usuário.</div>

    <section className="card"><div className="card-head"><div><h3>Portais</h3><p>Faça login diretamente no site oficial em janela isolada.</p></div><UserRoundSearch size={18}/></div><div className="portal-grid">
      <button onClick={() => void window.attozap.browser.openPortal('linkedin')}><Linkedin size={20}/><b>LinkedIn</b><small>Abrir portal oficial</small><ExternalLink size={14}/></button>
      <button onClick={() => void window.attozap.browser.openPortal('indeed')}><BriefcaseBusiness size={20}/><b>Indeed</b><small>Abrir portal oficial</small><ExternalLink size={14}/></button>
      <button onClick={() => void window.attozap.browser.openPortal('gupy')}><BriefcaseBusiness size={20}/><b>Gupy</b><small>Abrir portal oficial</small><ExternalLink size={14}/></button>
      <button onClick={() => void window.attozap.browser.openPortal('infojobs')}><BriefcaseBusiness size={20}/><b>InfoJobs</b><small>Abrir portal oficial</small><ExternalLink size={14}/></button>
      <button onClick={() => void window.attozap.browser.openPortal('catho')}><BriefcaseBusiness size={20}/><b>Catho</b><small>Abrir portal oficial</small><ExternalLink size={14}/></button>
    </div></section>

    <div className="tools-grid">
      <section className="card"><div className="card-head"><div><h3>Nova vaga</h3><p>Controle local antes de publicar nos portais.</p></div><Plus size={18}/></div><div className="field"><label>Título</label><input value={job.title} onChange={e => setJob(v => ({...v,title:e.target.value}))}/></div><div className="form-grid two"><div className="field"><label>Empresa</label><input value={job.company} onChange={e => setJob(v => ({...v,company:e.target.value}))}/></div><div className="field"><label>Local</label><input value={job.location} onChange={e => setJob(v => ({...v,location:e.target.value}))}/></div></div><div className="field"><label>Descrição</label><textarea value={job.description} onChange={e => setJob(v => ({...v,description:e.target.value}))}/></div><button className="button primary" onClick={() => void saveJob()}>Salvar vaga</button></section>
      <section className="card"><div className="card-head"><div><h3>Vagas</h3><p>{jobs.length} cadastrada(s)</p></div></div><div className="group-list">{jobs.map(item => <button key={item.id} className={jobId === item.id ? 'selected' : ''} onClick={() => setJobId(item.id)}><span className="group-avatar"><BriefcaseBusiness size={15}/></span><span><b>{item.title}</b><small>{item.company || 'Sem empresa'} · {item.location || 'Remoto/indefinido'}</small></span></button>)}</div></section>
    </div>

    <section className="card"><div className="card-head"><div><h3>Candidatos</h3><p>{candidates.length} registro(s){jobId ? ' da vaga selecionada' : ''}</p></div><button className="button ghost" onClick={() => void importCsv()}><FileUp size={15}/> Importar CSV autorizado</button></div><div className="maps-table"><div className="maps-table-head"><span>Nome</span><span>Contato</span><span>Origem</span><span>Status</span></div>{candidates.map(item => <div className="maps-row" key={item.id}><div><b>{item.name}</b><small>{item.profile_url || ''}</small></div><div><span>{item.phone ? `+${item.phone}` : item.email || '—'}</span><small>{item.email || ''}</small></div><div>{item.source || 'manual/CSV'}</div><div>{item.status}</div></div>)}</div></section>
  </div>;
}
