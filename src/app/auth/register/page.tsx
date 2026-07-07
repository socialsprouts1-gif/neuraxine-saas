"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AudioLines, ArrowRight, Check } from "lucide-react";

const perks = [
  "50 free calling minutes to test",
  "All 12 Indian languages included",
  "No credit card required",
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    localStorage.setItem(
      "nx_user",
      JSON.stringify({ email: form.email || "demo@neuraxine.in", name: form.name || "Demo User", company: form.company })
    );
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
          <h1 className="text-xl font-bold text-center">Create your account</h1>
          <p className="text-sm text-white/50 text-center mt-1.5 mb-6">
            Build your first AI calling agent in minutes
          </p>

          <div className="space-y-2 mb-6">
            {perks.map((p) => (
              <div key={p} className="flex items-center gap-2.5 text-sm text-white/60">
                <Check className="w-4 h-4 text-[#34D399]" /> {p}
              </div>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3.5">
              <input value={form.name} onChange={set("name")} placeholder="Your name" className="input-dark" />
              <input value={form.company} onChange={set("company")} placeholder="Company" className="input-dark" />
            </div>
            <input type="email" value={form.email} onChange={set("email")} placeholder="Work email" className="input-dark" />
            <input type="tel" value={form.phone} onChange={set("phone")} placeholder="+91 mobile number" className="input-dark" />
            <input type="password" value={form.password} onChange={set("password")} placeholder="Create password" className="input-dark" />

            <button type="submit" disabled={loading} className="btn-primary w-full !py-3 text-sm">
              {loading ? "Creating account…" : "Start free trial"} <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="text-xs text-white/40 text-center mt-6">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-[#A78BFA] hover:underline">Sign in</Link>
          </p>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          By signing up you agree to our Terms & the TRAI telemarketing guidelines.
        </p>
      </div>
    </main>
  );
}
