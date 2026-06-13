"use client";

import { motion } from "framer-motion";
import {
  Plug2, CheckCircle, AlertCircle, ExternalLink, RefreshCw,
  Eye, Target, Zap, Building2, Image, Users, BarChart3, Shield,
} from "lucide-react";
import { useState } from "react";
import Header from "@/components/dashboard/Header";

const connectedAccount = {
  name: "Priya's Fitness Studio",
  id: "act_123456789",
  businessName: "Priya Wellness Pvt Ltd",
  currency: "INR",
  timezone: "Asia/Kolkata",
  status: "active",
};

const adAccounts = [
  { id: "act_123456789", name: "Priya's Fitness Studio", spend: "₹48,200", status: "active", currency: "INR" },
  { id: "act_987654321", name: "Priya Wellness — Retargeting", spend: "₹12,400", status: "active", currency: "INR" },
];

const pages = [
  { id: "101", name: "Priya's Fitness Studio", fans: "12.4K", category: "Gym/Physical Fitness Center", connected: true },
  { id: "102", name: "Priya Wellness Blog", fans: "3.1K", category: "Health & Wellness", connected: false },
];

const pixels = [
  { id: "px_abc123", name: "Main Website Pixel", fires: "1,247 events today", status: "active" },
  { id: "px_def456", name: "WhatsApp Lead Pixel", fires: "89 events today", status: "active" },
];

const assets = [
  { icon: Target, label: "Ad Accounts", count: 2, color: "#C6FF00" },
  { icon: Image, label: "Pages", count: 2, color: "#00D4FF" },
  { icon: Eye, label: "Pixels", count: 2, color: "#A855F7" },
  { icon: Users, label: "Custom Audiences", count: 8, color: "#F59E0B" },
];

export default function MetaConnectPage() {
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Connect Meta Account" subtitle="Manage your Meta Business Suite integration" />

      <div className="p-6 space-y-6">

        {/* Connection status */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 border-[#C6FF00]/20 bg-[#C6FF00]/3"
        >
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg">
                <span className="text-white font-black text-xl">f</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-bold text-lg">{connectedAccount.name}</h2>
                  <span className="flex items-center gap-1 text-xs bg-[#C6FF00]/15 text-[#C6FF00] px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-3 h-3" /> Connected
                  </span>
                </div>
                <div className="text-sm text-white/50 space-y-0.5">
                  <p>Business: {connectedAccount.businessName}</p>
                  <p>Account ID: {connectedAccount.id} · {connectedAccount.currency} · {connectedAccount.timezone}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                Sync Assets
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 text-sm text-red-400 hover:bg-red-500/10 transition-all">
                Disconnect
              </button>
            </div>
          </div>
        </motion.div>

        {/* Asset summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {assets.map((a, i) => (
            <motion.div
              key={a.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="glass-card p-5 text-center"
            >
              <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: `${a.color}15`, border: `1px solid ${a.color}25` }}>
                <a.icon className="w-5 h-5" style={{ color: a.color }} />
              </div>
              <div className="text-2xl font-black mb-1" style={{ color: a.color }}>{a.count}</div>
              <div className="text-xs text-white/50">{a.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Ad Accounts */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-[#C6FF00]" /> Ad Accounts
              </h3>
              <span className="text-xs text-white/40">{adAccounts.length} connected</span>
            </div>
            <div className="space-y-3">
              {adAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/8 hover:border-white/15 transition-colors">
                  <div>
                    <div className="text-sm font-medium">{acc.name}</div>
                    <div className="text-xs text-white/40">{acc.id} · {acc.currency}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#C6FF00]">{acc.spend}</div>
                    <div className="flex items-center gap-1 text-xs text-[#C6FF00]">
                      <CheckCircle className="w-3 h-3" /> {acc.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Pages */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass-card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Image className="w-4 h-4 text-[#00D4FF]" /> Facebook Pages
              </h3>
              <span className="text-xs text-white/40">{pages.length} pages</span>
            </div>
            <div className="space-y-3">
              {pages.map((page) => (
                <div key={page.id} className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/8 hover:border-white/15 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-xs font-bold text-blue-400">f</div>
                    <div>
                      <div className="text-sm font-medium">{page.name}</div>
                      <div className="text-xs text-white/40">{page.fans} fans · {page.category}</div>
                    </div>
                  </div>
                  {page.connected ? (
                    <CheckCircle className="w-4 h-4 text-[#C6FF00]" />
                  ) : (
                    <button className="text-xs text-[#C6FF00] border border-[#C6FF00]/30 px-2 py-1 rounded-lg hover:bg-[#C6FF00]/10 transition-colors">
                      Connect
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Pixels */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#A855F7]" /> Meta Pixels
              </h3>
              <span className="text-xs text-white/40">{pixels.length} pixels</span>
            </div>
            <div className="space-y-3">
              {pixels.map((px) => (
                <div key={px.id} className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/8">
                  <div>
                    <div className="text-sm font-medium">{px.name}</div>
                    <div className="text-xs text-white/40">{px.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs text-[#C6FF00]">
                      <CheckCircle className="w-3 h-3" /> Active
                    </div>
                    <div className="text-xs text-white/40">{px.fires}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Permissions */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass-card p-5"
          >
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-[#F59E0B]" /> API Permissions
            </h3>
            <div className="space-y-2">
              {[
                { scope: "ads_management", label: "Manage Ad Campaigns", granted: true },
                { scope: "ads_read", label: "Read Ad Performance", granted: true },
                { scope: "pages_read_engagement", label: "Read Page Insights", granted: true },
                { scope: "business_management", label: "Business Management", granted: true },
                { scope: "instagram_basic", label: "Instagram Basic", granted: true },
                { scope: "leads_retrieval", label: "Retrieve Leads", granted: false },
              ].map((p) => (
                <div key={p.scope} className="flex items-center justify-between text-sm">
                  <span className="text-white/60">{p.label}</span>
                  {p.granted ? (
                    <span className="text-[10px] bg-[#C6FF00]/15 text-[#C6FF00] px-2 py-0.5 rounded-full">Granted</span>
                  ) : (
                    <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full">Missing</span>
                  )}
                </div>
              ))}
            </div>
            <button className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#C6FF00]/30 text-[#C6FF00] text-sm hover:bg-[#C6FF00]/5 transition-all">
              <ExternalLink className="w-3.5 h-3.5" /> Re-authorize on Meta
            </button>
          </motion.div>
        </div>

        {/* Connect new account CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6 text-center border-dashed"
        >
          <div className="w-12 h-12 rounded-xl bg-[#C6FF00]/10 border border-[#C6FF00]/20 flex items-center justify-center mx-auto mb-3">
            <Plug2 className="w-6 h-6 text-[#C6FF00]" />
          </div>
          <h3 className="font-semibold mb-1">Connect Another Meta Account</h3>
          <p className="text-sm text-white/50 mb-4">Add multiple Meta Business accounts for agency or multi-brand management.</p>
          <button
            onClick={() => setConnecting(true)}
            className="btn-primary"
          >
            <Zap className="w-4 h-4" />
            {connecting ? "Redirecting to Meta..." : "Connect Meta Business Account"}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
