import React from "react";
import { NavLink } from "react-router-dom";

const Navbar = () => {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? "nav-link nav-link--active" : "nav-link";

  return (
    <nav className="navbar">
      <NavLink to="/" className="brand">
        <span className="brand-dot" /> Cue
      </NavLink>
      <div className="nav-links">
        <NavLink to="/assistant" className={linkClass}>
          Assistant
        </NavLink>
        <NavLink to="/live" className={linkClass}>
          Live
        </NavLink>
        <NavLink to="/record" className={linkClass}>
          Record
        </NavLink>
        <NavLink to="/library" className={linkClass}>
          Library
        </NavLink>
      </div>
    </nav>
  );
};

export default Navbar;
