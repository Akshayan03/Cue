import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ClaudeConnect from "./ClaudeConnect";

let showLink: () => void;
let finishLogin: (status: any) => void;
let electron: Record<string, jest.Mock>;
beforeEach(() => {
  electron = {
    claudeStatus: jest.fn().mockResolvedValueOnce({ step: "install" }).mockResolvedValue({ step: "signin", version: "2.1.287 (Claude Code)" }),
    installClaude: jest.fn().mockResolvedValue(undefined),
    loginClaude: jest.fn(() => new Promise(resolve => { finishLogin = resolve; })),
    submitClaudeLoginCode: jest.fn().mockResolvedValue(undefined),
    openClaudeLogin: jest.fn().mockResolvedValue(undefined),
    cancelClaudeLogin: jest.fn().mockResolvedValue(undefined),
    onClaudeLoginUrl: jest.fn((cb: () => void) => { showLink = cb; return jest.fn(); }),
  };
  window.electron = electron as any;
});
afterEach(() => { delete window.electron; });

test("installs Claude Code, signs in through the browser, then reports ready", async () => {
  const onReady = jest.fn();
  render(<ClaudeConnect onReady={onReady} />);
  fireEvent.click(await screen.findByRole("button", { name: "Install Claude Code" }));
  expect(electron.installClaude).toHaveBeenCalledTimes(1);
  fireEvent.click(await screen.findByRole("button", { name: "Sign in with Claude" }));
  expect(screen.getByText(/Finish signing in in your browser/)).toBeInTheDocument();
  act(() => showLink());
  fireEvent.click(screen.getByRole("button", { name: "Open sign-in page again" }));
  expect(electron.openClaudeLogin).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Sign-in code"), { target: { value: " abc123 " } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(electron.submitClaudeLoginCode).toHaveBeenCalledWith("abc123");
  await act(async () => finishLogin({ step: "ready", subscription: "max" }));
  expect(screen.getByText(/Claude account · max · Opus 5.5/)).toBeInTheDocument();
  expect(onReady).toHaveBeenCalledWith({ step: "ready", subscription: "max" });
});

test("an outdated Claude Code offers an update, and install failures can be retried", async () => {
  electron.claudeStatus.mockReset().mockResolvedValue({ step: "update", version: "2.1.168 (Claude Code)" });
  electron.installClaude.mockRejectedValueOnce(new Error("Claude Code didn't install. curl: (6) Could not resolve host"));
  render(<ClaudeConnect />);
  expect(await screen.findByText(/\(2\.1\.168\) is too old/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Update Claude Code" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Could not resolve host/);
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  expect(await screen.findByRole("button", { name: "Update Claude Code" })).toBeEnabled();
});

test("when connected, Settings can start a fresh sign-in", async () => {
  electron.claudeStatus.mockReset().mockResolvedValue({ step: "ready", subscription: "pro" });
  render(<ClaudeConnect manage />);
  fireEvent.click(await screen.findByRole("button", { name: "Sign in again" }));
  expect(electron.loginClaude).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Finish signing in in your browser/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(electron.cancelClaudeLogin).toHaveBeenCalled();
});
