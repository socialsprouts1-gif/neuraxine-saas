"use client";

import type { VoiceAgent } from "./types";
import { seedAgents } from "./data";
import { uid } from "./utils";

const KEY = "nx_agents";

function read(): VoiceAgent[] {
  if (typeof window === "undefined") return seedAgents;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(seedAgents));
      return seedAgents;
    }
    return JSON.parse(raw) as VoiceAgent[];
  } catch {
    return seedAgents;
  }
}

function write(agents: VoiceAgent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(agents));
  } catch {
    // storage full or unavailable — keep going with in-memory state
  }
}

export function getAgents(): VoiceAgent[] {
  return read();
}

export function getAgent(id: string): VoiceAgent | undefined {
  return read().find((a) => a.id === id);
}

export function createAgent(partial: Partial<VoiceAgent> & { name: string }): VoiceAgent {
  const agent: VoiceAgent = {
    id: uid("agent"),
    name: partial.name,
    useCase: partial.useCase ?? "Custom",
    description: partial.description ?? "",
    status: "draft",
    language: partial.language ?? "hi-IN",
    voice: partial.voice ?? "priya",
    model: partial.model ?? "claude-sonnet-5",
    greeting: partial.greeting ?? "Namaste! How can I help you today?",
    systemPrompt: partial.systemPrompt ?? "You are a helpful voice assistant for an Indian business.",
    temperature: 0.7,
    speakingRate: 1,
    interruptible: true,
    maxCallMinutes: 5,
    silenceTimeoutSec: 8,
    knowledgeFaqs: [],
    webhookUrl: "",
    whatsappFollowUp: true,
    calendarBooking: false,
    crmPush: false,
    totalCalls: 0,
    avgDurationSec: 0,
    successRate: 0,
    createdAt: new Date().toISOString(),
  };
  const agents = read();
  write([agent, ...agents]);
  return agent;
}

export function updateAgent(id: string, patch: Partial<VoiceAgent>): VoiceAgent | undefined {
  const agents = read();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  agents[idx] = { ...agents[idx], ...patch, id };
  write(agents);
  return agents[idx];
}

export function deleteAgent(id: string) {
  write(read().filter((a) => a.id !== id));
}
