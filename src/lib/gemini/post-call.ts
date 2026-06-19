import { GoogleGenAI } from "@google/genai";
import { createAdminClient } from "@/lib/supabase/admin";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function triggerPostCallAnalysis(callId: string) {
  const supabase = createAdminClient();

  // Fetch transcript
  const { data: transcriptRows } = await supabase
    .from("transcripts")
    .select("role, text, seq")
    .eq("call_id", callId)
    .order("seq");

  if (!transcriptRows || transcriptRows.length === 0) return;

  const transcriptText = transcriptRows
    .map((r) => `${r.role.toUpperCase()}: ${r.text}`)
    .join("\n");

  const model = genai.models;
  const response = await model.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are analyzing a voice call transcript. Return a JSON object with the following fields:
- summary: string (2-3 sentence plain English summary)
- sentiment: "positive" | "negative" | "neutral"
- disposition: "completed" | "interested" | "not_interested" | "callback" | "voicemail" | "no_answer" | "busy" | "failed"
- structured_data: object with key extracted facts (lead score, next step, objections, etc.)

Transcript:
${transcriptText}

Respond with ONLY valid JSON, no markdown code blocks.`,
          },
        ],
      },
    ],
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    console.error("Gemini returned non-JSON:", text);
    return;
  }

  await supabase.from("calls").update({
    summary: parsed.summary as string,
    sentiment: parsed.sentiment as string,
    disposition: parsed.disposition as string,
    structured_data: (parsed.structured_data as Record<string, unknown>) ?? {},
  }).eq("id", callId);
}
