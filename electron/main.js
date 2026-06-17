const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  desktopCapturer,
  session,
  screen,
} = require("electron");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// We talk to Claude through the locally-installed Claude Code CLI, which is
// already authenticated with the user's account (OAuth / subscription).
// No API key lives in this app.
const MODEL = process.env.CLAUDE_MODEL || "sonnet";
const isDev = !app.isPackaged;

let win = null;
let clickThrough = false;

// Scratch dir the CLI runs in (kept clean so it doesn't load this project's
// CLAUDE.md / skills) and where we drop screenshots for the vision feature.
const workDir = path.join(os.tmpdir(), "cue-copilot");
fs.mkdirSync(workDir, { recursive: true });

function resolveClaudeBin() {
  const candidates = [
    process.env.CLAUDE_BIN,
    path.join(os.homedir(), ".claude", "local", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "claude"; // fall back to PATH
}
const CLAUDE_BIN = resolveClaudeBin();

// Spawn the CLI, feed the prompt over stdin (avoids arg-length limits), and
// return the child so callers can stream or buffer stdout.
function spawnClaude(extraArgs, prompt) {
  const args = [
    "-p",
    "--model", MODEL,
    "--strict-mcp-config", // skip MCP servers → faster startup
    ...extraArgs,
  ];
  const child = spawn(CLAUDE_BIN, args, { cwd: workDir, env: process.env });
  child.stdin.write(prompt);
  child.stdin.end();
  return child;
}

function extractJson(text) {
  // The CLI may wrap JSON in prose or ```json fences; grab the first object.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in model output.");
  return JSON.parse(candidate.slice(start, end + 1));
}

function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 460;

  win = new BrowserWindow({
    width: winWidth,
    height: 640,
    x: width - winWidth - 24,
    y: 60,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(true); // invisible to screen-share / recording

  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
        callback({ video: sources[0], audio: "loopback" });
      });
    },
    { useSystemPicker: true }
  );

  const url = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "..", "client", "build", "index.html")}`;
  win.loadURL(url);
  if (isDev) win.webContents.openDevTools({ mode: "detach" });
}

function toggleVisibility() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else {
    win.show();
    win.focus();
  }
}

function toggleClickThrough() {
  if (!win) return;
  clickThrough = !clickThrough;
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
  win.webContents.send("clickthrough:changed", clickThrough);
}

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register("CommandOrControl+\\", toggleVisibility);
  globalShortcut.register("CommandOrControl+Shift+\\", toggleClickThrough);
  globalShortcut.register("CommandOrControl+Enter", () => {
    win?.show();
    win?.webContents.send("ask:focus");
  });
  // "What do I say?" — instant live suggestion during a meeting.
  globalShortcut.register("CommandOrControl+J", () => {
    win?.show();
    win?.webContents.send("coach:trigger");
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- Window controls ----
ipcMain.handle("window:hide", () => win?.hide());
ipcMain.handle("window:quit", () => app.quit());
ipcMain.handle("clickthrough:toggle", () => toggleClickThrough());

// ---- Capture the primary display to a PNG file the CLI can read ----
async function captureScreenshotToFile() {
  const { width, height } = screen.getPrimaryDisplay().size;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
  });
  if (!sources.length) return null;
  const file = path.join(workDir, "shot.png");
  fs.writeFileSync(file, sources[0].thumbnail.toPNG());
  return "shot.png"; // relative to workDir (the CLI's cwd)
}

// Generic streaming runner: spawns the CLI and emits `<prefix>:delta/done/error`
// events to the renderer as text streams in.
function streamClaude(event, prefix, { prompt, system, allowRead }) {
  const args = [
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--append-system-prompt", system,
  ];
  if (allowRead) args.push("--allowedTools", "Read");

  const child = spawnClaude(args, prompt);
  let acc = "";
  let stderr = "";
  let buf = "";

  child.stdout.on("data", (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (
        obj.type === "stream_event" &&
        obj.event?.type === "content_block_delta" &&
        obj.event.delta?.type === "text_delta"
      ) {
        acc += obj.event.delta.text;
        event.sender.send(`${prefix}:delta`, obj.event.delta.text);
      } else if (obj.type === "result" && typeof obj.result === "string") {
        acc = obj.result;
      }
    }
  });
  child.stderr.on("data", (d) => (stderr += d.toString()));
  child.on("error", (err) =>
    event.sender.send(`${prefix}:error`, `Couldn't run the Claude CLI (${CLAUDE_BIN}). Is Claude Code installed and logged in? ${err.message}`)
  );
  child.on("close", (code) => {
    if (code === 0 || acc) event.sender.send(`${prefix}:done`, acc);
    else event.sender.send(`${prefix}:error`, stderr.trim() || `Claude exited with code ${code}.`);
  });
}

