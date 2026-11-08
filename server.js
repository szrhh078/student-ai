import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const root = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(root, "public")));

let firebaseReady = false;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firebaseReady = true;
  }
} catch (error) {
  console.error("Firebase Admin initialization failed:", error.message);
}

async function requireUser(req, res, next) {
  if (!firebaseReady) return res.status(503).json({ error: "Server authentication is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON to the private .env file and restart." });
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Please sign in to use the AI assistant." });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });
  }
}

app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, configured: Boolean(process.env.GEMINI_API_KEY), authenticated: firebaseReady, model: MODEL });
});

const instructions = {
  planner: "You are Smart Student AI, a practical academic planning assistant. Create a realistic weekly study plan based only on supplied availability. Include breaks, revision, priorities, measurable tasks, and a concise weekly review. Do not invent class times or deadlines.",
  tutor: "You are Smart Student AI, a patient university tutor. Explain clearly at the requested level. Define terms, show calculations step by step, include a worked example, common mistakes, and practice questions with answers.",
  coach: "You are Smart Student AI, an encouraging but precise academic coach. Give actionable, realistic advice, avoid unsupported assumptions, and organize the response into clear steps."
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function statusOf(e) { return Number(e?.status || e?.statusCode || e?.code || 0); }

app.post("/api/generate", requireUser, async (req, res) => {
  const { task, prompt } = req.body || {};
  if (!Object.hasOwn(instructions, task) || typeof prompt !== "string" || !prompt.trim())
    return res.status(400).json({ error: "Choose a valid assistant and enter a prompt." });
  if (prompt.length > 8000) return res.status(413).json({ error: "Prompt is too long. Please shorten it." });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "Gemini is not configured. Add your private GEMINI_API_KEY to .env." });

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL, contents: prompt.trim(),
        config: { systemInstruction: instructions[task], temperature: 0.35, maxOutputTokens: 2200 }
      });
      if (!response.text?.trim()) return res.status(502).json({ error: "The AI returned an empty response. Try again." });
      return res.json({ text: response.text.trim(), model: MODEL });
    } catch (e) {
      last = e;
      const s = statusOf(e);
      if (!(s === 503 || s === 429) || attempt === 2) break;
      await sleep(700 * (2 ** attempt));
    }
  }
  const s = statusOf(last);
  const message = s === 429 ? "Gemini quota or rate limit reached. Try later or check AI Studio usage."
    : s === 503 ? "Gemini is temporarily busy. Wait a moment and retry."
    : `AI request failed: ${String(last?.message || "Unknown error").slice(0, 300)}`;
  console.error("Gemini error:", last?.message);
  res.status(s === 429 || s === 503 ? s : 502).json({ error: message });
});

app.get("*", (_req, res) => res.sendFile(path.join(root, "public", "index.html")));
app.listen(PORT, () => console.log(`Smart Student AI listening at http://localhost:${PORT}`));
