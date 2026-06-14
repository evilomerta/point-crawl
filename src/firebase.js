// Firebase wiring. Web config keys are public by design; access is controlled
// by Firestore rules and the site password, not by hiding these.
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, onSnapshot, setDoc, updateDoc, getDoc, deleteField, increment,
} from "firebase/firestore";
export { increment };

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(config);
export const db = getFirestore(app);

function ref(room) {
  return doc(db, "games", room);
}

export function subscribeGame(room, cb) {
  return onSnapshot(ref(room), (snap) => cb(snap.exists() ? snap.data() : null));
}

export async function ensureGame(room, initial) {
  const snap = await getDoc(ref(room));
  if (!snap.exists()) await setDoc(ref(room), initial);
}

export async function writeGame(room, patch) {
  await updateDoc(ref(room), patch);
}

export async function castVote(room, voterKey, routeId) {
  await updateDoc(ref(room), { ["votes." + voterKey]: routeId });
}

// Presence heartbeat: each client stamps the current time under its key.
export async function heartbeat(room, key, name, role) {
  try {
    await updateDoc(ref(room), { ["presence." + key]: { name, role, ts: Date.now() } });
  } catch (e) { /* room may not exist yet for a player; ignore */ }
}

export async function clearPresence(room, key) {
  try {
    await updateDoc(ref(room), { ["presence." + key]: deleteField() });
  } catch (e) { /* ignore */ }
}

export async function resetGame(room, initial) {
  await setDoc(ref(room), initial);
}
export { deleteField };
