import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neuraxine Voice — AI Voice Calling Platform for India",
  description:
    "Build AI voice agents that make and answer calls in Hindi, English and 10+ Indian languages. Sales, support, reminders and surveys — launched in minutes, billed in ₹.",
  keywords:
    "AI voice agent, voice bot India, AI calling, Hindi voice bot, outbound calling automation, IVR replacement, conversational AI India",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#06060B] text-white">
        {children}
      </body>
    </html>
  );
}
