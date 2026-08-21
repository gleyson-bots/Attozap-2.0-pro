import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function Auth() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onAuthenticated = async (user: { id: number; name: string; email: string; role: "user" | "admin"; createdAt: Date; lastSignedIn: Date }) => {
    utils.auth.me.setData(undefined, user);
    await utils.auth.me.invalidate();
    setLocation("/painel");
  };

  const login = trpc.auth.login.useMutation({ onSuccess: onAuthenticated, onError: issue => setError(issue.message) });
  const register = trpc.auth.register.useMutation({ onSuccess: onAuthenticated, onError: issue => setError(issue.message) });

  useEffect(() => {
    if (me.data) setLocation("/painel");
  }, [me.data, setLocation]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === "register") register.mutate({ name, email, password });
    else login.mutate({ email, password });
  };

  const pending = login.isPending || register.isPending;
  return <main className="min-h-screen bg-[radial-gradient(circle_at_85%_8%,rgba(34,197,94,.16),transparent_32%),#050f0a] px-4 py-8 text-foreground sm:py-14"><div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden rounded-[2rem] border border-primary/20 bg-card/80 shadow-2xl backdrop-blur lg:grid-cols-[.95fr_1.05fr]"><section className="flex flex-col justify-between border-b border-border bg-[linear-gradient(145deg,rgba(18,83,44,.7),rgba(5,15,10,.92)_65%)] p-8 sm:p-12 lg:border-b-0 lg:border-r"><div><button type="button" onClick={() => setLocation("/")} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-primary"><ArrowLeft size={16} /> Voltar ao início</button><div className="mt-16"><span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><ShieldCheck size={25} /></span><p className="mt-7 text-xs font-extrabold uppercase tracking-[.18em] text-primary">ATTOZAP Portal</p><h1 className="mt-3 font-['Space_Grotesk'] text-4xl font-bold tracking-[-.07em] sm:text-5xl">Controle a sua operação com autonomia.</h1><p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">Aceda às licenças, versões autorizadas e configurações de agentes com uma conta própria do ATTOZAP.</p></div></div><p className="mt-12 flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole size={14} className="text-primary" /> Sessão protegida por cookie HTTP-only.</p></section><section className="flex items-center p-8 sm:p-12"><div className="mx-auto w-full max-w-sm"><div className="mb-8"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-primary">Acesso seguro</p><h2 className="mt-2 font-['Space_Grotesk'] text-3xl font-bold tracking-[-.06em]">{mode === "login" ? "Entrar no portal" : "Criar a sua conta"}</h2><p className="mt-2 text-sm text-muted-foreground">{mode === "login" ? "Use o email e a palavra-passe definidos para o portal." : "O administrador pode associar uma licença depois do registo."}</p></div><form onSubmit={submit} className="space-y-5">{mode === "register" && <div><Label htmlFor="name">Nome</Label><Input id="name" required minLength={2} value={name} onChange={event => setName(event.target.value)} className="mt-2" placeholder="O seu nome" autoComplete="name" /></div>}<div><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-2" placeholder="voce@empresa.com" autoComplete="email" /></div><div><Label htmlFor="password">Palavra-passe</Label><Input id="password" type="password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} className="mt-2" placeholder="Mínimo de 12 caracteres" autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>{error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "A processar..." : mode === "login" ? "Entrar" : "Criar conta"}</Button></form><p className="mt-7 text-center text-sm text-muted-foreground">{mode === "login" ? "Ainda não tem uma conta?" : "Já tem uma conta?"} <button type="button" className="font-bold text-primary hover:underline" onClick={() => { setError(null); setMode(mode === "login" ? "register" : "login"); }}>{mode === "login" ? "Registar" : "Entrar"}</button></p></div></section></div></main>;
}
