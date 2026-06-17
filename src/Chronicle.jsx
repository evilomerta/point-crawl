import React, { useState, useEffect, useRef } from "react";
import { useIsMobile } from "./mobile";
import { PALETTE, FACTIONS, NODES } from "./data";
import { DT, availableRolls } from "./downtime";
import { increment } from "./firebase";
import {
  CH, TIERS, tierPct, rollTier, stressNow, activeInjuries, boldLocked,
  stressBand, INJURIES, NPCS, faceIdFor, makeRumor, randomFinding,
  ACTIONS, ACTION_BY_ID, CHASE_DECK, CHASE_RESULTS, FAIL_LINES,
  drawCard, mulberry, hash32, mindOf, rollMind, narrate,
  DELVE_TEMPLATES, DELVE_BY_ID, roomsFor, depthOf, DEPTH_LABEL, lanternFor,
  lanternMod, biteRisk, roomNode, sealedClue, BOSS_SPOILS,
  TRINKETS, TRINKET_BY_ID, equippedFx, itemChoiceMod,
} from "./chronicle";
import { playDice, DICE_MS } from "./sound";
import {
  CRAFT_TOOLS, CRAFT_RANKS, CRAFT_XP_MAX, craftRankIdx, craftRankName,
  craftWeekKey, craftWeekResetMs, recipesByTool, RECIPES, RECIPE_BY_ID, RARITIES,
} from "./craft";

// the journal's own chrome: leather, brass, parchment, wax
export const J = {
  leather: "#191009", leather2: "#241709", wood: "#2b1d10",
  brass: "#b08d3f", brassBright: "#d9b96a",
  parchment: "#ece0bd", parchment2: "#dcc998", inkDark: "#2b2418", inkSoft: "#4a3f2c",
  wax: "#8a2b2b", waxBright: "#b04a3e",
};

