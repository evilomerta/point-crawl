import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PALETTE, FACTIONS, NODES, ROUTES, FORTUNES, fLabel, initialState, safeName, routesFrom,
  VEHICLES, VEHICLE_BASE, VEHICLE_STATS, VEHICLE_STAT_UNIT, VEHICLE_IMAGES,
  upgradesFor, vehicleStats, vehicleHP, supplyPenalty, supplyStatus,
} from "./data";
import {
  subscribeGame, ensureGame, writeGame, castVote, resetGame, heartbeat, clearPresence, increment, deleteField,
} from "./firebase";
import { setMuted, playDice, playSuccess, playFailure, playChime, playThud, playDisable, DICE_MS } from "./sound";
import { SCALE, useIsMobile } from "./mobile";
import SaltSky from "./SaltSky";
import { initAmbience, setWeatherSound, setAmbienceMuted } from "./ambience";
import Gate from "./Gate";
import MapView from "./Map";
import { Bust } from "./Chronicle";
import Overlay from "./Overlay";
import MusicPlayer from "./MusicPlayer";
import Downtime from "./Downtime";
import Onboard from "./Onboard";

const SESSION_KEY = "dw_session_v1";
const MUTE_KEY = "dw_muted_v1";

// Roll modifier = reputation with the DESTINATION's controlling faction (so a
// route is judged by where it leads, e.g. arriving at Hearthbough uses Boughs
// rep), plus any boon, minus a scaling penalty when supplies run low.
function routeModifier(route, game) {
  const dest = route.from === game.current ? route.to : route.from;
  const faction = NODES[dest].faction;
  const repMod = (game.rep && game.rep[faction]) || 0;
  const boonMod = game.boon ? 2 : 0;
  const supplyMod = supplyPenalty(game.supplies);
  const value = repMod + boonMod + supplyMod;
  const parts = [];
  const partsDetailed = [];
  if (repMod) { parts.push(`${FACTIONS[faction].label} ${repMod > 0 ? "+" : ""}${repMod}`); partsDetailed.push({ label: FACTIONS[faction].label, v: repMod }); }
  if (boonMod) { parts.push(`boon +${boonMod}`); partsDetailed.push({ label: "boon", v: boonMod }); }
  if (supplyMod) { parts.push(`low supplies ${supplyMod}`); partsDetailed.push({ label: "low supplies", v: supplyMod }); }
  return { value, repMod, boonMod, supplyMod, faction, label: parts.join(", "), partsDetailed };
}

function signColor(v) { return v > 0 ? PALETTE.ok : v < 0 ? PALETTE.bad : PALETTE.parchDim; }
function fmtMod(v) { return v > 0 ? `+${v}` : `${v}`; }

function mathStr(roll, bonus, total) {
  if (!bonus) return `${roll}`;
  return `${roll} ${bonus > 0 ? "+" : "−"} ${Math.abs(bonus)} = ${total}`;
}

