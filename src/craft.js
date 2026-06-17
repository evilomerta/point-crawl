// ===========================================================================
// CRAFTING — Between Tides crafting data.
// Candles are labor, party Supplies are raw materials, time is real days.
// One active project per person. Each recipe can be started once per week,
// group-wide. Finished items go to the shared PARTY INVENTORY.
//
// Every tool covers all 4 ranks; every rank holds one recipe per rarity
// (common, uncommon, rare, epic). Days, Supplies, and skill scale with
// rank and rarity through the matrices below; no craft exceeds 6 days.
// All numbers are tuning knobs.
// ===========================================================================

export const CRAFT_TOOLS = {
  smith:   { name: "Smith's Tools",           makes: "metal weapons and armor" },
  tinker:  { name: "Tinker's Tools",          makes: "powder, shot, and gunworks" },
  herbal:  { name: "Herbalism Kit",           makes: "potions and remedies" },
  wood:    { name: "Woodcarver's Tools",      makes: "bows, bolts, and arrows" },
  leather: { name: "Leatherworker's Tools",   makes: "light armor and gear" },
  callig:  { name: "Calligrapher's Supplies", makes: "spell scrolls" },
  weaver:  { name: "Weaver's Tools",          makes: "rope, nets, and canvas" },
  cook:    { name: "Cook's Utensils",         makes: "rations and stores" },
};

export const CRAFT_RANKS = [
  { t: "Apprentice", at: 0 },
  { t: "Journeyman", at: 4 },
  { t: "Artisan",    at: 10 },
  { t: "Master",     at: 18 },
];
export const CRAFT_XP_MAX = 24;
export const craftRankIdx = (xp) => {
  let i = 0;
  for (let r = 0; r < CRAFT_RANKS.length; r++) if ((xp || 0) >= CRAFT_RANKS[r].at) i = r;
  return i;
};
export const craftRankName = (xp) => CRAFT_RANKS[craftRankIdx(xp)].t;

export const RARITIES = {
  common:   { label: "Common",   ink: "#5a4d33", bright: "#cfc4a4" },
  uncommon: { label: "Uncommon", ink: "#3f6b35", bright: "#7fbf6f" },
  rare:     { label: "Rare",     ink: "#2f5d8a", bright: "#6fa8e8" },
  epic:     { label: "Epic",     ink: "#6b3f8a", bright: "#b98fe8" },
};

// Monday-anchored UTC weeks for the per-recipe weekly limit.
const WEEK_MS = 7 * 86400000;
const MON_OFFSET = 4 * 86400000;
export const craftWeekKey = (ts = Date.now()) => Math.floor((ts - MON_OFFSET) / WEEK_MS);
export const craftWeekResetMs = (ts = Date.now()) => WEEK_MS - ((ts - MON_OFFSET) % WEEK_MS);

// rows: rank (Apprentice..Master) · cols: rarity (common..epic)
const RAR = ["common", "uncommon", "rare", "epic"];
const DAYS     = [[1, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5], [2, 3, 5, 6]];
const CANDLES  = [1, 2, 3, 3];
const SUPPLIES = [[1, 1, 2, 2], [2, 2, 3, 3], [2, 3, 3, 4], [3, 3, 4, 4]];
const XPGAIN   = [[1, 1, 2, 2], [2, 2, 3, 3], [3, 3, 4, 4], [4, 4, 5, 6]];
const R = (id, tool, rank, ri, icon, name, note, out) => ({
  id, tool, rank, rarity: RAR[ri], days: DAYS[rank][ri], candles: CANDLES[rank],
  supplies: SUPPLIES[rank][ri], xp: XPGAIN[rank][ri], icon, name, note, out: out || name,
});

