import { cn } from "@/lib/utils";
import { ChevronRight, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><span className="text-[10px] font-extrabold uppercase tracking-[.16em] text-primary">{eyebrow}</span><h1 className="mt-2 font-['Space_Grotesk'] text-3xl font-bold tracking-[-.055em] text-foreground md:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}</div>;
}

export function MetricCard({ label, value, helper, tone = "default" }: { label: string; value: string; helper: string; tone?: "default" | "primary" | "warning" }) {
  const toneClass = tone === "primary" ? "border-primary/25 bg-primary/[.08]" : tone === "warning" ? "border-amber-400/25 bg-amber-400/[.05]" : "border-border bg-card/70";
  return <article className={cn("rounded-2xl border p-5 shadow-[0_12px_28px_rgba(0,0,0,.10)]", toneClass)}><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-muted-foreground">{label}</p><strong className="mt-3 block font-['Space_Grotesk'] text-3xl tracking-[-.06em] text-foreground">{value}</strong><p className="mt-2 text-xs text-muted-foreground">{helper}</p></article>;
}

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const classes = normalized === "active" || normalized === "ativo" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : normalized === "expired" || normalized === "expirada" ? "border-amber-400/25 bg-amber-400/10 text-amber-300" : "border-rose-400/25 bg-rose-400/10 text-rose-300";
  const label = ({ active: "Ativa", expired: "Expirada", suspended: "Suspensa", revoked: "Revogada", paused: "Pausada", disconnected: "Desligada" } as Record<string, string>)[normalized] || status;
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.1em]", classes)}>{label}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: { label: string; href: string } }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card/30 px-6 py-12 text-center"><h2 className="font-['Space_Grotesk'] text-xl font-bold tracking-[-.04em]">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>{action && <Link href={action.href} className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">{action.label}<ChevronRight size={16} /></Link>}</div>;
}

export function LoadingPanel({ label = "A carregar dados do portal" }: { label?: string }) { return <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="animate-spin text-primary" size={24} />{label}</div>; }

export function formatDate(value: Date | string | number) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
