export const LANGUAGES = [
  { code: "hi-IN", label: "Hindi", native: "हिन्दी" },
  { code: "en-IN", label: "English (India)", native: "English" },
  { code: "hi-EN", label: "Hinglish", native: "Hinglish" },
  { code: "ta-IN", label: "Tamil", native: "தமிழ்" },
  { code: "te-IN", label: "Telugu", native: "తెలుగు" },
  { code: "mr-IN", label: "Marathi", native: "मराठी" },
  { code: "bn-IN", label: "Bengali", native: "বাংলা" },
  { code: "kn-IN", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "gu-IN", label: "Gujarati", native: "ગુજરાતી" },
  { code: "ml-IN", label: "Malayalam", native: "മലയാളം" },
  { code: "pa-IN", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "or-IN", label: "Odia", native: "ଓଡ଼ିଆ" },
];

export const VOICES = [
  { id: "aarav", name: "Aarav", gender: "Male", style: "Warm & professional", langs: ["hi-IN", "en-IN", "hi-EN"] },
  { id: "priya", name: "Priya", gender: "Female", style: "Friendly & energetic", langs: ["hi-IN", "en-IN", "hi-EN"] },
  { id: "meera", name: "Meera", gender: "Female", style: "Calm & empathetic", langs: ["hi-IN", "mr-IN", "gu-IN"] },
  { id: "vikram", name: "Vikram", gender: "Male", style: "Authoritative & clear", langs: ["en-IN", "hi-IN"] },
  { id: "kavya", name: "Kavya", gender: "Female", style: "Soft & courteous", langs: ["ta-IN", "te-IN", "kn-IN", "ml-IN"] },
  { id: "arjun", name: "Arjun", gender: "Male", style: "Upbeat sales tone", langs: ["hi-IN", "pa-IN", "hi-EN"] },
  { id: "ananya", name: "Ananya", gender: "Female", style: "Crisp & formal", langs: ["bn-IN", "or-IN", "en-IN"] },
  { id: "rohan", name: "Rohan", gender: "Male", style: "Casual & conversational", langs: ["hi-EN", "en-IN"] },
];

export const LLM_MODELS = [
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "Best quality · recommended" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Fastest · lowest latency" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", note: "Balanced" },
  { id: "llama-3.3-70b", label: "Llama 3.3 70B", note: "Open weights" },
];

export const AGENT_TEMPLATES = [
  {
    id: "sales",
    label: "Sales & Lead Qualification",
    emoji: "📞",
    description: "Qualify inbound leads, pitch your product and book demos.",
    greeting: "Namaste! Main {{company}} se baat kar rahi hoon. Kya aapke paas 2 minute hain?",
    prompt:
      "You are a polite sales agent for an Indian business. Qualify the lead by asking about their requirement, budget and timeline. Speak in the caller's preferred language (Hindi/English/Hinglish). Never be pushy. If interested, book a demo slot and confirm on WhatsApp.",
  },
  {
    id: "support",
    label: "Customer Support",
    emoji: "🎧",
    description: "Answer FAQs, check order status and raise tickets 24×7.",
    greeting: "Hello! Thank you for calling. How may I help you today?",
    prompt:
      "You are a customer support agent. Answer questions using the knowledge base. Be empathetic and concise. If you cannot resolve the issue, collect details and create a support ticket, then promise a callback within 24 hours.",
  },
  {
    id: "appointment",
    label: "Appointment Booking",
    emoji: "📅",
    description: "Book, confirm and reschedule appointments for clinics & salons.",
    greeting: "Namaste, main appointment booking assistant bol rahi hoon. Aap kis din ka slot chahenge?",
    prompt:
      "You are an appointment booking assistant for an Indian clinic. Offer available slots, confirm the patient's name and phone number, and send a WhatsApp confirmation. Handle rescheduling and cancellations gracefully.",
  },
  {
    id: "collections",
    label: "EMI & Payment Reminders",
    emoji: "💰",
    description: "RBI-compliant payment reminders and payment link delivery.",
    greeting: "Namaskar, yeh ek payment reminder call hai {{company}} ki taraf se.",
    prompt:
      "You are a payment reminder agent. Follow RBI fair-practice guidelines: be respectful, never threaten, call only between 8 AM and 7 PM. Remind about the due EMI, offer to send a payment link on WhatsApp, and note any promise-to-pay date.",
  },
  {
    id: "survey",
    label: "Feedback & Surveys",
    emoji: "📋",
    description: "Post-purchase NPS, CSAT and market research surveys.",
    greeting: "Hi! This is a quick 1-minute feedback call. Kya main shuru karoon?",
    prompt:
      "You are a survey agent. Ask 3-5 short questions, record ratings from 1 to 10, thank the customer, and keep the call under 2 minutes. Do not argue with negative feedback — acknowledge and move on.",
  },
];

export const PLANS = [
  {
    name: "Starter",
    priceInr: 2499,
    minutes: 500,
    overage: 5.5,
    agents: 2,
    concurrency: 5,
    tagline: "For small businesses trying voice AI",
    features: ["2 voice agents", "500 calling minutes", "Hindi + English", "Call recordings & transcripts", "Email support"],
  },
  {
    name: "Growth",
    priceInr: 7999,
    minutes: 2000,
    overage: 4.5,
    agents: 10,
    concurrency: 25,
    tagline: "For growing teams that call every day",
    popular: true,
    features: [
      "10 voice agents",
      "2,000 calling minutes",
      "All 12 Indian languages",
      "Campaigns & CSV upload",
      "WhatsApp follow-ups",
      "CRM & webhook integrations",
      "Priority support",
    ],
  },
  {
    name: "Scale",
    priceInr: 24999,
    minutes: 8000,
    overage: 3.5,
    agents: 50,
    concurrency: 100,
    tagline: "For call-heavy operations & BPOs",
    features: [
      "Unlimited voice agents",
      "8,000 calling minutes",
      "100 concurrent calls",
      "Custom voices & cloning",
      "Dedicated account manager",
      "99.9% uptime SLA",
    ],
  },
];

export const ADMIN_EMAIL = "admin@neuraxine.in";
