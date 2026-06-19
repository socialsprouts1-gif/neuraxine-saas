"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Users, Upload, Tag, CheckCircle2, XCircle, PhoneCall } from "lucide-react";

const contacts = [
  { id: "1", name: "Rajesh Kumar", number: "+91 98765 43001", email: "rajesh@example.com", tags: ["lead", "q1"], consent: true, dnd: false, calls: 3 },
  { id: "2", name: "Sunita Sharma", number: "+91 98765 43002", email: "sunita@example.com", tags: ["lead"], consent: true, dnd: false, calls: 1 },
  { id: "3", name: "Amit Singh", number: "+91 98765 43003", email: null, tags: ["import", "q1"], consent: true, dnd: false, calls: 2 },
  { id: "4", name: "Deepa Nair", number: "+91 98765 43004", email: "deepa@example.com", tags: ["lead"], consent: true, dnd: false, calls: 1 },
  { id: "5", name: "Vikram Patel", number: "+91 98765 43005", email: null, tags: [], consent: false, dnd: false, calls: 0 },
];

const lists = [
  { id: "1", name: "Q1 Leads", count: 4 },
  { id: "2", name: "Callbacks", count: 1 },
];

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [activeList, setActiveList] = useState<string | null>(null);

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.number.includes(search)
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-white/50 text-sm mt-0.5">Manage your contact database and lists.</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/8 transition-colors">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00FF87] text-[#050508] text-sm font-semibold hover:bg-[#00FF87]/90 transition-colors">
            <Plus className="w-4 h-4" /> Add Contact
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Lists sidebar */}
        <div className="space-y-3">
          <div className="glass-card p-4">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00D4FF]" /> Lists
            </h2>
            <div className="space-y-1">
              <button
                onClick={() => setActiveList(null)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!activeList ? "bg-[#00FF87]/10 text-[#00FF87]" : "text-white/60 hover:bg-white/5"}`}
              >
                All Contacts
                <span className="ml-auto float-right text-xs font-medium">{contacts.length}</span>
              </button>
              {lists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setActiveList(l.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeList === l.id ? "bg-[#00FF87]/10 text-[#00FF87]" : "text-white/60 hover:bg-white/5"}`}
                >
                  {l.name}
                  <span className="ml-auto float-right text-xs font-medium">{l.count}</span>
                </button>
              ))}
            </div>
            <button className="w-full mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/15 text-white/30 text-xs hover:border-white/25 hover:text-white/50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> New List
            </button>
          </div>
        </div>

        {/* Main table */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/8">
            <Search className="w-4 h-4 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="bg-transparent text-sm outline-none flex-1 text-white placeholder-white/30"
            />
          </div>

          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  {["Name", "Phone", "Tags", "Consent", "Calls", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/30">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact, i) => (
                  <motion.tr
                    key={contact.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-white/5 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00FF87]/20 to-[#00D4FF]/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {contact.name[0]}
                        </div>
                        <div>
                          <div className="font-medium">{contact.name}</div>
                          {contact.email && <div className="text-white/30 text-xs">{contact.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/70 font-mono text-xs">{contact.number}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.map((tag) => (
                          <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/8 text-white/50 text-[10px]">
                            <Tag className="w-2.5 h-2.5" /> {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {contact.consent ? (
                        <CheckCircle2 className="w-4 h-4 text-[#00FF87]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-white/20" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-white/50 text-xs">
                        <PhoneCall className="w-3.5 h-3.5" />
                        {contact.calls}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-xs text-[#00D4FF] hover:underline">Edit</button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
