// ===========================================================================
// THE DROWNED WORLD — game content
// Coordinates are in the 1360 x 768 space of the map image (public/map.png).
// ===========================================================================

export const MAP_W = 1360;
export const MAP_H = 768;

export const PALETTE = {
  ink: "#0e1518", deep: "#13242b", sea: "#1b3640",
  parch: "#e7d6ad", parchDim: "#b6a378",
  gold: "#d4af57", goldBright: "#f0cf72", bone: "#f3ead4",
  ok: "#8fc06f", bad: "#c25a44",
};

export const FACTIONS = {
  Boughs: { color: "#9ab87e", sym: "❧", label: "Boughs", blurb: "Elves of the living crown, tending the World Tree's last green halls." },
  Faithful: { color: "#74b0c9", sym: "♆", label: "Faithful", blurb: "Sea-priests who bargain with the drowned gods for safe passage." },
  Fliers: { color: "#d6ad53", sym: "⚙", label: "Soaring Folk", blurb: "Sky-engineers and artificers who keep the airdocks aloft." },
  Faithless: { color: "#bb5d45", sym: "☠", label: "Faithless", blurb: "Godless salvagers and raiders who trust only the take." },
  Sunken: { color: "#8a7cc0", sym: "⚓", label: "Sunken Realms", blurb: "Dwellers of the deep roads, keepers of drowned lore." },
  Kraken: { color: "#c2455a", sym: "✺", label: "Kraken", blurb: "The great devouring threat beneath, beholden to no one." },
};


// Symbol + label, the way a faction's name should appear anywhere it is spoken.
export const fLabel = (k) => FACTIONS[k] ? `${FACTIONS[k].sym} ${FACTIONS[k].label}` : k;

export const NODES = {
  hearth:   { x: 1080, y: 235, name: "Hearthbough",        faction: "Boughs",    start: true },
  skyhook:  { x: 805,  y: 285, name: "Skyhook",        faction: "Fliers" },
  weeping:  { x: 790,  y: 438, name: "Weeping Roots",  faction: "Sunken" },
  spire:    { x: 1035, y: 588, name: "Drowned Spire",  faction: "Sunken" },
  reach:    { x: 632,  y: 330, name: "Umberlee's Reach",   faction: "Faithful" },
  atoll:    { x: 458,  y: 298, name: "Ashen Atoll",    faction: "Fliers" },
  bazaar:   { x: 460,  y: 418, name: "Brine Bazaar",   faction: "Fliers" },
  sunkbough:{ x: 648,  y: 528, name: "Sunken Bough",   faction: "Sunken" },
  court:    { x: 830,  y: 618, name: "Deep Court",     faction: "Sunken" },
  graves:   { x: 348,  y: 608, name: "Gravewater Lanes",   faction: "Faithless" },
  tidewrack:{ x: 122,  y: 548, name: "Tidewrack Shallows", faction: "Faithless" },
  gate:     { x: 352,  y: 372, name: "Maelstrom Gate", faction: "Kraken" },
  coil:     { x: 216,  y: 232, name: "Sleeping Coil",  faction: "Kraken" },
  farmooring:{ x: 1258, y: 442, name: "Far Mooring",   faction: "Fliers" },
};

export const ROUTES = [
  { id: "hearth-skyhook", from: "hearth", to: "skyhook", faction: "Fliers", dc: 11,
    benefit: "Resupply at the airdocks: +3 Supplies.", cost: "The Soaring Folk charge in coin. -1 Supplies later.",
    risk: "Scrutiny from the engineers. -1 Soaring Folk reputation.", rep: { Fliers: 1 }, supplyGain: 3, repFail: { Fliers: -1 } },
  { id: "hearth-weeping", from: "hearth", to: "weeping", faction: "Sunken", dc: 12,
    benefit: "The roots whisper safe passage. +2 Resolve.", cost: "The dead take note. -1 Boughs reputation.",
    risk: "A grasping root pulls you under. Lose 2 Resolve.", rep: { Sunken: 1, Boughs: -1 }, resolveGain: 2, resolveFail: 2 },
  { id: "hearth-spire", from: "hearth", to: "spire", faction: "Sunken", dc: 12,
    benefit: "Salvage from the drowned tower: +2 Supplies.", cost: "Cold and slow going. -1 Resolve.",
    risk: "Something answers your knock. Lose 2 Resolve.", rep: { Sunken: 1 }, supplyGain: 2, resolveFail: 2 },
  { id: "skyhook-reach", from: "skyhook", to: "reach", faction: "Faithful", dc: 13,
    benefit: "A sea god's boon, lasting until your next landfall.", cost: "The Boughs name you collaborator. -2 Boughs reputation.",
    risk: "The tithe is blood. Lose 3 Resolve.", rep: { Faithful: 2, Boughs: -2 }, boon: "Umberlee's Favor (+2 to next party roll)", resolveFail: 3 },
  { id: "skyhook-atoll", from: "skyhook", to: "atoll", faction: "Fliers", dc: 11,
    benefit: "The forge-isle arms you: +2 Supplies, +1 Resolve.", cost: "Soot and heat. -1 Resolve.",
    risk: "An eruption scatters the docks. Lose 2 Resolve.", rep: { Fliers: 1 }, supplyGain: 2, resolveGain: 1, resolveFail: 2 },
  { id: "skyhook-weeping", from: "skyhook", to: "weeping", faction: "Sunken", dc: 10,
    benefit: "A quiet descent down the trunk. +1 Resolve.", cost: "The branch groans under you.",
    risk: "The bark gives way. Lose 1 Resolve.", rep: { Sunken: 1 }, resolveGain: 1, resolveFail: 1 },
  { id: "weeping-sunkbough", from: "weeping", to: "sunkbough", faction: "Sunken", dc: 12,
    benefit: "Glowing coral lights the deep road. +2 Resolve.", cost: "The pressure builds. -1 Supplies.",
    risk: "Lost in the lightless boughs. Lose 3 Resolve.", rep: { Sunken: 1 }, resolveGain: 2, supplyFail: 1, resolveFail: 3 },
  { id: "weeping-reach", from: "weeping", to: "reach", faction: "Faithful", dc: 12,
    benefit: "Pilgrims share their stores. +2 Supplies.", cost: "You owe the priesthood. -1 Faithless reputation.",
    risk: "A zealot turns on you. Lose 2 Resolve.", rep: { Faithful: 1 }, supplyGain: 2, resolveFail: 2 },
  { id: "spire-court", from: "spire", to: "court", faction: "Sunken", dc: 12,
    benefit: "Audience with a coral lord: +2 Sunken reputation.", cost: "The deep is jealous. -1 Supplies.",
    risk: "Aboleth whispers worm in. Lose 2 Resolve.", rep: { Sunken: 2 }, resolveFail: 2 },
  { id: "court-sunkbough", from: "court", to: "sunkbough", faction: "Sunken", dc: 11,
    benefit: "The court grants safe current. +2 Resolve.", cost: "A long, dark swim. -1 Resolve.",
    risk: "The current turns against you. Lose 2 Resolve.", rep: { Sunken: 1 }, resolveGain: 2, resolveFail: 2 },
  { id: "court-graves", from: "court", to: "graves", faction: "Faithless", dc: 14,
    benefit: "Plunder hauled up from the trench: +4 Supplies.", cost: "Hunted thereafter.",
    risk: "Mutiny in the dark. Lose 3 Resolve.", rep: { Faithless: 1 }, supplyGain: 4, resolveFail: 3 },
  { id: "reach-atoll", from: "reach", to: "atoll", faction: "Fliers", dc: 11,
    benefit: "Trade at the forge: +2 Supplies.", cost: "The smiths drive a hard bargain. -1 Supplies later.",
    risk: "A deal gone sour. -1 Fliers reputation.", rep: { Fliers: 1 }, supplyGain: 2, repFail: { Fliers: -1 } },
  { id: "reach-bazaar", from: "reach", to: "bazaar", faction: "Fliers", dc: 11,
    benefit: "The raft-market resupplies you: +3 Supplies.", cost: "Crowds and cutpurses. -1 Resolve.",
    risk: "Robbed blind. -2 Supplies.", rep: { Fliers: 1 }, supplyGain: 3, supplyFail: 2 },
  { id: "reach-gate", from: "reach", to: "gate", faction: "Kraken", dc: 15,
    benefit: "A faithful charm parts the storm. +3 Resolve.", cost: "The deep notices you.",
    risk: "The Gate nearly takes you. Lose 4 Resolve.", rep: {}, resolveGain: 3, resolveFail: 4 },
  { id: "atoll-gate", from: "atoll", to: "gate", faction: "Kraken", dc: 15,
    benefit: "Forged anchors hold against the pull. +3 Resolve.", cost: "Iron strains and snaps.",
    risk: "Dragged toward the maw. Lose 4 Resolve.", rep: {}, resolveGain: 3, resolveFail: 4 },
  { id: "bazaar-sunkbough", from: "bazaar", to: "sunkbough", faction: "Sunken", dc: 11,
    benefit: "A diver guides you down. +1 Resolve, +1 Supplies.", cost: "The guide wants paying. -1 Supplies later.",
    risk: "The guide vanishes mid-dive. Lose 2 Resolve.", rep: { Sunken: 1 }, resolveGain: 1, supplyGain: 1, resolveFail: 2 },
  { id: "bazaar-graves", from: "bazaar", to: "graves", faction: "Faithless", dc: 13,
    benefit: "A raider's shortcut: +1 Resolve.", cost: "Blood debt. -1 Faithful reputation.",
    risk: "Ambush in the dark water. Lose 4 Resolve.", rep: { Faithless: 2, Faithful: -1 }, resolveGain: 1, resolveFail: 4 },
  { id: "bazaar-tidewrack", from: "bazaar", to: "tidewrack", faction: "Faithless", dc: 12,
    benefit: "Scavenge the wreck-fields: +3 Supplies.", cost: "Sharp edges and rot. -1 Resolve.",
    risk: "The wrecks are claimed. Lose 2 Resolve.", rep: { Faithless: 1 }, supplyGain: 3, resolveFail: 2 },
  { id: "graves-tidewrack", from: "graves", to: "tidewrack", faction: "Faithless", dc: 12,
    benefit: "The faithless wave you through. +2 Resolve.", cost: "You owe them now. -1 Resolve later.",
    risk: "A toll paid in blood. Lose 3 Resolve.", rep: { Faithless: 1 }, resolveGain: 2, resolveFail: 3 },
  { id: "tidewrack-gate", from: "tidewrack", to: "gate", faction: "Kraken", dc: 15,
    benefit: "You slip past the outer storm. +2 Resolve.", cost: "The water turns black.",
    risk: "The Gate swallows your wake. Lose 4 Resolve.", rep: {}, resolveGain: 2, resolveFail: 4 },
  { id: "gate-coil", from: "gate", to: "coil", faction: "Kraken", dc: 18,
    benefit: "You crossed the Coil and lived. +5 Resolve, legend grows.", cost: "Nothing here is free.",
    risk: "It wakes. Lose ALL Resolve.", rep: {}, resolveGain: 5, resolveWipe: true },
  { id: "hearth-farmooring", from: "hearth", to: "farmooring", faction: "Fliers", dc: 10,
    benefit: "The lookouts share supplies and rumor. +2 Supplies.", cost: "A long flight east. -1 Resolve.",
    risk: "Lost in the eastern fog. Lose 2 Resolve.", rep: { Fliers: 1 }, supplyGain: 2, resolveFail: 2 },
  { id: "farmooring-spire", from: "farmooring", to: "spire", faction: "Fliers", dc: 11,
    benefit: "Charts of safe passage. +1 Resolve, +1 Supplies.", cost: "The keeper bargains hard. -1 Supplies later.",
    risk: "The charts were wrong. Lose 2 Resolve.", rep: { Fliers: 1 }, resolveGain: 1, supplyGain: 1, resolveFail: 2 },
];

