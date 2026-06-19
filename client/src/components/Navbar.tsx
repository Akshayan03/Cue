import React from "react";
import { NavLink } from "react-router-dom";
import { isDesktop } from "../api";

const Spark = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
  </svg>
);
const Wave = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0" />
  </svg>
);
const Rec = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
  </svg>
);
const Stack = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);

const ITEMS = [
  { to: "/assistant", label: "Ask", icon: <Spark /> },
  { to: "/live", label: "Live", icon: <Wave /> },
  { to: "/record", label: "Rec", icon: <Rec /> },
  { to: "/library", label: "Saved", icon: <Stack /> },
];

const Navbar = () => {
  const cls = ({ isActive }: { isActive: boolean }) =>
    isActive ? "rail-btn rail-btn--active" : "rail-btn";

  return (
    <nav className="rail">
      {!isDesktop() && (
        <NavLink to="/" className="rail-brand" title="Cue">
          <span className="brand-dot" />
        </NavLink>
      )}
      {ITEMS.map((it) => (
        <NavLink key={it.to} to={it.to} className={cls} title={it.label}>
          <span className="rail-icon">{it.icon}</span>
          <span className="rail-label">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default Navbar;
