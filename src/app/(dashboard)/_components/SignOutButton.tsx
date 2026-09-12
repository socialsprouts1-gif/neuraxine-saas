"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      title="Sign out"
      className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:border-white/20 hover:text-white text-white/60 transition-colors disabled:opacity-50"
    >
      <LogOut className="w-4 h-4" />
    </button>
  );
}