export function initialState() {
  return {
    current: "hearth", resolve: 7, supplies: 4,
    rep: { Boughs: 0, Faithful: 0, Fliers: 0, Faithless: 0, Sunken: 0, Kraken: 0 },
    boon: null, voteOpen: false, votes: {}, presence: {}, rolling: false, journal: {}, music: null,
    saltYear: 312, saltDay: 1, saltTurnTs: 0, skies: 0, saltV: 2,
    upgrades: {}, combat: {},
    downtime: { profiles: {}, boons: 0, boonLog: [], log: [], rumors: [], clues: [], delve: null },
    lastResult: null,
    log: [{ t: "You begin at Hearthbough, in the living crown of the fallen tree.", k: "sys", ts: Date.now() }],
  };
}

export function safeName(s) { return (s || "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40) || "anon"; }

// Strip a leading "The " for display/search (used in the Codex).
export function stripThe(s) { return (s || "").replace(/^the\s+/i, ""); }

// Vehicle upgrades the party can buy with Resolve. Each applies to one craft
// and has three tiers; Resolve cost rises per tier. The DM lowers Resolve with
// the − control when an upgrade is bought; this catalog is the shared reference.
// Costs are scaled to how Resolve is earned by travel (1-3 per good leg), so an
// upgrade is a real saved-for investment, which keeps Resolve meaningful.
export const VEHICLES = ["Ship", "Zeppelin", "Submarine"];

// Vehicle combat stats, used for vehicle-on-vehicle fights run in D&D proper.
// Hull = the craft's hit points. Armor = its AC. Speed = movement. Maneuver =
// bonus to piloting/dodge checks. Firepower = attack/damage bonus of mounted
// arms. Stealth = bonus to avoid detection. Sensors = bonus to detect others.
export const VEHICLE_STATS = ["Hull", "Armor", "Speed", "Maneuver", "Firepower", "Stealth", "Sensors"];
export const VEHICLE_STAT_UNIT = { Hull: "HP", Armor: "AC", Speed: "ft" }; // others are +mods

export const VEHICLE_BASE = {
  Ship:      { Hull: 40, Armor: 15, Speed: 30, Maneuver: 0, Firepower: 5, Stealth: 0, Sensors: 2 },
  Zeppelin:  { Hull: 24, Armor: 12, Speed: 60, Maneuver: 3, Firepower: 2, Stealth: 1, Sensors: 5 },
  Submarine: { Hull: 32, Armor: 16, Speed: 20, Maneuver: 1, Firepower: 3, Stealth: 6, Sensors: 3 },
};

// Each upgrade fills one slot on its vehicle. Buying a tier replaces the lower
// tier (its `add` is the full stat contribution at that tier). Costs in Resolve
// scale with travel income, so upgrading is a real saved-for investment.
export const VEHICLE_IMG = { Ship: "/ship.png", Zeppelin: "/zeppelin.png", Submarine: "/submarine.png" };

// Each upgrade fills one slot on its vehicle. Buying a tier replaces the lower
// tier (its `add` is the full stat contribution at that tier). Costs are a flat
// 2 / 4 / 6 Resolve ladder. `hot` is the marker position (% of the vehicle
// image) so the slot can be clicked on the picture in the Loadout view.
export const VEHICLE_IMAGES = { Ship: "/ship.png", Zeppelin: "/zeppelin.png", Submarine: "/submarine.png" };

// Each upgrade fills one slot on its vehicle. Buying a tier replaces the lower
// tier (its `add` is the full stat contribution at that tier). All upgrades cost
// 2 / 4 / 6 Resolve for tiers 1 / 2 / 3. `hotspot` is the {x,y} percentage point
// on the vehicle image where the fitting sits (for the clickable point-map).
export const VEHICLE_UPGRADES = [
  // ---- Ship ----
  { key: "hull", name: "Reinforced Hull", vehicle: "Ship", slot: "Hull", hotspot: { x: 40, y: 87 }, tiers: [
    { cost: 2, add: { Hull: 10, Armor: 1 }, effect: "Plated ribs. +10 Hull, +1 Armor." },
    { cost: 4, add: { Hull: 20, Armor: 2 }, effect: "Double hull. +20 Hull, +2 Armor." },
    { cost: 6, add: { Hull: 35, Armor: 3 }, effect: "Ironclad keel. +35 Hull, +3 Armor." } ] },
  { key: "rigging", name: "Stormsail Rigging", vehicle: "Ship", slot: "Sails", hotspot: { x: 46, y: 26 }, tiers: [
    { cost: 2, add: { Speed: 10, Maneuver: 1 }, effect: "Cut rigging. +10 ft Speed, +1 Maneuver." },
    { cost: 4, add: { Speed: 20, Maneuver: 2 }, effect: "Storm sails. +20 ft Speed, +2 Maneuver." },
    { cost: 6, add: { Speed: 30, Maneuver: 3 }, effect: "Master rig. +30 ft Speed, +3 Maneuver." } ] },
  { key: "harpoon", name: "Harpoon Battery", vehicle: "Ship", slot: "Guns", hotspot: { x: 50, y: 80 }, tiers: [
    { cost: 2, add: { Firepower: 2 }, effect: "A pair of harpoon guns. +2 Firepower." },
    { cost: 4, add: { Firepower: 4 }, effect: "Full battery. +4 Firepower." },
    { cost: 6, add: { Firepower: 6 }, effect: "Repeating ballistae. +6 Firepower." } ] },
  { key: "ram", name: "Ram Prow", vehicle: "Ship", slot: "Prow", hotspot: { x: 82, y: 66 }, tiers: [
    { cost: 2, add: { Firepower: 1, Hull: 5 },  effect: "Iron beak. +1 Firepower, +5 Hull." },
    { cost: 4, add: { Firepower: 2, Hull: 10 }, effect: "Reinforced ram. +2 Firepower, +10 Hull." },
    { cost: 6, add: { Firepower: 3, Hull: 15 }, effect: "Breaching prow. +3 Firepower, +15 Hull." } ] },
  // ---- Zeppelin ----
  { key: "liftgas", name: "Lift-Gas Cells", vehicle: "Zeppelin", slot: "Envelope", hotspot: { x: 45, y: 22 }, tiers: [
    { cost: 2, add: { Speed: 15 },               effect: "Extra cells. +15 ft Speed." },
    { cost: 4, add: { Speed: 30 },               effect: "High-lift mix. +30 ft Speed." },
    { cost: 6, add: { Speed: 45, Maneuver: 1 },  effect: "Ascendant lift. +45 ft Speed, +1 Maneuver." } ] },
  { key: "anchors", name: "Storm Anchors", vehicle: "Zeppelin", slot: "Rudder", hotspot: { x: 88, y: 28 }, tiers: [
    { cost: 2, add: { Maneuver: 1, Armor: 1 }, effect: "Trim anchors. +1 Maneuver, +1 Armor." },
    { cost: 4, add: { Maneuver: 2, Armor: 2 }, effect: "Storm vanes. +2 Maneuver, +2 Armor." },
    { cost: 6, add: { Maneuver: 3, Armor: 3 }, effect: "Gyro-stabilized. +3 Maneuver, +3 Armor." } ] },
  { key: "gondola", name: "Observation Gondola", vehicle: "Zeppelin", slot: "Gondola", hotspot: { x: 45, y: 56 }, tiers: [
    { cost: 2, add: { Sensors: 2 }, effect: "Spyglass post. +2 Sensors." },
    { cost: 4, add: { Sensors: 4 }, effect: "Optics array. +4 Sensors." },
    { cost: 6, add: { Sensors: 6 }, effect: "Far-seeing crow's nest. +6 Sensors." } ] },
  { key: "zepguns", name: "Bomb Racks", vehicle: "Zeppelin", slot: "Guns", hotspot: { x: 20, y: 80 }, tiers: [
    { cost: 2, add: { Firepower: 2 }, effect: "Drop munitions. +2 Firepower." },
    { cost: 4, add: { Firepower: 4 }, effect: "Bomb bay. +4 Firepower." },
    { cost: 6, add: { Firepower: 6 }, effect: "Incendiary racks. +6 Firepower." } ] },
  // ---- Submarine ----
  { key: "plating", name: "Pressure Plating", vehicle: "Submarine", slot: "Hull", hotspot: { x: 50, y: 62 }, tiers: [
    { cost: 2, add: { Hull: 8,  Armor: 1 }, effect: "Deep plating. +8 Hull, +1 Armor." },
    { cost: 4, add: { Hull: 16, Armor: 2 }, effect: "Crush-rated hull. +16 Hull, +2 Armor." },
    { cost: 6, add: { Hull: 28, Armor: 3 }, effect: "Abyssal shell. +28 Hull, +3 Armor." } ] },
  { key: "silentdrive", name: "Silent Drive", vehicle: "Submarine", slot: "Drive", hotspot: { x: 10, y: 52 }, tiers: [
    { cost: 2, add: { Stealth: 2, Speed: 5 },  effect: "Muffled screw. +2 Stealth, +5 ft Speed." },
    { cost: 4, add: { Stealth: 4, Speed: 10 }, effect: "Whisper drive. +4 Stealth, +10 ft Speed." },
    { cost: 6, add: { Stealth: 6, Speed: 15 }, effect: "Ghost drive. +6 Stealth, +15 ft Speed." } ] },
  { key: "sonar", name: "Sonar Array", vehicle: "Submarine", slot: "Sonar", hotspot: { x: 50, y: 16 }, tiers: [
    { cost: 2, add: { Sensors: 2 }, effect: "Passive sonar. +2 Sensors." },
    { cost: 4, add: { Sensors: 4 }, effect: "Active sonar. +4 Sensors." },
    { cost: 6, add: { Sensors: 6 }, effect: "Deep-ear array. +6 Sensors." } ] },
  { key: "subguns", name: "Torpedo Tubes", vehicle: "Submarine", slot: "Guns", hotspot: { x: 70, y: 55 }, tiers: [
    { cost: 2, add: { Firepower: 2 }, effect: "Bow tube. +2 Firepower." },
    { cost: 4, add: { Firepower: 4 }, effect: "Twin tubes. +4 Firepower." },
    { cost: 6, add: { Firepower: 6 }, effect: "Full salvo bank. +6 Firepower." } ] },
];

export function upgradesFor(vehicle) { return VEHICLE_UPGRADES.filter((u) => u.vehicle === vehicle); }

// Combat health. The vehicle's total HP pool is its Hull stat, split across its
// systems by weight (the hull/prow take the most, weapons next, the rest less).
// Each system can be damaged independently; the pool is the sum of them.
const HP_WEIGHT = { Hull: 3, Prow: 2, Guns: 2, Sails: 1, Drive: 1, Envelope: 1, Rudder: 1, Gondola: 1, Sonar: 1 };
export function vehicleHP(vehicle, owned = {}) {
  const total = vehicleStats(vehicle, owned).Hull;
  const ups = upgradesFor(vehicle);
  const wsum = ups.reduce((a, u) => a + (HP_WEIGHT[u.slot] || 1), 0);
  const systems = ups.map((u) => ({
    key: u.key, slot: u.slot, name: u.name, hotspot: u.hotspot,
    max: Math.max(1, Math.round(total * (HP_WEIGHT[u.slot] || 1) / wsum)),
  }));
  const max = systems.reduce((a, s) => a + s.max, 0);
  return { max, systems };
}

// Current stats for a vehicle given owned tiers, e.g. owned = { hull: 2, ram: 1 }.
export function vehicleStats(vehicle, owned = {}) {
  const out = { ...VEHICLE_BASE[vehicle] };
  for (const u of upgradesFor(vehicle)) {
    const t = owned[u.key] || 0;
    if (t > 0) {
      const add = u.tiers[t - 1].add || {};
      for (const k in add) out[k] = (out[k] || 0) + add[k];
    }
  }
  return out;
}

// Supplies as a scaling threshold. Penalty deepens by 2 for each step below 3,
// capped at -6. At 3+ there is no penalty.
export const SUPPLY_PENALTY_MAX = 6;
export function supplyPenalty(s) {
  const n = s ?? 99;
  if (n >= 3) return 0;
  if (n === 2) return -2;
  if (n === 1) return -4;
  return -6; // 0 supplies and beyond
}
export function supplyStatus(s) {
  const n = s ?? 0;
  if (n >= 5) return { label: "Well-stocked", tone: "ok" };
  if (n >= 3) return { label: "Steady", tone: "ok" };
  if (n === 2) return { label: "Running low", tone: "warn" };
  if (n === 1) return { label: "Low", tone: "bad" };
  return { label: "Out", tone: "bad" };
}

// Pull a YouTube video id out of a pasted link or raw id.
export function parseYouTubeId(input) {
  if (!input) return null;
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1, 12) || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const parts = u.pathname.split("/").filter(Boolean);
    const si = parts.indexOf("shorts");
    if (si >= 0 && parts[si + 1]) return parts[si + 1].slice(0, 11);
    const ei = parts.indexOf("embed");
    if (ei >= 0 && parts[ei + 1]) return parts[ei + 1].slice(0, 11);
  } catch (e) { /* not a URL */ }
  return null;
}

