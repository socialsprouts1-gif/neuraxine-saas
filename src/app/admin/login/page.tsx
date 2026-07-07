"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck, Lock, Mail, ArrowRight } from "lucide-react";
import { ADMIN_EMAIL } from "@/lib/constants";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
      setError(`Access denied. Use the platform owner email (hint: ${ADMIN_EMAIL})`);
      return;
    }
    setLoading(true);
    localStorage.setItem("nx_admin", JSON.stringify({ email, role: "owner" }));
    setTimeout(() => router.push("/admin"), 400);
  };

  return (
    <main className="min-h-screen dot-pattern flex items-center justify-center px-4 py-12 bg-[#06060B]">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#FF9D3C]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="w-full max-w-md relative">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#FF9D3C] to-[#FBBF24] flex items-center justify-center shadow-[0_0_16px_rgba(255,157,60,0.4)]">
            <ShieldCheck className="w-5 h-5 text-[#06060B]" />
          </div>
          <span className="font-bold text-lg">
            Neuraxine <span className="gradient-text-saffron">Admin</span>
          </span>
        </div>

        <div className="glass-card p-8 !border-[#FF9D3C]/20">
          <h1 className="text-xl font-bold text-center">Platform owner sign-in</h1>
          <p className="text-sm text-white/50 text-center mt-1.5 mb-7">
            Restricted area — manages all client accounts
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Admin email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder={ADMIN_EMAIL}
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

            {error && (
              <p className="text-xs text-[#F87171] bg-[#F87171]/10 border border-[#F87171]/25 rounded-xl px-3.5 py-2.5">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full !py-3 text-sm !bg-gradient-to-r !from-[#FF9D3C] !to-[#FBBF24] !text-[#06060B] !shadow-[0_0_20px_rgba(255,157,60,0.35)]"
            >
              {loading ? "Verifying…" : "Enter admin panel"} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          Not the owner? <Link href="/auth/login" className="text-white/50 hover:text-white underline">Go to client login</Link>
        </p>
      </div>
    </main>
  );
}