export const RECIPES = [
  // ---- SMITH'S TOOLS ----
  R("spikes",      "smith", 0, 0, "spikes",  "Iron Spikes & Fittings", "10 pitons plus brackets and nails.", "Iron Spikes x10 & Fittings"),
  R("daggers",     "smith", 0, 1, "blade",   "Brace of Daggers (3)", "1d4 piercing, finesse, light, thrown 20/60."),
  R("cutlass",     "smith", 0, 2, "blade",   "Boarding Cutlass", "Scimitar. 1d6 slashing, finesse, light.", "Boarding Cutlass (scimitar)"),
  R("chain",       "smith", 0, 3, "mail",    "Chain Shirt", "AC 13 + Dex (max 2)."),
  R("grapnel",     "smith", 1, 0, "anchor",  "Grappling Iron & Chain", "Hooked iron on 25 ft of chain."),
  R("pike",        "smith", 1, 1, "blade",   "Boarding Pike", "1d10 piercing, reach, heavy, two-handed."),
  R("breast",      "smith", 1, 2, "mail",    "Breastplate", "AC 14 + Dex (max 2)."),
  R("pistol",      "smith", 1, 3, "pistol",  "Flintlock Pistol", "1d10 piercing, 30/90, loading, misfire 1."),
  R("shield",      "smith", 2, 0, "crest",   "Iron-Banded Shield", "+2 AC."),
  R("splint",      "smith", 2, 1, "mail",    "Splint Armor", "AC 17, Str 13, disadvantage on Stealth."),
  R("musket",      "smith", 2, 2, "musket",  "Sea Musket", "1d12 piercing, 40/120, loading, misfire 2."),
  R("halfplate",   "smith", 2, 3, "mail",    "Wreck-Iron Half Plate", "AC 15 + Dex (max 2)."),
  R("edgework",    "smith", 3, 0, "blade",   "Master's Edge Service", "One weapon gains +1 damage until next session. Token."),
  R("boardrig",    "smith", 3, 1, "anchor",  "Boarding Harness", "Once per session, ignore forced movement or a rigging fall."),
  R("tideblade",   "smith", 3, 2, "blade",   "Tide-Tempered Blade", "Your melee weapon counts as magical."),
  R("plusweapon",  "smith", 3, 3, "blade",   "Forged +1 Weapon", "A metal weapon of your choice. +1 to hit and damage."),
  // ---- TINKER'S TOOLS ----
  R("shot",        "tinker", 0, 0, "bullets",    "Powder & Shot (20)", "20 dry rounds of powder and shot.", "Powder & Shot x20"),
  R("horn",        "tinker", 0, 1, "powderhorn", "Waxed Powder Horn", "Holds 20 shots of powder, dry through rain and a dunk."),
  R("lantern",     "tinker", 0, 2, "candle",     "Hooded Lantern & Oil", "Bright light 30 ft, dim 30 ft, shutter to hide."),
  R("snares",      "tinker", 0, 3, "spikes",     "Snare Kit (3)", "DC 12 Dex save or restrained."),
  R("gunkit",      "tinker", 1, 0, "wrench",     "Gunsmith's Service", "Restores one fouled or broken firearm. Token.", "Gunsmith's Service (token)"),
  R("smoke",       "tinker", 1, 1, "flame",      "Smoke Bombs (3)", "10 ft cloud, heavily obscured for 1 minute."),
  R("spyglass",    "tinker", 1, 2, "eye",        "Spyglass", "Objects viewed are magnified twofold."),
  R("tripwire",    "tinker", 1, 3, "ear",        "Tripwire Alarm Set", "30 ft of wire, silent or audible alert."),
  R("powdercharge","tinker", 2, 0, "flame",      "Powder Charge", "3d8 to a structure, 10 ft blast, DC 13 Dex half."),
  R("grapgun",     "tinker", 2, 1, "anchor",     "Grapnel Launcher", "Fires a line 60 ft, holds 500 lb."),
  R("clockmate",   "tinker", 2, 2, "wrench",     "Clockwork Mate", "Tiny helper. AC 13, 10 HP, carries 10 lb, 1 hour per wind."),
  R("flashpots",   "tinker", 2, 3, "flame",      "Flash Pots (3)", "DC 13 Con save or blinded 1 round."),
  R("seapin",      "tinker", 3, 0, "wrench",     "Underwater Firing Pin", "One firearm fires while submerged."),
  R("repeater",    "tinker", 3, 1, "pistol",     "Repeating Conversion", "One pistol ignores loading for 3 shots, then re-crank."),
  R("gyrostock",   "tinker", 3, 2, "musket",     "Gyro-Stabilized Stock", "+1 to hit with the fitted firearm."),
  R("thunderlance","tinker", 3, 3, "musket",     "Thunder-Lance Rifle", "2d8 piercing, 60/180, loading, misfire 1."),
  // ---- HERBALISM KIT ----
  R("potion",      "herbal", 0, 0, "potion",  "Potion of Healing", "Heals 2d4+2."),
  R("antitox",     "herbal", 0, 1, "vial",    "Antitoxin", "Advantage on saves against poison for 1 hour."),
  R("poultices",   "herbal", 0, 2, "bandage", "Healer's Poultices (3)", "Short rest: add +1d4 to each hit die spent."),
  R("salts",       "herbal", 0, 3, "vial",    "Reviving Salts", "Wake an unconscious creature as an action."),
  R("clarity",     "herbal", 1, 0, "vial",    "Tonic of Clarity", "Ends the frightened condition on the drinker."),
  R("acid",        "herbal", 1, 1, "vial",    "Vials of Acid (2)", "Thrown: 2d6 acid."),
  R("draught",     "herbal", 1, 2, "potion",  "Greater Healing Draught", "Heals 4d4+4."),
  R("gillpotion",  "herbal", 1, 3, "potion",  "Potion of Water Breathing", "Breathe water for 1 hour."),
  R("antivenom",   "herbal", 2, 0, "vial",    "Antivenom Draught", "End one poisoned condition; resist poison 1 hour."),
  R("blightcoat",  "herbal", 2, 1, "vial",    "Blight-Thorn Coating", "3 uses. On a hit: DC 13 Con or +2d6 poison."),
  R("deeppotion",  "herbal", 2, 2, "potion",  "Potion of the Deep", "Swim speed and darkvision 60 ft for 1 hour."),
  R("superior",    "herbal", 2, 3, "potion",  "Superior Healing Draught", "Heals 8d4+8."),
  R("tea",         "herbal", 3, 0, "tankard", "Restorative Tea", "A short rest removes one level of exhaustion."),
  R("restoration", "herbal", 3, 1, "vial",    "Elixir of Restoration", "End one disease, or one of: blinded, deafened, paralyzed, poisoned."),
  R("inkdraught",  "herbal", 3, 2, "potion",  "Kraken-Ink Draught", "Resistance to one damage type for 1 hour, chosen at brewing."),
  R("supreme",     "herbal", 3, 3, "potion",  "Supreme Healing Draught", "Heals 10d4+20."),
  // ---- WOODCARVER'S TOOLS ----
  R("arrows",      "wood", 0, 0, "arrow",    "Arrows or Bolts (20)", "20 arrows or crossbow bolts.", "Arrows/Bolts x20"),
  R("whistles",    "wood", 0, 1, "ear",      "Signal Whistles (3)", "Carved codes that carry half a mile."),
  R("shortbow",    "wood", 0, 2, "bow",      "Shortbow", "1d6 piercing, 80/320."),
  R("lightxbow",   "wood", 0, 3, "crossbow", "Light Crossbow", "1d8 piercing, 80/320, loading."),
  R("arrowbundle", "wood", 1, 0, "arrow",    "Arrow Bundle (40)", "40 arrows or bolts.", "Arrows/Bolts x40"),
  R("longbow",     "wood", 1, 1, "bow",      "Longbow", "1d8 piercing, 150/600."),
  R("xbow",        "wood", 1, 2, "crossbow", "Heavy Crossbow", "1d10 piercing, 100/400, loading."),
  R("recurve",     "wood", 1, 3, "bow",      "Recurve Service", "One bow gains +10/+40 range. Token."),
  R("hullpatch",   "wood", 2, 0, "anchor",   "Hull Patch Kit", "Restores 5 ship Hull. Token."),
  R("boardhooks",  "wood", 2, 1, "rope",     "Boarding Hooks & Ladders", "Advantage on checks to board a vessel."),
  R("greatbow",    "wood", 2, 2, "bow",      "Composite Greatbow", "1d10 piercing, 150/600, Str 13."),
  R("ballista",    "wood", 2, 3, "crossbow", "Ballista Bolts (6)", "+1 ship Firepower for one battle. Token."),
  R("masterarrows","wood", 3, 0, "arrow",    "Master-Fletched Arrows (10)", "+1 to hit."),
  R("buoyshield",  "wood", 3, 1, "crest",    "Buoyant Shield", "+2 AC. You cannot sink while holding it."),
  R("heartbow",    "wood", 3, 2, "bow",      "Heartwood Longbow", "+1 longbow. 1d8 piercing, 150/600."),
  R("wyrmbow",     "wood", 3, 3, "bow",      "Wyrmwood Greatbow", "+1 greatbow. 1d10 piercing, 150/600, Str 13."),
  // ---- LEATHERWORKER'S TOOLS ----
  R("oilskin",     "leather", 0, 0, "cloak", "Oilskin Cloak & Satchel", "Keeps you and your gear dry.", "Oilskin Cloak & Waxed Satchel"),
  R("leather",     "leather", 0, 1, "vest",  "Leather Armor", "AC 11 + Dex."),
  R("whip",        "leather", 0, 2, "rope",  "Hide Whip", "1d4 slashing, finesse, reach."),
  R("bandolier",   "leather", 0, 3, "vest",  "Bandolier & Sheaths", "Draw one stowed item free each turn."),
  R("mapcases",    "leather", 1, 0, "scroll","Waterproof Map Cases (3)", "Paper stays dry, even sunk."),
  R("studded",     "leather", 1, 1, "vest",  "Studded Leather", "AC 12 + Dex."),
  R("divharness",  "leather", 1, 2, "rope",  "Diver's Harness", "Advantage against currents; quick release."),
  R("fins",        "leather", 1, 3, "fish",  "Swim Fins & Webbing", "+10 ft swim speed."),
  R("refit",       "leather", 2, 0, "vest",  "Armor Refit Service", "Repairs and resizes one suit of armor. Token."),
  R("sharkhide",   "leather", 2, 1, "vest",  "Sharkhide Jerkin", "AC 12 + Dex. Advantage on swim checks."),
  R("glider",      "leather", 2, 2, "cloak", "Glider Cloak", "Falls of 60 ft or less become a glide."),
  R("krakencoat",  "leather", 2, 3, "vest",  "Kraken-Leather Coat", "AC 13 + Dex (max 3)."),
  R("soles",       "leather", 3, 0, "vest",  "Silent Soles", "Advantage on Stealth at half speed."),
  R("divesuit",    "leather", 3, 1, "cloak", "Deep-Diver's Suit", "Hold breath twice as long; warm in cold water."),
  R("boardbracers","leather", 3, 2, "vest",  "Boarder's Bracers", "+1 on grapple and shove attempts."),
  R("plusstudded", "leather", 3, 3, "vest",  "Studded Leather +1", "AC 13 + Dex."),
  // ---- CALLIGRAPHER'S SUPPLIES ----
  R("scrollc",     "callig", 0, 0, "scroll", "Spell Scroll (cantrip)", "Scribe a prepared cantrip. Uses your save DC.", "Spell Scroll (your cantrip)"),
  R("scroll1",     "callig", 0, 1, "scroll", "Spell Scroll (1st)", "Scribe a prepared 1st-level spell.", "Spell Scroll (your 1st-level spell)"),
  R("twincantrip", "callig", 0, 2, "scroll", "Twin Cantrip Scrolls (2)", "Two scrolls of one prepared cantrip."),
  R("comprehend",  "callig", 0, 3, "tome",   "Scroll of Comprehend Languages", "Anyone can read it to cast it."),
  R("scroll2",     "callig", 1, 0, "scroll", "Spell Scroll (2nd)", "Scribe a prepared 2nd-level spell.", "Spell Scroll (your 2nd-level spell)"),
  R("tidecharts",  "callig", 1, 1, "compass","Tide-Charts Folio", "Advantage on navigation in one charted region."),
  R("silence",     "callig", 1, 2, "scroll", "Scroll of Silence", "Any caster can use it."),
  R("misty",       "callig", 1, 3, "scroll", "Scroll of Misty Step", "Any caster can use it."),
  R("scroll3",     "callig", 2, 0, "scroll", "Spell Scroll (3rd)", "Scribe a prepared 3rd-level spell.", "Spell Scroll (your 3rd-level spell)"),
  R("contract",    "callig", 2, 1, "seal",   "Binding Contract", "Both signers know the moment it is broken."),
  R("waterscroll", "callig", 2, 2, "scroll", "Scroll of Water Breathing", "Anyone can read it to cast it."),
  R("fireball",    "callig", 2, 3, "flame",  "Scroll of Fireball", "Any caster can use it."),
  R("scroll4",     "callig", 3, 0, "scroll", "Spell Scroll (4th)", "Scribe a prepared 4th-level spell.", "Spell Scroll (your 4th-level spell)"),
  R("revivify",    "callig", 3, 1, "scroll", "Scroll of Revivify", "Any caster can use it."),
  R("scroll5",     "callig", 3, 2, "scroll", "Spell Scroll (5th)", "Scribe a prepared 5th-level spell.", "Spell Scroll (your 5th-level spell)"),
  R("raisedead",   "callig", 3, 3, "scroll", "Scroll of Raise Dead", "Any caster can use it."),
  // ---- WEAVER'S TOOLS ----
  R("ropenet",     "weaver", 0, 0, "rope",   "Rope (50 ft) & Net", "50 feet of hemp and a throwing net."),
  R("sailpatch",   "weaver", 0, 1, "rope",   "Sail Patch Kit", "Repairs one sail tear. Token."),
  R("camonet",     "weaver", 0, 2, "rope",   "Camouflage Netting", "+5 to hide a boat or camp."),
  R("climbrig",    "weaver", 0, 3, "rope",   "Climbing Rig", "No check to climb a line you rigged."),
  R("hammocks",    "weaver", 1, 0, "rope",   "Hammocks & Bedrolls (4)", "Sound sleep anywhere; no rough-rest exhaustion."),
  R("weightnet",   "weaver", 1, 1, "rope",   "Weighted Net", "Large or smaller: DC 12 Str to escape."),
  R("stormtarp",   "weaver", 1, 2, "cloak",  "Storm Tarp", "Shelters six; advantage against weather exhaustion."),
  R("silkline",    "weaver", 1, 3, "rope",   "Silk Line (100 ft)", "Holds 1,000 lb; resists cutting."),
  R("cargorig",    "weaver", 2, 0, "crate",  "Cargo Slings & Rigging", "Doubles a small boat's cargo. Token."),
  R("falsesails",  "weaver", 2, 1, "rope",   "Smuggler's False Sails", "Advantage to pass unrecognized at sea. Token."),
  R("seaanchor",   "weaver", 2, 2, "anchor", "Drag-Chute Sea Anchor", "+1 ship Maneuver in storms. Token."),
  R("windcatcher", "weaver", 2, 3, "rope",   "Woven Wind-Catcher", "+5 ft ship Speed. Token."),
  R("featherpack", "weaver", 3, 0, "crate",  "Featherlight Pack", "Its contents weigh half."),
  R("gillhood",    "weaver", 3, 1, "fish",   "Gillweave Hood", "Breathe water 10 minutes each day."),
  R("stormbanner", "weaver", 3, 2, "crest",  "Stormsail Banner", "+1 ship Maneuver. Token."),
  R("skycloak",    "weaver", 3, 3, "cloak",  "Skyweave Cloak", "Feather fall on yourself once per day."),
  // ---- COOK'S UTENSILS ----
  R("rations",     "cook", 0, 0, "fish",    "Sea Rations (10 days)", "10 days of preserved food.", "Sea Rations x10"),
  R("hotmeal",     "cook", 0, 1, "tankard", "Hot Meal Service", "Next short rest: each ally heals +2 HP. Token."),
  R("pickled",     "cook", 0, 2, "crate",   "Pickled Stores (20)", "Rations that cannot spoil or soak.", "Pickled Stores x20"),
  R("galleyfeast", "cook", 0, 3, "tankard", "Galley Feast", "After tonight's long rest, everyone gains 1d6 temp HP. Token."),
  R("spicecache",  "cook", 1, 0, "crate",   "Spice Cache", "Converts 1 Supply into 10 rations. Token."),
  R("broth",       "cook", 1, 1, "tankard", "Fortifying Broth (4)", "Advantage on your next Con save within 1 hour."),
  R("grogcask",    "cook", 1, 2, "tankard", "Sailor's Grog Cask (6)", "Advantage against fear for one scene."),
  R("victoryfeast","cook", 1, 3, "tankard", "Victory Feast", "Party gains advantage on initiative next battle. Token."),
  R("delicacies",  "cook", 2, 0, "crate",   "Preserved Delicacies (3)", "+2 on one Persuasion over a shared meal."),
  R("chowder",     "cook", 2, 1, "fish",    "Deep-Fish Chowder (4)", "Darkvision 30 ft for 1 hour."),
  R("firejerky",   "cook", 2, 2, "fish",    "Firepepper Jerky (6)", "Resistance to cold for 1 hour."),
  R("banquet",     "cook", 2, 3, "tankard", "Heroes' Banquet", "Party: 1d8 temp HP and advantage vs poison until long rest. Token."),
  R("messkit",     "cook", 3, 0, "tankard", "Master's Mess Service", "Short rests: reroll 1s on hit dice. Token."),
  R("preserves",   "cook", 3, 1, "crate",   "Ambrosial Preserves (4)", "Eating one ends frightened or charmed."),
  R("roast",       "cook", 3, 2, "fish",    "Leviathan Roast (6)", "Immune to fear, +2d6 temp HP until long rest."),
  R("heroesfeast", "cook", 3, 3, "tankard", "True Heroes' Feast", "As the spell heroes' feast; feeds the party. Token."),
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const recipesByTool = (toolId) => RECIPES.filter((r) => r.tool === toolId);