export function routesFrom(nodeId) {
  return ROUTES.filter((r) => r.from === nodeId || r.to === nodeId).map((r) => ({
    route: r, dest: r.from === nodeId ? r.to : r.from,
  }));
}


// =============================================================================
// ARRIVAL FORTUNES: a layer of chance on every landing. On a route's success
// the destination deals one positive fortune; on a failure, one negative.
// Each carries a small swing in the only coins this world knows: Supplies,
// Resolve, and standing with the place's keepers. Some are pure omen.
// fx.rep applies to the destination's controlling faction.
// =============================================================================
export const FORTUNES = {
  hearth: {
    pos: [
      { t: "A warden recognizes your knots and waves you past the toll branch.", fx: { supplies: 1 } },
      { t: "Green light through the canopy, and fruit set out for travelers.", fx: { supplies: 1 } },
      { t: "A root-singer mends your lines while you sleep, humming the old growth songs.", fx: { supplies: 1 } },
      { t: "The harvest galleries are open, and the Boughs sell at kin prices.", fx: { supplies: 2 } },
      { t: "An elder blesses your bow with sap and silence. You stand straighter for it.", fx: { resolve: 1 } },
      { t: "You sleep in the living crown, and the Tree's slow heartbeat steadies yours.", fx: { resolve: 1 } },
      { t: "You return a lost charm to a warden's daughter. The Boughs remember.", fx: { rep: 1 } },
      { t: "Leaffall lands on your deck in the shape of a spiral. The singers call it luck." },
      { t: "A white bird nests in your rigging and the wardens refuse to charge a nesting ship." },
      { t: "Somewhere above, a branch blooms out of season. The whole bough hums about it." },
    ],
    neg: [
      { t: "The toll branch is double-staffed today, and the wardens count every crate.", fx: { supplies: -1 } },
      { t: "Sap fouls your lines overnight. Half a morning lost scraping it clean.", fx: { supplies: -1 } },
      { t: "Your berth sits under a weeping limb. Everything you own is sticky by dawn.", fx: { supplies: -1 } },
      { t: "A priest reads your wake and names it ill-omened. Doors close politely all day.", fx: { resolve: -1 } },
      { t: "The night choir sings the drowning lament, and it follows you into sleep.", fx: { resolve: -1 } },
      { t: "You track salt mud across a root shrine. The wardens see, and say nothing, loudly.", fx: { rep: -1 } },
      { t: "Bark splits near your mooring with a crack like a verdict. Folk eye your ship." },
      { t: "A warden asks your business twice, writes nothing down, and watches you go." },
      { t: "The canopy closes early tonight. The dark under the leaves is older than you." },
      { t: "Your name is misheard and repeated wrong up three galleries before you can stop it." },
    ],
  },
  skyhook: {
    pos: [
      { t: "A crane crew owes your harbor a favor and unloads you for free.", fx: { supplies: 1 } },
      { t: "Surplus rivets and good rope, sold by the bucket at the shift change.", fx: { supplies: 1 } },
      { t: "An engineer trues your hull seams in trade for harbor gossip.", fx: { supplies: 1 } },
      { t: "A decommissioned lift-car is stripped for parts, and you are first in line.", fx: { supplies: 2 } },
      { t: "You ride the great hook to the top platform at dawn. The world looks survivable from here.", fx: { resolve: 1 } },
      { t: "The shift-whistle choir plays your ship in. Small thing. It helps.", fx: { resolve: 1 } },
      { t: "You catch a falling wrench before it brains a foreman. The dock talks about it all day.", fx: { rep: 1 } },
      { t: "Every gauge on the quay reads true today, and the engineers take it as a blessing." },
      { t: "A prentice paints your ship's name on the arrivals board in fine brass letters." },
      { t: "The lift-chains sing in the wind tonight, the note the old hands call fair-weather." },
    ],
    neg: [
      { t: "Berth fees went up at the last bell, payable in goods if your coin is short.", fx: { supplies: -1 } },
      { t: "A gantry drips grease across your deck cargo. Some of it is ruined.", fx: { supplies: -1 } },
      { t: "Dock inspection finds your lashings out of code. The fine is itemized.", fx: { supplies: -1 } },
      { t: "A lift-car screams past overloaded, and the whole platform holds its breath too long.", fx: { resolve: -1 } },
      { t: "The wind through the hook moans all night. Nobody on your ship sleeps well.", fx: { resolve: -1 } },
      { t: "You walk under a load line, and a foreman dresses you down in front of everyone.", fx: { rep: -1 } },
      { t: "Three whistles sound, which means an accident somewhere above. Work stops. Faces close." },
      { t: "Your paperwork is correct, which seems to disappoint the clerk personally." },
      { t: "A crane swings a shadow across your deck all afternoon, regular as a pendulum." },
      { t: "Someone chalks a tally mark on your hull at the waterline. Nobody admits to it." },
    ],
  },
  weeping: {
    pos: [
      { t: "The root caves drip fresh water today, sweet enough to cask.", fx: { supplies: 1 } },
      { t: "A Sunken forager trades cave fruit for surface salt, generous on her side.", fx: { supplies: 1 } },
      { t: "Glowmoss is in season, and the gatherers let you cut a lamp's worth.", fx: { supplies: 1 } },
      { t: "An old cache, sealed in wax above the tideline, opened in your honor.", fx: { supplies: 2 } },
      { t: "You sit where the roots weep and let them do your weeping for an hour.", fx: { resolve: 1 } },
      { t: "A deep-singer teaches you the breathing the roots taught her.", fx: { resolve: 1 } },
      { t: "You help carry a sick child up to the dry galleries. The Realms take note.", fx: { rep: 1 } },
      { t: "The weeping runs clear today. The keepers say the Tree is dreaming kindly." },
      { t: "Your lantern light catches in the root-water and scatters like a sky underfoot." },
      { t: "A blind elder names your ship by the sound of her hull, and smiles." },
    ],
    neg: [
      { t: "Rootwater gets into your stores, and the bread goes first.", fx: { supplies: -1 } },
      { t: "The low passage floods early, and you pay a guide to find the long way.", fx: { supplies: -1 } },
      { t: "Cave damp swells your sea chests shut. Prying them open costs hinges.", fx: { supplies: -1 } },
      { t: "The roots weep louder tonight, a sound like the whole world grieving at once.", fx: { resolve: -1 } },
      { t: "Your light gutters in the deep galleries, and the dark leans in friendly.", fx: { resolve: -1 } },
      { t: "You speak above a whisper in the weeping hall, once. Once was enough.", fx: { rep: -1 } },
      { t: "Something knocks on a root from the inside, twice, and is not heard again." },
      { t: "The guide counts your party at the entrance, and again at the exit, slowly." },
      { t: "A name very like yours is carved in the wall, with a date long past." },
      { t: "All the moss along your path has gone dark by the time you walk back." },
    ],
  },
  spire: {
    pos: [
      { t: "The tide uncovers the spire's old larder gallery, and the keepers share out.", fx: { supplies: 1 } },
      { t: "A salvage bell comes up full, and your help on the winch earns a cut.", fx: { supplies: 1 } },
      { t: "Dry shelves in the upper archive, and permission to copy what you need.", fx: { supplies: 1 } },
      { t: "A drowned strongroom gives up its door at last. You were standing close enough to share.", fx: { supplies: 2 } },
      { t: "From the spire's crown you watch the sun go down into the sea it conquered. It steadies you.", fx: { resolve: 1 } },
      { t: "The bells below ring the calm-water peal, felt in the bones more than heard.", fx: { resolve: 1 } },
      { t: "You surface a keeper's dropped ledger, ink unrun. The Realms owe you a courtesy.", fx: { rep: 1 } },
      { t: "Light through the drowned windows lays drowned saints across the water, whole again." },
      { t: "The archive smells of dry paper today, which the keepers insist is a good omen." },
      { t: "A scribe sketches your ship into the margin of the day's record, riding high." },
    ],
    neg: [
      { t: "The stair toll is in goods this season, and the keepers do not haggle.", fx: { supplies: -1 } },
      { t: "Spray through a broken light soaks a crate you would rather have kept dry.", fx: { supplies: -1 } },
      { t: "Your mooring scrapes the drowned cornice, and the repair is yours to fund.", fx: { supplies: -1 } },
      { t: "The bells below ring a peal no keeper will name for you.", fx: { resolve: -1 } },
      { t: "Down the flooded stairwell, your lamp finds a handrail polished by recent use.", fx: { resolve: -1 } },
      { t: "You shelve a borrowed volume one gallery wrong. The archivists treat it as a character flaw.", fx: { rep: -1 } },
      { t: "A window that was dark on your arrival is lit on your leaving. Top floor. Underwater." },
      { t: "The keepers are counting something in the lower galleries, and stop when you pass." },
      { t: "Your reflection in the flooded hall lags you by half a step, the whole way down." },
      { t: "Tonight the spire's shadow lies against the current, and nobody mentions it." },
    ],
  },
  reach: {
    pos: [
      { t: "The morning catch is blessed and abundant, and pilgrims must share by law.", fx: { supplies: 1 } },
      { t: "A priest seals your water casks against rot with wax and a word.", fx: { supplies: 1 } },
      { t: "Storm-offerings washed back ashore are free to any hand that needs them.", fx: { supplies: 1 } },
      { t: "The tithe-house overflows after a fearful week, and the Faithful redistribute.", fx: { supplies: 2 } },
      { t: "You stand the night vigil at the storm shrine, and come away washed clean inside.", fx: { resolve: 1 } },
      { t: "A sea-priest reads your palm, says nothing, and gives you a look of respect.", fx: { resolve: 1 } },
      { t: "You haul a foundering pilgrim boat off the bar. The Faithful sing your ship's name.", fx: { rep: 1 } },
      { t: "The sea lies flat as hammered pewter all day, and the priests walk carefully on it." },
      { t: "Salt crystals grow overnight on the shrine rail in the shape of a favorable rune." },
      { t: "A wave breaks against the seawall in perfect time with the morning bell, twelve times." },
    ],
    neg: [
      { t: "The storm tithe is collected on arrival, in goods, with witnesses.", fx: { supplies: -1 } },
      { t: "Gulls strip your deck stores while the whole quay watches a procession.", fx: { supplies: -1 } },
      { t: "A blessing on your hull turns out to cost more than the carpenter would have.", fx: { supplies: -1 } },
      { t: "The drowned god's name is spoken over the water at dusk, and the water listens.", fx: { resolve: -1 } },
      { t: "A priest watches you the length of the quay, lips moving, counting something.", fx: { resolve: -1 } },
      { t: "You laugh in the wrong silence. The Faithful's courtesy goes cold as the deep.", fx: { rep: -1 } },
      { t: "Every shrine candle leans toward your ship at once, then rights itself." },
      { t: "The tide comes in early, by minutes only, and the priests close the sea doors anyway." },
      { t: "An offering bowl set out at dawn is empty by noon, and no gull will land near it." },
      { t: "Your wake stays visible in the harbor far longer than wakes should." },
    ],
  },
  atoll: {
    pos: [
      { t: "The forges run surplus today, and offcuts go cheap to visiting hulls.", fx: { supplies: 1 } },
      { t: "An ash-fall coats the bay, and under it the shellfish beds are untouched.", fx: { supplies: 1 } },
      { t: "A cinder-smith mends your fittings for the story of how you bent them.", fx: { supplies: 1 } },
      { t: "A supply barge overshoots its drop, and salvage rights say finders keep.", fx: { supplies: 2 } },
      { t: "You watch the mountain breathe fire at a safe distance, and feel briefly fireproof.", fx: { resolve: 1 } },
      { t: "Hot springs above the docks, and an hour in them takes a year off your back.", fx: { resolve: 1 } },
      { t: "You beat out a deck fire on a stranger's boat before the bell finishes ringing.", fx: { rep: 1 } },
      { t: "The ash falls fine and gray as cathedral dust, and the forges sing through it." },
      { t: "A glassblower pulls a long blue thread from the furnace and gives it to your youngest hand." },
      { t: "Tonight the mountain's glow sits low and content, like a banked hearth." },
    ],
    neg: [
      { t: "Ash gets into everything with a lid, and some things without.", fx: { supplies: -1 } },
      { t: "Cinder burns pock your spare canvas before anyone smells smoke.", fx: { supplies: -1 } },
      { t: "The harbormaster levies a soot tax with a face that dares you to laugh.", fx: { supplies: -1 } },
      { t: "The mountain clears its throat at midnight, and the whole anchorage sits up till dawn.", fx: { resolve: -1 } },
      { t: "Grit in your collar, grit in your bread, grit in your dreams.", fx: { resolve: -1 } },
      { t: "You tie up at a forge clan's private bollard. They are civil about it forever.", fx: { rep: -1 } },
      { t: "The hot springs run cold for an hour, and the smiths all find reasons to check their tools." },
      { t: "A vent opens offshore with a hiss like a kettle the size of a church." },
      { t: "Your shadow on the ash is the only one on the quay with blurred edges." },
      { t: "The forges all damp down at the same moment, unplanned, and nobody jokes about it." },
    ],
  },
  bazaar: {
    pos: [
      { t: "A stall clears out at closing bell, and you are standing in the right place.", fx: { supplies: 1 } },
      { t: "Your harbor's coin is favored this week, and prices bow to it.", fx: { supplies: 1 } },
      { t: "A spice-seller pays you in goods to mind her stall through the noon crush.", fx: { supplies: 1 } },
      { t: "A confiscated cargo is auctioned off cheap, no questions invited.", fx: { supplies: 2 } },
      { t: "You haggle a legendary stallholder to a draw, and the crowd buys you lunch.", fx: { resolve: 1 } },
      { t: "Music from three stalls braids into one tune over the canal, just for a minute.", fx: { resolve: 1 } },
      { t: "You catch a cutpurse with a hand in a matron's basket. The market masters owe you.", fx: { rep: 1 } },
      { t: "Every awning in the row is new-dyed, and the whole canal runs with color." },
      { t: "A fortune-teller refuses your coin, which her neighbors swear has never happened." },
      { t: "The noon crush parts around your party like water around a good keel." },
    ],
    neg: [
      { t: "A price board changes while you count your coin, in the house's favor.", fx: { supplies: -1 } },
      { t: "Short weights at the chandler's, discovered three canals too late.", fx: { supplies: -1 } },
      { t: "A porter takes your crate to entirely the wrong barge, efficiently.", fx: { supplies: -1 } },
      { t: "The crowd's roar swallows your thoughts whole, and gives none of them back.", fx: { resolve: -1 } },
      { t: "Someone in the crush knows your name, uses it once behind you, and is gone.", fx: { resolve: -1 } },
      { t: "You decline the wrong stallholder's tea. By dusk every awning knows it.", fx: { rep: -1 } },
      { t: "Three different sellers offer you the same map, each swearing the others' are fakes." },
      { t: "A beggar reads your palm uninvited, frowns, and gives you a coin instead." },
      { t: "The canal runs backward under the spice bridge for the space of ten heartbeats." },
      { t: "Every price you are quoted today ends in the same three digits." },
    ],
  },
  sunkbough: {
    pos: [
      { t: "The branch-orchards above the waterline are heavy, and gleaning is lawful here.", fx: { supplies: 1 } },
      { t: "A Sunken net crew shares a haul too big for their smokehouse.", fx: { supplies: 1 } },
      { t: "Dry hollows in the great branch, offered to you for storage at a kind rate.", fx: { supplies: 1 } },
      { t: "An old Boughs cache, drowned and forgotten, surfaces at the low ebb under your mooring.", fx: { supplies: 2 } },
      { t: "You walk the drowned branch at low tide, on the back of something that survived the end of the world.", fx: { resolve: 1 } },
      { t: "Green light through green water, and for an hour the drowning looks like mercy.", fx: { resolve: 1 } },
      { t: "You re-step a leaning shrine post before the tide can take it. The Realms notice.", fx: { rep: 1 } },
      { t: "New growth on the sunken branch, first in living memory, a hand's width of stubborn green." },
      { t: "Fish school through the drowned galleries in the shape of a slow silver leaf." },
      { t: "The water over the bough lies so clear today that depth becomes a rumor." },
    ],
    neg: [
      { t: "Barnacle scrape on the drowned branch opens a seam in your hull planking.", fx: { supplies: -1 } },
      { t: "Wet rot found in a ration crate, two days further along than anyone hoped.", fx: { supplies: -1 } },
      { t: "The mooring wardens charge by draft, and measure yours generously.", fx: { supplies: -1 } },
      { t: "Below the surface, the great branch groans like a door deciding.", fx: { resolve: -1 } },
      { t: "You dream of climbing the bough when it stood, and wake the moment it falls.", fx: { resolve: -1 } },
      { t: "You take fruit from a marked branch. Lawful, the wardens admit. Remembered, all the same.", fx: { rep: -1 } },
      { t: "A carved face in the drowned bark, just below the waterline, freshly cleaned by someone." },
      { t: "The tide stalls at dead low for too long, as if the sea were reading the branch." },
      { t: "Leaves rise from the deep water around your hull, green ones, from no tree above." },
      { t: "Every bird on the bough leaves at once, soundless, in the same direction." },
    ],
  },
  court: {
    pos: [
      { t: "A courtier's household overstocked the season, and discreetly sells the excess.", fx: { supplies: 1 } },
      { t: "Your gift at the threshold is judged adequate, and the pantries open accordingly.", fx: { supplies: 1 } },
      { t: "A page is assigned to your party, and doors that stick for others glide for you.", fx: { supplies: 1 } },
      { t: "You win a wager at the tide-tables that the loser, being noble, must triple.", fx: { supplies: 2 } },
      { t: "The Deep Court's choir performs the surfacing hymn, and you remember what air is for.", fx: { resolve: 1 } },
      { t: "A pale lord nods to you specifically across the audience hall. Worth more than coin, here.", fx: { resolve: 1 } },
      { t: "You keep a drunk envoy from insulting the wrong house at the wrong table.", fx: { rep: 1 } },
      { t: "Lamps of cold fire line the colonnade tonight, lit for an occasion no one will name." },
      { t: "The court painter asks to sketch your weathered hands, and pays in compliments." },
      { t: "Protocol is suspended for one hour by ancient custom, and the laughter is real." },
    ],
    neg: [
      { t: "Threshold courtesy demands a gift, and the herald appraises yours aloud.", fx: { supplies: -1 } },
      { t: "Your coat is wrong for the season's color, and a correct one must be hired.", fx: { supplies: -1 } },
      { t: "A door fee here, a stair fee there, a fee for the list of fees.", fx: { supplies: -1 } },
      { t: "The pale courtiers smile precisely, and you cannot stop counting their teeth.", fx: { resolve: -1 } },
      { t: "Protocol stretches a simple errand across an entire airless afternoon.", fx: { resolve: -1 } },
      { t: "You address a Voice of the Court before being addressed. The silence is educational.", fx: { rep: -1 } },
      { t: "Your name is entered in a ledger you are not permitted to see, under a heading likewise." },
      { t: "Two courtiers duel with compliments over something you said. Both bow to you after. Neither means it." },
      { t: "The audience hall's water-clock runs slow, and everyone pretends time does too." },
      { t: "An usher walks you out by a longer route than you walked in, past more guards." },
    ],
  },
  graves: {
    pos: [
      { t: "Last night's winners are buying, and the whole lane drinks on their luck.", fx: { supplies: 1 } },
      { t: "A wreck-auction ends in a brawl, and lots walk off cheap in the confusion.", fx: { supplies: 1 } },
      { t: "A raider captain pays you in goods to crew her winch for one honest hour.", fx: { supplies: 1 } },
      { t: "A debt nobody expected repaid lands in your favor, in full, in front of witnesses.", fx: { supplies: 2 } },
      { t: "You hold your own at the knife-and-coin table and walk away on your own legs.", fx: { resolve: 1 } },
      { t: "An old Faithless skald sings the lane's history, and your harbor gets a verse.", fx: { resolve: 1 } },
      { t: "You drag a blackout drunk off the tideline before the water takes the decision.", fx: { rep: 1 } },
      { t: "Dice come up double sixes three tables in a row, and the lane declares a lucky night." },
      { t: "A famous wreck-diver shakes your hand for no reason she will explain." },
      { t: "Lantern light off the gravewater turns the whole lane briefly golden." },
    ],
    neg: [
      { t: "The dice were honest right up until your coin reached the table.", fx: { supplies: -1 } },
      { t: "A protection man explains the lane's insurance scheme with great patience.", fx: { supplies: -1 } },
      { t: "Your mooring line is borrowed overnight by someone with better need of it.", fx: { supplies: -1 } },
      { t: "A fight starts two tables over and finishes one table over.", fx: { resolve: -1 } },
      { t: "Someone sings the drowning ballad with all the cruel verses left in.", fx: { resolve: -1 } },
      { t: "You back the loser in a quarrel everyone else saw coming.", fx: { rep: -1 } },
      { t: "The tide brings a ship's wheel up the lane and leaves it at the tavern door." },
      { t: "A stranger pays your tab, leaves no name, and the keep will not describe them." },
      { t: "All the lane's dogs follow your party at a distance, silent, for three streets." },
      { t: "Chalked on your hull by morning: a circle, a line through it, and nothing else." },
    ],
  },
  tidewrack: {
    pos: [
      { t: "Low tide bares a fresh wreck field, and the pick of it is honest work.", fx: { supplies: 1 } },
      { t: "A scavver crew trades hull bones for your news of the deeper lanes.", fx: { supplies: 1 } },
      { t: "Good copper in the wrack today, green and heavy, easy prying.", fx: { supplies: 1 } },
      { t: "A whole galley rib surfaces, sound timber end to end, and your claim stake holds.", fx: { supplies: 2 } },
      { t: "You work the flats till your back sings, and the noise in your head finally quiets.", fx: { resolve: 1 } },
      { t: "An old wracker shows you how to read the tide's leavings like a ledger.", fx: { resolve: 1 } },
      { t: "You honor a rival's claim stake when nobody would have known. Somebody knew.", fx: { rep: 1 } },
      { t: "The receding tide leaves the flats printed with ripples like a fingerprint of the sea." },
      { t: "A child finds a ship's bell in the mud, and the whole camp rings it once for luck." },
      { t: "Fog lifts off the shallows in one clean sheet, like a sail going up." },
    ],
    neg: [
      { t: "Mud takes one of your boots and, on reflection, a crowbar too.", fx: { supplies: -1 } },
      { t: "Your marked salvage pile is lighter by morning. Tide, says everyone.", fx: { supplies: -1 } },
      { t: "Wrack-rot gets into a coil of your good rope.", fx: { supplies: -1 } },
      { t: "The flats at dusk are all soft ground and softer light, and no fixed thing to trust.", fx: { resolve: -1 } },
      { t: "You pry open a sea chest and find letters, legible, addressed, undeliverable.", fx: { resolve: -1 } },
      { t: "You stake two paces over an old claim line. Two paces is a lot, out here.", fx: { rep: -1 } },
      { t: "Something big grounded on the outer bar in the night and was gone by light." },
      { t: "The tide turns early, and every wracker on the flats sprints without a word." },
      { t: "A doll's porcelain hand in the mud, pointing seaward, scrubbed clean by the water." },
      { t: "Your footprints from yesterday are still in the flats, and they go somewhere you did not." },
    ],
  },
  gate: {
    pos: [
      { t: "The whirl sleeps shallow today, and the passage spares your hull entirely.", fx: { supplies: 1 } },
      { t: "Wreckage rides the gate's outer ring, and you gaff the best of it in passing.", fx: { supplies: 1 } },
      { t: "A becalmed trader pays you in stores for a tow past the pull.", fx: { supplies: 1 } },
      { t: "The maelstrom spits up a sealed cargo float, dry inside, stamped with no harbor you know.", fx: { supplies: 2 } },
      { t: "You look the turning water dead in the eye and your hands stay steady on the wheel.", fx: { resolve: 1 } },
      { t: "The roar fades behind you, and the quiet after is the sweetest sound made.", fx: { resolve: 1 } },
      { t: "You sound the warning horn for a ship running blind toward the pull. They live.", fx: { rep: 1 } },
      { t: "The gate's mist throws a full circle rainbow, and even old hands come up to see." },
      { t: "Today the whirl turns wide and slow, almost stately, almost kind." },
      { t: "A pod of grays rides the outer current laughing, the way only safe things laugh." },
    ],
    neg: [
      { t: "The pull costs you a spar's worth of strain before the gate lets go.", fx: { supplies: -1 } },
      { t: "Spray off the whirl salts a deck crate through its lid.", fx: { supplies: -1 } },
      { t: "You jettison ballast to beat the current, as the current intended.", fx: { supplies: -1 } },
      { t: "The roar gets into your skull and keeps turning after the water stops.", fx: { resolve: -1 } },
      { t: "Down the funnel's throat, for one glance, something glints. Arranged. Waiting.", fx: { resolve: -1 } },
      { t: "You cut across a Kraken-cult skiff's offering line. They mark your sail in silence.", fx: { rep: -1 } },
      { t: "The gate falls silent as you pass, which the old hands say is worse." },
      { t: "An offering cask circles the rim three times and goes down unopened." },
      { t: "Your compass spins lazily the whole passage and rights itself the instant you clear." },
      { t: "In the mist above the whirl, briefly: the shadow of rigging, far too large." },
    ],
  },
  coil: {
    pos: [
      { t: "The still water over the Coil yields fat shellfish to a quiet rake.", fx: { supplies: 1 } },
      { t: "A cult tender, paid to keep silence, pays you in stores to share it.", fx: { supplies: 1 } },
      { t: "Driftwood collects in the lee of the sleeper, seasoned and dry above the line.", fx: { supplies: 1 } },
      { t: "An abandoned watcher's cache, intact under oilcloth, fairly yours by the law of stillness.", fx: { supplies: 2 } },
      { t: "You hold an hour of perfect quiet over the sleeping dark, and your heart slows to match.", fx: { resolve: 1 } },
      { t: "The Coil's water mirrors the sky without one flaw, and you stand on the sky.", fx: { resolve: 1 } },
      { t: "You still a dropped chain before it strikes the deck. The watchers incline their heads.", fx: { rep: 1 } },
      { t: "The sleeper's shadow lies exactly where the charts promise. Comforting, in its way." },
      { t: "A watcher shares tea brewed in silence, and it is the best tea of your life." },
      { t: "Snow of tiny white blossoms from somewhere inland settles on the still water, and stays." },
    ],
    neg: [
      { t: "Oars only, by the law of stillness, and the long pull costs you provisions.", fx: { supplies: -1 } },
      { t: "A watcher fines you a crate for a sneeze. The ledger entry reads NOISE.", fx: { supplies: -1 } },
      { t: "Sail furled by decree, you drift wide and burn a day making it back.", fx: { supplies: -1 } },
      { t: "The water is too calm, the way a held breath is calm.", fx: { resolve: -1 } },
      { t: "Below the glass surface, far down, a paleness the width of your whole ship. Then not.", fx: { resolve: -1 } },
      { t: "Your anchor touches bottom harder than the law of stillness forgives.", fx: { rep: -1 } },
      { t: "Every watcher on the rim faces the center at the same moment, then resumes." },
      { t: "Your wake vanishes behind you faster than water should heal." },
      { t: "A single bubble the size of a barrel rises, breaks without a sound, and is not discussed." },
      { t: "The night watch swears the stars over the Coil were in different places at midnight." },
    ],
  },
  farmooring: {
    pos: [
      { t: "The dockmaster's stores are overfull before the season turn, and she deals kindly.", fx: { supplies: 1 } },
      { t: "A long-hauler swaps preserved stores for fresh news, weight for weight.", fx: { supplies: 1 } },
      { t: "The last lamp's keeper trades oil and biscuit for an evening of company.", fx: { supplies: 1 } },
      { t: "An unclaimed consignment ages out of the bond shed, and the auction is just you.", fx: { supplies: 2 } },
      { t: "You watch the open water past the last lamp, and the size of it steadies instead of swallows.", fx: { resolve: 1 } },
      { t: "A letter from somewhere you once loved, held here for months, finds your hands.", fx: { resolve: 1 } },
      { t: "You stand an extra watch on the far light unasked. Out here, that is currency.", fx: { rep: 1 } },
      { t: "Every mooring ring on the long pier is freshly tarred, black and gleaming as new boots." },
      { t: "The far light burns blue-white tonight, the color the keepers call true." },
      { t: "A returning crew rings the pier bell for safe passage, and the sound carries forever." },
    ],
    neg: [
      { t: "End-of-the-line prices on everything, and the dockmaster knows you cannot walk away.", fx: { supplies: -1 } },
      { t: "The long swell works a lashing loose, and the sea takes its toll from the deck.", fx: { supplies: -1 } },
      { t: "Damp gets into the biscuit despite everything. It always does, out here.", fx: { supplies: -1 } },
      { t: "The wind off the open water says one word all night and will not say it again by day.", fx: { resolve: -1 } },
      { t: "Past the last lamp the dark is total, and it does not feel empty.", fx: { resolve: -1 } },
      { t: "You burn lamp oil after the dimming bell. The keepers are gentle, and write it down.", fx: { rep: -1 } },
      { t: "A ship is due that has been due for three weeks. Her berth is kept swept." },
      { t: "The pier bell rings once at midnight with no hand near the rope." },
      { t: "Out past the light, briefly, a green flame low on the water, traveling against the wind." },
      { t: "The dockmaster's dog will not walk the last third of the pier today." },
    ],
  },
};

