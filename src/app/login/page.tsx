"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] px-4 text-white">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ email, password });
        }}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-white/10 p-8"
      >
        <h1 className="text-3xl font-extrabold">
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
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
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
            className="rounded-lg bg-white/10 px-4 py-2 text-white"
          />
        </label>
        {m.error && (
          <p role="alert" className="text-sm text-red-300">
            {m.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={m.isPending}
          className="rounded-full bg-white/10 px-6 py-3 font-semibold transition hover:bg-white/20 disabled:opacity-50"
        >
          {m.isPending ? "..." : mode === "login" ? "Sign in" : "Sign up"}
        </button>
        {/* plain anchor: must hit the server route, not client-side routing */}
        <a
          href="/api/auth/google"
          className="rounded-full bg-white px-6 py-3 text-center font-semibold text-black transition hover:bg-white/90"
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
          className="text-sm text-white/70 underline"
        >
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