export default function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
  });
  const [muted, setMutedState] = useState(() => localStorage.getItem(MUTE_KEY) === "1");
  const [game, setGame] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [, saltTick] = useState(0); // repaints the calendar while the sky turns
  const [rollFace, setRollFace] = useState(null);
  const [dieState, setDieState] = useState("idle");
  const [bannerPulse, setBannerPulse] = useState(0);
  const [changedVoters, setChangedVoters] = useState({});
  const [overlay, setOverlay] = useState(null); // 'codex' | 'journal' | null
  const [showMusic, setShowMusic] = useState(false);
  const [showDowntime, setShowDowntime] = useState(false);
  const [useBoon, setUseBoon] = useState(false);
  const [boonDraft, setBoonDraft] = useState("");
  const [showUpgrades, setShowUpgrades] = useState(false);
  const isMobile = useIsMobile();

  const isDM = session?.role === "dm";
  const room = session?.room;
  const myKey = session ? safeName(session.name) : "anon";

  useEffect(() => { setMuted(muted); setAmbienceMuted(muted); }, [muted]);
  const toggleMute = () => {
    const next = !muted; setMutedState(next); localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  };

  useEffect(() => {
    if (!session) return;
    let unsub;
    (async () => {
      if (isDM) await ensureGame(room, initialState());
      unsub = subscribeGame(room, setGame);
    })();
    return () => unsub && unsub();
  }, [session]); // eslint-disable-line

  // presence heartbeat
  useEffect(() => {
    if (!session) return;
    const beat = () => heartbeat(room, myKey, session.name, session.role);
    beat();
    const id = setInterval(beat, 15000);
    const onUnload = () => clearPresence(room, myKey);
    window.addEventListener("beforeunload", onUnload);
    return () => { clearInterval(id); window.removeEventListener("beforeunload", onUnload); clearPresence(room, myKey); };
  }, [session]); // eslint-disable-line

  // rattle for everyone when a roll starts (shared spin)
  const prevRolling = useRef(false);
  useEffect(() => {
    const r = !!game?.rolling;
    if (r && !prevRolling.current) playDice();
    prevRolling.current = r;
  }, [game?.rolling]); // eslint-disable-line

  // result sound + banner settle on new roll result
  const lastTs = useRef(null);
  useEffect(() => {
    const ts = game?.lastResult?.ts;
    if (ts == null) return;
    if (lastTs.current === null) { lastTs.current = ts; return; }
    if (ts !== lastTs.current) {
      lastTs.current = ts;
      if (game.lastResult.success) playSuccess(); else playFailure();
      setBannerPulse((p) => p + 1);
    }
  }, [game?.lastResult?.ts]); // eslint-disable-line

  // ambient skies audio: wake on first input, follow the weather, obey the toggle
  useEffect(() => {
    const wake = () => initAmbience();
    window.addEventListener("pointerdown", wake);
    return () => window.removeEventListener("pointerdown", wake);
  }, []);
  useEffect(() => { setWeatherSound(game?.skies || 0); }, [game?.skies]); // eslint-disable-line
  // one-time lore correction: the Salt-Year is 312, counted from the Fall.
  // Existing tables already carry an old saltYear in the doc, so defaults
  // never apply; the DM's client rewrites it once, marked by saltV.
  useEffect(() => {
    if (!room || !isDM || !game) return;
    if ((game.saltV || 0) < 2) writeGame(room, { saltV: 2, saltYear: 312 });
  }, [room, isDM, game?.saltV]); // eslint-disable-line
  // keep the salt calendar repainting while a day-turn is playing
  useEffect(() => {
    const turn = game?.saltTurnTs || 0;
    if (!turn || Date.now() - turn > 30000) return;
    const iv = setInterval(() => saltTick((x) => x + 1), 400);
    const stop = setTimeout(() => clearInterval(iv), Math.max(0, 31000 - (Date.now() - turn)));
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [game?.saltTurnTs]);

  // vote-changed highlight
  const prevVotes = useRef({});
  useEffect(() => {
    if (!game) return;
    const cur = game.votes || {};
    const prev = prevVotes.current;
    const changed = Object.keys(cur).filter((k) => prev[k] !== cur[k]);
    if (changed.length) {
      setChangedVoters((s) => { const n = { ...s }; changed.forEach((k) => (n[k] = true)); return n; });
      changed.forEach((k) => setTimeout(() => setChangedVoters((s) => { const n = { ...s }; delete n[k]; return n; }), 2600));
    }
    prevVotes.current = cur;
  }, [game?.votes]); // eslint-disable-line

  const current = game?.current;

  // clear preview when the party moves to a new bough
  useEffect(() => { setSelectedRouteId(null); }, [current]);

  const routeByDest = useMemo(() => {
    const m = {};
    if (current) routesFrom(current).forEach(({ route, dest }) => { m[dest] = route.id; });
    return m;
  }, [current]);

  const tally = useMemo(() => {
    const t = {};
    Object.values(game?.votes || {}).forEach((rid) => { t[rid] = (t[rid] || 0) + 1; });
    return t;
  }, [game]);

  const voteLeader = useMemo(() => {
    let best = null, max = 0;
    Object.entries(tally).forEach(([rid, n]) => { if (n > max) { max = n; best = rid; } });
    return best;
  }, [tally]);

  const present = useMemo(() => {
    const now = Date.now();
    return Object.entries(game?.presence || {})
      .filter(([, p]) => p && now - p.ts < 35000)
      .map(([key, p]) => ({ key, ...p }))
      .sort((a, b) => (a.role === "dm" ? -1 : 1));
  }, [game]);

  const myVoteRouteId = game?.votes?.[myKey] || null;
  const [previewHidden, setPreviewHidden] = useState(false);
  const effectiveSelected = previewHidden ? null : (selectedRouteId || (isDM ? voteLeader : myVoteRouteId));

  const enter = (s) => { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); setSession(s); };
  const leave = () => { clearPresence(room, myKey); localStorage.removeItem(SESSION_KEY); setSession(null); setGame(null); };

  const saveJournal = (key, text) => {
    if (!room) return;
    writeGame(room, { [`journal.${key}`]: { text, by: session?.name || "anon", ts: Date.now() } });
  };
  const overlayEl = overlay
    ? <Overlay onClose={() => setOverlay(null)} journal={game?.journal || {}} onSave={saveJournal} myName={session?.name} rep={game?.rep || {}} />
    : null;
  const openCodex = () => setOverlay("codex");
  const openMusic = () => setShowMusic(true);

  const submitMusic = (videoId, url) => {
    if (!room) return;
    writeGame(room, { music: { videoId, url, playing: true, startedAt: Date.now(), offset: 0, updatedAt: Date.now() } });
  };
  const musicPlayPause = () => {
    const m = game?.music; if (!room || !m) return;
    if (m.playing) {
      const off = (Date.now() - m.startedAt) / 1000;
      writeGame(room, { music: { ...m, playing: false, offset: off, updatedAt: Date.now() } });
    } else {
      writeGame(room, { music: { ...m, playing: true, startedAt: Date.now() - (m.offset || 0) * 1000, updatedAt: Date.now() } });
    }
  };
  const musicStop = () => { if (room) writeGame(room, { music: null }); };
  const musicEl = (
    <MusicPlayer music={game?.music || null} isDM={isDM} open={showMusic}
      onClose={() => setShowMusic(false)} onSubmit={submitMusic} onPlayPause={musicPlayPause} onStop={musicStop}
      onJoinedChange={(j) => { if (room && myKey) writeGame(room, { ["bard." + myKey]: j ? { name: session?.name || "anon", ts: Date.now() } : deleteField() }); }}
      listeners={(present || []).map((p) => ({ key: p.key, name: p.name, role: p.role, on: !!(game?.bard || {})[p.key] }))} />
  );

  const openDowntime = () => setShowDowntime(true);
  const saveDowntimeProfile = (p) => { if (room) writeGame(room, { [`downtime.profiles.${myKey}`]: p }); };
  // The Chronicle (Between Tides) builds its own dot-path patches: profile
  // condition, rumors, clues, contacts, lore, standing, collective favor,
  // candles, the rumor spine, delve state, and shared logs all flow through here.
  const applyChronicle = (patch) => { if (room && patch && Object.keys(patch).length) writeGame(room, patch); };
  const downtimeEl = (
    <Downtime open={showDowntime} onClose={() => setShowDowntime(false)}
      downtime={game?.downtime} myKey={myKey} isDM={isDM} onPatch={applyChronicle} supplies={game?.supplies ?? 0} />
  );

  if (!session) return <Gate onEnter={enter} />;
  if (!game) {
    return (
      <Shell session={session} onLeave={leave} game={null} muted={muted} onToggleMute={toggleMute} onOpenCodex={openCodex} onOpenMusic={openMusic} onOpenDowntime={openDowntime} isMobile={isMobile}>
        <div style={{ ...panel, textAlign: "center", fontStyle: "italic", color: PALETTE.parchDim }}>
          {isDM ? "Opening the table…" : "Waiting for the Dungeon Master to open the table."}
        </div>
        {overlayEl}
        {musicEl}
        {downtimeEl}
      </Shell>
    );
  }

  // One-time onboarding: a logged-in player who hasn't chosen PC/agent yet.
  const profile = game.downtime?.profiles?.[myKey];
  if (!isDM && !profile) {
    return <Onboard name={session.name} onSave={saveDowntimeProfile} onLeave={leave} />;
  }
  const mySheet = profile?.kind === "member" ? profile?.charUrl : null;

  // DM actions
  const adjust = (field, delta) => writeGame(room, { [field]: Math.max(0, (game[field] || 0) + delta) });
  const adjustRep = (f, delta) => {
    const prev = game.rep[f] || 0, next = prev + delta;
    const patch = { rep: { ...game.rep, [f]: next } };
    const stones = { ...(game.repMilestones || {}) };
    let line = null;
    if (prev < 3 && next >= 3 && stones[f] !== "friend") { stones[f] = "friend"; line = { t: `The ${FACTIONS[f].label} now greet the crew by name.`, k: "ok", ts: Date.now() }; }
    if (prev > -3 && next <= -3 && stones[f] !== "marked") { stones[f] = "marked"; line = { t: `The ${FACTIONS[f].label} have marked this crew.`, k: "bad", ts: Date.now() }; }
    if (line) { patch.repMilestones = stones; patch.log = [line, ...(game.log || [])].slice(0, 14); }
    writeGame(room, patch);
  };
  const openVote = () => writeGame(room, { voteOpen: true, votes: {} });
  const closeVote = () => writeGame(room, { voteOpen: false });
  const clearBoon = () => writeGame(room, { boon: null });
  const buyUpgrade = (key, tier, cost) => {
    if (!room || !isDM) return;
    if ((game.resolve || 0) < cost) return;
    writeGame(room, { [`upgrades.${key}`]: tier, resolve: Math.max(0, (game.resolve || 0) - cost) });
  };
  const setSysHP = (veh, key, hp) => {
    if (!room || !isDM) return;
    writeGame(room, { [`combat.${veh}.${key}`]: Math.max(0, hp) });
  };
  const repairVehicle = (veh) => {
    if (!room || !isDM) return;
    const { systems } = vehicleHP(veh, game.upgrades || {});
    const f = {};
    systems.forEach((s) => { f[`combat.${veh}.${s.key}`] = s.max; });
    writeGame(room, f);
  };
  const rollVehicleCombat = (veh, stat, mod) => {
    if (!room) return;
    const d = 1 + Math.floor(Math.random() * 20);
    writeGame(room, { vroll: { veh, stat, mod, d, total: d + mod, by: session?.name || "Someone", ts: Date.now() } });
  };
  const doReset = () => { if (confirm("Reset the whole table to the start?")) resetGame(room, initialState()); };

  const pickDest = (destId, routeId) => {
    // Tapping the bough already on display folds the route plan away again.
    if (routeId === effectiveSelected) { setPreviewHidden(true); setSelectedRouteId(null); return; }
    setPreviewHidden(false);
    setSelectedRouteId(routeId); // preview for everyone; players vote via the panel button
  };

  // the salt calendar and the skies (DM)
  const advanceDay = () => {
    if (!room) return;
    const turn = game?.saltTurnTs || 0;
    if (turn && Date.now() - turn < 30000) { writeGame(room, { saltTurnTs: Date.now() - 30000 }); return; } // second press skips to morning
    let d = (game?.saltDay ?? 1) + 1, y = game?.saltYear ?? 312;
    if (d > 360) { d = 1; y += 1; }
    writeGame(room, { saltDay: d, saltYear: y, saltTurnTs: Date.now() });
  };
  const retreatDay = () => {
    if (!room) return;
    let d = (game?.saltDay ?? 1) - 1, y = game?.saltYear ?? 312;
    if (d < 1) { d = 360; y = Math.max(1, y - 1); }
    writeGame(room, { saltDay: d, saltYear: y, saltTurnTs: 0 });
  };
  const setSkies = (n) => { if (room && isDM) writeGame(room, { skies: n }); };

  const rollSelected = async () => {
    const routeId = effectiveSelected;
    if (!routeId || rolling) return;
    const route = ROUTES.find((r) => r.id === routeId);
    if (!route) return;
    setRolling(true); setDieState("rolling");
    await writeGame(room, { rolling: true }); // everyone's banner die starts spinning for the full sound
    const TICK = 80;
    const maxTicks = Math.round(DICE_MS / TICK);
    let ticks = 0;
    const iv = setInterval(() => {
      setRollFace(1 + Math.floor(Math.random() * 20));
      if (++ticks >= maxTicks) {
        clearInterval(iv);
        finishRoll(route);
        setRolling(false);
        setDieState("settle");
        setTimeout(() => setDieState("idle"), 600);
      }
    }, TICK);
  };

  const finishRoll = (route) => {
    const roll = 1 + Math.floor(Math.random() * 20);
    const mod = routeModifier(route, game);
    const boonOn = useBoon && (game.downtime?.boons || 0) > 0;
    const bonus = mod.value + (boonOn ? 2 : 0);
    const total = roll + bonus;
    const skiesNow = game.skies || 0;
    const dcW = route.dc + skiesNow;
    const success = total >= dcW;
    setRollFace(roll);

    const dest = route.from === game.current ? route.to : route.from;
    const repTable = success ? route.rep : (route.repFail || route.rep);
    const newRep = { ...game.rep };
    Object.entries(repTable || {}).forEach(([f, v]) => { newRep[f] = (newRep[f] || 0) + v; });

    let resolve = game.resolve, supplies = game.supplies, boon = game.boon;
    if (success) {
      if (route.supplyGain) supplies += route.supplyGain;
      if (route.resolveGain) resolve += route.resolveGain;
      if (route.boon) boon = route.boon;
    } else {
      if (route.resolveWipe) resolve = 0;
      else if (route.resolveFail) resolve = Math.max(0, resolve - route.resolveFail);
      if (route.supplyFail) supplies = Math.max(0, supplies - route.supplyFail);
    }
    if (game.boon && !route.boon) boon = null;

    // Arrival fortune: the destination deals one card from its deck.
    const deck = FORTUNES[dest]?.[success ? "pos" : "neg"] || [];
    const fortune = deck.length ? deck[Math.floor(Math.random() * deck.length)] : null;
    const ffx = fortune?.fx || {};
    if (ffx.supplies) supplies = Math.max(0, supplies + ffx.supplies);
    if (ffx.resolve) resolve = Math.max(0, resolve + ffx.resolve);
    if (ffx.rep) newRep[NODES[dest].faction] = (newRep[NODES[dest].faction] || 0) + ffx.rep;
    const fxBits = [];
    if (ffx.supplies) fxBits.push(`${ffx.supplies > 0 ? "+" : ""}${ffx.supplies} Supplies`);
    if (ffx.resolve) fxBits.push(`${ffx.resolve > 0 ? "+" : ""}${ffx.resolve} Resolve`);
    if (ffx.rep) fxBits.push(`${ffx.rep > 0 ? "+" : ""}${ffx.rep} ${FACTIONS[NODES[dest].faction].label} rep`);

    // Standing milestones: crossing +-3 with a faction is announced once.
    const milestones = [];
    const stones = { ...(game.repMilestones || {}) };
    Object.keys(newRep).forEach((f) => {
      if (!FACTIONS[f]) return;
      const prev = game.rep?.[f] || 0, next = newRep[f] || 0;
      if (prev < 3 && next >= 3 && stones[f] !== "friend") { stones[f] = "friend"; milestones.push({ f, kind: "friend" }); }
      if (prev > -3 && next <= -3 && stones[f] !== "marked") { stones[f] = "marked"; milestones.push({ f, kind: "marked" }); }
    });

    // Boon tides: arriving where the tide pools its gift pays the crew once.
    const boonWon = success && (game.boonNodes || []).includes(dest);

    const text = success ? route.benefit : route.risk;
    const baseLabel = (mod.label ? mod.label : "") + (boonOn ? (mod.label ? ", " : "") + "Agent's Boon +2" : "");
    const wxLabel = skiesNow === 2 ? "Tempest +2 DC" : skiesNow === 1 ? "Rain +1 DC" : "";
    const modLabel = baseLabel + (wxLabel ? (baseLabel ? ", " : "") + wxLabel : "");
    const entry = {
      t: `${session.name}: ${mathStr(roll, bonus, total)} vs DC ${dcW} · ${success ? "SUCCESS" : "FAILURE"}. ${text}`,
      k: success ? "ok" : "bad", ts: Date.now(),
    };
    const log = [entry, ...(game.log || [])].slice(0, 14);

    const patch = {
      current: dest, resolve, supplies, rep: newRep, boon,
      voteOpen: false, votes: {}, rolling: false, log,
      lastResult: { roll, bonus, total, dc: dcW, success, destName: NODES[dest].name, text, modLabel, ts: Date.now(),
        fortune: fortune ? { t: fortune.t, fx: fxBits.join(" \u00b7 ") } : null,
        milestones, boonWon },
      repMilestones: stones,
    };
    if (boonWon) {
      patch.boonNodes = (game.boonNodes || []).filter((n) => n !== dest);
      patch.log = [{ t: `The tide pools its gift at ${NODES[dest].name}: +1 Boon for the crew.`, k: "ok", ts: Date.now() + 2 }, ...patch.log].slice(0, 14);
    }
    milestones.forEach((m) => {
      const line = m.kind === "friend"
        ? `The ${FACTIONS[m.f].label} now greet the crew by name.`
        : `The ${FACTIONS[m.f].label} have marked this crew.`;
      patch.log = [{ t: line, k: m.kind === "friend" ? "ok" : "bad", ts: Date.now() + 1 }, ...patch.log].slice(0, 14);
    });
    const boonDelta = (boonWon ? 1 : 0) + (boonOn ? -1 : 0);
    if (boonDelta) patch["downtime.boons"] = increment(boonDelta);
    writeGame(room, patch);
    setUseBoon(false);
    setSelectedRouteId(null);
  };

  const selRoute = effectiveSelected ? ROUTES.find((r) => r.id === effectiveSelected) : null;
  const selMod = selRoute ? routeModifier(selRoute, game) : null;
  const lr = game.lastResult;
  const spinning = !!game.rolling;

  return (
    <Shell session={session} onLeave={leave} game={game} muted={muted} onToggleMute={toggleMute} onOpenCodex={openCodex} onOpenMusic={openMusic} onOpenDowntime={openDowntime} onOpenVehicles={() => setShowUpgrades(true)} onOpenSheet={mySheet ? () => window.open(mySheet, "_blank", "noopener") : null} isMobile={isMobile}>
      <SaltSky skies={game.skies || 0} turnTs={game.saltTurnTs || 0} scale={SCALE} paused={!!overlay || showMusic || showDowntime || showUpgrades} />
      {/* info strip above the map */}
      <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ ...panel, flex: isMobile ? "1 1 100%" : 2, minWidth: isMobile ? 0 : 240 }}>
          <div className="disp" style={panelTitle}>AT THE TABLE · {present.length}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {present.map((p) => (
              <span key={p.key} style={{
                fontSize: 14, padding: "3px 10px", borderRadius: 20,
                border: `1px solid ${p.role === "dm" ? PALETTE.gold : PALETTE.gold + "44"}`,
                color: p.role === "dm" ? PALETTE.goldBright : PALETTE.parch,
                background: changedVoters[p.key] ? `${PALETTE.gold}33` : "transparent", transition: "background 0.4s",
              }}>
                {p.role === "dm" ? "★ " : ""}{p.name}
              </span>
            ))}
            {present.length === 0 && <span style={{ fontSize: 14, color: PALETTE.parchDim, fontStyle: "italic" }}>No one here yet.</span>}
          </div>
        </div>

        <div style={{ ...panel, flex: isMobile ? "1 1 100%" : 1.9, minWidth: isMobile ? 0 : 340, display: "flex", gap: 14 }}>
          <div style={{ flex: 0.85, minWidth: 0 }}>
            <div className="disp" style={panelTitle}>ACTIVE BOON</div>
            <div style={{ fontSize: 15, color: game.boon ? PALETTE.goldBright : PALETTE.parchDim, fontStyle: game.boon ? "normal" : "italic" }}>
              {game.boon || "None."}
            </div>
            {isDM && game.boon && <button onClick={clearBoon} style={{ ...miniBtn, width: "auto", padding: "2px 8px", marginTop: 6 }}>clear</button>}
          </div>
          <div style={{ flex: 1.25, borderLeft: `1px solid ${PALETTE.gold}26`, paddingLeft: 14, minWidth: 0 }}>
            <div className="disp" style={panelTitle}>SALT CALENDAR</div>
            {(() => {
              const turn = game.saltTurnTs || 0;
              const age = Date.now() - turn;
              const inTurn = turn > 0 && age >= 0 && age < 30000;
              const ph = inTurn ? age / 30000 : 1;
              let d = game.saltDay ?? 1, y = game.saltYear ?? 312;
              if (inTurn && ph < 0.52) { d -= 1; if (d < 1) { d = 360; y = Math.max(1, y - 1); } }
              const word = !inTurn ? "MORNING LIGHT"
                : ph >= 0.96 ? "FIRST LIGHT" : ph >= 0.82 ? "THE GREY HOUR" : ph >= 0.7 ? "DEEP NIGHT"
                : ph >= 0.52 ? "NIGHTFALL" : ph >= 0.42 ? "DUSK" : ph >= 0.34 ? "LONG SHADOWS"
                : ph >= 0.2 ? "HIGH SUN" : ph >= 0.1 ? "MORNING LIGHT" : "FIRST LIGHT";
              const orb = inTurn && ph > 0.5 && ph < 0.84 ? "☾" : "☀";
              const sk = game.skies || 0;
              return (
                <>
                  <div style={{ fontSize: 15, color: PALETTE.parch, whiteSpace: "nowrap" }}>
                    {orb} Salt Year <b style={{ color: PALETTE.goldBright }}>{y}</b> · Day <b style={{ color: PALETTE.goldBright }}>{d}</b>
                    {isDM && (
                      <span style={{ marginLeft: 8 }}>
                        <button onClick={retreatDay} title="back one day" style={{ ...miniBtn, width: 20, height: 20, fontSize: 12 }}>−</button>
                        <button onClick={advanceDay} title={inTurn ? "skip to morning" : "turn the sky a full day"} style={{ ...miniBtn, width: 20, height: 20, fontSize: 12, marginLeft: 4 }}>+</button>
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                    <span className="disp" style={{ fontSize: 9, color: PALETTE.gold, minWidth: 86, letterSpacing: "0.16em" }}>{word}</span>
                    <span style={{ flex: 1, height: 4, borderRadius: 2, background: `${PALETTE.gold}22`, overflow: "hidden" }}>
                      <i style={{ display: "block", height: "100%", width: `${inTurn ? (ph * 100).toFixed(1) : 0}%`, background: `linear-gradient(90deg, ${PALETTE.goldBright}, #c9742f, #2b3a66, ${PALETTE.goldBright})` }} />
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 7 }}>
                    {["CLEAR", "RAIN", "TEMPEST"].map((w, i) => (
                      <button key={w} onClick={() => setSkies(i)}
                        style={{ ...tableBtn, fontSize: 10, padding: "2px 7px",
                          cursor: isDM ? "pointer" : "default",
                          color: sk === i ? PALETTE.goldBright : PALETTE.parchDim,
                          background: sk === i ? `${PALETTE.gold}29` : "transparent",
                          border: `1px solid ${PALETTE.gold}${sk === i ? "99" : "44"}` }}>
                        {w}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div style={{ ...panel, flex: "0.2 0 auto" }}>
          <div className="disp" style={panelTitle}>YOUR FACTION</div>
          {profile ? (
            <>
              <div className="disp" style={{ fontSize: 18, color: FACTIONS[profile.faction].color }}>{FACTIONS[profile.faction].sym} {FACTIONS[profile.faction].label}</div>
              <div style={{ fontSize: 13, color: PALETTE.parchDim, marginTop: 2, whiteSpace: "nowrap" }}>
                {profile.kind === "agent" ? "Faction agent" : "Party character"} · {profile.name}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 15, color: PALETTE.parchDim, fontStyle: "italic" }}>{isDM ? "Dungeon Master" : "Unsworn"}</div>
          )}
        </div>
        {profile && (
          /* width/height = frame's painted box (74 + 3px borders, 74 * 1.2 + 6),
             sized to match the header boxes' ~95px height; the candle row
             hangs below, into the row gap */
          <div style={{ alignSelf: "center", flexShrink: 0, width: 80, height: 95 }}>
            <Bust pkey={myKey} p={profile} size={74} />
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 360px", gap: 16 }}>
        <div>
          <MapView
            current={current} routeByDest={routeByDest} tally={tally}
            selectedRouteId={effectiveSelected} myVoteRouteId={myVoteRouteId}
            onPickDest={pickDest} rep={game.rep}
            boonNodes={game.boonNodes || []}
            cluePins={(game.downtime?.clues || []).reduce((m, c) => { if (!c.used && c.loc) m[c.loc] = (m[c.loc] || 0) + 1; return m; }, {})}
          />

          {/* RESULT BANNER (everyone) */}
          {(lr || spinning) && (
            <div style={{
              marginTop: 12, display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
              borderRadius: 8,
              border: `1px solid ${spinning ? PALETTE.gold : lr.success ? PALETTE.ok : PALETTE.bad}88`,
              background: spinning
                ? "rgba(8,16,18,0.9)"
                : `linear-gradient(90deg, rgba(8,16,18,0.9), ${lr.success ? "rgba(40,70,30,0.4)" : "rgba(70,30,25,0.4)"})`,
            }}>
              <Die
                value={spinning ? "?" : lr.roll}
                state={spinning ? "rolling" : "settle"}
                animKey={spinning ? "spin" : bannerPulse}
              />
              {spinning ? (
                <div className="disp" style={{ fontSize: 20, color: PALETTE.goldBright, letterSpacing: "0.1em" }}>
                  The party casts the die…
                </div>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <div className="disp" style={{ fontSize: 23, color: lr.success ? PALETTE.ok : PALETTE.bad, letterSpacing: "0.1em" }}>
                      {lr.success ? "SUCCESS" : "FAILURE"}
                    </div>
                    <div style={{ fontSize: 15, color: PALETTE.parch }}>{lr.text}</div>
                    {lr.boonWon && (
                      <div style={{ marginTop: 6, fontSize: 14, color: PALETTE.goldBright }}>
                        ✦ The tide pools its gift here: <b>+1 Boon</b> banked for the crew.
                      </div>
                    )}
                    {lr.fortune && (
                      <div style={{ fontSize: 14, color: lr.success ? PALETTE.goldBright : PALETTE.parchDim, fontStyle: "italic", marginTop: 4 }}>
                        {lr.fortune.t}{lr.fortune.fx ? <span className="disp" style={{ display: "inline-block", whiteSpace: "nowrap", fontStyle: "normal", fontSize: 12.5, marginLeft: 8, color: lr.success ? PALETTE.ok : PALETTE.bad }}>{lr.fortune.fx}</span> : null}
                      </div>
                    )}
                    {(lr.milestones || []).map((m) => (
                      <div key={m.f} className="disp" style={{ fontSize: 13.5, letterSpacing: "0.08em", marginTop: 4, color: m.kind === "friend" ? PALETTE.ok : PALETTE.bad }}>
                        {FACTIONS[m.f].sym} {m.kind === "friend" ? `THE ${FACTIONS[m.f].label.toUpperCase()} NOW GREET YOU BY NAME` : `THE ${FACTIONS[m.f].label.toUpperCase()} HAVE MARKED YOU`}
                      </div>
                    ))}
                  </div>
                  <div className="disp" style={{ textAlign: "right", fontSize: 18, color: PALETTE.goldBright, whiteSpace: "nowrap" }}>
                    {mathStr(lr.roll, lr.bonus, lr.total)}
                    <div style={{ fontSize: 12, color: PALETTE.parchDim }}>
                      vs DC {lr.dc}{lr.modLabel ? ` · ${lr.modLabel}` : ""}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* KEEPER'S TIDES: boon sites + a hand-written blessing, kept beside the result */}
          {isDM && (
            <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", alignItems: "stretch" }}>
              <div style={{ ...panel, flex: "1 1 280px", marginTop: 0 }}>
                <div className="disp" style={panelTitle}>BOON TIDES</div>
                <div style={{ fontSize: 12.5, color: PALETTE.parchDim, marginBottom: 6 }}>
                  Mark up to two places where a boon can be earned this session. Players see the storm-grey swirl.
                </div>
                {[0, 1].map((slot) => {
                  const cur = (game.boonNodes || [])[slot] || "";
                  return (
                    <select key={slot} value={cur}
                      onChange={(e) => {
                        const next = [...(game.boonNodes || [])];
                        next[slot] = e.target.value || null;
                        writeGame(room, { boonNodes: next.filter(Boolean).slice(0, 2) });
                      }}
                      style={{ width: "100%", marginBottom: 6, padding: "6px 8px", borderRadius: 6,
                        background: "rgba(8,14,16,0.85)", color: PALETTE.bone,
                        border: `1px solid ${PALETTE.gold}44`, fontFamily: "inherit", fontSize: 13.5 }}>
                      <option value="">No tide in slot {slot + 1}</option>
                      {Object.entries(NODES).map(([id, n]) => (
                        <option key={id} value={id}>{n.name}</option>
                      ))}
                    </select>
                  );
                })}
              </div>
              <div style={{ ...panel, flex: "1 1 280px", marginTop: 0 }}>
                <div className="disp" style={panelTitle}>WRITE A BOON</div>
                <div style={{ fontSize: 12.5, color: PALETTE.parchDim, marginBottom: 6 }}>
                  Name a blessing by hand. It shows in the Active Boon bar and grants +2, spent on the next crossing.
                </div>
                <input value={boonDraft} onChange={(e) => setBoonDraft(e.target.value)}
                  placeholder="e.g. The Bough-Mother's favor"
                  style={{ width: "100%", boxSizing: "border-box", marginBottom: 6, padding: "6px 8px", borderRadius: 6,
                    background: "rgba(8,14,16,0.85)", color: PALETTE.bone,
                    border: `1px solid ${PALETTE.gold}44`, fontFamily: "inherit", fontSize: 13.5 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { const t = boonDraft.trim(); if (t) { writeGame(room, { boon: t }); setBoonDraft(""); } }}
                    className="disp" style={{ ...miniBtn, width: "auto", padding: "4px 14px" }}>SET ACTIVE</button>
                  {game.boon && (
                    <button onClick={() => writeGame(room, { boon: null })}
                      className="disp" style={{ ...miniBtn, width: "auto", padding: "4px 14px", color: PALETTE.bad }}>CLEAR</button>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* the log rides right under the result, so the right column's height never shoves it around */}
          <div style={{ ...panel, marginTop: 12, maxHeight: 132, overflowY: "auto", padding: "10px 14px 11px" }}>
            <div className="disp" style={{ ...panelTitle, marginBottom: 4 }}>SHIP'S LOG</div>
            {(game.log || []).map((l, i) => (
              <div key={i} style={{
                fontSize: 13, padding: "2px 0", lineHeight: 1.4,
                color: l.k === "ok" ? PALETTE.ok : l.k === "bad" ? PALETTE.bad : l.k === "sys" ? PALETTE.goldBright : PALETTE.parch,
              }}>{l.t}</div>
            ))}
          </div>
        </div>

        {/* SIDE COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* voting */}
          <div style={panel}>
            <div className="disp" style={panelTitle}>VOTE</div>
            {!game.voteOpen && (
              <div style={{ fontSize: 14, color: PALETTE.parchDim, fontStyle: "italic" }}>
                {isDM ? "Voting closed. Open it to let the party choose." : "Voting is closed."}
              </div>
            )}
            {game.voteOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 14, color: PALETTE.ok }}>
                  {isDM ? "Party is voting…" : "Tap a bough to preview it, then vote in Plan Your Route."}
                </div>
                {routesFrom(current).map(({ route, dest }) => (
                  <div key={route.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                    <span style={{ color: route.id === myVoteRouteId ? PALETTE.bone : PALETTE.parch }}>{NODES[dest].name}</span>
                    <span className="disp" style={{ color: route.id === voteLeader ? PALETTE.goldBright : PALETTE.parchDim }}>{tally[route.id] || 0}</span>
                  </div>
                ))}
                <div style={{ marginTop: 6, borderTop: `1px solid ${PALETTE.gold}22`, paddingTop: 6 }}>
                  {Object.entries(game.votes || {}).map(([k, rid]) => {
                    const r = ROUTES.find((x) => x.id === rid);
                    const dest = r ? (r.from === current ? r.to : r.from) : null;
                    const nm = game.presence?.[k]?.name || k;
                    return (
                      <div key={k} style={{
                        display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 4px", borderRadius: 4,
                        background: changedVoters[k] ? `${PALETTE.gold}33` : "transparent", transition: "background 0.4s",
                        color: PALETTE.parchDim,
                      }}>
                        <span>{nm}</span><span>{dest ? NODES[dest].name : "?"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {isDM && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {!game.voteOpen
                  ? <button onClick={openVote} style={btnGoldSm}>OPEN VOTING</button>
                  : <button onClick={closeVote} style={btnGhostSm}>CLOSE</button>}
              </div>
            )}
          </div>

          {/* route preview (everyone) — DM resolves, players vote */}
          <div style={panel}>
            <div className="disp" style={panelTitle}>{isDM ? "RESOLVE A ROUTE" : "PLAN YOUR ROUTE"}</div>
            {!selRoute && (
              <div style={{ fontSize: 14, color: PALETTE.parchDim, fontStyle: "italic" }}>
                {isDM ? "Click a bough, or let the vote pick the leader." : "Tap a glowing bough on the map to preview where it leads."}
              </div>
            )}
            {selRoute && (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <RouteDetail route={selRoute} current={current} mod={selMod} skies={game.skies || 0} />
                {isDM ? (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: (game.downtime?.boons || 0) > 0 ? PALETTE.goldBright : PALETTE.parchDim, cursor: (game.downtime?.boons || 0) > 0 ? "pointer" : "default", marginTop: 2 }}>
                      <input type="checkbox" checked={useBoon} disabled={(game.downtime?.boons || 0) <= 0} onChange={(e) => setUseBoon(e.target.checked)} />
                      Use an Agent's Boon (+2) · {game.downtime?.boons || 0} banked{(game.downtime?.boons || 0) <= 0 ? " · earned by slaying delve bosses" : ""}
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                      <Die value={rollFace} animKey={dieState === "rolling" ? "spinL" : bannerPulse} state={dieState} />
                      <button onClick={rollSelected} disabled={rolling} className="disp"
                        style={{ ...btnGold, flex: 1, opacity: rolling ? 0.6 : 1 }}>
                        {rolling ? "ROLLING…" : `ROLL d20${(selMod.value + (useBoon && (game.downtime?.boons || 0) > 0 ? 2 : 0)) ? ((selMod.value + (useBoon && (game.downtime?.boons || 0) > 0 ? 2 : 0)) > 0 ? ` +${selMod.value + (useBoon && (game.downtime?.boons || 0) > 0 ? 2 : 0)}` : ` ${selMod.value}`) : ""}`}
                      </button>
                    </div>
                  </>
                ) : game.voteOpen ? (
                  selRoute.id === myVoteRouteId ? (
                    <div className="disp" style={{ marginTop: 4, textAlign: "center", color: PALETTE.ok, fontSize: 14 }}>
                      ✓ YOUR VOTE · tap another bough to change
                    </div>
                  ) : (
                    <button onClick={() => castVote(room, myKey, selRoute.id)} className="disp" style={{ ...btnGold, marginTop: 4 }}>
                      VOTE FOR THIS ROUTE
                    </button>
                  )
                ) : (
                  <div style={{ marginTop: 4, fontSize: 13, color: PALETTE.parchDim, fontStyle: "italic" }}>
                    Voting is closed. This is a preview.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* stores */}
          <div style={panel}>
            <div className="disp" style={panelTitle}>STORES</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: PALETTE.parch }}>
                Resolve
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isDM && <button onClick={() => adjust("resolve", -1)} style={miniBtn}>−</button>}
                <span className="disp" style={{ fontSize: 21, color: PALETTE.goldBright, minWidth: 28, textAlign: "center" }}>{game.resolve}</span>
                {isDM && <button onClick={() => adjust("resolve", 1)} style={miniBtn}>+</button>}
              </span>
            </div>
            <StatLine label="Supplies" value={game.supplies} isDM={isDM} onAdj={(d) => adjust("supplies", d)} />
            <SupplyScale supplies={game.supplies} />
          </div>

          {/* reputation */}
          <div style={panel}>
            <div className="disp" style={panelTitle}>REPUTATION</div>
            {Object.entries(FACTIONS).map(([k, f]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, padding: "2px 0" }}>
                <span style={{ color: f.color }}>{f.sym} {f.label}{(game.rep[k] || 0) >= 3 ? " \u00b7 known friends" : (game.rep[k] || 0) <= -3 ? " \u00b7 marked" : ""}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isDM && <button onClick={() => adjustRep(k, -1)} style={miniBtn}>−</button>}
                  <span className="disp" style={{ minWidth: 26, textAlign: "center", color: game.rep[k] > 0 ? PALETTE.ok : game.rep[k] < 0 ? PALETTE.bad : PALETTE.parchDim }}>
                    {game.rep[k] > 0 ? `+${game.rep[k]}` : game.rep[k]}
                  </span>
                  {isDM && <button onClick={() => adjustRep(k, 1)} style={miniBtn}>+</button>}
                </span>
              </div>
            ))}
          </div>

          {isDM && <button onClick={doReset} style={btnGhostSm}>RESET TABLE</button>}
        </div>
      </div>

      {overlayEl}
      {musicEl}
      {downtimeEl}
      {showUpgrades && <VehicleUpgrades onClose={() => setShowUpgrades(false)} resolve={game.resolve} owned={game.upgrades || {}} combat={game.combat || {}} isDM={isDM} onBuy={buyUpgrade} onSetHP={setSysHP} onRepair={repairVehicle} onRoll={rollVehicleCombat} />}
      <VehicleRoll vroll={game.vroll} />
    </Shell>
  );
}

function VehicleRoll({ vroll }) {
  const [phase, setPhase] = useState("idle");
  const [face, setFace] = useState(null);
  const seen = useRef(vroll?.ts || 0);
  useEffect(() => {
    const ts = vroll?.ts;
    if (!ts || ts === seen.current) return;
    seen.current = ts;
    if (Date.now() - ts > 15000) return; // ignore stale rolls (e.g. on reload)
    setPhase("rolling");
    setFace(1 + Math.floor(Math.random() * 20));
    playDice();
    const iv = setInterval(() => setFace(1 + Math.floor(Math.random() * 20)), 80);
    const t1 = setTimeout(() => {
      clearInterval(iv); setFace(vroll.d); setPhase("result");
      if (vroll.veh === "Ship") { if (vroll.d === 20) playChime(); else if (vroll.d === 1) playThud(); }
    }, DICE_MS);
    const t2 = setTimeout(() => setPhase("idle"), DICE_MS + 6000);
    return () => { clearInterval(iv); clearTimeout(t1); clearTimeout(t2); };
  }, [vroll?.ts]); // eslint-disable-line
  if (phase === "idle" || !vroll) return null;
  const rolling = phase === "rolling";
  // crit flair: ship combat only
  const isShip = vroll.veh === "Ship";
  const crit = !rolling && isShip && vroll.d === 20;
  const fumble = !rolling && isShip && vroll.d === 1;
  return createPortal(
    <div style={{ position: "fixed", top: "12%", left: 0, right: 0, zIndex: 80, display: "flex", justifyContent: "center", pointerEvents: "none", fontFamily: "'EB Garamond', Georgia, serif" }}>
      <div className={crit ? "crit-flash" : fumble ? "fumble-dim" : ""} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 24px", borderRadius: 14, background: "rgba(6,12,14,0.94)", border: `2px solid ${crit ? PALETTE.goldBright : fumble ? PALETTE.bad : PALETTE.gold + "66"}`, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <div className={`die ${rolling ? "rolling" : "settle"}`} style={{
          width: 56, height: 56, flexShrink: 0,
          clipPath: "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)",
          background: `linear-gradient(145deg, ${PALETTE.gold}, ${PALETTE.parchDim})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: PALETTE.ink, fontFamily: "'Cinzel', serif", fontSize: 24, fontWeight: 700,
        }}>{face ?? "?"}</div>
        <div>
          <div className="disp" style={{ fontSize: 13, color: PALETTE.parchDim, letterSpacing: "0.1em" }}>
            {vroll.by} · {vroll.veh} · {vroll.stat}
          </div>
          {rolling ? (
            <div className="disp" style={{ fontSize: 18, color: PALETTE.goldBright }}>rolling…</div>
          ) : (
            <div className="disp" style={{ fontSize: 22, color: PALETTE.goldBright }}>
              {crit && <span style={{ color: PALETTE.goldBright, marginRight: 8 }}>★ CRIT</span>}
              {fumble && <span style={{ color: PALETTE.bad, marginRight: 8 }}>FUMBLE</span>}
              d20 {vroll.d} {fmtMod(vroll.mod)} = <b>{vroll.total}</b>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Die({ value, state, animKey }) {
  return (
    <div
      key={animKey}
      className={`die ${state === "rolling" ? "rolling" : state === "settle" ? "settle" : ""}`}
      style={{
        width: 46, height: 46, flexShrink: 0,
        clipPath: "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)",
        background: `linear-gradient(145deg, ${PALETTE.gold}, ${PALETTE.parchDim})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: PALETTE.ink, fontFamily: "'Cinzel', serif", fontSize: 19, fontWeight: 700,
        boxShadow: "0 3px 8px rgba(0,0,0,0.6)",
      }}
    >
      {value ?? "?"}
    </div>
  );
}

function Shell({ session, onLeave, game, children, muted, onToggleMute, onOpenCodex, onOpenMusic, onOpenDowntime, onOpenVehicles, onOpenSheet, isMobile }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div style={{
      minHeight: "100vh", zoom: SCALE, color: PALETTE.parch,
      background: `radial-gradient(circle at 30% 15%, ${PALETTE.sea}, ${PALETTE.ink} 70%)`,
      fontFamily: "'EB Garamond', Georgia, serif",
    }}>
      <style>{`
        .disp { font-family: 'Cinzel', serif; letter-spacing: 0.08em; }
        .pulse { animation: pulse 2.2s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:.45} 50%{opacity:1} }
        @keyframes swirlDash { to { stroke-dashoffset: -144; } }
        .swirl { animation: swirlDash 5.5s linear infinite; }
        .swirl-rev { animation: swirlDash 8s linear infinite reverse; }
        @keyframes hauntPulse { 0%,100% { box-shadow: 0 0 0 rgba(176,58,46,0); } 50% { box-shadow: 0 0 16px rgba(176,58,46,0.75); } }
        .die.rolling { animation: dieSpin 0.42s linear infinite; }
        @keyframes dieSpin { 0%{transform:rotate(0) translateY(0)} 50%{transform:rotate(180deg) translateY(-8px)} 100%{transform:rotate(360deg) translateY(0)} }
        .die.settle { animation: dieSettle 0.55s cubic-bezier(.3,1.5,.5,1); }
        @keyframes dieSettle { 0%{transform:scale(1.3) translateY(-14px)} 60%{transform:scale(.92) translateY(2px)} 100%{transform:scale(1) translateY(0)} }
        .hull-hit { animation: hullShake 0.5s ease; }
        @keyframes hullShake { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-7px)} 30%{transform:translateX(6px)} 45%{transform:translateX(-5px)} 60%{transform:translateX(4px)} 75%{transform:translateX(-2px)} }
        @keyframes critFlash { 0%{box-shadow:0 20px 60px rgba(0,0,0,.6), 0 0 0 rgba(212,175,55,0)} 40%{box-shadow:0 20px 60px rgba(0,0,0,.6), 0 0 42px 10px rgba(212,175,55,.85)} 100%{box-shadow:0 20px 60px rgba(0,0,0,.6), 0 0 0 rgba(212,175,55,0)} }
        .crit-flash { animation: critFlash 1.1s ease; }
        @keyframes fumbleDim { 0%,100%{filter:none} 50%{filter:grayscale(.6) brightness(.7)} }
        .fumble-dim { animation: fumbleDim 1.1s ease; }
        .disabled-pulse { animation: pulse 1.6s ease-in-out infinite; }
        @keyframes hitFlash { 0%{opacity:0} 18%{opacity:.5} 100%{opacity:0} }
        .hit-flash { animation: hitFlash 0.5s ease; }
        button { font-family: inherit; }
      `}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `1px solid ${PALETTE.gold}55`, paddingBottom: 10, marginBottom: 14 }}>
          <div>
            <div className="disp" style={{ fontSize: 30, color: PALETTE.goldBright }}>THE DROWNED WORLD</div>
          </div>
          {isMobile ? (
            <div style={{ position: "relative" }}>
              <button onClick={() => setMenuOpen((o) => !o)} aria-label="menu" className="disp"
                style={{ ...btnGhostSm, fontSize: 20, padding: "6px 13px", lineHeight: 1 }}>☰</button>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 65 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 70, display: "flex", flexDirection: "column", gap: 8, minWidth: 210, padding: 12, borderRadius: 8, background: "rgba(8,16,18,0.98)", border: `1px solid ${PALETTE.gold}55`, boxShadow: "0 14px 44px rgba(0,0,0,0.6)" }}>
                    {onOpenVehicles && <button onClick={() => { setMenuOpen(false); onOpenVehicles(); }} className="disp" style={menuItem}>VEHICLE OVERVIEW</button>}
                    {onOpenDowntime && <button onClick={() => { setMenuOpen(false); onOpenDowntime(); }} className="disp" style={menuItem}>DOWNTIME</button>}
                    {onOpenCodex && <button onClick={() => { setMenuOpen(false); onOpenCodex(); }} className="disp" style={menuItem}>CODEX</button>}
                    {onOpenSheet && <button onClick={() => { setMenuOpen(false); onOpenSheet(); }} className="disp" style={menuItem}>MY SHEET</button>}
                    {onOpenMusic && <button onClick={() => { setMenuOpen(false); onOpenMusic(); }} className="disp" style={menuItem}>MUSIC</button>}
                    <button onClick={() => { setMenuOpen(false); onToggleMute(); }} className="disp"
                      style={{ ...menuItem, color: muted ? PALETTE.parchDim : PALETTE.goldBright, background: muted ? "transparent" : `${PALETTE.gold}1f`, border: `1px solid ${PALETTE.gold}${muted ? "33" : "88"}` }}>
                      ♪ SOUND {muted ? "OFF" : "ON"}
                    </button>
                    <button onClick={() => { setMenuOpen(false); onLeave(); }} className="disp" style={menuItem}>LEAVE</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
              <button onClick={onOpenVehicles} className="disp" style={btnGhostSm}>VEHICLE OVERVIEW</button>
              <button onClick={onOpenDowntime} className="disp" style={btnGhostSm}>DOWNTIME</button>
              <button onClick={onOpenCodex} className="disp" style={btnGhostSm}>CODEX</button>
              {onOpenSheet && <button onClick={onOpenSheet} className="disp" style={btnGhostSm}>MY SHEET</button>}
              <button onClick={onOpenMusic} className="disp" style={btnGhostSm}>MUSIC</button>
              <button onClick={onToggleMute} title="ambient and roll sound"
                style={{ ...btnGhostSm, fontSize: 14, padding: "8px 12px",
                  color: muted ? PALETTE.parchDim : PALETTE.goldBright,
                  background: muted ? "transparent" : `${PALETTE.gold}29`,
                  border: `1px solid ${PALETTE.gold}${muted ? "44" : "99"}` }}>♪</button>
              <button onClick={onLeave} className="disp" style={btnGhostSm}>LEAVE</button>
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

const panel = { background: "rgba(8,16,18,0.72)", border: `1px solid ${PALETTE.gold}33`, borderRadius: 8, padding: "13px 15px" };
const panelTitle = { fontSize: 13, color: PALETTE.gold, letterSpacing: "0.18em", marginBottom: 8 };
const btnGold = { marginTop: 6, padding: "11px", background: `linear-gradient(${PALETTE.gold}, ${PALETTE.parchDim})`, color: PALETTE.ink, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, letterSpacing: "0.1em" };
const btnGoldSm = { ...btnGold, marginTop: 0, padding: "8px 12px", flex: 1, fontSize: 13 };
const btnGhostSm = { background: "transparent", color: PALETTE.parchDim, border: `1px solid ${PALETTE.gold}44`, borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 13, letterSpacing: "0.1em", whiteSpace: "nowrap" };
const menuItem = { background: "transparent", color: PALETTE.parchDim, border: `1px solid ${PALETTE.gold}33`, borderRadius: 6, padding: "11px 14px", cursor: "pointer", fontSize: 14, letterSpacing: "0.1em", whiteSpace: "nowrap", textAlign: "left" };
const miniBtn = { background: "transparent", color: PALETTE.gold, border: `1px solid ${PALETTE.gold}55`, borderRadius: 4, width: 24, height: 24, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 };
const tableBtn = { background: "transparent", color: PALETTE.gold, border: `1px solid ${PALETTE.gold}55`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 11, letterSpacing: "0.08em" };
const modalBackdrop = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,8,10,0.82)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'EB Garamond', Georgia, serif" };
const modalShell = { display: "flex", flexDirection: "column", background: `linear-gradient(160deg, ${PALETTE.deep}, ${PALETTE.ink})`, border: `2px solid ${PALETTE.gold}66`, borderRadius: 12, boxShadow: "0 30px 80px rgba(0,0,0,0.7)", color: PALETTE.parch, overflow: "hidden" };
const modalHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px", borderBottom: `1px solid ${PALETTE.gold}44` };

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="disp" style={{ fontSize: 26, color }}>{value}</div>
      <div style={{ fontSize: 11, color: PALETTE.parchDim, letterSpacing: "0.2em" }}>{label}</div>
    </div>
  );
}
function StatLine({ label, value, isDM, onAdj }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontSize: 15, color: PALETTE.parch }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isDM && <button onClick={() => onAdj(-1)} style={miniBtn}>−</button>}
        <span className="disp" style={{ fontSize: 21, color: PALETTE.goldBright, minWidth: 28, textAlign: "center" }}>{value}</span>
        {isDM && <button onClick={() => onAdj(1)} style={miniBtn}>+</button>}
      </span>
    </div>
  );
}

function SupplyScale({ supplies }) {
  const s = supplies ?? 0;
  const st = supplyStatus(s);
  const pen = supplyPenalty(s);
  const color = st.tone === "ok" ? PALETTE.ok : st.tone === "warn" ? PALETTE.goldBright : PALETTE.bad;
  return (
    <div style={{ marginTop: 5 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < Math.min(5, Math.max(0, s)) ? color : "rgba(255,255,255,0.08)" }} />
        ))}
      </div>
      <div style={{ fontSize: 12.5, color }}>
        {pen ? `${st.label} · rolls take ${pen}` : `${st.label} · no roll penalty`}
      </div>
    </div>
  );
}

function VehicleUpgrades({ onClose, resolve, owned, combat, isDM, onBuy, onSetHP, onRepair, onRoll }) {
  const [tab, setTab] = useState("buy");
  const isMobile = useIsMobile();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  // Rendered inside the app's zoom (like the codex/downtime overlays) so it scales
  // to match the rest of the UI. The backdrop is sized to the un-zoomed viewport so
  // the 1.2x scale doesn't push it past the screen edges (which caused scrollbars).
  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, width: `${100 / SCALE}vw`, height: `${100 / SCALE}vh`, zIndex: 60, background: "rgba(4,8,10,0.82)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontFamily: "'EB Garamond', Georgia, serif" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalShell, width: isMobile ? `${96 / SCALE}vw` : "min(1240px, 97vw)", height: isMobile ? `${90 / SCALE}vh` : "min(80vh, 760px)" }}>
        <div style={modalHeader}>
          <div className="disp" style={{ fontSize: 22, color: PALETTE.goldBright, letterSpacing: "0.12em" }}>VEHICLE OVERVIEW</div>
          <button onClick={onClose} className="disp" style={btnGhostSm}>CLOSE ✕</button>
        </div>
        <div style={{ display: "flex", gap: 10, padding: "10px 22px 0" }}>
          <UTab on={tab === "buy"} onClick={() => setTab("buy")}>BUY</UTab>
          <UTab on={tab === "list"} onClick={() => setTab("list")}>UPGRADES</UTab>
          <UTab on={tab === "combat"} onClick={() => setTab("combat")}>COMBAT</UTab>
        </div>
        {tab === "buy"
          ? <UpgradeBuy resolve={resolve} owned={owned} isDM={isDM} onBuy={onBuy} />
          : tab === "list"
          ? <UpgradeList owned={owned} />
          : <CombatTab owned={owned} combat={combat} isDM={isDM} onSetHP={onSetHP} onRepair={onRepair} onRoll={onRoll} />}
      </div>
    </div>
  );
}