// =============================================================================
export default function Chronicle({ dt, profile, myKey, isDM, onPatch, supplies = 0 }) {
  const [view, setView] = useState("ledger");
  const [flow, setFlow] = useState(null);
  const spectator = !profile;
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  const actions = spectator ? 0 : availableRolls(profile);

  // ---- shared patch helpers -------------------------------------------------
  const spendAction = (patch) => {
    const avail = availableRolls(profile);
    const last = profile.lastRefill ?? Date.now();
    const regen = Math.floor((Date.now() - last) / DT.REGEN_MS);
    patch[`downtime.profiles.${myKey}.rolls`] = Math.max(0, avail - 1);
    patch[`downtime.profiles.${myKey}.lastRefill`] = avail >= DT.MAX_FREE ? Date.now() : last + Math.max(0, regen) * DT.REGEN_MS;
  };
  const spendN = (patch, n) => {
    const avail = availableRolls(profile);
    const last = profile.lastRefill ?? Date.now();
    const regen = Math.floor((Date.now() - last) / DT.REGEN_MS);
    patch[`downtime.profiles.${myKey}.rolls`] = Math.max(0, avail - n);
    patch[`downtime.profiles.${myKey}.lastRefill`] = avail >= DT.MAX_FREE ? Date.now() : last + Math.max(0, regen) * DT.REGEN_MS;
  };
  const addDeed = (patch, t) => {
    patch[`downtime.profiles.${myKey}.deeds`] = [{ t, ts: Date.now() }, ...(profile.deeds || [])].slice(0, CH.DEED_CAP);
  };
  const addLog = (patch, t) => {
    patch[`downtime.log`] = [{ t, ts: Date.now() }, ...(dt.log || [])].slice(0, CH.LOG_CAP);
  };
  const bumpStress = (patch, delta, from = null) => {
    const cur = from === null ? stressNow(profile) : from;
    const v = Math.max(0, Math.min(CH.STRESS_MAX, cur + delta));
    patch[`downtime.profiles.${myKey}.stress`] = v;
    patch[`downtime.profiles.${myKey}.stressTs`] = Date.now();
    return v;
  };
  const maybeLiftMind = (patch, newStress, rewards) => {
    const m = mindOf(profile);
    if (!m || newStress > CH.MIND_CLEAR_AT) return;
    patch[`downtime.profiles.${myKey}.mind`] = null;
    rewards.push({ icon: "candle", big: true, t: m.virtue ? `${m.name} fades with the calm.` : `${m.name} lifts. The pressure lets go.`, color: "#8fc06f" });
    addLog(patch, `${profile.name} is no longer ${m.name}.`);
  };
  const maybeBreak = (patch, newStress, rewards) => {
    if (newStress < CH.STRESS_FRAY || mindOf(profile)) return;
    const m = rollMind();
    patch[`downtime.profiles.${myKey}.mind`] = { id: m.id, ts: Date.now() };
    sagaMark(patch, "breaks");
    rewards.push({
      icon: "candle", big: true,
      t: m.virtue ? `${m.name} takes hold. ${m.effect}` : `Your mind gives: ${m.name}. ${m.effect}`,
      color: m.virtue ? "#8fc06f" : J.waxBright,
    });
    addLog(patch, m.virtue ? `${profile.name} stands ${m.name}.` : `${profile.name} is ${m.name}.`);
  };
  const clearPassedMind = (patch) => {
    if (profile.mind && !mindOf(profile)) patch[`downtime.profiles.${myKey}.mind`] = null;
  };
  const woundMaybe = (patch, rewards, chance) => {
    if (Math.random() >= chance || activeInjuries(profile).length >= 2) return;
    const have = new Set(activeInjuries(profile).map((i) => i.name));
    const pool = INJURIES.filter((n) => !have.has(n));
    const inj = { name: pool[Math.floor(Math.random() * pool.length)], until: Date.now() + CH.INJURY_DAYS * 86400000 };
    patch[`downtime.profiles.${myKey}.injuries`] = [...activeInjuries(profile), inj];
    rewards.push({ icon: "bandage", t: `Wounded: ${inj.name}`, color: J.waxBright });
  };
  // Conditions weigh on every roll: 2+ wounds is -1, Haunted stress (9+) is -1.
  const conditionMod = () => -activeInjuries(profile).length + (stressNow(profile) >= 9 ? -1 : 0);
  // The Saga: lifetime tallies a wanderer carries. Pure history, zero stats.
  const sagaMark = (patch, key, n = 1) => { patch[`downtime.profiles.${myKey}.saga.${key}`] = increment(n); };
  // Worn trinkets carry 3 uses each, spent when their bonus aids a success.
  const chargesOf = (id) => (profile.charges || {})[id] ?? 3;
  // How many points each modifier trinket contributes in a given context.
  const itemContribution = (fx, ctx, tier) => {
    if (ctx.kind === "delve") {
      if (fx === "delve1") return 1;
      if (fx === "delve2") return 2;
      if (fx === "lantern" && ctx.dim) return 1;
      if (fx === "boss2" && ctx.depth === "boss") return 2;
    } else {
      if (fx === "ashore1") return 1;
      if (fx === "ashore2") return 2;
      if (fx === "chase2" && ctx.kind === "chase") return 2;
      if (fx === "press2" && ctx.press) return 2;
    }
    if (fx === "bold2" && tier === "b") return 2;
    if (fx === "careful2" && tier === "c") return 2;
    return 0;
  };
  // A use is spent whenever the trinket's bonus aids a SUCCESSFUL roll (a
  // natural 20 needed no help), or when a special effect demonstrably fired.
  const itemsUsedFor = (ctx, tier, flags = {}, verdict = null, margin = 0) => {
    void margin;
    const used = [];
    for (const id of profile.equipped || []) {
      const fx = TRINKET_BY_ID[id]?.fx;
      if (!fx) continue;
      const contrib = itemContribution(fx, ctx, tier);
      const aided = contrib > 0 && verdict && verdict.success && !verdict.crit;
      const specialFired =
        (fx === "calm" && flags.calmed) || (fx === "potguard" && flags.haulSaved)
        || (fx === "resttwice" && flags.easeDoubled) || (fx === "rootskin" && flags.boldUnlocked);
      if (aided || specialFired) used.push(id);
    }
    return used;
  };
  const consumeCharges = (patch, usedIds, rewards) => {
    if (!usedIds.length) return;
    const charges = { ...(profile.charges || {}) };
    let equipped = [...(profile.equipped || [])];
    for (const id of usedIds) {
      const left = (charges[id] ?? 3) - 1;
      if (left > 0) {
        rewards.push({ icon: "gem", t: `${TRINKET_BY_ID[id]?.name} lends its weight: ${left} use${left > 1 ? "s" : ""} left`, color: "#b9a8d6" });
      }
      if (left <= 0) {
        sagaMark(patch, "spent");
        delete charges[id];
        equipped = equipped.filter((x) => x !== id);
        rewards.push({ icon: "gem", t: `${TRINKET_BY_ID[id]?.name} is spent: three services given, and it crumbles`, color: J.waxBright });
      } else {
        charges[id] = left;
      }
    }
    patch[`downtime.profiles.${myKey}.charges`] = charges;
    patch[`downtime.profiles.${myKey}.equipped`] = equipped;
  };
  const dropTrinket = (patch, rewards, rng, rareTid = null) => {
    const owned = new Set([...(profile.items || []), ...(profile.equipped || [])]);
    let t = null;
    if (rareTid) {
      t = TRINKETS.find((x) => x.rare === rareTid && !owned.has(x.id))
        || TRINKETS.find((x) => x.rare && !owned.has(x.id));
    }
    if (!t) {
      const pool = TRINKETS.filter((x) => !x.rare && !owned.has(x.id));
      if (!pool.length) return;
      t = pool[Math.floor(rng() * pool.length)];
    }
    // A boss relic forces its way into a full satchel; a common find is left behind, and says so.
    if (!t.rare && (profile.items || []).length >= CH.SATCHEL_CAP) {
      rewards.push({ icon: "gem", t: "Your satchel is full. Something glints in the wreck, and stays there", color: PALETTE.parchDim });
      return;
    }
    patch[`downtime.profiles.${myKey}.items`] = [...(profile.items || []), t.id];
    patch[`downtime.profiles.${myKey}.charges`] = { ...(profile.charges || {}), [t.id]: 3 };
    rewards.push({ icon: "gem", t: `Found: ${t.name}. ${t.fxText}. Equip it on your Character page.`, color: rareTid ? J.brassBright : "#b9a8d6", big: true });
    if (rareTid) addLog(patch, `${profile.name} claimed ${t.name} from the lair.`);
  };
  const mindMod = () => {
    const mind = mindOf(profile);
    return (mind?.id === "wreckeyed" ? -1 : 0) + (mind?.id === "steadied" ? 1 : 0);
  };

  // ---- ashore: apply a card's outcome ----------------------------------------
  const applyOutcome = (action, card, choice, ctx) => {
    // Re-check at spend time: the candle gate at flow-open can go stale while the scene sits open.
    if (!ctx.press && !ctx.followup && availableRolls(profile) <= 0) { setFlow(null); return; }
    const roll = 1 + Math.floor(Math.random() * 20);
    const mind = mindOf(profile);
    const totalMod = mindMod() + conditionMod() + (ctx.press ? CH.PRESS_MOD : 0) + itemChoiceMod(profile, { kind: "ashore", press: !!ctx.press }, choice.t);
    const verdict = rollTier(roll, choice.t, totalMod);
    const patch = {};
    clearPassedMind(patch);
    if (!ctx.press && !ctx.followup) {
      spendAction(patch);
      patch[`downtime.profiles.${myKey}.deals.${action.id}`] = ((profile.deals || {})[action.id] || 0) + 1;
    }
    const rewards = [];
    let note = choice.note;
    const flags = { calmed: false, easeDoubled: false, haulSaved: false, boldUnlocked: choice.t === "b" && activeInjuries(profile).length > 0 };
    let followup = null;

    const mercy = action.id === "tavern" || action.id === "train";
    if (!verdict.success && mercy) {
      // Relief actions half-work on a miss: the candle always buys its comfort.
      // No stress, no wounds, no breaking. Only the larger prize slips away.
      if (action.id === "train") {
        const injNow = activeInjuries(profile);
        if (injNow.length) {
          const sorted = [...injNow].sort((a, b) => a.until - b.until);
          patch[`downtime.profiles.${myKey}.injuries`] = injNow.filter((x) => x !== sorted[0]);
          rewards.push({ icon: "bandage", t: `The rest still mends: ${sorted[0].name} closes`, color: "#8fc06f" });
        } else {
          const cs = bumpStress(patch, -1);
          rewards.push({ icon: "candle", t: "The rest still does its quiet work: nerves calmed", color: "#8fc06f" });
          maybeLiftMind(patch, cs, rewards);
        }
        note = "It half-works anyway. The body takes what it needs, even from a bad hour.";
      } else {
        const cs = bumpStress(patch, -1);
        rewards.push({ icon: "candle", t: "The drink still does its quiet duty: nerves calmed", color: "#8fc06f" });
        maybeLiftMind(patch, cs, rewards);
        note = "It half-works anyway. The harbor hums on without you, and that is its own medicine.";
      }
      if (!ctx.followup && !ctx.press && card.fail) {
        const ci = Math.max(0, card.choices.indexOf(choice));
        const child = card.fail[Math.min(ci, card.fail.length - 1)];
        if (child) followup = { card: child, action, ctx: { ...ctx, followup: true } };
      }
      addDeed(patch, `${action.name}: it half-worked.`);
    } else if (!verdict.success) {
      let dStress = ctx.followup ? 1 : ctx.press || verdict.fumble || choice.t === "b" ? 2 : 1;
      if (equippedFx(profile).has("calm") && dStress > 1) { dStress -= 1; flags.calmed = true; }
      const ns = bumpStress(patch, dStress);
      rewards.push({ icon: "candle", t: "Stress rises: the strain shows", color: J.waxBright });
      note = ctx.press
        ? "The extra prize slips away. What you took first is still yours."
        : ctx.followup
          ? "The salvage slips too. Some nights the harbor keeps everything."
          : FAIL_LINES[Math.floor(Math.random() * FAIL_LINES.length)];
      const fumbleBlood = verdict.fumble && (choice.t === "u" || choice.t === "b");
      woundMaybe(patch, rewards, ctx.followup ? (verdict.fumble ? 1 : choice.t === "b" ? 0.25 : 0) : fumbleBlood ? 1 : ctx.press ? CH.PRESS_INJURY : 0);
      maybeBreak(patch, ns, rewards);
      if (!ctx.followup && !ctx.press && card.fail) {
        const ci = Math.max(0, card.choices.indexOf(choice));
        const child = card.fail[Math.min(ci, card.fail.length - 1)];
        if (child) followup = { card: child, action, ctx: { ...ctx, followup: true } };
      }
      addDeed(patch, ctx.press ? `${action.name}: reached for more, and paid.` : `${action.name}: it went poorly.`);
    } else {
      const out = { ...(choice.out || {}) };
      if (ctx.press) for (const k of ["rumor", "finding", "ease", "heal", "pursuit"]) if (out[k]) out[k] *= 2;
      if (mind?.id === "hollowed" && out.ease) out.ease = Math.ceil(out.ease / 2);
      if (equippedFx(profile).has("resttwice") && out.ease) { out.ease *= 2; flags.easeDoubled = true; }
      const rng = mulberry(hash32(`${myKey}${Date.now()}`));
      if (out.rumor) {
        const fresh = [];
        for (let i = 0; i < out.rumor; i++) {
          const r = makeRumor(rng, ctx.loc || null);
          fresh.push({ ...r, by: profile.name, ts: Date.now() });
        }
        patch[`downtime.rumors`] = [...fresh, ...(dt.rumors || [])].slice(0, CH.RUMOR_CAP);
        rewards.push({ icon: "scroll", t: out.rumor > 1 ? `+${out.rumor} rumors to the pool` : "+1 rumor to the pool", color: J.parchment });
      }
      if (out.finding) {
        for (let i = 0; i < out.finding; i++) {
          const f = randomFinding(rng);
          rewards.push({ icon: "shard", t: `Lore find, shared to the Log (${f.set}): ${f.t}`, color: f.color, big: true });
          addLog(patch, `${profile.name} uncovered (${f.set}): ${f.t}`);
        }
      }
      if (out.heal && !activeInjuries(profile).length) { out.ease = (out.ease || 0) + out.heal; out.heal = 0; }
      let curStress = null;
      if (out.ease) {
        curStress = bumpStress(patch, -out.ease);
        rewards.push({ icon: "candle", t: out.ease > 1 ? "Nerves calmed greatly" : "Nerves calmed", color: "#8fc06f" });
      }
      if (out.heal) {
        const inj = activeInjuries(profile);
        if (inj.length) {
          const sorted = [...inj].sort((a, b) => a.until - b.until);
          const closing = sorted.slice(0, out.heal);
          patch[`downtime.profiles.${myKey}.injuries`] = sorted.slice(out.heal);
          closing.forEach((w) => rewards.push({ icon: "bandage", t: `A wound closes: ${w.name} is mended`, color: "#8fc06f" }));
        }
      }
      if (out.pursuit) {
        const p = profile.pursuit?.goal ? profile.pursuit : { goal: ctx.goal || "", notch: 0 };
        const notch = (p.notch || 0) + out.pursuit;
        if (notch >= CH.PURSUIT_GOAL) {
          patch[`downtime.profiles.${myKey}.pursuit`] = { goal: p.goal, notch: 0 };
          patch[`downtime.clues`] = [{ id: `c${Date.now()}`, t: `BREAKTHROUGH · ${profile.name}'s pursuit: "${p.goal}" reaches a turning point.`, loc: null, faction: null, by: profile.name, ts: Date.now(), used: false }, ...(dt.clues || [])].slice(0, CH.CLUE_CAP);
          addLog(patch, `${profile.name}'s private pursuit reaches a turning point.`);
          rewards.push({ icon: "compass", t: "BREAKTHROUGH. The DM has been notified at the docket.", color: J.brassBright, big: true });
        } else {
          patch[`downtime.profiles.${myKey}.pursuit`] = { goal: p.goal, notch };
          rewards.push({ icon: "compass", t: "Goal progress +1", color: J.brassBright });
        }
      }
      if (verdict.crit) { curStress = bumpStress(patch, -1, curStress); rewards.push({ icon: "candle", t: "Flawless. Nerves calmed a little", color: "#8fc06f" }); }
      if (curStress !== null) maybeLiftMind(patch, curStress, rewards);
      addDeed(patch, ctx.press ? `${action.name}: pressed deeper, and it paid.` : `${action.name}: ${note}`);
    }
    consumeCharges(patch, itemsUsedFor({ kind: "ashore", press: !!ctx.press }, choice.t, flags, verdict, roll + totalMod - TIERS[choice.t].dc), rewards);

    let offer = null;
    if (verdict.success && !verdict.crit && !ctx.press && !ctx.followup && action.deck && Math.random() < CH.PRESS_CHANCE) {
      const { card: c2 } = drawCard(action, []);
      offer = { card: c2, action, ctx };
    }
    const voice = narrate(verdict, choice.t, !!ctx.press);
    if (verdict.crit) sagaMark(patch, "nat20"); else if (verdict.fumble) sagaMark(patch, "nat1");
    onPatch(patch);
    setFlow({ rolling: { roll, success: verdict.success, crit: verdict.crit, fumble: verdict.fumble, note, voice, rewards, title: action.name, offer, followup, dc: TIERS[choice.t].dc, mod: totalMod, tier: TIERS[choice.t].label } });
  };

  // ---- chase a rumor ------------------------------------------------------------
  const applyChase = (rumor, card, choice) => {
    if (availableRolls(profile) <= 0) { setFlow(null); return; }
    const roll = 1 + Math.floor(Math.random() * 20);
    const totalMod = mindMod() + conditionMod() + itemChoiceMod(profile, { kind: "chase" }, choice.t);
    const verdict = rollTier(roll, choice.t, totalMod);
    const patch = {};
    clearPassedMind(patch);
    spendAction(patch);
    patch[`downtime.profiles.${myKey}.deals.chase`] = ((profile.deals || {}).chase || 0) + 1;
    const rewards = [];
    let note;
    const rng = mulberry(hash32(`${rumor.id}${roll}`));
    const flags = { calmed: false, easeDoubled: false, haulSaved: false, boldUnlocked: choice.t === "b" && activeInjuries(profile).length > 0 };
    let followup = null;

    if (!verdict.success) {
      let dS = verdict.fumble ? 2 : 1;
      if (equippedFx(profile).has("calm") && dS > 1) { dS -= 1; flags.calmed = true; }
      const ns = bumpStress(patch, dS);
      rewards.push({ icon: "candle", t: "Stress rises: the strain shows", color: J.waxBright });
      note = "The thread frays in your hands. It is still out there.";
      woundMaybe(patch, rewards, verdict.fumble ? 1 : 0);
      maybeBreak(patch, ns, rewards);
      if (card.fail) {
        const ci = Math.max(0, card.choices.indexOf(choice));
        const child = card.fail[Math.min(ci, card.fail.length - 1)];
        if (child) followup = { card: child, action: ACTION_BY_ID.rumors, ctx: { followup: true, loc: rumor.loc } };
      }
      addDeed(patch, `Chased a rumor at ${NODES[rumor.loc].name}. It got away.`);
    } else {
      const dead = !verdict.crit && choice.t !== "b" && rng() < 0.25;
      const others = (dt.rumors || []).filter((r) => r.id !== rumor.id);
      patch[`downtime.rumors`] = others;
      if (dead) {
        note = CHASE_RESULTS.deadend[Math.floor(rng() * CHASE_RESULTS.deadend.length)];
        const ns2 = bumpStress(patch, -1);
        maybeLiftMind(patch, ns2, rewards);
        rewards.push({ icon: "scroll", t: "A false rumor put to rest. Nerves calmed", color: J.parchment });
        addDeed(patch, `Ran a rumor to ground at ${NODES[rumor.loc].name}: nothing beneath it.`);
      } else {
        const clue = { id: `c${Date.now()}`, t: `${rumor.t}`, loc: rumor.loc, faction: rumor.faction, by: profile.name, ts: Date.now(), used: false };
        patch[`downtime.clues`] = [clue, ...(dt.clues || [])].slice(0, CH.CLUE_CAP);
        note = CHASE_RESULTS.confirm[Math.floor(rng() * CHASE_RESULTS.confirm.length)];
        sagaMark(patch, "rumors");
        rewards.push({ icon: "seal", t: "CONFIRMED. Filed to the DM's docket for the group.", color: J.waxBright, big: true });
        addLog(patch, `${profile.name} confirmed a rumor at ${NODES[rumor.loc].name}.`);
        addDeed(patch, `Confirmed a rumor at ${NODES[rumor.loc].name}.`);
        if (verdict.crit) {
          const f = randomFinding(rng);
          rewards.push({ icon: "shard", t: `And beneath it, a lore find for the Log (${f.set}): ${f.t}`, color: f.color, big: true });
          addLog(patch, `${profile.name} uncovered (${f.set}): ${f.t}`);
        }
      }
    }
    consumeCharges(patch, itemsUsedFor({ kind: "chase" }, choice.t, flags, verdict, roll + totalMod - TIERS[choice.t].dc), rewards);
    const voice = narrate(verdict, choice.t);
    if (verdict.crit) sagaMark(patch, "nat20"); else if (verdict.fumble) sagaMark(patch, "nat1");
    onPatch(patch);
    setFlow({ rolling: { roll, success: verdict.success, crit: verdict.crit, fumble: verdict.fumble, note, voice, rewards, title: "Chase a Rumor", followup, dc: TIERS[choice.t].dc, mod: totalMod, tier: TIERS[choice.t].label } });
  };

  // ---- the delve ------------------------------------------------------------------
  const startChase = (r) => {
    const card = CHASE_DECK[hash32(`${myKey}|chase|${(profile.deals || {}).chase || 0}`) % CHASE_DECK.length];
    setFlow({ chase: { rumor: r, card: { ...card, p: card.p.replace("{loc}", NODES[r.loc].name) } } });
  };
  const enterRoom = () => {
    const d = dt.delve;
    if (!d || d.done || actions <= 0) return;
    const { card, depth } = roomNode(d);
    setFlow({ delveRoom: { card, depth, idx: d.idx, scout: d.peek === d.idx ? d.peekMode : null } });
  };
  const recon = (mode) => {
    const d = dt.delve;
    if (!d || d.done || actions <= 0 || d.peek === d.idx) { setFlow(null); return; }
    const patch = {};
    spendAction(patch);
    patch["downtime.delve"] = { ...d, peek: d.idx, peekMode: mode };
    addDeed(patch, `Scouted ${d.rooms[d.idx]} in ${d.name}.`);
    addLog(patch, mode === "fore"
      ? `${profile.name} scouted ${d.rooms[d.idx]}: the footing is marked. Everyone rolls +2 in this room.`
      : `${profile.name} scouted ${d.rooms[d.idx]}: the escape lines are charted. The haul cannot be lost in this room.`);
    onPatch(patch);
    setFlow(null);
  };
  const applyDelve = (roomInfo, choice) => {
    const d = dt.delve;
    if (!d || availableRolls(profile) <= 0) { setFlow(null); return; }
    const roll = 1 + Math.floor(Math.random() * 20);
    const scout = d.peek === roomInfo.idx ? d.peekMode : null;
    const totalMod = mindMod() + conditionMod() + lanternMod(roomInfo.depth) + (scout === "fore" ? 2 : 0)
      + itemChoiceMod(profile, { kind: "delve", depth: roomInfo.depth, dim: lanternMod(roomInfo.depth) < 0 }, choice.t);
    const verdict = rollTier(roll, choice.t, totalMod);
    const patch = {};
    clearPassedMind(patch);
    spendAction(patch);
    const rewards = [];
    let note = choice.note;
    const nd = JSON.parse(JSON.stringify(d));
    const rng = mulberry(hash32(`${d.id}${roll}${Date.now()}`));
    let delveLost = false;
    const flags = { calmed: false, easeDoubled: false, haulSaved: false, boldUnlocked: choice.t === "b" && activeInjuries(profile).length > 0 };

    if (!verdict.success) {
      let dS = verdict.fumble ? 2 : choice.t === "b" ? 2 : 1;
      if (equippedFx(profile).has("calm") && dS > 1) { dS -= 1; flags.calmed = true; }
      const ns = bumpStress(patch, dS);
      rewards.push({ icon: "candle", t: "Stress rises: the strain shows", color: J.waxBright });
      note = FAIL_LINES[Math.floor(Math.random() * FAIL_LINES.length)];
      woundMaybe(patch, rewards, verdict.fumble ? 1 : roomInfo.depth === "boss" ? 0.5 : 0.25);
      const fails = ((nd.scars || {})[roomInfo.idx] || 0) + 1;
      nd.scars = { ...(nd.scars || {}), [roomInfo.idx]: fails };
      const ci = Math.max(0, (roomInfo.card?.choices || []).indexOf(choice));
      nd.path = ((nd.path || "") + String(ci)).slice(0, 8);
      if (fails >= CH.ROOM_ATTEMPTS) {
        delveLost = true;
        rewards.push({ icon: "skull", t: `FIVE ATTEMPTS HAVE FAILED AT ${d.rooms[roomInfo.idx].toUpperCase()}. The delve is lost. The dark keeps everything unbanked.`, color: J.waxBright, big: true });
        addLog(patch, `The venture at ${d.name} ended at ${d.rooms[roomInfo.idx]}. Five attempts failed, and the dark kept everything unbanked.`);
        addDeed(patch, `${d.name}: the delve was lost at ${d.rooms[roomInfo.idx]}.`);
        patch["downtime.lastDelve"] = { name: d.name, ts: Date.now(), by: profile.name, done: false, failed: true };
      } else if (scout === "insure" || equippedFx(profile).has("potguard")) {
        if (scout !== "insure" && equippedFx(profile).has("potguard")) flags.haulSaved = true;
        rewards.push({ icon: "seal", t: scout === "insure" ? "The charted escape lines hold: the haul is untouched" : "The Warden's plate holds: the dark cannot touch the haul through you", color: "#8fc06f" });
        addLog(patch, `${profile.name} was turned back at ${d.rooms[roomInfo.idx]} in ${d.name}. The haul held.`);
      } else if (nd.pot.supplies > 0 || nd.pot.resolve > 0) {
        const lostS = nd.pot.supplies > 0 ? 1 : 0;
        const lostR = nd.pot.resolve > 0 ? 1 : 0;
        nd.pot.supplies -= lostS; nd.pot.resolve -= lostR;
        const bits = [lostS ? "1 Supply" : "", lostR ? "1 Resolve" : ""].filter(Boolean).join(" and ");
        rewards.push({ icon: "skull", t: `The dark bites the haul: ${bits} lost from the pot`, color: J.waxBright });
        addLog(patch, `${profile.name} faltered at ${d.rooms[roomInfo.idx]} in ${d.name}. The dark bit the haul.`);
      } else {
        addLog(patch, `${profile.name} was turned back at ${d.rooms[roomInfo.idx]} in ${d.name}.`);
      }
      maybeBreak(patch, ns, rewards);
      if (!delveLost) addDeed(patch, `${d.name}: the dark pushed back.`);
    } else {
      const out = { ...(choice.out || {}) };
      if (out.supplies) { nd.pot.supplies += out.supplies; rewards.push({ icon: "crate", t: `+${out.supplies} Supplies to the haul`, color: J.brassBright }); }
      if (out.resolve) { nd.pot.resolve += out.resolve; rewards.push({ icon: "gem", t: `+${out.resolve} Resolve to the haul`, color: J.brassBright }); }
      if (out.clue) { const c = sealedClue(rng, d.name); nd.pot.clues = [...(nd.pot.clues || []), c]; rewards.push({ icon: "seal", t: "+1 sealed clue to the haul, revealed when banked", color: J.parchment }); }
      if (out.finding) {
        for (let i = 0; i < out.finding; i++) {
          const f = randomFinding(rng);
          rewards.push({ icon: "shard", t: `A finding (${f.set}): ${f.t}`, color: f.color, big: true });
          addLog(patch, `${profile.name} uncovered (${f.set}): ${f.t}`);
        }
      }
      if (out.hit) {
        const hitN = (out.hit || 1) + (verdict.crit ? 1 : 0);
        nd.boss.hits = Math.min(nd.boss.hp, (nd.boss.hits || 0) + hitN);
        nd.path = "";
        rewards.push({ icon: "skull", t: `${hitN >= 3 ? "Three blows land" : hitN === 2 ? "Two blows land" : "A blow lands"} on ${nd.boss.name} (${nd.boss.hits}/${nd.boss.hp})`, color: J.waxBright, big: true });
        addLog(patch, `${profile.name} struck ${nd.boss.name} (${nd.boss.hits}/${nd.boss.hp}).`);
        if (nd.boss.hits >= nd.boss.hp) {
          nd.done = true;
          sagaMark(patch, "bosses");
          nd.pot.resolve += BOSS_SPOILS.resolve;
          nd.pot.boons = (nd.pot.boons || 0) + BOSS_SPOILS.boons;
          nd.pot.rep = (nd.pot.rep || 0) + BOSS_SPOILS.rep;
          rewards.push({ icon: "skull", t: `${nd.boss.name} FALLS. Spoils join the haul: +${BOSS_SPOILS.resolve} Resolve, +1 Boon, +1 ${FACTIONS[d.faction].label} reputation`, color: J.brassBright, big: true });
          addLog(patch, `${nd.boss.name} has fallen in ${d.name}. The way home is open.`);
        }
        if (nd.done) dropTrinket(patch, rewards, rng, d.tid);
      } else {
        if (rng() < CH.ITEM_DROP) dropTrinket(patch, rewards, rng);
        nd.path = "";
        nd.idx = Math.min(d.len - 1, nd.idx + 1);
        sagaMark(patch, "rooms");
        rewards.push({ icon: "door", t: `${d.rooms[roomInfo.idx]} cleared. ${nd.idx > roomInfo.idx && depthOf(nd.idx, d.len) !== depthOf(roomInfo.idx, d.len) ? "The lantern dims ahead." : "The way deepens."}`, color: J.parchment });
        addLog(patch, `${profile.name} cleared ${d.rooms[roomInfo.idx]} in ${d.name}.`);
      }
      if (verdict.crit && !out.hit) { const ns2 = bumpStress(patch, -1); maybeLiftMind(patch, ns2, rewards); rewards.push({ icon: "candle", t: "Flawless. Nerves calmed a little", color: "#8fc06f" }); }
      addDeed(patch, `${d.name}: ${out.hit ? `struck ${d.boss.name}.` : `cleared ${d.rooms[roomInfo.idx]}.`}`);
    }
    patch["downtime.delve"] = delveLost ? null : nd;
    consumeCharges(patch, itemsUsedFor({ kind: "delve", depth: roomInfo.depth, dim: lanternMod(roomInfo.depth) < 0 }, choice.t, flags, verdict, roll + totalMod - TIERS[choice.t].dc), rewards);
    const voice = narrate(verdict, choice.t);
    if (verdict.crit) sagaMark(patch, "nat20"); else if (verdict.fumble) sagaMark(patch, "nat1");
    onPatch(patch);
    setFlow({ rolling: { roll, success: verdict.success, crit: verdict.crit, fumble: verdict.fumble, note, voice, rewards, title: d.rooms[roomInfo.idx], dc: TIERS[choice.t].dc, mod: totalMod, tier: TIERS[choice.t].label } });
  };
  const bankDelve = () => {
    const d = dt.delve;
    if (!d) return;
    const p = d.pot || {};
    const patch = {};
    if (p.supplies) patch["supplies"] = increment(p.supplies);
    if (p.resolve) patch["resolve"] = increment(p.resolve);
    if (p.rep) patch[`rep.${d.faction}`] = increment(p.rep);
    if (p.boons) patch["downtime.boons"] = increment(p.boons);
    (p.clues || []).forEach((c, i) => {
      patch["downtime.clues"] = [{ id: `c${Date.now()}${i}`, t: c.t, loc: c.loc, faction: d.faction, by: profile.name, ts: Date.now(), used: false }, ...(patch["downtime.clues"] || dt.clues || [])].slice(0, CH.CLUE_CAP);
    });
    const bits = [];
    if (p.supplies) bits.push(`+${p.supplies} Supplies`);
    if (p.resolve) bits.push(`+${p.resolve} Resolve`);
    if (p.rep) bits.push(`+${p.rep} ${FACTIONS[d.faction].label} reputation`);
    if (p.boons) bits.push(`+${p.boons} Boon${p.boons > 1 ? "s" : ""}`);
    if ((p.clues || []).length) bits.push(`${p.clues.length} sealed find${p.clues.length > 1 ? "s" : ""}`);
    addLog(patch, `${profile.name} banked the haul from ${d.name}${d.done ? ", boss and all" : ""}: ${bits.join(", ") || "nothing but their lives"}.`);
    addDeed(patch, `Carried the haul home from ${d.name}.`);
    patch["downtime.lastDelve"] = { name: d.name, ts: Date.now(), by: profile.name, done: !!d.done };
    patch["downtime.delve"] = null;
    onPatch(patch);
  };

  // ---- the crafting bench -------------------------------------------------------
  const unlockTool = (toolId) => {
    if (spectator) return;
    const patch = {};
    patch[`downtime.profiles.${myKey}.tools.${toolId}`] = true;
    addLog(patch, `${profile.name} unlocks ${CRAFT_TOOLS[toolId].name}.`);
    onPatch(patch);
  };
  // Proficiency bonus: when on for a tool, every craft in that category yields
  // two of the item instead of one. Per player, per tool; a sheet fact, not an
  // event, so it is not logged on toggle.
  const toggleBonus = (toolId) => {
    if (spectator) return;
    const on = !((profile.profBonus || {})[toolId]);
    onPatch({ [`downtime.profiles.${myKey}.profBonus.${toolId}`]: on });
  };
  const craftStart = (r) => {
    if (spectator || profile.craft) return;
    const wk = craftWeekKey();
    const cw = dt.craftWeek || {};
    const used = cw.wk === wk ? (cw.used || {}) : {};
    if (used[r.id]) return;
    if (availableRolls(profile) < r.candles || supplies < r.supplies) return;
    if (!(profile.tools || {})[r.tool]) return;
    if (craftRankIdx((profile.craftXp || {})[r.tool]) < r.rank) return;
    const patch = {};
    spendN(patch, r.candles);
    if (r.supplies > 0) patch["supplies"] = increment(-r.supplies);
    const now = Date.now();
    patch[`downtime.profiles.${myKey}.craft`] = {
      recipeId: r.id, name: r.out, tool: r.tool, rank: r.rank, icon: r.icon, supplies: r.supplies, xp: r.xp, rarity: r.rarity,
      bonus: !!(profile.profBonus || {})[r.tool],
      startTs: now, doneTs: now + r.days * 86400000,
    };
    patch["downtime.craftWeek"] = { wk, used: { ...used, [r.id]: profile.name } };
    addLog(patch, `${profile.name} begins crafting ${r.out} (${r.days} day${r.days === 1 ? "" : "s"}).`);
    onPatch(patch);
  };
  const craftCollect = () => {
    const c = profile.craft;
    if (spectator || !c || Date.now() < c.doneTs) return;
    const patch = {};
    const mk = () => ({ id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`, name: c.name, by: profile.name, tool: c.tool, icon: c.icon || RECIPE_BY_ID[c.recipeId]?.icon || "crate", rarity: c.rarity || RECIPE_BY_ID[c.recipeId]?.rarity || "common", ts: Date.now() });
    const made = c.bonus ? [mk(), mk()] : [mk()];
    patch["downtime.inventory"] = [...made, ...(dt.inventory || [])].slice(0, 80);
    const prev = (profile.craftXp || {})[c.tool] || 0;
    const gain = c.xp ?? ((c.rank ?? 0) + 1);
    const next = Math.min(CRAFT_XP_MAX, prev + gain);
    patch[`downtime.profiles.${myKey}.craftXp.${c.tool}`] = next;
    patch[`downtime.profiles.${myKey}.craft`] = null;
    sagaMark(patch, "crafted");
    addDeed(patch, `Crafted ${c.name}.`);
    addLog(patch, c.bonus ? `${profile.name} finishes crafting ${c.name}, and proficiency yields two. Added to the inventory.` : `${profile.name} finishes crafting ${c.name}. Added to the inventory.`);
    if (craftRankIdx(next) > craftRankIdx(prev)) {
      addLog(patch, `${profile.name} is now a ${craftRankName(next)} of ${CRAFT_TOOLS[c.tool].name}.`);
    }
    onPatch(patch);
  };
  const craftAbandon = () => {
    const c = profile.craft;
    if (spectator || !c) return;
    const patch = {};
    const refund = c.supplies ?? RECIPE_BY_ID[c.recipeId]?.supplies ?? 0;
    if (refund > 0) patch["supplies"] = increment(refund);
    patch[`downtime.profiles.${myKey}.craft`] = null;
    addLog(patch, `${profile.name} abandons the ${c.name}. Supplies refunded; candles are not.`);
    onPatch(patch);
  };

  // ---- flow starters ----------------------------------------------------------
  const begin = (action) => {
    if (spectator || actions <= 0) return;
    const mind = mindOf(profile);
    if (mind?.id === "wary" && (action.id === "tavern" || action.id === "gather")) { setFlow({ mindBlock: mind }); return; }
    if (action.needsRumor) { setFlow({ pickRumor: true }); return; }
    if (action.needsGoal && !(profile.pursuit?.goal)) { setFlow({ setGoal: action }); return; }
    const { card } = drawCard(action, [], hash32(`${myKey}|${action.id}|${(profile.deals || {})[action.id] || 0}`));
    setFlow({ card, action, ctx: {} });
  };

  return (
    <>
      <CSS />
      {(() => {
        const tabs = [
          { id: "ledger", label: "LEDGER", show: true },
          { id: "delve", label: "DELVE", show: true },
          { id: "inv", label: "PARTY INVENTORY", show: true },
          { id: "char", label: "CHARACTER", show: !spectator },
          { id: "board", label: "LEADERBOARD", show: true },
          { id: "log", label: "LOG", show: true },
          { id: "docket", label: "DOCKET", show: isDM },
        ].filter((t) => t.show);
        const go = (id) => { setFlow(null); setView(id); setNavOpen(false); };
        if (isMobile) {
          const cur = tabs.find((t) => t.id === view);
          return (
            <div style={{ position: "relative", padding: "10px 24px 10px", borderBottom: `1px solid ${J.brass}22` }}>
              <button onClick={() => setNavOpen((o) => !o)} className="disp" style={{
                width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                background: `${J.brass}1a`, border: `1px solid ${J.brass}66`, borderRadius: 7, padding: "11px 14px",
                color: J.brassBright, cursor: "pointer", fontSize: 15, letterSpacing: "0.12em",
              }}>
                <span>{cur ? cur.label : "MENU"}</span>
                <span style={{ fontSize: 12, transform: navOpen ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}>▾</span>
              </button>
              {navOpen && (
                <div style={{ position: "absolute", top: "calc(100% - 2px)", left: 24, right: 24, zIndex: 30, display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 8, background: "rgba(18,10,5,0.98)", border: `1px solid ${J.brass}66`, boxShadow: "0 14px 44px rgba(0,0,0,0.6)" }}>
                  {tabs.map((t) => (
                    <button key={t.id} onClick={() => go(t.id)} className="disp" style={{
                      background: view === t.id ? `${J.brass}26` : "transparent",
                      color: view === t.id ? J.brassBright : PALETTE.parchDim,
                      border: `1px solid ${J.brass}${view === t.id ? "88" : "33"}`,
                      borderRadius: 6, padding: "11px 14px", cursor: "pointer", fontSize: 14, letterSpacing: "0.1em", textAlign: "left",
                    }}>{t.label}</button>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "10px 24px 0", borderBottom: `1px solid ${J.brass}22` }}>
            {tabs.map((t) => (
              <JTab key={t.id} on={view === t.id} onClick={() => go(t.id)}>{t.label}</JTab>
            ))}
          </div>
        );
      })()}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
        {flow?.rolling ? (
          <Rolling res={flow.rolling} onDone={() => setFlow({ result: flow.rolling })} />
        ) : flow?.result ? (
          <Result res={flow.result} onDone={() => setFlow(null)}
            onPress={(offer) => setFlow({ card: offer.card, action: offer.action, ctx: { ...offer.ctx, press: true } })}
            onFollow={(f) => setFlow({ card: f.card, action: f.action, ctx: f.ctx })} />
        ) : flow?.card ? (
          <EventCard action={flow.action} card={flow.card} ctx={flow.ctx} profile={profile}
            onChoose={(choice) => applyOutcome(flow.action, flow.card, choice, flow.ctx)} onBack={() => setFlow(null)} />
        ) : flow?.chase ? (
          <EventCard action={ACTION_BY_ID.rumors} card={flow.chase.card} ctx={{ loc: flow.chase.rumor.loc }} profile={profile} rumor={flow.chase.rumor}
            onChoose={(choice) => applyChase(flow.chase.rumor, flow.chase.card, choice)} onBack={() => setFlow(null)} />
        ) : flow?.delveRoom ? (
          <EventCard delve={dt.delve} roomInfo={flow.delveRoom} card={flow.delveRoom.card} ctx={{}} profile={profile}
            onChoose={(choice) => applyDelve(flow.delveRoom, choice)} onBack={() => setFlow(null)} />
        ) : flow?.pickRumor ? (
          <PickRumor dt={dt} onPick={startChase} onBack={() => setFlow(null)} />
        ) : flow?.setGoal ? (
          <SetGoal onSave={(goal) => {
            onPatch({ [`downtime.profiles.${myKey}.pursuit`]: { goal, notch: 0 } });
            const { card } = drawCard(flow.setGoal, [], hash32(`${myKey}|${flow.setGoal.id}|${(profile.deals || {})[flow.setGoal.id] || 0}`));
            setFlow({ card, action: flow.setGoal, ctx: { goal } });
          }} onBack={() => setFlow(null)} />
        ) : flow?.scoutPick ? (
          <Parch>
            <div className="disp" style={{ fontSize: 19, color: J.inkDark, letterSpacing: "0.08em" }}>SCOUT {dt.delve ? dt.delve.rooms[dt.delve.idx].toUpperCase() : "AHEAD"}</div>
            <div style={{ fontSize: 14.5, color: J.inkSoft, margin: "6px 0 12px", lineHeight: 1.5 }}>
              One candle. The room is revealed either way; how you scout it is the choice. It lasts until this room is cleared, for everyone.
            </div>
            <button onClick={() => recon("fore")} style={rumorBtn}>
              <div className="disp" style={{ fontSize: 15, color: J.inkDark, letterSpacing: "0.08em" }}>MARK THE FOOTING</div>
              <div style={{ fontSize: 14, color: J.inkSoft, marginTop: 3 }}>Everyone rolls +2 in this room. Better odds, but failure still feeds the dark down deep.</div>
            </button>
            <button onClick={() => recon("insure")} style={rumorBtn}>
              <div className="disp" style={{ fontSize: 15, color: J.inkDark, letterSpacing: "0.08em" }}>CHART THE ESCAPE LINES</div>
              <div style={{ fontSize: 14, color: J.inkSoft, marginTop: 3 }}>Failing this room cannot cost the haul. The odds stay as they are.</div>
            </button>
            <BackBtn onClick={() => setFlow(null)} />
          </Parch>
        ) : flow?.mindBlock ? (
          <Parch>
            <div className="disp" style={{ fontSize: 18, color: J.wax, letterSpacing: "0.1em" }}>{flow.mindBlock.name.toUpperCase()}</div>
            <div style={{ fontSize: 17, color: J.inkDark, lineHeight: 1.6, marginTop: 8 }}>
              {flow.mindBlock.line} {flow.mindBlock.effect} It will pass as your nerves settle.
            </div>
            <BackBtn onClick={() => setFlow(null)} />
          </Parch>
        ) : flow?.craft && !spectator ? (
          <CraftBench profile={profile} dt={dt} supplies={supplies} actions={actions}
            onStart={craftStart} onCollect={craftCollect} onAbandon={craftAbandon}
            onUnlockTool={unlockTool} onToggleBonus={toggleBonus} onBack={() => setFlow(null)} />
        ) : view === "ledger" ? (
          <Ledger profile={profile} dt={dt} spectator={spectator} actions={actions} onBegin={begin} onChaseRumor={(r) => actions > 0 && startChase(r)}
            onCraft={() => setFlow({ craft: true })} />
        ) : view === "delve" ? (
          <DelveView dt={dt} profile={profile} spectator={spectator} actions={actions}
            onEnter={enterRoom} onRecon={() => setFlow({ scoutPick: true })} onBank={bankDelve} isDM={isDM} />
        ) : view === "inv" ? (
          <InventoryView dt={dt} isDM={isDM} onPatch={onPatch} profile={profile} />
        ) : view === "char" && !spectator ? (
          <CharacterView profile={profile} myKey={myKey} actions={actions} onPatch={onPatch} />
        ) : view === "board" ? (
          <LeaderboardView dt={dt} />
        ) : view === "log" ? (
          <LogView dt={dt} profile={profile} spectator={spectator} />
        ) : (
          <Docket dt={dt} onPatch={onPatch} />
        )}
      </div>
    </>
  );
}

// =============================================================================
// THE LEDGER: condition, undertakings, this week, and the rumor pool
// =============================================================================
function Ledger({ profile, dt, spectator, actions, onBegin, onChaseRumor, onCraft }) {
  const fresh = (dt.rumors || []).filter((r) => r.status === "fresh");
  if (spectator) return (
    <div>
      <PartyRow dt={dt} />
      <Art src="/downtime/tidings.jpg" h={230} style={{ border: `1px solid ${J.brass}44` }} />
      <div style={{ fontSize: 17, color: PALETTE.parchDim, fontStyle: "italic" }}>
        The Ledger belongs to the wanderers. Your pages are Docket, Delve, and Log.
      </div>
    </div>
  );
  return (
    <div>
      <div className="disp" style={secTitle}>UNDERTAKINGS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 9 }}>
        {ACTIONS.map((a) => (
          <button key={a.id} onClick={() => onBegin(a)} disabled={actions <= 0} className="ink-rise"
            style={{ ...actionCard, opacity: actions <= 0 ? 0.45 : 1, cursor: actions <= 0 ? "default" : "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Icon name={a.icon} size={25} color={J.brassBright} />
              <span className="disp" style={{ fontSize: 15.5, color: J.parchment, letterSpacing: "0.05em" }}>{a.name}</span>
            </div>
            <div style={{ fontSize: 13, color: PALETTE.parchDim, lineHeight: 1.4, marginTop: 5 }}>{a.blurb}</div>
          </button>
        ))}
        <button onClick={onCraft} className="ink-rise" style={{ ...actionCard, cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="anvil" size={25} color={J.brassBright} />
            <span className="disp" style={{ fontSize: 15.5, color: J.parchment, letterSpacing: "0.05em" }}>Crafting</span>
          </div>
          <div style={{ fontSize: 13, color: PALETTE.parchDim, lineHeight: 1.4, marginTop: 5 }}>Craft gear from recipes with your own tools. Costs candles and Supplies, takes real days. Items go to the party inventory.</div>
        </button>
      </div>
      <Head title="RUMOR POOL" hint={fresh.length ? `${fresh.length} fresh · tap one to chase it` : "the pool is dry"} />
      {fresh.length ? fresh.map((r) => {
        const fid = faceIdFor(r.by);
        return (
          <button key={r.id} onClick={() => onChaseRumor(r)} disabled={actions <= 0}
            style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "left", padding: "7px 10px", marginBottom: 5, borderRadius: 7, background: "rgba(8,16,18,0.4)", border: `1px solid ${J.brass}1a`, cursor: actions > 0 ? "pointer" : "default", fontFamily: "inherit", opacity: actions > 0 ? 1 : 0.6 }}>
            {fid ? <Face id={fid} size={30} /> : <Icon name="scroll" size={22} color={J.brass} />}
            <span style={{ flex: 1, fontSize: 14.5, color: PALETTE.parch, lineHeight: 1.4 }}>
              {r.t} <span style={{ color: PALETTE.parchDim, fontSize: 12.5 }}>· heard by {r.by}</span>
            </span>
            <span className="disp" style={{ fontSize: 12, color: FACTIONS[r.faction]?.color || PALETTE.parchDim, whiteSpace: "nowrap" }}>{NODES[r.loc].name}</span>
          </button>
        );
      }) : <Empty>Nothing on the wind. Walk the docks, gather word, or haunt a tavern.</Empty>}
    </div>
  );
}

export function ConditionStrip({ profile, spectator, actions }) {
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(iv); }, []);
  if (spectator) return (
    <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", minWidth: 0, fontSize: 16, color: PALETTE.parch, paddingRight: 4 }}>
      <b style={{ color: J.brassBright }}>★ Dungeon Master</b>
    </div>
  );
  const stress = stressNow(profile);
  const band = stressBand(stress);
  const mind = mindOf(profile);
  const inj = activeInjuries(profile);
  const last = profile.lastRefill ?? Date.now();
  const ms = DT.REGEN_MS - ((Date.now() - last) % DT.REGEN_MS);
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60000);
  return (
    <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, minWidth: 0, flexWrap: "wrap" }}>
      <div style={{ fontSize: 15.5, color: PALETTE.parch, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
        <b style={{ color: J.parchment }}>{profile.name}</b>
        <span style={{ color: FACTIONS[profile.faction].color }}> · {FACTIONS[profile.faction].label}</span>
        {mind ? (
          <span title={`${mind.line} ${mind.effect}`} style={{ color: mind.virtue ? "#8fc06f" : J.waxBright, fontStyle: "italic" }}> · {mind.name}</span>
        ) : (
          <span title={band.line} style={{ color: stress >= CH.STRESS_FRAY ? J.waxBright : PALETTE.parchDim }}> · {band.word}</span>
        )}
        {inj.length > 0 && <span title={`${inj.map((i) => i.name).join(", ")} · bold locked, -${inj.length} to every roll`} style={{ color: J.waxBright, fontSize: 13.5 }}> · ✚{inj.length}</span>}
        <span title={`Stress ${stress}/${CH.STRESS_MAX}: breaks at ${CH.STRESS_FRAY}+`} style={{ color: stress >= CH.STRESS_FRAY ? J.waxBright : PALETTE.parchDim, fontSize: 13.5 }}> · {stress}/{CH.STRESS_MAX}</span>
      </div>
      <div className="disp" title="Candles are your rolls: every undertaking or delve room costs one" style={{ fontSize: 15.5, color: actions > 0 ? J.brassBright : PALETTE.parchDim, whiteSpace: "nowrap" }}>
        {actions}/{CH.ACTIONS_PER_DAY} candles
        {actions < CH.ACTIONS_PER_DAY && <span style={{ fontSize: 12.5, color: PALETTE.parchDim }}> · next {h > 0 ? `${h}h ${m}m` : `${m}m`}</span>}
      </div>
    </div>
  );
}

// =============================================================================
// THE DELVE: corridor, lantern, pot, and the long walk home
// =============================================================================
function DelveView({ dt, profile, spectator, actions, onEnter, onRecon, onBank, isDM }) {
  const [confirmBank, setConfirmBank] = useState(false);
  const d = dt.delve;
  const partyRow = <PartyRow dt={dt} />;
  if (!d) return (
    <div>
      {partyRow}
      <div style={{ fontSize: 17, color: PALETTE.parchDim, fontStyle: "italic" }}>
        No venture is open. The Harbormaster charts the next.
      </div>
      {dt.lastDelve && (
        <div style={{ fontSize: 14, color: PALETTE.parchDim, marginTop: 10 }}>
          {dt.lastDelve.failed
            ? <>Last venture: <span style={{ color: J.waxBright }}>{dt.lastDelve.name}</span>, lost after five failed attempts. The dark kept the haul.</>
            : <>Last sealed: <span style={{ color: PALETTE.parch }}>{dt.lastDelve.name}</span>, banked by {dt.lastDelve.by}{dt.lastDelve.done ? ", boss and all" : ""}.</>}
        </div>
      )}
      {isDM && <div style={{ fontSize: 14, color: J.brass, marginTop: 10 }}>Open one from the Docket.</div>}
    </div>
  );
  const depth = depthOf(d.idx, d.len);
  const lantern = lanternFor(depth);
  const pot = d.pot || {};
  const potEmpty = !pot.supplies && !pot.resolve && !pot.boons && !pot.rep && !(pot.clues || []).length;
  const peeked = d.peek === d.idx && !d.done;
  const preview = peeked ? roomNode(d) : null;
  return (
    <div style={{ borderRadius: 10, padding: "14px 16px", margin: "-4px -6px 0",
      boxShadow: `inset 0 0 ${110 - lantern * 25}px rgba(0,0,0,${0.75 - lantern * 0.13})` }}>
      {partyRow}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="disp" style={{ fontSize: 21, color: J.brassBright, letterSpacing: "0.1em" }}>{d.name}</span>
        <span className="disp" style={{ fontSize: 13, color: FACTIONS[d.faction].color }}>{FACTIONS[d.faction].label}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }} title={`The lantern: ${DEPTH_LABEL[depth]}`}>
          {[0, 1, 2].map((i) => <Icon key={i} name="flame" size={17} color={i < lantern ? J.brassBright : "rgba(255,255,255,0.13)"} />)}
          <span className="disp" style={{ fontSize: 12, color: lantern <= 1 ? J.waxBright : PALETTE.parchDim, letterSpacing: "0.1em", marginLeft: 5 }}>{DEPTH_LABEL[depth].toUpperCase()}{lantern < 3 ? ` · ${lantern - 3} TO EVERY ROLL` : ""}</span>
        </span>
      </div>
      <div style={{ fontSize: 14, color: PALETTE.parchDim, fontStyle: "italic", margin: "4px 0 14px" }}>{DELVE_BY_ID[d.tid]?.blurb}</div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, overflowX: "auto", padding: "6px 2px 12px" }}>
        {d.rooms.map((name, i) => {
          const isBoss = i === d.len - 1;
          const cleared = d.done ? true : i < d.idx;
          const current = !d.done && i === d.idx;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ width: 96, textAlign: "center" }}>
                <div className={current ? "flicker" : ""} style={{
                  width: 40, height: 40, margin: "0 auto", borderRadius: isBoss ? 8 : "50%",
                  border: `2px solid ${current ? J.brassBright : cleared ? J.brass : "rgba(255,255,255,0.15)"}`,
                  background: cleared ? `${J.brass}33` : "rgba(0,0,0,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name={isBoss ? "skull" : "door"} size={20} color={current ? J.brassBright : cleared ? J.brass : "rgba(236,224,189,0.3)"} />
                </div>
                <div style={{ fontSize: 11, color: current ? J.parchment : PALETTE.parchDim, marginTop: 4, lineHeight: 1.25 }}>{name}</div>
                {(d.scars?.[i] || 0) > 0 && (
                  <div title={`turned back ${d.scars[i]} time${d.scars[i] > 1 ? "s" : ""}`}>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 2, marginTop: 2 }}>
                      {[...Array(Math.min(d.scars[i], 5))].map((_, m) => (
                        <span key={m} style={{ width: 2, height: 8, background: J.waxBright, transform: `rotate(${m % 2 ? 9 : -7}deg)`, display: "inline-block" }} />
                      ))}
                    </div>
                    <div className="disp" style={{ fontSize: 8.5, letterSpacing: "0.07em", marginTop: 1, color: d.scars[i] >= 4 ? J.waxBright : PALETTE.parchDim }}>
                      {Math.min(d.scars[i], 5)} OF 5 ATTEMPTS
                    </div>
                  </div>
                )}
                {isBoss && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 3 }}>
                    {[...Array(d.boss.hp)].map((_, h) => <Icon key={h} name="skull" size={11} color={h < (d.boss.hits || 0) ? J.waxBright : "rgba(255,255,255,0.18)"} />)}
                  </div>
                )}
                {isBoss && !d.done && (
                  <div className="disp" title="Slay the boss and these join the haul"
                    style={{ marginTop: 3, fontSize: 9, letterSpacing: "0.08em", color: J.brassBright, lineHeight: 1.5 }}>
                    BOON<br />REP · RESOLVE
                  </div>
                )}
              </div>
              {i < d.len - 1 && <div style={{ width: 26, height: 2, background: i < d.idx || d.done ? J.brass : "rgba(255,255,255,0.12)", marginTop: -28 }} />}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: "10px 13px", borderRadius: 8, background: "rgba(8,16,18,0.5)", border: `1px solid ${J.brass}33` }}>
        <span className="disp" style={{ fontSize: 13, color: J.brass, letterSpacing: "0.16em" }}>HAUL</span>
        <PotChip icon="crate" label="Supplies" v={pot.supplies} />
        <PotChip icon="gem" label="Resolve" v={pot.resolve} />
        {pot.rep > 0 && <PotChip icon="crest" label={`${FACTIONS[d.faction].label} rep`} v={pot.rep} color={FACTIONS[d.faction].color} />}
        {pot.boons > 0 && <PotChip icon="anchor" label="Boon" v={pot.boons} />}
        {(pot.clues || []).length > 0 && <PotChip icon="seal" label="Sealed finds" v={pot.clues.length} />}
        {potEmpty && <span style={{ fontSize: 13.5, color: PALETTE.parchDim, fontStyle: "italic" }}>empty hands, so far</span>}
        <span style={{ marginLeft: "auto" }}>
          {confirmBank ? (
            <>
              <button onClick={() => { setConfirmBank(false); onBank(); }} className="disp" style={{ ...waxBtn, padding: "7px 16px", fontSize: 13 }}>CARRY IT HOME</button>
              <button onClick={() => setConfirmBank(false)} className="disp" style={{ ...dmBtn, marginLeft: 6 }}>STAY</button>
            </>
          ) : (
            <button onClick={() => !spectator && !potEmpty && setConfirmBank(true)} disabled={spectator || potEmpty} className="disp"
              style={{ ...dmBtn, padding: "7px 16px", fontSize: 13, color: potEmpty ? PALETTE.parchDim : J.brassBright, borderColor: J.brass + (potEmpty ? "33" : "88"), opacity: spectator ? 0.5 : 1 }}>
              BANK THE HAUL{d.done ? " · CLAIM VICTORY" : ""}
            </button>
          )}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: PALETTE.parchDim, fontStyle: "italic", marginTop: 5 }}>
        The haul belongs to no one until someone carries it home. Banking ends the venture for everyone.
        {!d.done && (peeked && d.peekMode === "insure"
          ? <span style={{ color: "#8fc06f" }}> Escape lines are charted: the haul cannot be bitten in this room.</span>
          : <span style={{ color: J.waxBright }}> Every miss lets the dark bite the pot: 1 Supply and 1 Resolve.</span>)}
        {peeked && d.peekMode === "fore" && <span style={{ color: "#8fc06f" }}> The footing is marked: everyone rolls +2 in this room.</span>}
      </div>

      {!d.done ? (
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={onEnter} disabled={spectator || actions <= 0} className="disp"
            style={{ ...waxBtn, opacity: spectator || actions <= 0 ? 0.5 : 1 }}>
            ENTER {d.rooms[d.idx].toUpperCase()} · 1 CANDLE
          </button>
          <button onClick={onRecon} disabled={spectator || actions <= 0 || peeked} className="disp"
            style={{ ...dmBtn, padding: "10px 18px", fontSize: 13, color: peeked ? PALETTE.parchDim : J.brassBright, borderColor: J.brass + "66", opacity: spectator || actions <= 0 ? 0.5 : 1 }}>
            {peeked ? "SCOUTED" : "SCOUT AHEAD · 1 CANDLE"}
          </button>
        </div>
      ) : (
        <div className="disp" style={{ marginTop: 14, fontSize: 16, color: J.brassBright, letterSpacing: "0.1em" }}>
          THE WAY HOME IS OPEN. Bank the haul to seal the tale.
        </div>
      )}

      {preview && (
        <div className="ink-rise" style={{ marginTop: 14, padding: "12px 15px", borderRadius: 8, background: "rgba(236,224,189,0.07)", border: `1px dashed ${J.brass}55` }}>
          <div className="disp" style={{ fontSize: 12.5, color: J.brass, letterSpacing: "0.16em", marginBottom: 5 }}>SCOUTED · {d.peekMode === "fore" ? "FOOTING MARKED, +2 FOR EVERYONE" : "ESCAPE LINES CHARTED, HAUL SAFE"} · {d.rooms[d.idx].toUpperCase()}</div>
          <div style={{ fontSize: 15, color: PALETTE.parch, lineHeight: 1.5 }}>{preview.card.p}</div>
          <div style={{ fontSize: 13, color: PALETTE.parchDim, marginTop: 5 }}>
            {preview.card.choices.map((c) => `${TIERS[c.t].label}: ${c.label}`).join(" · ")}
          </div>
        </div>
      )}
      {d.done && <Art src={`/downtime/boss-${d.tid}.jpg`} h={200} style={{ marginTop: 14, border: `1px solid ${J.wax}66` }} />}
    </div>
  );
}
function PotChip({ icon, label, v, color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14.5, color: color || PALETTE.parch }}>
      <Icon name={icon} size={17} color={color || J.brassBright} />
      <b style={{ color: J.parchment }}>{v || 0}</b> {label}
    </span>
  );
}

// =============================================================================
// FLOWS
// =============================================================================
function PickRumor({ dt, onPick, onBack }) {
  const fresh = (dt.rumors || []).filter((r) => r.status === "fresh");
  return (
    <Parch>
      <div className="disp" style={{ fontSize: 19, color: J.inkDark, letterSpacing: "0.08em" }}>THE RUMOR POOL</div>
      <div style={{ fontSize: 14.5, color: J.inkSoft, margin: "4px 0 12px" }}>Pull a thread. Confirmed rumors are filed to the DM for Friday night.</div>
      {fresh.length ? fresh.map((r) => (
        <button key={r.id} onClick={() => onPick(r)} style={rumorBtn}>
          <div style={{ fontSize: 16, color: J.inkDark, lineHeight: 1.5 }}>{r.t}</div>
          <div style={{ fontSize: 12.5, color: J.inkSoft, marginTop: 4 }}>
            heard by {r.by} · <span style={{ color: FACTIONS[r.faction]?.color || J.inkSoft }}>{NODES[r.loc].name}</span>
          </div>
        </button>
      )) : <div style={{ fontSize: 16, color: J.inkSoft, fontStyle: "italic" }}>The pool is dry. Walk the docks or haunt a tavern and it will fill.</div>}
      <BackBtn onClick={onBack} />
    </Parch>
  );
}

function SetGoal({ onSave, onBack }) {
  const [g, setG] = useState("");
  return (
    <Parch>
      <div className="disp" style={{ fontSize: 19, color: J.inkDark, letterSpacing: "0.08em" }}>NAME YOUR PURSUIT</div>
      <div style={{ fontSize: 14.5, color: J.inkSoft, margin: "6px 0 10px", lineHeight: 1.5 }}>
        A private goal worked at between sessions: find your sister's ship, learn the deep-speech, earn back a name. The DM sees it, and breakthroughs reach the table.
      </div>
      <input value={g} onChange={(e) => setG(e.target.value)} maxLength={140} placeholder="I am trying to..."
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 5, border: `1px solid ${J.inkSoft}66`, background: "rgba(255,255,255,0.35)", color: J.inkDark, fontSize: 16, fontFamily: "inherit", outline: "none" }} />
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button onClick={() => g.trim() && onSave(g.trim())} className="disp" style={waxBtn}>SET IT DOWN</button>
        <button onClick={onBack} className="disp" style={{ ...waxBtn, background: "transparent", color: J.inkSoft, border: `1px solid ${J.inkSoft}55` }}>BACK</button>
      </div>
    </Parch>
  );
}

function EventCard({ action, card, ctx, profile, rumor, delve, roomInfo, onChoose, onBack }) {
  const inj = activeInjuries(profile);
  const mind = mindOf(profile);
  const isDelve = !!roomInfo;
  const depthPenalty = isDelve ? lanternMod(roomInfo.depth) : 0;
  const scout = isDelve ? roomInfo.scout : null;
  const itemCtx = isDelve ? { kind: "delve", depth: roomInfo.depth, dim: depthPenalty < 0 } : { kind: rumor ? "chase" : "ashore", press: !!ctx.press };
  const condPenalty = -inj.length + (stressNow(profile) >= 9 ? -1 : 0);
  const baseMod = (mind?.id === "wreckeyed" ? -1 : 0) + (mind?.id === "steadied" ? 1 : 0) + condPenalty + depthPenalty + (scout === "fore" ? 2 : 0) + (ctx.press ? CH.PRESS_MOD : 0);
  const fx = equippedFx(profile);
  const wornGear = (profile.equipped || []).map((id) => TRINKET_BY_ID[id]).filter(Boolean);
  const art = isDelve
    ? (roomInfo.depth === "boss" ? `/downtime/boss-${delve.tid}.jpg` : `/downtime/delve-${delve.tid}-${roomInfo.depth}.jpg`)
    : rumor ? "/downtime/card-chase.jpg" : `/downtime/card-${action.id}.jpg`;
  const title = isDelve ? delve.rooms[roomInfo.idx] : action.name;
  const iconName = isDelve ? (roomInfo.depth === "boss" ? "skull" : "flame") : action.icon;
  return (
    <Parch className="ink-rise">
      <Art src={art} h={260} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name={iconName} size={26} color={J.wax} />
        <span className="disp" style={{ fontSize: 18, color: J.inkDark, letterSpacing: "0.1em" }}>{title.toUpperCase()}</span>
        {isDelve && <span style={{ fontSize: 13.5, color: J.inkSoft }}>· {delve.name} · {DEPTH_LABEL[roomInfo.depth]}</span>}
        {ctx.loc && !isDelve && <span style={{ fontSize: 13.5, color: J.inkSoft }}>· {NODES[ctx.loc].name}</span>}
        {ctx.press && <span className="disp" style={{ marginLeft: "auto", fontSize: 13.5, color: J.wax, letterSpacing: "0.12em" }}>DEEPER WATER</span>}
      </div>
      {ctx.press && <div style={{ fontSize: 13.5, color: J.wax, fontStyle: "italic", marginTop: 6 }}>The odds are worse here. The prize is doubled. No candle spent.</div>}
      {ctx.followup && <div style={{ fontSize: 13.5, color: "#5d7a43", fontStyle: "italic", marginTop: 6 }}>A complication, free of candles: one chance to salvage something smaller. Failing again costs 1 stress and the thread.</div>}
      {inj.length > 0 && <div style={{ fontSize: 13.5, color: J.wax, fontStyle: "italic", marginTop: 6 }}>Your wound{inj.length > 1 ? "s weigh" : " weighs"} on you: -{inj.length} to every roll.</div>}
      {stressNow(profile) >= 9 && <div style={{ fontSize: 13.5, color: J.wax, fontStyle: "italic", marginTop: 6 }}>Haunted: -1 to every roll.</div>}
      {isDelve && depthPenalty < 0 && <div style={{ fontSize: 13.5, color: J.wax, fontStyle: "italic", marginTop: 6 }}>The lantern is low. Every choice is harder down here.</div>}
      {isDelve && scout !== "insure" && <div style={{ fontSize: 13.5, color: J.wax, fontStyle: "italic", marginTop: 6 }}>A miss costs stress, and the dark bites the haul: 1 Supply and 1 Resolve from the unbanked pot.</div>}
      {isDelve && <div style={{ fontSize: 13, color: J.inkSoft, fontStyle: "italic", marginTop: 6 }}>Attempt {Math.min((delve.scars?.[roomInfo.idx] || 0) + 1, CH.ROOM_ATTEMPTS)} of {CH.ROOM_ATTEMPTS}. Five failures in this room and the delve is lost with everything unbanked.</div>}
      {scout === "fore" && <div style={{ fontSize: 13.5, color: "#5d7a43", fontStyle: "italic", marginTop: 6 }}>Scouted: the footing is marked. +2 to every choice here.</div>}
      {scout === "insure" && <div style={{ fontSize: 13.5, color: "#5d7a43", fontStyle: "italic", marginTop: 6 }}>Scouted: escape lines charted. The haul cannot be lost in this room.</div>}
      {rumor && <div style={{ fontSize: 14.5, color: J.inkSoft, fontStyle: "italic", marginTop: 8, paddingLeft: 12, borderLeft: `2px solid ${J.wax}66` }}>{rumor.t}</div>}
      <p style={{ fontSize: 19, color: J.inkDark, lineHeight: 1.6, margin: "14px 0 16px" }}>{card.p}</p>
      {mind && <div style={{ fontSize: 13.5, color: mind.virtue ? "#5d7a43" : J.wax, fontStyle: "italic", marginBottom: 8 }}>({mind.line})</div>}
      {wornGear.length > 0 && <div style={{ fontSize: 13, color: "#6b5a8c", marginBottom: 8 }}>Worn: {wornGear.map((t) => `${t.name} (${t.fxText.toLowerCase()} · ${(profile.charges || {})[t.id] ?? 3} use${(((profile.charges || {})[t.id] ?? 3) > 1) ? "s" : ""} left)`).join(" · ")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {card.choices.map((c, i) => {
          const deadBold = c.t === "b" && inj.length > 0 && !fx.has("rootskin");
          const deadCareful = c.t === "c" && mind?.id === "tidemad";
          const dead = deadBold || deadCareful;
          const mod = baseMod + itemChoiceMod(profile, itemCtx, c.t);
          const pct = Math.max(5, Math.min(99, tierPct(c.t) + mod * 5));
          const tierColor = c.t === "c" ? "#5d7a43" : c.t === "s" ? "#8a6d2a" : c.t === "u" ? "#9c5a28" : J.wax;
          return (
            <button key={i} onClick={() => !dead && onChoose(c)} disabled={dead} style={{ ...choiceStrip, opacity: dead ? 0.45 : 1, cursor: dead ? "default" : "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 17 }}>{c.label}</span>
                <span style={{ whiteSpace: "nowrap" }}>
                  {c.out?.hit && <span className="disp" style={{ fontSize: 12.5, color: J.wax, letterSpacing: "0.1em", marginRight: 9 }}>{c.out.hit > 1 ? "2 HITS" : "1 HIT"}</span>}
                  <span className="disp" style={{ fontSize: 13.5, color: tierColor, letterSpacing: "0.1em" }}>{TIERS[c.t].label.toUpperCase()}</span>
                  <span style={{ fontSize: 11.5, color: J.inkSoft, marginLeft: 7 }}>{pct}%</span>
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 4, fontSize: 13, color: J.inkSoft }}>
                <span>
                  {outcomeHint(c)}
                  {isDelve && <span style={{ opacity: 0.72 }}> · a miss: {c.t === "b" ? 2 : 1} stress{scout !== "insure" ? ", the dark bites the pot" : ""}</span>}
                </span>
                {dead && <span style={{ fontStyle: "italic" }}>{deadBold ? "your wounds forbid it" : "it bores you to fury"}</span>}
              </div>
            </button>
          );
        })}
      </div>
      <BackBtn onClick={onBack} />
    </Parch>
  );
}
function outcomeHint(c) {
  if (c.hint) return c.hint;
  if (!c.out) return "Pull the thread and see.";
  const bits = [];
  if (c.out.rumor) bits.push(c.out.rumor > 1 ? `${c.out.rumor} rumors` : "a rumor");
  if (c.out.finding) bits.push(c.out.finding > 1 ? "lore finds" : "a lore find");
  if (c.out.supplies) bits.push(`+${c.out.supplies} Supplies to the haul`);
  if (c.out.resolve) bits.push(`+${c.out.resolve} Resolve to the haul`);
  if (c.out.clue) bits.push("a sealed clue");
  if (c.out.hit) bits.push(c.out.hit > 1 ? "two blows against the boss" : "one blow against the boss");
  if (c.out.ease) bits.push(c.out.ease > 1 ? `calm your nerves greatly (-${c.out.ease} stress)` : "calm your nerves (-1 stress)");
  if (c.out.heal) bits.push("close a wound (or calm, if unhurt)");
  if (c.out.scrap) bits.push("a scrap of color");
  if (c.out.pursuit) bits.push(c.out.pursuit > 1 ? `goal progress +${c.out.pursuit}` : "goal progress +1");
  if (c.out.ease) bits.push("calms nerves");
  if (c.out.heal) bits.push("heals a wound faster");
  if (c.out.scrap) bits.push("color, nothing more");
  return bits.length ? "May yield: " + bits.join(", ") : "Pull the thread and see.";
}

function Rolling({ res, onDone }) {
  const [face, setFace] = useState(1 + Math.floor(Math.random() * 20));
  const done = useRef(false);
  useEffect(() => {
    playDice();
    const iv = setInterval(() => setFace(1 + Math.floor(Math.random() * 20)), 80);
    const to = setTimeout(() => { if (!done.current) { done.current = true; onDone(); } }, DICE_MS);
    return () => { clearInterval(iv); clearTimeout(to); };
  }, []); // eslint-disable-line
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, minHeight: 320 }}>
      <div className="die rolling" style={{
        width: 86, height: 86,
        clipPath: "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)",
        background: `linear-gradient(145deg, ${J.brassBright}, ${J.brass})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: J.leather, fontSize: 34, fontWeight: 700, fontFamily: "'Cinzel', serif",
      }}>{face}</div>
      <div className="disp flicker" style={{ marginTop: 20, fontSize: 19, color: J.brassBright, letterSpacing: "0.12em" }}>
        The candle gutters as the die turns…
      </div>
    </div>
  );
}

