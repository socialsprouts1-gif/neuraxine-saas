"use client";

import { useState } from "react";

// A small curated set rather than the full Unicode table: this is a support
// inbox, and the emoji people actually reach for in one fit in a few rows.
const GROUPS: Array<{ name: string; emoji: string[] }> = [
  {
    name: "Smileys",
    emoji: "😀 😃 😄 😁 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕".split(" "),
  },
  {
    name: "Gestures",
    emoji: "👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 🤲 🤝 🙏 ✍️ 💪 🦾 👀 👁️ 🧠 👂 👃 👄 💅".split(" "),
  },
  {
    name: "Hearts",
    emoji: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ✨ 🌟 ⭐ 💫 🔥 💥 💯".split(" "),
  },
  {
    name: "Objects",
    emoji: "📱 💻 ⌨️ 🖥️ 🖨️ 📷 📸 🎥 📞 ☎️ 📠 📺 ⏰ ⌚ 📅 📆 📇 📋 📌 📎 🔗 📁 📂 🗂️ 📊 📈 📉 📝 ✏️ 🖊️ 📚 📦 🎁 🛒 🛍️ 💳 💰 💵 🧾 🔑 🔒 🔓 🔔 📢 📣 💡 🔍 ⚙️ 🧰 🚀 ✈️ 🚚 📍 🏠 🏢".split(" "),
  },
  {
    name: "Symbols",
    emoji: "✅ ☑️ ✔️ ❌ ❎ ⭕ 🚫 ⚠️ ❗ ❓ ‼️ 💬 💭 🗯️ ➕ ➖ ➗ 🟢 🟡 🔴 🔵 ⚫ ⚪ 🔺 🔻 ⬆️ ⬇️ ⬅️ ➡️ 🔄 🔁 🎉 🎊 🏆 🥇 👑 ⏳ ⌛ 🕐".split(" "),
  },
];

export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [group, setGroup] = useState(GROUPS[0].name);
  const active = GROUPS.find((entry) => entry.name === group) ?? GROUPS[0];

  return (
    <div className="w-80 rounded-xl border border-white/12 bg-[var(--surface-1)] shadow-2xl overflow-hidden">
      <div className="flex gap-1 p-1.5 border-b border-white/8 overflow-x-auto">
        {GROUPS.map((entry) => (
          <button
            key={entry.name}
            type="button"
            onClick={() => setGroup(entry.name)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              group === entry.name
                ? "bg-accent/12 text-accent-ink border border-accent/25"
                : "text-white/50 hover:text-white/80 border border-transparent"
            }`}
          >
            {entry.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-56 overflow-y-auto">
        {active.emoji.map((emoji, index) => (
          <button
            key={`${emoji}-${index}`}
            type="button"
            onClick={() => onPick(emoji)}
            aria-label={emoji}
            className="text-xl leading-none p-1.5 rounded-lg hover:bg-white/8 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
