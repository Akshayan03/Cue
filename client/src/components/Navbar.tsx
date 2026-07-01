import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { isDesktop } from "../api";

const Wave = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <path d="M3 12h1M7 9v6M11 5v14M15 8v8M19 11v2M22 12h-1" />
  </svg>
);
const Spark = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
  </svg>
);
const Rec = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
  </svg>
);
const Stack = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);

const ITEMS = [
  { to: "/live", label: "Live", icon: <Wave /> },
  { to: "/assistant", label: "Ask", icon: <Spark /> },
  { to: "/record", label: "Record", icon: <Rec /> },
  { to: "/library", label: "Saved", icon: <Stack /> },
];

/** Hotkey hint that matches the tab you're on. */
const HINTS: Record<string, { keys: string; label: string }> = {
  "/live": { keys: "⌘J", label: "what do I say" },
  "/assistant": { keys: "⌘↵", label: "ask" },
};

const TabBar = () => {
  const { pathname } = useLocation();
  const hint = HINTS[pathname];
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? "tab tab--active" : "tab");

  return (
    <nav className="tabbar">
      {ITEMS.map((it) => (
        <NavLink key={it.to} to={it.to} className={cls}>
          {it.icon}
          {it.label}
        </NavLink>
      ))}
      {isDesktop() && hint && (
        <span className="tabbar-hint">
          <kbd>{hint.keys}</kbd> {hint.label}
        </span>
      )}
    </nav>
  );
};

export default TabBar;
