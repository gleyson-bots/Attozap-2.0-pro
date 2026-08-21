import { EmptyState, LoadingPanel, MetricCard, PageHeader, StatusPill, formatDate } from "@/components/PortalUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { FileUp, KeyRound, RefreshCcw, ShieldAlert, SlidersHorizontal, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const planOptions = ["plus", "pro", "ultra", "enterprise"] as const;
type PlanId = (typeof planOptions)[number];
type EditablePlan = { id: PlanId; name: string; maxAccounts: number | null; priceCents: number | null; features: string[]; isActive: boolean };

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result.split(",")[1] : undefined;
      if (result) resolve(result);
      else reject(new Error("Não foi possível ler o ficheiro."));
    };
    reader.onerror = () => reject(reader.error || new Error("Não foi possível ler o ficheiro."));
    reader.readAsDataURL(file);
  });
}

function PlanEditor({ plan }: { plan: EditablePlan }) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState(() => ({
    name: plan.name,
    maxAccounts: plan.maxAccounts === null ? "" : String(plan.maxAccounts),
    priceCents: plan.priceCents === null ? "" : String(plan.priceCents / 100),
    features: plan.features.join("\n"),
    isActive: plan.isActive,
  }));
  useEffect(() => {
    setDraft({ name: plan.name, maxAccounts: plan.maxAccounts === null ? "" : String(plan.maxAccounts), priceCents: plan.priceCents === null ? "" : String(plan.priceCents / 100), features: plan.features.join("\n"), isActive: plan.isActive });
  }, [plan.id, plan.name, plan.maxAccounts, plan.priceCents, plan.features, plan.isActive]);

  const updatePlan = trpc.admin.updatePlan.useMutation({
    onSuccess: () => { toast.success(`Plano ${plan.id} atualizado.`); utils.admin.listPlans.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const save = () => {
    const features = draft.features.split("\n").map(item => item.trim()).filter(Boolean);
    if (!features.length) { toast.error("Indique pelo menos um recurso do plano."); return; }
    const price = draft.priceCents.trim() === "" ? null : Math.round(Number(draft.priceCents) * 100);
    const maxAccounts = draft.maxAccounts.trim() === "" ? null : Number(draft.maxAccounts);
    if ((price !== null && (!Number.isFinite(price) || price < 0)) || (maxAccounts !== null && (!Number.isInteger(maxAccounts) || maxAccounts < 1))) { toast.error("Verifique o preço e o limite de contas."); return; }
    updatePlan.mutate({ id: plan.id, name: draft.name.trim(), maxAccounts, priceCents: price, features, isActive: draft.isActive });
  };

  return <article className="rounded-xl border border-border bg-background/35 p-4">
    <div className="flex items-center justify-between gap-3"><div><p className="font-['Space_Grotesk'] text-lg font-bold tracking-[-.04em]">{plan.id}</p><p className="text-xs text-muted-foreground">Configuração comercial e limites.</p></div><label className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><input type="checkbox" checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} />Ativo</label></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label htmlFor={`plan-name-${plan.id}`}>Nome</Label><Input id={`plan-name-${plan.id}`} className="mt-1.5 bg-background/60" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></div><div><Label htmlFor={`plan-accounts-${plan.id}`}>Máx. contas</Label><Input id={`plan-accounts-${plan.id}`} className="mt-1.5 bg-background/60" type="number" min="1" value={draft.maxAccounts} onChange={event => setDraft({ ...draft, maxAccounts: event.target.value })} placeholder="Ilimitado" /></div><div><Label htmlFor={`plan-price-${plan.id}`}>Preço mensal (R$)</Label><Input id={`plan-price-${plan.id}`} className="mt-1.5 bg-background/60" type="number" min="0" step="0.01" value={draft.priceCents} onChange={event => setDraft({ ...draft, priceCents: event.target.value })} placeholder="Sob consulta" /></div><div className="sm:col-span-2"><Label htmlFor={`plan-features-${plan.id}`}>Recursos (um por linha)</Label><Textarea id={`plan-features-${plan.id}`} className="mt-1.5 min-h-24 bg-background/60" value={draft.features} onChange={event => setDraft({ ...draft, features: event.target.value })} /></div></div>
    <Button className="mt-4 w-full" size="sm" onClick={save} disabled={updatePlan.isPending}><SlidersHorizontal size={14} />{updatePlan.isPending ? "A guardar..." : "Guardar plano"}</Button>
  </article>;
}

export default function Admin() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [issue, setIssue] = useState({ userId: "", planId: "pro" as PlanId, licenseKey: "", renewalKey: "", expiresAt: "" });
  const [release, setRelease] = useState({ version: "", releaseNotes: "", planId: "pro" as PlanId, file: null as File | null });
  const [manualRenewal, setManualRenewal] = useState({ licenseId: "", daysAdded: "30", renewalKey: "", note: "" });
  const enabled = user?.role === "admin";
  const dashboard = trpc.admin.dashboard.useQuery(undefined, { enabled });
  const users = trpc.admin.listUsers.useQuery(undefined, { enabled });
  const licenses = trpc.admin.listLicenses.useQuery(undefined, { enabled });
  const downloads = trpc.admin.listDownloads.useQuery(undefined, { enabled });
  const plans = trpc.admin.listPlans.useQuery(undefined, { enabled });
  const setRole = trpc.admin.setUserRole.useMutation({ onSuccess: () => { utils.admin.listUsers.invalidate(); toast.success("Papel atualizado."); }, onError: error => toast.error(error.message) });
  const setStatus = trpc.admin.setLicenseStatus.useMutation({ onSuccess: () => { utils.admin.listLicenses.invalidate(); utils.admin.dashboard.invalidate(); toast.success("Estado da licença atualizado."); }, onError: error => toast.error(error.message) });
  const issueLicense = trpc.admin.issueLicense.useMutation({ onSuccess: () => { setIssue({ userId: "", planId: "pro", licenseKey: "", renewalKey: "", expiresAt: "" }); utils.admin.listLicenses.invalidate(); utils.admin.dashboard.invalidate(); toast.success("Licença emitida."); }, onError: error => toast.error(error.message) });
  const renewLicense = trpc.admin.renewLicense.useMutation({ onSuccess: () => { setManualRenewal({ licenseId: "", daysAdded: "30", renewalKey: "", note: "" }); utils.admin.listLicenses.invalidate(); utils.admin.dashboard.invalidate(); toast.success("Renovação administrativa registada."); }, onError: error => toast.error(error.message) });
  const upload = trpc.admin.uploadRelease.useMutation({ onSuccess: () => { setRelease({ version: "", releaseNotes: "", planId: "pro", file: null }); utils.admin.listDownloads.invalidate(); utils.admin.dashboard.invalidate(); toast.success("Versão carregada e registada."); }, onError: error => toast.error(error.message) });
  const publish = trpc.admin.setDownloadPublication.useMutation({ onSuccess: () => { utils.admin.listDownloads.invalidate(); toast.success("Publicação atualizada."); }, onError: error => toast.error(error.message) });

  if (!enabled) return <div className="mx-auto max-w-4xl"><PageHeader eyebrow="Administração" title="Acesso reservado" description="Esta área exige o papel administrativo no servidor." /><EmptyState title="Sem permissão administrativa" description="Contacte o proprietário do portal caso necessite de gerir licenças, utilizadores ou downloads." /></div>;
  if (dashboard.isLoading || users.isLoading || licenses.isLoading || downloads.isLoading || plans.isLoading) return <LoadingPanel label="A carregar administração" />;
  if (dashboard.isError || users.isError || licenses.isError || downloads.isError || plans.isError) return <div className="mx-auto max-w-4xl"><PageHeader eyebrow="Administração" title="Não foi possível carregar os dados" description="A ligação ao serviço de gestão falhou. Tente novamente antes de alterar licenças ou versões." /><Button onClick={() => { dashboard.refetch(); users.refetch(); licenses.refetch(); downloads.refetch(); plans.refetch(); }}>Tentar novamente</Button></div>;

  return <div className="mx-auto max-w-7xl">
    <PageHeader eyebrow="Administração" title="Licenças, utilizadores e versões." description="Ferramentas internas protegidas por papel de administrador. As chaves são armazenadas apenas como hashes; a chave original não volta a ser exibida." />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Utilizadores" value={String(dashboard.data?.users || 0)} helper="Contas registadas" /><MetricCard label="Licenças ativas" value={String(dashboard.data?.activeLicenses || 0)} helper="Acessos em vigor" tone="primary" /><MetricCard label="Versões" value={String(dashboard.data?.downloads || 0)} helper="Registos de download" /><MetricCard label="Agentes" value={String(dashboard.data?.agents || 0)} helper="Configurações por conta" /></section>

    <section className="mt-5 grid gap-5 xl:grid-cols-2"><article className="rounded-2xl border border-border bg-card/55 p-6"><div className="flex items-center gap-2"><KeyRound className="text-primary" size={19} /><h2 className="font-['Space_Grotesk'] text-xl font-bold tracking-[-.045em]">Emitir licença</h2></div><form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); issueLicense.mutate({ userId: Number(issue.userId), planId: issue.planId, licenseKey: issue.licenseKey, renewalKey: issue.renewalKey || undefined, expiresAt: new Date(`${issue.expiresAt}T23:59:59`) }); }}><div><Label htmlFor="admin-user-id">ID do utilizador</Label><Input id="admin-user-id" required min="1" type="number" className="mt-1.5 bg-background/60" value={issue.userId} onChange={event => setIssue({ ...issue, userId: event.target.value })} /></div><div><Label htmlFor="admin-plan">Plano</Label><select id="admin-plan" className="mt-1.5 h-10 w-full rounded-lg border bg-background/60 px-3 text-sm" value={issue.planId} onChange={event => setIssue({ ...issue, planId: event.target.value as PlanId })}>{planOptions.map(plan => <option key={plan} value={plan}>{plan}</option>)}</select></div><div className="sm:col-span-2"><Label htmlFor="admin-license-key">Chave de licença</Label><Input id="admin-license-key" required minLength={12} className="mt-1.5 bg-background/60 font-mono" value={issue.licenseKey} onChange={event => setIssue({ ...issue, licenseKey: event.target.value })} /></div><div><Label htmlFor="admin-renewal-key">Chave de renovação</Label><Input id="admin-renewal-key" minLength={12} className="mt-1.5 bg-background/60 font-mono" value={issue.renewalKey} onChange={event => setIssue({ ...issue, renewalKey: event.target.value })} /></div><div><Label htmlFor="admin-expires">Expira em</Label><Input id="admin-expires" required type="date" className="mt-1.5 bg-background/60" value={issue.expiresAt} onChange={event => setIssue({ ...issue, expiresAt: event.target.value })} /></div><Button className="sm:col-span-2" disabled={issueLicense.isPending}><KeyRound size={15} />{issueLicense.isPending ? "A emitir..." : "Emitir licença"}</Button></form></article>
      <article className="rounded-2xl border border-border bg-card/55 p-6"><div className="flex items-center gap-2"><FileUp className="text-primary" size={19} /><h2 className="font-['Space_Grotesk'] text-xl font-bold tracking-[-.045em]">Publicar versão</h2></div><form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={async event => { event.preventDefault(); if (!release.file) { toast.error("Selecione o ficheiro da versão."); return; } try { const contentBase64 = await fileToBase64(release.file); upload.mutate({ version: release.version, filename: release.file.name, contentType: release.file.type || "application/octet-stream", contentBase64, releaseNotes: release.releaseNotes || undefined, allowedPlans: [release.planId], isPublished: true }); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível preparar o upload."); } }}><div><Label htmlFor="release-version">Versão</Label><Input id="release-version" required className="mt-1.5 bg-background/60" placeholder="2.0.0-rc.16" value={release.version} onChange={event => setRelease({ ...release, version: event.target.value })} /></div><div><Label htmlFor="release-plan">Plano mínimo</Label><select id="release-plan" className="mt-1.5 h-10 w-full rounded-lg border bg-background/60 px-3 text-sm" value={release.planId} onChange={event => setRelease({ ...release, planId: event.target.value as PlanId })}>{planOptions.map(plan => <option key={plan} value={plan}>{plan}</option>)}</select></div><div className="sm:col-span-2"><Label htmlFor="release-file">Ficheiro</Label><Input id="release-file" required type="file" className="mt-1.5 bg-background/60" onChange={event => setRelease({ ...release, file: event.target.files?.[0] || null })} /></div><div className="sm:col-span-2"><Label htmlFor="release-notes">Notas de versão</Label><Textarea id="release-notes" className="mt-1.5 min-h-20 bg-background/60" value={release.releaseNotes} onChange={event => setRelease({ ...release, releaseNotes: event.target.value })} /></div><Button className="sm:col-span-2" disabled={upload.isPending}><FileUp size={15} />{upload.isPending ? "A carregar..." : "Carregar e publicar"}</Button></form></article></section>

    <section className="mt-5 rounded-2xl border border-border bg-card/55 p-6"><div className="flex items-center gap-2"><UsersRound className="text-primary" size={19} /><h2 className="font-['Space_Grotesk'] text-xl font-bold tracking-[-.045em]">Utilizadores</h2></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm"><thead className="border-b border-border text-[10px] uppercase tracking-[.12em] text-muted-foreground"><tr><th className="pb-3 font-extrabold">Utilizador</th><th className="pb-3 font-extrabold">Entrada</th><th className="pb-3 font-extrabold">Papel</th><th className="pb-3 font-extrabold">Ação</th></tr></thead><tbody>{users.data?.map(item => <tr key={item.id} className="border-b border-border/70"><td className="py-3"><p className="font-bold">{item.name || "Sem nome"}</p><p className="text-xs text-muted-foreground">#{item.id} · {item.email || "Sem e-mail"}</p></td><td className="py-3 text-xs text-muted-foreground">{formatDate(item.createdAt)}</td><td className="py-3"><StatusPill status={item.role === "admin" ? "Ativa" : "Pausada"} /></td><td className="py-3"><Button size="sm" variant="outline" onClick={() => setRole.mutate({ userId: item.id, role: item.role === "admin" ? "user" : "admin" })} disabled={setRole.isPending}>{item.role === "admin" ? "Tornar utilizador" : "Tornar admin"}</Button></td></tr>)}</tbody></table></div></section>

    <section className="mt-5 grid gap-5 xl:grid-cols-2"><article className="rounded-2xl border border-border bg-card/55 p-6"><div className="flex items-center gap-2"><RefreshCcw className="text-primary" size={19} /><h2 className="font-['Space_Grotesk'] text-xl font-bold tracking-[-.045em]">Registar renovação</h2></div><form className="mt-5 grid gap-3" onSubmit={event => { event.preventDefault(); renewLicense.mutate({ licenseId: manualRenewal.licenseId, daysAdded: Number(manualRenewal.daysAdded), renewalKey: manualRenewal.renewalKey || undefined, note: manualRenewal.note || undefined }); }}><div><Label htmlFor="renew-license">Licença</Label><select id="renew-license" required className="mt-1.5 h-10 w-full rounded-lg border bg-background/60 px-3 text-sm" value={manualRenewal.licenseId} onChange={event => setManualRenewal({ ...manualRenewal, licenseId: event.target.value })}><option value="" disabled>Selecione uma licença</option>{licenses.data?.map(item => <option value={item.id} key={item.id}>{item.planName || item.planId} · {item.userName || `Utilizador #${item.userId}`}</option>)}</select></div><div><Label htmlFor="renew-days">Dias a adicionar</Label><Input id="renew-days" required min="1" max="730" type="number" className="mt-1.5 bg-background/60" value={manualRenewal.daysAdded} onChange={event => setManualRenewal({ ...manualRenewal, daysAdded: event.target.value })} /></div><div><Label htmlFor="renew-new-key">Nova chave (opcional)</Label><Input id="renew-new-key" minLength={12} className="mt-1.5 bg-background/60 font-mono" value={manualRenewal.renewalKey} onChange={event => setManualRenewal({ ...manualRenewal, renewalKey: event.target.value })} /></div><div><Label htmlFor="renew-note">Nota</Label><Input id="renew-note" className="mt-1.5 bg-background/60" value={manualRenewal.note} onChange={event => setManualRenewal({ ...manualRenewal, note: event.target.value })} placeholder="Ex.: Renovação mensal" /></div><Button disabled={renewLicense.isPending}><RefreshCcw size={15} />{renewLicense.isPending ? "A registar..." : "Renovar licença"}</Button></form></article>
      <article className="rounded-2xl border border-border bg-card/55 p-6"><h2 className="font-['Space_Grotesk'] text-xl font-bold tracking-[-.045em]">Licenças emitidas</h2><div className="mt-4 max-h-100 overflow-auto divide-y divide-border">{licenses.data?.map(item => <div className="flex items-center justify-between gap-3 py-3 text-sm" key={item.id}><div><p className="font-bold">{item.planName || item.planId} · {item.userName || `Utilizador #${item.userId}`}</p><p className="mt-1 text-xs text-muted-foreground">{item.licenseKeyHint || item.id.slice(0, 8)} · expira {formatDate(item.expiresAt)}</p></div><div className="flex items-center gap-2"><StatusPill status={item.status} /><Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: item.id, status: item.status === "active" ? "suspended" : "active" })} disabled={setStatus.isPending}>{item.status === "active" ? "Suspender" : "Ativar"}</Button></div></div>)}</div></article></section>

    <section className="mt-5 rounded-2xl border border-border bg-card/55 p-6"><div className="flex items-center gap-2"><SlidersHorizontal className="text-primary" size={19} /><h2 className="font-['Space_Grotesk'] text-xl font-bold tracking-[-.045em]">Planos e limites</h2></div><p className="mt-2 text-sm text-muted-foreground">Ajuste a disponibilidade, preço, capacidade e recursos comunicados no portal.</p><div className="mt-5 grid gap-4 md:grid-cols-2">{plans.data?.map(plan => <PlanEditor key={plan.id} plan={plan as EditablePlan} />)}</div></section>

    <section className="mt-5 rounded-2xl border border-border bg-card/55 p-6"><h2 className="font-['Space_Grotesk'] text-xl font-bold tracking-[-.045em]">Versões publicadas</h2><div className="mt-4 max-h-100 overflow-auto divide-y divide-border">{downloads.data?.map(item => <div className="flex items-center justify-between gap-3 py-3 text-sm" key={item.id}><div><p className="font-bold">{item.version} · {item.filename}</p><p className="mt-1 text-xs text-muted-foreground">{item.isPublished ? "Publicada" : "Rascunho"} · {formatDate(item.createdAt)}</p></div><Button size="sm" variant="outline" onClick={() => publish.mutate({ id: item.id, isPublished: !item.isPublished })} disabled={publish.isPending}>{item.isPublished ? "Despublicar" : "Publicar"}</Button></div>)}</div></section>
    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[.05] p-4 text-sm text-muted-foreground"><ShieldAlert className="shrink-0 text-amber-300" size={20} />Trate chaves de licença e ficheiros de versão como dados sensíveis. A aplicação armazena apenas hashes de chaves e aplica autorização administrativa no servidor.</div>
  </div>;
}
