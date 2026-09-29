// Armazenamento: cópia local (localStorage) sempre + sincronização com Firestore
// quando o Firebase está configurado e o usuário entrou com o Google.
// Cada documento: { data, updatedAt }. Vence a versão mais recente.

import { firebaseConfig } from './firebase-config.js';

const FB_VERSION = '10.12.2';
const PREFIX = 'agenda:v1:';
const PUSH_DELAY = 700;

const cache = new Map();
const changeFns = new Set();
const localFns = new Set();
const statusFns = new Set();
const timers = new Map();
let state = { status: 'local', user: null, error: null };
let fb = null;
let uid = null;
let unsub = null;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* cheio ou bloqueado */ } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};

for (const k of ls.keys()) {
  if (!k.startsWith(PREFIX)) continue;
  try { cache.set(k.slice(PREFIX.length), JSON.parse(ls.get(k))); } catch { /* ignora */ }
}

export const get = id => cache.get(id)?.data ?? null;
export const status = () => state;
export const keys = prefix => [...cache.keys()].filter(k => k.startsWith(prefix));
export const onChange = fn => changeFns.add(fn); // mudanças vindas de outro aparelho
export const onLocalSet = fn => localFns.add(fn); // mudanças feitas neste aparelho
export const onStatus = fn => statusFns.add(fn);

export function set(id, data) {
  const entry = { data: JSON.parse(JSON.stringify(data)), updatedAt: Date.now() };
  cache.set(id, entry);
  ls.set(PREFIX + id, JSON.stringify(entry));
  if (uid) schedule(id);
  localFns.forEach(fn => fn(id));
}

function setStatus(status, error = null) {
  state = { ...state, status, error };
  statusFns.forEach(fn => fn(state));
}

function settle() {
  if (!uid) return;
  if (timers.size) setStatus('pending');
  else setStatus(navigator.onLine ? 'synced' : 'offline');
}

function schedule(id) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => push(id), PUSH_DELAY));
  setStatus(navigator.onLine ? 'pending' : 'offline');
}

async function push(id) {
  const entry = cache.get(id);
  const forUid = uid;
  try {
    // offline, o Firestore guarda na fila e envia quando voltar a conexão
    const p = fb.setDoc(fb.doc(fb.db, 'users', forUid, 'docs', id), entry);
    timers.delete(id);
    settle();
    await p;
  } catch (e) {
    timers.delete(id);
    setStatus('error', e.message);
  }
}

function startSync(user) {
  uid = user.uid;
  state.user = { name: user.displayName, email: user.email, uid: user.uid };
  setStatus('pending');
  let first = true;
  unsub = fb.onSnapshot(fb.collection(fb.db, 'users', uid, 'docs'), snap => {
    const changed = [];
    for (const ch of snap.docChanges()) {
      if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) continue;
      const remote = ch.doc.data();
      const local = cache.get(ch.doc.id);
      if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
        cache.set(ch.doc.id, remote);
        ls.set(PREFIX + ch.doc.id, JSON.stringify(remote));
        changed.push(ch.doc.id);
      }
    }
    if (first) {
      // envia o que foi escrito neste aparelho antes de entrar (ou offline)
      first = false;
      const remoteAt = new Map(snap.docs.map(d => [d.id, d.data().updatedAt || 0]));
      for (const [id, local] of cache) {
        if (!remoteAt.has(id) || local.updatedAt > remoteAt.get(id)) schedule(id);
      }
    }
    settle();
    if (changed.length) changeFns.forEach(fn => fn(changed));
  }, err => setStatus('error', err.message));
}

function stopSync() {
  unsub?.();
  unsub = null;
  uid = null;
  timers.forEach(clearTimeout);
  timers.clear();
}

export async function init() {
  if (!firebaseConfig?.apiKey) { setStatus('local'); return; }
  setStatus('loading');
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    let db;
    try {
      db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
      });
    } catch {
      db = fsMod.getFirestore(app);
    }
    const auth = authMod.getAuth(app);
    fb = { ...authMod, ...fsMod, db, auth };
    authMod.onAuthStateChanged(auth, user => {
      stopSync();
      if (user) startSync(user);
      else { state.user = null; setStatus('signed-out'); }
    });
  } catch (e) {
    setStatus('error', 'Não foi possível carregar o Firebase. Verifique a conexão e recarregue a página.');
  }
}

export async function signIn() {
  if (!fb) return;
  try {
    await fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider());
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    if (e.code === 'auth/popup-blocked') alert('O navegador bloqueou a janela de login. Permita pop-ups para este site e tente de novo.');
    else if (e.code === 'auth/unauthorized-domain') alert('Este domínio não está autorizado no Firebase.\nAdicione-o em Authentication → Configurações → Domínios autorizados.');
    else alert('Não foi possível entrar: ' + (e.message || e.code));
  }
}

export async function signOut() {
  if (fb) await fb.signOut(fb.auth);
}

addEventListener('online', settle);
addEventListener('offline', settle);
