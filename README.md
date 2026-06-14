# The Drowned World — live voting point-crawl

A DM-run travel map for your D&D campaign. You (the DM) roll the dice and
control the world. Players open a link on their own browsers, see the live
map and stats, and vote on which route to take. No real-time peer sync, no
complicated backend: everyone reads from one shared Firestore document.

---

## What it does

- One shared map with bough-nodes and faction-controlled sea routes.
- **DM seat:** open/close voting, see the live tally, pick a route, roll the
  party d20, and adjust Resolve / Supplies / Reputation by hand. Everything
  you change appears on every player's screen within about a second.
- **Players:** join with a name, tap a glowing bough to cast a vote, watch the
  tally update live, and see the result of each crossing.
- A site password gates entry; a second password gates the DM seat.

---

## Part 1 — Firebase (the shared backend), about 10 minutes

1. Go to https://console.firebase.google.com and click **Add project**. Give
   it any name (e.g. "drowned-world"). You can disable Google Analytics.
2. In the left sidebar open **Build > Firestore Database**, click **Create
   database**, choose a location near you, and start in **production mode**
   (we'll paste rules in a moment).
3. Open the **Rules** tab, replace everything with the contents of
   `firestore.rules` from this project, and click **Publish**.
4. Click the gear icon > **Project settings**. Scroll to **Your apps** and
   click the **</> (Web)** icon. Register an app (any nickname, no hosting
   needed). Firebase shows you a `firebaseConfig` object. Keep this open; you
   need those six values next.

---

## Part 2 — Vercel (hosting), about 10 minutes

You have two ways to get the code to Vercel. The GitHub route is easiest to
update later.

### Option A: GitHub + Vercel (recommended)

1. Create a new repo on github.com and push this project folder to it
   (`git init`, `git add .`, `git commit -m "init"`, then follow GitHub's
   "push an existing repository" lines).
2. Go to https://vercel.com, sign in with GitHub, click **Add New > Project**,
   and import the repo. Vercel auto-detects Vite. Leave the defaults.
3. Before deploying, open **Environment Variables** and add the eight keys
   below (see `.env.example`). Then click **Deploy**.

### Option B: Vercel CLI (no GitHub)

1. Install: `npm i -g vercel`
2. From this folder run `vercel` and follow the prompts.
3. Add env vars with `vercel env add NAME` for each of the eight keys, then
   `vercel --prod`.

### The eight environment variables

From your Firebase config (Part 1, step 4) plus two passwords you choose:

```
VITE_FIREBASE_API_KEY         = (from firebaseConfig.apiKey)
VITE_FIREBASE_AUTH_DOMAIN     = (firebaseConfig.authDomain)
VITE_FIREBASE_PROJECT_ID      = (firebaseConfig.projectId)
VITE_FIREBASE_STORAGE_BUCKET  = (firebaseConfig.storageBucket)
VITE_FIREBASE_SENDER_ID       = (firebaseConfig.messagingSenderId)
VITE_FIREBASE_APP_ID          = (firebaseConfig.appId)
VITE_SITE_PASSWORD            = (the word everyone types to enter)
VITE_DM_PASSWORD              = (the word only you type to run the table)
```

After it deploys, Vercel gives you a URL like
`https://drowned-world.vercel.app`. That is the link you send your players.

---

## Running a session

1. You open the link, check **I am the Dungeon Master**, enter both passwords
   and the room code (default "drowned"). The table opens.
2. Players open the same link, enter the site password, a name, and the **same
   room code**, and join.
3. Click **OPEN VOTING**. Players tap a glowing bough to vote. You watch the
   tally fill in live.
4. The leading route is auto-highlighted, or click any route yourself. Hit
   **ROLL THE PARTY d20**. The result resolves, the party moves, stores and
   reputation update, and everyone's screen follows.
5. Use the +/- buttons any time to nudge Resolve, Supplies, or Reputation.

---

## Local development

```
cp .env.example .env.local     # fill in your real values
npm install
npm run dev                    # opens on http://localhost:5173
```

---

## Editing the world

Everything you'll want to change lives in `src/data.js`: the nodes, their
positions, the routes, and each route's benefit / cost / risk / DC. No app
logic is in that file, so you can safely rewrite the whole map there.

When you have real map artwork, drop the image into `src/Map.jsx` behind the
`<svg>` (as a background on the wrapping div), then reposition the `x`/`y`
coordinates in `NODES` to line up with your art. The 1000x620 coordinate
space stays the same.

---

## Honest limitations

- The passwords are checked in the browser, so this is "keep strangers out,"
  not real security. Don't store anything sensitive.
- The Firestore rules above allow anyone who finds your project to read/write
  the `games` collection. For a private group that's fine. If you want it
  tighter later, add Firebase Anonymous Auth and require `request.auth != null`.
- Only the DM rolls and commits state, by design. That's what keeps this
  simple and free of sync conflicts.