function Result({ res, onDone, onPress, onFollow }) {
  const good = res.success;
  return (
    <Parch className="ink-rise" style={{ textAlign: "center" }}>
      <div className="disp die settle" style={{
        width: 64, height: 64, margin: "4px auto 0",
        clipPath: "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)",
        background: good ? `linear-gradient(145deg, ${J.brassBright}, ${J.brass})` : `linear-gradient(145deg, ${J.waxBright}, ${J.wax})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: good ? J.leather : J.parchment, fontSize: 28, fontWeight: 700,
      }}>{res.roll}</div>
      <div className="disp" style={{ fontSize: 16, color: good ? "#5d7a43" : J.wax, letterSpacing: "0.16em", marginTop: 12 }}>
        {res.crit ? "FLAWLESS" : res.fumble ? "CALAMITY" : good ? "IT HOLDS" : "IT SLIPS"}
      </div>
      {res.dc != null && (
        <div style={{ fontSize: 13.5, color: J.inkSoft, marginTop: 5, letterSpacing: "0.04em" }}>
          {res.crit ? "natural 20: success no matter the odds"
            : res.fumble ? "natural 1: failure no matter the odds"
            : <>d20 {res.roll}{res.mod ? ` ${res.mod > 0 ? "+" : "-"} ${Math.abs(res.mod)} = ${res.roll + res.mod}` : ""} against {res.dc} or better ({res.tier})</>}
        </div>
      )}
      <p style={{ fontSize: 19, color: J.inkDark, margin: "10px auto 4px", maxWidth: 620, lineHeight: 1.55 }}>{res.note}</p>
      {res.voice && <p style={{ fontSize: 15, color: J.inkSoft, fontStyle: "italic", margin: "0 auto", maxWidth: 560 }}>{res.voice}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, maxWidth: 640, margin: "14px auto 0" }}>
        {res.rewards.map((r, i) => (
          <div key={i} className="ink-rise" style={{
            display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left",
            padding: "9px 12px", borderRadius: 6, animationDelay: `${0.12 * i}s`,
            background: "rgba(43,36,24,0.07)", border: `1px solid ${J.inkSoft}33`,
          }}>
            <Icon name={r.icon} size={20} color={r.color === J.parchment ? J.inkSoft : r.color} />
            <span style={{ fontSize: r.big ? 15.5 : 14.5, color: J.inkDark, lineHeight: 1.45 }}>{r.t}</span>
          </div>
        ))}
      </div>
      {res.followup ? (
        <div style={{ maxWidth: 640, margin: "18px auto 0", padding: "13px 16px", border: `1px dashed #5d7a43`, borderRadius: 8, background: "rgba(93,122,67,0.08)", textAlign: "left" }}>
          <div style={{ fontSize: 16.5, color: J.inkDark, fontStyle: "italic" }}>...but the thread is not dead yet.</div>
          <div style={{ fontSize: 13.5, color: J.inkSoft, marginTop: 3 }}>A complication has opened: one free chance to salvage something smaller from the mess. Failing again costs 1 stress.</div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={() => onFollow(res.followup)} className="disp" style={waxBtn}>SEE IT THROUGH</button>
            <button onClick={onDone} className="disp" style={{ ...waxBtn, background: "transparent", color: J.inkSoft, border: `1px solid ${J.inkSoft}55` }}>LET IT GO</button>
          </div>
        </div>
      ) : res.offer ? (
        <div style={{ maxWidth: 640, margin: "18px auto 0", padding: "13px 16px", border: `1px dashed ${J.wax}77`, borderRadius: 8, background: "rgba(138,43,43,0.07)", textAlign: "left" }}>
          <div style={{ fontSize: 16.5, color: J.inkDark, fontStyle: "italic" }}>...but there is more here, if you have the nerve.</div>
          <div style={{ fontSize: 13.5, color: J.inkSoft, marginTop: 3 }}>Deeper water: every choice harder, every prize doubled. No candle spent. Fail, and the strain may draw blood.</div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={() => onPress(res.offer)} className="disp" style={waxBtn}>PRESS ON</button>
            <button onClick={onDone} className="disp" style={{ ...waxBtn, background: "transparent", color: J.inkSoft, border: `1px solid ${J.inkSoft}55` }}>TAKE IT AND GO</button>
          </div>
        </div>
      ) : (
        <button onClick={onDone} className="disp" style={{ ...waxBtn, marginTop: 18 }}>TURN THE PAGE</button>
      )}
    </Parch>
  );
}