const ASK_SYSTEM =
  "You are a discreet real-time meeting assistant overlaid on the user's screen. Give fast, concise, directly useful answers — short bullets or a short paragraph. If a screenshot is provided, ground your answer in it. Never pad.";

// ---- Streaming "ask about my screen" ----
ipcMain.handle("ask", async (event, { question, includeScreen }) => {
  let prompt = question?.trim() || "Look at my screen and tell me what's important right now and what I should do or say next.";
  if (includeScreen) {
    const rel = await captureScreenshotToFile();
    if (rel) prompt = `A screenshot of my screen is saved at ./${rel}. Read that image first, then: ${prompt}`;
  }
  streamClaude(event, "ask", { prompt, system: ASK_SYSTEM, allowRead: true });
});

// ---- Live meeting copilot: suggest what to say next ----
const COACH_SYSTEM =
  "You are a live meeting copilot, like a teleprompter whispering in the user's ear. You are given a rolling transcript of a conversation the user is in. Your job is to help the USER respond. Output ONLY what the user should say or do next — phrased so they can speak it almost verbatim — plus at most one short '(why)' note if useful. Be specific, confident, and brief (1-4 sentences or a few bullets). If a direct question was asked to the user, answer it. If asked about facts/technical topics, give the actual answer. Never narrate the transcript back. Never add preamble like 'You could say'.";

const COACH_MODES = {
  say: "What should the user say RIGHT NOW to respond well?",
  answer: "The user was likely just asked a question. Give the best concrete answer they should say.",
  followup: "Suggest a sharp follow-up question or point the user should raise next.",
  objection: "Anticipate the likely objection or pushback coming, and tell the user how to handle it.",
};

ipcMain.handle("coach", (event, { transcript, mode }) => {
  const ask = COACH_MODES[mode] || COACH_MODES.say;
  const prompt = `Rolling meeting transcript (most recent last):\n"""\n${transcript}\n"""\n\n${ask}`;
  streamClaude(event, "coach", { prompt, system: COACH_SYSTEM, allowRead: false });
});

// ---- Structured meeting brief ----
const BRIEF_INSTRUCTIONS = `Turn the meeting transcript below into a faithful, scannable brief.
Respond with ONLY a JSON object (no prose, no markdown fences) of exactly this shape:
{"summary": string, "key_points": string[], "decisions": string[], "action_items": [{"task": string, "owner": string}], "follow_up_questions": string[]}
Do not invent decisions or action items. Use empty arrays when a section has nothing. Owners are "Unassigned" unless the transcript makes them clear.`;

ipcMain.handle("summarize", async (_event, { title, transcript }) => {
  const prompt = `${BRIEF_INSTRUCTIONS}\n\nMeeting title: ${title || "Untitled meeting"}\n\nTranscript:\n"""\n${transcript}\n"""`;
  const child = spawnClaude(["--output-format", "json"], prompt);

  let out = "";
  let stderr = "";
  child.stdout.on("data", (d) => (out += d.toString()));
  child.stderr.on("data", (d) => (stderr += d.toString()));

  return new Promise((resolve, reject) => {
    child.on("error", (err) =>
      reject(new Error(`Couldn't run the Claude CLI. Is Claude Code installed and logged in? ${err.message}`))
    );
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `Claude exited with code ${code}.`));
      try {
        const envelope = JSON.parse(out);
        const text = typeof envelope.result === "string" ? envelope.result : out;
        resolve(extractJson(text));
      } catch (e) {
        reject(new Error(`Couldn't parse the brief: ${e.message}`));
      }
    });
  });
});
