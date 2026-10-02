const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const pkg = require("../package.json");

test("the desktop build includes modern loopback and the macOS audio permission description", () => {
  assert.ok(Number(pkg.devDependencies.electron.split(".")[0]) >= 44);
  assert.match(pkg.build.mac.extendInfo.NSAudioCaptureUsageDescription, /system audio/);
  assert.match(pkg.build.mac.extendInfo.NSAudioCaptureUsageDescription, /headphones/);
  const main = fs.readFileSync("electron/main.js", "utf8");
  assert.doesNotMatch(main, /appendSwitch\("enable-features", "MacLoopbackAudioForScreenShare"\)/);
  assert.match(main, /audio: "loopback"/);
  // Call audio uses Cue's own frame as video, so it never needs Screen Recording.
  assert.match(main, /video: request\.frame, audio: "loopback"/);
  assert.match(main, /ipcMain\.handle\("capture:audio-only"/);
  assert.doesNotMatch(main, /audio: "loopbackWithMute"/);
  assert.match(main, /useSystemPicker: false/);
});

test("reading or saving settings never touches the keychain unless an API key is stored", () => {
  const main = fs.readFileSync("electron/main.js", "utf8");
  // Starting a session saves settings; an unconditional safeStorage check there
  // can block the app behind a macOS keychain password prompt after an update.
  assert.doesNotMatch(main, /encryptionAvailable: safeStorage\.isEncryptionAvailable\(\)/);
  assert.match(main, /return s\.apiKeyEnc \? safeStorage\.isEncryptionAvailable\(\) : undefined;/);
});