// =============================================================================
// CHARACTER: your model, your condition, your satchel, your face
// =============================================================================
function CharacterView({ profile, myKey, actions, onPatch }) {
  const [pickFace, setPickFace] = useState(false);
  const stress = stressNow(profile);
  const band = stressBand(stress);
  const mind = mindOf(profile);
  const inj = activeInjuries(profile);
  const equipped = profile.equipped || [];
  const satchel = profile.items || [];
  const equip = (id) => {
    if (equipped.length >= CH.EQUIP_CAP) return;
    onPatch({
      [`downtime.profiles.${myKey}.equipped`]: [...equipped, id],
      [`downtime.profiles.${myKey}.items`]: satchel.filter((x) => x !== id),
    });
  };
  const stow = (id) => {
    onPatch({
      [`downtime.profiles.${myKey}.equipped`]: equipped.filter((x) => x !== id),
      [`downtime.profiles.${myKey}.items`]: [...satchel, id],
    });
  };
  const fit = !mind && !inj.length && stress === 0;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 22, alignItems: "start" }}>
        {/* LEFT: who you are */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <Bust pkey={myKey} p={profile} size={128} />
        <div style={{ flex: "1 1 180px" }}>
          <div className="disp" style={{ fontSize: 22, color: J.parchment, letterSpacing: "0.06em" }}>{profile.name}</div>
          <div style={{ fontSize: 15, color: FACTIONS[profile.faction].color }}>{FACTIONS[profile.faction].label}{profile.kind === "agent" ? " · sworn agent" : ""}</div>
          {profile.pursuit?.goal && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 14, color: PALETTE.parchDim }}>
              <Icon name="compass" size={16} color={J.brass} />
              <span style={{ fontStyle: "italic" }}>"{profile.pursuit.goal}"</span>
              <span style={{ display: "flex", gap: 4 }}>
                {[...Array(CH.PURSUIT_GOAL)].map((_, i) => (
                  <span key={i} style={{ width: 18, height: 6, borderRadius: 3, background: i < (profile.pursuit.notch || 0) ? J.brassBright : "rgba(0,0,0,0.4)", border: `1px solid ${J.brass}44`, display: "inline-block" }} />
                ))}
              </span>
            </div>
          )}
          <button onClick={() => setPickFace(!pickFace)} className="disp" style={{ ...dmBtn, marginTop: 12, padding: "6px 14px", fontSize: 12 }}>
            {pickFace ? "CLOSE" : "CHANGE PORTRAIT"}
          </button>
        </div>
        </div>
        {/* RIGHT: how you are holding up */}
        <div style={{ padding: "12px 16px 14px", borderRadius: 9, background: "rgba(8,16,18,0.45)", border: `1px solid ${J.brass}26` }}>
          <div style={{ display: "flex", alignItems: "baseline", borderBottom: `1px solid ${J.brass}22`, paddingBottom: 5 }}>
            <span className="disp" style={{ fontSize: 13, color: J.brass, letterSpacing: "0.2em" }}>CONDITION</span>
            <span className="disp" style={{ marginLeft: "auto", fontSize: 11.5, color: PALETTE.parchDim, letterSpacing: "0.04em" }}>stress · afflictions · wounds</span>
          </div>
          {fit && <div style={{ fontSize: 14, color: "#8fc06f", fontStyle: "italic", marginTop: 10 }}>Fit and steady. Nothing weighs on you.</div>}
          {/* STRESS: the meter, the band, and what it costs */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="disp" style={{ fontSize: 12.5, letterSpacing: "0.14em", color: PALETTE.parchDim }}>STRESS</span>
              <span className="disp" style={{ fontSize: 14, color: stress >= 9 ? J.waxBright : stress >= CH.STRESS_FRAY ? J.wax : "#8fc06f" }}>{stress}/{CH.STRESS_MAX}</span>
              <span style={{ fontSize: 13, color: stress >= CH.STRESS_FRAY ? J.waxBright : PALETTE.parchDim, fontStyle: "italic" }}>{band.word}</span>
            </div>
            <div style={{ display: "flex", gap: 3, marginTop: 5, borderRadius: 4, animation: stress >= 9 ? "hauntPulse 1.6s ease-in-out infinite" : "none" }} title={band.line}>
              {[...Array(CH.STRESS_MAX)].map((_, i) => (
                <span key={i} style={{ flex: 1, height: 10, maxWidth: 26, borderRadius: 2, display: "inline-block",
                  background: i < stress ? (i >= 8 ? J.waxBright : i >= CH.STRESS_FRAY - 1 ? J.wax : "#7a8c5a") : "rgba(0,0,0,0.45)",
                  border: `1px solid ${i >= CH.STRESS_FRAY - 1 ? J.wax : J.brass}44` }} />
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: PALETTE.parchDim, marginTop: 4 }}>
              {stress >= 9 ? <span style={{ color: J.waxBright }}>HAUNTED: -1 to every roll, and one shock from breaking. </span>
                : stress >= CH.STRESS_FRAY ? <span style={{ color: J.waxBright }}>In the break zone: any failure may give you an affliction. </span> : null}
              Reaches the break zone at {CH.STRESS_FRAY}. Tavern and Recover calm it; it also fades 1 per day.
            </div>
            <div style={{ fontSize: 13.5, color: PALETTE.parchDim, fontStyle: "italic", marginTop: 4 }}>{band.line}</div>
          </div>
          {/* AFFLICTION: name, flavor, and the mechanical bite */}
          {mind && (
            <div style={{ marginTop: 10, padding: "8px 11px", borderRadius: 6, background: mind.virtue ? "rgba(122,140,90,0.12)" : "rgba(138,43,43,0.12)", border: `1px solid ${mind.virtue ? "#8fc06f" : J.wax}55` }}>
              <div className="disp" style={{ fontSize: 13.5, letterSpacing: "0.1em", color: mind.virtue ? "#8fc06f" : J.waxBright }}>{mind.name.toUpperCase()}</div>
              <div style={{ fontSize: 13.5, color: PALETTE.parch, fontStyle: "italic", marginTop: 2 }}>{mind.line}</div>
              <div style={{ fontSize: 13.5, color: mind.virtue ? "#8fc06f" : J.waxBright, marginTop: 2 }}>{mind.effect} Lifts when stress falls to {CH.MIND_CLEAR_AT} or lower.</div>
            </div>
          )}
          {/* WOUNDS: each named, the shared penalty stated */}
          {inj.map((i, k) => {
            const days = Math.max(1, Math.ceil((i.until - Date.now()) / 86400000));
            return <div key={k} style={{ fontSize: 14, color: J.waxBright, marginTop: 4 }}>✚ {i.name} · {days} day{days > 1 ? "s" : ""} to heal (Recover can close it)</div>;
          })}
          {inj.length > 0 && (
            <div style={{ fontSize: 13, color: J.waxBright, marginTop: 3 }}>
              Wounded: bold choices locked, and every wound is -1 to every roll (-{inj.length} now).
            </div>
          )}
        </div>
      </div>
      {pickFace && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "rgba(8,16,18,0.45)", border: `1px solid ${J.brass}22` }}>
          {[...Array(16)].map((_, i) => {
            const n = String(i + 1).padStart(2, "0");
            const on = profile.portrait === n;
            return (
              <button key={n} onClick={() => { onPatch({ [`downtime.profiles.${myKey}.portrait`]: n }); setPickFace(false); }}
                style={{ width: 56, height: 68, padding: 0, borderRadius: 6, overflow: "hidden", cursor: "pointer", background: "#0d0a06", border: `2px solid ${on ? J.brassBright : J.brass + "44"}` }}>
                <PortraitThumb n={n} />
              </button>
            );
          })}
          <button onClick={() => { onPatch({ [`downtime.profiles.${myKey}.portrait`]: "" }); setPickFace(false); }}
            className="disp" style={{ ...dmBtn, alignSelf: "center" }}>NONE</button>
        </div>
      )}

      {/* THE SAGA: what this life has cost and counted */}
      <div style={{ display: "flex", gap: 30, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "0 0 auto" }}>
          <Head title="EQUIPPED" hint={`${equipped.length}/${CH.EQUIP_CAP} worn · 3 uses each`} />
          <div style={{ display: "flex", gap: 12 }}>
            {[...Array(CH.EQUIP_CAP)].map((_, i) => (
              <ItemSlot key={`e${i}`} id={equipped[i]} uses={(profile.charges || {})[equipped[i]] ?? 3}
                slotKind="HAND" actLabel="STOW" onAct={stow} sc={0.82} />
            ))}
          </div>
        </div>
        <div style={{ flex: "1 1 380px", minWidth: 0 }}>
          <Head title="SATCHEL" hint={`${satchel.length}/${CH.SATCHEL_CAP} carried · stowed trinkets keep their uses`} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[...Array(Math.max(CH.SATCHEL_CAP, satchel.length))].map((_, i) => (
              <ItemSlot key={`s${i}`} id={satchel[i]} uses={(profile.charges || {})[satchel[i]] ?? 3}
                slotKind="SLOT" actLabel="EQUIP" onAct={equip} actDisabled={equipped.length >= CH.EQUIP_CAP} sc={0.82} />
            ))}
          </div>
        </div>
      </div>
      <Head title="CRAFTING" hint="every finished craft feeds the bar for its tool" />
      <CraftSkills profile={profile} />
    </div>
  );
}
function ItemSlot({ id, uses, slotKind, actLabel, onAct, actDisabled, sc = 1 }) {
  const t = id ? TRINKET_BY_ID[id] : null;
  const W = Math.round(160 * sc), H = Math.round(186 * sc), ART = Math.round(64 * sc);
  if (!t) return (
    <div style={{ width: W, height: H, borderRadius: 9, border: `1.5px dashed ${J.brass}30`, background: "rgba(0,0,0,0.32)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7 }}>
      <Icon name="gem" size={Math.round(22 * sc)} color="rgba(236,224,189,0.12)" />
      <span className="disp" style={{ fontSize: 10, letterSpacing: "0.16em", color: "rgba(236,224,189,0.25)" }}>EMPTY {slotKind}</span>
    </div>
  );
  const low = uses === 1;
  return (
    <div title={`${t.line}${low ? " (one service left)" : ""}`} style={{ width: W, height: H, borderRadius: 9, padding: sc < 1 ? "7px 8px" : "9px 10px",
      display: "flex", flexDirection: "column", boxSizing: "border-box",
      background: "linear-gradient(160deg, rgba(26,22,34,0.85), rgba(8,10,14,0.9))",
      border: `1.5px solid ${t.rare ? J.brass + "99" : "#b9a8d655"}`,
      boxShadow: t.rare ? `0 0 16px ${J.brass}2a, inset 0 0 22px rgba(0,0,0,0.5)` : "inset 0 0 22px rgba(0,0,0,0.5)" }}>
      {/* art box: item-{id}.jpg in public/downtime/, gem icon beneath as fallback */}
      <div style={{ position: "relative", height: ART, borderRadius: 6, overflow: "hidden", background: "rgba(0,0,0,0.45)", border: `1px solid ${J.brass}26`, flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="gem" size={Math.round(26 * sc)} color={t.rare ? J.brassBright : "#b9a8d6"} />
        </div>
        <img src={`/downtime/item-${t.id}.jpg`} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <span style={{ position: "absolute", top: 4, right: 5, display: "inline-flex", gap: 3, padding: "3px 4px", borderRadius: 5, background: "rgba(8,10,14,0.72)" }}
          title={`${uses} use${uses > 1 ? "s" : ""} left, then it crumbles`}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block",
              background: i < uses ? (low ? J.waxBright : "#b9a8d6") : "rgba(0,0,0,0.55)", border: `1px solid ${J.brass}55` }} />
          ))}
        </span>
      </div>
      <div style={{ fontSize: Math.max(11.5, 13.5 * sc), lineHeight: 1.25, color: t.rare ? J.brassBright : PALETTE.parch, marginTop: 5, minHeight: Math.round(33 * sc) }}>{t.name}</div>
      <div style={{ fontSize: Math.max(10, 11.5 * sc), color: "#9b8ab8", lineHeight: 1.3, flex: 1 }}>{t.fxText}</div>
      <button onClick={() => !actDisabled && onAct(id)} disabled={actDisabled} className="disp"
        style={{ ...dmBtn, width: "100%", padding: sc < 1 ? "4px 0" : "5px 0", fontSize: Math.max(9.5, 11 * sc), marginTop: 5,
          color: actDisabled ? PALETTE.parchDim : J.brassBright, borderColor: J.brass + (actDisabled ? "33" : "66"), opacity: actDisabled ? 0.5 : 1 }}>
        {actDisabled ? "HANDS FULL" : actLabel}
      </button>
    </div>
  );
}
function PortraitThumb({ n }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <span className="disp" style={{ color: PALETTE.parchDim, fontSize: 14, lineHeight: "64px" }}>{n}</span>;
  return <img src={`/downtime/portrait-${n}.jpg`} alt="" onError={() => setOk(false)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
}

// =============================================================================
// THE LOG: one shared timeline
// =============================================================================
function LogView({ dt, profile, spectator }) {
  const entries = [
    ...(!spectator ? (profile.deeds || []).map((d) => ({ t: `You · ${d.t}`, ts: d.ts, mine: true })) : []),
    ...(dt.log || []).map((l) => ({ t: l.t, ts: l.ts })),
  ].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
  return (
    <div>
      <div style={{ fontSize: 14.5, color: PALETTE.parchDim, fontStyle: "italic", marginBottom: 12 }}>
        The drowned world keeps its receipts. Newest first.
      </div>
      {entries.length ? entries.map((e, i) => {
        const d = Math.floor((Date.now() - (e.ts || Date.now())) / 86400000);
        return (
          <div key={i} style={{ display: "flex", gap: 12, padding: "4px 0", alignItems: "baseline" }}>
            <span className="disp" style={{ minWidth: 58, fontSize: 12, color: PALETTE.parchDim, letterSpacing: "0.06em" }}>{d === 0 ? "TODAY" : `${d}D AGO`}</span>
            <span style={{ fontSize: 14.5, lineHeight: 1.45, color: e.mine ? J.parchment : PALETTE.parch }}>{e.t}</span>
          </div>
        );
      }) : <Empty>The page waits for ink.</Empty>}
    </div>
  );
}

// One wanderer's line on the Docket: status, the standing candle/stress/wound
// controls, the tools they carry (with a strip button), and their personal
// goal, which the DM can write, retitle, advance, pull back, or clear.
function WandererRow({ pkey: k, p, dt, onPatch }) {
  const stress = stressNow(p);
  const mind = mindOf(p);
  const inj = activeInjuries(p);
  const candles = availableRolls(p);
  const tools = p.tools || {};
  const xp = p.craftXp || {};
  const toolIds = Object.keys(CRAFT_TOOLS).filter((t) => tools[t] || (xp[t] || 0) > 0);
  const goal = p.pursuit?.goal || "";
  const notch = p.pursuit?.notch || 0;
  const [draft, setDraft] = useState(goal);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setDraft(p.pursuit?.goal || ""); }, [p.pursuit?.goal]);

  const grant = () => {
    const last = p.lastRefill ?? Date.now();
    const regen = Math.floor((Date.now() - last) / DT.REGEN_MS);
    onPatch({
      [`downtime.profiles.${k}.rolls`]: candles + 1,
      [`downtime.profiles.${k}.lastRefill`]: candles + 1 >= DT.MAX_FREE ? Date.now() : last + Math.max(0, regen) * DT.REGEN_MS,
    });
  };
  const removeTool = (tid) => {
    const nt = { ...tools }; delete nt[tid];
    const nx = { ...xp }; delete nx[tid];
    onPatch({
      [`downtime.profiles.${k}.tools`]: nt,
      [`downtime.profiles.${k}.craftXp`]: nx,
      "downtime.log": [{ t: `The DM strips ${CRAFT_TOOLS[tid].name} from ${p.name}.`, ts: Date.now() }, ...(dt.log || [])].slice(0, CH.LOG_CAP),
    });
  };
  const saveGoal = () => {
    const g = draft.trim();
    onPatch({ [`downtime.profiles.${k}.pursuit`]: g ? { goal: g, notch: Math.min(notch, CH.PURSUIT_GOAL) } : null });
    setEditing(false);
  };
  const setNotch = (n) => {
    if (!goal) return;
    onPatch({ [`downtime.profiles.${k}.pursuit`]: { goal, notch: Math.max(0, Math.min(CH.PURSUIT_GOAL, n)) } });
  };
  const clearGoal = () => { onPatch({ [`downtime.profiles.${k}.pursuit`]: null }); setEditing(false); };

  return (
    <div style={{ padding: "7px 12px", marginBottom: 5, borderRadius: 7, background: "rgba(8,16,18,0.4)", border: `1px solid ${J.brass}1a` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, color: PALETTE.parch }}>
          <b style={{ color: J.parchment }}>{p.name}</b>
          <span style={{ color: FACTIONS[p.faction]?.color }}> · {p.faction}</span>
          <span style={{ color: stress >= CH.STRESS_FRAY ? J.waxBright : PALETTE.parchDim }}> · stress {stress}</span>
          <span style={{ color: candles > 0 ? J.brassBright : PALETTE.parchDim }}> · {candles} candle{candles === 1 ? "" : "s"}</span>
          {mind && <span title={mind.effect} style={{ color: mind.virtue ? "#8fc06f" : J.waxBright, fontStyle: "italic" }}> · {mind.name}</span>}
          {inj.map((i, x2) => <span key={x2} style={{ color: J.waxBright, fontSize: 13 }}> · ✚ {i.name} ({Math.max(1, Math.ceil((i.until - Date.now()) / 86400000))}d)</span>)}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={grant} style={{ ...dmBtn, color: J.brassBright }}>+CANDLE</button>
          <button onClick={() => {
            const last = p.lastRefill ?? Date.now();
            const regen = Math.floor((Date.now() - last) / DT.REGEN_MS);
            onPatch({
              [`downtime.profiles.${k}.rolls`]: Math.max(0, candles - 1),
              [`downtime.profiles.${k}.lastRefill`]: candles >= DT.MAX_FREE ? Date.now() : last + Math.max(0, regen) * DT.REGEN_MS,
            });
          }} disabled={candles <= 0} style={{ ...dmBtn, opacity: candles <= 0 ? 0.45 : 1 }}>-CANDLE</button>
          <button onClick={() => onPatch({ [`downtime.profiles.${k}.stress`]: Math.min(CH.STRESS_MAX, stress + 1), [`downtime.profiles.${k}.stressTs`]: Date.now() })}
            disabled={stress >= CH.STRESS_MAX} style={{ ...dmBtn, color: J.waxBright, opacity: stress >= CH.STRESS_MAX ? 0.45 : 1 }}>+STRESS</button>
          <button onClick={() => onPatch({ [`downtime.profiles.${k}.stress`]: Math.max(0, stress - 1), [`downtime.profiles.${k}.stressTs`]: Date.now() })}
            disabled={stress <= 0} style={{ ...dmBtn, opacity: stress <= 0 ? 0.45 : 1 }}>-STRESS</button>
          <button onClick={() => {
            const have = new Set(inj.map((i) => i.name));
            const pool = INJURIES.filter((n) => !have.has(n));
            if (!pool.length) return;
            const w = { name: pool[Math.floor(Math.random() * pool.length)], until: Date.now() + CH.INJURY_DAYS * 86400000 };
            onPatch({ [`downtime.profiles.${k}.injuries`]: [...inj, w] });
          }} style={{ ...dmBtn, color: J.waxBright }}>+WOUND</button>
          <button onClick={() => onPatch({ [`downtime.profiles.${k}.stress`]: 0, [`downtime.profiles.${k}.stressTs`]: Date.now(), [`downtime.profiles.${k}.mind`]: null })} style={dmBtn}>SOOTHE</button>
          <button onClick={() => onPatch({ [`downtime.profiles.${k}.injuries`]: [] })} style={dmBtn}>MEND</button>
        </div>
      </div>

      {toolIds.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 11.5, color: PALETTE.parchDim, letterSpacing: "0.08em" }}>TOOLS</span>
          {toolIds.map((tid) => (
            <span key={tid} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: PALETTE.parch, background: "rgba(8,16,18,0.5)", border: `1px solid ${J.brass}33`, borderRadius: 12, padding: "2px 5px 2px 10px" }}>
              {CRAFT_TOOLS[tid].name}<span style={{ color: PALETTE.parchDim, fontSize: 11 }}> · {craftRankName(xp[tid] || 0)}</span>
              <button onClick={() => removeTool(tid)} title={`Strip ${CRAFT_TOOLS[tid].name} from ${p.name}`}
                style={{ ...dmBtn, padding: "0 7px", color: J.waxBright, borderColor: J.wax + "55", fontSize: 13, lineHeight: 1.5 }}>×</button>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: PALETTE.parchDim, letterSpacing: "0.08em" }}>GOAL</span>
        {editing ? (
          <>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={140} placeholder="name a private pursuit..."
              onKeyDown={(e) => e.key === "Enter" && saveGoal()}
              style={{ flex: "1 1 280px", padding: "6px 10px", borderRadius: 5, border: `1px solid ${J.brass}44`, background: "rgba(0,0,0,0.35)", color: PALETTE.parch, fontSize: 14, fontFamily: "inherit", outline: "none" }} />
            <button onClick={saveGoal} style={{ ...dmBtn, color: J.brassBright, borderColor: J.brass + "66" }}>SAVE</button>
            <button onClick={() => { setDraft(goal); setEditing(false); }} style={dmBtn}>CANCEL</button>
          </>
        ) : goal ? (
          <>
            <span style={{ flex: "1 1 auto", fontSize: 13.5, color: PALETTE.parch, fontStyle: "italic" }}>"{goal}"</span>
            <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
              {Array.from({ length: CH.PURSUIT_GOAL }).map((_, i) => (
                <span key={i} style={{ width: 16, height: 6, borderRadius: 3, background: i < notch ? J.brassBright : "rgba(0,0,0,0.4)", border: `1px solid ${J.brass}44`, display: "inline-block" }} />
              ))}
            </span>
            <span style={{ fontSize: 12, color: PALETTE.parchDim }}>{notch}/{CH.PURSUIT_GOAL}</span>
            <button onClick={() => setNotch(notch - 1)} disabled={notch <= 0} style={{ ...dmBtn, opacity: notch <= 0 ? 0.45 : 1 }}>−</button>
            <button onClick={() => setNotch(notch + 1)} disabled={notch >= CH.PURSUIT_GOAL} style={{ ...dmBtn, color: J.brassBright, opacity: notch >= CH.PURSUIT_GOAL ? 0.45 : 1 }}>+</button>
            <button onClick={() => setEditing(true)} style={dmBtn}>EDIT</button>
            <button onClick={clearGoal} style={{ ...dmBtn, color: J.waxBright, borderColor: J.wax + "55" }}>CLEAR</button>
          </>
        ) : (
          <>
            <span style={{ flex: "1 1 auto", fontSize: 13, color: PALETTE.parchDim, fontStyle: "italic" }}>none set</span>
            <button onClick={() => setEditing(true)} style={{ ...dmBtn, color: J.brassBright }}>SET A GOAL</button>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// THE DOCKET: everything the DM needs on a Friday
// =============================================================================
function Docket({ dt, onPatch }) {
  const [confirmClearLog, setConfirmClearLog] = useState(false);
  const [text, setText] = useState("");
  const [loc, setLoc] = useState(Object.keys(NODES)[0]);
  const [tpl, setTpl] = useState(DELVE_TEMPLATES[0].id);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const addItem = (r) => {
    onPatch({
      "downtime.inventory": [{ id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`, name: r.out, by: "The DM", tool: r.tool, icon: r.icon, rarity: r.rarity, ts: Date.now() }, ...(dt.inventory || [])].slice(0, 80),
      "downtime.log": [{ t: `The DM adds ${r.out} to the party inventory.`, ts: Date.now() }, ...(dt.log || [])].slice(0, CH.LOG_CAP),
    });
  };
  const clues = dt.clues || [];
  const profiles = Object.entries(dt.profiles || {}).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));

  const seed = () => {
    if (!text.trim()) return;
    const by = NPCS[Math.floor(Math.random() * NPCS.length)].name;
    const r = { id: `r${Date.now()}`, t: `At ${NODES[loc].name}: ${text.trim()}`, loc, faction: NODES[loc].faction, status: "fresh", by, ts: Date.now() };
    onPatch({ "downtime.rumors": [r, ...(dt.rumors || [])].slice(0, CH.RUMOR_CAP) });
    setText("");
  };
  const setClue = (id, used) => onPatch({ "downtime.clues": clues.map((c) => c.id === id ? { ...c, used } : c) });
  const dropClue = (id) => onPatch({ "downtime.clues": clues.filter((c) => c.id !== id) });
  const openDelve = () => {
    const t = DELVE_BY_ID[tpl];
    onPatch({
      "downtime.delve": {
        id: `d${Date.now()}`, tid: t.id, name: t.name, faction: t.faction, len: t.len,
        rooms: roomsFor(t), idx: 0, peek: null, done: false, scars: {}, path: "",
        boss: { name: t.boss, hp: CH.BOSS_HP, hits: 0 },
        pot: { supplies: 0, resolve: 0, boons: 0, rep: 0, clues: [] },
        openedTs: Date.now(),
      },
      "downtime.log": [{ t: `The Harbormaster has charted a venture: ${t.name}. ${t.blurb}`, ts: Date.now() }, ...(dt.log || [])].slice(0, CH.LOG_CAP),
    });
  };
  const abandonDelve = () => {
    setConfirmDrop(false);
    onPatch({
      "downtime.delve": null,
      "downtime.log": [{ t: `${dt.delve?.name || "The venture"} was abandoned. The dark keeps what was left behind.`, ts: Date.now() }, ...(dt.log || [])].slice(0, CH.LOG_CAP),
    });
  };

  return (
    <div>
      <div className="disp" style={secTitle}>GROUP-READY · confirmed clues, sealed finds, breakthroughs</div>
      {clues.length ? clues.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", marginBottom: 6, borderRadius: 7, background: c.used ? "rgba(8,16,18,0.3)" : "rgba(138,43,43,0.10)", border: `1px solid ${c.used ? J.brass + "1a" : J.wax + "55"}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: c.used ? PALETTE.parchDim : PALETTE.parch, lineHeight: 1.5, textDecoration: c.used ? "line-through" : "none" }}>{c.t}</div>
            <div style={{ fontSize: 12.5, color: PALETTE.parchDim, marginTop: 3 }}>
              {c.loc ? `${NODES[c.loc].name} · ` : ""}by {c.by} · {new Date(c.ts).toLocaleDateString()}
            </div>
          </div>
          <button onClick={() => setClue(c.id, !c.used)} style={dmBtn}>{c.used ? "REOPEN" : "USED"}</button>
          <button onClick={() => dropClue(c.id)} style={dmBtn}>DROP</button>
        </div>
      )) : <Empty>Nothing filed yet. It will come.</Empty>}

      <div className="disp" style={{ ...secTitle, marginTop: 18 }}>SEED A RUMOR · players cannot tell yours from the wild ones</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={140} placeholder="a hooded buyer is paying triple for bough-sap, no questions"
          style={{ flex: "1 1 320px", padding: "9px 11px", borderRadius: 5, border: `1px solid ${J.brass}44`, background: "rgba(0,0,0,0.35)", color: PALETTE.parch, fontSize: 14.5, fontFamily: "inherit", outline: "none" }} />
        <select value={loc} onChange={(e) => setLoc(e.target.value)}
          style={{ padding: "9px 8px", borderRadius: 5, border: `1px solid ${J.brass}44`, background: "rgba(0,0,0,0.55)", color: PALETTE.parch, fontSize: 14, fontFamily: "inherit" }}>
          {Object.entries(NODES).map(([id, n]) => <option key={id} value={id}>{n.name}</option>)}
        </select>
        <button onClick={seed} className="disp" style={{ ...dmBtn, padding: "9px 16px", fontSize: 13, color: J.brassBright, borderColor: J.brass + "88" }}>CAST IT</button>
      </div>

      <div onClick={() => setAddOpen((o) => !o)} className="disp" style={{ ...secTitle, marginTop: 18, cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, display: "inline-block", transform: addOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
        ADD TO PARTY INVENTORY
        <span style={{ letterSpacing: "0.04em", color: PALETTE.parchDim, fontSize: 11 }}>tap to {addOpen ? "hide" : "show"}</span>
      </div>
      {addOpen && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {RECIPES.map((r) => (
            <button key={r.id} onClick={() => addItem(r)} className="disp" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(8,16,18,0.45)", border: `1px solid ${J.brass}3a`, color: PALETTE.parch, borderRadius: 6, padding: "6px 11px", cursor: "pointer", fontSize: 12, letterSpacing: "0.04em" }}>
              <span style={{ color: J.brassBright, fontSize: 14, lineHeight: 1 }}>+</span> {r.out}
            </button>
          ))}
        </div>
      )}

      <div className="disp" style={{ ...secTitle, marginTop: 18 }}>DELVE</div>
      {dt.delve ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 14.5, color: PALETTE.parch }}>
          <span><b style={{ color: J.parchment }}>{dt.delve.name}</b> · room {Math.min(dt.delve.idx + 1, dt.delve.len)}/{dt.delve.len}{dt.delve.done ? " · boss slain, awaiting banking" : ""}</span>
          <span style={{ color: PALETTE.parchDim }}>haul: {dt.delve.pot?.supplies || 0} Supplies, {dt.delve.pot?.resolve || 0} Resolve, {(dt.delve.pot?.clues || []).length} finds</span>
          {confirmDrop ? (
            <span>
              <button onClick={abandonDelve} style={{ ...dmBtn, color: J.waxBright, borderColor: J.wax + "88" }}>ABANDON · SURE</button>
              <button onClick={() => setConfirmDrop(false)} style={{ ...dmBtn, marginLeft: 6 }}>KEEP</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDrop(true)} style={dmBtn}>ABANDON</button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={tpl} onChange={(e) => setTpl(e.target.value)}
            style={{ padding: "9px 8px", borderRadius: 5, border: `1px solid ${J.brass}44`, background: "rgba(0,0,0,0.55)", color: PALETTE.parch, fontSize: 14, fontFamily: "inherit" }}>
            {DELVE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.faction} · {t.len} rooms</option>)}
          </select>
          <button onClick={openDelve} className="disp" style={{ ...dmBtn, padding: "9px 16px", fontSize: 13, color: J.brassBright, borderColor: J.brass + "88" }}>OPEN THE VENTURE</button>
          <span style={{ fontSize: 13, color: PALETTE.parchDim, fontStyle: "italic" }}>{DELVE_BY_ID[tpl].blurb}</span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 18 }}>
        <div className="disp" style={{ ...secTitle, margin: 0 }}>WANDERERS</div>
        {profiles.length > 0 && (
          <button onClick={() => {
            const f = {};
            profiles.forEach(([k, p]) => {
              const avail = availableRolls(p);
              const last = p.lastRefill ?? Date.now();
              const regen = Math.floor((Date.now() - last) / DT.REGEN_MS);
              f[`downtime.profiles.${k}.rolls`] = avail + 1;
              f[`downtime.profiles.${k}.lastRefill`] = avail + 1 >= DT.MAX_FREE ? Date.now() : last + Math.max(0, regen) * DT.REGEN_MS;
            });
            onPatch(f);
          }} className="disp" style={{ ...dmBtn, color: J.brassBright, borderColor: J.brass + "66", marginLeft: "auto" }}>GRANT ALL +1 CANDLE</button>
        )}
      </div>
      {profiles.length ? profiles.map(([k, p]) => (
        <WandererRow key={k} pkey={k} p={p} dt={dt} onPatch={onPatch} />
      )) : <Empty>No wanderers sworn in yet.</Empty>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 14, color: PALETTE.parch, flexWrap: "wrap" }}>
        <span className="disp" style={{ letterSpacing: "0.1em", color: J.brass }}>BOONS BANKED: {dt.boons || 0}</span>
        <button onClick={() => onPatch({ "downtime.boons": Math.max(0, (dt.boons || 0) - 1) })} style={dmBtn}>-1</button>
        <button onClick={() => onPatch({ "downtime.boons": (dt.boons || 0) + 1 })} style={dmBtn}>+1</button>
        <span style={{ marginLeft: "auto" }}>
          {confirmClearLog ? (
            <>
              <span style={{ fontSize: 13, color: J.waxBright, marginRight: 8 }}>Wipe the Campaign Log for everyone?</span>
              <button onClick={() => { setConfirmClearLog(false); onPatch({ "downtime.log": [] }); }} className="disp" style={{ ...dmBtn, color: J.waxBright, borderColor: J.wax + "88" }}>WIPE IT</button>
              <button onClick={() => setConfirmClearLog(false)} style={{ ...dmBtn, marginLeft: 6 }}>KEEP IT</button>
            </>
          ) : (
            <button onClick={() => setConfirmClearLog(true)} className="disp" style={{ ...dmBtn, color: J.waxBright, borderColor: J.wax + "55" }}>CLEAR THE LOG</button>
          )}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// shared bits, icons, styles