// ===========================================================================
// ENCYCLOPEDIA — static lore (no Firebase cost).
// ===========================================================================
export const LORE_ORDER = [
  "hearth", "farmooring", "skyhook", "atoll", "bazaar", "reach",
  "weeping", "spire", "sunkbough", "court", "graves", "tidewrack", "gate", "coil",
];

export const LORE = {
  hearth: {
    desc: "The living crown of the fallen tree, where the elves keep their last green halls in the high boughs above the spray. It is the safest harbor in the drowned world, and the most suspicious of outsiders. Every welcome here is provisional.",
    missions: ["Roleplay", "Political", "Influence"],
    factions: ["The Boughs", "Faithful envoys", "Flier traders"],
    loot: ["Elven-make bows and blades", "Herbal remedies and tonics", "Living-wood charms", "Kindred heirlooms"],
    rarity: ["Common", "Uncommon", "Rare (heirlooms)"],
  },
  farmooring: {
    desc: "A lonely airdock lashed to a rock at the world's eastern edge, the last friendly light before the water curls toward the whirlpool. Its lookouts watch the dark and trade rumor for supplies. Few come this far, and those who do are remembered.",
    missions: ["Roleplay", "Exploration", "Influence"],
    factions: ["The Soaring Folk", "lone wanderers", "Faithless drifters"],
    loot: ["Charts of safe passage", "Spyglasses and signal-gear", "Ballast-coral and fuel", "Salvaged oddments"],
    rarity: ["Common", "Uncommon"],
  },
  skyhook: {
    desc: "A cluster of dock-platforms lashed to a high snapped branch, where zeppelins moor and engineers haggle over salvage and fuel. It is the busiest port in the sky, loud with riveting hammers and louder bargaining. Nothing here is given; everything is priced.",
    missions: ["Trade", "Roleplay", "Influence", "Combat"],
    factions: ["The Soaring Folk", "Faithless smugglers", "Bough buyers"],
    loot: ["Artificer gadgets and prototypes", "Salvaged sky-tech", "Fuel and ship parts", "Hand weapons"],
    rarity: ["Common", "Uncommon", "Rare (prototypes)"],
  },
  atoll: {
    desc: "A smoking volcanic island where the smiths of the soaring folk keep their forges and pour their finest steel. Heat, soot, and the ring of hammers fill the air. What is made here arms half the world.",
    missions: ["Trade", "Combat", "Exploration"],
    factions: ["The Soaring Folk", "dwarven smiths", "Faithless raiders"],
    loot: ["Forged weapons and armor", "Masterwork tools", "Rare worked metals", "Forge-runed gear"],
    rarity: ["Uncommon", "Rare", "Very Rare (master-forged)"],
  },
  bazaar: {
    desc: "A sprawling raft-city market where every faction trades under an uneasy truce and no weapon is meant to be drawn. Anything can be bought here, and most things can be sold. Truces, however, are thinner than the planks underfoot.",
    missions: ["Trade", "Roleplay", "Influence", "Stealth"],
    factions: ["The Soaring Folk", "every faction mingles here"],
    loot: ["Almost anything, for a price", "Trade goods and contraband", "Black-market curios", "Information"],
    rarity: ["Common", "Uncommon", "Rare", "Very Rare (under the table)"],
  },
  reach: {
    desc: "A spiral coral temple ringed by a slow whirlpool, where priests of a sea god reshape the water around them and call it holy. The faithful are warm to converts and merciless to doubters. Blessings here cost more than coin.",
    missions: ["Political", "Influence", "Roleplay", "Combat"],
    factions: ["The Faithful", "sea giants", "rival priesthoods"],
    loot: ["Divine boons and blessings", "Holy relics and reliquaries", "Blessed water and oils", "Sea-god scrolls"],
    rarity: ["Uncommon", "Rare", "Legendary (god-touched)"],
  },
  weeping: {
    desc: "The upturned tangle of the world-tree's roots, dripping and grey, where the water runs cold and the dead do not always stay drowned. Pilgrims and scavengers both come here, for different reasons. Few linger after dark.",
    missions: ["Combat", "Mystery", "Exploration"],
    factions: ["The Sunken Realms", "the risen dead", "Faithful mourners"],
    loot: ["Grave-goods and bone relics", "Necrotic curios", "Drowned heirlooms", "Cursed trinkets"],
    rarity: ["Uncommon", "Rare", "(often cursed)"],
  },
  spire: {
    desc: "A lone tower of the old world, snapped at the waterline and half-swallowed by the sea, its flooded halls picked over by divers and worse. Treasure waits in the deep rooms, and so does whatever guards it. The Spire keeps its bargains and its corpses.",
    missions: ["Exploration", "Combat", "Mystery"],
    factions: ["The Sunken Realms", "aboleth thralls", "Faithless wreckers"],
    loot: ["Old-world treasure hoards", "Sealed-vault valuables", "Ancient magic items", "Lost knowledge"],
    rarity: ["Rare", "Very Rare", "Legendary"],
  },
  sunkbough: {
    desc: "A great submerged branch glowing with luminous coral, a road through the deep for those who can breathe it or hold their nerve. The light is beautiful and the dark between it is not. Guides know the way; strangers vanish.",
    missions: ["Exploration", "Survival", "Mystery"],
    factions: ["The Sunken Realms", "deep beasts", "lone divers"],
    loot: ["Luminous coral", "Deep pearls", "Rare spell components", "Bioluminant reagents"],
    rarity: ["Common", "Uncommon", "Rare"],
  },
  court: {
    desc: "A coral palace in a trench where a lord of the sunken realms holds audience over a thousand smaller kingdoms. Diplomacy here is conducted in cold currents and colder courtesies. To be received is an honor; to offend is a sentence.",
    missions: ["Political", "Influence", "Roleplay"],
    factions: ["The Sunken Realms", "coral lords", "aboleth emissaries"],
    loot: ["Courtly gifts and regalia", "Coral-worked treasures", "Aboleth-tainted artifacts", "Trade concessions"],
    rarity: ["Rare", "Very Rare", "(artifacts risk taint)"],
  },
  graves: {
    desc: "Fog-bound channels winding between drowned wrecks, where the faithless raiders camp in beached hulls and ask no one's leave. Survival is the only law and family the only loyalty. Outsiders are cargo or corpses.",
    missions: ["Combat", "Stealth", "Roleplay"],
    factions: ["The Faithless", "sea devils", "the drowned dead"],
    loot: ["Plunder and stolen goods", "Looted weapons and armor", "Pirate caches", "Ransomed valuables"],
    rarity: ["Common", "Uncommon", "Rare (looted)"],
  },
  tidewrack: {
    desc: "A vast field of shipwrecks ground into the shallows, endlessly scavenged and never empty. Pickers comb the hulls for anything worth a meal. Every wreck is claimed, and claims are settled with knives.",
    missions: ["Exploration", "Combat", "Survival"],
    factions: ["The Faithless", "scavenger bands", "lurking beasts"],
    loot: ["Wreck salvage and scrap", "Lost cargo", "Scavenged parts", "Waterlogged valuables"],
    rarity: ["Common", "Uncommon", "Rare (fresh wrecks)"],
  },
  gate: {
    desc: "The threshold storm before the abyss, where the black water begins to turn and the sky goes wrong. Only the desperate or the doomed sail this far. The Gate is a warning the world stopped heeding.",
    missions: ["Survival", "Exploration", "Combat"],
    factions: ["The Kraken", "doomsday cultists", "the drowned"],
    loot: ["Cult relics", "Drowned cargo", "Ill-omened curios", "Storm-glass"],
    rarity: ["Rare", "Very Rare", "(ill-omened, oft cursed)"],
  },
  coil: {
    desc: "The great abyssal whirlpool at the heart of the dark, where the Kraken sleeps coiled beneath water that swallows light. To reach it is the end of most journeys. To wake it is the end of more.",
    missions: ["Combat", "Survival"],
    factions: ["The Kraken"],
    loot: ["Legendary spoils", "Kraken-touched relics", "The impossible and the priceless"],
    rarity: ["Legendary", "Artifact"],
  },
};

