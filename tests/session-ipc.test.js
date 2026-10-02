const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { createRequire } = require("node:module");
const { promisify } = require("node:util");

function harness(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cue-ipc-test-"));
  const handlers = new Map();
  const children = [];
  const events = [];
  const config = { auth: { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" }, version: "2.1.287 (Claude Code)" };
  const execFile = () => {};
  execFile[promisify.custom] = async (_bin, args) => ({ stdout: args[0] === "--version" ? config.version : JSON.stringify(config.auth), stderr: "" });
  const electron = {
    app: { isPackaged: false, commandLine: { appendSwitch() {} }, getPath: () => directory, requestSingleInstanceLock: () => true, on() {}, whenReady: () => new Promise(() => {}) },
    protocol: { registerSchemesAsPrivileged() {} },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    systemPreferences: { getMediaAccessStatus: () => "denied" },
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
    process: { ...process, env: { PATH: "/bin", CLAUDE_BIN: "/fake/claude", ANTHROPIC_API_KEY: "not-real", ANTHROPIC_BASE_URL: "https://example.invalid" } },
    console, Buffer, URL, setTimeout, clearTimeout,
  });
  const event = { sender: { isDestroyed: () => false, send: (channel, payload) => events.push({ channel, ...payload }) } };
  t.after(() => { children.forEach(child => child.kill()); fs.rmSync(directory, { recursive: true, force: true }); });
  return { config, children, events, call: (name, payload) => handlers.get(name)(event, payload), check: () => handlers.get("session:check")() };
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
  assert.match(h.events[0].text, /claude auth login/);
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
