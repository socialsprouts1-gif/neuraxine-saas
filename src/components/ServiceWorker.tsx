"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/components/InstallApp";

// Renders nothing. It exists so the worker is registered once, from the
// root layout, rather than from whichever page somebody happened to
// open first.

export default function ServiceWorker() {
  useEffect(() => registerServiceWorker(), []);
  return null;
}
