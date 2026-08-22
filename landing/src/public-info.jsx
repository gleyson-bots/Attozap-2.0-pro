import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, BadgeCheck, Download, FileText, LockKeyhole, RefreshCw, Scale, ShieldCheck, Sparkles } from 'lucide-react';

const updated = '21 de agosto de 2026';

const documents = {
  '/termos': {
    icon: Scale, eyebrow: 'TERMOS DE USO', title: 'Termos de Uso do ATTOZAP', intro: `Última atualização: ${updated}.`,
    sections: [
      ['1. Aceitação', 'Ao criar uma conta, contratar um plano, utilizar o portal, instalar ou usar o ATTOZAP WASender Pro, você declara que leu e aceita estes Termos, a Política de Privacidade, as Condições Comerciais e a Licença de Uso.'],
      ['2. Uso permitido', 'O ATTOZAP deve ser utilizado apenas para comunicações legítimas, autorizadas e compatíveis com a legislação aplicável e com as regras das plataformas utilizadas. O cliente é responsável pelas listas, destinatários, conteúdo e finalidade das mensagens.'],
      ['3. Conta e segurança', 'Você é responsável por manter suas credenciais protegidas, utilizar senhas fortes e comunicar imediatamente qualquer acesso não autorizado. Podemos bloquear contas diante de fraude, abuso, chargeback indevido, violação destes Termos ou risco à plataforma.'],
      ['4. Planos, limites e disponibilidade', 'Recursos, limites, canais, usuários e funcionalidades dependem do plano contratado. Podemos evoluir a plataforma e substituir componentes técnicos mantendo o objetivo funcional do produto.'],
      ['5. Serviços de terceiros', 'Pagamentos, envio de e-mails, banco de dados, hospedagem e integrações podem depender de terceiros como Mercado Pago, Stripe, Resend, Turso e Vercel. A disponibilidade desses serviços também está sujeita aos termos dos respectivos fornecedores.'],
      ['6. Responsabilidades', 'Não garantimos ausência absoluta de indisponibilidade, bloqueios ou alterações realizadas por serviços externos. O cliente deve manter práticas adequadas de consentimento, segurança, backup e conformidade.'],
      ['7. Suspensão e encerramento', 'Podemos suspender acessos que coloquem usuários, infraestrutura ou terceiros em risco. O cliente pode solicitar cancelamento conforme as condições do plano e do meio de pagamento utilizado.'],
      ['8. Contato', 'Dúvidas contratuais, suporte e solicitações relacionadas ao uso da plataforma podem ser encaminhadas pelos canais oficiais exibidos no site.'],
    ],
  },
  '/privacidade': {
    icon: ShieldCheck, eyebrow: 'PRIVACIDADE', title: 'Política de Privacidade', intro: `Última atualização: ${updated}.`,
    sections: [
      ['1. Dados tratados', 'Podemos tratar nome, e-mail, dados de conta, informações de plano, pagamentos, licenças, fingerprint do dispositivo, logs técnicos, endereço IP, registros de auditoria e interações com suporte.'],
      ['2. Finalidades', 'Os dados são utilizados para autenticação, segurança, cobrança, emissão de licenças, suporte, prevenção a fraude, entrega de atualizações, comunicações transacionais e melhoria do serviço.'],
      ['3. Compartilhamento', 'Compartilhamos apenas os dados necessários com prestadores que viabilizam o serviço, como processadores de pagamento, hospedagem, banco de dados e envio de e-mail, observadas as finalidades descritas nesta política.'],
      ['4. Segurança', 'Utilizamos senhas com hash, cookies HttpOnly, trilha de auditoria, tokens temporários, validação de webhooks e controles de acesso por função. Nenhum sistema, porém, elimina completamente todos os riscos.'],
      ['5. Retenção', 'Mantemos dados pelo período necessário à prestação do serviço, cumprimento de obrigações, prevenção a fraude, exercício regular de direitos e histórico contratual.'],
      ['6. Direitos', 'Você pode solicitar confirmação de tratamento, acesso, correção, informações sobre compartilhamento, oposição quando aplicável e exclusão nos limites previstos pela legislação.'],
      ['7. Cookies', 'O portal utiliza cookies estritamente necessários para sessão e segurança. Integrações de terceiros podem utilizar mecanismos próprios conforme suas políticas.'],
      ['8. Contato de privacidade', 'Solicitações relacionadas à privacidade podem ser encaminhadas ao canal de suporte oficial do ATTOZAP.'],
    ],
  },
  '/condicoes': {
    icon: FileText, eyebrow: 'CONDIÇÕES COMERCIAIS', title: 'Planos, cobrança e cancelamento', intro: `Última atualização: ${updated}.`,
    sections: [
      ['1. Contratação', 'Planos podem ser contratados pelo portal por meios de pagamento habilitados. A ativação ocorre após a confirmação do provedor de pagamento e a sincronização da licença.'],
      ['2. Assinaturas recorrentes', 'Assinaturas recorrentes seguem a periodicidade e regras apresentadas no checkout do provedor. Cancelamentos interrompem futuras cobranças conforme o processamento do meio de pagamento.'],
      ['3. PIX', 'Pagamentos via PIX são avulsos. Quando oferecidos como período de licença, a validade informada no checkout começa após a confirmação oficial do pagamento pelo Mercado Pago.'],
      ['4. Reembolsos', 'Pedidos de reembolso são analisados conforme a legislação aplicável, o estágio de utilização, a natureza do produto digital e os registros de ativação/licenciamento.'],
      ['5. Alterações de preço', 'Novos preços podem ser aplicados a futuras contratações ou renovações mediante comunicação quando exigida. Ofertas promocionais podem ter prazo, público e condições específicas.'],
      ['6. Inadimplência e chargeback', 'Pagamentos recusados, estornados ou contestados podem suspender a licença vinculada até regularização e análise.'],
    ],
  },
  '/licenca': {
    icon: BadgeCheck, eyebrow: 'LICENÇA DE USO', title: 'Licença do software ATTOZAP', intro: `Última atualização: ${updated}.`,
    sections: [
      ['1. Natureza da licença', 'A contratação concede direito limitado, revogável, não exclusivo e não transferível de uso do software durante o período e limites contratados. Não ocorre transferência de propriedade intelectual.'],
      ['2. Ativação', 'A licença pode ser vinculada a fingerprint, número de instâncias, usuários, canais e outros limites técnicos definidos pelo plano.'],
      ['3. Restrições', 'É proibido revender chaves sem autorização, remover mecanismos de licenciamento, compartilhar credenciais indevidamente, adulterar assinaturas digitais ou utilizar o software para atividades ilegais.'],
      ['4. Atualizações', 'Atualizações podem incluir correções de segurança, compatibilidade e mudanças funcionais. Versões obrigatórias podem ser exigidas quando versões antigas gerarem risco ou incompatibilidade.'],
      ['5. Revogação', 'Licenças podem ser revogadas em caso de fraude, chargeback, violação contratual, uso não autorizado ou encerramento do plano.'],
    ],
  },
  '/lgpd': {
    icon: LockKeyhole, eyebrow: 'LGPD', title: 'Privacidade e proteção de dados', intro: `Última atualização: ${updated}.`,
    sections: [
      ['Controlador e operador', 'Dependendo do fluxo, o ATTOZAP pode atuar como controlador de dados da conta e como fornecedor de tecnologia utilizada pelo cliente em seus próprios processos. O cliente continua responsável pela base legal dos dados inseridos e pelas comunicações que realiza.'],
      ['Bases legais', 'O tratamento pode se apoiar na execução de contrato, cumprimento de obrigação legal, exercício regular de direitos, legítimo interesse e consentimento quando aplicável.'],
      ['Direitos do titular', 'Solicitações são avaliadas de acordo com a identidade do solicitante, a natureza do dado, obrigações de retenção e os limites previstos na Lei nº 13.709/2018.'],
      ['Segurança e incidentes', 'Mantemos controles técnicos e administrativos proporcionais à natureza do serviço. Incidentes relevantes são tratados conforme avaliação de risco e requisitos legais.'],
      ['Responsabilidade do cliente', 'O cliente deve coletar, importar e utilizar contatos apenas quando possuir base legal adequada, respeitando opt-out, finalidade, transparência e demais obrigações aplicáveis.'],
    ],
  },
};

