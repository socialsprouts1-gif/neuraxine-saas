"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AudioLines, Mail, Lock, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    localStorage.setItem("nx_user", JSON.stringify({ email: email || "demo@neuraxine.in", name: "Demo User" }));
    setTimeout(() => router.push("/dashboard"), 400);
  };

  return (
    <main className="min-h-screen grid-pattern flex items-center justify-center px-4 py-12">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#8B5CF6]/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="w-full max-w-md relative">
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#8B5CF6] to-[#22D3EE] flex items-center justify-center shadow-[0_0_16px_rgba(139,92,246,0.5)]">
            <AudioLines className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg">
            Neuraxine <span className="gradient-text">Voice</span>
          </span>
        </Link>

        <div className="glass-card p-8">
          <h1 className="text-xl font-bold text-center">Welcome back</h1>
          <p className="text-sm text-white/50 text-center mt-1.5 mb-7">
            Sign in to manage your voice agents
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Work email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.in"
                  className="input-dark !pl-9"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-dark !pl-9"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full !py-3 text-sm">
              {loading ? "Signing in…" : "Sign in"} <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="text-xs text-white/40 text-center mt-6">
            New to Neuraxine?{" "}
            <Link href="/auth/register" className="text-[#A78BFA] hover:underline">Create a free account</Link>
          </p>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          Demo mode — any email & password works. Admin?{" "}
          <Link href="/admin/login" className="text-white/50 hover:text-white underline">Admin panel →</Link>
        </p>
      </div>
    </main>
  );
}
