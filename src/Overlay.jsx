import React, { useEffect, useState } from "react";
import {
  PALETTE, FACTIONS, NODES, LORE, LORE_ORDER, WORLD, FACTION_LORE, FACTION_LORE_ORDER, stripThe,
} from "./data";
import { SCALE, useIsMobile } from "./mobile";

export default function Overlay({ onClose, journal = {}, onSave, myName, rep = {} }) {
  const isMobile = useIsMobile();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  // The shared journal lives inside the codex as its own condensed category:
  // one book for the world's lore and the table's notes on it.
  const codexList = [
    { kind: "header", label: "WORLD" },
    { kind: "world", key: "_world", label: stripThe(WORLD.title) },
    { kind: "header", label: "FACTIONS" },
    ...FACTION_LORE_ORDER.map((k) => ({ kind: "faction", key: "fac_" + k, fkey: k, label: `${FACTION_LORE[k].sym} ${stripThe(FACTION_LORE[k].name)}`, color: FACTION_LORE[k].color })),
    { kind: "header", label: "LOCATIONS" },
    ...LORE_ORDER.map((k) => ({ kind: "loc", key: k, label: stripThe(NODES[k].name), color: FACTIONS[NODES[k].faction].color })),
    { kind: "header", label: "JOURNAL" },
    { kind: "journal", key: "j__campaign", jkey: "_campaign", label: "Campaign Log (general)", color: PALETTE.gold, dot: !!journal["_campaign"]?.text },
    ...LORE_ORDER.map((k) => ({ kind: "journal", key: "j_" + k, jkey: k, label: stripThe(NODES[k].name), color: FACTIONS[NODES[k].faction].color, dot: !!journal[k]?.text })),
  ];

  const [sel, setSel] = useState("_world");
  const [showBook, setShowBook] = useState(false);
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState({ "WORLD": true, FACTIONS: true, LOCATIONS: true, JOURNAL: true });
  const toggleCat = (label) => setCollapsed((c) => ({ ...c, [label]: !c[label] }));
  const labelFor = (key) => (key === "_campaign" ? "Campaign Log (general)" : NODES[key]?.name || key);
  const selItem = codexList.find((i) => i.key === sel);
  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? codexList.filter((i) => i.kind !== "header" && i.label.toLowerCase().includes(ql))
    : null;
  // group flat codexList into { header, items } for collapsible categories
  const groups = [];
  codexList.forEach((it) => {
    if (it.kind === "header") groups.push({ header: it.label, items: [] });
    else if (groups.length) groups[groups.length - 1].items.push(it);
  });

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(4,8,10,0.82)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'EB Garamond', Georgia, serif",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: isMobile ? `${96 / SCALE}vw` : "min(1240px, 97vw)", height: isMobile ? `${90 / SCALE}vh` : "min(80vh, 760px)",
        background: `linear-gradient(160deg, ${PALETTE.deep}, ${PALETTE.ink})`,
        border: `2px solid ${PALETTE.gold}66`, borderRadius: 12,
        boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px", borderBottom: `1px solid ${PALETTE.gold}44` }}>
          <div className="disp" style={{ fontSize: 24, color: PALETTE.goldBright, letterSpacing: "0.12em" }}>
            CODEX
          </div>
          <button onClick={onClose} className="disp" style={{
            background: "transparent", color: PALETTE.parchDim, border: `1px solid ${PALETTE.gold}44`,
            borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 14,
          }}>CLOSE ✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flex: 1, minHeight: 0 }}>
          <div style={{ width: isMobile ? "100%" : 260, maxHeight: isMobile ? "40vh" : undefined, borderRight: isMobile ? "none" : `1px solid ${PALETTE.gold}33`, borderBottom: isMobile ? `1px solid ${PALETTE.gold}33` : "none", overflowY: "auto", padding: "8px 0", display: "flex", flexDirection: "column", flexShrink: isMobile ? 0 : undefined }}>
            <div style={{ padding: "6px 14px 10px" }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the codex…"
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 6, background: "rgba(0,0,0,0.35)", border: `1px solid ${PALETTE.gold}44`, color: PALETTE.bone, fontSize: 14, fontFamily: "inherit", outline: "none" }} />
            </div>
            <div style={{ padding: "0 14px 10px" }}>
              <button onClick={() => setShowBook(true)} className="disp" style={{
                width: "100%", padding: "9px 10px", borderRadius: 6, cursor: "pointer",
                background: showBook ? `${PALETTE.gold}30` : `${PALETTE.gold}18`,
                border: `1px solid ${PALETTE.gold}aa`, color: PALETTE.goldBright,
                fontSize: 13, letterSpacing: "0.14em",
              }}>PLAYER HAND BOOK</button>
            </div>
            <div style={{ overflowY: "auto" }}>
            {(filtered
                  ? (filtered.length
                      ? filtered.map((it) => <ListRow key={it.key} active={it.key === sel} color={it.color} label={it.label} dot={it.dot} onClick={() => { setShowBook(false); setSel(it.key); }} />)
                      : <div style={{ padding: "10px 18px", fontSize: 14, color: PALETTE.parchDim, fontStyle: "italic" }}>Nothing matches “{q}”.</div>)
                  : groups.map((g) => {
                      const isOpen = !collapsed[g.header];
                      return (
                        <div key={g.header}>
                          <div onClick={() => toggleCat(g.header)} className="disp" style={{
                            display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: PALETTE.gold,
                            letterSpacing: "0.2em", padding: "12px 18px 4px", cursor: "pointer", userSelect: "none",
                          }}>
                            <span style={{ fontSize: 9, display: "inline-block", transition: "transform 0.18s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                            {g.header}
                          </div>
                          {isOpen && g.items.map((it) => (
                            <ListRow key={it.key} active={it.key === sel} color={it.color} label={it.label} dot={it.dot} onClick={() => { setShowBook(false); setSel(it.key); }} />
                          ))}
                        </div>
                      );
                    }))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: showBook ? 0 : "20px 26px", display: showBook ? "flex" : "block", flexDirection: "column" }}>
            {showBook ? <HandbookViewer />
              : selItem?.kind === "world" ? <WorldEntry />
              : selItem?.kind === "faction" ? <FactionEntry fkey={selItem.fkey} rep={rep} />
              : selItem?.kind === "journal" ? <JournalEntry key={sel} selKey={selItem.jkey} label={labelFor(selItem.jkey)} entry={journal[selItem.jkey]} onSave={onSave} />
              : <LocationEntry id={sel} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListRow({ active, color, label, dot, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: "9px 18px", cursor: "pointer", fontSize: 15,
      color: active ? PALETTE.goldBright : PALETTE.parch,
      background: active ? `${PALETTE.gold}1f` : "transparent",
      borderLeft: `3px solid ${active ? (color || PALETTE.gold) : "transparent"}`,
    }}>
      {label}{dot ? <span style={{ color: PALETTE.ok }}> ●</span> : null}
    </div>
  );
}

