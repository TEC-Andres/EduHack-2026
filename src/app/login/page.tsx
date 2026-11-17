"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Logo, Wordmark } from "~/app/_components/ui";
import { api } from "~/trpc/react";

export default function LoginPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const done = async () => { await utils.auth.me.invalidate(); router.push("/"); };
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = api.auth.login.useMutation({ onSuccess: done });
  const register = api.auth.register.useMutation({ onSuccess: done });
  const m = mode === "login" ? login : register;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-fg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ email, password });
        }}
        className="flex w-full max-w-sm flex-col gap-4 card p-8 motion-safe:animate-fade-up"
      >
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <Wordmark className="text-2xl" />
        </div>
        <p className="-mt-2 text-sm text-dim">Proyectos académicos con Scrum, rúbricas e IA.</p>
        <h1 className="font-display text-3xl tracking-tight">
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </label>
        {m.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {m.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={m.isPending}
          className="h-10 rounded-md bg-brand px-6 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {m.isPending ? "..." : mode === "login" ? "Sign in" : "Sign up"}
        </button>
        {/* plain anchor: must hit the server route, not client-side routing */}
        <a
          href="/api/auth/google"
          className="flex h-10 items-center justify-center rounded-md border border-line bg-panel px-6 text-sm font-medium transition-colors hover:bg-panel-2"
        >
          Continue with Google
        </a>
        <button
          type="button"
          onClick={() => {
            login.reset();
            register.reset();
            setMode(mode === "login" ? "register" : "login");
          }}
          className="text-sm text-dim underline"
        >
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