// ===========================================================================
// WORLD HOOK + FACTION LORE
// ===========================================================================
export const WORLD = {
  title: "The World That Drowned",
  paras: [
    "In the elder days there stood a single Tree, its roots in the deep and its crown holding up the sky, and so long as it stood the waters kept their bounds. Then the Tree fell.",
  ],
  sections: [
    { title: "THE ELDER DAYS", paras: [
      "No living person remembers the world before the water, and that is the first thing to understand about everyone you will ever meet. The elder days are three centuries gone, preserved in salvaged books, drowned architecture, grandmothers' grandmothers' songs, and the stubborn opinions of elves. What is broadly agreed: there was dry land, in quantities now hard to imagine. There were many nations, and they are all dead. And at the center of everything stood the World Tree, a living pillar so vast that its roots drank the deep ocean and its crown carried the floor of heaven.",
      "The Tree was not worshipped, exactly. It was relied upon, the way one relies on the ground. Its trunk was the road by which the gods reached their faithful and the road by which the dead climbed out of the world to their rest. Every religion disagreed about everything except the Tree, because the Tree was not a belief. It was infrastructure.",
    ]},
    { title: "THE FALL", paras: [
      "Three hundred and twelve years ago, by the reckoning now used in every harbor, the Tree fell. Not withered, not burned: fell, in the course of a single day and night, the way a tower falls. It broke the back of the world. The sea rose up in mountains and walked across creation, and what had been is no more. The trunk now lies across thousands of miles of open water like the corpse of a god, its crown still green in places and crowded with survivors, its roots upturned into a grey weeping tangle where the water runs cold, its great branches plunging into and out of the sea to make the only fixed geography the world has left.",
      "Nobody knows why it fell. Every faction in this codex is, at heart, a different answer to that question. The elves say the gods of sea and lowland conspired. The Faithful say it was a summons, a divine revolution mistaken for a catastrophe. The Soaring Folk say structures fail and theology is grief wearing a costume. The Faithless say it does not matter why the wave came, only who is still swimming. Three centuries on, the argument has hardened into nations.",
    ]},
    { title: "THE ROAD OF THE GODS IS BROKEN", paras: [
      "The Tree carried prayer up and providence down. With it shattered, the gods are not gone but distant, heard the way one hears a voice through a hull. Divine magic still works, but it arrives brackish: clerics describe pulling power through dark water, hand over hand. The sea gods, whose domains were always down here, now answer loudest of all, which is why their priesthoods flourish while older faiths thin out. No god has walked or clearly spoken since the Fall.",
    ]},
    { title: "THE DEAD DO NOT STAY DROWNED", paras: [
      "The Tree was also the road of the dead, and the dead now have nowhere to go. Wherever they lie, sooner or later, they rise: not as an army with a general, but as a condition of the world, like weather. Most risen are slow, sad, and dangerous in the dark; a few remember enough of themselves to be far worse. Every culture has built customs around this. The Boughs entomb their dead in living wood and sing them quiet. The Faithful raise theirs deliberately as labor and call it mercy. The Soaring Folk burn their fallen in the forge furnaces to deny the water a corpse. The Faithless long ago stopped checking. In this world, a funeral is a security measure.",
    ]},
    { title: "THE HEAVENS SPILLED THEIR SERVANTS", paras: [
      "When the road broke, the angels who walked it fell with the waters, stranded on the wrong side of the wound. They are real, they are scattered, they grieve, and they are terrifying: a being built to carry a god's voice, with no god on the line. Some have attached themselves to priesthoods that still half-reach their masters. Others wander. Every faction covets them and none can hold them. An angel arriving in a harbor is the world's equivalent of a warship arriving: the politics reorganize around it within the hour.",
    ]},
    { title: "THE WORLD AS IT LIES", paras: [
      "Think of the world vertically. There are five storeys, and sooner or later you will see all of them.",
      "The Crown. The fallen Tree's living canopy, miles of habitable green held above the spray. The elves of the Boughs keep their last halls here, centered on Hearthbough, the safest harbor in the world and the most suspicious of it.",
      "The Open Sky. The Soaring Folk took to the air rather than sink or cling: zeppelin convoys, dock-platforms lashed to snapped branches, a volcanic forge-isle. Theirs is the only economy that moves faster than weather.",
      "The Shattered Sea. The surface itself: raft-cities, wreck-fields, trade lanes, fog. This is where you live day to day, and where your vessel earns its keep. Law is harbor-by-harbor. Between harbors there is only seamanship, reputation, and powder.",
      "The Deep Roads. Below the light lie the Sunken Realms: coral courts, trench-kingdoms, drowned cities of the old world, and the great luminous branch called the Sunken Bough that serves as a highway for those who can breathe it or hold their nerve.",
      "The Old Dark. Beneath everything, the abyss, where the water swallows light and something enormous sleeps coiled at the heart of the great whirlpool. The Maelstrom Gate is the threshold storm before it. Sailors do not go there.",
    ]},
    { title: "SALT-TIME", paras: [
      "Harbors keep the Salt-Year, counted from the Fall; it is Salt-Year 312. The week is organized around the Tide, the slow world-pulse that every port feels and every almanac argues about. The day is kept in bells, ship-fashion.",
      "And once, eleven years ago, the tide ran backward. One night only. Water drew away from every shore at once, as if the sea had inhaled, and returned by morning wearing an expression nobody could read. Wrecks surfaced that had no business surfacing. Old sailors mention it, then change the subject. A bell somewhere below began ringing that same night, and it has not stopped.",
    ]},
    { title: "THINGS EVERY SAILOR KNOWS", items: [
      "Dry powder is wealth.",
      "The Brine Bazaar truce holds until it doesn't.",
      "Funerals are security.",
      "Never call the whirlpool by a name, any name.",
      "If you hear a bell at slack tide with no tower in sight, note the hour, say nothing, and sail on.",
    ]},
    { title: "THE POWERS IN ONE BREATH", paras: [
      "The Boughs blame the Faithful's gods and barely tolerate the Soaring Folk's saws. The Faithful pity the Boughs, buy from the Soaring Folk, and excommunicate each other. The Soaring Folk sell to everyone and are trusted by no one with a theology. The Faithless raid whoever is slow and trade with whoever is rich. The Sunken Realms consider the entire surface a noisy upstairs neighbor. The Host belongs to no one. The Kraken is coming. The Drowned are already here.",
    ]},
  ],
};

