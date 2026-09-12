"use client";

import { motion } from "framer-motion";

export default function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="glass-card p-10 text-center max-w-md mx-auto mt-16"
      >
        <h2 className="text-xl font-bold mb-2">{title}</h2>
        <p className="text-white/50 text-sm">{description}</p>
      </motion.div>
    </div>
  );
}
