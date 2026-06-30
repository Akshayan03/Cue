import "dotenv/config";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";

const app = express();

// This server holds your ANTHROPIC_API_KEY, so don't let arbitrary web pages
// reach it. Only allow the local dev UI origin(s); override with CORS_ORIGIN
// (comma-separated) if you host the UI somewhere else.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:3001")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / curl (no Origin header) and the whitelisted origins.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error("Origin not allowed by CORS"));
    },
  })
);
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 3001;
// Bind to loopback by default so the key-bearing API isn't exposed to the LAN.
const HOST = process.env.HOST || "127.0.0.1";
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// JSON schema for a structured meeting brief. Constrains Claude's output so the
// frontend can render it without parsing free-form text.
const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description: "A concise 2-4 sentence overview of what the meeting covered.",
    },
    key_points: {
      type: "array",
      description: "The most important discussion points.",
      items: { type: "string" },
    },
    decisions: {
      type: "array",
      description: "Concrete decisions that were made.",
      items: { type: "string" },
    },
    action_items: {
      type: "array",
      description: "Follow-up tasks. Attribute an owner when the transcript makes it clear, else use 'Unassigned'.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          task: { type: "string" },
          owner: { type: "string" },
        },
        required: ["task", "owner"],
      },
    },
    follow_up_questions: {
      type: "array",
      description: "Open questions that were raised but not resolved.",
      items: { type: "string" },
    },
  },
  required: ["summary", "key_points", "decisions", "action_items", "follow_up_questions"],
};

const SYSTEM_PROMPT = `You are a meeting assistant. You are given a raw, automatically-generated transcript of a work meeting. The transcript may be imperfect (missing punctuation, misheard words, no speaker labels). Produce a structured brief.

Be faithful to the transcript — do not invent decisions or action items that were not actually discussed. If a section has nothing, return an empty array. Keep each item short and scannable.`;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.post("/api/summarize", async (req, res) => {
  const { transcript, title } = req.body ?? {};

  if (!transcript || typeof transcript !== "string" || transcript.trim().length < 20) {
    return res.status(400).json({ error: "A transcript of at least ~20 characters is required." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "Server is missing ANTHROPIC_API_KEY. Add it to server/.env and restart.",
    });
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: BRIEF_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Meeting title: ${title || "Untitled meeting"}\n\nTranscript:\n"""\n${transcript}\n"""`,
        },
      ],
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block) return res.status(502).json({ error: "Model returned no text content." });

    res.json(JSON.parse(block.text));
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`Claude API error ${err.status}:`, err.message);
      return res.status(502).json({ error: `Claude API error: ${err.message}` });
    }
    console.error("Summarize failed:", err);
    res.status(500).json({ error: "Failed to generate the brief." });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Cue server listening on http://${HOST}:${PORT} (model: ${MODEL})`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️  ANTHROPIC_API_KEY is not set — /api/summarize will return an error until you add it to server/.env");
  }
});