function UTab({ on, onClick, children }) {
  return <button onClick={onClick} className="disp" style={{
    background: "transparent", border: "none", borderBottom: `2px solid ${on ? PALETTE.gold : "transparent"}`,
    color: on ? PALETTE.goldBright : PALETTE.parchDim, padding: "7px 6px", cursor: "pointer", fontSize: 15, letterSpacing: "0.12em",
  }}>{children}</button>;
}

function UpgradeBuy({ resolve, owned, isDM, onBuy }) {
  const [veh, setVeh] = useState(VEHICLES[0]);
  const isMobile = useIsMobile();
  return (
    <>
      <div style={{ padding: "12px 22px", fontSize: 14, color: PALETTE.parchDim, lineHeight: 1.5 }}>
        Spend Resolve to fit out the party's craft for vehicle combat. Each upgrade fills one slot and has three tiers; a higher tier replaces the lower. The party holds <b className="disp" style={{ color: PALETTE.goldBright }}>{resolve}</b> Resolve.{isDM ? "" : " Only the DM can purchase."}
      </div>
      <div style={{ padding: "0 22px 20px", overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: isMobile ? "wrap" : "nowrap" }}>
          {VEHICLES.map((v) => (
            <button key={v} onClick={() => setVeh(v)} className="disp" style={{
              background: veh === v ? `${PALETTE.gold}1f` : "transparent", border: `1px solid ${veh === v ? PALETTE.gold : PALETTE.gold + "33"}`,
              color: veh === v ? PALETTE.goldBright : PALETTE.parchDim, padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 14, letterSpacing: "0.08em",
            }}>{v.toUpperCase()}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 12, alignItems: "start" }}>
              {upgradesFor(veh).map((u) => {
                const have = owned[u.key] || 0;
                return (
                  <div key={u.key} style={{ background: "rgba(8,16,18,0.4)", border: `1px solid ${PALETTE.gold}1a`, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span className="disp" style={{ fontSize: 16, color: PALETTE.bone }}>{u.name}</span>
                      <span style={{ fontSize: 12, color: PALETTE.parchDim }}>{u.slot}{have ? ` · T${have}` : ""}</span>
                    </div>
                    {u.tiers.map((t, i) => {
                      const tier = i + 1;
                      const isOwned = have >= tier;
                      const isNext = have === tier - 1;
                      const affordable = resolve >= t.cost;
                      return (
                        <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
                          <span className="disp" style={{ minWidth: 74, fontSize: 13, color: isOwned ? PALETTE.ok : isNext && affordable ? PALETTE.goldBright : PALETTE.parchDim }}>
                            {isOwned ? "✓ " : ""}T{tier} · {t.cost} RES
                          </span>
                          <span style={{ flex: 1, fontSize: 13.5, color: isOwned ? PALETTE.parch : PALETTE.parchDim }}>{t.effect}</span>
                          {isDM && isNext && (
                            <button onClick={() => onBuy(u.key, tier, t.cost)} disabled={!affordable}
                              style={{ ...tableBtn, opacity: affordable ? 1 : 0.4, cursor: affordable ? "pointer" : "default" }}>BUY</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
        </div>
      </div>
    </>
  );
}

// Point-map: the vehicle image with clickable fitting hotspots, plus the live stat block.
function UpgradeList({ owned }) {
  const [veh, setVeh] = useState(VEHICLES[0]);
  const [slot, setSlot] = useState(null);
  const isMobile = useIsMobile();
  const stats = vehicleStats(veh, owned);
  const ups = upgradesFor(veh);
  const sel = ups.find((u) => u.key === slot) || null;
  const have = sel ? (owned[sel.key] || 0) : 0;

  // Zoom-to-fitting: when a hotspot is chosen, pan/zoom the craft so that point
  // sits in the visible left half (the drawer covers the right half).
  const S = sel ? 2.0 : 1;
  const tx = sel ? 25 - S * sel.hotspot.x : 0;
  const ty = sel ? 50 - S * sel.hotspot.y : 0;
  const stageTransform = sel ? `translate(${tx}%, ${ty}%) scale(${S})` : "none";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 22px 16px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        {VEHICLES.map((v) => (
          <button key={v} onClick={() => { setVeh(v); setSlot(null); }} className="disp" style={{
            background: veh === v ? `${PALETTE.gold}1f` : "transparent", border: `1px solid ${veh === v ? PALETTE.gold : PALETTE.gold + "33"}`,
            color: veh === v ? PALETTE.goldBright : PALETTE.parchDim, padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 14, letterSpacing: "0.08em",
          }}>{v.toUpperCase()}</button>
        ))}
      </div>

      {/* craft image with hotspots; selecting one zooms in and slides the drawer over the right half */}
      <div style={{ position: "relative", margin: "0 auto", width: "fit-content", maxWidth: "100%", overflow: "hidden", borderRadius: 10, border: `1px solid ${PALETTE.gold}33` }}>
        <div style={{ transform: stageTransform, transformOrigin: "0 0", transition: "transform 0.45s cubic-bezier(.4,0,.2,1)" }}>
          <img src={VEHICLE_IMAGES[veh]} alt={veh} style={{ display: "block", maxHeight: "46vh", maxWidth: "100%", width: "auto" }} />
          {ups.map((u) => {
            const t = owned[u.key] || 0;
            const active = slot === u.key;
            const hidden = sel && !active;
            return (
              <button key={u.key} onClick={() => setSlot(active ? null : u.key)} title={`${u.slot} · ${u.name}`}
                style={{
                  position: "absolute", left: `${u.hotspot.x}%`, top: `${u.hotspot.y}%`,
                  transform: `translate(-50%, -50%) scale(${1 / S})`, transformOrigin: "center",
                  width: 30, height: 30, borderRadius: "50%", cursor: "pointer", zIndex: 2,
                  background: active ? PALETTE.goldBright : "rgba(8,16,18,0.82)",
                  border: `2px solid ${active ? PALETTE.goldBright : t ? PALETTE.ok : PALETTE.bone}`,
                  color: active ? PALETTE.ink : t ? PALETTE.ok : PALETTE.bone,
                  fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: 13,
                  display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                  opacity: hidden ? 0 : 1, pointerEvents: hidden ? "none" : "auto",
                  transition: "opacity 0.25s ease",
                }}>{t || "+"}</button>
            );
          })}
        </div>

        {/* slide-in drawer (~half the image) */}
        <div style={{
          position: "absolute", top: 0, right: 0, height: "100%", width: "50%", zIndex: 3,
          transform: sel ? "translateX(0)" : "translateX(102%)", transition: "transform 0.4s cubic-bezier(.4,0,.2,1)",
          background: "rgba(6,12,14,0.95)", borderLeft: `1px solid ${PALETTE.gold}55`,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {sel && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${PALETTE.gold}33` }}>
                <div className="disp" style={{ fontSize: 17, color: PALETTE.goldBright }}>{sel.slot}<span style={{ fontSize: 13, color: PALETTE.parchDim, marginLeft: 8 }}>{sel.name}</span></div>
                <button onClick={() => setSlot(null)} className="disp" style={btnGhostSm}>✕</button>
              </div>
              <div style={{ overflowY: "auto", padding: "12px 16px" }}>
                <div className="disp" style={{ fontSize: 12, color: PALETTE.gold, letterSpacing: "0.18em", marginBottom: 6 }}>FITTING</div>
                {sel.tiers.map((t, i) => {
                  const tier = i + 1;
                  const isOwned = have >= tier;
                  const isCurrent = have === tier;
                  return (
                    <div key={i} style={{
                      display: "flex", gap: 10, padding: "7px 8px", borderRadius: 6, marginBottom: 4,
                      background: isCurrent ? `${PALETTE.gold}1f` : "transparent",
                      border: `1px solid ${isCurrent ? PALETTE.gold + "66" : "transparent"}`,
                    }}>
                      <span className="disp" style={{ minWidth: 64, fontSize: 13, color: isOwned ? PALETTE.ok : PALETTE.parchDim }}>
                        {isOwned ? "✓ " : ""}T{tier} · {t.cost} RES
                      </span>
                      <span style={{ flex: 1, fontSize: 13.5, color: isOwned ? PALETTE.parch : PALETTE.parchDim }}>{t.effect}</span>
                    </div>
                  );
                })}
                {!have && <div style={{ fontSize: 13, color: PALETTE.parchDim, fontStyle: "italic", marginTop: 4 }}>Not yet fitted. Buy it from the BUY tab.</div>}

                <div className="disp" style={{ fontSize: 12, color: PALETTE.gold, letterSpacing: "0.18em", margin: "16px 0 6px" }}>VEHICLE STATS</div>
                {VEHICLE_STATS.map((st) => {
                  const base = VEHICLE_BASE[veh][st] || 0;
                  const cur = stats[st] || 0;
                  const delta = cur - base;
                  const unit = VEHICLE_STAT_UNIT[st] ? ` ${VEHICLE_STAT_UNIT[st]}` : "";
                  const showMod = !VEHICLE_STAT_UNIT[st];
                  return (
                    <div key={st} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${PALETTE.gold}14` }}>
                      <span style={{ fontSize: 14, color: PALETTE.parch }}>{st}</span>
                      <span className="disp" style={{ fontSize: 14 }}>
                        <span style={{ color: PALETTE.goldBright }}>{showMod ? fmtMod(cur) : cur}{unit}</span>
                        {delta !== 0 && <span style={{ fontSize: 11, color: PALETTE.ok, marginLeft: 7 }}>({fmtMod(delta)})</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: PALETTE.parchDim, marginTop: 8, fontStyle: "italic", textAlign: "center" }}>
        Tap a fitting on the craft to zoom in and see its tiers and the vehicle's current stats.
      </div>
    </div>
  );
}

function CombatTab({ owned, combat, isDM, onSetHP, onRepair, onRoll }) {
  const [veh, setVeh] = useState(VEHICLES[0]);
  const [slot, setSlot] = useState(null);
  const isMobileCombat = useIsMobile();
  const { systems, max } = vehicleHP(veh, owned);
  const curOf = (sys) => { const v = combat?.[veh]?.[sys.key]; return v == null ? sys.max : Math.min(v, sys.max); };
  const curTotal = systems.reduce((a, sys) => a + curOf(sys), 0);
  const frac = max ? curTotal / max : 1;
  const stats = vehicleStats(veh, owned);
  const sel = systems.find((sys) => sys.key === slot) || null;
  const selCur = sel ? curOf(sel) : 0;

  const hue = Math.round(120 * frac);            // 120 green -> 0 red
  const tintA = (1 - frac) * 0.5 + 0.04;         // more opaque (and redder) as HP drops
  const hpColor = frac > 0.6 ? PALETTE.ok : frac > 0.3 ? PALETTE.goldBright : PALETTE.bad;
  const sysColor = (sys) => { const f = sys.max ? curOf(sys) / sys.max : 1; return f > 0.6 ? PALETTE.ok : f > 0.3 ? PALETTE.goldBright : PALETTE.bad; };

  const S = sel ? 2.0 : 1;
  const tx = sel ? 25 - S * sel.hotspot.x : 0;
  const ty = sel ? 50 - S * sel.hotspot.y : 0;
  const stageTransform = sel ? `translate(${tx}%, ${ty}%) scale(${S})` : "none";

  const ROLL_STATS = ["Firepower", "Maneuver", "Stealth", "Sensors"];
  const doRoll = (st) => onRoll(veh, st, stats[st] || 0);

  // React to damage: shake/flash on HP drop, power-down sound on a system reaching 0.
  // Refs are updated every run so a duplicate snapshot (Firestore fires local + server)
  // with the same totals can't re-trigger; the flash is keyed so it can never stick on.
  const lastTotal = useRef(null);
  const lastVals = useRef({});
  const lastVeh = useRef(null);
  const shakeTimer = useRef(null);
  const [hitKey, setHitKey] = useState(0);
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    const vals = {};
    systems.forEach((s) => { vals[s.key] = curOf(s); });
    const total = Object.values(vals).reduce((a, b) => a + b, 0);
    if (lastVeh.current === veh && lastTotal.current != null) {
      if (total < lastTotal.current) {
        setHitKey((k) => k + 1);
        setShaking(true);
        clearTimeout(shakeTimer.current);
        shakeTimer.current = setTimeout(() => setShaking(false), 520);
      }
      let newlyDisabled = false;
      systems.forEach((s) => { if (vals[s.key] === 0 && (lastVals.current[s.key] ?? s.max) > 0) newlyDisabled = true; });
      if (newlyDisabled) playDisable();
    }
    lastTotal.current = total;
    lastVals.current = vals;
    lastVeh.current = veh;
  }, [combat, veh]); // eslint-disable-line

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 22px 16px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: isMobileCombat ? "wrap" : "nowrap" }}>
          {VEHICLES.map((v) => (
            <button key={v} onClick={() => { setVeh(v); setSlot(null); }} className="disp" style={{
              background: veh === v ? `${PALETTE.gold}1f` : "transparent", border: `1px solid ${veh === v ? PALETTE.gold : PALETTE.gold + "33"}`,
              color: veh === v ? PALETTE.goldBright : PALETTE.parchDim, padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 14, letterSpacing: "0.08em",
            }}>{v.toUpperCase()}</button>
          ))}
        </div>
        {isDM && <button onClick={() => onRepair(veh)} style={tableBtn}>REPAIR TO FULL</button>}
      </div>

      {/* overall hull integrity */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
          <span className="disp" style={{ letterSpacing: "0.14em", color: PALETTE.gold }}>HULL INTEGRITY</span>
          <span className="disp" style={{ color: hpColor }}>{curTotal} / {max} HP</span>
        </div>
        <div style={{ height: 12, background: "rgba(0,0,0,0.4)", borderRadius: 6, overflow: "hidden", border: `1px solid ${PALETTE.gold}22` }}>
          <div style={{ width: `${frac * 100}%`, height: "100%", background: `hsl(${hue}, 70%, 45%)`, transition: "width 0.4s ease, background 0.4s ease" }} />
        </div>
      </div>

      {/* stat roller */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: PALETTE.parchDim, marginRight: 2 }}>Roll d20 +</span>
        {ROLL_STATS.map((st) => (
          <button key={st} onClick={() => doRoll(st)} className="disp" style={{ background: "transparent", border: `1px solid ${PALETTE.gold}44`, color: PALETTE.parch, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12.5 }}>
            {st} {fmtMod(stats[st] || 0)}
          </button>
        ))}
        <span style={{ fontSize: 12.5, color: PALETTE.parchDim, marginLeft: 6 }}>Armor (AC) <b style={{ color: PALETTE.bone }}>{stats.Armor}</b> · Speed <b style={{ color: PALETTE.bone }}>{stats.Speed} ft</b></span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: PALETTE.parchDim, fontStyle: "italic" }}>Everyone sees the roll.</span>
      </div>

      {/* craft image: system dots, damage tint, zoom-in, drawer */}
      <div className={shaking ? "hull-hit" : ""} style={{ position: "relative", margin: "0 auto", width: "fit-content", maxWidth: "100%", overflow: "hidden", borderRadius: 10, border: `1px solid ${PALETTE.gold}33` }}>
        <div style={{ transform: stageTransform, transformOrigin: "0 0", transition: "transform 0.45s cubic-bezier(.4,0,.2,1)" }}>
          <img src={VEHICLE_IMAGES[veh]} alt={veh} style={{ display: "block", maxHeight: "42vh", maxWidth: "100%", width: "auto" }} />
          <div style={{ position: "absolute", inset: 0, background: `hsla(${hue}, 80%, 42%, ${tintA})`, mixBlendMode: "multiply", pointerEvents: "none", transition: "background 0.5s ease" }} />
          {hitKey > 0 && <div key={hitKey} className="hit-flash" style={{ position: "absolute", inset: 0, background: PALETTE.bad, pointerEvents: "none", zIndex: 1, opacity: 0 }} />}
          {systems.map((sys) => {
            const active = slot === sys.key;
            const hidden = sel && !active;
            const dead = curOf(sys) === 0;
            return (
              <button key={sys.key} onClick={() => setSlot(active ? null : sys.key)} title={sys.slot}
                className={dead ? "disabled-pulse" : ""}
                style={{
                  position: "absolute", left: `${sys.hotspot.x}%`, top: `${sys.hotspot.y}%`,
                  transform: `translate(-50%, -50%) scale(${1 / S})`, transformOrigin: "center",
                  minWidth: 30, height: 30, padding: "0 6px", borderRadius: 15, cursor: "pointer", zIndex: 2,
                  background: active ? PALETTE.goldBright : "rgba(8,16,18,0.85)", border: `2px solid ${active ? PALETTE.goldBright : dead ? PALETTE.bad : sysColor(sys)}`,
                  color: active ? PALETTE.ink : dead ? PALETTE.bad : sysColor(sys), fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: 12,
                  display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                  opacity: hidden ? 0 : 1, pointerEvents: hidden ? "none" : "auto", transition: "opacity 0.25s ease",
                }}>
                {dead ? "✕" : curOf(sys)}
                {dead && !hidden && (
                  <span className="disp" style={{ position: "absolute", top: "120%", left: "50%", transform: `translateX(-50%) scale(${1 / S})`, fontSize: 9, letterSpacing: "0.12em", color: "#fff", background: "rgba(140,30,30,0.92)", border: `1px solid ${PALETTE.bad}`, borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap", boxShadow: "0 2px 6px rgba(0,0,0,0.7)" }}>DISABLED</span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{
          position: "absolute", top: 0, right: 0, height: "100%", width: "50%", zIndex: 3,
          transform: sel ? "translateX(0)" : "translateX(102%)", transition: "transform 0.4s cubic-bezier(.4,0,.2,1)",
          background: "rgba(6,12,14,0.95)", borderLeft: `1px solid ${PALETTE.gold}55`, display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {sel && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${PALETTE.gold}33` }}>
                <div className="disp" style={{ fontSize: 17, color: PALETTE.goldBright }}>{sel.slot}<span style={{ fontSize: 13, color: PALETTE.parchDim, marginLeft: 8 }}>{sel.name}</span></div>
                <button onClick={() => setSlot(null)} className="disp" style={btnGhostSm}>✕</button>
              </div>
              <div style={{ overflowY: "auto", padding: "12px 16px" }}>
                <div className="disp" style={{ fontSize: 12, color: PALETTE.gold, letterSpacing: "0.18em", marginBottom: 8 }}>SYSTEM HEALTH</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 15, color: PALETTE.parch }}>Integrity</span>
                  <span className="disp" style={{ fontSize: 16, color: sysColor(sel) }}>{selCur} / {sel.max} HP</span>
                </div>
                <div style={{ height: 10, background: "rgba(0,0,0,0.4)", borderRadius: 5, overflow: "hidden", border: `1px solid ${PALETTE.gold}22`, marginBottom: 8 }}>
                  <div style={{ width: `${sel.max ? (selCur / sel.max) * 100 : 0}%`, height: "100%", background: sysColor(sel), transition: "width 0.3s ease" }} />
                </div>
                <div style={{ fontSize: 12.5, color: PALETTE.parchDim }}>
                  Carries {sel.max} of the craft's {max} HP.{selCur === 0 ? " This system is disabled." : ""}
                </div>

                {isDM ? (
                  <div style={{ marginTop: 14 }}>
                    <div className="disp" style={{ fontSize: 12, color: PALETTE.gold, letterSpacing: "0.18em", marginBottom: 6 }}>APPLY DAMAGE / REPAIR</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[-5, -1, 1, 5].map((d) => (
                        <button key={d} onClick={() => onSetHP(veh, sel.key, Math.max(0, Math.min(sel.max, selCur + d)))}
                          style={{ background: "transparent", border: `1px solid ${d < 0 ? PALETTE.bad : PALETTE.ok}66`, color: d < 0 ? PALETTE.bad : PALETTE.ok, borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 14, fontFamily: "'Cinzel', serif" }}>
                          {d > 0 ? `+${d}` : d}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, fontSize: 12.5, color: PALETTE.parchDim, fontStyle: "italic" }}>The DM manages system damage.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: PALETTE.parchDim, marginTop: 8, fontStyle: "italic", textAlign: "center" }}>
        Tap a system to see its share of the hull{isDM ? " and apply damage" : ""}. The craft reddens as integrity falls.
      </div>
    </div>
  );
}

function Detail({ color, text }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 14 }}>
      <span style={{ color }}>✦</span>
      <span style={{ color: PALETTE.parch }}>{text}</span>
    </div>
  );
}

function RouteDetail({ route, current, mod, skies = 0 }) {
  const destName = NODES[route.from === current ? route.to : route.from].name;
  const dcW = route.dc + skies;
  const need = dcW - mod.value;
  let needStr, needColor;
  if (need <= 1) { needStr = "Succeeds on any roll"; needColor = PALETTE.ok; }
  else if (need > 20) { needStr = "Only a natural 20 succeeds"; needColor = PALETTE.bad; }
  else { needStr = `Need ${need}+ on the d20`; needColor = need >= 16 ? PALETTE.bad : need >= 11 ? PALETTE.goldBright : PALETTE.ok; }
  return (
    <>
      <div style={{ fontSize: 15 }}>
        To <b style={{ color: PALETTE.bone }}>{destName}</b>
        <span style={{ color: FACTIONS[mod.faction].color }}> · {FACTIONS[mod.faction].label}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
        <span style={{ color: PALETTE.parchDim }}>Roll DC</span>
        <span className="disp" style={{ color: PALETTE.goldBright }}>
          {dcW}
          {skies > 0 && <span style={{ fontSize: 11, color: PALETTE.parchDim, letterSpacing: 0 }}> ({route.dc} +{skies} {skies === 2 ? "tempest" : "rain"})</span>}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 14, gap: 10 }}>
        <span style={{ color: PALETTE.parchDim }}>Modifier</span>
        <span className="disp" style={{ textAlign: "right" }}>
          <span style={{ color: signColor(mod.value) }}>{fmtMod(mod.value)}</span>
          {mod.partsDetailed.length > 0 && (
            <span style={{ fontSize: 12 }}>
              {mod.partsDetailed.map((p, i) => (
                <span key={i} style={{ color: signColor(p.v), marginLeft: 7 }}>{p.label} {fmtMod(p.v)}</span>
              ))}
            </span>
          )}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span style={{ color: PALETTE.parchDim }}>Odds</span>
        <span style={{ color: needColor }}>{needStr}</span>
      </div>
      <Detail color={PALETTE.ok} text={route.benefit} />
      <Detail color={PALETTE.parchDim} text={route.cost} />
      <Detail color={PALETTE.bad} text={route.risk} />
      <Detail color={PALETTE.goldBright} text="Fortune: chance for a random event." />
    </>
  );
}
