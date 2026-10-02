import React from "react";
import { PrivacyPane } from "../electron";

/** Whether an error can be fixed by granting Screen Recording. */
export const needsScreenPermission = (message: string | null) => Boolean(message?.includes("can't see your screen"));

/** Opens the Privacy & Security pane that fixes the error it sits next to. */
export default function PrivacySettingsButton({ pane }: { pane: PrivacyPane }) {
  if (window.electron?.platform !== "darwin") return null;
  return <button className="btn btn--ghost" onClick={() => window.electron?.openPrivacySettings?.(pane)}>Open System Settings</button>;
}
