import React, { useState } from "react";
import { PALETTE, FACTIONS } from "./data";
import { DT, COLLECTIVE_FACTIONS } from "./downtime";

// Shown once, right after a player logs in, before they can use the site.
// It captures who they are (party character or faction agent), their sworn
// faction, and — for characters — their D&D Beyond sheet link. Saved into the
// game's downtime profile, so it never appears again for that player.
export default function Onboard({ name, onSave, onLeave }) {
  const [kind, setKind] = useState("member");
  const [faction, setFaction] = useState("Boughs");
  const [url, setUrl] = useState("");
  const [portrait, setPortrait] = useState("");

  const save = () => {
    onSave({
      kind, name, faction, portrait, charUrl: kind === "member" ? url.trim() : "",
      affinity: 0, rolls: DT.MAX_FREE, lastRefill: Date.now(),
    });
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <div className="disp" style={{ fontSize: 30, color: PALETTE.goldBright, textAlign: "center" }}>WELCOME, {name.toUpperCase()}</div>
        <div style={{ fontSize: 16, color: PALETTE.parchDim, textAlign: "center", fontStyle: "italic", margin: "8px 0 22px" }}>
          One question before you enter. This is asked only once.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))", columnGap: 34, alignItems: "start" }}>
        <div>
        <Label>WHO ARE YOU IN THE DROWNED WORLD?</Label>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Pick on={kind === "member"} onClick={() => setKind("member")}
            title="A party character" sub="You play at the table. Downtime can earn things for your real sheet." />
          <Pick on={kind === "agent"} onClick={() => setKind("agent")}
            title="A faction agent" sub="You aid from the wings. You rank up and earn the party boons." />
        </div>

        <Label>SWORN FACTION</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
          {COLLECTIVE_FACTIONS.map((f) => {
            const on = faction === f;
            return (
              <button key={f} onClick={() => setFaction(f)} style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, textAlign: "left",
                background: on ? `${FACTIONS[f].color}1f` : "transparent",
                border: `1px solid ${on ? FACTIONS[f].color : PALETTE.gold + "33"}`,
                borderRadius: 10, padding: "9px 14px", cursor: "pointer",
              }}>
                <span className="disp" style={{ fontSize: 16, color: on ? FACTIONS[f].color : PALETTE.bone }}>{FACTIONS[f].sym} {FACTIONS[f].label}</span>
                <span style={{ fontSize: 13.5, color: PALETTE.parchDim, lineHeight: 1.35 }}>{FACTIONS[f].blurb}</span>
              </button>
            );
          })}
        </div>

        </div>
        <div>
        {kind === "member" && (<>
          <Label>D&D BEYOND SHEET LINK (optional)</Label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.dndbeyond.com/characters/…"
            style={input} />
          <div style={{ fontSize: 15, color: PALETTE.parchDim, margin: "7px 0 4px" }}>
            Save it now and a “My Sheet” button opens your character from anywhere on the site.
          </div>
        </>)}

        <Label>Choose your portrait (optional, change it anytime on your Character page)</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10, marginBottom: 14 }}>
          {[...Array(16)].map((_, i) => {
            const n = String(i + 1).padStart(2, "0");
            const on = portrait === n;
            return (
              <button key={n} onClick={() => setPortrait(on ? "" : n)}
                style={{ width: "100%", aspectRatio: "3 / 4", padding: 0, borderRadius: 8, overflow: "hidden", cursor: "pointer", background: "#0d0a06",
                  border: `2.5px solid ${on ? PALETTE.goldBright : PALETTE.gold + "33"}`,
                  boxShadow: on ? `0 0 14px ${PALETTE.goldBright}55` : "none", transition: "border-color .15s, box-shadow .15s" }}>
                <PortraitThumb n={n} />
              </button>
            );
          })}
        </div>
        </div>
        </div>
        <button onClick={save} className="disp" style={gold}>ENTER THE WORLD</button>
        <button onClick={onLeave} className="disp" style={ghost}>‹ back to login</button>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div className="disp" style={{ fontSize: 14, color: PALETTE.gold, letterSpacing: "0.16em", margin: "14px 0 7px" }}>{children}</div>;
}
function Pick({ on, onClick, title, sub }) {
  return <button onClick={onClick} style={{
    flex: 1, textAlign: "left", padding: "14px 16px", borderRadius: 8, cursor: "pointer",
    background: on ? `${PALETTE.gold}1f` : "transparent", border: `1px solid ${on ? PALETTE.gold : PALETTE.gold + "33"}`,
  }}>
    <div className="disp" style={{ fontSize: 18, color: on ? PALETTE.goldBright : PALETTE.parch }}>{title}</div>
    <div style={{ fontSize: 15, color: PALETTE.parchDim, marginTop: 4, lineHeight: 1.45 }}>{sub}</div>
  </button>;
}

const wrap = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
  background: `radial-gradient(circle at 30% 20%, ${PALETTE.sea}, ${PALETTE.ink} 70%)`,
  fontFamily: "'EB Garamond', Georgia, serif", color: PALETTE.parch, padding: 20,
};
const card = {
  width: "min(1140px, 95vw)", padding: "32px 38px", borderRadius: 12,
  background: "rgba(8,16,18,0.78)", border: `1px solid ${PALETTE.gold}44`,
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
};
const input = {
  width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 5,
  background: "rgba(0,0,0,0.35)", border: `1px solid ${PALETTE.gold}44`,
  color: PALETTE.bone, fontSize: 17, fontFamily: "inherit", outline: "none",
};
const gold = { width: "100%", marginTop: 18, padding: 14, border: "none", borderRadius: 6, background: `linear-gradient(${PALETTE.gold}, ${PALETTE.parchDim})`, color: PALETTE.ink, cursor: "pointer", letterSpacing: "0.12em", fontSize: 17 };
const ghost = { width: "100%", marginTop: 10, padding: 9, background: "transparent", color: PALETTE.parchDim, border: "none", cursor: "pointer", fontSize: 15 };
const chip = { background: "transparent", border: "1px solid", borderRadius: 20, padding: "7px 15px", cursor: "pointer", fontSize: 16 };

function PortraitThumb({ n }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <span className="disp" style={{ color: PALETTE.parchDim, fontSize: 14, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>;
  return <img src={`/downtime/portrait-${n}.jpg`} alt="" onError={() => setOk(false)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
}
