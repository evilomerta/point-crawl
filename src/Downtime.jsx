import React, { useEffect } from "react";
import { PALETTE } from "./data";
import Chronicle, { J, ConditionStrip } from "./Chronicle";
import { availableRolls } from "./downtime";

// =============================================================================
// BETWEEN TIDES — the adventurer's journal. The overlay is now a leather-bound
// shell around the Chronicle: candles, rumors, scars, and stories that flow
// onto the DM's docket. All game logic lives in Chronicle.jsx / chronicle.js.
// =============================================================================
export default function Downtime({ open, onClose, downtime, myKey, isDM, onPatch, supplies = 0 }) {
  const dt = downtime || {};
  const profile = dt.profiles?.[myKey];
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;

  return (
    <div onClick={onClose} style={backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={shell}>
        <div style={spine} />
        <div style={header}>
          <div className="disp" style={{ fontSize: 26, color: J.brassBright, letterSpacing: "0.14em", whiteSpace: "nowrap" }}>BETWEEN TIDES</div>
          <ConditionStrip profile={profile} spectator={!profile} actions={profile ? availableRolls(profile) : 0} />
          <button onClick={onClose} className="disp" style={ghost}>CLOSE ✕</button>
        </div>
        <Chronicle dt={dt} profile={profile} myKey={myKey} isDM={isDM} onPatch={onPatch} supplies={supplies} />
      </div>
    </div>
  );
}

const backdrop = { position: "fixed", inset: 0, zIndex: 55, background: "rgba(4,8,10,0.85)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'EB Garamond', Georgia, serif" };
const shell = {
  position: "relative", width: "min(1240px, 97vw)", height: "min(80vh, 760px)",
  background: `linear-gradient(155deg, ${J.leather2} 0%, ${J.leather} 55%, #120a05 100%)`,
  border: `2px solid ${J.brass}88`, borderRadius: 12,
  boxShadow: `0 30px 80px rgba(0,0,0,0.75), inset 0 0 90px rgba(0,0,0,0.55), inset 0 1px 0 ${J.brass}33`,
  display: "flex", flexDirection: "column", overflow: "hidden", color: PALETTE.parch,
};
const spine = { position: "absolute", top: 0, bottom: 0, left: 14, width: 2, background: `linear-gradient(${J.brass}00, ${J.brass}55 18%, ${J.brass}55 82%, ${J.brass}00)`, pointerEvents: "none" };
const header = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", padding: "13px 24px 11px", borderBottom: `1px solid ${J.brass}44` };
const ghost = { background: "transparent", color: PALETTE.parchDim, border: `1px solid ${J.brass}55`, borderRadius: 6, padding: "7px 16px", cursor: "pointer", fontSize: 15 };