function Brand() {
  return <a className="public-brand" href="/"><span><img src="/logo.svg" alt="ATTOZAP"/></span><strong>ATTOZAP<small>WASENDER PRO</small></strong></a>;
}

function Layout({ children }) {
  return <div className="public-page"><div className="public-glow one"/><div className="public-glow two"/><header className="public-top"><Brand/><nav><a href="/atualizacoes">Atualizações</a><a href="/termos">Termos</a><a href="/privacidade">Privacidade</a><a className="public-portal-link" href="/login">Portal</a></nav></header>{children}<footer className="public-footer"><Brand/><div><a href="/termos">Termos</a><a href="/privacidade">Privacidade</a><a href="/condicoes">Condições</a><a href="/licenca">Licença</a><a href="/lgpd">LGPD</a></div><p>ATTO FLOW BY GLEYSONDEVS · © 2026 ATTOZAP.</p></footer></div>;
}

function LegalPage({ doc }) {
  const Icon = doc.icon;
  return <Layout><main className="public-main legal-main"><a className="public-back" href="/"><ArrowLeft/> Voltar à landing</a><section className="public-hero"><div className="public-eyebrow"><Icon/>{doc.eyebrow}</div><h1>{doc.title}</h1><p>{doc.intro}</p></section><article className="legal-document">{doc.sections.map(([title,text])=><section key={title}><h2>{title}</h2><p>{text}</p></section>)}</article></main></Layout>;
}