// =============================================================================
function Head({ title, hint }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", borderBottom: `1px solid ${J.brass}22`, padding: "0 0 5px", margin: "20px 0 10px" }}>
      <div className="disp" style={{ fontSize: 14, color: J.brass, letterSpacing: "0.2em" }}>{title}</div>
      {hint && <div className="disp" style={{ marginLeft: "auto", fontSize: 12.5, color: PALETTE.parchDim, letterSpacing: "0.04em" }}>{hint}</div>}
    </div>
  );
}
// Art slots: drop renders into public/downtime/; missing files render nothing.
function Art({ src, h = 120, style }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img src={src} alt="" onError={() => setOk(false)}
    style={{ width: "100%", height: h, objectFit: "cover", borderRadius: 6, border: `1px solid ${J.inkSoft}44`, display: "block", marginBottom: 12, ...style }} />;
}
// =============================================================================
// THE MODEL: a painted bust in a brass frame. The portrait never changes;
// the frame, light, banner, and candles carry every status. Portrait slot:
// /downtime/pc-{playerKey}.jpg; missing art falls back to a faction silhouette.
// =============================================================================
export function PartyRow({ dt }) {
  const party = Object.entries(dt.profiles || {}).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));
  if (!party.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="disp" style={{ fontSize: 13, color: J.brass, letterSpacing: "0.2em", marginBottom: 8 }}>PARTY</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {party.map(([k, p]) => <Bust key={k} pkey={k} p={p} size={72} showName />)}
      </div>
    </div>
  );
}
export function Bust({ pkey, p, size = 76, showName = false, compact = false }) {
  const stress = stressNow(p);
  const band = stressBand(stress);
  const mind = mindOf(p);
  const inj = activeInjuries(p);
  const candles = availableRolls(p);
  const chipSz = Math.max(9, Math.round(size * 0.185));
  const bi = stress >= 9 ? 4 : stress >= CH.STRESS_FRAY ? 3 : stress >= 5 ? 2 : stress >= 3 ? 1 : 0;
  const frameCol = [J.brass, "#9a7d38", "#7a6230", J.wax, J.waxBright][bi];
  const vign = [0.05, 0.2, 0.36, 0.52, 0.68][bi];
  const injTip = inj.map((i) => {
    const days = Math.max(1, Math.ceil((i.until - Date.now()) / 86400000));
    return ` · ✚ ${i.name} (${days <= 1 ? "mending" : "fresh"})`;
  }).join("");
  return (
    <div style={{ width: size, textAlign: "center", flexShrink: 0 }}>
      <div className={bi >= 4 ? "ember-fast" : bi === 3 ? "ember" : ""}
        title={`${p.name} · ${mind ? `${mind.name}: ${mind.effect}` : band.word + ". " + band.line}${injTip}`}
        style={{
          position: "relative", width: size, height: Math.round(size * 1.2), borderRadius: 7,
          border: `3px solid ${frameCol}`, background: "#0d0a06", overflow: "hidden",
          boxShadow: "0 3px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(217,185,106,0.18)",
        }}>
        <BustImg pkey={pkey} p={p} />
        <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 ${8 + bi * 13}px rgba(0,0,0,${vign})`, pointerEvents: "none" }} />
        {bi >= 3 && <CrackOverlay deep={bi >= 4} />}
        {inj.length > 0 && (
          <div style={{ position: "absolute", top: 3, right: 3, display: "flex", gap: 2 }}>
            {inj.map((i, k) => (
              <span key={k} style={{ width: chipSz, height: chipSz, borderRadius: 3, background: "rgba(13,10,6,0.82)", border: `1px solid ${J.waxBright}`, color: J.waxBright, fontSize: Math.round(chipSz * 0.68), lineHeight: `${chipSz - 1}px`, textAlign: "center" }}>✚</span>
            ))}
          </div>
        )}
        {mind && (
          <div className="disp" style={{
            position: "absolute", left: 0, right: 0, bottom: 0, padding: "2px 1px",
            background: mind.virtue ? "rgba(74,106,52,0.92)" : "rgba(122,33,33,0.92)",
            color: J.parchment, fontSize: Math.max(7.5, size * 0.1), letterSpacing: "0.04em", lineHeight: 1.15,
          }}>{mind.name.toUpperCase()}</div>
        )}
      </div>
      {!compact && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 2, marginTop: 4 }}>
          {[...Array(CH.ACTIONS_PER_DAY)].map((_, i) => (
            <Icon key={i} name="flame" size={13} color={i < Math.min(candles, CH.ACTIONS_PER_DAY) ? J.brassBright : "rgba(255,255,255,0.14)"} />
          ))}
          {candles > CH.ACTIONS_PER_DAY && <span className="disp" style={{ fontSize: 10, color: J.brassBright }}>+{candles - CH.ACTIONS_PER_DAY}</span>}
        </div>
      )}
      {!compact && showName && <div style={{ fontSize: 12, color: PALETTE.parch, marginTop: 2, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>}
    </div>
  );
}
function BustImg({ pkey, p }) {
  const src = p.portrait ? `/downtime/portrait-${p.portrait}.jpg` : `/downtime/pc-${pkey}.jpg`;
  const [ok, setOk] = useState(true);
  useEffect(() => { setOk(true); }, [src]);
  const f = FACTIONS[p.faction] || { color: "#7a8a8f" };
  if (ok) return <img src={src} alt="" onError={() => setOk(false)}
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;
  return (
    <svg viewBox="0 0 80 96" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <rect width="80" height="96" fill="#11150f" />
      <rect width="80" height="96" fill={f.color} opacity="0.12" />
      <circle cx="40" cy="34" r="14" fill={f.color} opacity="0.45" />
      <path d="M13 96 C 16 66, 64 66, 67 96 Z" fill={f.color} opacity="0.45" />
      <text x="40" y="40" textAnchor="middle" fontFamily="'Cinzel', serif" fontSize="15" fill="#ece0bd" opacity="0.92">{(p.name || "?").trim()[0]?.toUpperCase() || "?"}</text>
    </svg>
  );
}
function CrackOverlay({ deep }) {
  return (
    <svg viewBox="0 0 80 96" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <g stroke={deep ? "#b04a3e" : "#8a2b2b"} strokeWidth={deep ? 1.1 : 0.7} fill="none" opacity={deep ? 0.85 : 0.6} strokeLinecap="round">
        <path d="M2 6 L 14 16 L 11 27 M 14 16 L 25 19" />
        <path d="M78 13 L 66 23 L 69 35 M 66 23 L 56 25" />
        <path d="M6 90 L 16 78 L 13 67" />
        {deep && <path d="M74 88 L 62 76 L 66 63 M 62 76 L 50 80" />}
        {deep && <path d="M40 2 L 38 13 L 44 21" />}
      </g>
    </svg>
  );
}

function Face({ id, size = 34 }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img src={`/downtime/npc-${id}.jpg`} alt="" onError={() => setOk(false)}
    style={{ width: size, height: size, objectFit: "cover", borderRadius: "50%", border: `1px solid ${J.brass}66`, flexShrink: 0 }} />;
}
function Parch({ children, style, className }) {
  return (
    <div className={className} style={{
      position: "relative",
      background: `linear-gradient(168deg, ${J.parchment} 0%, ${J.parchment2} 100%)`,
      border: `1px solid ${J.inkSoft}44`, borderRadius: 8, padding: "20px 24px",
      boxShadow: `inset 0 0 60px rgba(74,63,44,0.22), 0 10px 30px rgba(0,0,0,0.45)`,
      maxWidth: 860, margin: "0 auto", ...style,
    }}>{children}</div>
  );
}
function Empty({ children }) { return <div style={{ fontSize: 14.5, color: PALETTE.parchDim, fontStyle: "italic" }}>{children}</div>; }
function BackBtn({ onClick }) {
  return <button onClick={onClick} className="disp" style={{
    position: "absolute", top: 10, right: 10, zIndex: 6,
    background: "rgba(22,14,7,0.58)", color: J.parchment,
    border: "1px solid rgba(236,224,189,0.5)", backdropFilter: "blur(2px)",
    borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13, letterSpacing: "0.08em",
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
  }}>‹ BACK</button>;
}
function JTab({ on, onClick, children }) {
  return <button onClick={onClick} className="disp" style={{
    background: "transparent", border: "none", borderBottom: `2px solid ${on ? J.brass : "transparent"}`,
    color: on ? J.brassBright : PALETTE.parchDim, padding: "8px 4px", cursor: "pointer", fontSize: 16, letterSpacing: "0.12em",
  }}>{children}</button>;
}

export function Icon({ name, size = 24, color = J.brass }) {
  const s = { width: size, height: size, flexShrink: 0 };
  const k = { fill: "none", stroke: color, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "eye": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M2 12 C 6 6, 18 6, 22 12 C 18 18, 6 18, 2 12 Z" /><circle {...k} cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="1" fill={color} /></svg>;
    case "rope": return <svg style={s} viewBox="0 0 24 24"><circle {...k} cx="12" cy="12" r="7" /><circle {...k} cx="12" cy="12" r="3.5" /><path {...k} d="M19 12 L 23 10 M 19 13 L 22 16" /></svg>;
    case "blade": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M5 19 L 16 8 L 19 5 L 19 8 L 8 19 Z" /><path {...k} d="M7 15 L 9 17 M 4 20 L 6 22" /></svg>;
    case "ear": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M8 20 C 8 16, 6 15, 6 10 C 6 6, 9 4, 12 4 C 15 4, 18 6, 18 10 C 18 13, 15 13, 14 16" /><path {...k} d="M10 10 C 10 8, 14 8, 14 10" /></svg>;
    case "tome": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M5 4 L 15 4 C 17 4, 19 5, 19 7 L 19 20 L 7 20 C 5.5 20, 5 19, 5 18 Z" /><path {...k} d="M5 17 C 5 17, 6 16, 8 16 L 19 16" /><path {...k} d="M9 8 L 15 8 M 9 11 L 14 11" /></svg>;
    case "tankard": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M6 6 L 16 6 L 15 20 L 7 20 Z" /><path {...k} d="M16 8 L 19 8 C 20 8, 20 14, 19 14 L 15.5 14" /><path {...k} d="M6 6 C 7 4, 15 4, 16 6" /></svg>;
    case "compass": return <svg style={s} viewBox="0 0 24 24"><circle {...k} cx="12" cy="12" r="8" /><path d="M15 9 L 13 13 L 9 15 L 11 11 Z" fill={color} /></svg>;
    case "scroll": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M7 4 C 5 4, 5 8, 7 8 L 7 20 L 17 20 L 17 8 C 19 8, 19 4, 17 4 Z" /><path {...k} d="M10 11 L 14 11 M 10 14 L 15 14" /></svg>;
    case "shard": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M12 3 L 17 9 L 14 21 L 9 19 L 7 9 Z" /><path {...k} d="M12 3 L 11 12 L 14 21 M 7 9 L 11 12 L 17 9" /></svg>;
    case "crest": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M12 3 L 19 6 L 19 12 C 19 17, 15 20, 12 21 C 9 20, 5 17, 5 12 L 5 6 Z" /><path {...k} d="M12 7 L 12 15 M 9 10 L 15 10" /></svg>;
    case "bandage": return <svg style={s} viewBox="0 0 24 24"><rect {...k} x="3" y="9" width="18" height="6" rx="3" transform="rotate(-30 12 12)" /><path {...k} d="M10 11 L 11 12 M 12 9 L 13 10 M 11 14 L 12 15" /></svg>;
    case "candle": return <svg style={s} viewBox="0 0 24 24"><rect {...k} x="9" y="10" width="6" height="11" /><path {...k} d="M12 10 L 12 7" /><path d="M12 3 C 13.5 5, 13 7, 12 7 C 11 7, 10.5 5, 12 3 Z" fill={color} /></svg>;
    case "seal": return <svg style={s} viewBox="0 0 24 24"><circle {...k} cx="12" cy="12" r="7" /><circle {...k} cx="12" cy="12" r="3.5" /><path {...k} d="M6 17 L 4 21 M 18 17 L 20 21" /></svg>;
    case "anchor": return <svg style={s} viewBox="0 0 24 24"><circle {...k} cx="12" cy="5" r="2" /><path {...k} d="M12 7 L 12 20 M 6 12 L 18 12" /><path {...k} d="M5 15 C 6 19, 9 21, 12 21 C 15 21, 18 19, 19 15 M 5 15 L 8 15 M 19 15 L 16 15" /></svg>;
    case "skull": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M12 3 C 7 3, 4 6.5, 4 11 C 4 14, 6 16, 7 17 L 7 20 L 17 20 L 17 17 C 18 16, 20 14, 20 11 C 20 6.5, 17 3, 12 3 Z" /><circle cx="9" cy="11" r="1.6" fill={color} /><circle cx="15" cy="11" r="1.6" fill={color} /><path {...k} d="M10 20 L 10 17.5 M 14 20 L 14 17.5" /></svg>;
    case "flame": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M12 3 C 14 7, 18 9, 18 14 C 18 18, 15 21, 12 21 C 9 21, 6 18, 6 14 C 6 11, 8 9, 9 7 C 9.5 9, 11 10, 12 9 C 12.5 7, 12 5, 12 3 Z" /><path {...k} d="M12 21 C 10.5 19.5, 10.5 17, 12 15.5 C 13.5 17, 13.5 19.5, 12 21 Z" /></svg>;
    case "door": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M6 21 L 6 6 C 6 4, 8 3, 12 3 C 16 3, 18 4, 18 6 L 18 21" /><path {...k} d="M4 21 L 20 21" /><circle cx="15" cy="13" r="1" fill={color} /></svg>;
    case "crate": return <svg style={s} viewBox="0 0 24 24"><rect {...k} x="4" y="7" width="16" height="13" rx="1" /><path {...k} d="M4 11 L 20 11 M 12 7 L 12 20 M 4 7 L 8 4 L 22 4 L 20 7" /></svg>;
    case "gem": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M7 4 L 17 4 L 21 9 L 12 21 L 3 9 Z" /><path {...k} d="M3 9 L 21 9 M 12 21 L 8 9 L 11 4 M 12 21 L 16 9 L 13 4" /></svg>;
    case "bullets": return <svg style={s} viewBox="0 0 24 24"><circle {...k} cx="7.5" cy="16" r="2.3" /><circle {...k} cx="12" cy="12.5" r="2.3" /><circle {...k} cx="16.5" cy="16" r="2.3" /><path {...k} d="M5 20.5 L 19 20.5" /></svg>;
    case "powderhorn": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M5 16 C 5 9, 11 4, 18 5 L 17 9 C 12 9, 9 12, 9 16 Z" /><path {...k} d="M18 5 L 20.5 3.5 M 9 16 L 7 19.5" /></svg>;
    case "potion": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M10 3 L 14 3 M 11 3 L 11 8 C 8 9, 6 12, 6 15 A 6 6 0 0 0 18 15 C 18 12, 16 9, 13 8 L 13 3" /><path {...k} d="M7 14 L 17 14" /></svg>;
    case "vial": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M10 3 L 14 3 M 11 3 L 11 7 L 9 9 L 9 19 A 3 3 0 0 0 15 19 L 15 9 L 13 7 L 13 3" /><path {...k} d="M9 13 L 15 13" /></svg>;
    case "arrow": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M4 20 L 18 6" /><path {...k} d="M18 6 L 12.8 7 M 18 6 L 17 11.2" /><path {...k} d="M6.6 17.4 L 4.6 15.4 M 9 15 L 7 13" /></svg>;
    case "vest": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M8 4 L 10 6.5 L 14 6.5 L 16 4 L 19 7 L 19 20 L 5 20 L 5 7 Z" /><path {...k} d="M10 6.5 C 10.5 9, 13.5 9, 14 6.5" /><path {...k} d="M12 11 L 12 17" /></svg>;
    case "mail": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M8 4 L 10 6.5 L 14 6.5 L 16 4 L 19 7 L 19 20 L 5 20 L 5 7 Z" /><circle {...k} cx="9" cy="11.5" r="0.9" /><circle {...k} cx="12" cy="11.5" r="0.9" /><circle {...k} cx="15" cy="11.5" r="0.9" /><circle {...k} cx="9" cy="15.5" r="0.9" /><circle {...k} cx="12" cy="15.5" r="0.9" /><circle {...k} cx="15" cy="15.5" r="0.9" /></svg>;
    case "bow": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M7 3 C 15 7, 15 17, 7 21" /><path {...k} d="M7 3 L 7 21" /><path {...k} d="M7 12 L 20 12 M 20 12 L 16.5 10.4 M 20 12 L 16.5 13.6" /></svg>;
    case "crossbow": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M12 6 L 12 20 M 10 20 L 14 20" /><path {...k} d="M4 9 C 8 4.5, 16 4.5, 20 9" /><path {...k} d="M4 9 L 12 12 L 20 9" /><path {...k} d="M12 6 L 12 3.5" /><path {...k} d="M12 14.5 L 14.5 16.5" /></svg>;
    case "pistol": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M3 9 L 17 9 L 17 12 L 10 12 L 8.5 17 L 4.5 17 L 6.5 12 L 3 12 Z" /><path {...k} d="M16 9 L 18.5 5.5 M 17.5 7.2 L 19.6 8.2" /></svg>;
    case "musket": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M2 10 L 16 10" /><path {...k} d="M16 10 L 21 13 L 19 15.5 L 13.5 11.7" /><path {...k} d="M12 10 L 13.5 7.5 M 11 11.5 L 11 13.8" /></svg>;
    case "cloak": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M12 3 C 7.5 5, 5.5 10, 5 20 L 19 20 C 18.5 10, 16.5 5, 12 3 Z" /><path {...k} d="M12 7 L 12 20" /><circle {...k} cx="12" cy="5.2" r="1" /></svg>;
    case "fish": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M3 12 C 7 7.5, 13 7.5, 17 12 C 13 16.5, 7 16.5, 3 12 Z" /><path {...k} d="M17 12 L 21.5 8.5 M 17 12 L 21.5 15.5" /><circle cx="7" cy="11" r="0.9" fill={color} /></svg>;
    case "spikes": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M6 5 L 6 17 M 4.8 14.8 L 6 17 L 7.2 14.8 M 4.7 5 L 7.3 5" /><path {...k} d="M12 4 L 12 19 M 10.8 16.6 L 12 19 L 13.2 16.6 M 10.7 4 L 13.3 4" /><path {...k} d="M18 5 L 18 17 M 16.8 14.8 L 18 17 L 19.2 14.8 M 16.7 5 L 19.3 5" /></svg>;
    case "wrench": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M9.5 9.5 A 4 4 0 1 1 11.5 7 L 19.5 15 A 2.2 2.2 0 1 1 16.5 18 L 8.8 10.3" /><path {...k} d="M5 4.5 L 8 7.5" /></svg>;
    case "anvil": return <svg style={s} viewBox="0 0 24 24"><path {...k} d="M3 7 L 21 7 C 21 10, 17 12, 14 12 L 13 12 L 13 15 L 16 18 L 8 18 L 11 15 L 11 12 L 10 12 C 6 12, 4 10, 3 7 Z" /><path {...k} d="M7 21 L 17 21" /></svg>;
    default: return null;
  }
}

function CSS() {
  return (
    <style>{`
      @keyframes inkRise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
      .ink-rise { animation: inkRise 0.45s ease both; }
      @keyframes flick { 0%,100% { opacity: 1; } 42% { opacity: 0.82; } 67% { opacity: 0.93; } 80% { opacity: 0.78; } }
      .flicker { animation: flick 2.6s infinite; }
      @keyframes emberPulse { 0%,100% { filter: none; } 50% { filter: drop-shadow(0 0 7px rgba(176,74,62,0.55)); } }
      .ember { animation: emberPulse 2.8s ease-in-out infinite; }
      .ember-fast { animation: emberPulse 1.5s ease-in-out infinite; }
    `}</style>
  );
}

// =============================================================================
// CRAFTING and INVENTORY: recipe grid, tool unlocks, projects, shared goods
// =============================================================================
function fmtCraftLeft(ms) {
  if (ms <= 0) return "ready";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600e3), m = Math.floor((ms % 3600e3) / 60000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
const weekUsedMap = (dt) => {
  const cw = dt.craftWeek || {};
  return cw.wk === craftWeekKey() ? (cw.used || {}) : {};
};

// =============================================================================
// CRAFTING: an undertaking. Recipe grid, tool unlocks, one project at a time.
// =============================================================================
function CraftBench({ profile, dt, supplies, actions, onStart, onCollect, onAbandon, onUnlockTool, onToggleBonus, onBack }) {
  const [detail, setDetail] = useState(null);
  const [toolAsk, setToolAsk] = useState(null);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [rankTab, setRankTab] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(iv); }, []);
  const tools = profile.tools || {};
  const xp = profile.craftXp || {};
  const used = weekUsedMap(dt);
  const c = profile.craft;

  // ---- tool unlock prompt ----
  if (toolAsk) {
    const t = CRAFT_TOOLS[toolAsk];
    return (
      <Parch>
        <div className="disp" style={{ fontSize: 18, color: J.inkDark, letterSpacing: "0.08em" }}>{t.name.toUpperCase()}</div>
        <div style={{ fontSize: 15.5, color: J.inkDark, lineHeight: 1.6, marginTop: 10 }}>
          Have you purchased {t.name} for your character on your D&D Beyond sheet?
          Unlocking is permanent and opens this category: {t.makes}. Unlocks are recorded in the log.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={() => { onUnlockTool(toolAsk); setToolAsk(null); }} className="disp" style={{ background: J.inkDark, color: J.parchment, border: "none", borderRadius: 6, padding: "10px 20px", cursor: "pointer", fontSize: 13, letterSpacing: "0.08em" }}>I OWN THEM</button>
          <button onClick={() => setToolAsk(null)} className="disp" style={{ background: "transparent", color: J.inkSoft, border: `1px solid ${J.inkSoft}55`, borderRadius: 6, padding: "10px 20px", cursor: "pointer", fontSize: 13 }}>NOT YET</button>
        </div>
        <BackBtn onClick={() => setToolAsk(null)} />
      </Parch>
    );
  }

  // ---- recipe detail ----
  if (detail) {
    const r = detail;
    const t = CRAFT_TOOLS[r.tool];
    const owned = !!tools[r.tool];
    const rIdx = craftRankIdx(xp[r.tool] || 0);
    const reason = c ? "Finish or abandon your current project first."
      : !owned ? `Requires ${t.name}. Unlock the category from the recipe list.`
      : rIdx < r.rank ? `Requires ${CRAFT_RANKS[r.rank].t} rank in ${t.name} (${CRAFT_RANKS[r.rank].at}+).`
      : used[r.id] ? `Already crafted this week by ${used[r.id]}. Resets in ${fmtCraftLeft(craftWeekResetMs())}.`
      : actions < r.candles ? "Not enough candles."
      : supplies < r.supplies ? "Not enough party Supplies."
      : null;
    return (
      <Parch>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Icon name={r.icon} size={40} color={J.inkDark} />
          <div>
            <div className="disp" style={{ fontSize: 18, color: J.inkDark, letterSpacing: "0.06em" }}>{r.name}</div>
            <div className="disp" style={{ fontSize: 11.5, color: J.inkSoft, letterSpacing: "0.1em" }}><span style={{ color: (RARITIES[r.rarity] || RARITIES.common).ink }}>{(RARITIES[r.rarity] || RARITIES.common).label.toUpperCase()}</span> · {CRAFT_RANKS[r.rank].t.toUpperCase()} · {t.name.toUpperCase()}</div>
          </div>
        </div>
        <div style={{ fontSize: 15, color: J.inkDark, marginTop: 10, lineHeight: 1.5 }}>{r.note}</div>
        <div style={{ fontSize: 14.5, color: J.inkSoft, marginTop: 8 }}>
          Costs {r.candles} candle{r.candles === 1 ? "" : "s"} · {r.supplies} party Suppl{r.supplies === 1 ? "y" : "ies"} · {r.days} real day{r.days === 1 ? "" : "s"}. Grants +{r.xp} skill. Once per week, group-wide.
        </div>
        {owned && !!(profile.profBonus || {})[r.tool] && <div style={{ fontSize: 14, color: "#4f6a33", marginTop: 6 }}>Proficiency bonus on: this yields two.</div>}
        {reason && <div style={{ fontSize: 14, color: J.wax, marginTop: 8 }}>{reason}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button onClick={() => { if (!reason) { setDetail(null); onStart(r); } }} disabled={!!reason} className="disp"
            style={{ background: reason ? `${J.inkSoft}55` : J.inkDark, color: J.parchment, border: "none", borderRadius: 6, padding: "10px 24px", cursor: reason ? "default" : "pointer", fontSize: 14, letterSpacing: "0.1em" }}>
            START
          </button>
        </div>
        <BackBtn onClick={() => setDetail(null)} />
      </Parch>
    );
  }

  // ---- active project ----
  if (c && !browse) {
    const left = c.doneTs - Date.now();
    const done = left <= 0;
    const pct = Math.max(2, Math.min(100, Math.round(((Date.now() - c.startTs) / Math.max(1, c.doneTs - c.startTs)) * 100)));
    return (
      <Parch>
        <div className="disp" style={{ fontSize: 18, color: J.inkDark, letterSpacing: "0.08em" }}>CRAFTING</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          <Icon name={c.icon || "anvil"} size={38} color={J.inkDark} />
          <div>
            <div className="disp" style={{ fontSize: 16, color: J.inkDark }}>{c.name}</div>
            <div style={{ fontSize: 13.5, color: J.inkSoft }}>{CRAFT_TOOLS[c.tool]?.name} · started {new Date(c.startTs).toLocaleDateString()}</div>
          </div>
        </div>
        <div style={{ position: "relative", height: 14, borderRadius: 7, marginTop: 12, background: "rgba(0,0,0,0.18)", border: `1px solid ${J.inkSoft}55`, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, background: done ? "#6f8a4f" : `linear-gradient(90deg, ${J.brass}, ${J.brassBright})`, transition: "width 0.5s" }} />
        </div>
        <div style={{ fontSize: 14.5, color: done ? "#4f6a33" : J.inkSoft, marginTop: 7 }}>
          {done ? "Finished. Collect it." : `Ready in ${fmtCraftLeft(left)}.`}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
          {done && (
            <button onClick={onCollect} className="disp" style={{ background: J.inkDark, color: J.parchment, border: "none", borderRadius: 6, padding: "10px 22px", cursor: "pointer", fontSize: 14, letterSpacing: "0.1em" }}>COLLECT</button>
          )}
          <button onClick={() => setBrowse(true)} className="disp" style={{ background: "transparent", color: J.inkDark, border: `1px solid ${J.inkSoft}66`, borderRadius: 6, padding: "9px 16px", cursor: "pointer", fontSize: 12.5, letterSpacing: "0.06em" }}>BROWSE RECIPES</button>
          {!done && (confirmDrop ? (
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, color: J.wax }}>Supplies are refunded; candles are not. The weekly lock on this recipe remains.</span>
              <button onClick={() => { setConfirmDrop(false); onAbandon(); }} className="disp" style={{ background: "transparent", color: J.wax, border: `1px solid ${J.wax}88`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>ABANDON</button>
              <button onClick={() => setConfirmDrop(false)} className="disp" style={{ background: "transparent", color: J.inkSoft, border: `1px solid ${J.inkSoft}55`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>KEEP</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDrop(true)} className="disp" style={{ background: "transparent", color: J.inkSoft, border: `1px solid ${J.inkSoft}55`, borderRadius: 6, padding: "9px 14px", cursor: "pointer", fontSize: 12 }}>ABANDON</button>
          ))}
        </div>
        <BackBtn onClick={onBack} />
      </Parch>
    );
  }

  // ---- recipe grid ----
  return (
    <Parch>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div className="disp" style={{ fontSize: 18, color: J.inkDark, letterSpacing: "0.08em" }}>CRAFTING</div>
        <span style={{ fontSize: 13.5, color: J.inkSoft }}>{actions} candle{actions === 1 ? "" : "s"} · {supplies} party Suppl{supplies === 1 ? "y" : "ies"} · each recipe once per week, group-wide</span>
      </div>
      {c && (
        <div style={{ fontSize: 13.5, color: J.inkDark, marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "rgba(0,0,0,0.08)", border: `1px solid ${J.inkSoft}44` }}>
          Project active: {c.name} · {c.doneTs - Date.now() <= 0 ? "ready to collect" : `ready in ${fmtCraftLeft(c.doneTs - Date.now())}`}
          <button onClick={() => setBrowse(false)} className="disp" style={{ marginLeft: 10, background: "transparent", color: J.inkDark, border: `1px solid ${J.inkSoft}66`, borderRadius: 5, padding: "2px 9px", cursor: "pointer", fontSize: 11 }}>VIEW</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {CRAFT_RANKS.map((rk, i) => (
          <button key={rk.t} onClick={() => setRankTab(i)} className="disp"
            style={{ background: rankTab === i ? J.inkDark : "transparent", color: rankTab === i ? J.parchment : J.inkDark, border: `1px solid ${J.inkSoft}66`, borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 11.5, letterSpacing: "0.08em" }}>
            {rk.t.toUpperCase()}
          </button>
        ))}
      </div>
      {Object.entries(CRAFT_TOOLS).map(([tid, t]) => {
        const list = recipesByTool(tid).filter((r) => r.rank === rankTab);
        if (!list.length) return null;
        const owned = !!tools[tid];
        const points = xp[tid] || 0;
        const rIdx = craftRankIdx(points);
        const bonus = !!(profile.profBonus || {})[tid];
        return (
          <div key={tid} style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${J.inkSoft}33`, paddingBottom: 4, marginBottom: 8 }}>
              <span className="disp" style={{ fontSize: 13.5, color: J.inkDark, letterSpacing: "0.1em" }}>{t.name.toUpperCase()}</span>
              <label title="When on, every craft in this category yields two instead of one."
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 10.5, color: bonus ? J.inkDark : J.inkSoft, letterSpacing: "0.05em", userSelect: "none" }}>
                <input type="checkbox" checked={bonus} onChange={() => onToggleBonus(tid)} style={{ accentColor: J.inkDark, width: 14, height: 14, cursor: "pointer", margin: 0 }} />
                PROFICIENCY BONUS
              </label>
              {owned ? (
                <span className="disp" style={{ fontSize: 11.5, color: "#4f6a33" }}>{craftRankName(points)} · {points}/{CRAFT_XP_MAX}</span>
              ) : (
                <button onClick={() => setToolAsk(tid)} className="disp" style={{ background: "transparent", color: J.inkDark, border: `1px solid ${J.inkSoft}66`, borderRadius: 5, padding: "3px 10px", cursor: "pointer", fontSize: 11, letterSpacing: "0.06em" }}>UNLOCK</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              {list.map((r) => {
                const tag = c ? "PROJECT ACTIVE"
                  : !owned ? "LOCKED: TOOL"
                  : rIdx < r.rank ? `NEEDS ${CRAFT_RANKS[r.rank].t.toUpperCase()}`
                  : used[r.id] ? "USED THIS WEEK"
                  : actions < r.candles ? "NEEDS CANDLES"
                  : supplies < r.supplies ? "NEEDS SUPPLIES"
                  : null;
                const RC = RARITIES[r.rarity] || RARITIES.common;
                return (
                  <button key={r.id} onClick={() => setDetail(r)}
                    style={{ width: 148, minHeight: 148, borderRadius: 9, border: `1.5px solid ${tag ? J.inkSoft + "44" : RC.ink + "99"}`, background: "rgba(255,255,255,0.30)", padding: "10px 8px 8px", cursor: "pointer", fontFamily: "inherit", opacity: tag ? 0.6 : 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, textAlign: "center" }}>
                    <Icon name={r.icon} size={32} color={J.inkDark} />
                    <span className="disp" style={{ fontSize: 12.5, color: J.inkDark, lineHeight: 1.2 }}>{r.name}</span>
                    <span style={{ fontSize: 11.5, color: J.inkSoft }}>{r.candles}c · {r.supplies}s · {r.days}d</span>
                    <span style={{ fontSize: 11, color: "#4f6a33" }}>+{r.xp} skill</span>
                    <span className="disp" style={{ fontSize: 9.5, letterSpacing: "0.07em", color: tag ? J.wax : RC.ink, marginTop: "auto" }}>{tag || RC.label.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <BackBtn onClick={onBack} />
    </Parch>
  );
}

function CraftBar({ points }) {
  const pct = Math.round((Math.min(points, CRAFT_XP_MAX) / CRAFT_XP_MAX) * 100);
  return (
    <div style={{ position: "relative", height: 12, borderRadius: 6, marginTop: 4, background: "rgba(0,0,0,0.5)", border: `1px solid ${J.brass}44`, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, background: `linear-gradient(90deg, ${J.brass}, ${J.brassBright})`, transition: "width 0.4s" }} />
      {CRAFT_RANKS.slice(1).map((r) => (
        <span key={r.t} title={`${r.t} at ${r.at}`} style={{ position: "absolute", left: `${(r.at / CRAFT_XP_MAX) * 100}%`, top: 0, bottom: 0, width: 2, background: "rgba(0,0,0,0.6)" }} />
      ))}
    </div>
  );
}

function CraftSkills({ profile }) {
  const tools = profile.tools || {};
  const xp = profile.craftXp || {};
  const ids = Object.keys(CRAFT_TOOLS).filter((t) => tools[t] || (xp[t] || 0) > 0);
  if (!ids.length) return <Empty>No artisan's tools yet. Buy a set on your D&D Beyond sheet, then unlock it under Crafting in the Ledger.</Empty>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px 26px" }}>
      {ids.map((tid) => {
        const points = xp[tid] || 0;
        return (
          <div key={tid}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="disp" style={{ fontSize: 13, color: J.parchment, letterSpacing: "0.06em" }}>{CRAFT_TOOLS[tid].name}</span>
              <span className="disp" style={{ marginLeft: "auto", fontSize: 12, color: J.brassBright }}>{craftRankName(points)}</span>
              <span style={{ fontSize: 12, color: PALETTE.parchDim }}>{points}/{CRAFT_XP_MAX}</span>
            </div>
            <CraftBar points={points} />
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// LEADERBOARD: lifetime tallies across the group
// =============================================================================
const BOARD_COLS = [
  ["rooms", "Rooms Cleared", "door"],
  ["bosses", "Bosses Felled", "skull"],
  ["rumors", "Rumors Confirmed", "eye"],
  ["breaks", "Breaks Survived", "candle"],
  ["spent", "Trinkets Spent", "gem"],
  ["crafted", "Items Crafted", "anvil"],
  ["nat20", "Nat 20s", "crest"],
  ["nat1", "Nat 1s", "flame"],
];
function LeaderboardView({ dt }) {
  const rows = Object.entries(dt.profiles || {}).map(([k, p]) => ({ key: k, name: p.name || k, kind: p.kind, saga: p.saga || {} }));
  if (!rows.length) return <Empty>No wanderers sworn in yet.</Empty>;
  const total = (g) => BOARD_COLS.reduce((a, [k]) => a + (k === "nat1" ? 0 : (g[k] || 0)), 0);
  rows.sort((a, b) => total(b.saga) - total(a.saga) || a.name.localeCompare(b.name));
  const max = {};
  BOARD_COLS.forEach(([k]) => { max[k] = Math.max(0, ...rows.map((r) => r.saga[k] || 0)); });
  const th = { padding: "6px 8px", borderBottom: `1px solid ${J.brass}33`, whiteSpace: "nowrap" };
  return (
    <div>
      <Head title="LEADERBOARD" hint="lifetime tallies across the group · ♛ marks the record holder" />
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780 }}>
          <thead>
            <tr>
              <th className="disp" style={{ ...th, textAlign: "left", fontSize: 11, letterSpacing: "0.16em", color: PALETTE.parchDim }}>WANDERER</th>
              {BOARD_COLS.map(([k, label, icon]) => (
                <th key={k} style={{ ...th, textAlign: "center" }}>
                  <Icon name={icon} size={15} color={J.brass} />
                  <div className="disp" style={{ fontSize: 9, letterSpacing: "0.1em", color: PALETTE.parchDim, marginTop: 2 }}>{label.toUpperCase()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} style={{ background: i % 2 ? "rgba(8,16,18,0.35)" : "transparent" }}>
                <td style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 12.5, color: PALETTE.parchDim, marginRight: 8 }}>{i + 1}</span>
                  <b style={{ fontSize: 15, color: J.parchment }}>{r.name}</b>
                  {r.kind === "agent" && <span style={{ fontSize: 11.5, color: PALETTE.parchDim, fontStyle: "italic" }}> · agent</span>}
                </td>
                {BOARD_COLS.map(([k]) => {
                  const v = r.saga[k] || 0;
                  const lead = v > 0 && v === max[k];
                  return (
                    <td key={k} className="disp" style={{ padding: "8px 8px", textAlign: "center", fontSize: 15, color: lead ? J.brassBright : v > 0 ? PALETTE.parch : PALETTE.parchDim }}>
                      {lead ? "♛ " : ""}{v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// INVENTORY: the party's crafted goods, RPG grid, DM-managed
// =============================================================================
function InventoryView({ dt, isDM, onPatch, profile }) {
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(iv); }, []);
  const inv = dt.inventory || [];
  const atBench = Object.entries(dt.profiles || {}).map(([, p]) => p).filter((p) => p.craft);
  const used = weekUsedMap(dt);
  const usedCount = Object.keys(used).length;
  const canRemove = isDM || (profile && profile.kind !== "agent");
  const removeItem = (id) => {
    if (!canRemove) return;
    const item = inv.find((x) => x.id === id);
    if (!item) return;
    const who = isDM ? "The DM" : profile?.name || "Someone";
    onPatch({
      "downtime.inventory": inv.filter((x) => x.id !== id),
      "downtime.log": [{ t: `${who} removes ${item.name} from the party inventory.`, ts: Date.now() }, ...(dt.log || [])].slice(0, CH.LOG_CAP),
    });
  };
  const pad = Math.max(0, 12 - inv.length);
  return (
    <div>
      <Head title="PARTY INVENTORY" hint={`${inv.length} item${inv.length === 1 ? "" : "s"} · shared across the group${usedCount ? ` · ${usedCount} recipe${usedCount === 1 ? "" : "s"} on weekly cooldown, resets in ${fmtCraftLeft(craftWeekResetMs())}` : ""}`} />
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        {inv.map((it) => {
          const RC = RARITIES[it.rarity] || RARITIES.common;
          return (
            <div key={it.id} style={{ position: "relative", width: 148, borderRadius: 9, border: `1.5px solid ${RC.ink}aa`, background: "rgba(8,16,18,0.5)", padding: "10px 8px 9px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, textAlign: "center" }}>
              {canRemove && (
                <button onClick={() => removeItem(it.id)} title="Remove from the party inventory" className="disp"
                  style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, lineHeight: "16px", padding: 0, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: `1px solid ${J.wax}88`, color: J.waxBright, cursor: "pointer", fontSize: 14 }}>
                  −
                </button>
              )}
              <Icon name={it.icon || "crate"} size={28} color={RC.bright} />
              <span className="disp" style={{ fontSize: 12.5, color: RC.bright, lineHeight: 1.2 }}>{it.name}</span>
              <span style={{ fontSize: 11, color: PALETTE.parchDim }}>by {it.by} · {new Date(it.ts).toLocaleDateString()}</span>
            </div>
          );
        })}
        {[...Array(pad)].map((_, i) => (
          <div key={`pad${i}`} style={{ width: 148, minHeight: 96, borderRadius: 9, border: `1.5px dashed ${J.brass}28`, background: "rgba(0,0,0,0.3)" }} />
        ))}
      </div>
      {atBench.length > 0 && (
        <>
          <Head title="IN PROGRESS" hint="active projects across the party" />
          {atBench.map((p) => {
            const left = p.craft.doneTs - Date.now();
            return (
              <div key={p.name + p.craft.startTs} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", marginBottom: 5, borderRadius: 7, background: "rgba(8,16,18,0.4)", border: `1px solid ${J.brass}1a` }}>
                <Icon name={p.craft.icon || "anvil"} size={20} color={J.brass} />
                <span style={{ fontSize: 14.5, color: PALETTE.parch }}><b style={{ color: J.parchment }}>{p.name}</b>: {p.craft.name}</span>
                <span className="disp" style={{ marginLeft: "auto", fontSize: 12, color: left <= 0 ? "#8fc06f" : PALETTE.parchDim }}>{left <= 0 ? "READY" : `ready in ${fmtCraftLeft(left)}`}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

const secTitle = { fontSize: 14, color: J.brass, letterSpacing: "0.2em", margin: "0 0 10px" };
const actionCard = { textAlign: "left", padding: "10px 13px", borderRadius: 8, background: `linear-gradient(160deg, rgba(43,29,16,0.85), rgba(25,16,9,0.92))`, border: `1px solid ${J.brass}44`, fontFamily: "inherit", boxShadow: "inset 0 1px 0 rgba(217,185,106,0.10)" };
const rumorBtn = { display: "block", width: "100%", textAlign: "left", padding: "11px 14px", marginBottom: 8, borderRadius: 6, background: "rgba(255,255,255,0.28)", border: `1px solid ${J.inkSoft}44`, cursor: "pointer", fontFamily: "inherit" };
const choiceStrip = { display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", padding: "12px 15px", borderRadius: 7, background: "rgba(255,255,255,0.30)", border: `1px solid ${J.inkSoft}55`, color: J.inkDark, fontFamily: "inherit" };
const waxBtn = { background: `linear-gradient(${J.waxBright}, ${J.wax})`, color: J.parchment, border: "none", borderRadius: 6, padding: "10px 22px", cursor: "pointer", fontSize: 14, letterSpacing: "0.12em" };
const dmBtn = { background: "transparent", color: PALETTE.parchDim, border: `1px solid ${J.brass}33`, borderRadius: 4, padding: "3px 9px", cursor: "pointer", fontSize: 12, fontFamily: "'Cinzel', serif", letterSpacing: "0.05em" };
