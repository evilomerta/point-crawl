// ===========================================================================
// THE CHRONICLE v5: the engine of Between Tides.
// Delve rooms are branching encounters. Every failed attempt changes the room.
// Five failed attempts in one room and the delve is lost with everything in it.
// ===========================================================================

import { NODES } from "./data";
import { DT } from "./downtime";

export const CH = {
  ACTIONS_PER_DAY: DT.MAX_FREE,
  STRESS_MAX: 10,
  STRESS_FRAY: 7,
  INJURY_DAYS: 3,
  PURSUIT_GOAL: 3,
  RUMOR_CAP: 24, CLUE_CAP: 20, DEED_CAP: 8, LOG_CAP: 20,
  MIND_CLEAR_AT: 3,
  VIRTUE_CHANCE: 0.15,
  PRESS_CHANCE: 0.35,
  PRESS_MOD: -3,
  PRESS_INJURY: 0.4,
  BOSS_HP: 4,
  ROOM_ATTEMPTS: 5,          // five failed attempts in a room ends the delve
  ITEM_DROP: 0.3,
  SATCHEL_CAP: 6, EQUIP_CAP: 2,
};

// --- tiny deterministic rng -------------------------------------------------
export function hash32(str) { let h = 9; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 387420489) >>> 0; return h; }
export function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// --- risk grammar -------------------------------------------------------------
export const TIERS = {
  c: { dc: 0,  label: "careful" },
  s: { dc: 6,  label: "safe" },
  u: { dc: 10, label: "uncertain" },
  b: { dc: 14, label: "bold" },
};
export function tierPct(t) {
  const dc = TIERS[t].dc; let n = 0;
  for (let f = 1; f <= 20; f++) if (f === 20 || (f !== 1 && f >= dc)) n++;
  return Math.round((n / 20) * 100);
}
export function rollTier(roll, t, mod = 0) {
  const dc = TIERS[t].dc;
  const fumble = roll === 1, crit = roll === 20;
  return { success: crit || (!fumble && roll + mod >= dc), crit, fumble };
}

// --- condition ----------------------------------------------------------------
export function stressNow(p) {
  const s = p?.stress || 0;
  if (!s) return 0;
  const days = Math.floor((Date.now() - (p.stressTs || Date.now())) / 86400000);
  return Math.max(0, s - Math.max(0, days));
}
export function activeInjuries(p) { return (p?.injuries || []).filter((i) => i.until > Date.now()); }
export function boldLocked(p) { return activeInjuries(p).length > 0; }
export const STRESS_BANDS = [
  { at: 0, word: "Steady",   line: "Hands sure, sleep sound. You are fine." },
  { at: 3, word: "Worn",     line: "Tired and salt-stung, but holding." },
  { at: 5, word: "Strained", line: "Your focus slips. Mistakes come easier." },
  { at: 7, word: "Frayed",   line: "Nerves shot. Loud noises make you flinch." },
  { at: 9, word: "Haunted",  line: "Barely holding on. One more shock could break you." },
];
export function stressBand(v) { let b = STRESS_BANDS[0]; for (const x of STRESS_BANDS) if (v >= x.at) b = x; return b; }
export const INJURIES = [
  "a gashed forearm, wrapped tight", "a wrenched knee that hates ladders", "two cracked fingers, splinted",
  "a salt-burned eye under a patch", "bruised ribs that catch every breath", "a rope-torn palm",
  "a twisted ankle, bound in canvas", "a ringing ear from a falling block",
  "a barnacle-cut shin, weeping salt", "a dislocated shoulder, set wrong then right",
  "a hook-scarred thumb, stiff in the cold", "a coral-scraped back, shirt stuck to it",
  "a split lip that reopens when you grin", "a crab-pinched heel, swollen in the boot",
  "a wrenched wrist that drops mugs", "a bitten tongue, words coming careful",
  "a bruised tailbone, no sitting easy", "a powder-singed eyebrow and a headache",
  "a jellyfish welt across the neck", "a stubbed black toenail, every stair a curse",
];

// At the breaking point the mind gives, and it gives a NAME.
export const MINDS = [
  { id: "tidemad", name: "Tide-Maddened", virtue: false,
    line: "Caution disgusts you now. You need the risk.",
    effect: "You cannot take careful choices." },
  { id: "wary", name: "Wary of Every Face", virtue: false,
    line: "Crowds and strangers feel like traps.",
    effect: "You cannot use the Tavern or the Market." },
  { id: "wreckeyed", name: "Wreck-Eyed", virtue: false,
    line: "You keep seeing the water rise when it is not rising.",
    effect: "All rolls take a -1 penalty." },
  { id: "hollowed", name: "Hollowed", virtue: false,
    line: "Nothing feels good. Not rest, not drink, not company.",
    effect: "Rest and revelry restore only half as much." },
  { id: "steadied", name: "Sea-Steadied", virtue: true,
    line: "The pressure settled you instead of breaking you.",
    effect: "All rolls gain a +1 bonus." },
];
export const MIND_BY_ID = Object.fromEntries(MINDS.map((m) => [m.id, m]));
export function mindOf(p) {
  if (!p?.mind) return null;
  if (stressNow(p) <= CH.MIND_CLEAR_AT) return null;
  return MIND_BY_ID[p.mind.id] || null;
}
export function rollMind(rnd = Math.random()) {
  if (rnd < CH.VIRTUE_CHANCE) return MIND_BY_ID.steadied;
  const aff = MINDS.filter((m) => !m.virtue);
  return aff[Math.floor(Math.random() * aff.length)];
}

// The narrator passes judgment after each roll.
export const NARRATOR = {
  crit: [
    "Perfect. Could not have gone better.",
    "Clean work. Even the gulls went quiet for that.",
    "Done so well it will be a story by morning.",
    "Flawless. Enjoy it. It will not always be so.",
  ],
  success: [
    "It works. Take your winnings.",
    "Done, and done cleanly.",
    "Good enough, and good enough wins the day.",
    "Success, owed to nobody.",
  ],
  boldFail: [
    "Bold, but the aim was off.",
    "You reached too far and paid for it.",
    "Nerve is fine. Footing is better.",
    "Big swing, bigger miss.",
  ],
  fail: [
    "It does not work. Mark the cost.",
    "Not this time.",
    "Wrong call, plain and simple.",
    "Close, which only makes it sting.",
  ],
  fumble: [
    "Disaster. Everything that could go wrong, did.",
    "A catastrophe. You will be retelling this one.",
    "Total failure, the kind people hear about.",
    "Some nights the sea just wins.",
  ],
  press: [
    "You pushed past safe water for this. It paid.",
    "Greedy and lucky. The best combination.",
    "Deeper water, bigger haul. This time.",
  ],
};
export function narrate(verdict, tier, pressed = false) {
  const pool = verdict.crit ? NARRATOR.crit
    : verdict.fumble ? NARRATOR.fumble
    : verdict.success ? (pressed ? NARRATOR.press : NARRATOR.success)
    : tier === "b" ? NARRATOR.boldFail : NARRATOR.fail;
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- trinkets -------------------------------------------------------------------
export const TRINKETS = [
  { id: "wreckiron", name: "Wreck-Iron Charm", rare: false, fx: "delve1",
    fxText: "+1 on every delve roll",
    line: "A nail from a hull that never gave. It still holds." },
  { id: "gullfeather", name: "Gull-Feather Token", rare: false, fx: "ashore1",
    fxText: "+1 on every roll outside delves",
    line: "Gulls survive everything. Carry the proof." },
  { id: "saltcord", name: "Salt-Knotted Cord", rare: false, fx: "bold2",
    fxText: "+2 when you pick a card's bold option",
    line: "Three knots, three storms outlived." },
  { id: "thimble", name: "Chartwright's Thimble", rare: false, fx: "careful2",
    fxText: "+2 when you pick a card's careful option",
    line: "Small, brass, and incapable of panic." },
  { id: "monkscord", name: "Drowned Monk's Cord", rare: false, fx: "calm",
    fxText: "Failures that cost 2 stress cost 1",
    line: "Tied by hands that were done being afraid." },
  { id: "spyglass", name: "Spyglass Shard", rare: false, fx: "chase2",
    fxText: "+2 while chasing rumors",
    line: "It only shows what is really there." },
  { id: "pitchwick", name: "Pitch-Lantern Wick", rare: false, fx: "lantern",
    fxText: "+1 in dim delve rooms",
    line: "It burns on what the dark exhales." },
  { id: "bonedie", name: "Whaleback Die", rare: false, fx: "press2",
    fxText: "+2 on double-or-nothing offers",
    line: "Carved from something that gambled bigger." },
  { id: "shellplate", name: "Warden's Shell Plate", rare: "carrack", fx: "potguard",
    fxText: "Failures cannot bite the haul",
    line: "Pried off the Warden himself. The dark bites you, never the haul." },
  { id: "firstkey", name: "Rasp's First Key", rare: "vault", fx: "delve2",
    fxText: "+2 on every delve roll",
    line: "It opens nothing. Doors stand aside anyway." },
  { id: "chorustooth", name: "Severed Chorus Tooth", rare: "warren", fx: "boss2",
    fxText: "+2 in boss lairs",
    line: "It still hums the note. Big things flinch from it." },
  { id: "heartacorn", name: "Heartwood Acorn", rare: "orchard", fx: "rootskin",
    fxText: "Wounds never lock bold options",
    line: "The Tree forgave worse than you." },
  { id: "capacitor", name: "Choir Capacitor", rare: "skylift", fx: "ashore2",
    fxText: "+2 on every roll outside delves",
    line: "It hums a work-song your hands believe." },
  { id: "clapper", name: "Vesper's Clapper", rare: "chapel", fx: "resttwice",
    fxText: "Stress you calm counts double",
    line: "Quiet now. It rings only for you." },
];
export const TRINKET_BY_ID = Object.fromEntries(TRINKETS.map((t) => [t.id, t]));
export function equippedFx(p) {
  return new Set((p?.equipped || []).map((id) => TRINKET_BY_ID[id]?.fx).filter(Boolean));
}
export function itemChoiceMod(p, ctx, tier) {
  const fx = equippedFx(p);
  let m = 0;
  if (ctx.kind === "delve") {
    if (fx.has("delve1")) m += 1;
    if (fx.has("delve2")) m += 2;
    if (fx.has("lantern") && ctx.dim) m += 1;
    if (fx.has("boss2") && ctx.depth === "boss") m += 2;
  } else {
    if (fx.has("ashore1")) m += 1;
    if (fx.has("ashore2")) m += 2;
    if (fx.has("chase2") && ctx.kind === "chase") m += 2;
    if (fx.has("press2") && ctx.press) m += 2;
  }
  if (fx.has("bold2") && tier === "b") m += 2;
  if (fx.has("careful2") && tier === "c") m += 2;
  return m;
}

// --- the cast -------------------------------------------------------------------
export const NPCS = [
  { id: "saltjaw",  name: "Old Saltjaw" },  { id: "merrow",  name: "Sister Merrow" },
  { id: "cogg",     name: "Cogg Brassbird" },{ id: "yvein",   name: "Elder Yvein" },
  { id: "lumen",    name: "Lumen of the Court" }, { id: "harrow", name: "Captain Harrow" },
  { id: "pell",     name: "Pell Two-Knots" },{ id: "ondine",  name: "Mother Ondine" },
  { id: "fennick",  name: "Fennick the Quill" }, { id: "drowse", name: "Drowse" },
  { id: "coralin",  name: "Coralin" },       { id: "brack",   name: "Brack Ironkettle" },
  { id: "selka",    name: "Selka of the Nets" }, { id: "vey",  name: "Vey Halfsong" },
  { id: "thorn",    name: "Warden Thorn" },  { id: "moth",    name: "Moth" },
  { id: "galien",   name: "Galien Deepcaller" }, { id: "perch", name: "Perch" },
  { id: "ila",      name: "Ila Wavewrit" },  { id: "norrel",  name: "Norrel the Grey" },
  { id: "sable",    name: "Sable Underleaf" },{ id: "quay",   name: "Quaymaster Hobb" },
  { id: "nerei",    name: "Nerei" },         { id: "tassel",  name: "Tassel" },
];
export function faceIdFor(name) { const n = NPCS.find((x) => x.name === name); return n ? n.id : null; }

// --- rumor weaving ----------------------------------------------------------------
const RUMOR_SUBJECTS = [
  "a sealed cargo nobody will sign for", "lights moving under the water by night", "a hiring call for quiet hands",
  "a bough cracking that should not crack", "an old chart with a harbor that is not on any chart",
  "a priest who stopped taking offerings", "a wreck that was not there last tide", "tools going missing from the forges",
  "a stranger paying in pre-Fall coin", "a song the divers will not finish", "a cell of kraken-cultists recruiting",
  "an elder's letter that never arrived", "a locked door where there was no door", "nets coming up cut, not torn",
  "a bell ringing from below at slack tide", "two crews claiming the same salvage writ", "a healer buying poison-herbs",
  "an airship that left without its captain",
];
const RUMOR_TWISTS = [
  "and someone is paying to keep it quiet", "and the {faction} deny everything", "and it has happened twice before",
  "and a child saw who did it", "and the date matters more than anyone admits", "but half the story is bait",
  "and {npc} knows more than they say", "and it began the night the tide ran backward",
  "and whoever asks about it gets followed", "but the truth is stranger than the telling",
];
export function makeRumor(rng, locId = null, factionHint = null) {
  const locs = Object.keys(NODES);
  const loc = locId || pick(rng, locs);
  const faction = factionHint || NODES[loc].faction;
  const npc = pick(rng, NPCS);
  let t = `At ${NODES[loc].name}: ${pick(rng, RUMOR_SUBJECTS)}, ${pick(rng, RUMOR_TWISTS)}`;
  t = t.replace("{faction}", faction ? faction : "harbor folk").replace("{npc}", npc.name);
  return { id: `r${Date.now()}${Math.floor(rng() * 999)}`, t, loc, faction, status: "fresh" };
}

// --- findings ------------------------------------------------------------------------
export const FINDING_SETS = [
  { name: "Fall of the Tree", color: "#9ab87e", frags: [
    "A bark-rubbing of the last season-ring. The ring is unfinished, as if the year itself stopped.",
    "A Bough lament with one line scratched out in every surviving copy. Same width every time.",
    "A tide-table from before the Fall, annotated: 'the roots are drinking more than rain.'",
    "A sailor's account of the night of the Fall: the stars did not move, but the horizon did.",
    "A child's drawing kept under glass at Hearthbough: the Tree, and beneath it, a hand.",
  ] },
  { name: "Deep Roads", color: "#8a7cc0", frags: [
    "A diver's slate: 'the glow brightens when we sing, dims when we lie.'",
    "A Sunken charm carved with a road that loops through itself. The loop should be impossible.",
    "Depth-marks on a bell rope that exceed the rope's own length.",
    "A coral scholar's note: 'the roads predate the drowning. So what were they roads through?'",
    "A map fragment in waterproof ink. One junction is labeled 'THE HEART, DO NOT.'",
  ] },
  { name: "Bargained Gods", color: "#74b0c9", frags: [
    "A votive ledger where every tenth offering is marked 'returned.'",
    "A drowned-god prayer that rhymes perfectly in a language nobody alive speaks.",
    "A priest's confession: 'we do not pray up. We pray down, and something passes it along.'",
    "Two identical miracle reports from shrines an ocean apart. Same night, same words.",
    "A contract scrap signed by a god whose name the salt has eaten, witnessed by an older mark.",
  ] },
  { name: "Kraken Beneath", color: "#c2455a", frags: [
    "A harpooner's tally of arms cut from 'the beast.' It passed one hundred years ago.",
    "A cultist's catechism: 'we do not wake it. We rehearse.'",
    "Wreck-timber scored by suckers in a spiral that matches no living squid, but matches the deep roads.",
    "A Faithful warning bell whose note, slowed down, is a heartbeat.",
    "The oldest chart in the Reach marks the Kraken not as a beast but as a place.",
  ] },
];
export const FINDINGS = FINDING_SETS.flatMap((s) => s.frags.map((t) => ({ t, set: s.name, color: s.color })));
export function randomFinding(rng) { return FINDINGS[Math.floor(rng() * FINDINGS.length)]; }

// ===========================================================================
// UNDERTAKINGS ASHORE: direct prose, one card per candle.
// Every card carries two fail follow-ups, keyed to the choice that failed.
// A follow-up is a free salvage attempt: smaller prize, one more chance.
// ===========================================================================
const F = (p, a, b) => ({ p, choices: [a, b].map(([label, t, out, note]) => ({ label, t, out, note })) });

export const ACTIONS = [
  { id: "rumors", name: "Chase a Rumor", icon: "eye",
    blurb: "Pick a rumor and confirm it into a clue for Friday's group, or put a false one to rest.",
    needsRumor: true },

  { id: "docks", name: "Find Rumors: Docks", icon: "rope",
    blurb: "Hunt the waterfront for fresh rumors to chase.",
    deck: [
      { p: "A freighter at the quay rides too low for her listed cargo, and her crew will not meet your eye. Whatever she carries, it is not on the manifest.", choices: [
        { label: "Copy her manifest from the harbor board", t: "s", out: { rumor: 1 }, note: "The paper lists wool and salt fish. Her waterline says iron, or bodies. Either way, you have a story worth chasing." },
        { label: "Buy her deckhand a hot breakfast", t: "u", out: { rumor: 1, ease: 1 }, note: "Two plates in, he names the cargo, the buyer, and the night it moves. Then he begs you to forget his face." },
        { label: "Slip aboard during the watch change", t: "b", out: { rumor: 2 }, note: "Crates in the hold, packed in salt and stamped with no maker's mark. You note the destination chalked on each one and get out clean." } ],
        fail: [
          F("The harbormaster catches you at his board, copy half made, and holds out his hand for it. He has not called the watch. Yet.",
            ["Hand it over with an easy apology", "s", { rumor: 1 }, "He takes the copy and lets slip, in his scolding, more than the manifest ever held: her berth fee was paid by a third party, in advance, in old coin."],
            ["Offer him a drink and your honest question", "u", { rumor: 1, ease: 1 }, "Harbormasters drink like men who see everything. Two cups in, he tells you what the freighter is, and why his office pretends not to know."]),
          F("The deckhand goes pale mid-bite, drops his fork, and bolts. Across the room, two crewmates have just walked in, and they watched him sit with you.",
            ["Finish your breakfast like a stranger", "s", { rumor: 1 }, "You eat slowly, alone, just a body at a table. The crewmates relax, order ale, and talk too loud about tomorrow's tide. You take what the runner could not give."],
            ["Follow the deckhand out the back", "b", { rumor: 2 }, "You catch him in the alley, terrified and grateful for the cover. He spills everything fast, just to be done carrying it."]),
          F("A lantern swings your way mid-deck and a voice calls a name that is not yours, but is meant for you. The watch change has changed early, and you are standing in it.",
            ["Answer to the name and bluff through", "u", { rumor: 1 }, "You become whoever they think you are for thirty steps and one ladder. By the time the mistake surfaces, you and a glance at the hold are over the rail."],
            ["Go over the side, quiet as cargo", "s", { rumor: 1 }, "Cold water, clean exit. From under the pier you hear the deck argue about what they saw, and the argument names the cargo twice."]),
        ] },
      { p: "Two salvage crews are squaring off over a torn writ, hands drifting toward knives. The crowd is gathering to watch, which means nobody is watching anything else.", choices: [
        { label: "Watch from the cargo stacks and take names", t: "c", out: { rumor: 1 }, note: "You learn both captains, both backers, and which one is lying. Useful names, cheaply bought." },
        { label: "Step between them and talk it down", t: "u", out: { rumor: 1, ease: 1 }, note: "Nobody bleeds today. The grateful foreman tells you what the salvage actually is, and why two crews want it badly enough to kill." } ],
        fail: [
          F("A stack shifts under your boot and a crate of fittings goes down ringing. Both crews turn. For one bad moment, the only thing they agree on is you.",
            ["Point at the loudest captain and shout a question", "u", { rumor: 1 }, "Nothing redirects a mob like an accusation. The captains turn on each other over your question, and their shouting answers it."],
            ["Drop flat and listen under the stacks", "s", { rumor: 1 }, "Beneath the cargo, sound carries strangely well. You leave with both captains' whispered orders to their seconds, word for word."]),
          F("Your peacemaking lands wrong. Both crews decide the stranger in the middle must be the other side's hire, and the circle around you closes.",
            ["Name the salvage out loud, plainly", "b", { rumor: 2 }, "You say the thing nobody was supposed to say, and the fight dies of exposure. In the stunned quiet, the foreman tells you the rest just to feel less alone with it."],
            ["Back out slow with open hands", "s", { rumor: 1 }, "You retreat with dignity mostly intact, and the dockside grannies who watched it all fill in everything you missed, with editorial."]),
        ] },
      { p: "A child selling knot-charms keeps glancing at one warehouse door. Men go in empty-handed and come out empty-handed, all day long.", choices: [
        { label: "Buy a charm and watch the door with her", t: "s", out: { rumor: 1 }, note: "Whatever moves through that warehouse moves as paper. She has counted eleven visitors today. You note the twelfth." },
        { label: "Ask her straight what she has seen", t: "b", out: { rumor: 2 }, note: "For three coins she tells you everything: faces, hours, and a password she was not supposed to hear. Nobody believes children, which makes them excellent spies." } ],
        fail: [
          F("The twelfth visitor stops in front of you instead of the door, looks at your new charm, and asks, pleasantly, how long you have been watching. The child is gone.",
            ["Sell the watching as your trade and offer it", "u", { rumor: 1 }, "You quote a watcher's day rate with a straight face. He laughs, declines, and in declining tells you exactly what he assumed you had already seen."],
            ["Admire your charm and play the idler", "s", { rumor: 1 }, "You are nobody, buying junk, enjoying the sun. He buys it, goes in, and you take the password he gives the door."]),
          F("Three coins was the wrong offer. The child pockets them, screams THIEF at full pitch, and points at you. Heads turn the whole length of the quay.",
            ["Laugh loud and flip her a fourth coin", "u", { rumor: 1 }, "The crowd reads it as a game, the scream dies as theater, and the girl, impressed by your nerve, mutters half the password as an apology."],
            ["Vanish into the fish market crush", "s", { rumor: 1 }, "You lose the attention in the haddock stalls and surface beside the one fishwife who watches that door all day for free, and talks for the company."]),
        ] },
      { p: "Low tide has bared the flats, and a ship's figurehead stands upright in the mud, facing the harbor. No wreck nearby. No drag marks.", choices: [
        { label: "Sketch it and ask the old netmenders", t: "s", out: { rumor: 1 }, note: "Three of them name the same lost ship, then change the subject. A ship the whole quay refuses to discuss is a story by itself." },
        { label: "Wade out and dig beneath it", t: "u", out: { finding: 1 }, note: "Under the figurehead, a waxed packet, bone dry. Someone planted it here for the tide to deliver. Now it delivers to you." } ],
        fail: [
          F("The netmenders take one look at your sketch and stop talking entirely, all three, all at once. One of them quietly turns your sketch face down on the bench.",
            ["Leave the sketch with them and walk away", "s", { rumor: 1 }, "Gifts loosen what questions lock. By evening a netmender's granddaughter finds you with a message: the name of the ship, and the words tell no one we told."],
            ["Ask the youngest one alone, later", "u", { rumor: 1, ease: 1 }, "Away from the others he talks like a man lancing a wound, fast and relieved. The ship, the night, and why the quay keeps its silence."]),
          F("The mud takes you to the thigh and holds, and the tide has turned. The figurehead's wooden eyes watch you sink with what you would swear is patience.",
            ["Work free slow, leave the dig", "s", { rumor: 1 }, "You unstick yourself by inches and wade home wet to the ribs. From the seawall, an old salt who watched the whole show tells you what is buried there, and why nobody digs."],
            ["Dig faster than you sink", "b", { finding: 1 }, "Mud to the waist, water to the knees, and your fingers close on the waxed packet as the first wave slaps the figurehead. You come out crawling, prize in your teeth."]),
        ] },
      { p: "Oars creak through the night fog with no lantern and no hail. A boat is landing where boats are not supposed to land.", choices: [
        { label: "Mark the landing spot and measure the keel", t: "c", out: { rumor: 1 }, note: "By morning the marks are raked over, but you have the keel width and the tide hour. Boats can be found. Habits can be watched." },
        { label: "Follow the carriers into the fog", t: "b", out: { rumor: 2 }, note: "Four turns, two doors, and a password spoken twice. You memorize all of it and peel off before the last door opens." } ],
        fail: [
          F("Your boot finds a tin pail in the dark and the clatter rolls across the water like applause. The oars stop. The fog goes very interested in your position.",
            ["Crouch and let the fog hold you", "s", { rumor: 1 }, "They probe the shore with whispers and give up. The whispers, before they fade, include a name and a next time, and you keep both."],
            ["Throw a stone far down the strand", "u", { rumor: 1 }, "The splash drags their attention thirty yards south, and the boat lands in a hurry right where you can count heads and cargo."]),
          F("The fog thins at the worst corner and the last carrier turns, lantern up, and looks straight at where you stand. Two heartbeats. Three.",
            ["Stagger past like a drunk going home", "s", { rumor: 1 }, "You sing half a verse, badly, and weave on by. The lantern drops, the carriers laugh, and their relieved talk hands you the destination."],
            ["Step up and give the password you heard", "b", { rumor: 2 }, "You say it the way they said it. The door opens onto faces, names, and stacked crates, and you are inside the story for one whole minute before slipping back out."]),
        ] },
    ] },

  { id: "gather", name: "Find Rumors: Market", icon: "ear",
    blurb: "Work the stalls and boards for rumors, with the odd lore find.",
    deck: [
      { p: "A spice-seller shortchanges herself in your favor and holds your eye while she does it. In the Brine Bazaar that is not a mistake. It is an invitation.", choices: [
        { label: "Take the change and hear her out", t: "s", out: { rumor: 1 }, note: "She leans over the saffron and gives you a name, a warehouse, and a date. Cheap at twice the discount." },
        { label: "Ask her plainly what she wants known", t: "u", out: { rumor: 2 }, note: "Plain dealing startles her into giving you two stories instead of one. Both check out by sundown." } ],
        fail: [
          F("As you pocket the change, a customs man drifts to the stall and starts weighing her saffron with great ceremony. Her eyes flick to you once: not now.",
            ["Browse the next stall until he leaves", "s", { rumor: 1 }, "You buy pepper you do not need and wait him out. When he goes, she talks twice as fast to make up the time."],
            ["Draw the customs man off with a question", "u", { rumor: 1, ease: 1 }, "You ask him something flattering and procedural, and he lectures you up the row while she mouths a name and a date over his shoulder."]),
          F("Plain dealing was the wrong tool. Her face shutters, the discount disappears, and she begins weighing your purchase with insulting precision.",
            ["Pay full price and apologize like a local", "s", { rumor: 1 }, "Respect, paid in coin and manner. She thaws by the wrapping and tucks a note in with your saffron: a place, an hour, alone."],
            ["Lean in and offer a secret first", "b", { rumor: 2 }, "You go first, and your secret is good. Trade reopens at a better rate, and she pays in two stories with names attached."]),
        ] },
      { p: "On the message board, one notice is pinned with a fish-hook instead of a nail. Hook-pinned notices are cult signals, or smuggler signals, or both.", choices: [
        { label: "Copy it before the wind takes it", t: "c", out: { rumor: 1 }, note: "By noon the notice is gone, hook and all. Your copy is the only one left, and it names a meeting place." },
        { label: "Wait and watch who collects it", t: "b", out: { rumor: 2 }, note: "The collector is a face you know from somewhere it should not be. Now you have the message and the messenger both." } ],
        fail: [
          F("Your charcoal snaps halfway through, and when you look up from your pocket, a stranger is reading over your shoulder, and then reading you.",
            ["Offer to share the copy openly", "u", { rumor: 1 }, "Conspirators hate witnesses but love recruits. He assumes you are already inside, corrects your copy, and adds the part the notice left out."],
            ["Fold the half-copy away and stroll", "s", { rumor: 1 }, "Half a copy plus a memorized hook-knot is enough. A netmender reads the knot for you over lunch: it names the sender's crew."]),
          F("The wind beats the collector to it. The notice tears free, skips across the square, and your stakeout is suddenly a footrace with paper.",
            ["Chase the paper through the stalls", "u", { rumor: 1 }, "You corner it against a crab cage, breathless and triumphant. The fishmonger who watched the chase tells you who pinned it, for the entertainment value alone."],
            ["Watch the hook instead of the paper", "s", { rumor: 1 }, "Paper flies, hooks stay. Within the hour a runner comes for the hook itself, and the runner's livery tells you which house is signaling."]),
        ] },
      { p: "Every coin-changer in the row has stopped taking one captain's scrip, all on the same morning. Credit dies before the man does, and his just died.", choices: [
        { label: "Ask a teller why, friendly and idle", t: "s", out: { rumor: 1 }, note: "The teller lists the captain's debts and his sins, in order of size. Somebody important called in everything at once. Worth knowing who." },
        { label: "Buy a fistful of the dead scrip cheap", t: "u", out: { finding: 1 }, note: "Worthless paper, priceless watermark. Held to a lamp, every note shows a second signature under the first. The captain was fronting for someone." } ],
        fail: [
          F("The teller's friendliness dies mid-sentence: her supervisor has appeared at her elbow, and the supervisor is looking at you the way tellers look at bad coin.",
            ["Change real money and small-talk the supervisor", "s", { rumor: 1 }, "Commerce launders curiosity. By the third pleasantry the supervisor herself explains the freeze, officially and incompletely, and the gap in her account is the answer."],
            ["Come back at closing for the teller", "u", { rumor: 1, ease: 1 }, "Off the clock, she talks like a held breath let out. The debts, the order they were called, and the clerk who delivered the order."]),
          F("The scrip-seller smells your interest and triples the price mid-handshake, loudly, drawing a small crowd of the curious and the predatory.",
            ["Walk away and buy from a quieter desperate", "s", { finding: 1 }, "Down the row, a man drowning in the stuff sells you a stack for pity-coin. Same watermark, same second signature, no audience."],
            ["Pay the gouge and ask for his story too", "b", { finding: 1, rumor: 1 }, "Overpaying buys gratitude. He throws in what he saw the night the credit died: who visited the changers, in what order, wearing whose colors."]),
        ] },
      { p: "An auction of unclaimed salvage ends on one sealed sea-chest, and three bidders are pushing the price far past anything a mystery box is worth. They know what is inside.", choices: [
        { label: "Track the bidders, not the chest", t: "s", out: { rumor: 1 }, note: "Three strangers, one shared tailor, one shared paymaster. By dusk you know whose coin sat behind all three paddles." },
        { label: "Bid just high enough to rattle them", t: "b", out: { rumor: 2 }, note: "You lose the chest and win the panic. One bidder corners you after, assumes you know everything, and confirms most of it trying to buy your silence." } ],
        fail: [
          F("Bidder two doubles back through the cloth-sellers and is suddenly behind you, asking the time of day with a hand inside his coat.",
            ["Give the time and a bored face", "s", { rumor: 1 }, "You are nobody, going nowhere, slightly rude. He peels off satisfied, and his doubling-back route has already shown you which door he protects."],
            ["Tell him his paymaster's tailor missed a stitch", "b", { rumor: 2 }, "A guess dressed as knowledge. His face does the confirming, and his hurry to report you leads you straight up the chain."]),
          F("Your rattling bid lands at the wrong moment: the auctioneer's hammer hovers, the room turns, and you are one breath from owning a chest you cannot afford.",
            ["Withdraw with a collector's regretful bow", "s", { rumor: 1 }, "Theater saves your purse. Afterward the auctioneer, who appreciates a performance, tells you what the lot papers really said."],
            ["Let it ride one beat, then fold to bidder three", "u", { rumor: 1, ease: 1 }, "Your fold hands the win to the weakest bidder, who is so grateful to be done that he tells you, over a steadying drink, exactly what he just bought."]),
        ] },
    ] },

  { id: "tavern", name: "Unwind: Tavern", icon: "tankard",
    blurb: "Drink, sing, and let the harbor talk. Calms stress. Afflictions lift once your stress falls to 3 or lower.",
    deck: [
      { p: "Gravewater taproom is an upturned hull full of rowers, and a shanty is starting in its ribs. The room turns to see if you know the answering verse.", choices: [
        { label: "Hum along until the words come back", t: "s", out: { ease: 1, rumor: 1 }, note: "You find the verse by the second chorus. Between songs the rowers trade news freely, and you are one of them tonight." },
        { label: "Stand on the bench and lead the old verse", t: "u", out: { ease: 2, rumor: 1 }, note: "The room roars it back at you. For one night you belong here, and people tell their own everything." } ],
        fail: [
          F("You hum the wrong tune entirely, and the rowers' shanty dies around your noise like a fire doused. Forty faces wait to see what you do with the silence.",
            ["Buy the singers a round by way of apology", "s", { ease: 1 }, "Coin forgives what ears cannot. The shanty restarts over your bought ale, and the bench makes room for the fool who pays."],
            ["Sing YOUR harbor's verse instead, loud", "b", { ease: 2, rumor: 1 }, "Wrong song, right spirit. They learn yours, you learn theirs, and the trade of verses turns into a trade of news."]),
          F("The bench tips. You go down in a crash of mugs, flat on your back in the sawdust, and the whole hull howls with laughter at your debut.",
            ["Take the bow from the floor", "s", { ease: 2 }, "You salute the room from the sawdust and the laughter turns warm. Nothing eases a man like being the best joke of the night and owning it."],
            ["Spring up and finish the verse anyway", "u", { ease: 1, rumor: 1 }, "Voice cracking, dignity gone, verse delivered. The rowers respect the finish more than the fall, and the oldest one talks to you like crew."]),
        ] },
      { p: "Wreck-divers are dicing at a barrelhead, drinking off whatever they saw down there today. A stool scrapes open in your direction.", choices: [
        { label: "Play small and listen big", t: "s", out: { rumor: 1, ease: 1 }, note: "You lose a few coppers and gain a set of coordinates. Divers talk easier with your coin in their pockets." },
        { label: "Wager something interesting", t: "b", out: { rumor: 2, ease: 1 }, note: "Risk buys the good stories, the ones that start with 'swear you will not repeat this.' You swear. You will absolutely repeat it." } ],
        fail: [
          F("The dice hate you and the divers notice you watching their mouths more than the bones. The table goes professionally quiet.",
            ["Lose bigger, on purpose, laughing", "s", { ease: 1, rumor: 1 }, "Nobody suspects a happy loser. Three rounds of your coppers later, the table forgets you have ears and remembers it has stories."],
            ["Set your knife on the barrel as the next stake", "b", { rumor: 2 }, "Steel on the table resets the mood. They match your nerve with their best wreck-tale, the one with the door in it, just to see your face."]),
          F("Your interesting wager turns out too interesting. The biggest diver wants it badly, and he has decided dice are slower than asking with his hands.",
            ["Let him win it across the table, gracefully", "s", { ease: 1, rumor: 1 }, "You throw the game so smoothly he never knows. Winners talk; he talks plenty, and your stake bought every word."],
            ["Stand and offer arm-wrestling for double", "u", { ease: 1, rumor: 1 }, "You lose the match and win the room. He buys the drinks, names the wreck, and calls you little anchor for the rest of the night."]),
        ] },
      { p: "The keep slides you a drink you did not order and nods at the corner table. The corner table is empty, and has been all night.", choices: [
        { label: "Drink it and check under the mug", t: "u", out: { rumor: 1, ease: 1 }, note: "Folded under the mug, a note in a careful hand: a place, an hour, and your name spelled right. Somebody is recruiting you for something." },
        { label: "Leave it untouched, politely", t: "c", out: { ease: 1 }, note: "You nurse your own drink and watch who watches the untouched one. Two faces. You will know them again." } ],
        fail: [
          F("The mug is bone dry underneath, and the keep is no longer behind the bar. The drink itself, now that you have drunk it, tastes faintly of an apology.",
            ["Walk to the empty corner table and sit", "u", { rumor: 1 }, "You complete the ritual yourself. Inside a knothole at the corner seat: the note that was never delivered, with your name and a second name crossed out."],
            ["Ask the potboy where the keep went", "s", { rumor: 1, ease: 1 }, "Potboys see everything and cost a copper. The keep stepped out the back with two strangers, and the potboy describes both down to their boots."]),
          F("Your politeness is read as refusal. The two watching faces rise together, leave together, and the keep will not meet your eye for the rest of the night.",
            ["Follow them out at a stroller's pace", "u", { rumor: 1 }, "They argue on the seawall about whether you were the right one. Their argument includes the name of who sent them, twice."],
            ["Stay, and tip the keep too well", "s", { ease: 1, rumor: 1 }, "Guilt and gratitude make keeps talkative. At closing he tells you who paid for the drink, and that they will try again somewhere you feel safer."]),
        ] },
      { p: "In the darkest booth a Faithless raider is weeping into her cup, repeating five words: the door under the water. Her crew left her here three days ago.", choices: [
        { label: "Sit with her and pay her tab", t: "s", out: { finding: 1, ease: 1 }, note: "She tells you the whole dive: the depth, the door, the carvings on it, and why her crew swam away from a fortune. Then she sleeps like the rescued." },
        { label: "Press her gently for the where", t: "b", out: { finding: 1, rumor: 1 }, note: "She draws the route in spilled rum, smears it, and begs you to forget it. You already memorized the depth mark and the heading." } ],
        fail: [
          F("Her tab, it turns out, is three days deep and beyond your pockets, and the keep wants the booth back. She is moments from the street, story and all.",
            ["Trade the keep a favor for her tab", "u", { finding: 1 }, "You owe the keep one unnamed errand now, which is its own story for later. She talks till dawn out of gratitude, and the door under the water gets walls, carvings, and a depth."],
            ["Walk her out and buy bread instead", "s", { ease: 1, rumor: 1 }, "Cheaper than rum and kinder. On the seawall, sobering, she gives you the half of the story she could never say drunk: the names of the crew who left her."]),
          F("Pressed, she breaks the wrong way: shoves the table, screams that you are one of THEM, and every eye in the tavern finds your face.",
            ["Hands up, sit back, let her storm", "s", { ease: 1 }, "You weather it without a word, and the room's verdict swings your way. The keep comps your drink, and the booth beside you murmurs what the raider has been raving all week."],
            ["Say the five words back to her, softly", "b", { finding: 1 }, "The door under the water. Hearing it in another mouth stops her cold. She sits, grips your wrist, and tells you the rest like a confession."]),
        ] },
    ] },

  { id: "train", name: "Recover", icon: "blade",
    blurb: "The repair shop: calms stress and closes wounds. Afflictions lift once your stress falls to 3 or lower.",
    deck: [
      { p: "Dawn, a wet deck, a practice blade, and nobody asking anything of you. An hour like this is worth more than it looks.", choices: [
        { label: "Work the old forms, slow and honest", t: "c", out: { ease: 1, heal: 1 }, note: "Sweat replaces worry, one form at a time. By the last drill your hands have stopped shaking." },
        { label: "Drill until your arms give out", t: "u", out: { ease: 2 }, note: "You empty yourself into the work. Whatever was circling your head has drowned in it. You feel hollowed out, in the good way." } ],
        fail: [
          F("Your grip betrays you mid-form and the practice blade skitters across the deck, fetching up at the boots of the first mate, who picks it up and waits.",
            ["Ask her to correct the form", "s", { ease: 1, heal: 1 }, "She fixes your grip, your stance, and the way you have been favoring the sore side. The favoring, it turns out, was half the problem."],
            ["Take it back and start the form over", "c", { ease: 1 }, "No shame in a dropped blade, only in a quit drill. The restart goes cleaner, and the morning still does its work."]),
          F("Your arms give out earlier than your pride does, and a careless lunge sends you skidding across wet planking into the scupper, seeing stars.",
            ["Lie there and breathe until the sky steadies", "c", { ease: 1 }, "Flat on your back, lungs working, gulls wheeling. Sometimes the rest is the drill. You get up emptied of more than effort."],
            ["Get up and finish with the off hand", "u", { ease: 2 }, "The weak hand demands total attention, and total attention is the whole cure. You finish trembling, grinning, and quiet inside."]),
        ] },
      { p: "A scarred old deckhand watches you exercise, then offers to fix your stance. The price is the story of how you got that look in your eye.", choices: [
        { label: "Trade your story for the lesson", t: "s", out: { ease: 1, heal: 1 }, note: "The fix is two inches of footwork and it changes everything. Telling the story out loud shrinks it down to size." },
        { label: "Offer to spar instead of talk", t: "b", out: { ease: 2 }, note: "You lose, flat on your back and laughing. Some lessons only land when you do, and this one landed clean." } ],
        fail: [
          F("Halfway into your story your voice quits on you, the bad part rising too fast, and the old deckhand holds up one scarred hand: stop.",
            ["Let him tell his story instead", "s", { ease: 2 }, "His is worse than yours, and he tells it like weather, survivable. You trade no words after, just footwork, and both burdens sit lighter."],
            ["Finish it anyway, eyes on the horizon", "u", { ease: 1, heal: 1 }, "You get it all out in one flat run of words. He nods once, fixes your stance without comment, and the fix includes the way you guard the old hurt."]),
          F("You spar, and his first counter puts you down hard on a shoulder that was already complaining. He stands over you, unimpressed and unhurried.",
            ["Tap the deck and take the lecture", "s", { ease: 1, heal: 1 }, "He binds the shoulder himself, properly, scolding the whole time. The scolding is a lesson and the binding is better than a healer's."],
            ["Get up and try his counter back at him", "b", { ease: 2 }, "You steal his own move and nearly land it. He barks the first laugh anyone has heard from him in years, and the morning turns into a masterclass."]),
        ] },
      { p: "The rigging-master has left the mast ropes down after drills, and the wind is rising just enough to make a climb mean something.", choices: [
        { label: "Three careful ascents, breathing even", t: "s", out: { ease: 1, heal: 1 }, note: "Steady work knits a body back together. From the crosstrees the whole harbor looks small enough to handle." },
        { label: "Race the next gust to the top", t: "b", out: { ease: 2 }, note: "You beat the wind by a hand's width. Your heart pounds from joy instead of fear for the first time in days." } ],
        fail: [
          F("Ten feet up, your arms announce they are not doing this today, and you hang there, cheek to the rope, going nowhere in either direction.",
            ["Climb down and walk the deck instead", "c", { ease: 1 }, "Honest retreat. You pace the deck until your breath finds its rhythm, and the rhythm does the climbing for you."],
            ["Rest on the rope, then take it in stages", "u", { ease: 1, heal: 1 }, "Hang, breathe, six feet, hang. The slow ladder up is gentler on the hurt than the ground ever is, and the crosstrees still pay the same view."]),
          F("The gust wins, hard. It peels you off the rope at the spar and leaves you swinging one-handed over the deck with your stomach somewhere above you.",
            ["Wrap the rope and ride the swing out", "s", { ease: 2 }, "You let the wind spend itself with you wrapped tight, and when it is done, something in your chest is spent too. You descend lighter."],
            ["Swing to the stay and finish the race", "b", { ease: 2 }, "You turn the fall into a leap, catch the backstay, and top out with the gust howling its defeat. Terror, transmuted, makes excellent medicine."]),
        ] },
      { p: "Off the stern at slack tide, Sunken folk are practicing breath-holds, sinking like dropped stones and rising calm. One beckons you to try the count.", choices: [
        { label: "Stay inside your limits", t: "c", out: { ease: 1, heal: 1 }, note: "Down in the green hush, all the noise in your head goes quiet. The deep feels less like a threat and more like a room." },
        { label: "Hold one count past comfort", t: "u", out: { ease: 1, finding: 1 }, note: "In the last second before you rise, you see what the Sunken see down there: a light, far below, in a straight line. Lights underwater do not run straight." } ],
        fail: [
          F("You bail at half the count, breaking the surface in a graceless thrash, and the Sunken watch you gasp with the patience of people who have seen every drowning that did not happen.",
            ["Float on your back and just breathe with them", "c", { ease: 1 }, "They float beside you, unbothered, breathing like tides. You match them without trying, and the panic dissolves into the green."],
            ["Ask for the count again, slower", "s", { ease: 1, heal: 1 }, "The teacher halves the count and doubles the patience. The second descent is a different world, and the cold, taken slowly, eases an ache you stopped noticing you carried."]),
          F("One count past comfort becomes three, the surface is suddenly a rumor, and a Sunken hand closes on your collar and hauls you up into air that tastes like being born.",
            ["Thank them and sit the next round out", "c", { ease: 1 }, "You watch from the ladder, heart slowing, oddly grateful. Almost is a strong tonic, taken once."],
            ["Go down again, with the teacher this side", "u", { ease: 1, finding: 1 }, "Escorted, you make the full count, and the teacher points: down, far down, the straight line of light. This time you see where it bends."]),
        ] },
    ] },

  { id: "pursuit", name: "Personal Goal", icon: "compass",
    blurb: "Work your private goal. Three steps of progress triggers a breakthrough the DM sees.",
    needsGoal: true,
    deck: [
      { p: "A rare empty hour: gray rain on the window, nobody asking for anything. Your goal sits where you left it, waiting.", choices: [
        { label: "Steady, unglamorous progress", t: "s", out: { pursuit: 1 }, note: "Honest inches. Nobody will sing about this hour, and it moved you further than any song would have." },
        { label: "Attempt the part you have been avoiding", t: "b", out: { pursuit: 2 }, note: "The hard part, faced and finished. Your hands shook the whole time and did the work anyway." } ],
        fail: [
          F("The empty hour fills itself with everything but the work: the window, the rain, an old letter you should not have reread. The goal sits untouched and the light is going.",
            ["Ten minutes. Just the smallest piece", "s", { pursuit: 1 }, "You bargain yourself down to ten minutes and the ten minutes catch fire. The smallest piece was the cork in the bottle."],
            ["Put the letter IN the work", "u", { pursuit: 1, ease: 1 }, "You stop fighting the distraction and use it. The old letter, faced squarely, turns out to be a tool, and the work moves with it."]),
          F("The avoided part fights back. An hour in, it is worse than you feared, wrong in a load-bearing way, and the whole goal sways above the flaw.",
            ["Brace it with a temporary fix and map the damage", "s", { pursuit: 1 }, "Not solved, but held, and now honestly measured. Knowing exactly how bad it is turns out to be most of the courage required."],
            ["Tear the flawed part out tonight", "b", { pursuit: 2 }, "Demolition is progress when the foundation is wrong. By midnight the flaw is rubble, the path is clear, and your hands have stopped shaking."]),
        ] },
      { p: "Someone you trust catches you at it, papers spread everywhere, and asks the question you have been dreading: what is all this?", choices: [
        { label: "Give them half the truth", t: "c", out: { pursuit: 1 }, note: "Enough said, no more. They nod, file it away, and let you keep your locked door. You work faster without the secret pressing." },
        { label: "Confide everything and ask their help", t: "u", out: { pursuit: 1, ease: 1 }, note: "Saying it out loud makes it real, and real things can be finished. Two sets of hands now." } ],
        fail: [
          F("Your half-truth comes out crooked and they hear the seam in it. Hurt walks across their face, and the silence after is worse than any question.",
            ["Give the other half, now, before it sets", "u", { pursuit: 1, ease: 1 }, "The whole truth, late but whole. The hurt fades into something better: they pull up a chair, and the work has a witness now."],
            ["Apologize and promise them the first telling", "s", { pursuit: 1 }, "You name a day. The promise costs you the secret's comfort, and the deadline, it turns out, is exactly what the work was missing."]),
          F("You confide everything, and their face does the thing you dreaded: doubt, then worry, then the gentle voice people use on the unwell. They think the goal is the problem.",
            ["Show them the strongest piece of it", "s", { pursuit: 1 }, "Evidence argues better than passion. The strongest piece lands, the gentle voice drops, and by the end they are suggesting improvements."],
            ["Thank them, and let the doubt sharpen you", "b", { pursuit: 2 }, "Their worry becomes your whetstone. You work that night like a person with something to prove, because now you have someone to prove it to."]),
        ] },
      { p: "A setback arrives by morning messenger: the thing you were counting on has fallen through, sunk, or been sold to somebody crueler.", choices: [
        { label: "Find the long way around", t: "s", out: { pursuit: 1 }, note: "Slower road, same destination. The detour shows you a door the straight path would have hidden." },
        { label: "Force it through, whatever it costs", t: "u", out: { pursuit: 1, ease: 1 }, note: "You burn a favor and a bridge, and buy your week back before nightfall. Costly, decisive, done." } ],
        fail: [
          F("The long way around dead-ends too: the second door you counted on was sold to the same cruel somebody, who is, you now realize, buying doors specifically ahead of you.",
            ["Map who they are and what they want", "s", { pursuit: 1 }, "An adversary, named and studied, is half-beaten. Their purchases trace a pattern, and the pattern shows the one door they have not thought to buy."],
            ["Go straight to them and ask their price", "b", { pursuit: 2 }, "You walk into the lion's office and negotiate. The price is steep and strange, but it is a price, and a named price is a path."]),
          F("The favor you burn calls in a favor of its own, tonight, and suddenly your bought-back week belongs to somebody else's emergency.",
            ["Pay the night, protect the week", "s", { pursuit: 1 }, "One miserable night of someone else's crisis, fence around your remaining days. The debt clears, the week holds, the goal proceeds."],
            ["Fold their emergency into your errand", "u", { pursuit: 1, ease: 1 }, "Their crisis and your goal, it turns out, pass through the same door. You solve both with one night's work and walk out owed instead of owing."]),
        ] },
    ] },
];
export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

export const CHASE_DECK = [
  { p: "The thread leads through {loc} after dark, where the lamps are spaced for secrets and every doorway counts who passes.", choices: [
    { label: "Tail it from a patient distance", t: "s", hint: "the steady road to the truth", note: "Patient feet, open eyes. You see the meeting, the handoff, and the faces, and nobody sees you." },
    { label: "Get ahead of it and wait", t: "u", hint: "ambush the truth", note: "You pick the corner the story has to pass and let it walk into your lap, breathless and unguarded." },
    { label: "Walk straight in asking questions", t: "b", hint: "force it: a bold success never dead-ends", note: "Doors open for nerve. Tonight they open wide, and the people inside assume you already know more than you do." } ],
    fail: [
      F("You lose the thread at a fork of alleys, and worse: a window above creaks open, and somebody is now patiently watching YOU stand lost in the lamplight.",
        ["Tip your hat to the window and ask directions", "u", { ease: 1 }, "Brass beats stealth once stealth is dead. The watcher, charmed, points the way the thread went, and adds what the thread was carrying."],
        ["Circle the block and pick it up at the far lamp", "s", { rumor: 1 }, "Lost threads follow lamps. You reacquire it two streets on, none the wiser, and the rumor lives to be chased another night."]),
      F("Your chosen corner was the right corner, ten minutes too late. Fresh bootprints, a dropped match still smoking, and a door you heard close but did not see.",
        ["Knock on the closed door, businesslike", "b", { rumor: 1 }, "You knock like a debt collector. The wrong person answers, assumes the worst, and bargains with information that names the right person."],
        ["Read the bootprints and the match", "s", { rumor: 1 }, "Heel-worn left boot, harbor tar, a match from one specific tavern. The thread is not caught tonight, but it is measured, and it will keep."]),
      F("The door you walk through goes quiet the moment you ask, and the room's biggest occupant rises to explain, with his shoulders, that questions cost extra here.",
        ["Buy the room a round and laugh it off", "s", { ease: 1 }, "Coin lowers shoulders. The room thaws, the big man sits, and though nobody answers your question, three people answer questions you did not ask."],
        ["Stand your ground and ask it again, slower", "b", { rumor: 1 }, "Nerve, doubled. The big man blinks first, the keep mutters get them what they want, and the want, partially, gets got."]),
    ] },
  { p: "Someone stitched to the rumor agrees to meet on a back stair. They name a price for what they carry, eyes on every exit.", choices: [
    { label: "Pay in honest coin", t: "s", hint: "the steady road to the truth", note: "Clean and forgettable, the way you both prefer it. The coin vanishes and the words stay." },
    { label: "Pay in a secret of your own", t: "u", hint: "costly, and it cuts deeper", note: "Costly currency, excellent exchange. Now you hold each other, which is the oldest kind of trust." },
    { label: "Refuse to pay, and press", t: "b", hint: "force it: a bold success never dead-ends", note: "Their bluff dies in their throat. You get the goods for free and an enemy for life. Fair trade." } ],
    fail: [
      F("Your coin is right but your timing is wrong: boots on the stair below, and your contact's eyes go wide. The meeting dissolves mid-handshake.",
        ["Cover their exit with your body and noise", "u", { ease: 1 }, "You become a loud lost drunk on a dark stair, and the boots detour around you. Your contact, watching from above, will remember the favor at the next meeting."],
        ["Pocket the coin and scatter opposite", "s", { ease: 1 }, "Clean break, no faces seen. The rumor keeps, the contact keeps, and the price, next time, will be the same."]),
      F("Your offered secret is not enough. They weigh it, hand it back, and tell you it is the kind everyone already half-knows. The stair grows colder.",
        ["Offer the secret UNDER that one", "b", { rumor: 1 }, "The real one. Their breath catches, the trade completes, and you walk away lighter and heavier at once, with the goods and a new shared chain."],
        ["Withdraw the offer and keep your dignity", "s", { ease: 1 }, "Some prices are too dear. You part on professional terms, and the thread stays warm for a better-funded night."]),
      F("They do not bluff. At your refusal they smile, descend the stair without a word, and somewhere below a door closes with the finality of a ledger.",
        ["Follow at a distance to learn their buyer", "s", { rumor: 1 }, "Refused goods still get sold. You shadow them to the actual buyer's door, which is a better name than the goods would have carried."],
        ["Leave a coin on the stair and your mark beside it", "u", { ease: 1 }, "A receipt for next time. Word travels in their trade: the one who refused pays after all. Your next meeting will start friendlier."]),
    ] },
  { p: "The trail forks under the lamplight: a clerk's office full of paper that cannot run, or a tide-bar full of people who can.", choices: [
    { label: "Chase the paper", t: "s", hint: "the steady road to the truth", note: "Ledgers lie exactly once each, and the lie is always the story. You find this ledger's lie on page nine." },
    { label: "Chase the people", t: "u", hint: "faces over files", note: "Faces tell what files omit. One flinch at the right name is worth a drawer of receipts, and you get the flinch." } ],
    fail: [
      F("The clerk's office is paper to the rafters and none of it filed sanely. Hours in, you have dust to the elbows and the dawning suspicion the real ledger left with the clerk.",
        ["Find where the dust is thinnest", "u", { rumor: 1 }, "Dust maps use. The one drawer opened daily holds not the ledger but the ledger's borrowing slip, signed, dated, and addressed."],
        ["Take the wastepaper basket instead", "s", { rumor: 1 }, "Drafts confess what fair copies conceal. The basket's torn pages, pieced at home, keep the rumor warm and add a sum that should not exist."]),
      F("The tide-bar makes you the moment you start asking, and the faces you came to read all turn the same direction: away. Glasses empty. The room is leaving in shifts.",
        ["Buy the last shift's round before they go", "s", { ease: 1 }, "The stragglers, bought and unhurried, were too low in the chain to be warned properly. Their gossip is secondhand and just specific enough."],
        ["Sit with the one face that did NOT turn", "b", { rumor: 1 }, "Whoever does not flee a sinking conversation either knows nothing or owns it. Yours owns it, and is bored, and bored owners talk."]),
    ] },
];
export const CHASE_RESULTS = {
  confirm: ["It holds. Names, places, and one detail nobody could have invented.", "True, and worse than the telling.", "Confirmed, with a witness willing to say so again by daylight."],
  deadend: ["A tale grown fat in the telling. Nothing under it but wind.", "Traced to a drunk's invention, embellished nightly. Let it sink.", "Smoke without fire, though somebody fanned it hard. That is its own small mystery."],
};
// ===========================================================================
// DECK EXPANSION: new card families pushed into the six undertakings.
// Same grammar as the originals: 2 choices per scene, 2 complications per
// scene (keyed to the choice that failed), chase scenes carry 3 choices.
// ===========================================================================
const DOCKS2 = [
  { p: "The night ferryman poles between anchored hulls with a hooded lamp, and he has seen every secret this harbor floats. He nods at the empty seat.", choices: [
    { label: "Pay the fare and ride a circuit", t: "s", out: { rumor: 1 }, note: "He talks where the water is loudest, so only you hear it. Two hulls out there are riding too low for their declared cargo." },
    { label: "Offer to pole while he talks", t: "u", out: { rumor: 1, ease: 1 }, note: "Work loosens him like drink loosens others. By the last hull you know the harbor by its bilges, and your shoulders have burned the day off." } ],
    fail: [
      F("Your coin rolls off the gunwale and goes down winking, and the ferryman watches it sink with the face of a man recalculating your worth.",
        ["Pay double from a dry pocket", "s", { rumor: 1 }, "Coin forgives coin. He poles you the long way around to make it worth your while, past the hull he was paid not to mention."],
        ["Offer your boots as collateral", "b", { rumor: 2 }, "He laughs for the first time in what sounds like years, waves off the boots, and tells you the thing he tells nobody, because nobody ever offered their boots."]),
      F("You catch a crab with the pole and nearly pitch both of you into the black water, and his lamp goes out in the scramble.",
        ["Relight it with your own flint, steady-handed", "s", { rumor: 1 }, "Light restored, dignity traded for competence. He marks you as useful, and useful people get told where not to row."],
        ["Pole on in the dark by feel", "u", { rumor: 1, ease: 1 }, "The dark is his country and now briefly yours. He narrates the harbor by sound alone, and the lesson is full of names."]),
    ] },
  { p: "The customs shed has a back window, a bored clerk, and a kettle always on. Tonight the kettle is cold and the clerk is burning papers in a bucket.", choices: [
    { label: "Knock and offer to share tea anyway", t: "s", out: { rumor: 1 }, note: "You brew, he burns, and between the two fires he talks. Somebody upstream is erasing a ship that officially never docked." },
    { label: "Read the ash as it rises", t: "b", out: { rumor: 2 }, note: "Half-burned manifests float past the window like grey moths. You catch three, and the three agree on a name and a date." } ],
    fail: [
      F("The clerk sees your face at the window mid-burn and freezes, bucket glowing between you, both of you now witnesses to each other.",
        ["Raise empty hands and step inside slowly", "u", { rumor: 1 }, "Calm beats flight. He decides a witness who shares the room is safer than one loose in the night, and tells you exactly enough."],
        ["Walk away whistling, visibly harmless", "s", { rumor: 1 }, "You give him your back like a man with nothing to fear. By morning a note finds you: half warning, half confession, all useful."]),
      F("A gust off the water sends the burning bucket over, and suddenly the customs shed is trying to join its own paperwork.",
        ["Beat the flames out with your coat", "s", { rumor: 1, ease: 1 }, "Your coat dies a hero. The clerk, soot-faced and grateful, owes you one shed and pays in what the papers said."],
        ["Save the unburned drawer first", "b", { rumor: 2 }, "Priorities. The drawer comes out cradled like a child, and its bottom folder names every ship that paid to be forgotten this season."]),
    ] },
  { p: "Salvage auction on the long pier: tarped lots, fast bidding, and one crate that three strangers keep not bidding on, carefully.", choices: [
    { label: "Watch the three strangers instead of the crate", t: "s", out: { rumor: 1 }, note: "Their eyes meet at every lot but that one. Whatever it is, they want it cheap and unwitnessed, and now you know their faces." },
    { label: "Bid once on the crate, just to see", t: "u", out: { rumor: 1, finding: 1 }, note: "All three heads turn like gun turrets. The auctioneer hammers it to you fast, terrified, and what is inside explains the fear." } ],
    fail: [
      F("The strangers notice you noticing, and one drifts to block the pier's only exit while the other two stop pretending to bid.",
        ["Bid loudly on a worthless lot, become a buyer", "s", { rumor: 1 }, "Camouflage by commerce. You overpay for rope, the strangers relax, and a sympathetic porter mutters what the crate took off a wreck."],
        ["Walk straight at the exit man, smiling", "b", { rumor: 2 }, "He breaks eye contact first. Men who block exits expect fear, and your smile bargains better than coin: he names his employer just to make you stop."]),
      F("Your single bid starts a war. The price triples in a heartbeat, the auctioneer is sweating, and three sets of eyes have memorized your coat.",
        ["Withdraw graciously, tip your hat to the winner", "s", { rumor: 1 }, "You lose the crate and win the room. The losing strangers, furious at the winner, talk to you out of pure spite."],
        ["Follow the crate after it sells", "u", { rumor: 1, finding: 1 }, "The buyer carts it three piers down to a boat with no name. You note the boat, the heading, and the symbol burned under its rail."]),
    ] },
  { p: "A crabber is hauling pots at the tide-line, and every pot tonight comes up holding something that is not crab.", choices: [
    { label: "Help haul and keep your questions short", t: "s", out: { rumor: 1 }, note: "Wet rope, shared work, few words. The pots hold bottles, sealed, each with a curl of paper, and the crabber lets you read one." },
    { label: "Buy the whole night's catch, sight unseen", t: "b", out: { rumor: 2 }, note: "He names a price like a dare and you pay it. Nine bottles, nine messages, one repeated word, and a map drawn in someone's desperate best." } ],
    fail: [
      F("A pot line snags dead weight below and the winch screams. Whatever is on the other end is heavier than crab and it is not letting go.",
        ["Cut the line before it takes the boat", "s", { ease: 1 }, "The crabber nods at your knife-speed. Boats over bottles, always. He pays the lesson forward with what last week's pots brought up."],
        ["Haul it up together, whatever it is", "b", { rumor: 1, finding: 1 }, "Two backs against the deep. What surfaces is a strongbox crusted shut, and its lid plate carries a fleet mark that sank years ago."]),
      F("Your coin flashes once in the lamplight and the crabber's face shutters. Buyers who pay blind are buyers who already know, and he wants no part of either.",
        ["Open one bottle together, partners in it", "u", { rumor: 1 }, "Shared guilt is trust. You read it aloud to him over the lamp, and his face says he recognizes the hand that wrote it."],
        ["Leave the coin on the gunwale and walk", "s", { rumor: 1 }, "No pressure, just patience. He whistles you back at the pier's end and trades the strangest bottle for the strangest customer."]),
    ] },
  { p: "Shift change at the harbor watchtower: the night man climbing down, the day man climbing up, and a gap of four unwatched minutes between them.", choices: [
    { label: "Share the night man's walk home", t: "s", out: { rumor: 1 }, note: "Tired men talk straight. He saw lights signal twice from the breakwater, logged it once, and was told to unlog it." },
    { label: "Climb the tower in the gap", t: "b", out: { rumor: 2 }, note: "Four minutes with the harbor's best eyes. The logbook's torn page is gone but the page beneath kept the impression, and you can read pencil ghosts." } ],
    fail: [
      F("The night man clocks your interest and his fatigue burns off like fog. Watchmen are paid to notice, and he is noticing you hard.",
        ["Claim you are writing a song about watchmen", "u", { rumor: 1, ease: 1 }, "Vanity is a master key. He gives you two verses of complaint and one of accidental intelligence, and hums himself home."],
        ["Show him a coin and an honest face", "s", { rumor: 1 }, "The oldest trade. He takes the coin, names the breakwater lights, and warns you which question never to ask him again."]),
      F("The day man arrives early, and you are halfway up a ladder you have no business on, with no story and a long drop.",
        ["Descend past him with a confident good morning", "s", { rumor: 1 }, "Confidence is a uniform. He returns the greeting, second-guesses himself, and you leave with what the stairwell graffiti spelled out."],
        ["Claim the night man sent you up for his pipe", "u", { rumor: 1 }, "The lie holds because it is boring. You fetch a real pipe off the sill, and beside it, a folded note meant for someone who signals."]),
    ] },
  { p: "Under the old pier a bell tolls at low tide, drowned and patient, and tonight the toll count is wrong by one.", choices: [
    { label: "Count it again from the pilings, carefully", t: "c", out: { rumor: 1 }, note: "Thirteen, not twelve. Somebody has hung a second clapper, and a second clapper means a signal, and a signal means a listener nearby." },
    { label: "Wade under and read the bell by hand", t: "u", out: { rumor: 1, finding: 1 }, note: "Cold to the chest, hand on bronze. The new clapper is wired to a line that runs shoreward, and fresh scratches spell a tally." } ],
    fail: [
      F("Your count keeps slipping, the echo doubling under the boards, until you realize half the tolling is coming from behind you.",
        ["Turn slowly with your lantern shuttered", "s", { rumor: 1 }, "A boy with a hand bell, paid to confuse the count. Caught, he confesses the who and the where for the price of not being marched home."],
        ["Stand still and let the ringer finish", "u", { rumor: 1 }, "Patience over panic. The pattern completes, you memorize it whole, and a pattern memorized is a code half-broken."]),
      F("The tide turns early. Water at your ribs becomes water at your chin between one heartbeat and the next, and the shore is a rumor behind you.",
        ["Climb the bell chain hand over hand", "b", { rumor: 1, ease: 1 }, "Up the cold links to the pier boards, lungs burning, alive. From above you see what the wading hid: the signal line and where it goes."],
        ["Swim the piling line back, steady", "s", { ease: 1 }, "Piling to piling, breath to breath. You come out soaked and schooled, and a watching oysterman tells you when the bell-men come, out of respect."]),
    ] },
  { p: "The rope-walk runs three hundred feet under one roof, and the spinners talk the whole shift because their hands never need their eyes.", choices: [
    { label: "Walk the length slow, ears open", t: "s", out: { rumor: 1 }, note: "Three hundred feet of gossip, braided like the rope. By the far door you know which captain cannot pay and which one suddenly can." },
    { label: "Take an empty station and spin badly", t: "u", out: { rumor: 1, ease: 1 }, note: "They adopt you out of pity. Teaching loosens tongues better than ale, and the work steadies your hands more than you expected." } ],
    fail: [
      F("The foreman intercepts your slow walk at the halfway post. The rope-walk sells rope, not eavesdropping, and he says so with his arms crossed.",
        ["Order fifty feet of best line on the spot", "s", { rumor: 1 }, "Customers may loiter. You leave with rope you needed anyway and the foreman's own complaint about who buys in secret bulk."],
        ["Compliment the lay of the rope like an expert", "u", { rumor: 1 }, "Flattery with vocabulary. He warms, walks you the length himself, and brags about the strange order: black-dyed, paid in advance, no name."]),
      F("Your bad spinning fouls the strand and forty feet of work kinks ruined. The spinners' chatter dies and the silence has your name in it.",
        ["Pay for the ruined length, no flinching", "s", { rumor: 1 }, "Coin mends rope. They restart the strand and the chatter, and let you stay to hear the part about the lighthouse keeper's new debts."],
        ["Stay the shift and learn it properly", "b", { rumor: 2 }, "Stubbornness is a credential here. By shift's end your strand holds, and the spinners trade the good gossip, the kind that needs trust."]),
    ] },
  { p: "Fishwife court convenes on the cleaning tables at gut-hour: six women, six knives, and jurisdiction over every reputation in the harbor.", choices: [
    { label: "Buy fish and linger respectfully", t: "s", out: { rumor: 1 }, note: "You gut alongside, badly, and the court tolerates you. Their verdict tonight concerns a first mate, and the evidence is damning and specific." },
    { label: "Bring them the gossip YOU have, as tribute", t: "b", out: { rumor: 2 }, note: "Trade goods. Your morsel buys you a seat, and the court pays in kind with the harbor's two best-kept secrets, cross-examined and confirmed." } ],
    fail: [
      F("Your lingering reads as lurking, and six knives pause in six hands while the senior wife asks, pleasantly, what exactly you are after.",
        ["Answer plainly: information, and name your subject", "u", { rumor: 1 }, "Honesty before the court. They confer in glances, decide your cause is just or at least entertaining, and rule in your favor."],
        ["Claim you came to learn the gutting stroke", "s", { rumor: 1, ease: 1 }, "They teach you, laughing at your thumbs, and somewhere in the laughter the verdict gets discussed as if you were furniture."]),
      F("Your tribute gossip is stale. The court heard it Tuesday, the senior wife says, and tribute that bores the bench is worse than none.",
        ["Apologize and offer to fetch their ale all evening", "s", { rumor: 1 }, "Penance accepted. By the third round you are invisible again, and invisible men hear the appeal, the retrial, and the sentencing."],
        ["Ask the court to teach you better sources", "u", { rumor: 1 }, "Humility flatters the bench. They diagram the harbor's gossip-current like a tide chart, and the chart itself is the prize."]),
    ] },
  { p: "The manifest clerk eats lunch alone on bollard fourteen, same hour daily, and feeds half his bread to a one-legged gull he calls Admiral.", choices: [
    { label: "Bring bread for the Admiral", t: "c", out: { rumor: 1 }, note: "You feed the gull, the gull endorses you, the clerk talks. Two manifests this week declared ballast where the waterline said cargo." },
    { label: "Ask him straight which manifests smell wrong", t: "u", out: { rumor: 1, finding: 1 }, note: "Directness, for once, is the trick. He has been waiting years for someone to ask, and the answer comes out of him like a confession." } ],
    fail: [
      F("The Admiral rejects your bread with a scream that turns every head on the quay, and the clerk gathers his lunch to leave.",
        ["Laugh and offer the clerk your better lunch", "s", { rumor: 1 }, "The gull cannot be bought but the clerk can be fed. Over your sausage he allows that bollard fourteen sees things the office unsees."],
        ["Win the gull over with patience and sardines", "u", { rumor: 1, ease: 1 }, "Twenty minutes of diplomacy with a bird. The clerk watches the whole campaign, delighted, and a delighted clerk is a leaky one."]),
      F("Your straight question lands wrong. The clerk goes office-faced, recites the public schedule, and reminds you manifests are private records.",
        ["Apologize and talk gulls for ten minutes", "s", { rumor: 1 }, "Retreat to safe ground. By minute eight he relaxes, and by minute ten he volunteers, unprompted, exactly what you first asked."],
        ["Leave your name and where ale finds you", "s", { rumor: 1 }, "No pressure, open door. He drinks where you said, two nights later, and arrives already talking."]),
    ] },
  { p: "A pier preacher sermonizes nightly to the moored boats, and lately his sermons contain coordinates, dressed as scripture.", choices: [
    { label: "Attend faithfully and write down the verses", t: "s", out: { rumor: 1 }, note: "Three nights of devotion. The numbers repeat in pairs, and the pairs are depths and headings, and the headings all point one direction." },
    { label: "Confess to him, and ask who writes his sermons", t: "b", out: { rumor: 2 }, note: "The confessional cuts both ways. Behind the scripture is a paying patron, and the preacher, soul heavy, names the go-between." } ],
    fail: [
      F("Your scribbling draws the congregation's eyes: writing during worship reads as mockery, and mockery of the pier's preacher has consequences.",
        ["Claim you transcribe sermons for your sick mother", "s", { rumor: 1 }, "A lie sweet enough to bless. The congregation softens, the preacher speaks slower for your pen, and the numbers come out clean."],
        ["Recite the last verse back from memory, reverent", "u", { rumor: 1 }, "Proof of attention beats apology. The preacher adopts you as his best listener and explains, privately, which verses are not his."]),
      F("At the word confession the preacher's hands shake. Whoever pays him also warned him, and your question matches the warning exactly.",
        ["Promise him passage out if it goes bad", "u", { rumor: 1, ease: 1 }, "An exit is worth more than coin to a frightened man. He breathes, steadies, and trades the patron's drop point for your promise."],
        ["Withdraw and just keep attending, harmless", "s", { rumor: 1 }, "Patience again. A week of mere worship later, his fear decides you were a test he passed, and his relief talks."]),
    ] },
  { p: "The lighthouse keeper rows ashore once a month for salt, tobacco, and exactly one hour of human conversation, currently available.", choices: [
    { label: "Be the conversation, no agenda", t: "s", out: { rumor: 1, ease: 1 }, note: "An hour of weather, wicks, and loneliness. In minute fifty he mentions the ship that runs dark past his light, monthly, like clockwork." },
    { label: "Ask what the light sees that the harbor cannot", t: "u", out: { rumor: 2 }, note: "The question he has waited years for. He draws the dark ship's route in spilled salt, complete with where it slows and why." } ],
    fail: [
      F("Your hour collides with the salt merchant's, and the keeper, time rationed, chooses salt over strangers without apology.",
        ["Carry his salt to the boat and earn the walk", "s", { rumor: 1 }, "Service buys minutes. Boat loaded, he gives you the short version standing in the shallows, and the short version has a ship in it."],
        ["Book his next month's hour in advance", "c", { rumor: 1 }, "Patience by appointment. The promise of guaranteed company melts him on the spot, and he pays the deposit in tonight's observation."]),
      F("The question lands like an accusation. Keepers are paid for discretion as much as light, and his face closes like a storm shutter.",
        ["Tell him a secret of yours first, real weight", "b", { rumor: 2 }, "Collateral honesty. Your secret for his: the trade leaves you both exposed and even, and his is the dark ship's name."],
        ["Talk lamps and lenses until he thaws", "s", { rumor: 1 }, "Craft talk is safe talk. Somewhere between wick trims he forgets the offense and mentions the light that answers his, from where no light should be."]),
    ] },
  { p: "Caulkers work under the careened hull at low tide, hammers talking in code up the planks, and the code today is agitated.", choices: [
    { label: "Haul oakum for them and listen to the hammers", t: "s", out: { rumor: 1 }, note: "Their rhythm spells trouble-words: short pay, strange cargo, sail soon. The hull above you belongs to a captain everyone calls honest." },
    { label: "Ask the master caulker what the hammers are saying", t: "u", out: { rumor: 1, finding: 1 }, note: "He grins black-toothed at being caught, then translates: the honest captain's hull has a false floor, freshly caulked, and they caulked it." } ],
    fail: [
      F("The tide turns while you are deep under the hull, and the careened ship groans on its blocks like a thing deciding to roll.",
        ["Get everyone out first, you last", "s", { rumor: 1, ease: 1 }, "The hull holds, barely. Caulkers remember who waved them out ahead, and what they remember next is everything that hull is hiding."],
        ["Brace the nearest block before running", "b", { rumor: 2 }, "Your shoulder buys six seconds and the block holds. The master caulker pays the debt in full: names, dates, and the false floor's latch."]),
      F("The master caulker spits and the hammers stop dead. Asking what hammers say is asking caulkers to inform, and the silence is your answer.",
        ["Pick up a hammer and tap an apology, badly", "u", { rumor: 1 }, "Your clumsy rhythm spells nonsense and breaks the tension. Laughter restarts the work, and the work restarts the talk."],
        ["Buy the crew's ale for the tide-wait", "s", { rumor: 1 }, "Ale is amnesty. They drink to your health and resume the hammer-talk slower, plainly, so even the ale-buyer can follow."]),
    ] },
  { p: "The pilot boat takes strangers' ships through the reef cut, and the pilot's apprentice keeps the waiting list, which is suddenly full of names that do not exist.", choices: [
    { label: "Befriend the apprentice over the list", t: "s", out: { rumor: 1 }, note: "He is proud of his ledger and starved for praise. Four entries this month paid double for night passage and gave names off gravestones." },
    { label: "Book passage under a false name yourself", t: "b", out: { rumor: 2 }, note: "It costs, but now you are inside the system. The pilot assumes you are one of THEM, and his small talk assumes you know what they carry." } ],
    fail: [
      F("The apprentice mistakes your interest for an inspection and goes rigid, reciting regulations like a prayer against you.",
        ["Laugh and show him you are nobody official", "s", { rumor: 1 }, "Relief makes him generous. He complains for ten minutes about the gravestone names, which is exactly the complaint you came for."],
        ["Play the inspector and demand the list", "b", { rumor: 2 }, "Terrifying, effective, unwise, done. You read the whole ledger while he sweats, and memorize the repeat customer with three different names."]),
      F("Your false name is one the pilot has already ferried. His eyes flick up from the list and the reef cut suddenly feels very far from shore.",
        ["Claim to be that man's brother, sent ahead", "u", { rumor: 1 }, "A dangerous improvisation that lands. The pilot relaxes into family small talk, and family small talk includes the cargo."],
        ["Drop the act and pay for honesty instead", "s", { rumor: 1 }, "Truth at double fare. The pilot respects a man who knows when a lie has sunk, and sells you the gravestone names' real pattern."]),
    ] },
  { p: "The chandler's debt board hangs behind the counter, chalk names and numbers, and three names were wiped clean this morning by the same wet thumb.", choices: [
    { label: "Buy supplies and ask about business, idle", t: "c", out: { rumor: 1 }, note: "Trade is trade. Between weighing nails he mentions a stranger who paid three men's debts in fresh coin and wanted no thanks, only their sailing dates." },
    { label: "Ask the three cleared men themselves", t: "u", out: { rumor: 1, finding: 1 }, note: "Two will not talk. The third, drunk on relief, shows you the note that came with his freedom, and the note gives instructions." } ],
    fail: [
      F("The chandler follows your eyes to the board and turns it to the wall. Debts are between men and their chalk, he says, and sells you your nails in silence.",
        ["Settle a small debt of your own loudly", "s", { rumor: 1 }, "You become board business, and board business may discuss the board. He turns it back and tuts about the wet thumb with you."],
        ["Come back at closing with rum for two", "s", { rumor: 1 }, "After hours the wall turns friendly. Over the second pour he admits the debt-payer scared him, and describes the scar that did it."]),
      F("The first cleared man you approach goes white, shoves past you, and by evening all three have made themselves hard to find.",
        ["Find the drunkest one's favorite stool and wait", "s", { rumor: 1 }, "Habits outlast fear. He comes to the stool because the stool is home, and home is where men finally talk."],
        ["Leave word you can protect what scared them", "b", { rumor: 2 }, "Bold bait. One bites by midnight, half believing you, and his half-belief spills the whole arrangement to make you earn it."]),
    ] },
  { p: "Tide-line scavengers comb the wrack at first light with rakes and sacks, and this morning they are working one stretch of sand in complete, unnatural silence.", choices: [
    { label: "Rake alongside them and match the silence", t: "s", out: { rumor: 1 }, note: "Silence is the membership fee. After an hour a sack opens just enough to show you why nobody speaks: the wrack is full of uniform buttons." },
    { label: "Ask the eldest scavenger what the sea sent", t: "u", out: { rumor: 1, finding: 1 }, note: "She studies you, then opens her palm: a brass button with a fleet crest, and the fleet it belongs to has not existed since the Fall." } ],
    fail: [
      F("Your rake turns up something that clinks, and every scavenger on the line freezes mid-stroke, watching what you do with it.",
        ["Hand it to the eldest, eyes down", "s", { rumor: 1 }, "Tribute paid in protocol. She pockets it, taps your rake twice in blessing, and the line's whisper-talk resumes around you, informative."],
        ["Pocket it and keep raking, steady", "b", { rumor: 1, finding: 1 }, "A gamble on nerve. Nobody challenges you, and what you pocketed is a signet ring with a drowned house's mark, worth more as a question than gold."]),
    ] },
];
const GATHER2 = [
  { p: "The spice row blinds the nose by the third stall, and the saffron seller is weighing out her whole stock for one cloaked buyer who never haggles.", choices: [
    { label: "Browse pepper nearby and watch the sale", t: "s", out: { rumor: 1 }, note: "Nobody buys a year of saffron for cooking. The cloak pays in coin so new it shines, and the seller bites every piece anyway." },
    { label: "Outbid the cloak for the last measure", t: "b", out: { rumor: 2 }, note: "The cloak turns, measures you, and quietly doubles. You let it win, but now you have seen the face, and the face is known on the docks under another name." } ],
    fail: [
      F("The pepper gets you. Your sneeze cracks the row's hush like a pistol shot and both buyer and seller stare at the spy with the running eyes.",
        ["Buy the pepper you were fake-browsing", "s", { rumor: 1 }, "A customer is a customer. The seller, mollified, complains about the saffron buyer's strange delivery address while wrapping your purchase."],
        ["Sneeze again, theatrically, the harmless fool", "u", { rumor: 1, ease: 1 }, "Comedy is camouflage. The cloak dismisses you completely, finishes the deal in your hearing, and names the ship that takes delivery."]),
      F("Your outbid offends the seller's arrangement. She names a price meant to humiliate, and the row's eyes are on your purse.",
        ["Pay it without blinking", "b", { rumor: 2 }, "Ruinous, magnificent. The cloak, rattled by money it cannot read, breaks pattern and leaves, and the seller, richer, sells you the whole story too."],
        ["Bow out praising her saffron's reputation", "s", { rumor: 1 }, "Grace in defeat. She softens once the cloak is gone and admits she is afraid of her own best customer, and says why."]),
    ] },
  { p: "The moneychanger's queue moves slow because he tests every coin twice, but today he keeps a separate purse under the counter for certain coins he tests zero times.", choices: [
    { label: "Change small coin and watch the purse", t: "c", out: { rumor: 1 }, note: "Three customers in an hour pass coin straight to the purse: same mint-mark, no inspection. The changer is not changing that money. He is collecting it." },
    { label: "Offer him one coin with that mint-mark", t: "b", out: { rumor: 2 }, note: "Where did you get this, he whispers, and the whisper assumes you are in the scheme. His instructions to you are detailed and damning." } ],
    fail: [
      F("He catches your eyes on the under-counter purse and his hand drifts to the bell that calls the market watch.",
        ["Loudly dispute your change, the difficult customer", "s", { rumor: 1 }, "Annoying beats suspicious. He refunds two coppers to be rid of you, and his flustered apprentice mishandles the purse in plain view."],
        ["Ask him to test a coin you KNOW is false", "u", { rumor: 1 }, "Professional pride overrides caution. He lectures you on the forgery's tells, and the tells match the purse coins exactly, which he realizes too late."]),
      F("Your marked coin is the wrong batch. His face says you have shown him a password from last month, expired and dangerous to hold.",
        ["Claim you found it and want it gone cheap", "s", { rumor: 1 }, "Plausible, profitable for him. He buys it under value and, relieved, warns you off the coins like it with a detail too specific to be invented."],
        ["Ask what the current batch looks like, brazen", "b", { rumor: 2 }, "Audacity reads as authority. He describes this month's mark before his caution catches up, and then bargains for your silence with more."]),
    ] },
  { p: "The map-seller's stall is paper weather: charts pegged and flapping, and today one chart hangs inside-out, which in this market is not an accident.", choices: [
    { label: "Buy a cheap chart and mention the backwards one", t: "s", out: { rumor: 1 }, note: "His eyebrow approves. The inside-out chart is a flag for a certain buyer, he allows, and the buyer collects routes nobody sails on purpose." },
    { label: "Ask the price of the backwards chart, deadpan", t: "u", out: { rumor: 1, finding: 1 }, note: "He quotes a price with a question mark in it. You pay, and the chart's margins hold pencil soundings for a passage marked DOES NOT EXIST in three inks." } ],
    fail: [
      F("A squall gust tears the pegged charts loose and the stall becomes a flock of escaping geography with you in the middle of it.",
        ["Chase down the backwards chart first", "u", { rumor: 1, finding: 1 }, "Priorities under pressure. You return it last, having read it twice, and the seller, none the wiser, tips you a smaller secret for the rescue."],
        ["Save the seller's master folio instead", "s", { rumor: 1 }, "The folio is his life and he knows what you chose. Gratitude opens it to you for one supervised hour, and one hour is plenty."]),
      F("Deadpan fails. The seller goes loud, declaring to the whole row that he sells no secrets, which is what guilty stalls shout.",
        ["Stand through the speech, then ask again, quieter", "s", { rumor: 1 }, "The shout was for the row, the whisper is for you. With his cover performed, he names the meeting place under cover of an apology."],
        ["Leave and watch who relaxes when you go", "c", { rumor: 1 }, "Exits are information. Two stalls down, a charm vendor exhales and signals the map-seller, and now you have the pair of them."]),
    ] },
  { p: "The pawn shelves hold the harbor's bad months in rows, and today there is a sextant on the shelf engraved with the name of a ship that has not made port in a year.", choices: [
    { label: "Ask the broker the sextant's story, casual", t: "s", out: { rumor: 1 }, note: "Pawned last week, he says, by a man with salt-ruined boots who took the worst price offered without a word. The ticket has a lodging house on it." },
    { label: "Buy it and leave your name for the redeemer", t: "u", out: { rumor: 1, finding: 1 }, note: "Bait set with sympathy. Two nights later a knock: the salt-booted man, who tells you where that ship truly is, because somebody finally asked kindly." } ],
    fail: [
      F("The broker smells profit in your interest and the sextant's price climbs while you watch, story and all suddenly premium goods.",
        ["Walk away and price-check loudly elsewhere", "s", { rumor: 1 }, "Market pressure works both ways. He calls you back at the honest price, and throws in the pawner's description to close the deal."],
        ["Pay the inflated price without complaint", "b", { rumor: 2 }, "Money talks and overpayment sings. He decides you must know something, fishes for it, and in fishing reveals everything HE knows."]),
      F("Your name on the ticket draws the wrong redeemer: a hard-faced stranger claiming the sextant for a brother who never existed.",
        ["Surrender it and follow at a distance", "u", { rumor: 1 }, "Let the bait swim. The hard face delivers it to a warehouse with new locks on old doors, and the doors get noted."],
        ["Demand proof of the brother, politely immovable", "s", { rumor: 1 }, "Bureaucracy as a weapon. The stranger's improvised details contradict twice, and the contradictions map his employer's lie for you."]),
    ] },
  { p: "The eel cart hisses all day, and the eel-man hears everything because nobody guards their mouth around a man elbow-deep in eels.", choices: [
    { label: "Eat eel slowly through the lunch rush", t: "s", out: { rumor: 1, ease: 1 }, note: "Hot food, hotter talk around it. Two clerks behind you split one secret between them, and you leave with both halves and a full stomach." },
    { label: "Ask the eel-man what surprised him this week", t: "u", out: { rumor: 2 }, note: "He counts on greasy fingers: a priest who paid in pearls, a widow who asked for live eels in a sack, and a customs man who wept into his portion." } ],
    fail: [
      F("The lunch rush crushes in and your slow eating loses you the stool, the eavesdrop, and very nearly the eel.",
        ["Stand and eat by the clerks anyway, shameless", "s", { rumor: 1 }, "Proximity wins. Standing room is closer than the stool ever was, and the clerks' secret has a third half they save for dessert."],
        ["Help the eel-man serve through the crush", "u", { rumor: 1, ease: 1 }, "Aprons hear best. Twenty orders later you know the regulars by their debts, and the eel-man slips you the customs man's story as wages."]),
      F("Surprised, he says, nothing surprises me, and the cart's hiss fills a silence that was supposed to contain gossip.",
        ["Tell HIM something surprising first", "b", { rumor: 2 }, "Priming the pump. Your morsel unlocks him mid-skewer, and what comes out involves the widow, the sack of eels, and a sunken door."],
        ["Order the strangest thing on the cart", "s", { rumor: 1 }, "Eel hearts, apparently. Respect for your stomach loosens his lips, and the priest with pearls gets a full retelling."]),
    ] },
  { p: "The charm vendor strings wards against drowning, fire, and lies, and today she will not sell the lie-wards to anyone, at any price, until further notice.", choices: [
    { label: "Ask gently why the lie-wards are off the table", t: "s", out: { rumor: 1 }, note: "Because they have all gone warm, she says, every one in the city, the same hour, three days ago. Somewhere a lie big enough to cook string is being told." },
    { label: "Buy a drowning-ward and trade her a true secret", t: "u", out: { rumor: 1, finding: 1 }, note: "Truth is her currency. Your secret buys the lie-ward under the counter, still faintly warm, and the warmest one points like a compass when she holds it." } ],
    fail: [
      F("Your gentle question joins a queue of them, and the vendor, hounded all day, snaps her shutters down on the whole row's curiosity.",
        ["Wait out the shutters with patience and tea", "s", { rumor: 1 }, "You leave tea on her sill and sit. The shutters crack at dusk for the only customer who waited quietly, and the explanation comes with the reopening."],
        ["Slip a question under the shutter, written", "c", { rumor: 1 }, "Paper is calmer than crowds. Her answer comes back under the same gap by morning, longer than your question deserved."]),
      F("Your secret does not balance the scale. She weighs it on her palm, literally, and hands it back: too light, try again.",
        ["Offer a heavier one, the kind that costs you", "b", { rumor: 2 }, "It hurts to say and she knows it. The scale tips, the lie-ward changes hands, and she adds the warm-ward map as change for your courage."],
        ["Buy her whole fire-ward stock instead", "s", { rumor: 1 }, "Commerce as apology. Flush with your coin, she relents halfway and tells you which districts the lie-wards warmed first."]),
    ] },
  { p: "Auction day at the block: estate lots from a captain lost with all hands, and lot thirteen is a locked sea-chest the auctioneer cannot stop touching.", choices: [
    { label: "Bid on lot twelve to get close to thirteen", t: "s", out: { rumor: 1 }, note: "You win a crate of moldy signal flags, worthless, except the flag on top is folded in a distress pattern that takes two people to fold." },
    { label: "Bid hard on the chest itself", t: "b", out: { rumor: 1, finding: 1 }, note: "It costs real coin and a staring contest with a stranger in mourning gray. Inside: no treasure, just a log, and the log ends mid-sentence in a different hand." } ],
    fail: [
      F("Lot twelve sparks a bidding feud with an old woman who wants those moldy flags with frightening intensity, and the price soars past sense.",
        ["Let her win, then ask her why, gently", "s", { rumor: 1 }, "She clutches the flags and tells you: her son folded that distress pattern, and her son was not listed among the lost, and the list lied."],
        ["Split the lot with her, half each", "u", { rumor: 1, ease: 1 }, "Compromise buys company. Sorting flags together she reads them like letters, and her readings are the rumor, complete."]),
      F("The mourning-gray stranger outbids you with a nod, pays in advance, and arranges delivery to an address that does not take deliveries.",
        ["Befriend the delivery porter beforehand", "s", { rumor: 1 }, "Porters can be hired twice. His route report includes the door that opened, the hands that took the chest, and the sigil on the ring."],
        ["Attend the delivery street, casually present", "u", { rumor: 1 }, "Loitering with purpose. The address swallows the chest, but the mourning gray exits later by a different door, unveiled, and you know the face."]),
    ] },
  { p: "The public debt board lists who owes whom, chalk on slate, and overnight someone has paid every debt in one column: every man who can hold a harpoon.", choices: [
    { label: "Copy the cleared names before they fade", t: "c", out: { rumor: 1 }, note: "Nineteen names, all harpooners, all freed the same night. Somebody is provisioning for something with teeth, and they started with the spears." },
    { label: "Find the cheapest-cleared harpooner and buy ale", t: "u", out: { rumor: 1, finding: 1 }, note: "He drinks fast and grateful. The debt-buyer wants them mustered at the new moon, gear provided, mouths shut, and the meeting mark is inked on his wrist." } ],
    fail: [
      F("The board-keeper catches you copying and bars the slate with his body: the board is for shame, not for lists, he says.",
        ["Confess a debt of your own to the board", "s", { rumor: 1 }, "Skin in the game. Once your name is chalked beside theirs the keeper relents, and chalking it, he gossips about the column that vanished."],
        ["Recite the names from memory, already done", "u", { rumor: 1 }, "Too late to bar a memory. He deflates, then bargains: forget two of the names, and he will tell you what the other seventeen have in common."]),
      F("Your harpooner drinks your ale, thanks you warmly, and lies to your face with the polish of a man freshly paid for exactly that.",
        ["Call the lie pleasantly and keep pouring", "b", { rumor: 2 }, "He grins at being caught, respects the catch, and the third ale washes out the truth the first two varnished."],
        ["Accept the lie and befriend his quiet brother", "s", { rumor: 1 }, "Families leak sideways. The brother, unpaid and worried, asks YOU what the new moon means, and his worry confirms the date."]),
    ] },
  { p: "The beggars hold the market's best corner by ancient treaty, and their king, a legless man on a wheeled board, taxes information instead of coin.", choices: [
    { label: "Pay the tax: tell him something true and useful", t: "s", out: { rumor: 1 }, note: "He files your truth behind his eyes and pays change: the cloaked saffron buyer, the warm lie-wards, and the new-moon harpooners are the same story." },
    { label: "Ask for credit against tomorrow's truth", t: "u", out: { rumor: 2 }, note: "The king extends credit to interesting debtors. His advance is generous and detailed, and now you owe the beggars' crown, which is its own adventure." } ],
    fail: [
      F("Your offered truth is one the king already taxed twice this week, and his court of beggars jeers your poverty of news.",
        ["Offer labor: push his board for a market lap", "s", { rumor: 1, ease: 1 }, "The king tours, you push, the market bows. By lap's end he has narrated the row's secrets like a guide, payment for the ride."],
        ["Admit poverty and ask to earn", "u", { rumor: 1 }, "Honesty amuses the crown. He sets you a small errand, watching one door for one hour, and the door's traffic is the lesson and the wage."]),
      F("Credit denied. The king's memory of debtors is long and his board rolls past you with royal contempt.",
        ["Buy the whole court bread, no strings", "s", { rumor: 1 }, "The court eats, the king watches, protocol bends. He taxes the baker's gossip on your behalf as a one-time mercy."],
        ["Petition again tomorrow, properly humble", "c", { rumor: 1 }, "Persistence is its own tribute. On the third day the king relents, and pays out with interest for the entertainment of watching you grovel."]),
    ] },
  { p: "Butcher row hangs its weight in plain sight, but the third stall keeps a curtained back rail, and today the curtain swings with fresh delivery.", choices: [
    { label: "Order something difficult and talk shop", t: "s", out: { rumor: 1 }, note: "Tripe, cleaned your way, takes time, and time talks. The back rail is for one customer who buys whole carcasses and sends bones back untouched." },
    { label: "Ask for whatever is behind the curtain", t: "b", out: { rumor: 2 }, note: "The butcher studies you, then names a price for silence with the meat. Behind the curtain hangs salt-cured deep-fish no net in this harbor can reach." } ],
    fail: [
      F("Your shop-talk hits a guild nerve and the butcher decides you are inspecting his licenses, which were apparently flexible.",
        ["Reassure him by buying big, no receipt", "s", { rumor: 1 }, "Cash is its own license. Relieved, he overshares about the curtain customer to prove the REAL irregularity is not his."],
        ["Lean in: you are not guild, you are curious", "u", { rumor: 1 }, "Honest curiosity disarms. He shows you the deep-fish scales under the counter, and the scales are wrong in a way worth knowing."]),
      F("The curtain question stops the row cold. Three stalls of cleavers pause mid-swing, and the butcher's smile goes professional.",
        ["Apologize and buy sausages like a tourist", "s", { rumor: 1 }, "Retreat into harmlessness. The row resumes, and the apprentice who wraps your sausage whispers the curtain's secret into the paper."],
        ["Hold his eyes and put coin on the block", "b", { rumor: 2 }, "The oldest password. The curtain opens for a paying customer, and the deep-fish hangs there, impossible, with a delivery tag still on it."]),
    ] },
  { p: "The glassblower's furnace roars all day, and her gallery shelf holds one new piece: a glass bottle blown AROUND a rolled paper, sealed forever unless broken.", choices: [
    { label: "Admire it and ask the commission's story", t: "s", out: { rumor: 1 }, note: "Commissioned by a woman who watched the paper sealed in, paid triple, and said the words must exist but never be read. The glassblower memorized the watcher, not the words." },
    { label: "Offer to buy it, paper and all", t: "u", out: { rumor: 1, finding: 1 }, note: "Not for sale, she says, then sells it, because triple was triple but you offered the furnace story told back to her own customer. Held to the light, four words bleed through." } ],
    fail: [
      F("Your admiring hands drift too close to the shelf and the glassblower's tongs clack a warning that the whole gallery hears.",
        ["Commission a piece of your own, real coin", "s", { rumor: 1 }, "Customers may ask anything. While your bauble cools she retells the bottle commission, complete with the watcher's nervous habit."],
        ["Ask her to teach you one gather at the furnace", "u", { rumor: 1, ease: 1 }, "Fire instructs and bonds. Sweating beside her you earn the apprentice version of the story, which includes what the apprentice read."]),
      F("Buy it, she repeats, like the words are in a foreign tongue, and her furnace-arm muscles answer before her mouth does: no.",
        ["Respect the no and ask only about the glass", "s", { rumor: 1 }, "Craft questions heal the offense. She explains the sealing technique, and the technique implies exactly how the paper could be read unbroken."],
        ["Bid for one look through it at the sun", "c", { rumor: 1 }, "Looking is not owning. She permits one minute at the window, and one minute is three words and a date, which is most of a secret."]),
    ] },
  { p: "A foreign trader has set up between two stalls without a permit, selling goods nobody recognizes, priced in a currency nobody has, accepting barter with peculiar enthusiasm.", choices: [
    { label: "Barter something small and watch what excites him", t: "s", out: { rumor: 1 }, note: "He trades a humming shell for your spare buckle and overpays wildly. What excites him is anything iron, and his crates leave nightly for the breakwater." },
    { label: "Ask where his harbor is, point blank", t: "b", out: { rumor: 2 }, note: "He smiles with too many teeth and names a depth, not a direction. The market noise covers it, but you heard, and you will not unhear it." } ],
    fail: [
      F("The permit-warden arrives mid-barter and the trader folds his stall with impossible speed, leaving you holding the humming shell and the blame.",
        ["Take the warden's lecture and keep the shell", "s", { rumor: 1, finding: 1 }, "A scolding is cheap tuition. The shell hums louder near the breakwater, you discover, and louder still at low tide."],
        ["Point the warden after the trader, then follow both", "u", { rumor: 1 }, "Let officialdom flush the bird. The chase ends at a boathouse the warden suddenly will not enter, and his refusal marks it better than a flag."]),
      F("Point blank lands flat. The trader's smile dies, his goods go under cloth, and the space between two stalls becomes very empty very fast.",
        ["Leave your iron buckle on his vacated crate", "c", { rumor: 1 }, "A gift speaks his language. By morning the buckle is gone and a humming shell sits in its place, wrapped in kelp tied with intent."],
        ["Ask the flanking stalls what they overheard", "s", { rumor: 1 }, "Neighbors hear everything. Both stalls trade his stranger habits for your patronage, and the habits include the breakwater and the tide he favors."]),
    ] },
  { p: "The scribe stall does letters for the unlettered, and the scribe's blotting sheet, holding ghost-impressions of a hundred private words, hangs drying in plain view.", choices: [
    { label: "Hire a letter and read the blotter sidelong", t: "c", out: { rumor: 1 }, note: "Your dull letter buys ten minutes of squinting. The blotter's loudest ghost is a ransom note's draft, with the sum crossed out twice, rising." },
    { label: "Offer to buy the used blotting sheet outright", t: "u", out: { rumor: 1, finding: 1 }, note: "The scribe names a price that admits he knows exactly what it holds. Mirrored at home, it surrenders the ransom draft, a love letter, and a list of doors." } ],
    fail: [
      F("Your sidelong reading is less sidelong than you hoped, and the scribe rotates the blotter face-down with a clerk's quiet violence.",
        ["Apologize by dictating a genuinely long letter", "s", { rumor: 1 }, "Wages soothe. By page three he is gossiping over his own pen, and the ransom customer's nervous descriptions pour out between lines."],
        ["Confess you read one ghost and ask its ending", "u", { rumor: 1 }, "Honesty intrigues him. Storytellers need audiences, even scribes, and he trades the ending for your oath of distance."]),
      F("The blotter, he announces, is going in the fire, and your offer just convinced him it should have burned a week ago.",
        ["Bid for one hour with it before it burns", "b", { rumor: 2 }, "Coin buys the condemned a stay. One mirrored hour yields the ransom draft whole, and the door list, and the fire gets it on schedule."],
        ["Let it burn and befriend his memory instead", "s", { rumor: 1 }, "Scribes forget nothing. Over evening wine his memory recites what the fire was supposed to erase, lightly edited for conscience."]),
    ] },
  { p: "Festival day floods the market with masks and noise, and through the crush one unmasked man moves in a straight line, against the current, checking a paper at every corner.", choices: [
    { label: "Drift behind him on the crowd's current", t: "s", out: { rumor: 1 }, note: "His straight line ends at a shuttered stall where he chalk-marks the post and leaves by a different straight line. The mark matches one you have seen on the docks." },
    { label: "Bump him and palm a look at the paper", t: "b", out: { rumor: 2 }, note: "Festival jostling forgives everything. The paper is a list of stalls, half crossed out, and the uncrossed half includes the charm vendor and the glassblower." } ],
    fail: [
      F("The crowd's current betrays you, sweeping you into a dance circle while your straight-line man walks out of the world.",
        ["Dance the round and quiz your partners", "s", { rumor: 1, ease: 1 }, "Festivals gossip in rhythm. Your third partner saw the unmasked man yesterday too, same line, same paper, and names the corner he favors."],
        ["Climb a stall frame for one sweeping look", "u", { rumor: 1 }, "Height beats current. From the frame you catch his hat two rows over, mark his final door, and descend into a vendor's grudging respect."]),
      F("Your bump is read as a cutpurse's touch, and the unmasked man's hand closes on your wrist with professional speed.",
        ["Apologize with festival grace, blame the crush", "s", { rumor: 1 }, "He releases, the paper vanishes, but his accent, his grip, and the chalk on his thumb have all introduced themselves."],
        ["Compliment the list before he hides it", "b", { rumor: 2 }, "Audacity again. He laughs once, sharp, decides you are a colleague from another crew, and the shop talk that follows is gold."]),
    ] },
  { p: "The water-seller's queue is the market's slowest and most honest place, and today it has gone silent around one customer everyone pretends not to see.", choices: [
    { label: "Queue behind the unseen customer", t: "s", out: { rumor: 1 }, note: "Up close the pretending makes sense: the customer wears Faithless raid-braids, in daylight, in the market, calmly buying water like a citizen." },
    { label: "Greet the customer like an old shipmate", t: "b", out: { rumor: 2 }, note: "The queue inhales. The raider studies you, decides the joke is good, and plays along, and shipmates talk, even pretend ones, about why a raider shops in town." } ],
    fail: [
      F("The queue reads your approach as trouble and dissolves around you both, leaving you alone with the raider and the water-seller's frozen ladle.",
        ["Buy the raider's water yourself, courteous", "s", { rumor: 1 }, "Hospitality confuses everyone, the raider most. The braids nod once, and a nod from braids in a market is a story with legs."],
        ["Stand your ground and queue properly", "c", { rumor: 1 }, "Normalcy is a statement. The raider respects the only spine in the square and mutters one sentence in passing that explains the visit."]),
      F("Your shipmate greeting lands on a raider with no humor today, and a hand drops to a bone-handled knife with terrible casualness.",
        ["Name a Faithless captain as your mutual friend", "u", { rumor: 1 }, "A gamble on harbor gossip. The name lands, the hand lifts, and respect for your nerve buys a clipped, useful sentence about the new moon."],
        ["Step back with open palms and let it go", "s", { ease: 1 }, "Discretion completes its survival arc. The queue refills, exhales, and rewards your sense with everything they collectively know about the visitor."]),
    ] },
  { p: "The night market wakes when the day market sleeps: same stalls, different goods, and the lamp-oil seller now sells oil that burns green and is asked for by name.", choices: [
    { label: "Buy ordinary oil and ask about the green, idle", t: "s", out: { rumor: 1 }, note: "For signaling, she says before catching herself, then for festivals, too late. The green-oil buyers all carry the same canvas satchel." },
    { label: "Ask for the green oil by its name", t: "u", out: { rumor: 1, finding: 1 }, note: "You guess the name from a dockside whisper and guess right. She sells without blinking, and the bottle's wax seal carries a thumbprint sigil worth more than the oil." } ],
    fail: [
      F("Idle is hard to fake at midnight, and the oil-seller's lamp tilts to light your face for a long, memorizing moment.",
        ["Let her memorize you, smiling, nothing to hide", "s", { rumor: 1 }, "Transparency disarms the night trade. Filed as harmless, you hear the green-oil order pattern discussed over your head all evening."],
        ["Buy green oil for cash at tourist prices", "b", { rumor: 2 }, "Overpaying buys belonging. She assumes wealth equals involvement and gives delivery instructions you were never supposed to lack."]),
      F("The name you guessed is last month's name, and her hand slides the green bottles backward off the counter, one by one, deliberate.",
        ["Ask what this month's name is, brazen", "b", { rumor: 2 }, "The sheer nerve of it. She tells you, half in disbelief, and sells the bottle to be rid of the conversation, seal and sigil included."],
        ["Switch to small talk about lamp wicks", "s", { rumor: 1 }, "Craft talk launders the blunder. Twenty minutes of wick lore later she has forgiven and forgotten, and mentions the satchel-men's pickup night unprompted."]),
    ] },
];
const TAVERN2 = [
  { p: "The arm-wrestling table has a standing champion, an oyster-shucker with forearms like anchor rope, and a silver challenge cup that nobody has drunk from in a year.", choices: [
    { label: "Challenge her and lose with style", t: "s", out: { ease: 1, rumor: 1 }, note: "Your hand hits the wood in four seconds flat and the room loves you for trying. Losers drink free at her table, and her table talks." },
    { label: "Bet on yourself, loudly, against the odds", t: "b", out: { ease: 2, rumor: 1 }, note: "You last eleven glorious seconds, lose, and win the room. The champion buys YOUR ale out of respect, and respect comes with stories." } ],
    fail: [
      F("Four seconds was optimistic. Your elbow skids on spilled ale and you hit the floor before your hand hits the wood, to a roar of delight.",
        ["Take the bow from the floor, again", "s", { ease: 2 }, "Falling well is a skill. The room toasts the fall, the champion hauls you up herself, and being the night's best joke is its own medicine."],
        ["Demand a rematch on a dry table", "u", { ease: 1, rumor: 1 }, "The rematch lasts six seconds and earns six friends. Persistence is the harbor's love language, and the table adopts you."]),
      F("Your loud bet draws the house bookmaker, who quotes odds so insulting the room laughs before you even sit down.",
        ["Bet on the champion instead, theatrically", "s", { ease: 1, rumor: 1 }, "Switching sides mid-swagger is good comedy. You win coppers on her four-second demolition of the next fool, and she splits the joke with you."],
        ["Double down on yourself, all in", "b", { ease: 2 }, "Magnificent, doomed, unforgettable. The loss costs your purse and buys your legend, and legends drink on the house tonight."]),
    ] },
  { p: "Storm shutters slam at sundown and the keep bars the door: lock-in. Nobody leaves till the blow passes, and a locked room full of sailors ferments fast.", choices: [
    { label: "Settle in with the card circle by the fire", t: "s", out: { ease: 1, rumor: 1 }, note: "Hours of small stakes and big talk. By the storm's eye you know who is shipping out scared and who is staying greedy, and why." },
    { label: "Organize the room: songs, rounds, order", t: "u", out: { ease: 2, rumor: 1 }, note: "Somebody has to captain a lock-in. You do it well, the night turns festival, and the grateful keep feeds you the cellar gossip with the good rum." } ],
    fail: [
      F("The card circle's stakes climb with the wind, and you are suddenly in deeper than your purse to players who count cards by lamplight.",
        ["Fold honest and keep the seat to watch", "s", { ease: 1, rumor: 1 }, "Out of the game, into the audience. Watching sharps fleece sailors teaches you the sharps' tells AND the sailors' secrets."],
        ["Wager a story instead of coin", "b", { ease: 2, rumor: 1 }, "The table accepts narrative currency. Your tale wins the pot, their tales pay it, and the pot of tales is worth more than the coin pot was."]),
      F("Your organizing meets a drunk mutiny: half the room wants gloom, not glee, and a thrown mug votes against your captaincy.",
        ["Concede the room and tend the gloomy half", "s", { ease: 1, rumor: 1 }, "You sit with the sad sailors instead. Gloom confides what glee performs, and the confessions are worth the demotion."],
        ["Win the mug-thrower over personally", "u", { ease: 2 }, "One stubborn drunk, one patient hour. By the storm's end he is leading the chorus, and his apology is the night's best story."]),
    ] },
  { p: "The fiddler in the corner has played the same lament three times tonight, and the third time through, half the back table was crying into their grog.", choices: [
    { label: "Buy the fiddler a drink and ask the song's name", t: "s", out: { ease: 1, rumor: 1 }, note: "It has no name, just an owner: the back table's drowned brother wrote it. The fiddler plays it on the anniversary, and the anniversary explains the harbor's mood all week." },
    { label: "Request the counter-song, the one that answers it", t: "u", out: { ease: 2, rumor: 1 }, note: "Every lament has an answer-tune. The fiddler's eyebrows approve, the answer lifts the room like a tide, and the back table tells you everything out of sheer relief." } ],
    fail: [
      F("Your drink arrives as the fiddler begins the lament a fourth time, and interrupting it now would be a small act of war.",
        ["Wait it out, hat over your heart", "s", { ease: 1 }, "Respect observed is respect returned. After the last note the fiddler joins YOU, and the song's story comes with his thanks."],
        ["Hum a gentle harmony from your seat", "u", { ease: 1, rumor: 1 }, "A risk that lands. Your line threads under his, the room breathes, and afterward the back table waves you over as one of theirs."]),
      F("Nobody alive knows the answer-tune, the fiddler says, it drowned with the man who wrote it, and the back table's heads all turn to hear you fail.",
        ["Ask the back table to teach the fragments they recall", "s", { ease: 1, rumor: 1 }, "Grief loves a project. Between five memories the answer-tune mostly reassembles, and assembling it, they reassemble the whole story for you."],
        ["Compose a new answer on the spot, humbly offered", "b", { ease: 2, rumor: 1 }, "It is not the old tune. It is enough. The fiddler learns it on the second pass, the table weeps the good way, and you have a song with your name on it in this harbor forever."]),
    ] },
  { p: "A card shark works the middle tables, kind-faced and lethal, sending marks home lighter every night, and tonight her eyes have picked you for dessert.", choices: [
    { label: "Play, lose small, and study her hands", t: "c", out: { rumor: 1, ease: 1 }, note: "Tuition, paid in coppers. You spot the crimp, the false shuffle, and more useful, the signal she trades with the doorman about who is worth fleecing." },
    { label: "Beat her at her own game, cheat better", t: "b", out: { rumor: 2 }, note: "It costs sweat and sleight, but her face when your impossible flush lands is a portrait. Professionals respect theft done well: she buys the round and trades trade secrets." } ],
    fail: [
      F("She reads your study like a large-print book and switches to playing honestly, which she is somehow even better at.",
        ["Compliment the straight game and keep losing", "s", { ease: 1, rumor: 1 }, "Flattery plus revenue equals friendship. An hour of honest losses later she gossips like a colleague, and her gossip is professionally sourced."],
        ["Ask her to teach the crimp for a fee", "u", { rumor: 1, ease: 1 }, "Everything is for sale. The lesson is real, your fingers ache, and the doorman-signal comes free as a graduation gift."]),
      F("Your improvised cheat fumbles, a card kisses the floor face-up, and the kind face across the table goes very, very still.",
        ["Surrender the pot and confess the homage", "s", { ease: 1 }, "Imitation, sincerely flattering. She keeps the pot, forgives the crime, and her lecture on doing it PROPERLY is worth the loss."],
        ["Claim the floor card was hers, brazen it out", "b", { rumor: 1, ease: 1 }, "Accusing the shark is insane and therefore unexpected. The table erupts, the house calls it a wash, and she finds you after, laughing, to ask who trained you."]),
    ] },
  { p: "The retired captain's corner chair is harbor furniture: he has not bought a drink in nine years and has not stopped talking in twenty, but tonight he is silent.", choices: [
    { label: "Sit nearby and wait with him in the quiet", t: "c", out: { ease: 1, rumor: 1 }, note: "Twenty minutes of shared nothing. Then, quietly, to you because you did not ask: today is the day his ship went down, and this year somebody sent him a piece of it." },
    { label: "Buy his drink and break the silence gently", t: "s", out: { ease: 1, rumor: 1 }, note: "He toasts the floor instead of the room. The piece they sent was the wheel's center pin, he says, and it was sawed off, not salvaged, and saws mean the wreck has visitors." } ],
    fail: [
      F("Your quiet company reads as ambush to a man who has been pumped for stories by every stranger in the harbor, and he calls for his coat.",
        ["Stand and help him into the coat, no words", "s", { ease: 1 }, "Service without questions. At the door he pauses, and the doorway gets the sentence the corner never would have."],
        ["Name his ship, just the name, and sit back", "u", { rumor: 1, ease: 1 }, "The name is a key. He sits back down slowly, asks where you heard it, and the trade of sources becomes the whole night."]),
      F("The drink was the wrong vintage: his lost first mate's favorite, and the smell of it cracks something nine years of talking had plastered over.",
        ["Drink it yourself in the mate's honor", "s", { ease: 1, rumor: 1 }, "The toast lands true. He talks about the mate for an hour, and inside the eulogy is the sawed pin, the wreck, and a bearing."],
        ["Apologize and order what HE actually drinks", "c", { ease: 1 }, "Care in the correction. The right drink in the right glass steadies him, and steady, he tells the pin story like a report."]),
    ] },
  { p: "The kitchen door swings two hundred times a night, and the cook's helper who swings it has heard every word said at every table, filed under steam and onions.", choices: [
    { label: "Eat at the kitchen-side table and tip the helper", t: "s", out: { rumor: 1, ease: 1 }, note: "Steam-side seating, best in the house. Between courses the helper trades table summaries like a town crier with discretion issues." },
    { label: "Offer to wash up in trade for the night's gossip", t: "u", out: { rumor: 2 }, note: "Elbows in suds, ears in heaven. The kitchen talks over your head all shift, and by the last pot you hold the room's whole evening, cross-referenced." } ],
    fail: [
      F("The cook catches the helper mid-gossip and the kitchen door swings shut on your information supply with a bang.",
        ["Send the cook your compliments and a coin", "s", { rumor: 1, ease: 1 }, "Flattery through proper channels. The cook, mollified, gossips PERSONALLY, and the cook's grade of gossip is aged and superior."],
        ["Order the most demanding dish on the slate", "u", { rumor: 1 }, "Complexity reopens the door. The dish needs six swings to serve, and the helper smuggles a sentence through with each one."]),
      F("Your washing is a disaster of broken crockery, and the cook tallies the damage with a wooden spoon and a tone.",
        ["Pay the breakage and finish the shift anyway", "s", { ease: 1, rumor: 1 }, "Stubborn restitution. The kitchen forgives by the last rack, and the closing-time talk is the unguarded kind, with names."],
        ["Trade up: offer to chop instead, show knife skill", "b", { ease: 1, rumor: 2 }, "Your blade work earns a stunned silence then a promotion. Cooks talk to cooks, and you are briefly one, with full kitchen-clearance gossip."]),
    ] },
  { p: "Harpoon darts: the tavern's back wall wears a painted whale, and the house game is three throws for the eye, with the board's history of wagers chalked beside it.", choices: [
    { label: "Throw for fun and read the wager wall", t: "s", out: { ease: 1, rumor: 1 }, note: "Two of your three stick, respectable. The chalk wall tells better stories: one name has wagered his BOAT three times this month and won it back twice." },
    { label: "Challenge the wall's best name to a match", t: "b", out: { ease: 2, rumor: 1 }, note: "He emerges from the snug, half legend, half drunk. Win or lose, the match draws the room, and the room's commentary on him is a dossier." } ],
    fail: [
      F("Your third throw misses the whale entirely and quivers in the doorframe a hand-span from the entering keep's head.",
        ["Buy the keep's forgiveness and the room's laughter", "s", { ease: 2 }, "Coin and comedy. The keep frames the throw-hole as a house feature by closing time, and you are part of the wall's history now."],
        ["Throw a fourth, eyes closed, on a dare", "u", { ease: 1, rumor: 1 }, "It hits the eye. Pure indefensible luck, and the room's roar shakes dust off the rafters. Legends start exactly this stupid, and legends hear everything."]),
      F("The best name declines from the snug with a wave, and declining, knocks his drink onto the wager wall, smearing a month of chalk history.",
        ["Help him re-chalk it from collective memory", "s", { ease: 1, rumor: 1 }, "Restoration by committee. Re-arguing every wager retells every story, and the boat-wagering name gets his whole saga aired."],
        ["Claim his forfeit makes you wall champion", "b", { ease: 1, rumor: 1 }, "Outrageous, technically arguable. He surges from the snug to defend the title, and the match he refused now happens with stakes and an audience."]),
    ] },
  { p: "Last call rings and the room thins to the serious cases, and a stranger slides onto the next stool with the unmistakable gravity of a confession looking for a stranger.", choices: [
    { label: "Be the stranger: listen, no questions", t: "c", out: { ease: 1, rumor: 1 }, note: "It pours out sideways and shapeless, but the shape inside it is a job he did at the breakwater, at night, for green-oil money, and he is afraid of the next one." },
    { label: "Trade confession for confession", t: "u", out: { ease: 2, rumor: 1 }, note: "You ante a real one of yours. The honesty doubles his, and the detailed version includes who pays, where they meet, and why he cannot stop." } ],
    fail: [
      F("Mid-confession he sobers a degree, sees your face properly for the first time, and the fear of having said too much closes him like a hatch.",
        ["Pretend you were too drunk to follow", "s", { ease: 1 }, "Mercy through performance. Relieved, he relaxes, and relaxing, retells the safe half, which still has the breakwater in it."],
        ["Promise him it goes in your grave, hand on heart", "u", { ease: 1, rumor: 1 }, "The oath lands because you mean it. He finishes the confession properly, and the proper ending names the green-oil paymaster."]),
      F("Your traded confession is too good. He decides you are deeper in the harbor's shadows than he is, and now HE wants answers from YOU.",
        ["Give him the real shape of you, scars and all", "b", { ease: 2, rumor: 1 }, "Total honesty as a trust-fall. He catches it, returns it doubled, and last call ends with two unburdened fools and one shared dangerous secret."],
        ["Deflect to his trouble: yours can wait", "s", { ease: 1, rumor: 1 }, "Graceful pivot. His need to talk outweighs his curiosity, and the conversation returns to the breakwater with momentum."]),
    ] },
  { p: "Shanty war: two crews, two tables, alternating verses, escalating volume, and the house rule that the losing table pays the winning table's slate.", choices: [
    { label: "Join the smaller crew's table as a ringer", t: "s", out: { ease: 1, rumor: 1 }, note: "Your verse holds the line. Win or lose, you are crew for the night, and crews talk to their own about cargo, captains, and the strange orders for the new moon." },
    { label: "Sing the bridge verse both crews forgot", t: "b", out: { ease: 2, rumor: 1 }, note: "Both tables stop dead, then roar. The forgotten bridge makes you the night's referee, and referees drink free from both slates and hear both crews' versions of everything." } ],
    fail: [
      F("Your ringer verse cracks on the high line and the rival table's mockery lands on your adopted crew like boarding fire.",
        ["Take the mockery and pour the next round", "s", { ease: 1, rumor: 1 }, "Owning the crack buys belonging faster than hitting the note would have. Your crew defends you loudly, and defended men hear everything."],
        ["Answer mockery with the filthiest verse you know", "u", { ease: 2 }, "Vulgarity is a universal language. Both tables collapse, the war dissolves into one big choir, and the merged slate is everyone's problem."]),
      F("The bridge verse you sang belongs to a third crew, a drowned one, and both tables go silent for a very different reason.",
        ["Raise a glass to the drowned crew, name them", "s", { ease: 1, rumor: 1 }, "The toast turns blunder into memorial. Both crews drink, then talk about the lost crew's last run, and the last run had a destination worth knowing."],
        ["Ask, openly, to be taught their proper verses", "c", { ease: 1, rumor: 1 }, "Humility heals. The lesson runs past midnight, and the verses come annotated with the history that wrote them."]),
    ] },
  { p: "The keep slides your drink across with a look that has weight in it, and nods at the cellar door, which is ajar, which it never is.", choices: [
    { label: "Take the hint and the cellar stairs", t: "u", out: { rumor: 1, ease: 1 }, note: "Below, by candle: the keep's brother, hiding, hurt, and talkative once he knows the keep sent you. What he is hiding FROM is the rumor of the season." },
    { label: "Ask the keep, quietly, what the door wants", t: "s", out: { rumor: 1 }, note: "Not here, the keep murmurs, but the murmur sketches it: a man below, a debt above, and a name that should not be said over a bar." } ],
    fail: [
      F("The stairs creak your arrival like an alarm, and the candle below snuffs to black breathing silence.",
        ["Announce the keep sent you, softly, and wait", "s", { rumor: 1, ease: 1 }, "The password is the keep's name. The candle relights on a wary face, and wary faces, once convinced, overcorrect into confession."],
        ["Sit on the stairs and hum the harbor lullaby", "u", { rumor: 1 }, "Nobody hostile hums. The dark relaxes by degrees, and a voice from it trades question for question until the whole shape is out."]),
      F("Your quiet question collides with a customer's order, and the keep's face shutters back to business while the cellar door clicks closed.",
        ["Stay till close and help stack the chairs", "s", { rumor: 1 }, "Patience and service. With the room empty the keep talks freely, and freely includes the brother, the debt, and what would settle it."],
        ["Order the cellar's own dark ale, pointedly", "c", { rumor: 1 }, "A coded order. The keep draws it slow, eyes on you, and the foam on top arrives with a folded note stuck beneath the coaster."]),
    ] },
  { p: "The ghost round: an old custom where the room buys one drink for the drowned and leaves it on the end of the bar, and tonight, impossibly, the glass is half empty.", choices: [
    { label: "Watch the glass instead of the room", t: "c", out: { rumor: 1, ease: 1 }, note: "Patience pays at midnight: the pot-boy, hollow-cheeked, drinks the ghost's portion in two practiced sips. He is feeding someone hidden, and you know hungry when you see it." },
    { label: "Buy the ghost a second round, loudly", t: "s", out: { ease: 1, rumor: 1 }, note: "The room approves the piety. The keep, refilling, mutters that the ghost has been thirstier all month, ever since the wreck-bell rang for nobody." } ],
    fail: [
      F("Your watching is noticed by the room, and watching the ghost glass is terrible manners bordering on blasphemy.",
        ["Apologize by leading the ghost's toast yourself", "s", { ease: 1, rumor: 1 }, "Piety restored, doubled. Your toast moves the old-timers, and moved old-timers retell the custom's origin, which includes a name and a wreck."],
        ["Confess you saw the glass move, ask who else has", "u", { rumor: 1 }, "Half the room has, it turns out, and the confessions compare notes into a pattern: the level drops only on nights the pot-boy works."]),
      F("Your loud second round offends a widow at the rail, for whom the ghost glass is not a custom but a place setting.",
        ["Sit with her and ask about the setting's owner", "s", { ease: 1, rumor: 1 }, "Grief shared is grief halved. Her husband's story comes out gently, and inside it, the wreck-bell, the empty sea, and the salvager who lied."],
        ["Dedicate the round to her drowned, by name if she will", "u", { ease: 2 }, "She gives the name. The room repeats it standing, and something in her unclenches for the first time in a year, and yours does too."]),
    ] },
  { p: "Mystery stew night: the pot takes whatever the harbor brought, the keep stirs and refuses all questions, and tonight's smell has the room placing bets on the meat.", choices: [
    { label: "Order a bowl and bet on the eel", t: "s", out: { ease: 1, rumor: 1 }, note: "It is not eel. The argument over what it IS unites four tables, and arguments over stew turn into arguments over fishing grounds, which turn into a map of who fishes where they should not." },
    { label: "Sweet-talk the cook for one ingredient", t: "u", out: { ease: 1, rumor: 1 }, note: "One word, she allows: deep. The deep-fish again, sold cheap to taverns by someone who has too much of what no net should catch." } ],
    fail: [
      F("Your bowl finds a tooth. Not a fish tooth. The table goes quiet around your spoon and the keep is suddenly very busy at the far tap.",
        ["Pocket the tooth and finish the bowl, iron-stomached", "b", { ease: 1, rumor: 2 }, "Nerve impresses the regulars. The tooth, shown later to a wreck-diver, gets identified in a whisper, and the whisper redraws what hunts the near waters."],
        ["Show the keep the tooth, privately, no fuss", "s", { rumor: 1 }, "Discretion earns disclosure. The keep names the supplier through gritted teeth, on the condition the stew's reputation survives the night."]),
      F("The cook's sweet tooth is sour tonight, and your sweet-talk gets you promoted to potato-peeler against your will.",
        ["Peel the mountain and earn the kitchen's trust", "s", { ease: 1, rumor: 1 }, "An hour of skins. The kitchen forgets you are a stranger, and the supplier with the deep-fish gets discussed over your bowed head in full."],
        ["Peel badly enough to get demoted to dishwasher", "u", { rumor: 1, ease: 1 }, "Strategic incompetence. The sink is next to the delivery door, and the delivery door's chalkboard lists the supplier's schedule in plain chalk."]),
    ] },
  { p: "A name-day feast takes the long table: a shipwright turns fifty, his apprentices have bought the room a round, and goodwill is running dangerously deep.", choices: [
    { label: "Toast the shipwright with specifics", t: "s", out: { ease: 1, rumor: 1 }, note: "You name two boats of his still floating and the room cheers. Flattered craftsmen talk shop, and his shop lately includes a rush order with a false floor he is ashamed of." },
    { label: "Gift him something small but apt", t: "u", out: { ease: 2, rumor: 1 }, note: "A brass rule from your kit. He turns it in his hands twice and adopts you for the evening, and adopted guests hear the unabridged complaint about the rush order's owner." } ],
    fail: [
      F("Your toast names a boat of his that sank with souls aboard, and the long table's cheer dies in its throat.",
        ["Finish the toast: to the souls, and his honest work", "s", { ease: 1, rumor: 1 }, "The recovery lands. Grief honored beats grief avoided, and the shipwright, wet-eyed, tells you what the inquiry never printed about that sinking."],
        ["Apologize and drink standing till he forgives", "c", { ease: 1 }, "Penance, visibly performed. He waves you down by the third swallow, and seats you beside him, where the real talk lives."]),
      F("The brass rule is a twin of one he gave a partner who betrayed him, and his face does arithmetic you cannot follow.",
        ["Ask the story the rule just told", "u", { rumor: 1, ease: 1 }, "He tells it, because fifty is the age for telling. The betrayal involves stolen drawings, a rival yard, and a hull design built to hide weight."],
        ["Offer to engrave it fresh, new history", "s", { ease: 2 }, "The gesture rewrites the omen. He laughs at last, properly, and the evening flows downhill into honesty from there."]),
    ] },
  { p: "Two crews have been drinking toward a brawl all evening with the patience of weather, and the keep's eyes are begging any sober soul for a miracle.", choices: [
    { label: "Buy both crews the same round at once", t: "s", out: { ease: 1, rumor: 1 }, note: "Synchronized generosity confuses aggression. The toast tangles them into one toast, and the grievance, aired over your ale instead of fists, is a cargo dispute worth hearing." },
    { label: "Start a contest with rules before the fists do", t: "b", out: { ease: 2, rumor: 1 }, note: "Arm wrestling, best of five, winners drink free. Violence with a scoreboard is just sport, and sport makes crews brag, and brags carry manifests in them." } ],
    fail: [
      F("Your twin rounds arrive a beat apart, and the crew served second takes the delay as the night's final insult.",
        ["Take the blame loudly off the keep", "s", { ease: 1, rumor: 1 }, "A target volunteers. Their anger spends itself on your apology instead of fists, and spent anger explains itself: the cargo, the route, the cheat."],
        ["Drink the second round yourself, both mugs", "u", { ease: 2 }, "Absurdity breaks the fever. Both crews watch you struggle through a double round, and laughter, once started, cannot brawl."]),
      F("Your contest rules ignite the exact argument they were meant to bury: WHO CHEATED WHOM is apparently also an arm-wrestling grievance.",
        ["Referee the grievance itself, formally", "u", { ease: 1, rumor: 1 }, "Robes of imaginary authority. Both sides present their cargo case to the stranger-judge, and the testimony is the whole rumor, sworn."],
        ["Declare drinks on you if both crews shake hands", "s", { ease: 1, rumor: 1 }, "Bribery for peace. The handshake is grudging, the drinking is not, and the blended crews compare notes on the merchant who played them both."]),
    ] },
  { p: "The widow's table by the window seats four women who have outlived five ships between them, and their nightly judgment of the harbor is quiet, unanimous, and never wrong.", choices: [
    { label: "Ask permission to stand the table a round", t: "c", out: { ease: 1, rumor: 1 }, note: "Permission granted with a nod you feel in your spine. Their thanks is a single sentence of appraisal about a captain you trusted, and the appraisal will save you grief." },
    { label: "Ask their judgment on the new-moon whispers", t: "u", out: { rumor: 2 }, note: "Four faces consult without words. The verdict: the harpooners, the green oil, and the saffron are one ledger, and the eldest names the hand that holds the pen." } ],
    fail: [
      F("Your round arrives unasked, and unasked gifts at the widow's table are returned untouched, with the full weight of four gazes.",
        ["Apologize correctly: to the eldest, by name", "s", { ease: 1, rumor: 1 }, "Protocol observed late is still observed. The eldest accepts on the table's behalf, and the acceptance comes with a warning that doubles as intelligence."],
        ["Drink all four returned glasses yourself, saluting each", "b", { ease: 2 }, "The absurd penance cracks the eldest's composure into one short laugh. The laugh is legend by morning, and the table's door is open to you after."]),
      F("The new moon, the eldest repeats, and the temperature at the window drops: one of the five lost ships sailed on a new moon, on whispers like these.",
        ["Ask about THAT ship instead, gently", "s", { ease: 1, rumor: 1 }, "The right grief at the right moment. The old loss, retold, rhymes with the new whispers point for point, and the rhyme is the warning."],
        ["Apologize and offer your help against this one", "u", { ease: 1, rumor: 1 }, "Service offered to judges. They confer, accept, and brief you like admirals: what to watch, which pier, and whose lantern."]),
    ] },
  { p: "A drinking contest erupts at the rail: harbor rum against a visiting crew's black spirit, and the visitors are winning with suspicious ease.", choices: [
    { label: "Watch the visitors' bottle, not the drinkers", t: "c", out: { rumor: 1, ease: 1 }, note: "Their pours come from the second bottle, not the first. Watered ringer spirits: they are drinking the harbor under the table on purpose, and sober ears in a drunk room harvest everything." },
    { label: "Enter the contest carrying the harbor's honor", t: "b", out: { ease: 2, rumor: 1 }, note: "You will pay for this tomorrow. Tonight, between rounds three and six, the visiting crew's tongues outpace their caution, and their captain's plans surface in fragments." } ],
    fail: [
      F("You stare at the wrong bottle a beat too long and the visiting mate's eyes meet yours over it with perfect understanding.",
        ["Toast him silently and keep the secret, for now", "s", { rumor: 1, ease: 1 }, "Complicity is currency. He buys your silence with a corner-of-mouth nod and, later, with the reason they need the harbor drunk tonight."],
        ["Announce the watered bottle to the room", "u", { rumor: 1 }, "Chaos, glorious. The contest collapses into accusations, and visitors arguing for their honor explain far too much about their schedule."]),
      F("Round four detonates somewhere behind your eyes, and the harbor's honor is suddenly resting on legs that have resigned.",
        ["Yield with a speech while you can still speech", "s", { ease: 2 }, "Surrender with style. The room carries you to a bench like a hero anyway, and the bench is beside the visitors' table, ears-first."],
        ["One more round, for the widows' table", "b", { ease: 1, rumor: 1 }, "Madness, sentiment, victory. The visitors break first out of sheer disbelief, and broken, they pay the forfeit in toasts that tell tales."]),
    ] },
  { p: "The quiet snug behind the chimney seats two, and tonight it seats one: the harbormaster's clerk, off duty, drinking with the focus of a man unwriting his day.", choices: [
    { label: "Take the second seat and match his silence", t: "c", out: { ease: 1, rumor: 1 }, note: "Two silences, properly kept, become an understanding. At the bottom of his third glass he says, to the fire, what the harbor ledger was made to unsay today." },
    { label: "Send over his next drink with no note", t: "s", out: { ease: 1, rumor: 1 }, note: "Anonymous kindness to a man drowning in accountable lines. He finds you to say thanks, and the thanks unravels into the day's erased arrivals." } ],
    fail: [
      F("The snug's second seat, it turns out, is spoken for nightly by the chimney cat, who registers her objection up your shin.",
        ["Cede the seat to the cat and stand companionably", "s", { ease: 1, rumor: 1 }, "Correct protocol at last. The clerk laughs for the first time today, and a laughing clerk narrates the ledger's worst line by way of explanation."],
        ["Win the cat over with dried fish, slowly", "u", { ease: 2 }, "A campaign of patience. The cat relents to your lap, the clerk relents to your company, and the snug holds three secret-keepers by closing."]),
      F("Your anonymous drink is the harbormaster's own brand, and the clerk recoils from it like a summons.",
        ["Claim it honestly: wrong guess, right intent", "s", { ease: 1 }, "The truth steadies him. Relief makes him talkative about exactly why that brand chills him, and the why is the day's erased ship."],
        ["Replace it with the cheapest rotgut, grinning", "u", { ease: 1, rumor: 1 }, "The joke lands where the gift missed. Rotgut is the people's drink, and over it the people's clerk leaks the ledger's edit."]),
    ] },
];
const TRAIN2 = [
  { p: "Dawn lap around the harbor mole: cold water, counted strokes, and nobody to perform for. The body remembers what the mind keeps dropping.", choices: [
    { label: "Swim it steady, breathe on threes", t: "c", out: { ease: 1, heal: 1 }, note: "Stroke, stroke, breathe. By the mole's elbow the week's weight has dissolved into salt, and the shoulder that ached has loosened into use." },
    { label: "Race the ferry across the mouth", t: "u", out: { ease: 2 }, note: "You lose to the ferry and win against yesterday. Lungs scoured, head scoured, and the ferryman's salute from the rail is worth the burn." } ],
    fail: [
      F("A cross-current off the elbow grabs your legs mid-stroke and the mole is suddenly upstream of you.",
        ["Angle with it, swim the long diagonal", "s", { ease: 1 }, "Fighting water is a young fool's sport. The diagonal lands you down-shore, tired and schooled, and the lesson settles the nerves it scared."],
        ["Grab the mole's chain and haul hand over hand", "b", { ease: 1, heal: 1 }, "Brute and direct. The chain shreds your palms a little and saves your morning a lot, and the climb out burns the fear off clean."]),
      F("The ferry's wake hits you sideways at the halfway mark, and three mouthfuls of harbor make their case for the ferry's victory.",
        ["Roll to your back and breathe it out", "s", { ease: 1 }, "Float, cough, laugh. The sky does not care who won, and twenty backstrokes later neither do you, which was the entire point."],
        ["Sprint the last stretch anyway, furious", "u", { ease: 2 }, "Fury is fuel if you burn it fast. You touch the dock four seconds behind the ferry and entirely ahead of the week's worries."]),
    ] },
  { p: "Breath drills on the pier end: in for four, hold for seven, out for eight, the way the pearl-divers teach, until the panic animal in the chest lies down.", choices: [
    { label: "Sit the full hour, count honest", t: "c", out: { ease: 2 }, note: "The first quarter is war, the second is truce, the rest is quiet. You stand up an hour older and a season calmer." },
    { label: "Finish with one long dive off the end", t: "u", out: { ease: 1, heal: 1 }, note: "The hour's work, tested. Down where the light goes green your pulse stays slow, and the body files the proof where panic used to live." } ],
    fail: [
      F("A gull lands on your knee at minute nine and dismantles your count with the entitlement of a tax collector.",
        ["Make the gull part of the practice", "s", { ease: 1 }, "Breathe with the interruption, not against it. The gull preens, you count, and the harbor's noise joins the rhythm instead of breaking it."],
        ["Move to the pier's far piling and restart", "c", { ease: 2 }, "Begin again is the whole discipline. The second hour runs clean, and finishing what a gull broke tastes better than an easy first try."]),
      F("The long dive finds the cold layer early, and the cold reaches into your chest and squeezes the trained calm out of it.",
        ["Exhale slow and rise on the bubbles", "s", { ease: 1 }, "The drill, used in anger. You surface unhurried, heart level, and the cold layer becomes a place you have been instead of a thing you fear."],
        ["Push one fathom deeper before turning", "b", { ease: 2 }, "Spite as discipline. The extra fathom proves the panic wrong at its own address, and the climb back up is the calmest minute of your week."]),
    ] },
  { p: "The bone-setter's shed smells of liniment and certainty, and she reads bodies the way pilots read water, finding the snag before you name it.", choices: [
    { label: "Submit to the full going-over", t: "s", out: { heal: 1, ease: 1 }, note: "She finds the catch in your shoulder you stopped mentioning and unhooks it with two thumbs and a word. Walking out, you are a year younger on one side." },
    { label: "Ask her to teach you the field version", t: "u", out: { heal: 1 }, note: "She shows you three holds and one cruel mercy, practiced on your own knots. The lesson hurts going in and pays out every voyage after." } ],
    fail: [
      F("Her thumbs find an old break set crooked years ago, and her sharp intake of breath is not a sound you wanted from a bone-setter.",
        ["Let her re-set it properly, brace and all", "b", { heal: 1, ease: 1 }, "Worse before better, then better than it has been in years. The brace itches for a week, and the old ache, the one you had named, is simply gone."],
        ["Ask for the managing of it, not the fixing", "s", { ease: 1 }, "Some snags sail better marked than mended. She maps the crooked set's weather signs and the stretches that quiet it, and knowledge is half the cure."]),
      F("The field version, practiced on yourself, goes wrong at the second hold, and something in your back files a formal complaint.",
        ["Stop, breathe, let her undo your work", "s", { heal: 1 }, "She unwinds the mistake with a sigh that has heard it all. The proper hold, demonstrated on the damage, finally lands in your hands correctly."],
        ["Push through the third hold as taught", "u", { ease: 1, heal: 1 }, "The complaint withdraws itself at the third hold's release. Pain, then click, then ease, which she says is the whole trade in three words."]),
    ] },
  { p: "The steam barrel behind the smith's takes three coals and one silence, and men come out of it boiled honest.", choices: [
    { label: "Take the heat the full count", t: "s", out: { ease: 2 }, note: "Sweat finds every worry and carries it out through the staves. The cold bucket after is a baptism into a quieter head." },
    { label: "Share the barrel hour with whoever comes", t: "u", out: { ease: 1, rumor: 1 }, note: "Steam strips rank along with grime. The stranger across the coals talks like men only talk boiled, and his harbor news arrives pre-softened and true." } ],
    fail: [
      F("The smith overstokes the coals for a joke and the barrel crosses the line from cleansing to cooking.",
        ["Out, bucket, laugh, back in at sane heat", "s", { ease: 2 }, "Respect the coals, restart the count. Round two at honest heat finishes what round one tried to ruin, and the smith owes you a horseshoe."],
        ["Outlast the joke on principle", "b", { ease: 1, heal: 1 }, "Stubbornness, medium rare. You exit pink and victorious, the smith applauds, and the cold bucket has never in history felt like that."]),
      F("Your barrel-mate turns out to be the one man in the harbor you have been avoiding, and the steam offers no exits.",
        ["Say the thing you have been not-saying", "u", { ease: 2 }, "Boiled honest, both of you. The grievance, aired at temperature, shrinks to its true size, which was always smaller than the avoiding."],
        ["Sit in civil silence the full count", "s", { ease: 1 }, "Coexistence as practice. Nobody yields, nobody fights, and somewhere in the shared sweat the feud quietly loses a layer."]),
    ] },
  { p: "A sparring partner waits at the sail loft with padded staves and no patience for your excuses, having heard them all from better liars.", choices: [
    { label: "Drill the guards until they live in the wrists", t: "c", out: { heal: 1, ease: 1 }, note: "Repetition until thought leaves and the body stays. The bruise on your forearm is the lesson's receipt, and the lesson will block something real someday." },
    { label: "Free spar, full speed, first to three", t: "u", out: { ease: 2 }, note: "You take two hits for every one you land and stop counting either. Whatever was gnawing the back of your mind got sweated into the loft floor." } ],
    fail: [
      F("Your guard drops on a tired rep and the padded stave finds your ear with a crack that reorders the morning.",
        ["Shake it off and drill the SAME guard, slower", "s", { heal: 1 }, "The mistake, rehearsed until it cannot recur. Your partner nods at the choice, and the nod from that one is worth the ringing."],
        ["Call the session and ice the ear by the water", "c", { ease: 1 }, "Knowing when to stop is also training. The cold dockside sit empties the frustration out with the swelling."]),
      F("Full speed finds the loft's one loose board, and your ankle rolls mid-lunge with a pop the gulls hear.",
        ["Wrap it tight and finish the round seated, arms only", "u", { ease: 1, heal: 1 }, "Adapt or yield. Seated sparring sharpens your hands wonderfully, and the partner's grudging respect does what liniment cannot."],
        ["Elevate it on a sail bag and talk technique", "s", { ease: 1 }, "Injury hour becomes theory hour. The footwork flaw that rolled the ankle gets diagrammed in chalk, and diagnosis is half of next time's victory."]),
    ] },
  { p: "The cliff stairs above the harbor: two hundred and six steps cut by penitents, climbed by fishermen, cursed by everyone, empty at first light.", choices: [
    { label: "Climb them once, steady, no stopping", t: "s", out: { ease: 1, heal: 1 }, note: "Step, breath, step. The harbor shrinks to a model of itself below, and your problems politely shrink with it." },
    { label: "Climb them twice, the second time for the doubt", t: "b", out: { ease: 2 }, note: "The first climb was for the body. The second is an argument with the voice that said you would not, and you win the argument at step four hundred and twelve." } ],
    fail: [
      F("Step one hundred and ninety has crumbled since last season, and your no-stopping vow meets a gap with a long drop's opinion under it.",
        ["Find the penitents' handhold and cross careful", "s", { ease: 1 }, "The old carvers cut a grip for exactly this. Crossing it slow, you understand the stairs were always a lesson about exactly this."],
        ["Leap it, momentum as commitment", "b", { ease: 2 }, "Airborne for one honest heartbeat. The landing holds, the heart soars stupidly, and the last sixteen steps are pure victory lap."]),
      F("The second climb's voice of doubt brings friends: the knees join the argument at step three hundred, persuasively.",
        ["Negotiate: slower pace, same destination", "s", { ease: 1, heal: 1 }, "Compromise with the body, not the doubt. The summit arrives late and entire, and arriving entire was the actual bet."],
        ["Count backwards from the top, steal the summit early", "u", { ease: 2 }, "A trick of the mind on the mind. Counting down, every step is already a descent from victory, and the knees, confused, comply."]),
    ] },
  { p: "The cold plunge off the north slip is a door: thirty seconds in water that means it, and whatever you carry in, you carry out lighter.", choices: [
    { label: "In, count thirty, out, no drama", t: "s", out: { ease: 2 }, note: "The cold burns the chatter off the mind like fog off morning water. Thirty seconds of nothing but now, and now turns out to be fine." },
    { label: "Make it a daily vow, witnessed", t: "u", out: { ease: 1, heal: 1 }, note: "You announce it to the slip's regulars, who will now hold you to it with the cruelty of friends. Day one stings, the vow already steadies." } ],
    fail: [
      F("The gasp reflex wins at second four, and you exit the water in a manner best described as fired from it.",
        ["Back in immediately, exhale FIRST this time", "s", { ease: 2 }, "Technique over toughness. The exhale tames the gasp, the thirty completes, and the door does what the door does."],
        ["Wade in by thirds, train the threshold", "c", { ease: 1 }, "Gradualism is still arrival. Ankles, ribs, shoulders, and the cold becomes a country you immigrate to instead of an ambush."]),
      F("Your witnessed vow draws the slip's oldest swimmer, who plunges beside you, effortless, and at second twenty is visibly composing poetry.",
        ["Match her stillness, learn by theft", "u", { ease: 2 }, "You steal her exhale rhythm wholesale. Second thirty arrives almost gentle, and she winks like she felt the theft and approves."],
        ["Ask her teaching, frozen and humble", "s", { ease: 1, heal: 1 }, "She talks you through the cold's three lies. Knowledge wraps you warmer than the towel, and the shoulder unclenches places you forgot were clenched."]),
    ] },
  { p: "Knife and whetstone on the sea wall: maintenance hour, where the edge gets trued and so, somehow, does the hand that holds it.", choices: [
    { label: "Work every blade you own to hair-splitting", t: "c", out: { ease: 1, heal: 1 }, note: "Stone, steel, rhythm. By the last blade the hands have remembered they are good at things, and the mind has stopped interrupting to disagree." },
    { label: "True a stranger's neglected knife as practice", t: "s", out: { ease: 1, rumor: 1 }, note: "The deckhand watches his ruined edge come back like a sunrise. Gratitude talks, and deckhand talk is the harbor's bloodstream." } ],
    fail: [
      F("The whetstone, dropped once too often in its life, cracks clean in half on the third pass.",
        ["Work both halves, smaller circles", "s", { ease: 1 }, "Adaptation is the older skill. The halves finish the job ugly and true, and ugly and true is a sermon you needed."],
        ["Walk to the smith's for a new stone, slow", "c", { ease: 1, heal: 1 }, "The errand becomes the rest. The smith's bench talk, the harbor walk, the new stone's first pass: maintenance of more than steel."]),
      F("The stranger's knife is worse than neglected: the tang is cracked under the grip, and your truing reveals a blade one hard use from snapping in his hand.",
        ["Show him the crack and refuse to hide it", "s", { ease: 1, rumor: 1 }, "Hard honesty over easy polish. He pales, thanks you twice, and mentions the work that knife was bought for, which is worth knowing."],
        ["Rebuild the grip yourself, hours be damned", "u", { ease: 1, heal: 1 }, "The long fix. Wrapping the tang takes the afternoon and gives back the kind of tiredness that sleeps well, plus a deckhand sworn to you."]),
    ] },
  { p: "The rope climb behind the chandlery runs forty feet to the loft beam, knotted every fathom, and the harbor's children scamper it like a staircase to shame you specifically.", choices: [
    { label: "Climb it three times, form over speed", t: "s", out: { heal: 1, ease: 1 }, note: "Grip, lock, reach. The third ascent finds the rhythm the first two argued about, and your shoulders file the technique under permanent." },
    { label: "Race the chandler's daughter, accept your fate", t: "u", out: { ease: 2 }, note: "She beats you by half the rope and shows you the foot-lock that did it. Losing to a nine-year-old has never paid better tuition." } ],
    fail: [
      F("Fathom three's knot, worn slick by a thousand small hands, spits your boot and leaves you pendulum-swinging over the chandler's woodpile.",
        ["Hang, breathe, regain the lock, continue", "s", { ease: 1, heal: 1 }, "The recovery IS the exercise. Topping out after the slip teaches the arms what topping out clean never could."],
        ["Drop to the woodpile and restart from zero", "c", { ease: 1 }, "No shame in the ground. The second attempt reads the slick knot correctly, and reading rope is half of every rigging job you will ever do."]),
      F("The daughter, victorious, declares you owe the loser's forfeit, which is apparently cleaning the loft beam pigeon situation.",
        ["Pay the forfeit in full, forty feet up", "s", { ease: 1, rumor: 1 }, "Honor among climbers. The beam-top hour overlooks the whole chandlery, and chandlery talk drifts up uncensored, including the back-room order."],
        ["Negotiate: double or nothing, foot-lock allowed", "b", { ease: 2 }, "With her own technique against her, you lose by only a fathom. The improvement delights her into teaching you the rest of her tricks."]),
    ] },
  { p: "The needle elder works the dockworkers' knots out with thumbs and fine pins, and her bench has a waiting list that ignores rank, coin, and excuses.", choices: [
    { label: "Wait your turn the honest way", t: "c", out: { ease: 1, heal: 1 }, note: "The bench queue is its own medicine: enforced sitting, harbor watching. Her pins find the shoulder's weather-knot and rain stops living in it." },
    { label: "Trade labor for a queue jump: split her firewood", t: "s", out: { heal: 1, ease: 1 }, note: "An hour of axe work buys the bench. Her thumbs read your spine like a chart and announce, correctly, what you have been carrying and exactly where." } ],
    fail: [
      F("The queue's dockworker ahead of you yields his slot to a man with a crushed hand, and the afternoon reshuffles you to tomorrow.",
        ["Stay and assist her with the crush case", "u", { heal: 1, ease: 1 }, "Extra hands welcome. You learn the pressure points by holding them, and she works your shoulder after hours as wages."],
        ["Take tomorrow's first slot and today's harbor walk", "s", { ease: 1 }, "Patience, prescribed. The long walk loosens half of what the bench would have, and tomorrow's pins finish the job properly."]),
      F("Your axe finds a knot in the firewood that bites back, and the elder watches you limp her woodpile's revenge to the bench.",
        ["Present the new injury with the old, package deal", "s", { heal: 1 }, "She laughs once, then works both. The fresh hurt, treated fresh, heals clean, and the lesson about reading wood grain comes free."],
        ["Finish the cord first, pride before pins", "b", { ease: 1, heal: 1 }, "Stubborn to the last log. She calls you a mule and treats you like a prized one, and mules get the long version of the treatment."]),
    ] },
  { p: "Sleep debt comes due: the body presents its ledger, and the loft over the sailmaker's, warm and canvas-quiet, is accepting payments.", choices: [
    { label: "Pay in full: dark, warm, ten hours", t: "c", out: { ease: 2 }, note: "You wake in the same position you landed, drooling on sailcloth, owing nothing. The world has been repainted in its actual colors." },
    { label: "Pay half now, walk the dusk, sleep again", t: "s", out: { ease: 1, heal: 1 }, note: "The split shift, sailor's classic. Between sleeps the dusk harbor is soft and harmless, and the second sleep arrives like a paid debt's receipt." } ],
    fail: [
      F("The sailmaker's apprentice starts hammering grommets at hour two, directly beneath your skull, with the rhythm of the damned.",
        ["Down the ladder, befriend the hammer, return", "s", { ease: 1 }, "Two minutes of charm buys silent hours. The apprentice saves the grommets for noon, and the loft returns to its canvas hush."],
        ["Sleep THROUGH it as discipline", "u", { ease: 2 }, "The deep exhaustion accepts the challenge. You sink beneath the hammering like a stone beneath chop, and surface ten hours later, cured."]),
      F("The dusk walk finds trouble: a slipped cargo net, a shouting mate, and your half-rested hands volunteering before your judgment wakes.",
        ["Help with the net, then STRAIGHT back to the loft", "s", { ease: 1, heal: 1 }, "Good deed, bounded. The net rights, the mate owes you, and the second sleep lands deeper for the honest tired added on top."],
        ["Decline politely, guard the convalescence", "c", { ease: 2 }, "Boundaries are also strength training. The net finds other hands, and your second sleep, undefended by guilt, completes the cure."]),
    ] },
  { p: "Balance work on the spare spar: a round timber over soft sand, where the harbor's topmen learn the difference between standing and dancing.", choices: [
    { label: "Walk it slow until it stops wobbling you", t: "c", out: { ease: 1, heal: 1 }, note: "Fall, mount, fall, mount, walk. Somewhere in the falling the ankles learn the language, and the spar goes from enemy to floor." },
    { label: "Walk it carrying a full water bucket", t: "u", out: { ease: 2 }, note: "The bucket teaches what empty hands cannot: commitment. Three soakings later you cross dry, and the crossing rewires something below thought." } ],
    fail: [
      F("The spar rolls a quarter turn under your fifth step and the sand accepts your argument against it personally.",
        ["Up, brush off, step five again, specifically", "s", { ease: 1 }, "Address the exact failure. Step five, conquered alone, unlocks the rest of the spar like a stuck door."],
        ["Study the topmen's feet from the sand first", "c", { ease: 1, heal: 1 }, "Theft of technique from below. Their heels never land first, you notice, and noticing, your next mount lasts the length."]),
      F("Bucket, body, and balance reach a three-way disagreement at midpoint, and the resolution soaks all parties and a passing topman.",
        ["Refill and offer the topman the next crossing", "s", { ease: 1, rumor: 1 }, "Apology by entertainment. He crosses with the bucket on his HEAD, shows you the hip trick after, and his rigging gossip flows with the demonstration."],
        ["Again, immediately, before the failure sets", "b", { ease: 2 }, "Wet, furious, precise. The immediate retry crosses clean on pure refusal, and refusal, it turns out, weighs less than doubt."]),
    ] },
  { p: "Shadow drills against the mast at dusk: an opponent who never tires, never errs, and never lands a blow, which makes him perfect for fixing yours.", choices: [
    { label: "Fight your last real fight again, corrected", t: "s", out: { ease: 1, heal: 1 }, note: "The mast wears the face of the mistake. You replay the exchange forty times, and on the forty-first the body files the correction where the error lived." },
    { label: "Fight tomorrow's fight before it happens", t: "u", out: { ease: 2 }, note: "Whatever is coming, you meet it here first. The mast absorbs the dread along with the strikes, and dread rehearsed shrinks to mere readiness." } ],
    fail: [
      F("The replay opens the memory wider than planned, and suddenly the dusk has the smell and sound of the day it went wrong.",
        ["Drill THROUGH the memory at half speed", "s", { ease: 1 }, "Slow motion drains the venom. The exchange, walked at teaching pace, becomes technique instead of wound, which is the alchemy you came for."],
        ["Sit against the mast and let it pass entire", "c", { ease: 2 }, "Sometimes the drill is sitting. The memory crests, breaks, recedes, and what it leaves on the sand is lighter than what it took."]),
      F("Tomorrow's imagined opponent grows in the rehearsing: faster, crueler, every drill making the dread larger instead of smaller.",
        ["Shrink him: fight him drunk, clumsy, human", "u", { ease: 2 }, "Re-imagination as tactics. The opponent, rebuilt life-size, loses the rehearsal handily, and the dread deflates to its proper dimensions."],
        ["Stop, name the fear aloud to the mast", "s", { ease: 1, heal: 1 }, "Named things obey. The fear, spoken to timber and dusk, turns out to be three sentences long, and three sentences can be answered."]),
    ] },
  { p: "Fasting watch: one sunset to the next on water and quiet, the old penitent practice, recommended by the cliff stairs' carvers for heads too full to steer.", choices: [
    { label: "Keep the full fast, walk the sea wall hourly", t: "c", out: { ease: 2 }, note: "Hunger arrives, complains, and leaves a clean emptiness behind. By the second sunset the head has only what matters in it, sorted." },
    { label: "Break it at dawn with deliberate, slow bread", t: "s", out: { ease: 1, heal: 1 }, note: "Half the practice, honestly kept. The dawn bread tastes like the invention of bread, and gratitude, it turns out, is a nutrient." } ],
    fail: [
      F("Hour ten, and the smell of the eel cart rounds the sea wall like a press gang with a warrant for you specifically.",
        ["Walk the long way around the smell", "s", { ease: 1 }, "Strategic retreat preserves the campaign. The detour adds a mile and subtracts the temptation, and mile and emptiness finish the sorting together."],
        ["Stand IN the smell and refuse it, breathing", "b", { ease: 2 }, "The hard school. Ten breaths of eel-smoke met and mastered, and after that, the rest of the fast is a downhill walk."]),
      F("Dawn bread, bolted instead of savored, lands in the emptied stomach like a dropped anchor, and the practice's gentle ending turns mutinous.",
        ["Water, stillness, start the bread again slower", "s", { ease: 1, heal: 1 }, "The remedy is the original instruction. Crumb by crumb the anchor lifts, and the lesson about hunger and haste files itself permanently."],
        ["Walk it off along the tide-line", "c", { ease: 1 }, "Motion settles what stillness cannot. The tide-line walk turns penance to pleasure by the third breakwater, and the day proceeds, schooled."]),
    ] },
  { p: "The long row alone: a borrowed skiff, a flat morning, and nothing required of you but oars and breathing until the harbor is a brown line behind.", choices: [
    { label: "Row to the line where the water changes color", t: "s", out: { ease: 2 }, note: "Stroke by stroke the chatter falls overboard. At the color line you ship oars and drift, and the drift does the last of the work." },
    { label: "Row hard out, drift back with the tide", t: "u", out: { ease: 1, heal: 1 }, note: "Spend everything going, owe nothing coming home. The tide carries the husk of you back, and the husk arrives empty of every gnawing thing." } ],
    fail: [
      F("The flat morning was a liar: a chop kicks up past the mole and the borrowed skiff starts taking the slaps personally.",
        ["Quarter into it and shorten the trip", "s", { ease: 1 }, "Seamanship over stubbornness. The shorter row, rowed well in weather, scours the head better than the long one would have flat."],
        ["Hold the plan, ride the chop out", "b", { ease: 2 }, "The skiff and you reach an understanding through your spine. Past the chop the water flattens to glass, and the glass was earned."]),
      F("The returning tide stalls slack midway home, and the spent husk of you confronts a mile of unmoving water with empty arms.",
        ["Rest, eat the emergency biscuit, row slow", "s", { ease: 1, heal: 1 }, "The biscuit was always the plan B. Half-rations and quarter-strokes walk the skiff home, and the slow mile teaches the deepest calm of the day."],
        ["Sing the stroke and row on will alone", "u", { ease: 2 }, "The old rowers' trick: the song rows when the arms cannot. You land hoarse and hollowed and somehow grinning, and sleep that night like cargo."]),
    ] },
  { p: "Net-mending hour on the warm stones: torn mesh, wooden needle, and the kind of work that occupies the hands precisely so the head can drain.", choices: [
    { label: "Mend the worst net on the rack, properly", t: "c", out: { ease: 1, heal: 1 }, note: "Knot by knot the chaos becomes order. The net's owner finds it whole at dusk and you find your head the same, and neither transaction needed words." },
    { label: "Join the menders' circle and their slow talk", t: "s", out: { ease: 1, rumor: 1 }, note: "The circle's talk moves at needle pace, which is the pace truth prefers. Between knots: who is selling nets, who stopped needing them, and why." } ],
    fail: [
      F("The worst net is worse than torn: something with teeth went THROUGH it, and the bite's geometry stops your needle cold.",
        ["Mend it anyway, double-corded at the wound", "s", { ease: 1, heal: 1 }, "The work resumes around the mystery. The reinforced mend outlives doubt, and the net's owner, shown the bite, pays in the story of where it happened."],
        ["Take the bitten panel to the wreck-divers", "u", { ease: 1, rumor: 1 }, "Expertise consulted. The divers pass the panel around in silence, and the silence, broken, agrees on a creature and a depth that should not match."]),
      F("The circle's slow talk halts at your arrival, needles pausing, the courtesy of strangers stretched thin over suspicion.",
        ["Mend in silence until the talk forgets you", "c", { ease: 1, rumor: 1 }, "An hour of competent quiet. The circle's talk regrows around you like mesh around a stone, and the stone hears everything."],
        ["Offer your best knot as introduction", "s", { ease: 1 }, "Craft is the only credential here. The knot passes inspection hand to hand, and by its return you have a place, a needle, and the gossip's middle chapters."]),
    ] },
  { p: "The mast-top hour: climb to the borrowed crosstrees at slack tide and sit where only wind and gulls hold opinions, the harbor's cheapest cathedral.", choices: [
    { label: "Sit the hour, watch the water breathe", t: "c", out: { ease: 2 }, note: "From up here the week's storms are texture on water. The hour empties you politely, top down, and the climb back arrives in a body that fits." },
    { label: "Bring the problem up and leave it there", t: "u", out: { ease: 1, heal: 1 }, note: "You say it once, aloud, to the wind, which has heard worse. The wind keeps it. The descent is twenty pounds lighter than the climb." } ],
    fail: [
      F("A squall line walks across the outer water mid-hour, and the cathedral starts swaying its congregation with intent.",
        ["Lash in and ride the sway like a topman", "b", { ease: 2 }, "The mast teaches in weather what it cannot in calm. You descend baptized, grinning, with weather-legs you did not climb up with."],
        ["Descend before it arrives, hour honored", "s", { ease: 1 }, "Prudence is also a view. From the deck you watch the squall take your seat, and the timing, judged right, settles something in you anyway."]),
      F("The problem, spoken aloud at altitude, echoes back off the wind sounding twice as large and entirely unsolved.",
        ["Say it again, shorter, until it fits in six words", "s", { ease: 1, heal: 1 }, "Each retelling shrinks it. At six words it is small enough to see all the way around, and seen whole, it has a handle."],
        ["Laugh at it, up there, where no one minds", "u", { ease: 2 }, "The laugh starts forced and finishes real. Some problems cannot survive being laughed at from a mast-top, and this was one."]),
    ] },
];
const PURSUIT2 = [
  { p: "A rival surfaces: someone is working YOUR goal from the other end, faster, louder, and with better boots.", choices: [
    { label: "Study their method before they notice you", t: "s", out: { pursuit: 1 }, note: "Their shortcuts map your long road's hazards. You fold the best of their method into yours and keep the patience they lack." },
    { label: "Walk up and propose splitting the work", t: "b", out: { pursuit: 2 }, note: "Audacity reads as confidence. The rival, lonelier in the lead than they let on, takes the deal, and two ends burn toward the middle." } ],
    fail: [
      F("They notice you noticing on day two, and your study session becomes a staring contest across a market square.",
        ["Tip your hat and own the scouting", "s", { pursuit: 1 }, "Caught clean, played clean. The acknowledgment becomes a wary professional respect, and respect trades small intelligence at the edges."],
        ["Vanish and switch to their abandoned angles", "u", { pursuit: 1 }, "They cleared paths they did not finish. Their leavings, picked up cold, advance you a week in an afternoon."]),
      F("The split-the-work proposal hits pride: the rival laughs in your face, publicly, and the laugh has an audience.",
        ["Laugh along, then outwork them in silence", "s", { pursuit: 1 }, "The audience forgets by supper. Your next stretch of progress, made quietly, says what the proposal could not."],
        ["Bet them openly: first to the milestone", "b", { pursuit: 2 }, "Pride accepts what partnership offended. The race sharpens both of you, and racing, you cover ground dread had been guarding."]),
    ] },
  { p: "A windfall lands unlooked-for: exactly the resource the goal has been starving for, from a source you cannot quite see the shape of.", choices: [
    { label: "Take it, but trace the source first", t: "c", out: { pursuit: 1 }, note: "Gift accepted, giver mapped. The source turns out benign but watching, and knowing you are watched is its own kind of resource." },
    { label: "Spend it immediately on the bottleneck", t: "u", out: { pursuit: 2 }, note: "Strike while the gift is hot. The bottleneck that ate three months breaks in three days, and momentum, once moving, feeds itself." } ],
    fail: [
      F("The trace leads in a circle back to someone who owes you nothing and gave anyway, and the why of it unsettles more than a price would.",
        ["Ask them the why, directly, with thanks", "s", { pursuit: 1 }, "The answer is simpler and heavier than feared: they believe in the goal. Belief, banked, pushes the work like wind."],
        ["Accept the mystery and earmark a return gift", "c", { pursuit: 1 }, "Some ledgers balance later. The earmark eases the obligation's itch, and the eased mind works a clean week."]),
      F("Spent fast, the windfall meets a hidden cost: the bottleneck breaks, but breaking it wakes a second problem sleeping behind it.",
        ["Meet the new problem while momentum holds", "b", { pursuit: 2 }, "Momentum does not ask permission. The second problem, hit at speed, cracks easier than the first ever did."],
        ["Pause, map the new terrain honestly", "s", { pursuit: 1 }, "A day of honest cartography. The second problem, drawn to scale, is smaller than panic painted it, and the map is progress too."]),
    ] },
  { p: "A letter arrives in a mentor's hand, the one who first pointed you down this road, and it asks, simply: how far along are you, truly?", choices: [
    { label: "Answer with the unvarnished truth", t: "s", out: { pursuit: 1 }, note: "Writing it honestly forces the accounting you have dodged. The reply that comes back contains one correction worth a season of fumbling." },
    { label: "Answer with proof: send a piece of the work", t: "u", out: { pursuit: 1, ease: 1 }, note: "The piece, chosen and packed, looks better in the sending than it ever did on your bench. Their margin notes return like rain on dry ground." } ],
    fail: [
      F("The honest accounting comes out bleaker on paper than it lives in your head, and the letter sits unsent, accusing, for three days.",
        ["Send it anyway, bleakness included", "b", { pursuit: 2 }, "Mentors are for the bleak parts. The answer arrives fast and fierce, half scolding, half map, and the map half works immediately."],
        ["Burn it and write the three-sentence version", "s", { pursuit: 1 }, "Brevity rescues honesty. Three true sentences fit in an envelope where despair would not, and the reply meets them at their size."]),
      F("The piece you sent arrives damaged, the worst part facing up, and the silence that follows is long enough to grow doubts in.",
        ["Write again: the damage, the design, the difference", "s", { pursuit: 1 }, "Context repairs what the road broke. The eventual reply addresses the design, not the damage, and the address moves you forward."],
        ["Build the piece again, better, and resend", "u", { pursuit: 2 }, "The rebuild outgrows the original. Version two carries the lesson version one only gestured at, and making it taught the lesson twice."]),
    ] },
  { p: "A deadline lands from outside: circumstances have given the goal a date, real and immovable, where before there was only someday.", choices: [
    { label: "Break the remaining road into dated stones", t: "s", out: { pursuit: 1 }, note: "Someday dies, schedule lives. Each stone, dated, is small enough to step on, and the first three fall in the first week." },
    { label: "Sprint the hardest stretch first, fear be hanged", t: "b", out: { pursuit: 2 }, note: "The deadline's pressure, spent on the worst terrain. The hard stretch, taken at a run, breaks like surf, and everything after is downhill with a date on it." } ],
    fail: [
      F("The dated stones, laid out honestly, do not reach the deadline. The arithmetic says so in its flat voice.",
        ["Cut scope: which stones can the goal live without", "s", { pursuit: 1 }, "Surgery beats surrender. The trimmed road reaches the date, and the trimmed goal, examined, lost nothing it will miss."],
        ["Recruit help for the stones that parallelize", "u", { pursuit: 1, ease: 1 }, "Two roads at once where the work allows. The arithmetic, redone with borrowed hands, balances, and the borrowing builds a small crew around the goal."]),
      F("The sprint hits a wall the fear was actually guarding: the hard stretch is hard for a reason, and the reason has not moved.",
        ["Siege it: daily pressure, no single battle", "s", { pursuit: 1 }, "The wall yields to patience what it refused to speed. Brick by daily brick, the breach opens before the date."],
        ["Go around: the wall guards one road, not all", "u", { pursuit: 1 }, "Reconnaissance finds the flank. The detour costs three days and saves the deadline, and the wall keeps guarding a road nobody needs now."]),
    ] },
  { p: "The missing piece surfaces for sale: the exact thing the goal lacks, in a stranger's stall, priced like the seller knows what it is to somebody.", choices: [
    { label: "Haggle patient and cold, want it less", t: "c", out: { pursuit: 1 }, note: "Three visits of manufactured indifference. The price wilts, the piece changes hands, and the goal clicks one socket closer to whole." },
    { label: "Pay the knowing price without theater", t: "u", out: { pursuit: 2 }, note: "Time is the dearer currency. The piece comes home today, the work resumes tonight, and tonight's progress repays the overcharge by week's end." } ],
    fail: [
      F("Your indifference overplays: a second buyer materializes on visit two, fingering the piece with unbearable competence.",
        ["Outbid them on the spot, theater abandoned", "s", { pursuit: 1 }, "The mask drops, the coin lands. The seller grins at the lesson taught, and the piece, finally yours, forgives the tuition."],
        ["Let them buy it, then offer to trade", "u", { pursuit: 1 }, "The second buyer wanted it for one part you can spare. The trade leaves both goals fed, and an ally where a rival stood."]),
      F("Paid in full, the piece reveals a flaw at home: genuine, but cracked where it matters, the knowing price covering a known defect.",
        ["Back to the stall with the crack and your eyes", "s", { pursuit: 1 }, "No shouting, just showing. The seller, caught, refunds half and throws in the provenance, and the provenance points to a second, whole piece."],
        ["Mend the crack yourself, learn its anatomy", "b", { pursuit: 2 }, "The repair forces mastery the purchase would have skipped. Mended, the piece works, and the mending hand now understands the whole machine."]),
    ] },
  { p: "An old failure resurfaces: the attempt from years ago, abandoned and buried, turns out to be load-bearing for the current goal, and it must be dug up.", choices: [
    { label: "Excavate it honestly, flaws and all", t: "s", out: { pursuit: 1 }, note: "The old work, faced in daylight, is better than shame remembered and worse than hope pretended. The usable third of it saves a month." },
    { label: "Rebuild it from scratch, informed by the corpse", t: "u", out: { pursuit: 2 }, note: "The autopsy guides the resurrection. Version two stands where version one fell, stronger at exactly the joints that failed, because you remember the breaking." } ],
    fail: [
      F("The excavation finds the failure's cause grinning up at you: the same flaw, you realize cold, that the current goal is repeating right now.",
        ["Stop everything and fix the live flaw first", "s", { pursuit: 1 }, "The dead teach the living. The current work, corrected mid-stride, dodges the grave its predecessor dug, and dodging it is the week's true progress."],
        ["Document the flaw's anatomy before touching anything", "c", { pursuit: 1 }, "The careful path. The flaw, fully mapped, cannot ambush twice, and the map joins the goal's foundations as its strongest stone."]),
      F("The rebuild stalls at the exact step the original died on, and the old despair arrives on schedule, wearing the same coat.",
        ["Push one step PAST the death point, just one", "b", { pursuit: 2 }, "One step into unmapped country. The death point, crossed, loses its power retroactively, and the steps after come easier than any before."],
        ["Bring in fresh eyes for that single step", "s", { pursuit: 1 }, "The stranger sees the simple thing grief obscured. Their one suggestion costs you a dinner and buys the breakthrough."]),
    ] },
  { p: "An ally offers a shortcut with strings: real help, real fast, and a favor to be named later hanging off it like a hook in good bait.", choices: [
    { label: "Take it, but name the favor's limits now", t: "s", out: { pursuit: 1 }, note: "Negotiated obligation is just a contract. The shortcut delivers, the limits hold, and the goal advances unmortgaged past the knees." },
    { label: "Decline the strings, ask the price in coin", t: "c", out: { pursuit: 1 }, note: "Everything has a cash price if you insist politely. It stings the purse and frees the future, and the ally respects the clean accounting." } ],
    fail: [
      F("The limits you name offend the offering: favors, the ally says coldly, are not contracts, and the help withdraws across the table.",
        ["Apologize and accept the favor unbounded", "u", { pursuit: 2 }, "The gamble on their character. The shortcut delivers double, and the unnamed favor, when it eventually comes, asks less than fear priced it."],
        ["Part friendly and find the long way", "s", { pursuit: 1 }, "The road without hooks. Longer, slower, yours, and walking it you find a smaller shortcut nobody owned."]),
      F("The cash price, named, is theatrical: a sum meant to push you back onto the hook, where the ally wanted you all along.",
        ["Pay a third now, a third on delivery, walk if refused", "s", { pursuit: 1 }, "Structure calls the bluff. The ally, caught between greed and the hook, takes the honest schedule, and the shortcut runs on rails."],
        ["Laugh, decline both, and tell them why", "b", { pursuit: 2 }, "The refusal, delivered with affection, resets the whole game. The ally, oddly relieved, helps for free, because the hook was never their idea either."]),
    ] },
  { p: "The work gets noticed: a stranger asks informed questions about the goal in a public place, and informed is the unsettling part.", choices: [
    { label: "Answer the safe half, study the questions", t: "c", out: { pursuit: 1 }, note: "Their questions reveal their map of you, and their map has gaps you can live in. You leave knowing more about them than they gained about the goal." },
    { label: "Recruit them: that informed, they should help", t: "b", out: { pursuit: 2 }, note: "Offense as defense. The stranger, startled into honesty, was sent to scout you, and flipping a scout turns surveillance into a supply line." } ],
    fail: [
      F("Your safe half is less safe than rehearsed: one answer connects two things they should not have been able to connect, and their eyes do the math.",
        ["Muddy it immediately with cheerful misdirection", "s", { pursuit: 1 }, "Noise after signal. Your follow-up rambles bury the connection in plausible chaff, and the chaff, planted, may bloom usefully later."],
        ["Own it: yes, and what is it to you", "u", { pursuit: 1 }, "Directness flushes the brief. They came to confirm a guess for an employer, and the employer's name, once surrendered, reorders your threat map."]),
      F("The recruitment pitch hits a true believer of the other side, and the public place gets a public refusal with witnesses.",
        ["Take the refusal graciously and exit slow", "s", { pursuit: 1 }, "Grace under audience. Half the witnesses, intrigued by your calm, find you later, and one of them is worth ten of the refuser."],
        ["Debate them, here, winner takes the room", "b", { pursuit: 2 }, "The argument draws a crowd and you argue for the goal like its life depends, because it does. The room divides, your half is larger, and larger halves carry work."]),
    ] },
  { p: "A burned bridge must be recrossed: the next stretch of the goal runs through someone you wronged, or who wronged you, and the river has no other crossing.", choices: [
    { label: "Go first with the apology you owe", t: "s", out: { pursuit: 1, ease: 1 }, note: "The words cost exactly what they should. The bridge, repaired plank by plank in one conversation, bears the goal's weight, and yours feels lighter for the toll." },
    { label: "Go with business only, history fenced off", t: "c", out: { pursuit: 1 }, note: "Professional and bloodless. The fence holds, the transaction completes, and the goal crosses dry while the history stays where you both left it." } ],
    fail: [
      F("Your apology meets a ledger: they have kept accounts of the wrong, itemized, and the recitation is long and not inaccurate.",
        ["Hear the whole ledger without defense", "s", { pursuit: 1, ease: 1 }, "The listening IS the payment. Read out and witnessed, the ledger closes itself, and the closed book makes a sturdy crossing."],
        ["Counter with your own ledger, also true", "u", { pursuit: 1 }, "Mutual accounting. The two lists, laid side by side, cancel to a smaller number than either feared, and the small number is payable today."]),
      F("The fence fails in minute four: history climbs it, as history does, and the business meeting becomes the fight you both rehearsed for years.",
        ["Let it burn out, then ask: now, the business", "s", { pursuit: 1 }, "Some fires need air before they die. The fight, finally had, leaves clean ground, and on clean ground the deal takes ten minutes."],
        ["Walk out, send terms in writing instead", "c", { pursuit: 1 }, "Paper holds no grudges. The written crossing succeeds where the spoken one drowned, and signatures, unlike voices, do not shake."]),
    ] },
  { p: "A map of the next step falls into your hands: notes, half a diagram, somebody else's solved version of the problem you are mid-struggle with.", choices: [
    { label: "Verify it against your own work first", t: "c", out: { pursuit: 1 }, note: "Trust, but triangulate. Their solution holds at every point yours can check, and the checking teaches you the why behind their how." },
    { label: "Follow it at full speed, gift horse unmouthed", t: "u", out: { pursuit: 2 }, note: "The map runs true. A month of stuck dissolves in a week of following, and the goal lurches forward into country you had only squinted at." } ],
    fail: [
      F("Verification finds a discrepancy: their map and your work disagree at one critical junction, and one of you is wrong.",
        ["Test the junction empirically, settle it", "s", { pursuit: 1 }, "Reality referees. The test rules for the map, and your error, found by contrast, was teaching false at three other points too. All four corrected."],
        ["Trust YOUR work and fork from the map there", "b", { pursuit: 2 }, "The map's author solved THEIR problem; this junction is where the problems differ. Your fork holds, and holding, proves the goal is finally yours alone."]),
      F("The map runs true until it suddenly does not: a page is missing, exactly where the country gets difficult, of course.",
        ["Reconstruct the missing page from the pages around it", "s", { pursuit: 1 }, "The author's logic, learned from five pages, predicts the sixth. Your reconstruction crosses the gap, wobbling but whole."],
        ["Seek the author through the map's handwriting", "u", { pursuit: 1 }, "The hand is findable: a scribe recognizes it. The author, located and amused, supplies the missing page for the story of how you came to hold the rest."]),
    ] },
  { p: "The body objects: weeks of the goal's pace present an invoice, payable in trembling hands and a cough that has opinions.", choices: [
    { label: "Pay it: three days of genuine rest", t: "s", out: { pursuit: 1, ease: 1 }, note: "The rest, fought for and kept, returns interest. Day four's work, done by a repaired animal, outpaces the whole limping week before." },
    { label: "Restructure: the goal must fit the body's gait", t: "c", out: { pursuit: 1 }, note: "Sustainable beats heroic. The new pace looks slower and travels farther, and the cough, no longer outvoted, withdraws its objection." } ],
    fail: [
      F("Day two of rest, and the goal's voice starts at dawn: every still hour itemized as betrayal, the rest curdling into guilt.",
        ["Rest HARDER: the guilt is the symptom, treat it", "s", { ease: 2 }, "You name the guilt a fever and wait it out like one. By day three it breaks, and underneath it the rest finally takes."],
        ["Compromise: one hour of light work as medicine", "u", { pursuit: 1, ease: 1 }, "The token hour feeds the goal's voice enough to quiet it. The other twenty-three rest properly, and the bargain holds all three days."]),
      F("The restructure meets the deadline arithmetic from before, and the sums say the body's gait and the date cannot both be kept.",
        ["Keep the body, move what can move of the date", "s", { pursuit: 1 }, "Some dates bend when pushed with evidence. This one bends a fortnight, and the fortnight, at the honest pace, suffices."],
        ["Keep the date, borrow against the body ONCE, knowingly", "b", { pursuit: 2 }, "A debt taken with open eyes, repayment scheduled. The sprint lands the date, the planned collapse follows on schedule, and the schedule holds because you wrote it."]),
    ] },
  { p: "Someone now depends on the outcome: the goal, once private, has quietly become a thing another person is steering their life by.", choices: [
    { label: "Tell them the true odds, kindly", t: "s", out: { pursuit: 1 }, note: "Honesty recalibrates without crushing. They adjust their steering, stay aboard anyway, and the staying, freely chosen, becomes ballast for you both." },
    { label: "Let their faith raise your floor", t: "u", out: { pursuit: 2 }, note: "Being depended on is a kind of rigging. The work, watched by someone who needs it, refuses its old shortcuts, and refusing them, improves." } ],
    fail: [
      F("The true odds land harder than kindly intended, and their face does the slow fall of a person re-planning a future mid-sentence.",
        ["Sit with the fall, then plan the hedge together", "s", { pursuit: 1, ease: 1 }, "You build their plan B with your own hands. The hedge, made together, frees them to believe in plan A again, and belief returns to the room."],
        ["Show them the work itself, odds be damned", "u", { pursuit: 1 }, "Numbers frighten, things persuade. The work, touched and turned in their hands, argues better than your percentages, and they re-enlist on evidence."]),
      F("Their faith, used as rigging, starts steering: suggestions arrive daily, then hourly, the dependence inverting into management.",
        ["Set the watch schedule: when they may look, when not", "s", { pursuit: 1 }, "Boundaries, kindly built. The schedule gives their care a harbor and your work its sea room, and both improve in their own waters."],
        ["Give them a real piece of it to own outright", "b", { pursuit: 2 }, "The management impulse, given a province, governs it well. Their piece flourishes under the attention yours was suffocating beneath, and the goal grows a second pair of hands."]),
    ] },
  { p: "A false lead collapses: a week of work reveals itself spent on a road that was never going anywhere, painted to look like progress by your own hope.", choices: [
    { label: "Audit how hope fooled you, unsparingly", t: "s", out: { pursuit: 1 }, note: "The post-mortem hurts and pays. Hope's three tells, identified, cannot disguise the next false road, and the audit itself is a tool now." },
    { label: "Salvage parts: no week is a total loss", t: "c", out: { pursuit: 1 }, note: "The false road's bricks, pried up, fit the true road fine. Two techniques and one contact survive the collapse, and survival is forward." } ],
    fail: [
      F("The audit turns on the auditor: unsparing slides into merciless, and by evening the verdict has expanded from the week to the whole goal to you.",
        ["Stop the trial, sentence the WEEK only, adjourn", "s", { pursuit: 1, ease: 1 }, "Jurisdiction matters. The week, sentenced and served, releases the rest of you on its own recognizance, and the morning resumes work uncharged."],
        ["Take the verdict to someone who will appeal it", "u", { pursuit: 1 }, "A friend's cross-examination shreds the merciless case in minutes. Their closing argument, half insult, half faith, gets framed above the bench."]),
      F("The salvage turns up a brick that does not belong to your false road at all: somebody else's work, buried in yours, which means the road was painted by more than hope.",
        ["Trace whose hands laid the foreign brick", "u", { pursuit: 1 }, "The trace finds a rival's tidy signature. Knowing the road was baited changes the audit's verdict, and the rival's method, now known, telegraphs their next bait."],
        ["Use the foreign brick anyway, it is good work", "s", { pursuit: 1 }, "Stolen bait is still bread. The brick, mortared into the true road, holds weight, and holding it, repays the wasted week with interest."]),
    ] },
  { p: "Three bells past midnight and the doubt arrives on schedule: the quiet voice asking whether the goal was ever worth the candle, patient as tide.", choices: [
    { label: "Get up and answer it with one small task", t: "s", out: { pursuit: 1 }, note: "Work is the only argument the voice respects. One small task, done in the dark, and the voice retreats to wherever voices wait." },
    { label: "Sit with it and interrogate it honestly", t: "u", out: { pursuit: 1, ease: 1 }, note: "You let it make its full case for once. Heard out, it shrinks: under the doubt was one fixable fear, and naming it fixed half." } ],
    fail: [
      F("The small task, fumbled at three bells, breaks something the daylight version of you had built carefully.",
        ["Leave the wreckage and sleep, repair at dawn", "s", { pursuit: 1 }, "Dawn hands are better hands. The breakage, surveyed rested, takes an hour to mend, and the mending teaches a sturdier joint."],
        ["Fix it now, slowly, as penance and practice", "u", { pursuit: 1 }, "Night work, done at night pace, holds. By first light the repair is invisible and the voice, outworked, has nothing left to say."]),
      F("The interrogation goes badly: the doubt produces witnesses, old failures in chronological order, and the bench is not friendly at this hour.",
        ["Adjourn until morning, doubts heard by daylight only", "s", { ease: 1, pursuit: 1 }, "A rule, made and kept. The morning rehearing dismisses half the case on sight, and the rule itself becomes a tool you keep."],
        ["Call your own witness: the work already done", "b", { pursuit: 2 }, "You lay the finished pieces on the table, one by one, in the dark. The evidence outweighs the testimony, and the verdict, for once, is yours."]),
    ] },
  { p: "Word arrives flat and final: the path you were counting on is gone for good. Sold, sunk, or sealed, the door is now wall.", choices: [
    { label: "Mourn it one evening, then map the remaining doors", t: "s", out: { pursuit: 1 }, note: "Grief, scheduled and honored. The next morning's map shows three doors you had stopped seeing while staring at the one." },
    { label: "Test the wall: closed for everyone, or just for you", t: "u", out: { pursuit: 2 }, note: "Walls have keepers and keepers have prices. The door is closed to your name, you learn, not your goal, and a borrowed name walks through." } ],
    fail: [
      F("The mourning evening stretches into a mourning week, and the map of remaining doors stays rolled in the corner, judging.",
        ["Unroll it with a witness who will not leave", "s", { pursuit: 1, ease: 1 }, "Company breaks the seal. The map, read aloud to another, sounds less like loss and more like a plan, and the plan starts that night."],
        ["Set the closed door as the new map's first landmark", "u", { pursuit: 1 }, "The wall becomes a fixed point to navigate BY instead of stare at. Triangulating off the loss, the second-best route turns out shorter."]),
      F("The test goes loud: the wall's keeper takes your probing personally, and now the goal has an enemy where it had an obstacle.",
        ["Apologize formally and withdraw beyond their sight", "s", { pursuit: 1 }, "Distance defuses. Out of view, you work the flank in peace, and the keeper, unprovoked, forgets to keep watching."],
        ["Make the enemy useful: study what they guard hardest", "b", { pursuit: 2 }, "Hostility is a map of value. What the keeper defends most fiercely marks the goal's true pressure point, and pressure points can be reached from more than one side."]),
    ] },
  { p: "The goal gets volunteered for daylight: a small public test, before friends and strangers, sooner than you would have chosen.", choices: [
    { label: "Show the honest current state, flaws labeled", t: "s", out: { pursuit: 1 }, note: "Underpromise, demonstrate, annotate. The flaws, named by you first, become evidence of rigor, and two strangers offer exactly the help the flaws need." },
    { label: "Polish one corner to brilliance and show only that", t: "u", out: { pursuit: 2 }, note: "Depth over breadth. The corner shines, the crowd extrapolates generously, and the borrowed confidence funds a real week of work." } ],
    fail: [
      F("The honest demonstration hits an honest failure: the flaw you labeled performs, vividly, in front of everyone.",
        ["Narrate the failure like a tour guide", "s", { pursuit: 1, ease: 1 }, "Composure converts disaster to lecture. The crowd learns why it broke, you learn you can survive it breaking, and both lessons hold."],
        ["Fix it live, hands steady, crowd watching", "b", { pursuit: 2 }, "The repair, performed under eyes, lands. Nothing persuades like recovery, and the test's best result turns out to be the breaking."]),
      F("The polished corner draws a skeptic who asks, loudly, what the rest looks like, and the silence answers before you can.",
        ["Invite the skeptic to inspect privately, no stage", "s", { pursuit: 1 }, "Off-stage, skeptics become consultants. The inspection is brutal and priceless, and the skeptic leaves half-converted, which is the useful half."],
        ["Promise the rest at a named date, publicly", "u", { pursuit: 1 }, "The promise costs sleep and buys structure. The named date, witnessed, pulls the work forward like a towline."]),
    ] },
  { p: "The next stretch names its price plainly: something you keep must be given up to proceed. Comfort, a habit, a standing promise, a thing you love.", choices: [
    { label: "Pay it clean: name it, give it, move", t: "u", out: { pursuit: 2 }, note: "No bargaining, no ceremony. The thing, surrendered whole, stops costing maintenance, and the road past it is smooth with the lack of looking back." },
    { label: "Negotiate the price down before paying", t: "s", out: { pursuit: 1 }, note: "Every toll has a haggling margin. You give half the thing and keep its heart, and the road accepts the discount with only a little grumbling." } ],
    fail: [
      F("Paid clean, the thing leaves a hole shaped exactly like itself, and the hole walks beside you on the new road, conversational.",
        ["Fill it with the work, deliberately, daily", "s", { pursuit: 1, ease: 1 }, "The hole takes the work like soil takes seed. A month on, what grows there belongs to the goal, and the conversation has gone quiet."],
        ["Visit the hole on schedule, then close the visit", "c", { pursuit: 1 }, "Grief with office hours. Honored on schedule, it stops ambushing, and the road hours stay the road's."]),
      F("The negotiation reveals the toll-keeper is you: the price will not lower because part of you set it high on purpose, to have an excuse to stop.",
        ["Name that part out loud and overrule it", "b", { pursuit: 2 }, "Treason discovered is treason ended. The price, exposed as your own handwriting, drops to its honest figure, and you pay it walking."],
        ["Thank it for guarding you, then renegotiate gently", "s", { pursuit: 1 }, "The guard was protecting something real. Given a smaller post to hold, it stands down from the road, and the toll settles itself."]),
    ] },
];
const CHASE2 = [
  { p: "The rumor moves above the streets of {loc}: a courier who takes the rooftops at dusk, ridge to ridge, with the harbor's secrets in a satchel.", choices: [
    { label: "Shadow from the street below, marking descents", t: "s", hint: "the patient road to the truth", note: "Roofs end at ladders. You map every place the courier touches ground, and the last ladder drops into the answer." },
    { label: "Take the rooftops too, one ridge behind", t: "u", hint: "match the route", note: "Slate and nerve. You learn the route by running it, and the route teaches what the destination would have hidden." },
    { label: "Be waiting on the courier's final roof", t: "b", hint: "force it: a bold success never dead-ends", note: "You picked the right roof. The courier, breathless and cornered at their own door, trades the satchel's story for an unblocked ladder." } ],
    fail: [
      F("A gutter gives under your boot and the street arrives faster than planned, with witnesses.",
        ["Bow to the witnesses and limp off grinning", "s", { ease: 1 }, "Comedy covers reconnaissance. The crowd remembers a fool, not a follower, and tomorrow the route is still yours to walk."],
        ["Ask the nearest witness where the roof-runner goes", "u", { rumor: 1 }, "The fall buys sympathy and sympathy talks. Half the street has watched that courier for weeks, and their guesses triangulate."]),
      F("The courier vanishes between two ridges that do not connect, which means a hidden crossing, which means you have been seen and shown a ghost.",
        ["Search the gap at dawn, methodical", "s", { rumor: 1 }, "Daylight finds the plank, the hook, and the worn slate. The crossing, mapped, is yours now too, and crossings carry traffic both ways."],
        ["Leave a note IN the gap: we should talk", "b", { rumor: 1, finding: 1 }, "Audacity by post. The reply, wedged in the same gap two nights later, sets a meeting and includes a token of good faith worth keeping."]),
    ] },
  { p: "A man in {loc} sells answers from a back-corner table: coin on the wood, question in the air, and a reputation for selling the same secret twice.", choices: [
    { label: "Pay full price and verify every word after", t: "s", hint: "trust, then check", note: "His answer checks out at three of four points, and the fourth, chased down, is fresher than what he sold. You bought a map and found the road moved." },
    { label: "Sell HIM something first, set the exchange rate", t: "u", hint: "trade as an equal", note: "Sellers respect sellers. Your morsel buys a discount and the unwatered version, the one without the second buyer's fingerprints on it." },
    { label: "Tell him you know who else he sold it to", t: "b", hint: "force it: a bold success never dead-ends", note: "A bluff with good posture. He pales, assumes exposure, and corrects the record for free, including the part the other buyer paid to have bent." } ],
    fail: [
      F("Your verification knocks on a door the informant invented entirely, and the real occupant has opinions about strangers with questions.",
        ["Apologize and ask the occupant your question anyway", "s", { rumor: 1 }, "Wrong door, right neighborhood. The occupant knows the street's actual business, and resents being used as a fiction enough to share it."],
        ["Return to the informant with the fiction and a flat stare", "u", { rumor: 1 }, "Caught merchants discount. He replaces the invention with the true address and a second answer free, terrified of the refund you did not ask for."]),
      F("Your opening morsel turns out to be something he already owns, and the exchange rate collapses with his interest.",
        ["Offer the story BEHIND your morsel instead", "s", { rumor: 1 }, "Context is the rarer good. The provenance interests him where the fact bored him, and the trade completes at the original rate."],
        ["Buy at full price, dignity intact", "c", { rumor: 1 }, "Sometimes coin is just coin. The answer is real, the markup forgettable, and the informant files you as solvent, which has its own future value."]),
    ] },
  { p: "Festival masks flood {loc} tonight, and the rumor's subject will be among them: one mask in a thousand, moving toward a meeting that thinks itself invisible.", choices: [
    { label: "Watch the edges where masks come off", t: "s", hint: "patience at the margins", note: "Masks come off in doorways and alleys, always. The face you need unmasks at the third doorway, and the doorway itself is half the answer." },
    { label: "Mask up and drift the processions", t: "u", hint: "hide inside the crowd", note: "Anonymous among the anonymous. The crowd's currents carry gossip mask to mask, and one current flows straight through the meeting you wanted." },
    { label: "Wear the SAME mask as the subject", t: "b", hint: "force it: a bold success never dead-ends", note: "Twin masks draw the meeting's go-between to YOU first. You receive the instructions meant for the subject, memorize them, and pass them on only slightly late." } ],
    fail: [
      F("The festival crush separates you from your sightlines, and somewhere in the drums and lamplight the subject becomes every mask at once.",
        ["Climb the fountain rim for one slow sweep", "s", { rumor: 1 }, "Height finds the anomaly: one mask moving with purpose against a thousand moving with joy. The purposeful line gets a heading noted."],
        ["Follow the festival to its quietest corner", "u", { rumor: 1 }, "Meetings hate drums. The quietest corner holds three unmasked faces mid-conference, and one of them is the one."]),
      F("Your borrowed mask marks you to the wrong watcher: festival wardens hunting a cutpurse wearing exactly that face.",
        ["Unmask for the wardens, alibi cheerful", "s", { ease: 1 }, "An honest face ends the matter in a minute. The wardens, apologetic, gossip about who ELSE wears that mask tonight, which was your question all along."],
        ["Run, conspicuously, AWAY from the meeting", "u", { rumor: 1 }, "A decoy of yourself. The wardens chase, the meeting relaxes, and your circling return arrives at an unguarded keyhole."]),
    ] },
  { p: "The rumor pays its bills through a dead drop in {loc}: a loose brick, a hollow post, something that swallows messages at dusk and is empty by dawn.", choices: [
    { label: "Find the drop, read, reseal, watch", t: "s", hint: "the long stakeout", note: "The message, read and replaced, never knows it was naked. Two dusks later you have the writer, the reader, and the rhythm between them." },
    { label: "Leave a message of your own in the drop", t: "u", hint: "join the correspondence", note: "Your note wears the network's grammar. The reply, addressed to a stranger they think they know, answers questions the surveillance never could." },
    { label: "Empty the drop entirely and wait nearby", t: "b", hint: "force it: a bold success never dead-ends", note: "Theft as flushing. The reader arrives, finds nothing, panics beautifully, and runs straight to the writer, drawing the whole line on the map at a sprint." } ],
    fail: [
      F("The brick you loosen is the wrong brick, and the wall's actual owner arrives to find a stranger dismantling their masonry.",
        ["Pay for the mortar and ask about loiterers", "s", { rumor: 1 }, "Repairs buy conversation. The owner has watched dusk visitors finger that wall for a month, and describes them down to the boots."],
        ["Claim YOU are checking the wall for tampering", "u", { rumor: 1 }, "Authority assumed is authority granted. The owner, alarmed, walks you to the brick that IS loose, complaining about the neighborhood the whole way."]),
      F("Your forged note misses a stroke of the network's grammar, and the drop goes silent: burned, and they know someone is reading.",
        ["Watch who comes to confirm the burn", "s", { rumor: 1 }, "Burned drops get inspected. The inspector arrives at dawn with the writer's own walk, and the walk leads home."],
        ["Leave an apology note: a defector seeking contact", "b", { rumor: 1, finding: 1 }, "A lie inside a truth. Curiosity outweighs caution, the meeting is granted, and the token they leave to mark it is itself worth the gamble."]),
    ] },
  { p: "The paper trail runs through one office in {loc}, and the clerk who keeps it has new boots, old debts, and a price somebody already paid.", choices: [
    { label: "Outbid the first briber, quietly", t: "s", hint: "money against money", note: "Clerks auction to the last bidder. Your coin reopens the ledger, and the entries the first payment buried surface intact, with the payer's name attached." },
    { label: "Befriend the clerk's resentment instead", t: "u", hint: "work the grudge", note: "Bought men hate their buyers. You feed the grudge a sympathetic ear, and the grudge feeds back everything the bribe was supposed to seal." },
    { label: "Tell the clerk an audit is coming", t: "b", hint: "force it: a bold success never dead-ends", note: "Fear beats coin. The clerk, choosing survival, corrects the record before your invented auditors arrive, and hands you the original as insurance." } ],
    fail: [
      F("Your counter-bribe lands in front of a witness: the office runner, young, sharp-eyed, and suddenly very interested in everyone's boots.",
        ["Buy the runner's lunch and his silence together", "s", { rumor: 1 }, "Runners are cheap and observant. His silence costs a meal, and his observations, thrown in free, include the first briber's visiting hours."],
        ["Let the runner report it, and follow the report", "u", { rumor: 1 }, "Information flows uphill. The report travels to a back office you could never have named, and the back office's door gets added to the map."]),
      F("The grudge, fed too well, boils over: the clerk decides tonight is the night to confront his buyer, with you as accidental witness-to-be.",
        ["Talk him down to a paper revenge instead", "s", { rumor: 1, ease: 1 }, "Cooler heads copy documents. The confrontation becomes an archive, quietly duplicated, and the duplicate finds its way into your coat."],
        ["Shadow the confrontation from across the street", "b", { rumor: 1, finding: 1 }, "The shouting match names names through an open window. The clerk survives it, barely employed, and the buyer's dropped glove makes a fine exhibit."]),
    ] },
  { p: "The rumor travels under {loc}: the old storm-drains move people and parcels beneath the watch's feet, and tonight something is scheduled to move.", choices: [
    { label: "Map the grates and watch the right one", t: "s", hint: "surface patience", note: "Every tunnel needs air and exits. The grate that whistles at dusk gets traffic by midnight, and the traffic comes up wearing the answer." },
    { label: "Go down and walk the drains yourself", t: "u", hint: "take the low road", note: "Cold water, old echoes. The drains are marked in chalk by their users, and chalk, read by lamplight, is a network diagram." },
    { label: "Block the tunnel and meet what backs up", t: "b", hint: "force it: a bold success never dead-ends", note: "A grate, a crowbar, a bottleneck. The parcel-runners surface at the overflow exactly as planned, blinking, and negotiable in their surprise." } ],
    fail: [
      F("The whistling grate goes silent mid-watch: schedule changed, route changed, somebody upstream got careful.",
        ["Walk the line of grates listening for the new whistle", "s", { rumor: 1 }, "Routes move, physics stays. Three grates east, the dusk whistle resumes, and the new route's first night is its sloppiest."],
        ["Ask the rat-catcher who else asks about drains", "u", { rumor: 1 }, "Professionals of the underground know their colleagues. The rat-catcher names two recent inquirers, and one description fits the rumor like a glove."]),
      F("The low road floods to the knee without warning: a sluice opened somewhere, and the chalk marks are dissolving as you read.",
        ["Memorize the nearest junction and climb out", "s", { ease: 1 }, "One junction, held in the head, beats a soaked map. Dried off, you return to that junction by street, and its grate proves the busy one."],
        ["Push to the next dry ledge and finish reading", "b", { rumor: 1, finding: 1 }, "Wet to the ribs, worth it. The dry ledge holds the network's master marks and a cached oilskin packet someone trusted the dark to keep."]),
    ] },
  { p: "From the bell tower over {loc} you can see every street the rumor uses, and the bell-ringer, ancient and territorial, controls the only stairs.", choices: [
    { label: "Earn the stairs: carry the ringer's coal up daily", t: "s", hint: "service buys the view", note: "Three days of coal buys a permanent welcome. The view, studied at leisure, surrenders the pattern: same cart, same hour, same impossible detour." },
    { label: "Time your watching to the deafening hours", t: "u", hint: "hide inside the noise", note: "Nobody visits during the ringing. Between strikes, half-deaf and unobserved, you chart the street's secret hour in peace." },
    { label: "Ring the bells WRONG at the rumor's hour", t: "b", hint: "force it: a bold success never dead-ends", note: "Thirteen strikes at an eleven-strike hour. The streets below stop and look up, except the ones who scatter, and the scatterers draw their own diagram." } ],
    fail: [
      F("The ringer catches you on the stairs uninvited, and her broom has the reach and conviction of a boarding pike.",
        ["Retreat and return with honest tribute", "s", { rumor: 1 }, "Pride salved is access granted. The tribute opens the stairs, and her forty years of watching that street come free with the climb."],
        ["Take the sweeping and plead the cause from the steps", "u", { rumor: 1 }, "Persistence under broom-fire. She relents at the third bruise, names you a fool, and fools, in her economy, get told what the tower has seen."]),
      F("The deafening hour deafens you more than planned, and you descend having watched everything and heard the one shout that mattered not at all.",
        ["Find who shouted and ask them directly", "s", { rumor: 1 }, "The shouter, a porter, repeats it gladly: the warning he yelled, who he yelled it for, and why the cart bolted."],
        ["Read the street's reaction instead: who moved, who froze", "u", { rumor: 1 }, "Deafness sharpens eyes. The freeze-and-scatter pattern, replayed in memory, sorts the street into innocent and involved without a word."]),
    ] },
  { p: "Your best source in {loc} is selling you to the other side: the warmth is real, the information is curated, and tonight you finally see the second paymaster's shadow.", choices: [
    { label: "Keep the source, feed them marked goods", t: "s", hint: "turn the leak into a tap", note: "Each curated lie you accept marks its path. The marked goods surface across the harbor in a pattern, and the pattern signs the second paymaster's name." },
    { label: "Confront them privately, terms on the table", t: "u", hint: "renegotiate the loyalty", note: "Cornered doubles choose comfort. You offer better terms and worse consequences, and the source flips back with the other side's question list as dowry." },
    { label: "Let them catch YOU meeting their paymaster", t: "b", hint: "force it: a bold success never dead-ends", note: "Staged betrayal, mirrored. The source, panicked at being squeezed from both ends, confesses everything to the side that got there first: yours." } ],
    fail: [
      F("The marked goods come back too fast: the source tested YOU with bait of their own, and both of you are now standing in the open.",
        ["Laugh, lay your cards down, propose honesty", "s", { rumor: 1 }, "Two professionals, mutually caught. The truce that follows trades real information for the first time, and real beats curated."],
        ["Burn the channel and watch who mourns it", "u", { rumor: 1 }, "Dead channels have funerals. The second paymaster's man comes sniffing at the silence inside two days, and sniffing, gets seen."]),
      F("The private confrontation is anticipated: the source arrives with a protector in the shadows and a speech already rehearsed.",
        ["Address the shadow directly, ignore the speech", "b", { rumor: 1, finding: 1 }, "The protector, named and greeted, steps into the lamplight off-script. The improvisation that follows leaks more than the speech concealed, and a dropped matchbook seals it."],
        ["Hear the speech fully, applaud, leave", "s", { ease: 1 }, "Rehearsed lies are inventories of fear. The speech, memorized, lists everything they hoped you did not know, which is a list of what matters."]),
    ] },
  { p: "The whisper names a meeting in {loc} at moonrise, but the naming was too easy: this one smells like bait, and bait means somebody is fishing for you.", choices: [
    { label: "Watch the watchers watching the bait", t: "s", hint: "fish for the fishermen", note: "Every trap needs eyes. You find them on a balcony, bored and obvious, and follow them home after the meeting nobody attends." },
    { label: "Send a paid stranger in your place", t: "u", hint: "spring it by proxy", note: "Your proxy walks in green and walks out rattled, but the questions they were asked, recited over a paid drink, tell you exactly what the fishermen do not yet know." },
    { label: "Attend, but arrive an hour early and rearrange it", t: "b", hint: "force it: a bold success never dead-ends", note: "You take the trap's best seat before the trappers do. When they arrive to find you pouring their wine, the conversation that follows is honest out of sheer disorientation." } ],
    fail: [
      F("The balcony eyes have eyes: a second watcher, set to watch the first, has been studying your studying all evening.",
        ["Wave to the second watcher and walk away clean", "s", { ease: 1 }, "Acknowledged surveillance is dead surveillance. The wave costs them the night's whole architecture, and rebuilt traps are always sloppier."],
        ["Follow the SECOND watcher home instead", "u", { rumor: 1 }, "The hierarchy reads upward. The second watcher reports to a door the first never visits, and senior doors are the ones worth knowing."]),
      F("Your proxy gets greedy mid-performance, improvises demands in your name, and the fishermen now believe absurd things about your appetite.",
        ["Let the absurd reputation stand and use it", "b", { rumor: 1, finding: 1 }, "A monstrous reputation is a kind of armor. Their next approach comes overloaded with tribute and respect, and the tribute includes paper."],
        ["Send a correction through a second proxy", "s", { rumor: 1 }, "Diplomatic repair. The correction, delivered dry, persuades them they face a careful operator, and careful operators get offered terms instead of traps."]),
    ] },
  { p: "The rumor's courier crosses {loc} only at peak market, dissolving into the densest crowd in the harbor with the ease of long practice.", choices: [
    { label: "Stake out the crowd's fixed banks: stalls, posts, fountains", t: "s", hint: "let the river pass the rock", note: "Crowds flow, landmarks anchor. The courier eddies past the fish fountain at the same minute daily, and minutes, accumulated, become a route." },
    { label: "Hire the market urchins as a net of eyes", t: "u", hint: "many small watchers", note: "Six urchins, one copper each, full coverage. Their relayed sightings, shouted in code over the stalls, hand you the courier's vanish point by noon." },
    { label: "Cause a crowd-stopping spectacle at the choke point", t: "b", hint: "force it: a bold success never dead-ends", note: "A toppled fruit cart, a spooked goat, theater. The crowd clots, the courier alone keeps moving against the curdle, and moving alone is as good as a torch." } ],
    fail: [
      F("Peak market peaks harder than usual: a festival barge has landed, and the crowd thickens past even fixed-landmark visibility.",
        ["Climb to the awning lines and watch from above", "s", { rumor: 1 }, "Two feet of height beats two hundred shoulders. From the awning frame the crowd becomes currents, and one current swims wrong."],
        ["Listen instead: track the courier's market-cries wake", "u", { rumor: 1 }, "Vendors greet regulars by name. The greeting-wake of one name moves through the din west to east, and the name is new to you and worth keeping."]),
      F("Your urchin net unionizes mid-operation: the eldest demands triple, holding your courier sighting hostage with a grin.",
        ["Pay triple, tip double, hire them weekly", "s", { rumor: 1 }, "Expensive eyes are still cheap. The network, retained, delivers the courier AND the courier's handler by week's end, profitable at any markup."],
        ["Counter: a story they can sell other clients", "u", { rumor: 1 }, "Urchins trade in tales. Your morsel balances the books, the sighting unlocks, and the eldest, impressed by the haggle, throws in tomorrow's prediction free."]),
    ] },
  { p: "The trail ends at a warehouse in {loc} that breathes at night: lamplight under doors, cart-springs at odd hours, and a padlock polished by frequent hands.", choices: [
    { label: "Log the breathing: lights, carts, hours, faces", t: "s", hint: "the ledger of patience", note: "Four nights of notes assemble the operation's pulse. The fifth night you predict the cart to the minute, and prediction is proof enough to act on." },
    { label: "Get hired onto the night crew", t: "u", hint: "walk in wearing wages", note: "Strong backs skip interviews. Inside, the crates are labeled in two languages, and the second one is doing all the lying." },
    { label: "Knock on the breathing door at midnight", t: "b", hint: "force it: a bold success never dead-ends", note: "The knock nobody plans for. The door cracks on a foreman mid-shift, too startled to lie smoothly, and his bad improvisation inventories the whole floor." } ],
    fail: [
      F("Night three of the stakeout, and a watchman's lantern finds your logging post with you still on it.",
        ["Play the drunk who lost his way to the docks", "s", { ease: 1 }, "The oldest costume. The watchman steers you off with directions and complaints, and his complaints describe the warehouse schedule better than your notes did."],
        ["Recruit the watchman: he is paid to watch too", "u", { rumor: 1 }, "Colleagues, technically. He cannot be bought but he can be bored, and bored men narrate: who pays him, what he ignores, and the night he was told to take off."]),
      F("The night crew forewoman reads your soft hands at a glance, and the hiring line becomes a question line with your name in it.",
        ["Show the one honest callus and tell its true story", "s", { rumor: 1 }, "One true thing buys passage. She hires you for the story more than the back, and stories get traded all shift in both directions."],
        ["Withdraw and hire the man she DID take, after", "u", { rumor: 1 }, "Wages buy testimony. Your proxy laborer, debriefed over supper, recites the crates, the second language, and the foreman's nerves."]),
    ] },
  { p: "The rumor shelters in the drowned-saints chapel of {loc}: whoever carries it has claimed sanctuary, and the chapel's keeper enforces the old law with a gaze like ballast.", choices: [
    { label: "Respect the law: wait, observe, attend the services", t: "s", hint: "patience at the threshold", note: "Sanctuary feeds on offerings, and offerings have carriers. Three services map the supply line, and the supply line knows everything the sheltered one does." },
    { label: "Approach the keeper with honest purpose", t: "u", hint: "petition the gatekeeper", note: "The keeper weighs you a long moment, then sets terms: questions through her, answers if the sheltered one wills it. The willed answers, vetted by ballast, arrive true." },
    { label: "Claim sanctuary yourself, take the next cot", t: "b", hint: "force it: a bold success never dead-ends", note: "The law shelters all comers. Two cots apart, two hunted souls trade stories by rule of the roof, and the rumor tells itself to its neighbor." } ],
    fail: [
      F("Your service attendance is too attentive: the congregation marks the stranger who watches doors more than altars.",
        ["Confess the watching to the keeper, plainly", "s", { rumor: 1 }, "Honesty at the altar rail. The keeper, unsurprised, trades your candor for a single message carried in, and the reply carried out."],
        ["Become genuinely useful: repair the leaking roof", "u", { rumor: 1, ease: 1 }, "Sanctuaries need shingles. A day of honest work converts suspicion to welcome, and welcome sits you at the supper where the sheltered one talks."]),
      F("The keeper's terms collapse when the sheltered one, glimpsing you through the screen, panics: they know your face, or think they do.",
        ["Send in your true name and business, written", "s", { rumor: 1 }, "Paper through the screen. The panic, addressed by fact, resolves into a mistaken identity and an apologetic, talkative correction."],
        ["Leave entirely and let calm return before retry", "c", { rumor: 1 }, "Pressure released. A week later the keeper sends word herself: the sheltered one will talk, on the condition that it was you who walked away."]),
    ] },
  { p: "The fleet sails from {loc} on the dawn tide and the rumor sails with it: whatever you need is aboard one of nine hulls, and the dawn is six hours out.", choices: [
    { label: "Work the provisioners: what loaded where, tonight", t: "s", hint: "read the cargo backward", note: "Lading lists outlive secrecy. The provisioner's chalkboard, cross-checked against gossip, narrows nine hulls to one, and one hull has a name you know." },
    { label: "Crew aboard the likeliest hull for one leg", t: "u", hint: "sail with the secret", note: "Six hours is enough to sign articles. One leg out and back as deck muscle, and the fo'c'sle talk on night watch hands you the cargo's story whole." },
    { label: "Delay the tide: foul the harbor chain, briefly", t: "b", hint: "force it: a bold success never dead-ends", note: "One snagged chain, one furious hour, nine captains ashore demanding answers. In the shouting, manifests get waved like weapons, and waved paper can be read." } ],
    fail: [
      F("The provisioner's chalkboard was wiped an hour ago, deliberately, and the wiper's rag is still wet on the counter.",
        ["Find who ordered the wipe, follow the nervousness", "s", { rumor: 1 }, "Erasure is its own ink. The order came from a purser ashore past his leave, and his hurry back to the boats points like a finger."],
        ["Reconstruct it from the dock-porters' backs", "u", { rumor: 1 }, "Porters remember weight if not words. Their aching shoulders inventory the night's loads hull by hull, and one hull took crates that needed four men and silence."]),
      F("Articles signed, you discover the likeliest hull is the fleet's flogging-happy hard-luck berth, and the leg out is brutal.",
        ["Endure it, ears open, hands busy", "s", { rumor: 1, ease: 1 }, "Misery loves witnesses. The crew's grievances spill nightly, and inside the complaints sits the cargo, its owner, and its destination, resented in detail."],
        ["Jump ship at the first anchorage with what you have", "u", { rumor: 1 }, "Half a voyage, whole answer. The first anchorage is itself the rendezvous, you realize from the rail, and watching it from shore completes the picture."]),
    ] },
  { p: "Somewhere in {loc} the hunt inverts: the rumor's keepers are now asking about YOU, by description, a street behind and closing.", choices: [
    { label: "Slow down and study your pursuers from cover", t: "s", hint: "hunt the hunters", note: "Pursuit reveals the pursuer. Their questions, collected from the people they asked, map what they fear you know, which maps what is true." },
    { label: "Lay a false trail to a meeting of your choosing", t: "u", hint: "choose the ground", note: "Breadcrumbs with intent. They arrive at YOUR chosen ground, off-balance and visible, and the parley that follows runs on your terms." },
    { label: "Turn around and walk straight at them", t: "b", hint: "force it: a bold success never dead-ends", note: "Predators understand approach. The walk-up so disorders their script that the lead pursuer defaults to honesty, and honesty was the whole prize." } ],
    fail: [
      F("Your cover is a shop with one exit, and the pursuers, methodical, are working the street door to door toward it.",
        ["Buy the shopkeeper's apron and serve them", "s", { rumor: 1 }, "The best hiding is helping. You sell your own pursuers tobacco, overhear their muttered briefing, and wish them luck finding you."],
        ["Out the back window, leave a listening gift", "u", { rumor: 1 }, "A coin to the shop boy buys the replay. Their questions, recited verbatim after, include a name they should not know, and now you know they know it."]),
      F("The false trail works too well: they arrive at your chosen ground angry, numerous, and convinced you are the threat the rumor warned THEM about.",
        ["De-escalate: weapons down, questions traded one for one", "s", { rumor: 1 }, "The exchange, rationed and even, dissolves the misunderstanding. Both sides were hunting the same third party, and pooling notes names it."],
        ["Lean into the legend they built and set terms", "b", { rumor: 1, finding: 1 }, "If they insist you are dangerous, be expensively dangerous. The terms they accept include tribute, truce, and a token of the third party's trail."]),
    ] },
];

const EXPANSION = { docks: DOCKS2, gather: GATHER2, tavern: TAVERN2, train: TRAIN2, pursuit: PURSUIT2 };
for (const a of ACTIONS) if (EXPANSION[a.id]) a.deck.push(...EXPANSION[a.id]);
CHASE_DECK.push(...CHASE2);

export const FAIL_LINES = [
  "It slips through your fingers, this time.",
  "Wrong door, wrong hour, wrong face.",
  "The trail goes cold under you.",
  "Close. The kind of close that stings.",
];

export function drawCard(action, seenIds = [], seed = null) {
  const deck = action.deck;
  const fresh = deck.filter((_, i) => !seenIds.includes(`${action.id}${i}`));
  const use = fresh.length ? fresh : deck;
  const roll = seed === null ? Math.random() : mulberry(seed)();
  const i = Math.floor(roll * use.length);
  const idx = deck.indexOf(use[i]);
  return { card: deck[idx], cardId: `${action.id}${idx}` };
}

// ===========================================================================
// THE DELVES: six ventures. Each room is a branching encounter tree.
// Node keys: "" root, then the path of FAILED choice indices ("0","1","01"...).
// Levels 1-3 branch fully. Levels 4-5 converge into last-stand prompts.
// A fifth failed attempt in any room ends the delve and the dark keeps the haul.
// ===========================================================================
const N = (p, a, b) => ({ p, choices: [a, b].map(([label, t, out, note]) => ({ label, t, out, note })) });
const BS = (p, u, b) => ({ p, choices: [
  { label: u[0], t: "u", out: { hit: 1 }, note: u[1] },
  { label: b[0], t: "b", out: { hit: 2 }, note: b[1] },
] });

export const DELVE_TEMPLATES = [
  { id: "carrack", name: "Bloated Carrack", faction: "Faithless", len: 5,
    boss: "Bloated Warden", blurb: "A treasure galleon rotting on the reef shelf, hold full of pay chests and powder. Her drowned quartermaster still walks his rounds, and he has kept every thief he ever caught." },
  { id: "vault", name: "Drowned Vault", faction: "Sunken", len: 5,
    boss: "Rasp the Tidewight", blurb: "A pre-Fall bank, flooded with its riches still inside. The dead head clerk, Rasp, audits everything that enters. It collects keys, names, and trespassers." },
  { id: "warren", name: "Cult Warren", faction: "Faithful", len: 6,
    boss: "Chorus-Maw", blurb: "Kraken-cult tunnels under the shrine district. At the bottom sits a grown thing with a hundred stolen mouths, singing one note to wake something in the deep. The Faithful want it dead before the song ends." },
  { id: "orchard", name: "Sunken Orchard", faction: "Boughs", len: 4,
    boss: "Old Root-Jaw", blurb: "A drowned grove of the World Tree, still bearing golden fruit. Its last guardian, a giant of root and jawbone, kills anyone who comes near the sapling at its heart." },
  { id: "skylift", name: "Fallen Skylift", faction: "Fliers", len: 5,
    boss: "Rust Choir", blurb: "An airdock that crashed into the sea almost intact. Its salvage machines fused together over the years into one huge thing that sings static and defends the wreck." },
  { id: "chapel", name: "Bell-Drowned Chapel", faction: "Sunken", len: 5,
    boss: "Vesper, Who Rings", blurb: "A chapel that sank mid-service with the congregation inside. The dead sexton, Vesper, has rung the bell ever since. The pattern it rings is a countdown, and it is nearly done." },
];
export const DELVE_BY_ID = Object.fromEntries(DELVE_TEMPLATES.map((d) => [d.id, d]));

export const DELVE_TREES = {
  // =========================================================================
  carrack: {
    rooms: [
      { name: "Barnacle Gate", nodes: {
        "": N("Reef rock has bitten a hole in the carrack's side, and the swell breathes in and out of it. Cargo nets hang in the gap, still half loaded with crates.",
          ["Cut down the nets within reach", "s", { supplies: 1 }, "Salt pork in wax, coiled rope, an officer's chest. Quick work, and the ship never notices you."],
          ["Ride the swell deeper inside", "u", { supplies: 2 }, "The water carries you through the gap like cargo. You come out with both arms full."]),
        "0": N("Your blade slips and the cut net dumps its crates into the surf, loud as cannon fire. Crabs boil out of the gap to investigate the noise.",
          ["Wait dead still until they settle", "s", { supplies: 1 }, "The crabs lose interest and drain back inside. You salvage what the surf did not smash, quietly this time."],
          ["Snatch crates from under them", "b", { supplies: 2 }, "You grab faster than they pinch. Two whole crates, and only a few new scars on your boots."]),
        "1": N("The swell slams you against the hull instead of through it, and now it is sucking you toward the gap on its own schedule, not yours.",
          ["Swim hard for the rocks and reset", "s", { supplies: 1 }, "You break free, catch your breath on the reef, and pick the next wave properly. It carries you in clean."],
          ["Stop fighting and shoot the gap", "b", { supplies: 2, clue: 1 }, "You let the sea throw you. It throws you into the hold, into a crate stack, and onto a shipping ledger someone hid there."]),
        "00": N("The crabs have decided you are food and are forming a line between you and the nets. Hundreds of them, claws up.",
          ["Lure them aside with the spilled pork", "s", { supplies: 1 }, "They swarm the bait. You strip the nets behind their backs and leave them to their feast."],
          ["Smash through the line", "u", { supplies: 2 }, "Boots and blade clear a path. The crabs remember you now, but you have the crates."]),
        "01": N("A snatched crate splits open in your hands: powder, soaked and useless, now dusting the water around you. The crabs hate the taste and they blame you.",
          ["Back out and circle to the far nets", "s", { supplies: 1 }, "The far nets hang over deeper water and the crabs will not follow. Slower haul, safe haul."],
          ["Push through the angry swarm", "u", { supplies: 2 }, "You pay a toll in pinches and take the best crates anyway."]),
        "10": N("You misjudge the rocks. The reef tears your sleeve and a line of blood threads the water, and the gap ahead suddenly looks much less empty.",
          ["Bind the cut and take the high route", "c", { supplies: 1 }, "You climb above the waterline and walk in along the broken deck instead. Drier, slower, safer."],
          ["Get inside before anything follows the blood", "u", { supplies: 2 }, "You beat whatever was coming. The hold is yours long enough to fill your bag."]),
        "11": N("The sea throws you, but it throws you short. You are wedged in the bitten hull planks with the next swell already building behind you.",
          ["Work loose and climb the rest", "s", { supplies: 1 }, "Plank by plank you pull yourself through before the wave lands. Bruised, inside, and alive."],
          ["Let the next wave punch you through", "b", { supplies: 2 }, "It hurts exactly as much as it sounds, and it works. You land in the hold among scattered cargo."]),
        "L4": N("Half the nets are in the surf, the crabs are massed, and the swell is rising. One more mistake here and this gate becomes a grave.",
          ["Take only what is certain", "c", { supplies: 1 }, "You grab the nearest intact crate and get out. Not the haul you wanted. A haul."],
          ["One fast grab at the big chest", "u", { supplies: 2, resolve: 1 }, "In, hands on the officer's chest, out, all in one breath. The gate slams shut behind you in spray."]),
        "L5": N("The tide has turned and the gap is closing to a churn of foam and broken wood. Last chance. After this, the sea keeps everything.",
          ["Dive once, take anything, get out", "u", { supplies: 2, resolve: 1 }, "One breath, one crate, one exit. You make it out as the gate chews itself shut behind you."],
          ["Gamble everything on the chest", "b", { supplies: 2, resolve: 1, clue: 1 }, "You come out riding the foam with the chest in both arms and a manifest page between your teeth."]),
      } },
      { name: "Tilted Gundeck", nodes: {
        "": N("The gundeck lies at a hard tilt, cannons straining against rotted lashings. Dry powder kegs sit racked on the high side, and crab shells crunch under every step.",
          ["Cross the high side, slow and quiet", "s", { supplies: 1 }, "You reach the racks without waking the deck. Two kegs of dry powder, worth real coin ashore."],
          ["Cut a cannon free for its bronze", "b", { supplies: 2, clue: 1 }, "The gun tears loose and rides the tilt through the floor. In the wreckage below: a strongbox no manifest ever listed."]),
        "0": N("A plank gives under your boot with a crack that rolls the length of the deck. Below you, something heavy stops moving, then starts again, closer.",
          ["Freeze on the beams until it passes", "c", { supplies: 1 }, "The dragging fades aft. You finish the crossing on the beam tops and take the powder unbothered."],
          ["Rush the racks before it arrives", "u", { supplies: 2 }, "You reach the kegs at a run and have them roped before the dragging reaches the stair. It never climbs."]),
        "1": N("Your cut lashing whips free and the cannon swings instead of falling, sweeping the deck like a pendulum and smashing the rack nearest you.",
          ["Duck the swing and grab loose kegs", "s", { supplies: 1 }, "You time the arc and gather what the smashed rack spilled. The cannon keeps swinging behind you, furious and harmless."],
          ["Ride the cannon down through the floor", "b", { supplies: 2, clue: 1 }, "You drop with the gun when the lashing finally snaps. The hidden strongbox is right where the hole opens."]),
        "00": N("Crabs pour from the cannon mouths, dozens from each barrel, woken by your noise. The path to the powder is now a moving carpet of claws.",
          ["Cross above them on the gun barrels", "u", { supplies: 1, resolve: 1 }, "Barrel to barrel, over the swarm. You take the powder off the rack from above like fruit off a branch."],
          ["Kick through and grab fast", "b", { supplies: 2 }, "Your boots take a beating and your bag takes two kegs. Even trade."]),
        "01": N("Whatever drags below has reached the stairwell. A barnacled arm the size of a mast feels along the steps. It has not found you. Yet.",
          ["Hold position until the arm withdraws", "c", { supplies: 1 }, "The arm sweeps twice and retreats. You finish your work in the silence it leaves and learn its rhythm for later."],
          ["Work the far racks while it searches", "u", { supplies: 2 }, "You strip the racks at the deck's far end while the stairwell creaks behind you. It never thinks to look up."]),
        "10": N("The swinging gun clips a powder rack. Kegs roll loose down the tilt, leaking black grain in fans across the wet planking.",
          ["Chase the rolling kegs", "s", { supplies: 1 }, "You corner two against a gun carriage before they reach the water. The rest are the sea's now."],
          ["Abandon the kegs, force the deck locker", "u", { supplies: 1, finding: 1 }, "Inside the locker: the gunner's pay and the gunner's letters. The letters describe the cargo the crew refused to fire on."]),
        "11": N("The cannon hole drops you short, into the orlop, in the dark, beside the strongbox and beside something that smells like a flooded grave.",
          ["Take the box and climb, no light", "u", { supplies: 2, clue: 1 }, "You haul the box up the broken framing in pure dark, by feel, and nothing follows. The box is heavy with paper and coin."],
          ["Strike a light and look first", "b", { supplies: 2, clue: 1, finding: 1 }, "The light shows the box, a dead smuggler, and the chart case the smuggler died holding. You take all three discoveries up with you."]),
        "L4": N("The deck is wrecked, half the powder is wet, and the dragging below has stopped pretending not to hunt you. Footing and time are both nearly gone.",
          ["Secure one keg and retreat", "c", { supplies: 1 }, "One dry keg, roped and carried out. The deck groans goodbye behind you."],
          ["Last sweep of the smashed racks", "u", { supplies: 2, resolve: 1 }, "You find two intact kegs under the wreckage and a gunner's flask of pre-Fall brandy beside them."]),
        "L5": N("The gundeck is failing. Planks shear away into the hold one by one, and the water below is not empty. Whatever you leave with, you leave with now.",
          ["Grab and go, anything in reach", "u", { supplies: 2, resolve: 1 }, "An armload of powder and brass, and out through the gunport as the deck folds behind you."],
          ["Dive for the strongbox as the floor goes", "b", { supplies: 2, resolve: 1, clue: 1 }, "You ride the collapse, land beside the box, and swim it out through the breach. The carrack keeps the rest."]),
      } },
      { name: "Purser's Cage", nodes: {
        "": N("Down in the hold, the purser's cage still stands, bars green with age. The purser is at his desk, drowned and patient, and the pay chests are stacked behind him.",
          ["Pick the lock with respect", "u", { supplies: 1, resolve: 1 }, "The lock surrenders politely. You take the chests and leave the purser to his work. He does not object."],
          ["Bend the soft old bars", "b", { supplies: 2, resolve: 1 }, "The bars give with a shriek. You take everything that fits and do not look at the desk on the way out."]),
        "0": N("Your pick snaps in the lock, and the purser's head turns toward the sound. Slow. Deliberate. His ledger hand keeps writing.",
          ["Back off and try the roof plate", "s", { supplies: 1, resolve: 1 }, "The cage roof is thinner than the bars. You peel a corner and fish the nearest chest out from above."],
          ["Hold his gaze and finish the lock", "b", { resolve: 2, clue: 1 }, "You work the broken pick under his stare and the lock opens. He nods once and returns to the ledger. The ledger is worth reading."]),
        "1": N("The bent bar snaps with a crack like a spar breaking and the purser stands up. He is taller than the cage. He was always taller than the cage.",
          ["Retreat and let him settle", "c", { supplies: 1 }, "He sits back down once you give ground. You take the loose coin scattered outside the cage and call it rent."],
          ["Dart in under his arm", "u", { supplies: 2, resolve: 1 }, "You are inside, loaded, and out between his reaching hands before he finishes standing all the way up."]),
        "00": N("From above, you can see the cage roof is patched with a newer plate, riveted from inside. Someone repaired this cage. Recently. From inside.",
          ["Pry the new plate anyway, slow", "u", { supplies: 1, resolve: 1, clue: 1 }, "The plate lifts on the repairer's hidden cache: pay chest, dry letters, and a list of crew who never officially existed."],
          ["Leave the plate, take the visible chest", "s", { supplies: 1, resolve: 1 }, "The old corner gives and the nearest chest comes up on your rope, fair and simple."]),
        "01": N("Under his stare your hands cramp and the broken pick jams the mechanism solid. The purser dips his pen, writes a fresh line, and turns the ledger to face you.",
          ["Read the line he offers", "c", { resolve: 1, finding: 1 }, "The line names the cargo the crew died refusing to carry. You copy it and bow. The lock clicks open by itself."],
          ["Smash the jammed lock entirely", "b", { supplies: 2, resolve: 1 }, "The lock dies, the door swings, and the purser sighs like a man whose shift just got longer. The chests are yours."]),
        "10": N("Outside the cage, the loose coin trail leads aft toward the orlop, freshly scattered. Someone robbed this cage before you and dropped money doing it.",
          ["Follow the coin trail", "u", { supplies: 1, clue: 1 }, "The trail ends at a dead thief and a full satchel. Whatever stopped him did not want the money. You do."],
          ["Ignore it, work the cage corner", "s", { supplies: 1, resolve: 1 }, "Patience finds the cage's weak rivet line. One chest slides out through the gap a thief would have missed."]),
        "11": N("His hand closes on your pack strap as you clear the door. The strap holds. He holds. The drowned do not tire, and your boots are losing the argument.",
          ["Cut the strap, lose some haul, live", "s", { supplies: 1 }, "Half your take stays in his fist. The other half leaves with you, which is the half that matters."],
          ["Twist and break his grip", "b", { supplies: 2, resolve: 1 }, "You wrench free with everything still on your back. Behind you he examines his empty hand like a puzzle."]),
        "L4": N("The cage is wrecked, the purser is up and walking his counter line, and every pass brings him nearer your corner of the hold. Two chests remain in reach.",
          ["Take one chest between his passes", "c", { supplies: 1, resolve: 1 }, "Thirty heartbeats of safety per circuit, you counted. One chest out, clean, on the count."],
          ["Both chests, one sprint", "u", { supplies: 2, resolve: 1 }, "You cross his line with a chest under each arm and his fingers brushing your collar. Worth it."]),
        "L5": N("The purser stands between you and the stair now, ledger closed, pen down. His shift, it seems, has ended. This is your last attempt before the hold keeps you both.",
          ["Trade him your coin pouch for passage", "u", { resolve: 2, clue: 1 }, "He weighs your pouch, enters it in the ledger, and steps aside. The receipt he hands you names his employer. That name matters."],
          ["Go through him", "b", { supplies: 2, resolve: 2 }, "You hit him low where the rot is worst and he comes apart against the bulkhead. The stair is clear, your arms are full, and the hold is silent at last."]),
      } },
      { name: "Bilge Dark", nodes: {
        "": N("Bilge water at the keel, black and still since the sinking. Your lantern reaches an arm's length. Below the surface, coins carpet the bottom, more than you can carry.",
          ["Rake coin to you from the ledge", "u", { supplies: 3 }, "Cold, clinking, endless. You rake until your bag complains, and the black water never ripples past your rake. Not once."],
          ["Wade for the chest you can half-see", "b", { resolve: 2, supplies: 1, clue: 1 }, "Waist-deep, you lift it free. Something under the coins shifts to release it, politely, and you do not stay to say thanks."]),
        "0": N("Your rake snags on something that is not coin and the something pulls back. The rake is gone. Ripples spread where ripples should not.",
          ["Retreat to the stair, fish with a line", "c", { supplies: 2 }, "Hook and line from the dry steps. Slower than the rake, and nothing pulls back on a hook it cannot see coming."],
          ["Grab coin by hand at the edge", "u", { supplies: 2, resolve: 1 }, "Fistfuls from the shallow rim, fast, eyes on the ripples. The ripples watch you back and keep their distance."]),
        "1": N("Halfway to the chest, the bilge rises an inch. Nothing fell in. Nothing surfaced. The water simply has more in it now than it did.",
          ["Back out the way you came, slow", "s", { supplies: 2 }, "Step by step backward, scooping coin as you go. The level drops behind you like a held breath released."],
          ["Lunge the last yards to the chest", "b", { resolve: 2, supplies: 1, clue: 1 }, "Your hands close on the chest as the water closes on your shoulders. You haul both yourself and it back out in one furious pull."]),
        "00": N("Your line comes back cut. Not snapped. Cut, clean, and tied to the hook is a single coin older than the ship.",
          ["Take the offered coin and keep to the rim", "s", { supplies: 2, finding: 1 }, "You pocket the old coin and work the shallows only. The coin is pre-Fall mint, and the mint mark belongs to no kingdom on any chart."],
          ["Lower your lantern on the line instead", "u", { supplies: 2, clue: 1 }, "The sunken light shows the bottom for one breath: coins, the chest, and a wide ring of cleared floor around something best left unlit. You map the safe path."]),
        "01": N("Cold fingers close on your wrist under the surface. Not pulling. Holding. Counting, maybe, the way a clerk holds a coin.",
          ["Open your fist and let the coins go", "c", { supplies: 1, resolve: 1 }, "The grip releases the instant your hand empties. A toll, then. You pay it once and rake the rim unbothered after."],
          ["Wrench free with the handful", "b", { supplies: 2, resolve: 1 }, "You rip your arm back, coins and all. The water goes very still, the way a room goes still after an insult."]),
        "10": N("Your slow retreat puts your heel on something round that rolls. You go down to one knee in black water, lantern hissing, light halved.",
          ["Stand carefully, save the lantern", "s", { supplies: 1, resolve: 1 }, "You rise by inches with the flame alive. Half light is enough light when you respect it."],
          ["Snatch coin while you are down there", "u", { supplies: 2, resolve: 1 }, "Already kneeling, already wet. Both hands fill before you stand, and your knee finds the thing it rolled on: a sextant, solid gold."]),
        "11": N("The chest comes free but its rotted bottom does not, and the bilge swallows the spill with a sound like a long drink. The water level rises past your ribs.",
          ["Drop everything and swim for the stair", "s", { resolve: 2 }, "You make the steps as the water peaks. It recedes sulking, and the stair landing holds what floated free: documents in a wax wrap."],
          ["Dive into the spill after the gold", "b", { supplies: 3, resolve: 1 }, "Down into the dark on one breath, grabbing blind. You surface with full fists and the distinct feeling of having been allowed."]),
        "L4": N("The bilge is awake now. The level breathes up and down, the cleared ring on the bottom is wider, and your lantern is burning its last finger of oil.",
          ["Work the rim by feel, light out", "c", { supplies: 2 }, "Darkness is honest down here. Your hands learn the coin from the not-coin, and the not-coin lets them."],
          ["One dive at the chest's remains", "u", { supplies: 2, resolve: 1, clue: 1 }, "You find the chest's iron band and the packet bolted under it. Whoever hid it knew the bilge would guard it."]),
        "L5": N("Water at your chest and climbing, stair behind you, dark ahead. The bilge has decided to keep someone tonight, and it is taking applications.",
          ["Take a last double handful and climb", "u", { supplies: 2, resolve: 1 }, "Two fists of cold gold and up the stair as the bilge slaps the step behind your heel. Close enough to feel. Not close enough to matter."],
          ["Dive the cleared ring itself", "b", { resolve: 2, supplies: 1, finding: 1 }, "You touch the bottom of the ring and the thing that lives there lets you take one object from its hoard: a captain's seal, and the captain it belonged to never existed on any registry."]),
      } },
    ],
    boss: {
      stages: [
        BS("Hold water parts without a wake and the Bloated Warden rises: a drowned quartermaster swollen to three men's size, crabs living in him like a barracks. He raises a lantern that does not burn and waits for you to explain yourself.",
          ["Strike from behind the cargo stacks", "Your blade bites deep before he knows the fight has started. Crabs pour from the wound like a garrison answering bells."],
          ["Charge him head-on, blade first", "You hit him at a full run and drive him back a step. The first step he has given in a hundred years."]),
        BS("Wounded, the Warden goes to work. He swings a muster-chain heavy with crew tags, each arc fast enough to stave in a boat, and his rounds now have one purpose: you.",
          ["Slip the chain and cut at his knees", "You duck the arc and open the rot behind his knee. He buckles, catches himself on a beam, and the beam cracks."],
          ["Step inside the swing and gut him", "Inside the chain's reach there is only him and you. Your blade goes in to the guard and black water pours out like docked pay."]),
        BS("Half broken open and leaking his crabs, the Warden plants the dead lantern like a standard and sets his back to the pay chests. He will not yield the hold. He never once did.",
          ["Wear him down, trade nothing", "You circle, cut, and circle. Pieces of him litter the hold and still he stands his post, slower every pass."],
          ["Kick the lantern out from under him", "The lantern skitters away and he lunges after it on instinct. Your blade meets him mid-lunge, twice."]),
        BS("On ruined legs the Warden drags himself upright one last time, chain wrapped tight around his fist, and beckons. One of you ends here, and he has all the time the drowned ever have.",
          ["Finish it clean, eyes open", "One measured blow where the rot is deepest. He comes apart still standing, still at his post, and the hold finally exhales."],
          ["Meet his last swing with everything", "Chain and blade collide and the blade wins. The crabs scatter, the tags rain down ringing, and the watch is relieved at last."]),
      ],
      stagger: [
        BS("Your opening attempt fails and the Warden marks you now, dead lantern swinging to track your movement. The crabs in him chitter like a crew called to quarters.",
          ["Circle into the dark and re-strike", "You vanish from the lantern's aim and hit him from his blind quarter. The blow lands true this time."],
          ["Rush him before he sets his feet", "You close the distance faster than dead reflexes answer. Two hard strikes drive him into the chest stacks."]),
        BS("The chain catches air where you stood a breath ago and the follow-through wrecks a support beam. The hold groans. He does not. He is herding you toward the bilge stair.",
          ["Use the fallen beam as cover", "You fight him across the wreckage where the chain tangles. Every snag buys you a clean cut."],
          ["Dive past the chain at his core", "Through the arc, under his arm, blade dragging across his middle. The crabs scream for him."]),
        BS("He absorbs your failed blow into the swollen mass of himself and keeps it, blade and all if you let go. His patience is the worst weapon in the room.",
          ["Recover your blade and reset", "You plant a boot on him and wrench free. The exit wound costs him more than your strike did."],
          ["Leave the blade, strike with the boarding axe", "The axe was on the wall for a reason. It opens him along the old caulk line like a hull seam."]),
        BS("Your last failure leaves you in arm's reach of him with nowhere left to retreat. The chain rises. The crabs go silent. Even they want to see this.",
          ["Roll through his legs and strike the spine", "Under, behind, blade up into the rot at his back. The chain falls from fingers that forget how to hold."],
          ["Stand your ground and counter-swing", "His chain and your steel arrive together. Yours arrives better, and the Warden ends his watch."]),
      ],
    },
  },
  // =========================================================================
  vault: {
    rooms: [
      { name: "Counting Stair", nodes: {
        "": N("A marble stair descends below the waterline, pre-Fall lamps still bolted to the wall. On every step, a silver coin sits in its own small tide-pool, laid out like an offering.",
          ["Gather the coins as you descend", "s", { supplies: 1 }, "Old mint, heavy silver, forty steps' worth. Someone salted this stair to keep something fed. You have just unfed it."],
          ["Leave the coins, study the lamps", "u", { supplies: 1, finding: 1 }, "Each lamp carries a maker's mark dated after the Fall. Someone maintains this drowned place, recently and lovingly, and you pocket a spare lamp to prove it."]),
        "0": N("Three steps down, a coin you took is back in its pool. Same coin, same step, facing the same way. The stair is restocking itself behind you.",
          ["Take only every other coin", "c", { supplies: 1 }, "Half tribute, half theft. The stair accepts the arithmetic and the remaining pools stay empty behind you."],
          ["Pocket them faster than they return", "b", { supplies: 2 }, "You strip the stair at a run and beat the restock to the bottom landing. Your pockets ring with the argument."]),
        "1": N("The lamp bracket you reach for turns under your hand, and somewhere below, a door unbolts. The lamps were never lamps. They are handles.",
          ["Turn it back and listen first", "s", { supplies: 1, clue: 1 }, "The door re-bolts. Through the wall you hear a count being kept in a dry voice, and you write down the numbers it repeats."],
          ["Turn the next one too", "b", { supplies: 1, finding: 1 }, "A wall panel swings out on a maintenance closet: tools, oil, and a maintenance log signed monthly. The latest signature is from last week."]),
        "00": N("The pools you skipped are draining one by one, and from each empty pool comes a faint click, like an abacus bead moving. Something is counting your debt.",
          ["Pay back two coins and proceed", "c", { supplies: 1 }, "The clicking stops at your deposit. Bookkeeping, satisfied. You keep the rest and descend in peace."],
          ["Outrun the count to the landing", "u", { supplies: 2 }, "You hit the bottom landing before the tally closes. Whatever audits this stair logs you as a rounding error and lets it go."]),
        "01": N("Coins are returning to your emptied pockets now, one cold disc at a time, and each one weighs more than it should. The stair intends to slow you down with your own greed.",
          ["Dump the heavy coins, keep the rest", "s", { supplies: 1 }, "You shed the cursed weight on the steps where it belongs. The honest silver stays light and stays yours."],
          ["Carry it all down by force", "b", { supplies: 2, resolve: 1 }, "Every step is a squat lift and you make all forty. At the landing the weight lifts at once, like a test passed."]),
        "10": N("The dry counting voice stops mid-number. The silence that follows is the silence of something listening back through the wall.",
          ["Hold still until counting resumes", "c", { supplies: 1, clue: 1 }, "After a long minute, the voice picks up where it stopped. You note where the count restarted. Numbers that survive interruption are numbers worth stealing."],
          ["Tap the wall twice, politely", "u", { resolve: 1, finding: 1 }, "Two taps answer yours, then a brass tube extends from the wall holding a rolled receipt. It is made out to a name you know from the harbor. Paid in full, it says. For what, it does not."]),
        "11": N("Your second handle opens the floor instead of a wall. The step under you drops an inch and holds, a hinge groaning somewhere beneath your boots.",
          ["Ease back up and re-set the handles", "s", { supplies: 1 }, "Both handles home, the step relevels, and the trap goes back to sleep. You descend the ordinary way, richer and warier."],
          ["Drop through on purpose", "b", { supplies: 2, clue: 1 }, "You ride the step down into a teller's crawlspace: a strongbox, a skeleton in bank livery, and the duplicate keys he was hiding when the water came."]),
        "L4": N("The stair has stopped pretending. Steps shuffle their heights behind you, pools refill instantly, and the lamps gutter in a rhythm that matches the counting below.",
          ["Descend touching nothing more", "c", { supplies: 1 }, "Empty hands offend nobody. The stair settles, the lamps steady, and the landing lets you arrive."],
          ["Sweep the last pools at a run", "u", { supplies: 2, resolve: 1 }, "You take the final dozen coins in one reckless rush and leap the last four steps before they can rearrange."]),
        "L5": N("Every lamp on the stair turns its flame toward you at once. The marble is counting down, step heights collapsing one per heartbeat from the top. The bank has called your loan.",
          ["Slide the banister to the bottom", "u", { supplies: 2, resolve: 1 }, "Forty steps of marble banister at speed. You land hard, roll, and come up with your haul intact as the stair seals flat behind you."],
          ["Stand and settle the account", "b", { resolve: 2, finding: 1 }, "You hold up your haul and name its count aloud. The stair stills. A receipt prints itself in frost on the wall, and the frost names this bank's one surviving debtor."]),
      } },
      { name: "Clerk's Antechamber", nodes: {
        "": N("Forty drowned desks in perfect rows, papers fused to every surface. One desk in the far corner is scrubbed clean and its chair is pushed back, recently.",
          ["Lift papers from the fused desks", "s", { supplies: 1 }, "Bearer bonds, mostly ruined, three still legible. Even the ruined ones are pre-Fall paper, worth weight."],
          ["Search the clean desk", "b", { supplies: 2, clue: 1 }, "A hollow leg holds a waxed tube of documents, and on top of them a fresh note in a modern hand: NOT YET. The ink smells like this year."]),
        "0": N("A fused page tears, and forty inkwells refill at once with a sound like a tide turning in a bottle. At every desk, a pen rolls to the ready position.",
          ["Stack a fair trade on the nearest desk", "c", { supplies: 1 }, "You leave a coin per page taken. The pens roll back to rest. Clerks respect a balanced book even when they are dead."],
          ["Harvest pages before the clerks arrive", "u", { supplies: 2 }, "You strip three desks in the time the room takes to wake. Whatever sits down at those desks will find them already audited."]),
        "1": N("The clean desk's drawer is locked, and as your hand touches it, every fused paper in the room turns one page in unison. The room is reading along with you.",
          ["Pick the drawer slowly, in plain view", "u", { supplies: 1, clue: 1 }, "You work the lock like a clerk doing inventory, openly and unhurried. The room approves. The drawer holds the visitor log, and the last entry is dated tomorrow."],
          ["Force the drawer in one pull", "b", { supplies: 2, clue: 1 }, "Wood splits and the room's pages all slam shut at once. Inside: the waxed tube, a clean ledger, and the NOT YET note now reading NOT LIKE THIS."]),
        "00": N("Your coins on the desk are gone and a receipt sits in their place, itemized, with a line at the bottom you did not pay for: services rendered. The room thinks it owes you work.",
          ["Accept the work, present a question", "s", { resolve: 1, finding: 1 }, "You ask the room what was in vault nine. Forty pens scratch at once and a single fused page peels itself free, answering in beautiful copperplate."],
          ["Decline politely, take your pages", "s", { supplies: 1, resolve: 1 }, "You mark the receipt void and the room lets the matter, and the pages, go."]),
        "01": N("The first clerk arrives. A shape of silt and ink settles into the nearest chair, lifts a pen, and waits, the way a teller waits for the next in line.",
          ["Approach the window with paperwork", "u", { supplies: 1, finding: 1 }, "You present a salvaged bond. The clerk stamps it, files a copy, and pushes a payout drawer toward you. Pre-Fall procedure, still working."],
          ["Loot the row behind its back", "b", { supplies: 2 }, "Tellers see only their own window. You empty the back row while the silt-clerk waits patiently for a customer who is robbing it."]),
        "10": N("The visitor log lists you, by description, three entries back. Date, hour, purpose: salvage. Someone reported your visit before you made it.",
          ["Copy the entries around yours", "c", { clue: 1, finding: 1 }, "The entry before yours is a harbor name. The entry after is blank with the ink already wet. You copy both and leave the pen where it lies."],
          ["Tear out your page entirely", "u", { supplies: 1, resolve: 1 }, "The page comes free without protest, and a payout drawer opens under the desk. The bank, it seems, pays for discretion."]),
        "11": N("NOT LIKE THIS, the note insists, and the desk drawer relocks itself harder. Across the room, a second clean desk you had not noticed pushes back its own chair.",
          ["Sit at the second desk and wait", "u", { resolve: 1, clue: 1 }, "You sit. A drawer opens by itself, offering the tube and a fresh note: LIKE THIS. Inside the tube, account maps of the lower vaults."],
          ["Smash both desks for their secrets", "b", { supplies: 2, clue: 1 }, "Two hollow legs, two caches, one furious room of slamming pages. You leave with everything and an enemy made of paperwork."]),
        "L4": N("Silt-clerks fill a dozen chairs now, all writing, and what they write is appearing on the walls: your name, your debts, your hour of arrival, columns balancing toward something.",
          ["Take legible bonds and file out", "c", { supplies: 1 }, "You walk the center aisle like a customer leaving at close. The clerks write on. The door does not argue."],
          ["Raid the head clerk's podium", "u", { supplies: 2, resolve: 1 }, "The podium drawer holds the day's float, untouched since the drowning. Heavy, portable, and exactly what the columns were protecting."]),
        "L5": N("Every chair is filled, every pen is moving, and the columns on the wall are one line from balancing. When they balance, you are the figure that gets carried over. Last attempt.",
          ["Sign the bottom line yourself, on your terms", "u", { resolve: 2, finding: 1 }, "You write a name that is not yours and the books close satisfied. The clerks file out through walls, and the head desk pays out a closing bonus to the signatory. You."],
          ["Overturn the inkwell on the master page", "b", { supplies: 2, resolve: 1, clue: 1 }, "Ink floods the balance and the room convulses, clerks dissolving mid-stroke. In the chaos you take the float, the tube, and the one page the ink refused to touch."]),
      } },
      { name: "Lockwarden's Walk", nodes: {
        "": N("A corridor of vault doors, every door open, every vault empty. Beside each door hangs its key, polished and oiled. Forty doors. Forty keys. Nothing else.",
          ["Take the keys off their hooks", "u", { resolve: 1, supplies: 1 }, "Forty keys of drowned brass, each one faintly warm. Whatever emptied these vaults wanted the keys left behind. Now they are not."],
          ["Find the one door still locked", "b", { resolve: 1, finding: 1 }, "At the corridor's far end: one door, no hook, no key, and pressed into its brass the print of a hand much larger than a hand."]),
        "0": N("The third key fights your pull and the hook rings like a struck tuning fork. Door by door down the corridor, the open vaults begin to swing shut.",
          ["Grab keys ahead of the closing wave", "u", { supplies: 1, resolve: 1 }, "You sprint the corridor stripping hooks, two doors ahead of the slam the whole way. Sixteen keys, fairly raced for."],
          ["Wedge the nearest door and shelter", "s", { supplies: 1, resolve: 1 }, "Your pry bar holds vault twelve open while the rest slam. Inside twelve, missed by whatever swept these rooms: a strongbox bolted under the shelf."]),
        "1": N("The locked door is colder as you approach, and the hand print in the brass is frosting over. From behind the door, one knock. Patient. From the inside.",
          ["Knock back once and step aside", "s", { resolve: 1, clue: 1 }, "A brass slot opens at knee height and a ledger page slides out. It lists what this vault holds, and the list explains why the door stays locked from both sides."],
          ["Try your stolen keys on it", "b", { resolve: 2, finding: 1 }, "The ninth key turns halfway and stops, and through the gap of that half-turn you see the vault's interior: not a room. A road, going down. You re-lock it and keep the key that knows the way."]),
        "00": N("A slammed door clips your pack and the corridor goes dark for a heartbeat. When the lamps return, the hooks you already emptied hold keys again. Different keys. Watching keys.",
          ["Leave the new keys, keep your first haul", "c", { supplies: 1, resolve: 1 }, "Replacements are bait. You walk the corridor center with your honest brass and the watching keys stay on their hooks."],
          ["Take the new ones too", "b", { supplies: 2, resolve: 1 }, "Double brass, double weight, and your pack hums faintly all the way out. Let the fence sort the watching from the warm."]),
        "01": N("Inside sheltered vault twelve, the slamming stops, and your wedged door is now the only open door in a corridor gone silent. Footsteps approach it. Unhurried. Key-heavy.",
          ["Douse your light and press to the wall", "c", { supplies: 1, resolve: 1 }, "The footsteps pass your door without slowing. Through the gap you count a hundred keys swinging at a gray waist. Now you know what walks here, and when."],
          ["Slip out behind the footsteps", "u", { supplies: 1, resolve: 1, clue: 1 }, "You shadow the walker three doors down and watch it re-hang keys from its ring, one per hook, reading each tag. You pocket the tags it discards."]),
        "10": N("Your answering knock gets a second knock, then a third, then a rhythm: long, short, long. The door is trying to teach you something through the brass.",
          ["Learn the rhythm and repeat it", "u", { resolve: 1, finding: 1 }, "On your third try the rhythm completes and the brass slot opens wide. Inside the slot, an envoy's credentials, sealed pre-Fall, made out to the bearer. You are the bearer now."],
          ["Stop knocking and pry the slot", "b", { supplies: 1, resolve: 1, clue: 1 }, "The slot gives an inch and a hand much larger than a hand pushes a folded note through before the brass snaps shut. The note is a warning, an address, and an apology, in that order."]),
        "11": N("Your half-turned key is stuck fast and the frost is climbing it toward your fingers. Down the corridor, every door begins unlocking itself in sequence, coming this way.",
          ["Abandon the key and clear the corridor", "s", { resolve: 2 }, "You leave the brass to its argument and make the stair as the unlocking wave arrives. Behind you, forty doors stand open again, and one stays shut."],
          ["Hold the key and force the full turn", "b", { resolve: 2, supplies: 1, finding: 1 }, "The key turns, the frost shatters, and the door opens exactly one inch before slamming itself with a sound like a verdict. In that inch, a hand much larger than a hand placed something in your palm: a key not on any hook."]),
        "L4": N("The Lockwarden walks the corridor openly now, gray and tall, re-hanging keys and pausing at every hook you emptied. Each pause turns its head one notch toward your end of the walk.",
          ["Return three keys as an offering", "c", { resolve: 1, supplies: 1 }, "You hang three warm keys where it can see. The Lockwarden accepts the arithmetic, finishes its round, and unlocks the stair gate on its way past. For you, apparently."],
          ["Lift the master ring off its belt", "u", { supplies: 2, resolve: 1 }, "Its rounds have a rhythm and you are inside it. The ring comes free in your hand, a hundred keys strong, and the Lockwarden keeps walking, lighter and unaware."]),
        "L5": N("Every door in the corridor stands open at the same angle, and the Lockwarden stands at the locked door, hand fitting the print in the brass, head turned fully toward you. Last chance before the walk keeps you.",
          ["Run the gauntlet of open doors", "u", { resolve: 2, supplies: 1 }, "Forty doorways try to swallow you and forty miss. You take the stair three at a time with your brass ringing victory."],
          ["Offer the Lockwarden the key it lost", "b", { resolve: 2, finding: 1, clue: 1 }, "You hold up the key from no hook. It stares, takes it with terrible gentleness, and presses something into your hands in trade: the corridor's ledger, listing what left each vault, and where it was taken."]),
      } },
      { name: "Vault of Names", nodes: {
        "": N("A strongroom walled in ledger stone, every surface carved with accounts. Deposits of years, voices, and luck, with interest compounding. Your own name is in here somewhere. You can feel it itemized.",
          ["Rub a copy of the master column", "u", { finding: 1, clue: 1 }, "Charcoal and parchment take the column clean. The deposits are not money: a harbor's luck, a family's years, a god's voice. All earning interest. All payable to one account."],
          ["Find your name and read your account", "b", { resolve: 2, finding: 1 }, "You find it. The balance is not zero. You leave richer in resolve and poorer in something the stone declined to itemize."]),
        "0": N("Your rubbing tears, and the torn line bleeds fresh-cut stone dust. The wall is re-carving the line you damaged, and a new line beneath it: one rubbing, debited.",
          ["Pay the debit with a true secret spoken aloud", "c", { finding: 1, clue: 1 }, "You speak a thing only you know, and the wall carves it small in payment. Your new rubbing comes away whole, and so does the wall's silence about you."],
          ["Rush a fast rubbing of a different column", "u", { finding: 1, resolve: 1 }, "Speed beats the stone's bookkeeping. The side column you take instead lists withdrawals, and withdrawals are rarer and stranger reading than deposits."]),
        "1": N("Your name is not where it should be. A space is, edged and waiting, sized for your name exactly, with the chisel resting on the ledge beneath it.",
          ["Leave the space empty and back away", "s", { resolve: 1, clue: 1 }, "The chisel rusts a year for every step you retreat. By the door it is dust, and the dust spells the name of the account holder who wanted yours."],
          ["Carve a false name in the space", "b", { resolve: 2, finding: 1 }, "You carve a stranger's name and the wall posts a balance to it instantly. Somewhere, a stranger just got very lucky, and you got their reading of the room: a hidden drawer behind the third column."]),
        "00": N("The wall accepts your secret and wants another. Lines open across every column like listening mouths, and the room's cold sharpens to attention. It is negotiating now.",
          ["Trade one more, your choice of which", "u", { finding: 1, resolve: 1 }, "You spend a secret you were done carrying anyway. The wall pays generously: the full account of who built this vault, and who it was built to hold."],
          ["Close the deal and go to work", "s", { finding: 1, supplies: 1 }, "No further deposits. You take your rubbings and the wall, professionally disappointed, lets the matter close."]),
        "01": N("Withdrawals, you learn, require collateral, and the wall has decided your lantern qualifies. The flame dims a shade with every line you copy.",
          ["Copy fast, spend the light", "u", { finding: 1, clue: 1 }, "Half your flame buys the withdrawal record whole. The largest withdrawal is recent, enormous, and signed with a sucker-print."],
          ["Snuff the lantern yourself and read by touch", "b", { resolve: 2, finding: 1 }, "Darkness voids the collateral clause. Your fingers read the carved lines like a blind teller, and the wall, rather impressed, un-dims your lantern when you finish."]),
        "10": N("The rust-dust name belongs to a living harbor broker, and the wall is now carving a transaction beneath it in real time: purchase pending. The item being purchased is the space with your name's edges.",
          ["Record the transaction and withdraw", "c", { clue: 1, finding: 1 }, "You copy the broker's name, the price, and the closing date. Somebody ashore is buying your future, and now you know who and when."],
          ["Carve VOID across the pending sale", "u", { resolve: 2, clue: 1 }, "The wall shudders and processes your objection. Sale voided, fee charged, and the fee receipt names the account that tried to buy you."]),
        "11": N("The hidden drawer is open and it is not empty. Inside sits a single name carved on a stone token, and the name is yours, original, withdrawn from the wall before you ever arrived.",
          ["Take your name and pocket it", "u", { resolve: 2, finding: 1 }, "Your own name, in your own pocket, beyond any ledger's reach. The whole room's interest in you drops to zero, and the cold lifts like a settled debt."],
          ["Trade it back to the wall for the vault's secret", "b", { resolve: 2, finding: 1, clue: 1 }, "The wall accepts your name back into stone and pays its price: the location of the one account it cannot collect, scratched on the back of the token it returns to you."]),
        "L4": N("Stone dust hangs thick and the columns are re-carving themselves faster than you can read, balances spinning upward. The vault is closing its quarter, and everything in the room is being counted. Including you.",
          ["Take what you have copied and file out", "c", { finding: 1 }, "You leave mid-audit through the settling dust. The rubbings in your pack are dated, sealed, and inarguable."],
          ["One last rubbing of the spinning master line", "u", { finding: 1, resolve: 1, clue: 1 }, "You press parchment to moving stone and pull away a blur that resolves, later, by lamplight: the quarter's closing total, and what the interest is being saved up to buy."]),
        "L5": N("The carving stops all at once. Every column faces you, balanced, and the room holds its breath waiting for the final entry. You are the final entry, unless you give it something else. Last attempt.",
          ["Deposit your rubbings back into the stone", "u", { resolve: 2, finding: 1 }, "Paper to stone, knowledge re-shelved. The wall accepts the deposit, balances the quarter without you, and opens the door with what can only be called gratitude."],
          ["Carve your own final entry: PAID IN FULL", "b", { resolve: 2, finding: 1, clue: 1 }, "Three words in stone, your hand steady. The vault audits the claim, finds it beautifully fraudulent, and honors it anyway. Fraud, after all, is banking. The door opens and the wall slips you a bonus: the name of its founder."]),
      } },
    ],
    boss: {
      stages: [
        BS("Rasp the Tidewight unfolds from behind the ledger stone: the bank's dead head clerk, long and gray as eelskin, dressed in chains of keys. Its chest opens like a great book, and it holds the book out toward you, open to a blank line.",
          ["Strike while it presents the book", "Your blade tears a page from the thing's chest. The page screams in three voices and dissolves, and Rasp's attention lands on you like a stamp."],
          ["Attack the book's spine directly", "Two hard blows into the binding of it. Keys rain across the floor, and somewhere in the vault forty locks click in sympathy."]),
        BS("Rasp moves like an audit, unhurried and total. Keys lash from its chains in arcs that have foreclosed on better than you, and where they strike stone, names appear, crossed out.",
          ["Read its rhythm and cut between entries", "Every audit has a tempo. You find the rest beat and put your blade in it, deep."],
          ["Lunge through the raining keys", "Three keys mark your shoulders and one blade marks its core. Gray ichor hits the ledger stone, and the stone refuses to absorb it."]),
        BS("Torn and leaking pages, Rasp anchors itself to the master column and begins reading names aloud. Each name it finishes crumbles somewhere out in the world. It will read until stopped.",
          ["Sever the chains anchoring it", "Link by link you cut it loose from the column. Unanchored, its voice loses the stone's echo and the names stop landing."],
          ["Drive your blade through the open book", "Steel through paper through whatever serves it as a heart. The recitation chokes off mid-name, and that name, somewhere, survives."]),
        BS("Rasp stands by will and paperwork alone now, holding the book out one final time, blank line waiting, pen extended. It wants a signature more than it wants your life. It believes they are the same thing.",
          ["Close the book on it, hard", "The covers slam on their own clerk. The sound is a vault door, a verdict, and a very long account settled at once."],
          ["Sign with your blade, through the page", "You write the only word you mean straight through the final page and into Rasp behind it. The Tidewight reads your answer and is, at last, dismissed."]),
      ],
      stagger: [
        BS("Your attempt fails and Rasp enters it in the book, unhurried. A key detaches from its chains and hangs in the water between you, pointed at your chest like a clerk's pen at an error.",
          ["Knock the key aside and press in", "Brass rings off your guard and you are inside its reach before the next entry. Your blow lands where the bookkeeping lives."],
          ["Strike the floating key into Rasp", "You bat its own brass back through its chest. Filed, the wound says. Approved."]),
        BS("The key-arcs herd your failed footing toward the master column, where the stone is already carving a space your size. Rasp does not chase. Rasp processes.",
          ["Break the herding pattern, attack the flank", "You step where the audit says you cannot and cut where the chains hang thinnest. The pattern collapses with the blow."],
          ["Let it herd you, then explode off the column", "Your back touches stone and you launch, both hands on the hilt, straight through its writing arm."]),
        BS("It absorbs your miss into the open book and gains a page. Rasp is binding your failures into itself, and the book is visibly thicker than when this fight began.",
          ["Tear out the newest pages", "You rip your own failures back out of its chest. It staggers like a ledger dropped down a stair."],
          ["Strike through the thickened book regardless", "More pages just means more to cut. Your blade goes through the swollen binding and finds the clerk behind it."]),
        BS("Your last failure is entered, blotted, and ruled beneath. Rasp turns the book toward you with the pen already inked. The line waits. The vault waits. Everything here has always been very good at waiting.",
          ["Snap the offered pen and strike", "The pen breaks like a promise and your blade follows your refusal in. Rasp accepts the amendment."],
          ["Seize the book and tear it in half", "Spine, stitching, clerk. All three part down the middle, and what spills out is every name it ever crossed out, free."]),
      ],
    },
  },
  // =========================================================================
  warren: {
    rooms: [
      { name: "Wax Stair", nodes: {
        "": N("A stair of poured candle-wax spirals down under the shrine district, smooth and warm though no flame shows. The cult melted years of stolen offerings to build this.",
          ["Descend slow, cutting wax samples", "s", { supplies: 1 }, "Temple-grade votive wax, tons of it. Proof of theft the Faithful will pay to see, and fuel you can sell besides."],
          ["Follow the warmth to its source", "u", { supplies: 1, clue: 1 }, "A side-vent breathes slow heat from below in a steady rhythm. You count it, map it, and realize you have been breathing along with it. You stop."]),
        "0": N("Your knife skids on a hard vein in the wax and the gouge reveals a hand, sealed inside the stair, fingers spread. The wax holds more than wax.",
          ["Cut around the remains, respectfully", "c", { supplies: 1, clue: 1 }, "You free the hand's effects without disturbing it: a Faithful signet and a torn vestment hem. A missing priest, found, and evidence of who took him."],
          ["Cut faster, elsewhere, eyes forward", "u", { supplies: 2 }, "You fill your bag from cleaner veins and do not count the shapes you pass. Counting helps nobody now."]),
        "1": N("The vent's rhythm stutters when your shadow crosses it, then resumes, faster. Whatever breathes below has noticed the light.",
          ["Shutter the lantern and listen in the dark", "s", { clue: 1, supplies: 1 }, "Dark and still, you hear past the breathing: a count being chanted under it, the same numbers cycling. You memorize the cycle and relight when it crests."],
          ["Lean in and look down the vent", "b", { supplies: 1, finding: 1 }, "Your eye finds the source: a wax-dipped bellows worked by robed figures, keeping something below at temperature. Incubation, the careful arrangement says. Not worship."]),
        "00": N("More hands now, where your cuts have thinned the stair, all reaching upward, all sealed mid-climb. The stair was poured over people trying to leave.",
          ["Mark the spot and move on quickly", "c", { supplies: 1, clue: 1 }, "You chart the mass grave's location for the Faithful and descend with lighter cuts and a heavier purpose."],
          ["Free one set of remains for proof", "u", { supplies: 1, finding: 1 }, "An hour's grim carving frees one of the climbers, and with them, a sealed message tube they died protecting. The message names the night the stair was poured."]),
        "01": N("Wax under your boots is softening. Your hurried cutting opened the vein wide and warmth is rising through it, and the steps behind you are losing their edges.",
          ["Plug the vein with cold wax shavings", "s", { supplies: 1 }, "Your own cuttings, packed hard, seal the bleed. The stair firms up and your bag stays full."],
          ["Race the melt to the next landing", "b", { supplies: 2 }, "You take the softening steps at a slide and hit the landing as the flight above slumps shut. No way back up this stair. The haul came with you."]),
        "10": N("The chanted count beneath the breathing reaches its end, and everything stops. Vent, breath, warmth. The stair waits in total silence to see what you do.",
          ["Stand absolutely still until it restarts", "c", { clue: 1, supplies: 1 }, "A new count begins from one. In the gap before it, you heard a door close far below, and now you know the count measures shifts. Guard shifts."],
          ["Whisper the next number yourself", "b", { resolve: 1, finding: 1 }, "Your number echoes down the vent and the breathing resumes around it, accepting you into the rhythm. Whatever keeps count below now counts you among its keepers."]),
        "11": N("A robed face at the bellows looks up the vent, straight at your eye. It does not raise an alarm. It raises one finger to its lips.",
          ["Nod and withdraw from the vent", "s", { supplies: 1, clue: 1 }, "A conspirator, or a doubter, or bait. You note the face, the bellows count, and the silence you now share with a cultist."],
          ["Hold its gaze and mouth a question", "u", { resolve: 1, finding: 1 }, "You mouth: what sleeps below. It mouths back four syllables and returns to its bellows. Four syllables you will need a scholar, or a priest, to dare translate."]),
        "L4": N("The whole stair is sweating now. Steps slump, hands emerge and sink back, and the warmth from below has become a draft, rising, like something inhaling for a long note.",
          ["Get down the last flights, touching nothing", "c", { supplies: 1 }, "You ride the cooling rail of the stair's edge to the bottom and step off as the middle flights fold."],
          ["Carve the seal off the landing arch as you pass", "u", { supplies: 1, finding: 1, resolve: 1 }, "The arch seal comes free in one slab: the cult's own sigil over an older Faithful blessing, defaced. Both, together, are a sermon's worth of proof."]),
        "L5": N("The stair is melting in earnest, wax running upward along the walls, and the inhale from below has not stopped. One way remains: down, now, before the spiral closes like a throat. Last attempt.",
          ["Slide the molten spiral to the bottom", "u", { supplies: 2, resolve: 1 }, "You ride hot wax three full turns and land rolling in the tunnel mouth, smoking slightly, bag intact, dignity negotiable."],
          ["Leap the spiral's open center", "b", { supplies: 2, resolve: 1, clue: 1 }, "Straight down the shaft's heart, past every melting turn, catching the bottom arch one-handed. From the air you saw the warren's whole layout below, and you remember all of it."]),
      } },
      { name: "Votive Gut", nodes: {
        "": N("A low tunnel walled floor to ceiling in offering bowls. Each holds a keepsake: a curl of hair, a baby tooth, a wedding ring. Tens of thousands, and the nearest rows are recent.",
          ["Inventory the freshest bowls", "c", { clue: 1 }, "Names you know. Dockhands, a coin-teller, the keep's daughter. The cult is not recruiting strangers. It is collecting from your harbor."],
          ["Take the rings and valuables", "b", { supplies: 2 }, "Your bag fills with gold and promises. Behind you, faintly, the emptied bowls begin to hum."]),
        "0": N("A bowl tips under your reaching hand and its keepsake rolls into the dark, and every bowl in the row turns a finger-width to face the sound. They are not fixed. They are watching.",
          ["Right the bowl and return the keepsake", "s", { clue: 1, supplies: 1 }, "Restored, the row turns back to neutral. In the moment they moved, you saw what is behind them: a second wall of older bowls, and you note what those held."],
          ["Sweep the row into your bag wholesale", "u", { supplies: 2 }, "If they are going to stare, they can stare from your bag. The hum follows you, muffled and furious."]),
        "1": N("Three rings deep into your bag, the hum behind you organizes into a tone, and the keepsakes you took are vibrating against each other like struck glass. They are answering something.",
          ["Dump the humming ones, keep the quiet ones", "s", { supplies: 1 }, "You sort by ear and shed the singers. The remainder ride silent, and the tunnel loses your scent of theft."],
          ["Wrap the bag in your coat and push on", "u", { supplies: 2, clue: 1 }, "Muffled, the song cannot carry. Down-tunnel you pass the thing the song was calling, still waiting at its junction for a signal that never arrives. You memorize its post."]),
        "00": N("The older bowls behind the wall hold no keepsakes. They hold teeth, all adult, all whole, arranged in spirals, and the spirals match the sucker-scars on wreck timber.",
          ["Sketch the spiral arrangement exactly", "c", { finding: 1, clue: 1 }, "Your sketch matches the kraken-scar pattern from the harbor records. The cult has been building this collection since before the Fall."],
          ["Take a spiral's center tooth", "b", { supplies: 1, finding: 1 }, "The center tooth comes free and the spiral sags like a broken constellation. The tooth is not human, not shark, and a scholar will pay dearly to say what it is."]),
        "01": N("From the dark where the keepsake rolled, a hand sets it gently back on the shelf. A gray hand, too many knuckles, withdrawing without hurry. The tunnel keeps a keeper.",
          ["Hold still and let it finish its rounds", "c", { clue: 1, supplies: 1 }, "The keeper tidies the whole row, ignores you completely, and pads away down-tunnel. Where it cannot be bothered to look, you harvest freely."],
          ["Follow the keeper at a distance", "u", { clue: 1, finding: 1 }, "It leads you to its station: a niche stacked with confiscations from previous thieves. Weapons, lanterns, a journal. The journal's last owner got further than you have. You take his notes."]),
        "10": N("Your sorting was too slow. The tone has been answered from down-tunnel, one low note, and the bowls ahead of you are now turning to face the direction you must walk.",
          ["Walk the gauntlet slow, hands open", "c", { supplies: 1, clue: 1 }, "Ten thousand bowls watch you pass with empty hands shown. At the tunnel's end, the watcher that answered stands aside for the politely thieving."],
          ["Sprint the gauntlet before it forms", "b", { supplies: 2 }, "You beat the turning bowls to the junction at a flat run, bag clutched like a stolen child. The low note sounds again behind you, frustrated."]),
        "11": N("The junction-thing has left its post and found you anyway: tall, robed in netting hung with keepsakes, head tilted at your muffled bag like a parent hearing a lie.",
          ["Offer it the bag's worst item", "u", { supplies: 1, resolve: 1 }, "It takes the proffered ring, threads it into its netting beside ten thousand others, and resumes its post. A toll collector, then. Tolled, you pass."],
          ["Duck past it in the bowl-shadow", "b", { supplies: 2, clue: 1 }, "Low and fast through the gap its netting leaves, and you are by. It does not give chase. It marks your face into a bowl with one wet finger, and you mark its junction in return."]),
        "L4": N("Every bowl in the gut is humming now, one rising chord, and keepers converge from both ends of the tunnel, netting rattling. The collection is closing around its missing pieces. The pieces are in your bag.",
          ["Surrender half the bag at the shrine niche", "c", { supplies: 1, clue: 1 }, "Half the gold buys the chord down to a murmur and the keepers back to their rounds. You leave with the other half and the location of every niche."],
          ["Smash a shelf and escape through the gap", "u", { supplies: 2, resolve: 1 }, "Bowls cascade, keepers dive for their charges, and you go through the broken wall into the maintenance crawl behind it, bag intact, pursuit buried in its own collection."]),
        "L5": N("Keepers at both ends, the chord at full voice, and the bowls themselves climbing the walls toward the ceiling to seal the tunnel into a sphere of watching clay. Last way out is now. Last attempt is this one.",
          ["Hurl the bag down-tunnel and run the other way", "u", { supplies: 1, resolve: 2 }, "The keepers swarm the thrown bag and you take the clear end at a sprint, keeping the fistful of rings already in your coat. A tactical tithe."],
          ["Climb the closing bowl-sphere and squeeze out the top", "b", { supplies: 2, resolve: 1, finding: 1 }, "Up the shifting clay wall as it curls, out through the shrinking eye at its crown, into the crawlspace above. From up there you saw the gut entire: it spirals, and the spiral matches the teeth, and the teeth match the scars."]),
      } },
      { name: "Chant Gallery", nodes: {
        "": N("A round gallery whose walls are carved into ranks of open mouths, and the mouths are producing a low continuous tone. Your lantern flame bends toward them like it wants to listen.",
          ["Stuff the nearest mouths with wax", "u", { resolve: 1, supplies: 1 }, "The tone develops a hole the size of your work and the gallery quiets by degrees. In the quiet, you hear what the tone was covering: water moving below, on a schedule."],
          ["Sing a deliberate wrong note into the room", "b", { resolve: 1, finding: 1 }, "The gallery stumbles, hunting your dissonance, and in the broken harmony you hear the chant's hidden structure: a count. A countdown."]),
        "0": N("A waxed mouth splits its plug and the carving cracks wider, and now it is not toning. It is whispering, your name, in the voice of someone you trust ashore.",
          ["Plug it again, double thickness, ears shut", "c", { resolve: 1, supplies: 1 }, "Wax over wax, and the whisper smothers. You work down the rank methodically with your collar turned up, and the gallery's volume drops by a quarter."],
          ["Press your ear close and listen first", "u", { resolve: 1, clue: 1 }, "The borrowed voice runs out of your name and starts on instructions, the cult's own orders cycling through the wall. You memorize tonight's: which shrine, which hour, which knife."]),
        "1": N("Your wrong note works too well. The whole gallery drops silent, every carved mouth closing at once with a clay click, and in the silence, footsteps. The choir has keepers, and the keepers heard the soloist.",
          ["Hide in the dead choir's blind spout", "s", { resolve: 1, clue: 1 }, "You fold into a maintenance spout and the keepers sweep past, relighting the chant mouth by mouth. You watch the relighting order. The order is a map of which mouths matter."],
          ["Hold your note and keep singing", "b", { resolve: 2, finding: 1 }, "You sing alone in the dark, defiant, and the gallery, fascinated, begins to harmonize under you. For one verse the cult's own instrument follows your lead, and what it harmonizes is the countdown's remainder. You now know how long the harbor has."]),
        "00": N("Mouths you plugged are chewing through the wax from inside, and the rank above them has changed its tone to something rhythmic and directional. The wall is reporting you, mouth to mouth, toward the deep.",
          ["Outpace the report, plug the relay mouths", "u", { resolve: 1, supplies: 1 }, "You read the relay's direction and wax three mouths ahead of the message. The report dies between stations and the deep stays uninformed."],
          ["Let it report and prepare a surprise", "b", { resolve: 2 }, "You let the wall sing your location and stand ready beside the answering tunnel. What comes to investigate meets your blade arriving first, and does not report back."]),
        "01": N("Tonight's orders end with a name, and the name is one of your own group's contacts. The mouth repeats the order cycle from the top, and somewhere above, the hour it names is approaching.",
          ["Copy the full order verbatim", "c", { clue: 1, finding: 1 }, "Every word, exact, with the hour and the shrine. Warning a target is worth more delivered with proof, and now you carry proof."],
          ["Shout a counter-order into the mouth", "b", { resolve: 1, clue: 1 }, "You bark a cancellation in your best dead-priest voice and the wall carries it dutifully upward. Somewhere tonight, a knife stays sheathed in confusion, and you keep the original order as evidence."]),
        "10": N("The relighting keepers reach your blind spout's rank, one mouth away. The nearest keeper carries a tuning rod and a long wax knife, and it works with its hood back. Its own mouth is sewn shut.",
          ["Slip behind it as it tunes", "u", { resolve: 1, supplies: 1, clue: 1 }, "It tunes by feel, deaf to footsteps. You lift its mouth-map and order chits off its belt as it works, and exit along the rank it already finished."],
          ["Take it down silently in the spout", "b", { resolve: 2, clue: 1 }, "One keeper fewer, folded into the spout it would have searched. Its wax knife, tuning rod, and the map of every mouth in the gallery change ownership."]),
        "11": N("Your borrowed choir falters: a true keeper's voice has joined from the gallery door, retuning the mouths back to the countdown, and the wall's loyalty is shifting back mid-verse.",
          ["Finish your verse and slip out the far spout", "s", { resolve: 1, finding: 1 }, "You take the song to its rest and leave on the closing note like a professional. The keeper inherits a gallery that now sings a quarter-tone flat, permanently."],
          ["Out-sing the keeper directly", "b", { resolve: 2, finding: 1 }, "Voice against voice across the carved ranks, and the wall chooses yours. The keeper withdraws, defeated by better music, and the gallery sings you its founding hymn in thanks. The hymn names its maker."]),
        "L4": N("The gallery is at war with itself, half the mouths singing the countdown, half singing your sabotage, and keepers pour in to retune by force. Clay dust rains from cracking ranks. The room is shaking itself apart over you.",
          ["Withdraw along the finished rank", "c", { resolve: 1, clue: 1 }, "You exit through the quarter you already silenced while the keepers fight the choir. Behind you the argument continues without its author."],
          ["Crack the keystone mouth above the door", "u", { resolve: 2, supplies: 1 }, "One blow to the master carving and the whole gallery loses pitch at once. In the tone-deaf chaos you cross the floor untracked and take the keepers' abandoned satchels on the way."]),
        "L5": N("The countdown has restarted at triple tempo, every mouth wide, and the floor's center is spiraling open like a pupil. The gallery means to finish its count with you inside the answer. Last attempt.",
          ["Dive through the closing door behind the keepers", "u", { resolve: 2, supplies: 1 }, "You hit the gap as the last keeper clears it and roll into the tunnel beyond. The gallery seals and finishes its count alone, singing to an empty room."],
          ["Drop into the opening floor on a rope", "b", { resolve: 2, finding: 1, clue: 1 }, "Down into the pupil before it blinks, swinging into the under-gallery the cult never meant you to see: the original choir, pre-Fall, Faithful-built, and the carving that proves the cult stole this place rather than made it."]),
      } },
      { name: "Ink Font", nodes: {
        "": N("A black font bubbles at the tunnel's heart, faintly luminous, ringed by brushes and skin-stretched pages where the cult copies something endless. Finished pages hang drying on lines of gut.",
          ["Take finished pages, touch nothing wet", "s", { resolve: 1, clue: 1 }, "Dry pages map the warren and tunnels beyond it, reaching toward harbors that have no idea. The ink shifts when you fold them, but it stays on the page."],
          ["Sample the font itself in a sealed jar", "b", { resolve: 2 }, "The ink fights the jar like a landed eel, then settles, sulking. The Faithful will pay dearly to learn what swims in their stolen offerings."]),
        "0": N("A drying line snaps under your harvest and wet pages slap the stone, and the spilled ink does not splash. It gathers, and begins flowing back to the font in a thin determined line, carrying the page text with it.",
          ["Trap the flowing ink in a bowl midstream", "u", { resolve: 1, finding: 1 }, "Your bowl catches the runaway ink and the text it carries reassembles on the bowl's surface: a page the cult wrote and then tried to unwrite. You keep the recall."],
          ["Grab the wet pages before the ink leaves them", "b", { resolve: 1, clue: 1 }, "You peel pages off the stone faster than the ink can desert. Half-emptied, the remaining text is the half that matters: names of tunnels with dates beside them. Future dates."]),
        "1": N("Your jar's seal weeps. A black bead works through the cork, tastes the air, and points itself at your face like a compass needle finding north. The sample wants a better container.",
          ["Re-seal it inside a second jar, wax-dipped", "c", { resolve: 1 }, "Glass inside glass inside wax. The double prison holds, the bead withdraws, and your sample travels the rest of the way like a prisoner who has accepted the verdict."],
          ["Let one drop onto your blade, deliberately", "b", { resolve: 1, finding: 1 }, "The drop sinks into the steel and the blade drinks it without harm. Etched along the fuller where it traveled: a single line of cult script. Your blade now carries their password."]),
        "00": N("The font has noticed its ink being intercepted and the bubbling has stopped. The surface is rising in the bowl's direction, a black column leaning out of the basin toward your theft.",
          ["Return the bowl's ink and back away", "c", { resolve: 1, clue: 1 }, "Poured back, the column subsides, satisfied. The recalled page's text, though, stays in your memory, and memory is one container ink cannot drain."],
          ["Salt the leaning column from your ration bag", "u", { resolve: 2 }, "Salt hits the ink like fire hits oil. The column recoils into the font and the whole basin clouds gray, blind. You work the drying lines at leisure while it recovers."]),
        "01": N("Two copyist cultists return to their brushes and find you mid-theft, pages in hand. They do not call out. They sit, dip their brushes, and begin copying you, your stance, your face, onto fresh skin-pages.",
          ["Snatch their portraits and run", "u", { resolve: 1, clue: 1 }, "You take the wet copies of yourself off their boards mid-stroke. Whatever the portraits were for, it required completion, and yours will never finish."],
          ["Sit, and copy them back", "b", { resolve: 2, finding: 1 }, "You take up a spare brush and sketch the copyists in their own ink. They stop. The ink, it turns out, binds whoever is rendered in it, and you finished first. They answer three questions in writing before you release the pages."]),
        "10": N("The double jar holds, but the font's level is visibly dropping, all of it draining somewhere below, leaving the basin walls bare. Carved on the emerging basin floor: instructions for what to do when the ink is ready.",
          ["Copy the basin instructions before they submerge again", "u", { finding: 1, clue: 1 }, "You transcribe by lantern as the level wavers: where the ready ink goes, who carries it, and the route. The route ends at a shrine the Faithful still use."],
          ["Climb into the draining basin for the carving's seal", "b", { resolve: 2, finding: 1 }, "Knee-deep in retreating ink, you chisel the basin's central seal free whole. The ink refills around your ankles politely, like a tide around a rock, and you climb out with the cult's master sigil under your arm."]),
        "11": N("The password line on your blade is glowing, and the glow is answering something: down-tunnel, page-lanterns are lighting in sequence, coming this way. Your blade has logged itself into their network.",
          ["Sheathe the blade and break the handshake", "s", { resolve: 1, clue: 1 }, "Steel into leather, signal into silence. The page-lanterns halt their approach, confused, and you chart their positions while they idle."],
          ["Answer the lanterns with the blade raised", "b", { resolve: 2, clue: 1 }, "You walk the tunnel with the glowing blade as your credential, and the page-lanterns light your way deferentially. Whatever rank the password carries, it outranks everything you pass."]),
        "L4": N("The font is boiling now, copyists chant at the rim, and ink crawls the walls in sentences too fast to read, rewriting the room's own carvings. Your presence is being edited into the cult's record, and the record is being edited into something with your shape.",
          ["Tear down the drying lines and go", "c", { resolve: 1, clue: 1 }, "You take every finished page in one armful and leave the room to its boiling. Whatever it writes about you, you hold the originals."],
          ["Hurl your lantern oil into the font", "u", { resolve: 2, supplies: 1 }, "Oil meets ink and the font erupts in cold black flame that burns nothing but text. The walls go blank, the copyists flee blind, and you harvest the room's brushes and silver fittings in the dark you made."]),
        "L5": N("Ink stands out of the font full-height now, wearing your copied outline, finishing its last sentence. When the sentence ends, one of you is the original. The copyists have stopped chanting to watch. Last attempt.",
          ["Strike the inkwell heart of the copy", "u", { resolve: 2, finding: 1 }, "Your blade finds the dense black core where its chest should be, and the copy collapses into a long spill that spells, on its way back to the basin, an apology. The basin seals itself over it."],
          ["Drink one mouthful of the font", "b", { resolve: 2, finding: 1, clue: 1 }, "Madness, and it works. The ink cannot copy what it is inside of. The standing copy unravels, the font goes inert, and for one hour afterward, every cult text you glance at translates itself for you. You spend the hour reading everything."]),
      } },
      { name: "Maw Antechamber", nodes: {
        "": N("The last chamber before the lair, floored in offerings the cult judged worthy: weapons, instruments, a ship's wheel, a throne. All arranged facing the dark ahead, like an audience waiting for a curtain.",
          ["Take the offerings facing away from the dark", "u", { supplies: 2, resolve: 1 }, "A few treasures were set facing the exit: escape gifts from doubting cultists. You inherit their doubt and their gold."],
          ["Take the centerpiece off the throne", "b", { resolve: 2, clue: 1 }, "On the throne: a Faithful bishop's regalia, reported lost at sea. The sea, it turns out, is not where it went, and the Faithful will want to know that."]),
        "0": N("The exit-facing pile shifts as you lift from it, and beneath the gold, a tripline of gut runs taut into the dark ahead. The doubters' gifts were re-rigged as an alarm by someone who found them first.",
          ["Cut the line slack and re-knot it", "c", { supplies: 1, resolve: 1 }, "Steady hands give the line its tension back minus its trigger. You strip the pile above a defused alarm."],
          ["Lift everything in one motion before it pulls", "b", { supplies: 2, resolve: 1 }, "One clean jerk takes the gold and leaves the line quivering, untripped, a hair from singing. You do not breathe until you are three steps back."]),
        "1": N("The regalia comes up heavy, and under it, seated in the throne all along, a husk in bishop's vestments, hands open where the regalia rested. Its head tilts up at you. It has been waiting to be relieved of it.",
          ["Bow, and back away with the regalia", "s", { resolve: 2, clue: 1 }, "The husk returns your bow by crumbling to salt, duty discharged. In the salt: the bishop's true seal ring, which the regalia's buyers ashore will not be expecting anyone to hold."],
          ["Search the husk's vestments too", "b", { resolve: 2, finding: 1 }, "Within the rotted layers, sewn against the heart: the bishop's last letter, naming who sold the shrine district's protection to the cult, and for how much."]),
        "00": N("Down the tripline's length, in the dark ahead, something has taken up the slack anyway, slow and curious, reeling the line in hand over hand toward your end. The alarm is checking itself.",
          ["Tie the line off to the throne and step wide", "c", { supplies: 1, resolve: 1 }, "Whatever reels arrives at a throne instead of a thief. You watch from the wall shadow as a long gray arm pats the empty seat, shrugs, and withdraws."],
          ["Yank the line back, hard", "b", { resolve: 2, supplies: 1 }, "You set the hook like a fisherman. The dark yelps, recognizably, and the line goes slack for good. Things that yelp can be hurt, and now the lair knows you know."]),
        "01": N("Your clean jerk was not clean enough. One coin rings off the stone, once, perfectly clear, and the dark ahead leans into the doorway. Not entering. Listening, with its whole shape.",
          ["Freeze until the shape withdraws", "c", { supplies: 1, resolve: 1 }, "A hundred breaths of stillness and the listening shape pours back into the lair. You finish your work in pantomime silence and leave the coin where it sang."],
          ["Roll more coins, build a rhythm, and work to it", "u", { supplies: 2, resolve: 1 }, "You give the dark a beat to listen to and rob the room inside the rhythm. It sways at the threshold, lulled, until your bag is full and the last coin spins down flat."]),
        "10": N("Salt from the crumbled husk spreads across the floor and the offerings standing in it begin to weep moisture, every instrument and blade beading like cold glass. The room is grieving its keeper, and the grief is rising as fog.",
          ["Gather what the fog reveals", "u", { supplies: 1, resolve: 1, clue: 1 }, "In the fog, only the truly valuable offerings stay dry. You harvest by touch the warm and the dry, and they are the pieces worth carrying."],
          ["Carry the husk's salt to the dark doorway", "b", { resolve: 2, finding: 1 }, "You spread the keeper's salt across the lair's threshold like a final office. The fog follows it and stands in the doorway as a gray wall, and through the wall you hear the lair shifting back from a barrier it respects. The fog will hold when you enter. You have given yourself an ally."]),
        "11": N("The letter names a living harbor official, and as you finish reading, the husk's open hands close, slowly, into fists. The room's offerings rattle once, all together. The antechamber has heard the name too, and remembers it.",
          ["Copy the letter and reseal it in the vestments", "c", { resolve: 1, clue: 1 }, "Original interred, copy in your coat. If the harbor official's friends ever search you, the evidence will still exist where only you can lead the Faithful."],
          ["Hold the letter high and read the name aloud", "b", { resolve: 2, clue: 1 }, "At the spoken name, every offering in the room turns to face the exit, the harbor, the world above. The antechamber has chosen its testimony, and the arrangement itself is now evidence a priest can read."]),
        "L4": N("Offerings are sliding across the floor of their own weight, re-arranging into a corridor that points you at the dark doorway. The room has decided you are also an offering, and it is presenting you.",
          ["Walk the corridor but strip it as you go", "c", { supplies: 2 }, "If the room insists on a procession, the procession will be paid. You lift treasure from both walls of the corridor the whole way to the threshold, and step aside at the door."],
          ["Overturn the throne to break the pattern", "u", { supplies: 1, resolve: 2 }, "The throne hits the stone like a felled mast and the room's geometry collapses into honest clutter. In the wreck of the pattern, you take what you like and leave by the door of your own choosing."]),
        "L5": N("The corridor of offerings has closed behind you and narrowed ahead, and the dark in the doorway is no longer waiting. It is reaching, long and patient, to accept the room's gift. Last attempt before it does.",
          ["Hurl the bishop's regalia into the reaching dark", "u", { resolve: 2, supplies: 1 }, "It catches the regalia the way a congregation catches a verdict, and withdraws to examine its bishop. You cross the emptied threshold sideways, unaccepted."],
          ["Light the offering corridor behind you and charge", "b", { resolve: 2, supplies: 1, clue: 1 }, "Lantern oil down the procession and one spark. You enter the lair ahead of a wall of burning gifts, and the dark recoils from the light of its own treasury. You arrive lit, loud, and on your own terms."]),
      } },
    ],
    boss: {
      stages: [
        BS("Chorus-Maw fills the lair: a mound of flesh and melted votive wax the size of a chapel, studded with dozens of stolen human mouths, every one singing the same low note. The cult grew it to sing something awake in the deep, and the song is nearly done.",
          ["Circle wide and strike the lead mouth", "Your blade opens the largest mouth mid-note. The song stumbles, and for one full second the warren is silent for the first time in years."],
          ["Charge the mass head-on, blade first", "You hit it like a ram and carve through wax and worse. Two mouths die mid-verse and the chord drops a register, wounded."]),
        BS("The Maw peels itself from the wall and comes on like a congregation standing all at once. Its mouths cycle through borrowed voices now, dockhands and coin-tellers and the keep's daughter, all asking you to stay.",
          ["Ignore the voices, cut the joining seams", "Where the borrowed mouths join the mass, the flesh is thin. Your blade opens a seam and a voice pours out of it, free."],
          ["Answer one voice by name, then strike", "The named mouth falters, remembering. In its grief the Maw drops its guard, and you put your blade through the opening twice."]),
        BS("Half its choir dead, the Maw anchors itself across the lair mouth and splits down the middle into one vast throat. No more borrowed voices. Its own voice now, building toward the note the whole warren was carved to carry downward.",
          ["Hurl wax and debris down the throat", "You feed it everything in reach and the great note dies to a gag. It tears the blockage free, but the song must start its measure again."],
          ["Climb the wax shelf and attack the throat's root", "Up the cooling drip-shelf to where the throat anchors, and your blade goes in at the join. The note collapses into a scream with no audience below."]),
        BS("Ruined and leaking hymn from every wound, Chorus-Maw gathers its last hundred breaths for the final note, the one the deep has been counting toward. The walls lean in to listen. Finish it before the song finishes first.",
          ["Strike the breath from it before the note", "Your blade finds the bellows-organ at its core and the note dies as a gasp. Far below, something that had risen an inch settles back down, disappointed."],
          ["Strike on the note's first beat", "You let it begin, and land your blow on the upbeat where its whole mass is committed to the song. The note breaks across your steel, and the silence after is total."]),
      ],
      stagger: [
        BS("Your attack fails and the Maw incorporates the moment into its song: a new verse, in your own voice, sung back at you note-perfect. It learns its attackers. It is learning you.",
          ["Change your rhythm entirely and strike off-beat", "You attack on no count it can predict and your blade lands ugly and effective. Art is for things with time to spare."],
          ["Sing along, then strike on the shared note", "You join your own stolen voice, and when the Maw commits to the harmony, you break it from inside with steel."]),
        BS("The borrowed voices have stopped asking you to stay. They are warning you now, urgently, in the voices of people you know: behind you, left, the wax, watch the wax. The Maw is using their care for you as choreography.",
          ["Trust nothing, watch only the mass itself", "You shut the voices out and read the flesh. Its true tells are in the wax-shudder, and your next blow lands where the shudder began."],
          ["Do the opposite of every warning", "Each false warning maps the real attack by inversion. You step into the strike the voices begged you to dodge, and cut the limb that was waiting elsewhere."]),
        BS("The great throat has tasted your failed attack and added your blade's note to its song. Steel rings in its chord now. The warren's walls are beginning to hum in sympathy, loose stones rattling toward the lair.",
          ["Strike a different surface, change your steel's note", "You drag your blade across the stone mid-charge, retuning it sour. The throat's chord rejects the new note and the sympathy collapses."],
          ["Throw your blade into the throat and follow it", "Steel first, body after. The Maw chokes on your sword and your hands finish the argument from inside its guard."]),
        BS("The final note has begun beneath your failure, the first sustained syllable rolling down through the warren's carved floor toward the deep. Every mouth left alive joins it, one by one. Seconds remain in the measure.",
          ["Drive your blade where the syllable is born", "Down through the throat's root mid-syllable. The note shears off unfinished, and the unfinished part was the part that mattered."],
          ["Collapse the lair mouth onto the Maw", "You cut the wax-laden keystone above it and bring the warren's own ceiling down across the great throat. The note ends under a hundred tons of stolen offerings, and so does the singer."]),
      ],
    },
  },
  // =========================================================================
  orchard: {
    rooms: [
      { name: "Drowned Hedgerow", nodes: {
        "": N("A hedge of the World Tree's lesser branches rings the grove, drowned but alive, leaves silver under a fathom of clear water. Golden fruit hangs in the hedge where anyone could take it. Nobody has.",
          ["Pick the low fruit, gently", "s", { supplies: 1 }, "The branch lowers as you reach, offering. Three golden fruit, heavy as bread, and the hedge settles back like a duty done."],
          ["Dive the hedge's roots for windfalls", "u", { supplies: 2 }, "Among the roots, decades of fallen fruit, preserved whole by the cold. You bag the best and the roots curl politely out of your way."]),
        "0": N("A fruit drops before your fingers touch it and sinks out of reach, and the whole hedge pulls its branches up like a hem from mud. It has decided you grabbed.",
          ["Open your hands and wait it out", "c", { supplies: 1 }, "Patience reads as apology here. A single branch lowers again, slower, and lets you take from it like a wary dog taking meat."],
          ["Climb the hedge to the fruit it lifted", "b", { supplies: 2 }, "You climb living silver in plain view of its disapproval and harvest from the crown. The hedge allows it the way a queen allows a rudeness: once."]),
        "1": N("Roots close around your boot at the windfall pile, not crushing, just holding, and the silver leaves above you turn dark side out. You are caught in the hedge's oldest reflex: keep.",
          ["Offer something of yours into the pile", "s", { supplies: 1, clue: 1 }, "You add your knife to the windfalls. Trade reads as kinship, the roots release, and in releasing they uncover a Bough courier's satchel kept here, undelivered, since the Fall."],
          ["Cut the root holding you", "b", { supplies: 2, resolve: 1 }, "Sap clouds the water and the hedge recoils in real pain. You take your harvest in the space its flinch leaves, and the grove now knows your blade."]),
        "00": N("The wary branch stops an arm's length short and stays there, trembling. Past the hedge, deeper in the grove, something tall has turned to watch the exchange. The hedge is waiting for permission.",
          ["Hold still beneath the watcher's eye", "c", { supplies: 1, clue: 1 }, "Permission falls like a change in the light. The branch completes its offer, and you mark where the tall watcher stands. Knowing the warden's post is worth more than fruit."],
          ["Take the fruit from the trembling branch yourself", "u", { supplies: 2 }, "You close the gap the branch cannot, and the hedge exhales relief. Apparently boldness was the etiquette all along: the watcher turns away, satisfied."]),
        "01": N("Halfway up, the hedge begins to grow under you, fast, crown rising away from your climb like a tide you cannot out-swim. It means to strand you where the air is.",
          ["Stop climbing and harvest where you cling", "s", { supplies: 1 }, "You strip the branches in reach while the crown flees upward. The hedge, finding you immune to the game, sulks back down to height."],
          ["Race the growth to the crown", "b", { supplies: 2, finding: 1 }, "You beat the growing crown by one desperate lunge and find, woven into its highest fork, an abandoned nest of silver twigs around three fruit grown into one. A Bough scholar will weep over it."]),
        "10": N("The courier's satchel strap is grown through with root, and as you work it free, the roots spell letters against the grove floor, slow as honey: NOT YOURS. The hedge can write. It has been waiting to.",
          ["Write back in the silt: WHOSE", "u", { clue: 1, finding: 1 }, "The roots spell a name, an old Bough name, and then an arrow toward the grove's heart. The satchel is a delivery, and you have just been hired to finish it."],
          ["Take the satchel and let the letters stand", "b", { supplies: 1, clue: 1 }, "You finish freeing the strap over the hedge's objection. Inside: sealed Bough dispatches from before the Fall, and the seal is a kind the Boughs stopped using because it stopped working. This one is still warm."]),
        "11": N("Your cut root bleeds sap that hardens to amber mid-water, and the amber is forming around your other boot, building up your leg in warm gold layers. The hedge has chosen preservation as its revenge.",
          ["Shed the boot and pull free", "s", { supplies: 1 }, "One boot to the grove's collection. You harvest the windfalls one-footed and leave the amber a trophy it can keep."],
          ["Hold still and let the amber take your knife arm too, then flex", "b", { supplies: 1, resolve: 1, finding: 1 }, "The amber sets, you shatter it from inside with one trained motion, and the hedge flinches root to crown. In the broken amber: your knife, returned, and a perfect amber sphere with a silver leaf inside, the kind Bough elders wear as proof of the Tree's favor."]),
        "L4": N("The whole hedgerow is moving now, branches weaving a dome over the grove entrance, fruit withdrawing into knots of silver. Your welcome has run out, and the harvest is closing like a fist.",
          ["Take the open path while one remains", "c", { supplies: 1 }, "You slip through the closing weave with what you carry. Behind you the hedge knots shut, and one last fruit drops through the gap at your heel. Severance pay."],
          ["Wedge the weave open with your pry bar", "u", { supplies: 2, resolve: 1 }, "Iron holds the gap while you strip the nearest knots of their withdrawn fruit. The hedge strains against the bar, dignified and furious, until you withdraw it with a bow."]),
        "L5": N("The dome is sealed, the silver gone dark, and roots rise from the grove floor in ranks between you and every exit. The hedgerow has decided you will stay and feed the grove. Last attempt.",
          ["Climb the dome and cut through the thin crown", "u", { supplies: 1, resolve: 2 }, "At the dome's top the weave is one season young and your blade knows it. You drop through onto open ground with the hedge's roar shaking fruit loose around you. You take those too."],
          ["Press a golden fruit back into the oldest root", "b", { supplies: 2, resolve: 1, clue: 1 }, "Returned fruit, freely given. The ranks of roots stop, consider, and part like a tide. As you pass, every branch you walk under lowers one fruit to your shoulder, and the dome opens onto the grove's heart-path. You leave as kin."]),
      } },
      { name: "Warden Stones", nodes: {
        "": N("Standing stones circle a clearing in the drowned grove, each carved as a Bough warden at attention, each draped in real armor gone green. Between them, offering bowls of pre-Fall coin nobody has dared.",
          ["Lift coin from the bowls, eyes on the stones", "u", { supplies: 2 }, "Coin by coin, watching eight stone faces for movement. They grant you the harvest the way sentries ignore a mouse: beneath response."],
          ["Strip the armor from the nearest warden", "b", { supplies: 2, resolve: 1 }, "Bough-bronze, salvageable, and under the breastplate a carved heart-cavity holding the warden's true name on a plaque. Armor and name both come away with you."]),
        "0": N("A bowl rings as your knuckle grazes it, and one stone warden's head is no longer facing where it faced. No grinding, no movement seen. Just a different vigilance, aimed at you.",
          ["Bow to the turned head and continue slower", "c", { supplies: 1 }, "Acknowledged sentries permit more than ignored ones. The head holds its new angle and the bowls yield to your now-respectful hands."],
          ["Empty the watched bowl first, defiantly", "u", { supplies: 2 }, "You take the coin in full view of its turned face. Stone cannot escalate, you wager, and the wager holds: the head turns back, almost approving of the nerve."]),
        "1": N("As the breastplate comes free, the stone beneath is warm, and a heartbeat moves under your palm. Slow as seasons, but a heartbeat. The wardens are not memorials. They are sleeping.",
          ["Re-hang the armor and take only the bowls", "s", { supplies: 1, clue: 1 }, "Armor restored, sleeper unwoken. The bowls empty into your bag while eight slow hearts keep their watch, and you keep the secret of them, which is worth more."],
          ["Press your ear to the warm stone and listen", "b", { resolve: 1, finding: 1 }, "Inside the stone, under the heartbeat, a voice keeps muttering one report over and over, a sentry's last watchword from the night of the Fall. You learn what the wardens saw coming, and from which direction."]),
        "00": N("Your slow respectful circuit reaches the eighth bowl and finds it already empty, polished clean, with small wet footprints leading away between the stones. Something else robs this circle, and recently.",
          ["Follow the wet prints", "u", { supplies: 1, clue: 1 }, "The prints lead to a hollow stone and a cache: the circle's missing coin, years of it, hoarded by something small that flees deeper as you arrive. You take the hoard and note where the small thief ran."],
          ["Stake out the empty bowl instead", "s", { supplies: 1, clue: 1 }, "The thief returns within the hour: a drowned grove-sprite, ragged, loyal, still doing its job of gathering offerings for wardens who cannot spend them. You let it see you leave coin in the bowl, and it lets you see which stone it serves."]),
        "01": N("Defiance, the circle has decided, deserves an answer. Every bowl in the clearing slides one hand-width toward the center, and the stones' shadows are no longer matching the light.",
          ["Step out of the shadow-lines and keep working", "c", { supplies: 1 }, "You read the false shadows like rigging lines and work the bowls from their gaps. The circle, finding you unsweepable, lets its shadows fall slack."],
          ["Stand your ground inside a shadow deliberately", "b", { supplies: 1, resolve: 2 }, "The shadow closes over you cold as deep water and finds nothing in you that flinches. It withdraws, and the stones grant what stones can grant: the centermost bowl, the commander's bowl, slides to your feet."]),
        "10": N("Re-hanging the armor, your hand brushes the warden's stone fingers, and they close. Gently. Around your wrist. The sleeper is holding your hand the way the wounded hold a healer's.",
          ["Stay held, and stand the watch a while", "c", { resolve: 1, finding: 1 }, "You stand sentry beside it through one turn of the light. When the fingers open, a stone tear sits in your palm, hard as diamond, carved inside with the grove's name for the thing it guards against."],
          ["Slip free finger by finger", "u", { supplies: 1, resolve: 1 }, "Patience unworks the grip without waking the rest of it. As the last finger lifts, it points, deliberately, at the southern stones, and you understand: that is where the circle is weakest. Worth knowing, either to defend or to leave by."]),
        "11": N("The watchword repeats faster under your ear, urgent now, and the other seven stones take it up in their sleep, a relay of murmurs circling the clearing. You have woken the report, and the report is trying to complete itself after all these years.",
          ["Carry the watchword to the head warden stone", "u", { resolve: 1, finding: 1, clue: 1 }, "You speak the report to the tallest stone, sentry to commander. The circle sighs and falls silent at last, watch discharged, and the head warden's bowl opens a seam offering its true contents: the grove's muster roll, with one name struck out in fresher ink."],
          ["Shout the watchword aloud yourself", "b", { resolve: 2, clue: 1 }, "Your voice completes the relay and the clearing answers like a garrison: every bowl uncovers, every shadow snaps to attention, and for as long as you stand there you are, by acclamation, the watch officer. You inspect, and you requisition."]),
        "L4": N("Stone is grinding now in truth, eight wardens turning by degrees to face the clearing's center, where you stand. Bowls have withdrawn into the earth. The circle is taking up arms slowly, the only way it can, and slowly is still arriving.",
          ["Leave the circle before the turn completes", "c", { supplies: 1 }, "You cross the perimeter as the eighth head comes around, and the wardens find their center empty. Outside the stones, what you carry stays carried."],
          ["Stand at attention and salute the turning circle", "u", { supplies: 1, resolve: 2 }, "Eight stone gazes arrive on a figure standing inspection-straight, fist to chest. Sentries do not strike a saluting soldier. The grinding stops, and you walk out between them through a corridor of grudging respect."]),
        "L5": N("Fully turned, fully woken, the wardens step down off their plinths, armor seams shedding moss, and the clearing's exits close behind green-bronze shoulders. The watch has its orders, and its orders are old and simple. Last attempt.",
          ["Duck the closing ranks through the southern gap", "u", { supplies: 1, resolve: 2 }, "The southern stones are slowest, just as the sleeper's finger promised. You are through the gap before their reach closes, and stone cannot pursue past its circle."],
          ["Return the warden's name-plaque to its heart", "b", { resolve: 2, supplies: 1, finding: 1 }, "You press the stolen name back into the carved cavity, and the warden it belongs to halts mid-stride. It looks at its restored heart, then at you, and raises one fist: not to strike, but the old Bough sign for pass, friend. The circle grounds its arms, and the named warden's own bowl, the one buried deepest, surfaces at your feet in thanks."]),
      } },
      { name: "Heartwood Hollow", nodes: {
        "": N("The grove's heart: a hollow in the fallen trunk itself, and inside, a sapling growing downward from the ceiling of heartwood, leaves of actual gold, roots reaching for the sea floor. It is almost touching. The water here hums against your teeth.",
          ["Harvest the gold leaves within reach", "u", { resolve: 2, supplies: 1 }, "Each leaf comes away with a struck-bell note that the hollow holds and savors. Gold that grew, not gold that was mined, and ashore there are those who will know the difference."],
          ["Collect the sap beading at the sapling's wound-knots", "b", { resolve: 2, finding: 1 }, "The sap fills your vial like liquid noon. Where each bead leaves the bark, the wood heals instantly behind it. The Boughs have legends about this sap, and the legends underbid it."]),
        "0": N("A harvested leaf crumbles to ordinary dead gold-leaf in your bag, and the sapling pulls its branches upward, away, leaves cupping shut like hands around coins. Taken wrongly, the gold does not survive the taking.",
          ["Hold a leaf and wait for it to release", "c", { resolve: 1, supplies: 1 }, "You cradle one cupped leaf without pulling until it opens and lets go into your palm, whole and ringing. Given gold keeps. You harvest at the speed of its giving."],
          ["Catch the leaves it sheds upward", "u", { resolve: 2, supplies: 1 }, "It sheds to escape you, and shed leaves are freely fallen. You swim the rising gold flurry with your bag open and take what the sapling chose to lose."]),
        "1": N("Your vial fogs, and the sap inside is climbing the glass, pouring upward out of the vial's mouth in a thin golden thread, trying to return to the wound it left. The sapling is reeling its blood back in.",
          ["Seal the vial and let the outside thread go", "s", { resolve: 1, finding: 1 }, "Cork beats thread. What is sealed stays yours, and the climbing remnant rejoins the sapling without grudge. Half a vial of grown sunlight is plenty to start a war of scholars."],
          ["Follow the golden thread up to the wound", "b", { resolve: 2, finding: 1 }, "The thread leads your eye to where all the wound-knots pattern together, and the pattern is script: the Tree's own bark-writing, naming what wounded the sapling. It was not the Fall. It was a blade, and the script names whose."]),
        "00": N("The leaves release slower and slower, and the hollow's hum has risen a tone, and beneath the hum, the heartwood walls are creaking inward by inches. The hollow is closing protectively around its child, with you inside the embrace.",
          ["Take your harvest and back out now", "c", { resolve: 1, supplies: 1 }, "You withdraw through the narrowing mouth with what was given. Behind you the hollow seals to a slit, satisfied, and the hum drops back to a lullaby."],
          ["Press your palm flat to the sapling's stem first", "u", { resolve: 2, finding: 1 }, "Skin to gold bark, and the hum pours through you like sun through shallow water. The walls halt. When you take your hand away, your palm carries a leaf-shaped mark that Bough elders will kneel to, and the hollow lets you both go."]),
        "01": N("A shed leaf slices your reaching hand, fine as paper, and your blood threads the water between you and the sapling. The downward roots all bend toward the thread at once, tasting, deciding. The Tree has your scent now, and the Tree is thirsty.",
          ["Withdraw your hand and bind it tight", "s", { resolve: 1, supplies: 1 }, "Bound and bloodless, you finish the harvest at arm's length. The roots strain after your withdrawn scent a while, then forget, the way trees forget."],
          ["Let three drops fall on the reaching roots, freely", "b", { resolve: 2, finding: 1, clue: 1 }, "Given blood, like given gold, keeps. The roots drink your three drops and the sapling shudders crown to tip, and one root curls back offering trade: caught in its grip since the Fall, a Bough signet of the old high line, the kind whose owners were all accounted dead. The Tree remembers who fed it. That is the legend. Now it remembers you."]),
        "10": N("The freely fallen flurry thins, and the last leaves hang in the water unfalling, points all swung toward the hollow's mouth behind you. Not a threat. A compass. Something has entered the hollow at your back, and the gold is pointing it out.",
          ["Turn slow with your blade low", "c", { resolve: 1, clue: 1 }, "A root-warden's silhouette fills the mouth, watching, counting leaves. You show it your bag of freely given gold and it withdraws a step: audit passed. You mark its patrol route on your way out."],
          ["Snatch the hanging leaves and dive past whatever it is", "b", { resolve: 2, supplies: 1 }, "You strip the compass mid-water and shoot the gap under a reaching limb the size of a keel. It pivots after you exactly too slow, and you exit the hollow richer and unidentified."]),
        "11": N("Named, the script's letters are sinking back into smooth bark, hiding the testimony, and the hollow's hum has gone discordant. The sapling does not want this read. Or something in the grove does not want it read, and the sapling is afraid.",
          ["Copy the fading script faster than it hides", "u", { resolve: 1, finding: 1, clue: 1 }, "Charcoal flies and you take the last line as it dives beneath the bark. The blade-bearer's name, the season, and one word more: AGAIN. Someone wounded the heart of the world on a schedule."],
          ["Press your blade flat to the bark in answer", "b", { resolve: 2, finding: 1 }, "Steel against the wound-script, an oath the Tree's way. The bark stills, then opens one final knot above your blade and lets a single seed drop into your collar. Heavy as a musket ball. Warm as a coal. There has not been a new World Tree seed since before the Fall."]),
        "L4": N("The hollow has had enough of visitors. Heartwood groans inward in earnest, the hum is a war-drone, and the downward roots have spread into a cage between you and the sapling, gold leaves dimming behind living bars.",
          ["Harvest the cage-roots' own beading sap as you retreat", "c", { resolve: 1, finding: 1 }, "Even its defenses bleed gold. You vial what the bars weep, walking backward, and the hollow lets the polite thief reach the mouth."],
          ["Slip between the bars for one last leaf", "u", { resolve: 2, supplies: 1 }, "Through the cage sideways, one leaf taken from the dimming crown, and back out through the closing gap with bark scoring your shoulders. The leaf in your fist burns brighter than all the rest combined. Last-leaf, the Boughs call it. They thought it was a metaphor."]),
        "L5": N("Roots cage, walls close, and the sapling's downward crown has begun to glow white-gold, overcharging, the hum climbing toward a note you can feel in your spine. The hollow would rather spend its child's light than lose it. Last attempt before it does.",
          ["Dive out through the sealing mouth", "u", { resolve: 2, supplies: 1 }, "You shoot the closing slit with a hand's width to spare and the hollow seals behind you with a boom that flattens the silt. Through the heartwood at your back, the overcharge dims, saved, and what you carry out still rings when shaken."],
          ["Kneel and plant your harvest's worst leaf in the sea floor beneath the sapling", "b", { resolve: 2, finding: 1, clue: 1 }, "Gold returned to the reaching roots' destination, the gesture the whole grove was grown around. The downward roots touch your planted leaf, then the sea floor, at last, after all these years. The hum resolves into a chord, the cage opens like a gate, and the hollow's walls show you out through a corridor grown in real time. Behind you, where root met floor, something has begun that the Boughs would trade fleets to witness. You witnessed it free."]),
      } },
    ],
    boss: {
      stages: [
        BS("Old Root-Jaw rises from the grove floor between you and the heart-path: a giant grown of root and salvaged whale jawbone, kelp-bearded, barnacle-armored, the grove's last warden. It plants a trunk-thick club of heartwood and points at the way you came. One warning. It will not give two.",
          ["Strike its planted club arm first", "Your blade bites the wrist-roots and the club drops a hand's width. Sap wells dark from the cut, and the giant's bearded head tilts: it has not bled in a long time."],
          ["Charge between its legs and cut the knee-roots", "Under the swing, blade dragging through both knee-bundles as you pass. Root-Jaw staggers a full step and the grove floor shakes loose a rain of silver leaves."]),
        BS("Bleeding sap, Root-Jaw stops warning. The club sweeps in flat arcs that mow the kelp like grass, and where it strikes stone, roots burst from the impact and grab at your ankles. The whole grove floor fights for it.",
          ["Bait a swing into the standing stones", "The club meets a warden stone and stone wins. In the recoil's long second, your blade opens the giant's side from hip to ribs."],
          ["Ride a grabbing root up to its shoulder", "The grove's own grip becomes your ladder. From its shoulder you drive steel down into the join where jawbone meets root, twice, before it tears you loose."]),
        BS("Half its armor of barnacle hangs in sheets and the club is splintered to a stake, but Root-Jaw plants itself over the heart-path and roots its own legs into the floor. It will not retreat, and now it cannot. It has chosen where it dies, and it intends company.",
          ["Cut the roots it just grew, wound by wound", "Anchored things cannot dodge. You work around it like a forester, severing what it planted, and each cut root whips back into the dark trailing its strength."],
          ["Attack the kelp beard where the throat would be", "Through the beard, into the dense root-weave beneath, and your blade finds something that was a heart when the warden still had one. The giant's roar shakes fruit from trees a grove away."]),
        BS("On rooted, ruined legs, Old Root-Jaw raises the splintered stake overhead for one last piledriver of a blow, the whole grove's silt rising around it like a held breath. It guarded this place before your harbor had a name. End its watch, or be ended by it.",
          ["Step inside the blow and strike the heart-weave", "The stake falls where you were and your blade is already home in the root-heart. Old Root-Jaw folds with a sound like a forest sitting down, and its open hand comes to rest pointing, gently, along the heart-path. The last order of the watch: go on, then."],
          ["Meet the stake with your blade at the join", "Steel finds the splinter-line and the stake bursts to kindling around you. Off-balance, hollow-handed, the giant takes your answering thrust through the heart-weave and comes down kneeling, then bowing, then still. The grove's hum drops to a single low note. Mourning, or relief. Perhaps both."]),
      ],
      stagger: [
        BS("Your opening fails and Root-Jaw makes you pay tuition: the club's backswing clips the kelp where you land, and the giant resets its stance over the heart-path, patient as winters. It has done this before, against better.",
          ["Feint at the club arm, strike the planted foot", "It guards what you taught it to guard. The unguarded foot-roots take your blade to the bundle, and the giant's stance loses its mathematics."],
          ["Throw silt and strike through the cloud", "The grove's floor in its eyes, your steel through the cloud after. It cannot block what arrives unannounced, and this arrives twice."]),
        BS("The grabbing roots have your measure now, rising where you will be instead of where you are. Root-Jaw drives you in a slow spiral toward the hedgerow wall, herding, the way wardens herd poachers toward a gate that is also a cage.",
          ["Reverse the spiral against the herding", "You turn into the push instead of from it, and the pattern breaks against its own momentum. Your blade meets the giant mid-correction, where balance lives."],
          ["Let it herd you to the wall, then climb and leap", "The hedgerow makes a fine springboard. You come off the living wall above its guard entirely and land blade-first on the jawbone crown."]),
        BS("It catches your failed strike in one root-knuckled fist, blade and all, and holds the steel up to its barnacled face, considering, the way an old soldier considers a recruit's weapon. Then it bends the blade a degree, just to show you it can, and lets go.",
          ["Take the lesson and strike the open fist", "Its moment of instruction is a moment of stillness. Your bent blade goes through the offered palm and up the root-tendons of the arm behind it."],
          ["Drop the blade, take up a warden stone fragment", "You fight grove with grove. The stone fragment cracks barnacle armor your steel only scratched, and Root-Jaw recoils from a blow that feels, to it, like the circle itself dissenting."]),
        BS("Your last failure lands you in the silt at its rooted feet, inside the fall of the raised stake's shadow, nowhere left to be herded. The grove holds its breath. Even the silver leaves stop turning. Root-Jaw looks down at you the way the old look at the young, and brings the watch's whole weight down.",
          ["Roll between the rooted legs and strike the heart-weave from behind", "Rooted legs cannot turn. You are through and rising before the stake lands, and your blade enters the heart-weave where its armor never grew. The watch ends facing the wrong way, which is to say: it ends."],
          ["Catch the blow on a warden stone raised in both hands", "Heartwood meets warden stone above your head and the grove must choose between its own. The stone holds. The stake shatters. And in the shower of splinters your blade goes home through kelp and root and time, and Old Root-Jaw comes down around you soft as falling leaves."]),
      ],
    },
  },
  // =========================================================================
  skylift: {
    rooms: [
      { name: "Mooring Spine", nodes: {
        "": N("Docking clamps hang along the fallen mooring spine, and they snap at your lantern as you pass. The mechanisms are still alive, grabbing for airships that stopped coming years ago. Copper signal-line runs the full length of the spine, worth good coin if you keep your hands.",
          ["Walk the dead centerline, out of reach", "s", { supplies: 1 }, "The clamps cannot stretch to the spine's center. You strip thirty feet of copper in peace while they snap at your light from both sides like chained dogs."],
          ["Feed a clamp some scrap and gut its housing", "b", { supplies: 2, clue: 1 }, "It crushes the scrap and holds, jammed. Inside the housing: the line, the windings, and a flight log someone stuffed there for safekeeping. The last entry is a heading, not a landing."]),
        "0": N("A clamp on a frayed cable swings wider than its brothers and catches your sleeve at the centerline. The cloth tears free, but now every clamp on the spine is straining toward the taste of you.",
          ["Douse the lantern and work by feel", "c", { supplies: 1 }, "Blind clamps snap at memories. In the dark you strip the line by touch, slow and silent, and the mechanisms settle back to sleep one by one."],
          ["Hurl the torn sleeve down-spine as a decoy", "u", { supplies: 2 }, "The clamps converge on your sleeve like gulls on bread, and the abandoned stretch of spine gives up its copper to you uncontested."]),
        "1": N("Your jammed clamp shrieks against the scrap, and down the spine, its brothers answer: every clamp opening and closing in sequence toward you, a wave of iron applause coming your way.",
          ["Duck under the spine and let the wave pass", "s", { supplies: 1 }, "You hang beneath the great beam while iron gnashes overhead, then climb back up behind the wave and strip the line it left unguarded."],
          ["Race the wave to the junction box", "b", { supplies: 2, clue: 1 }, "You beat the closing iron to the box and throw its lever. The whole spine sags dead at once, and the box's manifest plate lists what the last three ships actually carried. Not passengers."]),
        "00": N("In the dark, your hand finds copper, then leather, then fingers: a salvager's glove still gripping the line, its owner long gone, hand and all. The clamps got someone here once, working blind, exactly as you are.",
          ["Take the glove's grip-point and work past it", "c", { supplies: 1, clue: 1 }, "Where the dead salvager anchored is the line's best purchase. You inherit the technique and the stretch of copper they died holding, and you mark the spot for whoever asks after them ashore."],
          ["Relight one shutter's worth and survey first", "u", { supplies: 2 }, "A blade of light, fast, then dark again. In the flash you mapped every clamp's reach along this stretch, and you strip the safe channels between them at speed."]),
        "01": N("The clamps abandon your decoy faster than they should and swing back hunting, and now they are not snapping at light or cloth. They are listening, housings tilted, tracking the sound of your breath.",
          ["Breathe with the swell and move between waves", "s", { supplies: 1 }, "The sea breathes louder than you do, if you let it. You time your work to the surge against the spine and the clamps chase the bigger breather."],
          ["Stuff your collar in your teeth and sprint the strip", "b", { supplies: 2 }, "Muffled and reckless, you tear the line free at a run, one length ahead of snapping iron the whole way. At the spine's end you spit out your collar and laugh, mostly from relief."]),
        "10": N("Beneath the spine, your handholds are not all iron. Something has built nests in the under-struts, woven of wire and feathers and finger bones, and the nests are warm.",
          ["Move along the cold struts only", "c", { supplies: 1 }, "Cold iron carries no tenants. You traverse the safe line beneath the gnashing and come up where the copper hangs lowest."],
          ["Rob the nearest nest on your way past", "u", { supplies: 1, finding: 1 }, "Wire-birds hoard what shines. In the warm weave: rings, a watch, a signal-officer's badge, and one message capsule, sealed, that never reached its tower."]),
        "11": N("Your lever choice was a coin flip and the coin lands wrong: the spine does not die, it wakes fully, clamps cycling at speed, and the junction box begins to tick like something deciding.",
          ["Throw the lever back and ride the shutdown", "s", { supplies: 1 }, "Reversed, the box sighs and powers the spine down stage by stage. You strip copper behind the dying wave, harvesting the system as it falls asleep section by section."],
          ["Tear the box's fuse rack out entirely", "b", { supplies: 2, resolve: 1 }, "Sparks, a shriek of every clamp at once, then total dead silence down the whole spine. The fuse rack itself is pre-Fall crystalwork, and ashore it is worth more than all the copper on this beam."]),
        "L4": N("The spine is thrashing now, clamps tearing at their own cables, sections of beam shaking loose rivets that rain into the dark below. The structure has worked itself into a frenzy and the copper is the only calm thing left on it.",
          ["Take the coil you have and dismount", "c", { supplies: 1 }, "Enough is a load you can carry. You drop from the bucking spine to solid wreckage with your coil and let the iron exhaust itself behind you."],
          ["Cut the master line at the spine's root", "u", { supplies: 2, resolve: 1 }, "One cut at the source and the whole signal-line comes free in a single mile-long pull, the spine's frenzy slackening as its nerves leave it. You coil until your shoulders give out."]),
        "L5": N("The mooring spine is tearing free of its last anchor, whole beam groaning sideways into the dark with you aboard, clamps still snapping as it falls. Wherever it lands, it lands without you or with you. Last attempt.",
          ["Ride it down and jump at the bottom of the arc", "u", { supplies: 2, resolve: 1 }, "You surf a falling cathedral and step off at the soft moment, coil on your shoulder, as the spine buries itself in the silt behind you with a boom you feel in your teeth."],
          ["Swing on the master line clear of the fall", "b", { supplies: 2, resolve: 1, clue: 1 }, "Copper holds. You pendulum off the dying beam and land in the wreck of the harbormaster's gantry, and the gantry's strongbox, sprung open by the impact, has been waiting years to be this convenient."]),
      } },
      { name: "Ticket Hall", nodes: {
        "": N("A grand ticket hall lies on its side, queue-rails overhead like rafters. Luggage is still stacked at the counters, tagged and waiting, and behind the toppled counters sits the stationmaster's strongbox, visibly intact.",
          ["Work through the tagged luggage", "s", { supplies: 1 }, "Travelers pack their best for an air crossing. Coin, instruments, a captain's sextant, all tagged with destinations that no longer exist."],
          ["Go straight for the strongbox", "u", { supplies: 2 }, "The box's lock surrenders to patience. Fare money in pre-Fall notes and a drawer of confiscated weapons, each tagged with its owner's name and flight."]),
        "0": N("A luggage stack shifts as you pull from it and a hatbox tumbles, bursting open on the tile, and from inside, a chorus of small mechanical voices announces a boarding call for a flight a decade gone. Other cases nearby click awake and join in.",
          ["Silence them one by one, gently", "c", { supplies: 1 }, "Each clockwork crier winds down under your thumb. The hall returns to its long quiet, and the criers' brass works come along in your bag."],
          ["Loot fast while the announcements cover your noise", "b", { supplies: 2 }, "A hall full of boarding calls is the best cover a thief ever had. You strip three stacks in the din and leave as the last crier runs down mid-departure."]),
        "1": N("The strongbox is intact because it is bolted to the counter, and the counter to the floor, and as your pick turns, a punch-clock above the counter chimes and begins printing a strip of paper. The hall is logging your shift.",
          ["Let it log you, work openly", "s", { supplies: 1, clue: 1 }, "You finish the lock as a registered employee. The punch-strip, when you take it, holds every login before yours, and the second-to-last is dated long after the crash."],
          ["Smash the punch-clock first", "b", { supplies: 2 }, "Brass and paper everywhere, and the strongbox opens to an unwitnessed thief. In the clock's wreckage, a key labeled CRYPT that some careful stationmaster hid where only the clock could watch it."]),
        "00": N("One crier will not wind down. It repeats a different announcement, quieter than the rest: final call, it says, for a passenger by name, and the name is on the manifest of a ship your harbor still mourns.",
          ["Take the crier whole, still calling", "u", { supplies: 1, clue: 1 }, "You bag it mid-announcement. Ashore, the mourned ship's families will want to hear this brass voice say the name, and want to know why the skylift was calling it after the sinking."],
          ["Open the crier and read its message spool", "s", { supplies: 1, finding: 1 }, "Inside, the full spool: the named passenger checked in, surrendered one item to the counter, and never boarded. The surrendered-item tag number is printed at the spool's end, and the luggage hall still honors tag numbers."]),
        "01": N("Under the third stack, your covering noise dies at the worst moment, and in the new silence you hear what was using it too: claws on tile, several sets, freezing when you freeze. You were not the only one looting under the announcements.",
          ["Back away slow and share the hall", "c", { supplies: 1 }, "Wreck-hounds, lean and patient, interested in the luggage meat-lockers and not in you, provided you keep it that way. You keep it that way, and keep the aisles they ignore."],
          ["Bang two pot lids and charge the sound", "b", { supplies: 2 }, "Noise against noise, and yours is angrier. The pack scatters through a hole in the hall's glass roof, and their abandoned dig-site under the meat lockers holds the jewelry case they were never going to appreciate anyway."]),
        "10": N("The punch-strip's recent login has a locker number printed beside it, staff row, and the staff lockers stand behind the counters, all rusted shut except one, which is clean, oiled, and padlocked new.",
          ["Pick the new padlock", "u", { supplies: 1, clue: 1 }, "Inside: dry clothes, harbor coin, a bedroll, and a tide-chart of this wreck marked with safe routes. Someone lives in this station, and their chart now improves your odds considerably."],
          ["Leave it and watch the hall's exits instead", "c", { supplies: 1, clue: 1 }, "Patience pays in faces. Within the hour, a figure in a stationmaster's coat crosses the hall's far gallery without a light, walking routes it clearly knows blind. You chart its path and its door."]),
        "11": N("The CRYPT key is iron, old, and humming faintly against your palm, and the moment you lift it, every departure board in the hall flips at once, slats clattering, every line resolving to the same word: DELAYED.",
          ["Pocket the key and note the boards", "u", { supplies: 1, clue: 1 }, "DELAYED is a station's way of saying not cancelled. You write down which departures the boards still believe in, and the key rides your pocket pointing, always, slightly downward."],
          ["Hold the key up and ask the hall: delayed until when", "b", { resolve: 1, finding: 1 }, "The boards clatter through every slat they own and stop on a date. The date is this season, this year, and every board in the hall holds it, humming, until you lower the key. Something here still expects an arrival, and now you know when."]),
        "L4": N("The hall has turned hostile by degrees: criers screaming overlapping departures, hounds howling in the walls, boards flipping endlessly, and the punch-clock's wreckage printing strip after strip with your description on each one. The station is filing a report.",
          ["Take your haul and exit before the report finishes", "c", { supplies: 1 }, "You leave through the luggage chute as the strips pile up. Whatever reads them will read of a thief already gone."],
          ["Burn the strips and the report with them", "u", { supplies: 2, resolve: 1 }, "Lantern oil on the paper snake and the hall's account of you goes up in blue flame. In the strip-fire's light you spot the floor safe the counters hid, and its lock has been waiting decades for someone with your nerve."]),
        "L5": N("Every exit's grate has dropped, the boards all read one word now, HELD, and the stationmaster's coat-figure stands at the hall's far end with a lantern that does not burn, checking a pocket watch that does not tick. The station wants to process you. Last attempt.",
          ["Present a salvaged ticket at the counter and walk the gate", "u", { supplies: 1, resolve: 2 }, "Ritual beats reason here. Your tagged ticket, formally presented to an empty counter, lifts the nearest grate with a chime. You board nothing, exit everything, and the coat-figure touches its cap as you pass."],
          ["Throw the CRYPT key down the hall to it", "b", { supplies: 1, resolve: 2, clue: 1 }, "The figure catches the humming iron out of the air and stands very still. Every grate lifts at once. As you leave, it sets the key on the counter, slides it back toward you the full length of the hall, and points downward. An assignment, not a gift. The crypt expects you now."]),
      } },
      { name: "Engine Gallery", nodes: {
        "": N("Five lift-engines stand in a row down the gallery, each big as a chapel organ, four dead under silt and barnacle. The fifth is clean, oiled, and turning over slowly, and someone has chalked tally marks on its housing. The latest marks are fresh.",
          ["Strip parts from the four dead engines", "s", { supplies: 1, resolve: 1 }, "Valves, gauges, lift-gas regulators, all pre-Fall machining no forge alive can match. The dead four feed your bag and the fifth turns on, unbothered."],
          ["Inspect the live engine and its tally", "u", { resolve: 1, clue: 1 }, "The tally counts days, in sets that match supply runs, and the engine's output line runs down through the floor, freshly patched. Someone is keeping this engine alive to power something below. The crypt, the line's heading says."]),
        "0": N("A regulator comes free with a hiss and the dead engine it came from shudders, coughs silt, and tries, horribly, to turn over. Three of the four dead engines are not dead. They are dormant, and your salvage is waking them hungry.",
          ["Re-seat the regulator and calm it", "c", { supplies: 1, resolve: 1 }, "Eased back into place, the engine settles to dormancy, and you learn the lesson it taught: you strip the truly dead one only, and it gives generously."],
          ["Yank parts faster than they can wake", "b", { supplies: 2, resolve: 1 }, "You race three waking engines through their own boot sequence, harvesting ahead of each shudder. By the time they reach full cough, you and their best parts are at the gallery door."]),
        "1": N("The fresh chalk is fresher than you thought: a stick of it sits on the housing ledge, still dry, and from behind the live engine a voice says, not unkindly, that today's mark is not due till sundown, so you might as well come around where it can see you.",
          ["Step out, hands visible, and talk", "s", { resolve: 1, clue: 1 }, "An old Flier engineer, marooned since the crash, keeping the fifth engine alive out of duty and habit. He trades the gallery's layout and the crypt's schedule for harbor news and half your biscuit ration. Fair dealing on both sides."],
          ["Circle the engine the other way and observe first", "u", { resolve: 1, clue: 1, supplies: 1 }, "From the shadow side you watch him work: alone, armed with a wrench, talking to the engine like a shipmate. You also watch where he banks his salvage. Knowledge first, introductions later, and a parts cache located either way."]),
        "00": N("The truly dead engine's casing opens on something that is not machinery: a hollow nested with wire and feathers, and at its heart, sealed in a lift-gas bladder, a satchel someone hid inside the one engine guaranteed never to run again.",
          ["Take the satchel, leave the nest", "u", { supplies: 1, finding: 1 }, "Inside the bladder: the crash inquiry's missing evidence folder. Sabotage findings, names, and a conclusion that someone paid to keep inside a dead engine."],
          ["Search the nest's weave too", "b", { supplies: 1, finding: 1, clue: 1 }, "Wire-birds steal what shines and what matters looks alike to them. Woven through the nest: the satchel, two officers' badges, and a brass key stamped with the crypt's signal-sigil. The folder explains the crash. The key, perhaps, explains the folder."]),
        "01": N("Your harvesting race ends at the gallery door as the three woken engines find their voices together, and their voices are a chord, and the chord is answered: from below the floor, the live engine's output line thrums in response. You have made the gallery sing to the crypt.",
          ["Cut the output line before the answer completes", "u", { supplies: 1, resolve: 1, clue: 1 }, "Your blade through the patched line and the conversation dies mid-phrase. Whatever listens below got half a message, and the severed line's gas pressure reads, on its gauge, far higher than one engine should make. Worth knowing before you go down there."],
          ["Let the engines sing and time the reply", "b", { resolve: 2, clue: 1 }, "You stand in the singing gallery with your watch out like a harbor pilot. The reply from below comes in pulses, in pattern, and the pattern is a request: more. You now know the crypt is not powered by this engine. It is fed by it."]),
        "10": N("The engineer's trade talk stops mid-sentence when you mention the tally marks. He looks at the chalk sets a long moment and tells you, quietly, that he only marks sundowns, one stroke each. The fresh sets of five are not his.",
          ["Help him check the gallery for the other marker", "u", { resolve: 1, clue: 1, supplies: 1 }, "Together you sweep the engine row and find the other marker's blind: a bedroll behind engine two, harbor-made, recent, with a copied page of the engineer's own maintenance log. Someone is studying how to keep the fifth engine alive. Or how to kill it. He arms you from his parts cache for the warning."],
          ["Ask what the sets of five count, if not days", "s", { resolve: 1, finding: 1 }, "He counts the strokes against his own marks and goes gray. Sets of five, one set per crypt signal cycle. Somebody is counting transmissions, he says, and the count is nearly at some round number, and round numbers, in signal work, mean a schedule completing."]),
        "11": N("From the shadow side, you watch the engineer too long: he sets down his wrench, addresses the engine in a clear voice, and says that if the visitor by the condenser wants the salvage bank, the combination is his dead wife's name, and he is too old to fight over gauges. The engine, and you, have been seen for some time.",
          ["Step out and apologize properly", "c", { resolve: 1, clue: 1, supplies: 1 }, "Shame, paid promptly, buys more than coin here. He waves it off, opens the bank himself, and splits the gauges with you in exchange for one promise: tell the Fliers ashore the fifth engine still turns. You will."],
          ["Ask the wife's name like a thief with manners", "b", { supplies: 2, resolve: 1 }, "He laughs for the first time in what sounds like years, tells you, and lets you work the lock yourself while he narrates her flaws and glories. The bank opens on his life's careful salvage, and he takes only her photograph from the top of it before waving you at the rest."]),
        "L4": N("All five engines run now, the four risen ones ragged and screaming, the gallery floor shaking rivets loose, and the output line to the crypt is glowing along its patches. The engineer, if he was ever here this attempt, is barricaded or gone, and the room is becoming a single overdriven machine.",
          ["Shut the master fuel cock and ride the spin-down", "c", { supplies: 1, resolve: 1 }, "The great valve takes your whole weight and gives. Engine by engine the gallery starves quiet, and the spin-down shakes loose every fitting you could want, pre-sorted onto the floor."],
          ["Harvest the screaming engines at full run", "u", { supplies: 2, resolve: 1 }, "Stripping a running engine is surgery on a panicking animal, and you have the hands for it. The best parts come off hot, the engines wail down to three, and you leave the gallery deafened, scorched, and rich."]),
        "L5": N("Engine five, the faithful one, is overdriving past its gauges, housing glowing, tally chalk burning off in curls, and the output line to the crypt has gone from glow to white. The gallery will hold one more decision, then it holds nothing. Last attempt.",
          ["Vent the lift-gas manifold and dive behind engine one", "u", { supplies: 2, resolve: 1 }, "The manifold roars its pressure into the gallery's ceiling void and engine five sags back from the brink, saved by its own emptied veins. In the quiet after, the vented gas has lifted every loose valuable in the room to the ceiling, where they hang for the picking like fruit."],
          ["Cut the white-hot crypt line at the floor flange", "b", { supplies: 1, resolve: 2, clue: 1 }, "Your blade ruins itself in the cut and the line whips back like a severed mooring, gallery pressure dropping, engine five gentling to its old patient idle. Below the floor, through the open flange, something vast in the crypt's direction exhales its disappointment, long and slow. You have unfed it. It knows."]),
      } },
      { name: "Signal Crypt", nodes: {
        "": N("Below the engines, a vaulted signal crypt: ranks of message-drums big as cisterns, all turning slow, and a transmission caught mid-send on the master drum for years. The punched tape reads, where it has read since the crash: DO NOT RETURN FOR US.",
          ["Harvest signal crystal from the side drums", "u", { resolve: 2, supplies: 1 }, "Pre-Fall signal crystal, the kind harbors fight over, cut from drums that no longer need it. The master drum turns on, sending its old refusal to nobody."],
          ["Read the master drum's full tape, both directions", "b", { resolve: 2, finding: 1 }, "Before DO NOT RETURN FOR US, the tape holds the why: a manifest of what the station was ordered to lift in its last hours, and the order's seal. The seal is not a Flier seal. The station refused a boarding, and chose this instead."]),
        "0": N("A side drum seizes under your cutting and its tape tears, and every drum in the crypt falters in sympathy, the room's great slow heartbeat skipping. From the master drum, the punch-head rises, paper feeding, ready to record the interruption.",
          ["Splice the torn tape and restore the rhythm", "c", { resolve: 1, supplies: 1 }, "Field-splice, sailor's knots, and the drums settle back into their old patience. The punch-head lowers unrecorded, and the splice you made reads, in their code, as a tended wound. The crypt eases around you afterward."],
          ["Harvest faster while the rhythm is broken", "u", { resolve: 2, supplies: 1 }, "Skipping drums cannot keep count of their losses. You cut crystal through the arrhythmia and are pocketing the last of it when the heartbeat finds itself again, lighter by exactly your bag's weight."]),
        "1": N("Reading backward past the manifest, the tape stops being a record and starts being a draft: the same message punched over and over with words struck out. DO NOT RETURN UNTIL. DO NOT RETURN UNLESS. The crew argued about the wording, and the argument is all still here.",
          ["Copy every draft variant exactly", "s", { resolve: 1, finding: 1 }, "Eleven drafts, eleven crossings-out, one final cut. Read in sequence, they record a negotiation: with whom, the tape never names, but each draft concedes more, and the final wording concedes everything except return."],
          ["Run the master drum forward to see if more was punched after", "b", { resolve: 2, finding: 1, clue: 1 }, "The drum resists, then yields, and past the famous final line there is more tape, punched slow and shallow, as if by failing hands or patient ones: a postscript, a set of coordinates, and one word, WAITING. The coordinates are not far from here."]),
        "00": N("Your splice holds, but the restored rhythm is not the old rhythm: the drums have shifted tempo around your repair, all of them, synchronizing to something, and the new beat matches a pulse you last felt through the engine gallery's floor. The crypt is taking instructions again.",
          ["Trace which drum leads the new tempo", "u", { resolve: 1, clue: 1, supplies: 1 }, "You walk the ranks with a hand on each housing until you find the conductor: a half-buried drum in the crypt's corner whose feed-line runs not from the engines, but down, through living rock. You cut crystal from its neighbors and chart the down-line's heading for the group."],
          ["Match the beat on a drum housing and listen for an answer", "b", { resolve: 2, finding: 1 }, "Your knuckles take up the pulse, drum to drum, and the crypt accepts your hands into its choir. Through the floor, faint, the answer rises, and it is not signal: it is breathing, vast and even, and the drums, you understand at last, are not transmitting at all. They are a lullaby. You stop playing very, very gently."]),
        "01": N("Mid-harvest, the punch-head drops and begins recording after all, and what it punches is not the interruption. It is a description, in signal-code, of a figure cutting crystal in the dark, updated in real time as you move. The crypt is filing a report, and the report has a recipient.",
          ["Punch a false ending onto the report yourself", "u", { resolve: 1, supplies: 1, clue: 1 }, "You take the punch-head's handle like a telegrapher and conclude the report: intruder departed, drums secure. The send-light goes green on your fiction, and you finish the true harvest inside the alibi you transmitted."],
          ["Cut the master drum's send-line before the report completes", "b", { resolve: 2, supplies: 1 }, "Your blade parts the line at the vault wall and the report dies unsent, the punch-head tapping uselessly at a dead drum. In the wall channel behind the cut line: signal crystal of the master grade, the spine of the whole crypt, and now it comes away in your hands."]),
        "10": N("Eleven drafts copied, and as your charcoal lifts from the last, the master drum begins, deliberately, to punch a twelfth. Same opening, new wording, present tense. DO NOT RETURN, it punches. FOR US, it punches. Then, slowly: WE ARE NOT.",
          ["Wait, dead still, for the sentence to finish", "c", { resolve: 1, finding: 1 }, "The drum finishes: WE ARE NOT ALONE DOWN HERE. ARE WE. A question, punched to whoever finally came to read. You punch back the only honest answer, NO, and the drums sigh through their ranks like a crew that can stop pretending."],
          ["Answer aloud before it finishes", "b", { resolve: 2, clue: 1 }, "Your voice in the crypt, the first in years, and the drum abandons its sentence to punch a new one fast: a name, a rank, and HURRY, and a drum-rank number deeper in the vault. Someone in this crypt's machinery has been waiting to be found, and now you have the address."]),
        "11": N("The coordinates and WAITING sit in your copy-book, and the master drum has stopped turning entirely for the first time since the crash, tape slack, vault silent. Into that silence, from the direction the coordinates point, comes a sound the drums were drowning: three knocks, evenly spaced, far away, repeating. Patient as tide tables.",
          ["Log the knock's interval and withdraw to report it", "s", { resolve: 1, finding: 1, clue: 1 }, "You time the knocking against your pulse, chart its bearing against the coordinates, and leave the crypt with the kind of evidence that moves fleets: something at those coordinates has been knocking, in signal-rhythm, since before your group was born."],
          ["Knock back, three, evenly", "b", { resolve: 2, finding: 1 }, "Your knuckles on the master drum, three and even, and the far knocking stops. One beat. Two. Then it returns doubled, joyful, arrhythmic, like applause, like weeping, like both, and the master drum shudders back into motion to punch one final line: THANK YOU. NOW RUN. You take the tape. You run."]),
        "L4": N("The crypt is failing around your accumulated noise: drums seizing rank by rank, tapes snapping and whipping, the punch-head hammering gibberish, and beneath it all the floor's patient pulse is quickening for the first time, the lullaby collapsing with the choir that sang it.",
          ["Take the crystal you have and seal the vault door behind you", "c", { resolve: 1, supplies: 1 }, "You spin the vault wheel shut on the dying choir and the pulse beneath it. Sealed is not solved, but sealed is reportable, and your bag of crystal makes the report impossible to ignore."],
          ["Restart the master drum by hand at the old tempo", "u", { resolve: 2, finding: 1 }, "You bend to the crank and become, for ten sweating minutes, the lullaby. Drum by drum the ranks catch your rhythm and steady, the floor's pulse slows back to its long sleep, and the master tape, when you finally step away, has punched a single new word at your shoulder height. SHIPMATE."]),
        "L5": N("Every drum is dead or screaming, the floor's pulse is a drumbeat now, the vault door is warping in its frame from pressure below, and the master tape is feeding out one last unspooling sentence into the chaos. Whatever happens next, you carry out only what your hands hold at the end of it. Last attempt.",
          ["Grab the unspooling master tape entire and run for the door", "u", { resolve: 2, finding: 1 }, "The full tape, crash to postscript to tonight, coiled around your arm like a rescued line, and you through the warping door as the frame screams. Behind you the crypt goes dark and even. Holding its breath. The whole story of this station leaves with you, and stations, the tape's last line says, do not die while someone holds their word."],
          ["Hold the vault door's wheel against the pressure and punch one word back: SLEEP", "b", { resolve: 2, supplies: 1, clue: 1 }, "Your whole weight on the wheel, one hand hammering the punch-head, and the word goes down the floor-line letter by letter. The pulse slows. The pressure sags. The door settles back into true, and beneath your feet something vast turns over, resettling, soothed by a single word in its own old code. You leave the crypt standing, the harbor unaware, and the word, you suspect, will hold until it does not. Note the date."]),
      } },
    ],
    boss: {
      stages: [
        BS("Rust Choir drags itself into the loading vault: a fused mass of salvage automata, crane arms and ticket-machines and engine limbs welded by years into one shape, singing static through forty speaker-mouths. It built itself from everything that stayed. It does not intend to let the inventory leave.",
          ["Strike the speaker-cluster at its crown", "Your blade through the horns and a quarter of the static dies mid-note. The Choir recoils, recalibrating around its first silence in years."],
          ["Charge through its reach and cut the central welds", "Under three swinging crane arms and into the body of it, blade dragging across the old fusing seams. Sparks sheet off it like spray, and something inside loses grip on something else."]),
        BS("The Choir adapts: dead automata across the vault twitch upright and shamble to it, and it welds them on as it fights, arms sparking, growing reach by the minute. Its static has found a rhythm now, and the rhythm is a work-song.",
          ["Destroy the welder-arm before it builds more", "You track the sparking limb through the chaos and take it off at the joint. The half-attached recruits slough away dead, and the Choir's growth ends here."],
          ["Topple a dead crane onto it mid-weld", "The vault's own wreckage answers you. Crane meets Choir at the moment of attachment, and the mass beneath staggers out of the impact smaller than it went in."]),
        BS("Battered to its core frame, Rust Choir anchors itself to the vault floor with drilled feet and redirects everything inward: panels open across its chest, and inside, the station's master lift-gas cell glows at overcharge. It is not powering up a weapon. It is the weapon.",
          ["Cut the feed-lines around the gas cell", "Surgery at speed: four lines, four cuts, each one bleeding pressure away from the glow. The cell gutters back from the brink and the Choir sags, defused mid-sacrifice."],
          ["Drive your blade into the cell's regulator", "One precise ruin. The regulator vents the overcharge upward in a column of cold flame, harmless and magnificent, and the Choir's chest panels hang open and empty. It spent its everything, and you spent it for it."]),
        BS("Hollowed, dimming, Rust Choir hauls its frame up one last time, and the static gathers itself into something almost like a voice, almost like the station announcer, almost like words. It is trying to say what it was built saying. End it kindly, or end it fast. End it.",
          ["Strike the core while it speaks", "Blade through the heart-works mid-syllable. The static stops everywhere at once, and forty speaker-mouths settle into the first true silence this wreck has known. The vault is yours. The station, at last, is nobody's."],
          ["Let it finish, then strike", "Through the static, two words resolve: ALL ABOARD. You wait out the sentence and put your blade through its core on the silence after. The Choir folds down piece by piece, neatly, like a thing packing itself away, and a brass speaker-horn rolls to rest against your boot like a tip."]),
      ],
      stagger: [
        BS("Your attempt fails and the Choir samples it: your blade-ring, your boot-scrape, your breath, all woven into its static and played back at you from the wrong directions. It is learning your sounds to spend them against you.",
          ["Attack on its own loudest beat", "You time your strike inside its noise where no sample can warn it. The blow lands in the one silence the Choir cannot manufacture: its own."],
          ["Throw your lantern left, strike from the right", "It tracks the light and the sound of the light, and your steel arrives from the unsampled side, twice, before the static can re-aim."]),
        BS("Crane arms herd your failed footing toward the vault's luggage press, and the press is cycling, and the Choir's work-song has acquired a flourish that can only be called anticipation. It has decided what bin you go in.",
          ["Dive through the press on its open beat", "The press cycles on a count, and you go through the gap in the count, and the crane arm following you does not. The Choir grinds, one limb lighter."],
          ["Climb the herding arm against its push", "Up the limb that drives you, hand over hand, into the blind angle above its speaker-line. From there your blade chooses freely, and chooses well."]),
        BS("The Choir absorbs your spent blow into its mass, welds a salvage shield across the wound, and rings its forty mouths in something like a laugh: static shaped into a sound that mocks. Machines do not gloat. Whatever sings in this one does.",
          ["Strike the new weld while it cools", "Hot welds are honest welds: soft. Your blade reopens the patch and the wound beneath it together, and the laugh dies into a sound machines also do not make."],
          ["Mock it back, then strike where the speakers aim", "You give its laugh back note for note, and forty mouths swivel to the insult as one. Forty mouths, one direction, and your blade in the undefended opposite. Pride, it turns out, rusts too."]),
        BS("Your last failure leaves you flat in the salvage scatter, and Rust Choir rises over you, every arm raised, static peaking, the full chord of the wreck about to come down at once. Somewhere in the noise, faint, the announcer's ghost is still trying to call a boarding. Last call, in every sense.",
          ["Roll beneath its anchored center and cut upward", "Drilled feet cannot step back. From under its core you open the floor-facing seam no shield ever covered, and the chord collapses outward into forty separate dying notes."],
          ["Hurl salvage into its speaker-mouths and strike through the feedback", "Brass into the horns and the Choir's own voice turns on it, feedback shrieking through every joint. It convulses, arms tangling arms, and your blade goes through the core of the knot it makes of itself. The static ends. The wreck rests."]),
      ],
    },
  },
  // =========================================================================
  chapel: {
    rooms: [
      { name: "Flooded Narthex", nodes: {
        "": N("The chapel's entry hall, flooded to the waist, and across the still water drift lit candles in procession, dozens of them, moving door to altar in a slow line. No hands carry them. No draft drives them. The offering boxes along the walls are full.",
          ["Empty the offering boxes, away from the procession", "s", { supplies: 1 }, "Years of soaked tithes: coin, rings, a silver comb. The candle-line files past your theft without a flicker of interest. The narthex has seen worse than you."],
          ["Wade alongside the candles to see where they go", "u", { supplies: 1, clue: 1 }, "The line files through the nave doors, under them, lit even underwater, toward the bell sound deeper in. You chart their route, which is the safe route, because nothing in this chapel troubles the procession."]),
        "0": N("An offering box lid bangs back against the wall, loud in the hush, and every candle in the procession stops at once, flames bending toward you like turned heads. The line is waiting for an explanation.",
          ["Drop a coin of your own in the box, audibly", "c", { supplies: 1 }, "Payment understood. The flames straighten, the procession resumes, and you work the remaining boxes with a depositor's calm, taking ninety and tithing one."],
          ["Stand still until the flames turn away", "u", { supplies: 2 }, "You out-wait the wax. Candles have patience but no memory, and when the line moves on, you empty three boxes in its wake, swift and silent."]),
        "1": N("Halfway along the procession route, a candle directly ahead of you gutters and dies, and the line halts around the failure. The dead candle drifts out of formation toward you, deliberately, riding no current at all.",
          ["Relight it from your lantern and set it back in line", "s", { supplies: 1, clue: 1 }, "Flame restored, the candle rejoins its fellows, and the whole line dips, once, in your direction. From then on the procession parts around you wherever you wade. The chapel marks its friends."],
          ["Pluck the dead candle from the water and pocket it", "b", { supplies: 1, finding: 1 }, "Dead, it is just wax, and inside the wax, as your thumbnail finds a seam: a rolled paper, dry, a name and a plea written in a fast hand. Someone in this chapel sent messages out in the only mail that leaves. You have intercepted one."]),
        "00": N("Your tithed coin sinks, and from below, a pale hand sets it gently back on the box's rim. Refused. The water around your waist is suddenly colder, and the hand has not withdrawn. It is waiting, palm up, for something else.",
          ["Offer the hand your lantern's flame instead", "u", { supplies: 1, resolve: 1 }, "You dip a taper, light it, and set it on the open palm. The hand closes around the flame without quenching it and sinks satisfied, a new candle joining the procession from below. The boxes after that open to you like old friends."],
          ["Withdraw your hand and work the far wall's boxes", "c", { supplies: 1 }, "Some negotiations are best declined. The far wall's boxes yield their tithes without commentary, and the pale hand, when you glance back, has taken the coin after all."]),
        "01": N("Out-waiting the candles, your stillness lets you hear what their procession was covering: under the water, against your legs, a current of whispering, voices moving the same direction as the flames, door to altar, door to altar. The candles are not the procession. They are the escort.",
          ["Lower your ear to the waterline and listen", "u", { resolve: 1, finding: 1 }, "Names. The whispers are names, hundreds, repeated in order, and the order is a parish register being recited from below. You memorize the stretch you hear. Ashore, those family names still pay for word of their drowned."],
          ["Step out of the whisper-current and harvest its banks", "s", { supplies: 2 }, "Where the voices flow, valuables collect on the bottom like silt in a river bend. You work the current's banks by feel and come up with rings and rosaries the procession has carried for years."]),
        "10": N("Befriended, you walk the parted procession, and the parting shows you the narthex floor: mosaic, pre-Fall, and the candles' route traces one figure in it precisely, wading where you wade, crowned in flame. The chapel has walked someone along this line before, and tiled the memory.",
          ["Sketch the full mosaic figure", "c", { clue: 1, finding: 1 }, "Your charcoal takes the crowned wader whole: the figure carries a bell under one arm, and the bell is rendered cracked. Whoever the chapel remembers, they took the bell's voice with them once. Vesper, the deep toll insists from below, disagrees about how that ended."],
          ["Follow the mosaic line beyond the candle route", "u", { supplies: 1, clue: 1 }, "The tiled path continues past where the candles turn, into a side chamber the procession avoids: the sacristy, unlooted, untithed, and unguarded, because the candles never escort anyone there. You escort yourself."]),
        "11": N("The intercepted message names a sender, and the sender's name is on the narthex's memorial wall ahead of you, fresh-carved relative to the rest, and below the name, where dates should close the line, the stone is blank. Uncarved. Waiting. The chapel does not consider this person finished.",
          ["Copy the name and the blank, and the names around it", "s", { clue: 1, finding: 1 }, "Three names near it share the blank, a cluster of the unfinished, all carved the same season. A season your harbor remembers for a different sinking. The chapel is keeping a list of people it believes are coming back, and your group will want that list."],
          ["Press your palm to the blank stone", "b", { resolve: 2, clue: 1 }, "Cold, then warm, then a pulse, not yours. When you take your hand away, the blank has gained one carved word, fresh as a wound: SOON. You leave the wall with the message, the name, and a date the chapel apparently knows that you do not. Yet."]),
        "L4": N("The procession has doubled, then doubled again, candles streaming in from drowned doorways on every side, and the whisper-current is rising past your ribs, names coming faster, the recital approaching some final page. The narthex is filling for a service, and you are standing in the aisle.",
          ["Take a candle and process with them to the side door", "c", { supplies: 1, clue: 1 }, "Robed in borrowed ritual, you walk your stolen flame with the line as far as the sacristy door and step out of the service unremarked. Congregations count candles, not faces."],
          ["Dive beneath the procession and swim the floor", "u", { supplies: 2, resolve: 1 }, "Under the flames, through the name-current, along the mosaic, harvesting the floor's collected tithes as you go. You surface at the far arch with full hands as the service begins behind you without its loot."]),
        "L5": N("Every candle in the chapel is in the narthex now, the water is at your chest and rising on no tide, the names have reached the latest carvings, and the procession has formed a ring. Around you. The service, it appears, has a centerpiece. Last attempt.",
          ["Speak a name from the memorial wall into the hush", "u", { resolve: 2, clue: 1 }, "Your voice, one drowned name, and the ring of flames turns outward as one to look for its owner. In their turned moment you are through the ring, up the side stair, out of the rising water, carrying what you carried and the certainty that the name you spoke was heard, somewhere, by its owner."],
          ["Blow out the candle nearest you, like ending a vigil", "b", { resolve: 2, supplies: 1, finding: 1 }, "One breath, one flame, and the whole procession dies at once, narthex plunging to true dark, water dropping like a sigh let out. In the dark, hundreds of small sounds: wax candles dropping their hidden messages as the spell that held them shut releases. You leave with a satchel of the chapel's unsent mail and the strong impression that you have just ended something that wanted ending."]),
      } },
      { name: "Candle Float", nodes: {
        "": N("A side chapel where the ceiling holds the air, and on the trapped water floats a raft of votive candles lashed gunwale to gunwale, hundreds, all lit, all dry. Wax stalactites hang where years of them burned. Among the flames sit the votive gifts they were lit over.",
          ["Lift gifts from the raft's edges", "s", { supplies: 1 }, "Edge candles guard the older offerings: lockets, coins, a captain's ring. You harvest the rim and the raft rocks gently, keeping all its flames."],
          ["Wade out and work the raft's bright center", "u", { supplies: 2 }, "Center flames burn over center gifts: the desperate ones, the gold ones. You part the raft like reeds and take the heart of the collection while wax drips a soft protest on your shoulders."]),
        "0": N("A rim candle tips as you lift its locket and falls flame-down toward the rest, and the raft shudders away from the falling fire as one body, lashings creaking. The float, you realize, can move, and it is afraid of itself.",
          ["Catch the candle before it lands", "c", { supplies: 1 }, "Your palm takes hot wax and the flame stays up, and the raft stills around your held breath. After that it leans its rim gifts toward you, gently, the way a dog brings the leash."],
          ["Let it fall and grab gifts in the scatter", "b", { supplies: 2 }, "The flame lands, a patch of raft flares, and in the panicked scatter as candles flee the burning section you scoop the abandoned center gifts wholesale. The float reforms behind you, smaller, warier, and minus its treasury."]),
        "1": N("At the raft's center you find its keel: one great paschal candle thick as a mast-stump, burning a flame the size of a fist, and lashed to it, wrapped in oilcloth, a package the size of a strongbox. The whole float, you understand now, was built outward from this one light and its cargo.",
          ["Unlash the package and leave the great candle burning", "u", { supplies: 1, finding: 1 }, "Knots last touched by a priest's hands give to yours. Inside the oilcloth: the chapel's reliquary, evacuated to the safest place its sexton could imagine. A place nobody would loot, because everybody fears open flame on open water. Almost everybody."],
          ["Take the package and the great candle both", "b", { supplies: 1, resolve: 1, finding: 1 }, "Reliquary under one arm, the still-burning keel-candle in your fist like a torch, and the raft, unmoored from its heart, drifts apart around your exit into a hundred small lights going their own ways. The great candle does not gutter once on the way out. Some lights, once carried, agree to be carried."]),
        "00": N("Healed, the raft trusts you, and trust has appetite: candles nudge your arms, your bag, your lantern, hungrily, and you understand they want carrying too. All of them. The float is trying to adopt you as its new shore.",
          ["Carry three, formally, to the chapel's ledge", "s", { supplies: 1, clue: 1 }, "Three flames ferried to dry stone, three gifts beneath them yours by ritual right, and the raft settles, point made. On the ledge where you set them, old wax rings show others made this exact bargain. You count the rings. The bargain has a history."],
          ["Refuse gently and harvest the leaners", "u", { supplies: 2 }, "Candles that lean offer their gifts at better angles. You work the eager rim with both hands, taking what tilts to you, and the float, spurned but tithed, lets the matter rest."]),
        "01": N("The burned patch heals wrong: the fled candles return to the scorch and cluster there, crowding, relighting each other over the blackened lashings, and the patch glows hotter than any flame should over water. The raft is cauterizing, and the heat is rendering the wax beneath into something that moves.",
          ["Pole the hot patch away from the rest with a plank", "c", { supplies: 1, resolve: 1 }, "Leverage and distance. The fevered section drifts free, burns itself out against the far wall in private, and the main float cools back to its long patience with you still in its good graces, more or less."],
          ["Skim the rendered wax into your lamp-flask", "b", { supplies: 1, finding: 1 }, "Living wax, the alchemists' phrase for what votive grief becomes under enough flame, and your flask takes a pint of it, warm and turning. Ashore, exactly three people can work it, and all three will owe you for the privilege."]),
        "10": N("The reliquary is lighter than its size, and unwrapping a corner shows why: half its relics are gone, removed with care, padding rearranged to disguise the loss. Someone has been to the raft's heart before you, taken half, and lashed the rest back for later. The knots you undid were not all priest's knots.",
          ["Examine the thief's knots for a signature", "u", { clue: 1, finding: 1 }, "Rigger's knots, harbor-taught, one hand favoring the left, finished with a flourish you have seen on nets ashore. You cannot name the thief yet, but you can name their teacher, and teachers keep lists of hands."],
          ["Take the remaining half and rig a snare in the padding", "b", { supplies: 1, finding: 1, clue: 1 }, "Your half leaves with you, and in the repadded oilcloth a fishhook-and-thread snare waits to mark the returning thief's hand with a wound no glove hides. Half the relics now, the other half when a bandaged left hand surfaces ashore. You can wait."]),
        "11": N("Keel-candle in hand, you discover its weight is not all wax: the great candle is poured around a core, and through the flame at its crown, when you look straight down into the melt-pool, something glints metallic, suspended, sinking slower than the candle burns. The chapel hid something in the one place fire guards better than iron.",
          ["Carry it out and let it burn down ashore over days", "s", { resolve: 1, finding: 1 }, "Patience is a form of prying. Three days of honest burning ashore deliver the core to your palm warm as a fresh coin: a bishop's signet, the chapel's authority entire, the seal that can reopen or forever close this parish. The Faithful would burn a fleet for it."],
          ["Carve down to the core right here", "b", { resolve: 2, finding: 1 }, "Blade through warm wax in long strokes while the flame complains at your knuckles, and the core drops free: the signet, plus what was hidden with it, a key on a chain, sized for nothing in this room. The bell tower, perhaps. Vesper's domain. You pocket both and the great candle, gutted, finally dies, having kept its secret to the last inch."]),
        "L4": N("The float has stopped pretending to be furniture: it circles the chamber now, slow as a millwheel, candles rearranging into spirals, wax stalactites dropping like depth charges where its currents pass, and every drip and flame is converging into one shape on the water. The raft is writing something, and it is writing it around you.",
          ["Read the wax-writing from the ledge before leaving", "c", { resolve: 1, clue: 1 }, "From above, the spiral resolves: not words, a diagram, the chapel in cross-section with one chamber circled in flame. The bell tower's foundation room. The float, whatever it knows, wants someone to go there, and now someone knows to."],
          ["Wade through the writing and take the spiral's center gift", "u", { supplies: 2, resolve: 1 }, "At the converging spiral's heart, held above the water by a cone of cooperating flames: one last offering, gold, heavy, presented. You take it from the fire's hands directly, and the writing collapses into ordinary drifting light behind you, message delivered, gift accepted, audience over."]),
        "L5": N("Every candle is moving now, the whole float standing into a wall of flame between you and the door, wax pouring upward along it in defiance of every honest direction, and the heat is no longer protest. It is verdict. The side chapel intends to keep its collection and add to it. Last attempt.",
          ["Dive under the flame wall and swim the door's sill", "u", { supplies: 1, resolve: 2 }, "Beneath the wall, the water is cold and dark and indifferent to verdicts. You pull yourself along the floor mosaic and surface beyond the door with your haul soaked, singed, and entirely yours."],
          ["Walk into the wall carrying the great candle high", "b", { resolve: 2, finding: 1, clue: 1 }, "Flame defers to its own keel. The wall opens around the paschal light in your fist like a parted curtain, candles bowing aside rank by rank, and you process out of the side chapel the way bishops once processed in: unhurried, unburned, and carrying the authority of fire itself. Behind you the float settles to rest. Some collections, the silence suggests, only ever wanted a worthy heir."]),
      } },
      { name: "Choirstalls", nodes: {
        "": N("The choirstalls hold their congregation still: rows of the drowned in their Sunday clothes, seated, patient, hands folded, decades dead and undisturbed. At the lectern, a hymnbook stands open mid-service. Coin-purses and prayer-tokens rest in laps and pockets, an offering plate sits half-passed in the third row.",
          ["Collect from laps and pockets, row by row", "u", { resolve: 1, supplies: 1 }, "Light fingers down the pews, taking from the patient dead like a verger collecting late tithes. None object. One, at the aisle's end, seems, when you finish, to sit straighter, relieved of something."],
          ["Finish passing the offering plate", "b", { resolve: 1, supplies: 2 }, "You lift the half-passed plate and walk it down the remaining rows, and the dead, row by row as you pass, tilt forward their cupped hands, spilling decades of held offerings into the plate that finally came back. At the last row the plate weighs like an anchor. Service concluded."]),
        "0": N("Your hand in the fourth row finds a pocket already picked: slit cleanly, emptied, and the seated owner's folded hands hold, instead of prayer-tokens, a scrap of sailcloth with one word in tar: MINE. Another collector works these stalls, and leaves receipts.",
          ["Search only rows without sailcloth markers", "c", { resolve: 1, supplies: 1 }, "Six rows bear the tar-word, eight do not. You work the unclaimed pews clean and leave the rival's territory be. Whatever leaves receipts in a drowned church is owed exactly that much respect, and no more."],
          ["Take a marked row's goods anyway and leave your own mark", "b", { resolve: 1, supplies: 2, clue: 1 }, "You answer MINE with NOT ANYMORE on the same sailcloth, and clean the row to the wood. Either nothing comes of it, or something educational does. You also pocket the original scrap: tar-work has handwriting too, and yours now has a sample."]),
        "1": N("Plate in hand at the front row, you face the lectern, and the open hymnbook's pages turn, one, by themselves, to a hymn whose number matches the count of the congregation behind you. The service is responding to its new verger. There is an order to things here, and you have joined it mid-liturgy.",
          ["Read the hymn's first verse aloud", "s", { resolve: 1, finding: 1 }, "Your voice in the stalls, the verse the book chose, and beneath the drowned hush a hum rises, the congregation carrying the tune in whatever serves them for throats. At the verse's end, every seated head bows, and the lectern's hidden drawer, sprung by some final rubric, slides open at your hip. The parish records. The real ones."],
          ["Close the hymnbook firmly", "b", { resolve: 2, supplies: 1 }, "The book shuts under your palm with a crack like a verdict, and the stalls exhale, decades of held service released at once. Three of the congregation slump, finished at last, and what they held in trust, rings, a reliquary pendant, a captain's chronometer, rolls free for the verger who finally said amen."]),
        "00": N("In the unclaimed eighth row, one of the seated dead is not like the others: warmer, recent, dressed for diving not for service, sitting among the congregation in careful imitation. Days dead at most. The rival collector, you understand, stopped collecting, and somebody seated him.",
          ["Search the seated rival respectfully", "u", { resolve: 1, supplies: 1, clue: 1 }, "His own takings, two rows' worth, still on him, plus his dive-slate: a tally of trips, a partner's initials, and a final line pressed hard into the wax. NOT THE LECTERN. His partner ashore can be found. His warning already has been."],
          ["Study how he was seated, and by what", "c", { resolve: 1, clue: 1, finding: 1 }, "Posed with care: hands folded the parish way, hymnal placed, collar straightened. Whatever seated him knew the liturgy and meant him no disrespect, only inclusion. You sketch the pose, the placement, the direction his closed eyes face. They face the lectern. Everything in this room faces the lectern."]),
        "01": N("Your tar reply has been answered while your back was turned: the sailcloth in the row you emptied now reads, beneath your NOT ANYMORE, in fresher tar still tacky to the touch: ROW NINE. THEN WE TALK. Row nine sits in shadow under the organ loft, and its occupants, you notice now, are all facing you.",
          ["Go to row nine, hands visible", "u", { resolve: 2, clue: 1 }, "Row nine holds the rival's bank: a bench-seat chest of everything collected here over years, and atop it, dry, a harbor address and one playing card torn in half. Partnership terms, offered the old smugglers' way. You take the chest's tithe and the half card. Talks, it seems, are scheduled."],
          ["Decline by working row ten instead", "b", { resolve: 1, supplies: 2 }, "Row ten, untouched and unmarked, yields like a reproach to whoever skipped it, and your message lands as intended: not partners, not enemies, parallel professionals. The shadow under the organ loft watches you finish, and applauds once, softly, before it stops being there."]),
        "10": N("The parish records list every soul in the stalls, name and pew, and the final pages turn ledger: payments received, in the last weeks before the drowning, from a name you know, for services the rector itemized only as THE QUIETING. The congregation did not drown by accident. They were a transaction.",
          ["Copy the payment pages whole", "c", { clue: 1, finding: 1 }, "Dates, sums, the payer's name, the rector's hand. Proof that someone bought a parish's silence with the parish in it, and proof travels best in duplicate. The original stays in the drawer. Let the chapel keep its own evidence too."],
          ["Read the payer's name aloud to the congregation", "b", { resolve: 2, clue: 1 }, "The name, spoken to the people it cost everything, and the stalls answer: every seated head turns, slowly, to face the lectern's record drawer, and hold there, a jury delivering its verdict in the only motion left to them. You have your confirmation, your witnesses, and a posture sketch no court ashore will be able to ignore. The drowned, it turns out, can still point."]),
        "11": N("Three slumped, the rest now stir: hands unfolding, hymnals lowering, the long-held service ending row by row, and the dead, released, are doing what congregations do when service ends. They are turning to greet their neighbors. Some of the turning faces are turning toward you, the verger who dismissed them, and their unfolded hands are extending.",
          ["Shake the nearest offered hands", "u", { resolve: 2, finding: 1 }, "Cold grips, formal, grateful, one after another down the aisle, and the last hand presses something into yours and folds your fingers over it: the rector's own ring of keys, passed to you the way wardens pass the watch. Every locked door in this chapel just became your jurisdiction."],
          ["Bow to the room and withdraw up the aisle", "s", { resolve: 1, supplies: 1, clue: 1 }, "A verger's bow, dignified, final, and the congregation lets you process out with the plate, settling back into a rest that is, at last, only rest. From the doorway you note what their slumping reveals: a floor hatch beneath the third pew, hinges polished by use. Someone uses this room's quietest cover for regular passage. You mark it for the group."]),
        "L4": N("The stalls are emptying: the congregation rises in twos and threes, unhurried, and files toward the nave doors and the bell sound beyond, and their procession route runs through you. Not at you. Through where you stand, as if the aisle's geometry no longer includes the living. The service is moving to its next station, and the building is going with it.",
          ["Stand aside in a pew and let the dead pass", "c", { resolve: 1, supplies: 1 }, "You take a seat like a latecomer and the procession flows past your pew without ruffle. In passing, three of them, unprompted, lay their grave-goods on the bench beside you. Tips for the verger. Then the room is empty, and yours."],
          ["Join the procession and harvest as you march", "u", { resolve: 2, supplies: 1 }, "You fall into step among the drowned, one more parishioner, and the march tolerates its pickpocket the way all crowds do: blindly. By the nave doors your pockets are full and your cover is perfect, and you peel off at the threshold while the dead process on toward the bell."]),
        "L5": N("The last of the congregation waits at the nave doors, holding them, looking back at you, and the bell beyond has stopped mid-pattern, listening, and the choirstalls' emptied rows are filling again behind you with water, fast, pew by pew. The room intends to be done, one way or the other. Last attempt.",
          ["Run the aisle and take the held door", "u", { resolve: 2, supplies: 1 }, "Flat sprint past forty empty pews with the water at your heels, through the held door and the cold grip of the holder's other hand steadying your shoulder as you pass. The door closes on a room gone fully drowned. The congregation, it appears, looks after its verger."],
          ["Stop at the lectern and sign the service closed in the hymnbook", "b", { resolve: 2, finding: 1, clue: 1 }, "Your name, the date, the old rubric: SERVICE ENDED, ALL SOULS DISMISSED, while water climbs your boots, and the book accepts the entry with a glow like a coal under ash. The flooding stops at your knees, reverses, drains. The door-holder bows. And the hymnbook, closing itself, leaves its final page in your hand: the rector's confession, signed, witnessed, and waiting decades for an officiant with the standing to receive it. You have it. You also, the page's last line notes, now hold this parish. Vesper, it adds, has been informed."]),
      } },
      { name: "Bellwater Nave", nodes: {
        "": N("The great nave, and the bell above it tolls one note at long intervals, each toll driving standing waves across the floodwater in perfect rings. Where rings cross, the water holds shapes: the chapel's valuables, sorted by the decades of vibration into neat windrows along the nodal lines. The bell has been organizing its treasury.",
          ["Harvest the nearest windrow between tolls", "u", { resolve: 2, supplies: 1 }, "Silver in a tidy ridge, sorted by weight, waiting like a counted till. You clear half a row in the inter-toll hush and the next ring of sound passes you by, re-sorting what you left."],
          ["Wade the nodal lines toward the altar windrow", "b", { resolve: 2, supplies: 1, clue: 1 }, "The altar row holds the heavy sort: chalices, the processional cross, a censer of solid bough-bronze. You take the best of it standing in the one spot the waves never touch, and from that dead-calm point you can see every nodal line in the nave at once. You memorize the chart the bell has spent decades drawing."]),
        "0": N("Mid-harvest, the toll comes early, off-pattern, and the standing waves break and re-form a stride to your left, windrows dissolving and re-sorting around your position. The bell has noticed its till being counted by foreign hands, and it is changing the locks.",
          ["Hold position at the new nodal point", "c", { resolve: 1, supplies: 1 }, "You read the re-formed rings and step into their new still-point before the water finishes moving. The bell, finding you already balanced in its revised arithmetic, returns to pattern, and the windrow re-forms at your feet."],
          ["Grab through the moving water before it re-sorts", "b", { resolve: 1, supplies: 2 }, "Hands in the dissolving ridge, snatching by feel as the silver migrates, and you come up with double fistfuls before the new pattern locks. What the bell re-sorts after counts itself short, and the next toll carries, unmistakably, an edge."]),
        "1": N("At the altar's dead-calm point, your boot finds not floor but lid: you are standing on a flat chest sunk exactly at the nave's stillest spot, placed where the bell's own physics would guard it. The lid's ring-pull is worn bright. Guarded, but visited.",
          ["Pull the chest open where it lies", "u", { resolve: 2, finding: 1 }, "Inside, dry in oiled wrap: the chapel's chartulary, every deed and debt the parish held, including three properties ashore whose current occupants surely believe their titles clean. Paper that re-draws a harbor's map, and it weighs less than the silver you walked past to find it."],
          ["Drag the chest whole out along the nodal line", "b", { resolve: 2, supplies: 2 }, "You walk the chest down the still-line like a man moving furniture through a sleeping house, toll by toll, freeze and haul, freeze and haul. At the nave door it is yours entire: chartulary, plate, vestment seals, and the bottom layer nobody listed, a child's coffin's worth of pre-Fall coin."]),
        "00": N("Balanced at the new still-point, you feel the next toll arrive through your boots before your ears: the bell has shifted from sound to floor, ringing the building itself, and the windrows are now migrating, all of them, slowly, toward the nave's center. Toward you. The treasury is being recalled.",
          ["Harvest the migration as it passes you", "u", { resolve: 1, supplies: 2 }, "The recall routes every windrow through arm's reach of the center, which is to say, of you. You stand the still-point like a toll-keeper and tithe the bell's own recall, row by passing row, until your bag refuses more."],
          ["Trace where the recalled treasure is gathering", "s", { resolve: 1, clue: 1, supplies: 1 }, "The rows converge on a grate beneath the center aisle, and pour through it, down, into a counting-room or a gullet, the dark declines to say. You take a respectable cut from the passing stream and chart the grate: whatever banks below the nave has an address now, and your group has the map."]),
        "01": N("Your snatched double-handful includes something that snatches back: a chain that tautens as you lift, running down through the water to weight unseen, and the off-pattern tolls have stopped entirely. The nave is silent. The bell is paying attention to the chain in your hand, and the silence is it leaning in.",
          ["Follow the chain down hand over hand", "u", { resolve: 2, finding: 1 }, "Below, the chain ends at a sunken reliquary cage, and in the cage, the bell's counterweight twin: a second bell, small, clapperless, the voice the tower lost. You take it. Above you, the great bell tolls once, softly, in what is unmistakably recognition."],
          ["Cut the chain and keep the slack end's load", "b", { resolve: 1, supplies: 2 }, "Your blade through old links, and the freed end comes up heavy with what the chain was threaded through: rings, dozens, wedding bands and bishop's seals strung like fish on a line. The deep end falls away with its secret, and the bell resumes its pattern, one toll short of forgiveness."]),
        "10": N("The chartulary's final folio is newer than the rest, added after the drowning by a dry careful hand: an inventory of the nave's windrows, updated in different inks over years, with collection dates. The most recent entry is this season. Someone has been harvesting this room on schedule, and logging it in the chapel's own books like rent.",
          ["Copy the harvest schedule and the hand", "c", { clue: 1, finding: 1 }, "Dates, quantities, a tidy initialed signature, and the intervals between entries match a coastal trader's circuit your harbor knows. Somebody respectable is farming a drowned church, and your copy of their own meticulous ledger is the entire case against them."],
          ["Lie in wait by the schedule's next date", "b", { resolve: 2, clue: 1, supplies: 1 }, "The schedule says soon, and soon, by your reckoning at the nave door, is a lantern already approaching down the narthex. You watch the harvester work the windrows with practiced strides, log their take at the altar, and leave. You follow them as far as their moored skiff and memorize its name. Then you take your own harvest, and theirs, from where they staged it."]),
        "11": N("The dragged chest grounds on the door sill and will not clear it: the sill has risen, or the floor has, stone grinding slow under the water, and the toll pattern has changed to short-short-long. The nave is not stopping you. It is negotiating. The chest, the rhythm insists, is leaving lighter or not at all.",
          ["Tithe the chest's top layer to the windrows", "s", { resolve: 1, supplies: 1, finding: 1 }, "You return the vestment seals and a tenth of the coin to the nearest nodal line, formally, and the sill grinds back down. The bell tolls the old pattern. The chartulary and the bulk leave with you, taxed and legal, and the receipt, you suspect, is the toll itself: short-short-long, logged somewhere below."],
          ["Force the chest over the sill", "b", { resolve: 2, supplies: 2 }, "Pry bar, fury, and a wave timed by the bell against you, and the chest goes over anyway, gouging the sill-stone as it clears. The toll behind you turns flat, dissonant, and stays that way: a grudge in bronze. You have everything, and the chapel has your description, in the only language it writes."]),
        "L4": N("The standing waves have abandoned pattern for purpose: rings collapse inward and re-form as walls of water that stand, curl, and patrol the nave's aisles like wardens, and the windrows are gone, recalled below, all but one last row glinting along the altar line behind three ranks of patrolling wave. The bell tolls continuous now, one rolling sustain, and the nave has become its instrument entirely.",
          ["Time the patrol gaps and take the altar row", "c", { resolve: 2, supplies: 1 }, "Wave-wardens patrol on the bell's beat, and the beat, however rolling, has a seam. You thread three ranks on the count, strip the altar row, and thread back out, soaked to the chin and ahead on the exchange."],
          ["Dive beneath the patrols along the floor", "u", { resolve: 2, supplies: 1, clue: 1 }, "Below the standing walls the water is anyone's. You swim the center aisle floor, harvest the altar row from beneath, and surface at the door, and from down there you saw the recall grate again, open now, and lamplight, faint and steady, shining up through it. Something below keeps a lit room."]),
        "L5": N("The sustain has become a chord, the patrol-waves have merged into one circling wall, nave-wide, herding everything loose, you included, toward the open recall grate at the room's center, and the lamplight below it has brightened to a welcome. The bell means to bank you with the rest of the season's takings. Last attempt.",
          ["Ride the herding wall and leap the grate at speed", "u", { resolve: 2, supplies: 1 }, "You stop fighting the circling water and let it sling you, building speed along its wall through a full circuit, and at the grate's lip you plant and leap the gap entire, landing past the recall's reach with your haul about you and the chord behind you breaking, somehow, on a note of grudging applause."],
          ["Drop your heaviest silver down the grate as deposit, and demand passage", "b", { resolve: 2, finding: 1, clue: 1 }, "Your censer of bough-bronze, banked, ringing down the recall like a paid toll, and the wall of water stops, parts, and forms an aisle straight to the nave doors. As you walk it, the lamplight below the grate dims twice, politely: receipt issued. Whatever keeps accounts down there, it honors deposits, recognizes patrons, and has just opened your line of credit. The table will have opinions about that."]),
      } },
    ],
    boss: {
      stages: [
        BS("Up the tower stair, the bell chamber, and Vesper, Who Rings: the chapel's dead sexton, tall and tide-bleached in his rotted office robes, arms replaced from elbow to fingertip with cast bell-bronze. He hangs from the headstock by one hand, ringing with the other, and the pattern he rings is a countdown nearly done. He sees you, and rings faster.",
          ["Strike his ringing arm at the elbow joint", "Steel meets bronze where bronze meets bone, and the joint gives with a flat clang. His next toll misses its beat, and the countdown stumbles for the first time in years."],
          ["Charge him and tear his hand from the rope", "You hit him at the rail and break his grip entire, and sexton and salvager go down together in the swinging bell's shadow. The pattern shatters. Underneath you, he is already reaching for the rope again, but you are already swinging first."]),
        BS("Vesper fights as he rang: in measures. The bronze arms swing on counts, terrible and predictable, and between blows he lunges for the bell rope, because the fight, to him, is the interruption. The countdown is the work. You are keeping him from his work.",
          ["Cut the bell rope above his reach", "Your blade through tarred hemp, and the rope's long fall takes his purpose with it. Vesper watches it coil into the floodwater below, and turns to you with both bronze arms free and nothing left to ring but you."],
          ["Break his counting, strike on the off-beat", "He swings on the toll's old echo, so you arrive between echoes. Two strikes inside his measure, where nothing in his long arithmetic has ever happened, and the second one staggers him into the bell itself, which sounds, flat and wrong, against him."]),
        BS("Ropeless, breaking, Vesper climbs the headstock and embraces the great bell itself, bronze arms around bronze waist, and begins to swing it by main strength, his whole dead frame the new clapper. Each toll now costs him: hairline cracks spread up his arms with every stroke. He will finish the countdown in person or come apart trying.",
          ["Wedge the headstock before the next swing", "Your pry bar into the bearing gap at the count's rising edge, and the great bell jams mid-stroke with Vesper's whole weight committed. The frame holds him splayed against his own instrument, and your blade finds the cracks his devotion already started."],
          ["Climb the frame and strike him off the bell", "Up the tower timbers as the bell heaves under you both, and your blow takes him at the shoulder where the cracks run deepest. Bronze arm and sexton part company, and Vesper drops to the chamber floor still counting, on fingers he no longer has."]),
        BS("Broken on the chamber floor, one arm gone, robes settling around him like a tide going out, Vesper hauls himself up the wall to standing by sheer office, and faces you on the last number of his count. Behind his eyes, something is still on duty. It has been on duty since the water came. One of you rings the final toll. Decide who.",
          ["End him before the count completes", "Your blade through the rotted vestments and whatever kept faith beneath them, and Vesper folds with the count unfinished at last, face almost grateful, a sexton relieved at end of shift. Above you both, the great bell rocks once, silent, and is still. The pattern dies with its keeper. Whatever was being counted down to is not coming. Not on this schedule."],
          ["Ring the bell yourself, once, and strike as he turns", "You haul the wedged headstock loose and sound one toll, clean and patternless, and Vesper turns to the sound the way the faithful turn to a call, his whole broken frame orienting on the bell in pure habit. Your blade takes him mid-devotion. He comes apart against the chamber wall with the single toll still humming around you both, and the hum, as it fades, takes the countdown's whole long arithmetic with it. The tower is just a tower. The bell is just a bell. You rang it. It rang for him."]),
      ],
      stagger: [
        BS("Your attempt fails and Vesper logs it: the next measure he rings has your missed beat folded into the pattern, a new grace note in the countdown, and his bleached face holds something patient and terrible. Sextons keep time on everyone. He is keeping it on you now.",
          ["Vary your tempo until he cannot fold you in", "You attack like weather, patternless, and his arithmetic finds nothing to hold. The blow that lands is the one he had no measure for."],
          ["Match his pattern, then break it at the crest", "You give him three beats of perfect predictability and spend the credit all at once, striking through the crest of the measure where his trust in time was total."]),
        BS("The bronze arms have your range now, and Vesper rings you backward across the chamber, blow by measured blow, herding you toward the open bell-shaft and the long fall to the flooded nave below. He does not hate you. The shaft is simply where interruptions go.",
          ["Drop flat at the shaft's lip and let his swing pass over", "His committed measure cannot stop mid-arc. The great bronze fist sails through where you stood, mass and momentum his betrayers, and you rise inside his open guard with your blade already moving."],
          ["Leap the shaft's corner and flank him", "You cross the gap he meant for your grave along its rim, two strides of nothing beneath your boots, and arrive at his unguarded side while his pattern is still ringing the place you left."]),
        BS("He catches your failed strike in one bronze hand and holds it, blade and arm together, and brings his bleached face close, and for a moment Vesper studies you the way he must once have studied late parishioners: with sorrow, with patience, with the absolute certainty of the schedule. Then the other arm rises, tolling for you specifically.",
          ["Strike the cracks in his holding arm with your free hand", "Your dagger into the hairlines his own devotion carved, and the bronze grip shatters from inside. You step out of his sorrow with your blade back and your answer made."],
          ["Drive forward inside the tolling arm", "Toward him, not away, inside the swing's arc where bronze has no leverage, and your shoulder takes him off his stance and your blade takes the rest. Schedules, your blow explains, can be renegotiated."]),
        BS("Your last failure puts you on the chamber boards with the countdown at its final number, and Vesper above you raises both bronze arms together for the last toll, the one the whole pattern was for, and through the tower's open louvres you can hear the floodwater below going still to listen. The harbor is in the blast radius of whatever this bell is about to mean. Last chance to be louder.",
          ["Roll into his stance and cut the standing leg's tendon-line", "Below every toll is a footing. Yours is the blade that removes it. Vesper's last great stroke swings him off his own ruined leg, past you, into the shaft he kept for interruptions, and the final number goes down with him, rung by nothing, heard by no one, counting, at last, only the fathoms."],
          ["Seize the fallen bell rope and bind his arms mid-toll", "Tarred hemp around descending bronze, your whole weight on the bight, and the last toll dies as a strangled clank against his own chest. Bound, overbalanced, emptied of schedule, Vesper looks at the rope, at you, at the silent bell, and stops. Simply stops, the way a clock stops, duty discharged by default. You cut him down gently. Some things you kill. Some things you relieve."]),
      ],
    },
  },
};

// --- delve geometry --------------------------------------------------------------
export function depthOf(i, len) {
  if (i === len - 1) return "boss";
  if (i >= len - 2) return "deep";
  if (i >= 2) return "mid";
  return "shallow";
}
export const DEPTH_LABEL = { shallow: "shallow water", mid: "below the light", deep: "old dark", boss: "lair" };
export function lanternFor(depth) { return depth === "shallow" ? 3 : depth === "mid" ? 2 : 1; }
export function lanternMod(depth) { return lanternFor(depth) - 3; }
export function biteRisk(depth) { return depth === "deep" || depth === "boss"; }

// Room names are fixed per venture, in slot order, boss last. No draws, no repeats.
export function roomsFor(tpl) {
  const t = DELVE_TREES[tpl.id];
  return [...t.rooms.map((r) => r.name), tpl.boss];
}

// The active encounter node: walks the room's tree by the path of failed choices.
// Levels 1-3 are exact branches; attempts 4 and 5 fall to the L4/L5 last stands.
// Boss rooms key on hits taken (stage) and whether the current stage has been failed (stagger).
export function roomNode(delve) {
  const depth = depthOf(delve.idx, delve.len);
  const tree = DELVE_TREES[delve.tid];
  const path = delve.path || "";
  if (depth === "boss") {
    const stage = Math.min(delve.boss?.hits || 0, 3);
    const card = path.length > 0 ? tree.boss.stagger[stage] : tree.boss.stages[stage];
    return { card, depth, idx: delve.idx };
  }
  const nodes = tree.rooms[delve.idx]?.nodes || {};
  const card = nodes[path] || nodes[path.length >= 4 ? "L5" : "L4"] || nodes[""];
  return { card, depth, idx: delve.idx };
}

// Sealed clues ride the haul and open when banked.
const DELVE_CLUE_LINES = [
  "A waterproofed letter found in {delve}: payment owed at {loc}, with the payer's private mark",
  "A salvaged chart from {delve} marking a dead drop near {loc}",
  "A name overheard in {delve}, the same name whispered around {loc}",
  "Cargo papers from {delve}: the shipment's true buyer keeps an office at {loc}",
  "A keepsake from {delve} that a family at {loc} has paid criers to find",
  "A tide-table from {delve} with one hour circled, in the hand of someone at {loc}",
];
export function sealedClue(rng, delveName) {
  const locs = Object.keys(NODES);
  const loc = locs[Math.floor(rng() * locs.length)];
  const t = pick(rng, DELVE_CLUE_LINES).replace("{delve}", delveName).replace("{loc}", NODES[loc].name);
  return { t, loc };
}

export const BOSS_SPOILS = { resolve: 2, boons: 1, rep: 1 };