function UpdatesPage() {
  const [state,setState] = useState({ loading:true, releases:[], error:'' });
  useEffect(()=>{fetch('/api/public-releases').then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao carregar');return d;}).then(d=>setState({loading:false,releases:d.releases||[],error:''})).catch(e=>setState({loading:false,releases:[],error:e.message}));},[]);
  return <Layout><main className="public-main"><a className="public-back" href="/"><ArrowLeft/> Voltar à landing</a><section className="public-hero updates-hero"><div className="public-eyebrow"><Sparkles/>CHANGELOG OFICIAL</div><h1>Atualizações do ATTOZAP</h1><p>Acompanhe versões, correções, melhorias e downloads publicados pelo Control Center.</p></section>{state.loading?<div className="public-loading"><RefreshCw className="spin"/> Carregando versões…</div>:state.error?<div className="public-error">{state.error}</div>:<section className="release-list">{state.releases.length?state.releases.map((release,index)=><article className={`release-card ${index===0?'latest':''}`} key={release.id}><div className="release-meta"><span>{String(release.channel||'stable').toUpperCase()}</span>{release.mandatory&&<b>IMPORTANTE</b>}</div><h2>{release.version}</h2><time>{new Date(release.publishedAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}</time><p>{release.notes||'Atualização publicada pelo ATTOZAP.'}</p><a className="public-download" href={release.downloadUrl} target="_blank" rel="noreferrer"><Download/> Baixar versão</a></article>):<div className="public-empty">Nenhuma atualização publicada ainda.</div>}</section>}</main></Layout>;
}

const path = location.pathname.replace(/\.html$/i,'').replace(/\/+$/,'')||'/';
createRoot(document.getElementById('root')).render(path==='/atualizacoes'?<UpdatesPage/>:<LegalPage doc={documents[path]||documents['/termos']}/>);
