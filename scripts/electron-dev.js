// Starts Electron for `npm run dev`.
//
// On macOS, an app spawned from a shell inherits the shell's host app
// (Terminal, an IDE, Claude Code) as its "responsible" process for privacy
// permissions. macOS then checks *that* app for NSAudioCaptureUsageDescription
// and silently refuses call audio: no prompt, and nothing is listed under
// System Audio Recording Only. Launching through LaunchServices (`open`) makes
// Electron responsible for itself, so macOS prompts for it and lists it.
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const electron = require("electron");

const root = path.join(__dirname, "..");

if (process.platform !== "darwin") {
  const child = spawn(electron, [root], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  const appBundle = path.resolve(electron, "..", "..", "..");
  const log = path.join(os.tmpdir(), `cue-electron-${process.pid}.log`);
  fs.writeFileSync(log, "");

  // LaunchServices starts apps with a minimal environment; forward what
  // main.js reads (PATH is used to find the Claude CLI).
  const forwarded = ["PATH", "CLAUDE_BIN", "CLAUDE_MODEL", "CLAUDE_API_MODEL", "CUE_TEST_PROD"]
    .filter((name) => process.env[name] !== undefined)
    .flatMap((name) => ["--env", `${name}=${process.env[name]}`]);

  const tail = spawn("tail", ["-n", "+1", "-f", log], { stdio: ["ignore", "inherit", "inherit"] });
  const child = spawn("open", ["-W", "-n", "-a", appBundle, "--stdout", log, "--stderr", log, ...forwarded, "--args", root], { stdio: "inherit" });

  // `open -W` exits when Electron quits, but killing `open` leaves Electron
  // running, so stop the launched instance ourselves.
  const stopElectron = () => {
    try {
      const command = `${electron} ${root}`;
      execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
        .split("\n")
        .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
        .filter((match) => match && match[2] === command)
        .forEach((match) => process.kill(Number(match[1]), "SIGTERM"));
    } catch {}
  };
  const cleanUp = () => {
    tail.kill();
    fs.rmSync(log, { force: true });
  };
  child.on("exit", (code) => {
    cleanUp();
    process.exit(code ?? 0);
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      stopElectron();
      cleanUp();
      process.exit(0);
    });
  }
}
