"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";

export function LoginForm({ next, demo }: { next: string; demo?: { email: string; password: string } }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: email.trim(), password }) });
      const body = (await res.json().catch(() => ({}))) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Sign-in failed");
      router.push(next.startsWith("/") ? next : "/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email">
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@organiser.com" autoFocus />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </Field>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
      {demo && (
        <button type="button" className="w-full text-center text-xs text-gray-500 hover:text-gray-900" onClick={() => { setEmail(demo.email); setPassword(demo.password); }}>
          Use demo account ({demo.email})
        </button>
      )}
    </form>
  );
}
