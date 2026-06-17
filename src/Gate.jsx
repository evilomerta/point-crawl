import React, { useState } from "react";
import { PALETTE } from "./data";

const SITE_PW = import.meta.env.VITE_SITE_PASSWORD || "changeme";
const DM_PW = import.meta.env.VITE_DM_PASSWORD || "dmsecret";
const LOGIN_KEY = "dw_login_v1";

function savedLogin() {
  try { return JSON.parse(localStorage.getItem(LOGIN_KEY)) || null; } catch { return null; }
}

export default function Gate({ onEnter }) {
  const saved = savedLogin();
  const [pw, setPw] = useState(saved?.pw || "");
  const [name, setName] = useState(saved?.name || "");
  const [room, setRoom] = useState(saved?.room || "drowned");
  const [remember, setRemember] = useState(!!saved);
  const [dmMode, setDmMode] = useState(false);
  const [dmPw, setDmPw] = useState("");
  const [err, setErr] = useState("");

  const persist = () => {
    if (remember) localStorage.setItem(LOGIN_KEY, JSON.stringify({ pw, name: name.trim(), room: room.trim() || "drowned" }));
    else localStorage.removeItem(LOGIN_KEY);
  };

  const submit = () => {
    if (pw !== SITE_PW) return setErr("Wrong password.");
    if (!name.trim()) return setErr("Enter a name.");
    persist();
    if (dmMode) {
      if (dmPw !== DM_PW) return setErr("Wrong DM password.");
      onEnter({ role: "dm", name: name.trim(), room: room.trim() || "drowned" });
    } else {
      onEnter({ role: "player", name: name.trim(), room: room.trim() || "drowned" });
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `radial-gradient(circle at 30% 20%, ${PALETTE.sea}, ${PALETTE.ink} 70%)`,
      fontFamily: "'EB Garamond', Georgia, serif", color: PALETTE.parch,
    }}>
      <div style={{
        width: 340, padding: 28, borderRadius: 12,
        background: "rgba(8,16,18,0.7)", border: `1px solid ${PALETTE.gold}44`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <div className="disp" style={{ fontSize: 24, color: PALETTE.goldBright, textAlign: "center" }}>
          THE DROWNED WORLD
        </div>
        <div style={{ fontSize: 13, color: PALETTE.parchDim, textAlign: "center", fontStyle: "italic", marginBottom: 20 }}>
          Speak the word to pass.
        </div>

        <Field label="Password" value={pw} onChange={setPw} type="password" onEnter={submit} />
        <Field label="Your name" value={name} onChange={setName} onEnter={submit} />
        <Field label="Room code" value={room} onChange={setRoom} onEnter={submit} />

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, margin: "12px 0 2px", cursor: "pointer", color: PALETTE.parch }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Save my name &amp; password on this device
        </label>
        {saved && (
          <button onClick={() => { localStorage.removeItem(LOGIN_KEY); setPw(""); setName(""); setRoom("drowned"); setRemember(false); }}
            style={{ background: "transparent", border: "none", color: PALETTE.parchDim, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 4, textDecoration: "underline" }}>
            forget saved login
          </button>
        )}

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: "10px 0", cursor: "pointer", color: PALETTE.parchDim }}>
          <input type="checkbox" checked={dmMode} onChange={(e) => setDmMode(e.target.checked)} />
          I am the Dungeon Master
        </label>
        {dmMode && <Field label="DM password" value={dmPw} onChange={setDmPw} type="password" onEnter={submit} />}

        {err && <div style={{ color: PALETTE.bad, fontSize: 13, margin: "6px 0" }}>{err}</div>}

        <button onClick={submit} className="disp" style={{
          width: "100%", marginTop: 14, padding: 11, border: "none", borderRadius: 6,
          background: `linear-gradient(${PALETTE.gold}, ${PALETTE.parchDim})`, color: PALETTE.ink,
          cursor: "pointer", letterSpacing: "0.12em", fontSize: 13,
        }}>
          {dmMode ? "TAKE THE DM SEAT" : "JOIN THE TABLE"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", onEnter }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.15em", color: PALETTE.gold, marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <input
        type={type} value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()}
        style={{
          width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 5,
          background: "rgba(0,0,0,0.35)", border: `1px solid ${PALETTE.gold}44`,
          color: PALETTE.bone, fontSize: 14, fontFamily: "inherit", outline: "none",
        }}
      />
    </div>
  );
}
