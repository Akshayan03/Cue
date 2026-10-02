const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { createRequire } = require("node:module");
const { promisify } = require("node:util");

function harness(t, { platform = process.platform } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cue-ipc-test-"));
  const handlers = new Map();
  const children = [];
  const events = [];
  const captures = [];
  const opened = [];
  const config = { screen: "denied", auth: { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" }, version: "2.1.287 (Claude Code)" };
  const execFile = () => {};
  execFile[promisify.custom] = async (_bin, args) => {
    if (args[0] === "--version") return { stdout: config.version, stderr: "" };
    const stdout = JSON.stringify(config.auth);
    // Like the real CLI, `auth status` exits non-zero when signed out.
    if (!config.auth.loggedIn) throw Object.assign(new Error("Command failed"), { stdout });
    return { stdout, stderr: "" };
  };
  const electron = {
    app: { isPackaged: false, commandLine: { appendSwitch() {} }, getPath: () => directory, requestSingleInstanceLock: () => true, on() {}, whenReady: () => new Promise(() => {}) },
    protocol: { registerSchemesAsPrivileged() {} },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    systemPreferences: { getMediaAccessStatus: kind => kind === "screen" ? config.screen : "denied" },
    desktopCapturer: { getSources: async options => { captures.push(options); return []; } },
    shell: { openExternal: async url => { opened.push(url); } },
  };
  const realRequire = createRequire(path.resolve("electron/main.js"));
  const mocks = {
    electron,
    dotenv: { config() {} },
    os: { ...os, tmpdir: () => directory },
    fs: { ...fs, existsSync: file => file === "/fake/claude" || fs.existsSync(file) },
    child_process: { execFile, spawn: (bin, args, options) => {
      const child = new EventEmitter();
      Object.assign(child, { bin, args, options, prompt: "", stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: new EventEmitter() });
      child.stdin.write = text => { child.prompt += text; };
      child.stdin.end = () => {};
      child.kill = () => { child.killed = true; child.emit("close", 0); };
      children.push(child);
      return child;
    } },
  };
  vm.runInNewContext(fs.readFileSync("electron/main.js", "utf8"), {
    require: name => mocks[name] || realRequire(name),
    __dirname: path.resolve("electron"),
    process: { ...process, platform, env: { PATH: "/bin", CLAUDE_BIN: "/fake/claude", ANTHROPIC_API_KEY: "not-real", ANTHROPIC_BASE_URL: "https://example.invalid" } },
    console, Buffer, URL, setTimeout, clearTimeout,
  });
  const event = { sender: { isDestroyed: () => false, send: (channel, payload) => events.push({ channel, ...payload }) } };
  t.after(() => { children.forEach(child => child.kill()); fs.rmSync(directory, { recursive: true, force: true }); });
  return { config, children, events, captures, opened, call: (name, payload) => handlers.get(name)(event, payload), check: () => handlers.get("session:check")() };
}
const delta = text => JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } }) + "\n";

test("session requests launch Opus on OAuth with no tools, hooks, or API fallback", async t => {
  const h = harness(t);
  await h.call("session:respond", { id: "prep-1", kind: "prep", context: { resume: "Real experience" }, question: "Prepare me" });
  const child = h.children[0];
  const flag = name => child.args[child.args.indexOf(name) + 1];
  assert.equal(flag("--model"), "claude-opus-5-5");
  assert.equal(flag("--effort"), "medium");
  assert.equal(flag("--tools"), "");
  assert.equal(flag("--setting-sources"), "");
  assert.equal(child.options.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(child.options.env.ANTHROPIC_BASE_URL, undefined);
  assert.ok(child.args.includes("--no-session-persistence"));
  assert.match(child.prompt, /Real experience/);
  child.stdout.emit("data", delta("Your strongest example"));
  child.stdout.emit("data", JSON.stringify({ type: "result", result: "Your strongest example", is_error: false }) + "\n");
  child.emit("close", 0);
  assert.deepEqual(h.events.map(e => e.type), ["delta", "done"]);
  assert.ok(h.events.every(e => e.id === "prep-1"));
});

test("new answers cancel old processes and late events cannot cross request IDs", async t => {
  const h = harness(t);
  await h.call("session:respond", { id: "old", kind: "live", question: "First" });
  await h.call("session:respond", { id: "new", kind: "live", question: "Second" });
  assert.equal(h.children[0].killed, true);
  assert.equal(h.children[1].args[h.children[1].args.indexOf("--effort") + 1], "low");
  h.children[0].stdout.emit("data", delta("wrong answer"));
  h.children[1].stdout.emit("data", delta("right answer"));
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].id, "new");
  await h.call("session:cancel", "old");
  assert.notEqual(h.children[1].killed, true);
  await h.call("session:cancel", "new");
  assert.equal(h.children[1].killed, true);
});