const bookBtn = {
  background: "transparent", color: PALETTE.parch, border: `1px solid ${PALETTE.gold}66`,
  borderRadius: 6, padding: "6px 12px", fontSize: 12, textDecoration: "none", letterSpacing: "0.1em",
};

function HandbookViewer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${PALETTE.gold}33`, flexWrap: "wrap" }}>
        <div className="disp" style={{ fontSize: 17, color: PALETTE.goldBright, letterSpacing: "0.1em" }}>THE DROWNED WORLD: PLAYER HAND BOOK</div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="disp" href="/player-handbook.pdf" target="_blank" rel="noopener noreferrer" style={bookBtn}>OPEN IN TAB</a>
          <a className="disp" href="/player-handbook.pdf" download="The-Drowned-World-Players-Guide.pdf" style={bookBtn}>DOWNLOAD</a>
        </div>
      </div>
      <iframe src="/player-handbook.pdf#view=FitH" title="Player Hand Book" style={{ flex: 1, width: "100%", border: "none", background: "#1a2228", minHeight: 0 }} />
      <div style={{ padding: "6px 16px 8px", fontSize: 12, color: PALETTE.parchDim, fontStyle: "italic", borderTop: `1px solid ${PALETTE.gold}22` }}>
        If the book does not display on your device, use Open in Tab or Download above.
      </div>
    </div>
  );
}

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginTop: 18 }}>
      <div onClick={() => setOpen((o) => !o)} className="disp" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: PALETTE.gold, letterSpacing: "0.18em", marginBottom: 6, cursor: "pointer", userSelect: "none" }}>
        <span style={{ fontSize: 10, display: "inline-block", transition: "transform 0.18s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        {title}
      </div>
      {open && children}
    </div>
  );
}
const ulStyle = { margin: 0, paddingLeft: 20 };
const liStyle = { fontSize: 15, color: PALETTE.parch, lineHeight: 1.6 };

function WorldEntry() {
  return (
    <div>
      <div className="disp" style={{ fontSize: 28, color: PALETTE.goldBright }}>{stripThe(WORLD.title)}</div>
      {WORLD.paras.map((p, i) => (
        <p key={i} style={{ fontSize: 16, lineHeight: 1.7, color: PALETTE.parch, marginTop: 14, fontStyle: "italic" }}>{p}</p>
      ))}
      {(WORLD.sections || []).map((s) => (
        <Section key={s.title} title={s.title}>
          {s.paras && s.paras.map((p, i) => (
            <p key={i} style={{ fontSize: 15.5, lineHeight: 1.65, color: PALETTE.parch, margin: "0 0 10px" }}>{p}</p>
          ))}
          {s.items && <ul style={ulStyle}>{s.items.map((it, i) => <li key={i} style={liStyle}>{it}</li>)}</ul>}
        </Section>
      ))}
    </div>
  );
}

function FactionEntry({ fkey, rep = {} }) {
  const f = FACTION_LORE[fkey];
  if (!f) return null;
  const standing = rep[fkey] || 0;
  const stamp = standing >= 3 ? { t: "KNOWN FRIENDS", c: PALETTE.ok } : standing <= -3 ? { t: "MARKED", c: PALETTE.bad } : null;
  return (
    <div>
      <div className="disp" style={{ fontSize: 27, color: f.color }}>
        {f.sym ? `${f.sym} ` : ""}{stripThe(f.name)}
        {stamp && <span className="disp" style={{ fontSize: 13, letterSpacing: "0.18em", color: stamp.c, border: `1px solid ${stamp.c}88`, borderRadius: 5, padding: "3px 8px", marginLeft: 12, verticalAlign: "middle" }}>{stamp.t}</span>}
      </div>
      <p style={{ fontSize: 16, lineHeight: 1.65, color: PALETTE.parch, marginTop: 12 }}>{f.desc}</p>
      {f.sections.map((s) => (
        <Section key={s.title} title={s.title}>
          <ul style={ulStyle}>{s.items.map((it, i) => <li key={i} style={liStyle}>{it}</li>)}</ul>
        </Section>
      ))}
    </div>
  );
}

function LocationEntry({ id }) {
  const e = LORE[id];
  const node = NODES[id];
  if (!e) return null;
  return (
    <div>
      <div className="disp" style={{ fontSize: 26, color: PALETTE.bone }}>{stripThe(node?.name)}</div>
      {node && (
        <div style={{ fontSize: 14, color: FACTIONS[node.faction].color, fontStyle: "italic", marginBottom: 14 }}>
          Held by {stripThe(FACTIONS[node.faction].label)}
        </div>
      )}
      <p style={{ fontSize: 16, lineHeight: 1.6, color: PALETTE.parch }}>{e.desc}</p>
      <Section title="MISSION TYPES">
        <ul style={ulStyle}>{e.missions.map((m) => <li key={m} style={liStyle}>{m}</li>)}</ul>
      </Section>
      <Section title="FACTIONS ENCOUNTERED">
        <ul style={ulStyle}>{e.factions.map((f) => <li key={f} style={liStyle}>{f}</li>)}</ul>
      </Section>
      <Section title="LOOT TYPES">
        <ul style={ulStyle}>{e.loot.map((l, i) => <li key={i} style={liStyle}>{l}</li>)}</ul>
      </Section>
      <Section title="LOOT RARITY">
        <ul style={ulStyle}>{e.rarity.map((r, i) => <li key={i} style={liStyle}>{r}</li>)}</ul>
      </Section>
    </div>
  );
}

function JournalEntry({ selKey, label, entry, onSave }) {
  const [text, setText] = useState(entry?.text || "");
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setText(entry?.text || ""); }, [entry?.ts]); // eslint-disable-line

  const save = () => { onSave(selKey, text); setDirty(false); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="disp" style={{ fontSize: 24, color: PALETTE.bone, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: PALETTE.parchDim, marginBottom: 10, minHeight: 18 }}>
        {entry?.by ? `Last edited by ${entry.by}` : "No notes yet. Start writing the party's record of this place."}
        {dirty ? <span style={{ color: PALETTE.gold }}> · unsaved changes</span> : null}
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDirty(true); }}
        placeholder="Write shared notes here: what happened, who you met, what to remember next time."
        style={{
          flex: 1, width: "100%", boxSizing: "border-box", resize: "none",
          background: "rgba(0,0,0,0.35)", border: `1px solid ${PALETTE.gold}44`, borderRadius: 8,
          color: PALETTE.bone, fontFamily: "inherit", fontSize: 16, lineHeight: 1.6, padding: 14, outline: "none",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={save} disabled={!dirty} className="disp" style={{
          padding: "10px 22px", border: "none", borderRadius: 6,
          background: dirty ? `linear-gradient(${PALETTE.gold}, ${PALETTE.parchDim})` : "rgba(255,255,255,0.08)",
          color: dirty ? PALETTE.ink : PALETTE.parchDim, cursor: dirty ? "pointer" : "default",
          fontSize: 14, letterSpacing: "0.1em",
        }}>SAVE NOTES</button>
      </div>
    </div>
  );
}
