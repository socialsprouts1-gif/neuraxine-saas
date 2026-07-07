"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("nx_admin")) {
      setOk(true);
    } else {
      router.replace("/admin/login");
    }
  }, [router]);

  if (!ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#06060B]">
        <div className="text-sm text-white/40 animate-pulse">Checking admin access…</div>
      </div>
    );
  }

  return <>{children}</>;
}