test("expired OAuth returns a sign-in error even when the CLI exits with code zero", async t => {
  const h = harness(t);
  await h.call("session:respond", { id: "auth", kind: "prep", question: "Hello" });
  h.children[0].stdout.emit("data", JSON.stringify({ type: "result", is_error: true, result: "401 OAuth access token has expired" }) + "\n");
  h.children[0].emit("close", 0);
  assert.equal(h.events[0].type, "error");
  assert.match(h.events[0].text, /Sign in again/);
  assert.equal(h.events.some(e => e.type === "done"), false);
});

test("connection check requires subscription authentication and a supported CLI", async t => {
  const h = harness(t);
  assert.equal((await h.check()).model, "claude-opus-5-5");
  h.config.auth.authMethod = "api_key";
  await assert.rejects(h.check(), /Claude subscription/);
  h.config.auth.authMethod = "claude.ai";
  h.config.version = "2.1.168";
  await assert.rejects(h.check(), /2.1.280/);
});

test("switching on screen context reports missing Screen Recording and registers the app with macOS", async t => {
  const h = harness(t, { platform: "darwin" });
  assert.match(await h.call("screen:check"), /can't see your screen yet.*Turn on Electron/);
  assert.equal(h.captures.length, 1);
  h.config.screen = "granted";
  assert.equal(await h.call("screen:check"), null);
  assert.equal(h.captures.length, 1);
});

test("live answers with screen context fail clearly without Screen Recording", async t => {
  const h = harness(t, { platform: "darwin" });
  await h.call("session:respond", { id: "screen", kind: "live", question: "Solve this", includeScreen: true });
  assert.equal(h.children.length, 0);
  assert.equal(h.events[0].type, "error");
  assert.match(h.events[0].text, /can't see your screen/);
  assert.equal(h.captures.length, 1);
});

test("privacy settings open only the known panes", async t => {
  const h = harness(t, { platform: "darwin" });
  await h.call("privacy:open-settings", "screen");
  await h.call("privacy:open-settings", "audio");
  await h.call("privacy:open-settings", "https://example.invalid");
  assert.deepEqual(h.opened, [
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture",
  ]);
});

test("Claude setup status walks from update to sign-in to ready, even when signed-out status exits non-zero", async t => {
  const h = harness(t);
  h.config.version = "2.1.168 (Claude Code)";
  assert.deepEqual({ ...await h.call("claude:status") }, { step: "update", version: "2.1.168 (Claude Code)" });
  await assert.rejects(h.check(), /2\.1\.280/);
  h.config.version = "2.1.287 (Claude Code)";
  h.config.auth = { loggedIn: false, authMethod: "none", apiProvider: "firstParty" };
  assert.equal((await h.call("claude:status")).step, "signin");
  await assert.rejects(h.check(), /Sign in with your Claude subscription/);
  h.config.auth = { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "pro" };
  assert.deepEqual({ ...await h.call("claude:status") }, { step: "ready", version: "2.1.287 (Claude Code)", subscription: "pro" });
});

test("in-app sign-in runs Claude's browser login, forwards a pasted code, and opens only Claude URLs", async t => {
  const h = harness(t, { platform: "darwin" });
  h.config.auth = { loggedIn: false, authMethod: "none", apiProvider: "firstParty" };
  const login = h.call("claude:login");
  const child = h.children[0];
  assert.deepEqual([...child.args], ["auth", "login", "--claudeai"]);
  assert.equal(child.options.env.ANTHROPIC_API_KEY, undefined);
  child.stdout.emit("data", "Opening browser to sign in…\nSee https://evil.example/oauth/authorize?x=1\n");
  child.stdout.emit("data", "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&state=s\nPaste code here if prompted > ");
  assert.equal(h.events.filter(e => e.channel === "claude:login-url").length, 1);
  await h.call("claude:login-open");
  assert.deepEqual(h.opened, ["https://claude.com/cai/oauth/authorize?code=true&state=s"]);
  await h.call("claude:login-code", " pasted-code ");
  assert.equal(child.prompt, "pasted-code\n");
  h.config.auth = { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" };
  child.emit("close", 0);
  assert.equal((await login).step, "ready");
});

test("a sign-in that ends without logging in reports why", async t => {
  const h = harness(t);
  h.config.auth = { loggedIn: false, authMethod: "none", apiProvider: "firstParty" };
  const login = h.call("claude:login");
  h.children[0].stderr.emit("data", "OAuth error: invalid code\n");
  h.children[0].emit("close", 1);
  await assert.rejects(login, /Sign-in didn't finish\. OAuth error: invalid code/);
});