export const FACTION_LORE_ORDER = ["Boughs", "Sunken", "Faithful", "Angels", "Fliers", "Faithless", "Kraken", "Drowned"];

export const FACTION_LORE = {
  Boughs: {
    name: "Boughs", sym: "❧", color: "#9ab87e",
    desc: "Survivors of many elven kindreds, driven together onto the fallen Tree's living crown, where they keep the last green halls in the world. Their priests name the sea gods, and the gods of men and dwarves besides, as the authors of the drowning, so they keep their gates barred and their bows strung. They claim the whole drowned country by right of grief, which makes every welcome at Hearthbough provisional and every outsider a guest on sufferance. Yet they are the world's living memory and its finest archers and herbalists, and a friend among the Boughs is a friend whose word outlasts weather.",
    sections: [
      { title: "MAKE-UP", items: ["Elves of many kindreds", "Priests and wardens"] },
      { title: "HOLDINGS", items: ["Hearthbough, the living crown"] },
      { title: "OUTLOOK", items: ["Suspicious of all outsiders", "Blame the sea and the lowland gods for the Fall"] },
      { title: "THEY WANT", items: ["The Tree's remnant protected", "The guilty named", "The old graces remembered"] },
      { title: "THEY FEAR", items: ["The crown dying branch by branch while the world watches"] },
    ],
  },
  Sunken: {
    sym: "⚓", name: "Sunken Realms", color: "#8a7cc0",
    desc: "Not one people but a thousand: scaled lords, coral courts, trench-kingdoms, and things from realms beyond knowing, all dwelling in the drowned dark. They owe fealty to none above the water and war as often among themselves as with the surface, so that to the dry world they are rumor and shadow with a postal address. Their territory holds most of what the old world left behind, which makes them gatekeepers of salvage, lore, and the Deep Roads that connect everything below the light. To be received at the Deep Court is an honor; to offend there is a sentence.",
    sections: [
      { title: "MAKE-UP", items: ["Merfolk, tritons, sea hobgoblins (koalinths)", "Aboleths and coral lords"] },
      { title: "HOLDINGS", items: ["The Weeping Roots, the Drowned Spire, the Sunken Bough, the Deep Court"] },
      { title: "OUTLOOK", items: ["Owe loyalty to none above the waves", "Ancient, proud, and bitterly divided"] },
      { title: "THEY WANT", items: ["Precedence, protocol, and the surface to remember it is a guest down here"] },
      { title: "THEY FEAR", items: ["The oldest things among them, who remember the world before the gods and are patient"] },
    ],
  },
  Faithful: {
    sym: "♆", name: "Faithful", color: "#74b0c9",
    desc: "Bloodthirsty and devout, the sea-folk priesthoods hold the Tree's fall as a divine summons, a revolution mistaken for a ruin. They inherited all magic save the working of metal, and each congregation gives worship to a single sea god, vowing to reshape the world into that god's image, which is why the Faithful war as fiercely within their faith as outside it. The sea giants walk among them as living temples and warlords, and at Umberlee's Reach the water itself bends around the spiral coral sanctum and is called holy for it. They are warm to converts, merciless to doubters, and their blessings always cost more than coin.",
    sections: [
      { title: "MAKE-UP", items: ["Sea folk casters and priests", "Sea giants as warlords"] },
      { title: "HOLDINGS", items: ["Umberlee's Reach"] },
      { title: "OUTLOOK", items: ["The drowning was revolution, not ruin", "Every god dreams a different new world"] },
      { title: "THEY WANT", items: ["The world remade god by god, congregation by congregation"] },
      { title: "THEY FEAR", items: ["Silence on the line; a god who stops answering"] },
    ],
  },
  Angels: {
    sym: "✶", name: "Stranded Host", color: "#e8dcb0",
    desc: "The angels of the broken road, fallen with the waters and stranded on the wrong side of the wound. Some lend their dread radiance to priesthoods that still half-reach their masters; others wander unbound, grieving and terrible, a blade of the heavens looking for a hand. Every faction both covets and fears them, because an angel decides wars and answers to no harbor. No one can swear to them, but aasimar carry their blood, and meeting one is the kind of day you tell your grandchildren about, if you get to have grandchildren.",
    sections: [
      { title: "MAKE-UP", items: ["Stranded servants of the gods"] },
      { title: "HOLDINGS", items: ["None; they wander, or shelter with the Faithful"] },
      { title: "OUTLOOK", items: ["Sundered from their masters", "A blade of the heavens to whoever wins them", "Not a banner anyone can swear"] },
    ],
  },
  Fliers: {
    sym: "⚙", name: "Soaring Folk", color: "#d6ad53",
    desc: "Engineers, artificers, and smiths, dwarves and gnomes and goblins and humans together, who rose into the open air rather than sink or cling. They dwell in zeppelins and soaring engines and dock-platforms lashed to snapped branches, trusting steel where others trust prayer, and their forges on the Ashen Atoll arm half the world. Nothing among them is given and everything is priced, but a price, unlike a god or a grudge, can always be negotiated. Their dwarves have already turned their craft downward toward deep diving and undersea mining, which the Sunken Realms have noticed, and have opinions about.",
    sections: [
      { title: "MAKE-UP", items: ["Dwarves, gnomes, goblins, humans", "Artificers, smiths, and pilots"] },
      { title: "HOLDINGS", items: ["The Skyhook, the Ashen Atoll, the Brine Bazaar, the Far Mooring"] },
      { title: "OUTLOOK", items: ["Trust steel over prayer", "No part of the world should stay closed to their making"] },
      { title: "THEY WANT", items: ["Fuel, salvage rights, open routes, the deep pried open next"] },
      { title: "THEY FEAR", items: ["The sky becoming as contested as the sea"] },
    ],
  },
  Faithless: {
    sym: "☠", name: "Faithless", color: "#bb5d45",
    desc: "Those who believe in nothing but the next dawn, driven by hunger, bloodlust, and the savage love of their own kin. They scavenge, burn, and enslave, striking bargains with the newly risen sea devils and pillaging hull and hall to keep their ships fed. They keep no god and no oath but survival, and family is the only loyalty that counts among the beached hulls of the Gravewater Lanes. Yet they are honest in the one way no one else is, for a Faithless raider will never pretend the knife is a sacrament, and the wreck-pickers of Tidewrack remember kindnesses with a fierceness that surprises everyone, including themselves.",
    sections: [
      { title: "MAKE-UP", items: ["Raiders, scavengers, and slavers", "Allied sea devils"] },
      { title: "HOLDINGS", items: ["Gravewater Lanes, Tidewrack Shallows"] },
      { title: "OUTLOOK", items: ["Family is the only loyalty", "Survival is the only law"] },
      { title: "THEY WANT", items: ["Cargo, crews, and to never again be the ones drowning"] },
      { title: "THEY FEAR", items: ["A winter with no wrecks"] },
    ],
  },
  Kraken: {
    sym: "✺", name: "Kraken", color: "#c2455a",
    desc: "It served no god in the elder days and it serves none now. When the Tree fell it woke, and it has moved through the drowned world ever since like a second, slower catastrophe, keeping no faction, answering no prayer, honoring no bargain. Doomsday cults gather at the Maelstrom Gate to worship the fact of it, but the Kraken does not know they exist, which is the whole theology. The only article of faith shared across the entire broken world is the hope that it is still sleeping.",
    sections: [
      { title: "MAKE-UP", items: ["The Kraken alone", "Its cults are drawn from every people"] },
      { title: "HOLDINGS", items: ["The Maelstrom Gate, the Sleeping Coil"] },
      { title: "OUTLOOK", items: ["Bound to no one", "To be noticed by it is to be already lost"] },
    ],
  },
  Drowned: {
    sym: "†", name: "Drowned", color: "#8a9b86",
    desc: "Not a kingdom but an affliction. When the Tree fell it severed the road by which the dead found rest, and now the drowned rise wherever they lie: drowned soldiery, ghost crews, grasping things in the dark, wearing the faces of those who mourned them. They hold no land because they surface everywhere, and every culture keeps funeral customs that double as security. They are the one enemy every harbor in the world agrees about.",
    sections: [
      { title: "MAKE-UP", items: ["The risen dead of every people", "Drowned soldiery, ghost crews, grasping things in the dark"] },
      { title: "HOLDINGS", items: ["None; they rise wherever the dead lie"] },
      { title: "OUTLOOK", items: ["No allegiance but hunger", "A curse woven through every faction"] },
    ],
  },
};
