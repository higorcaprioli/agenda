// Sincronização Agenda HC → Google Agenda + Google Tarefas.
// - Horários do dia viram eventos de 30 min na agenda "Agenda HC".
// - Tarefas do dia vão para a lista "Agenda HC" do Google Tarefas.
// O token do Google dura ~1h; quando expira, o app pede um toque em "Reconectar".
// O estado do que já foi enviado fica em "gsync:AAAA-MM-DD" (sincronizado entre aparelhos).

import * as store from './store.js';
import { googleClientId } from './firebase-config.js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/tasks',
];
const CAL = 'https://www.googleapis.com/calendar/v3';
const TASKS = 'https://tasks.googleapis.com/tasks/v1';
const CFG_ID = 'gsync:config';
const QUEUE_KEY = 'agenda:gsync:queue';
const TOKEN_KEY = 'agenda:gsync:token';
const REMINDER_MIN = 10;
const EVENT_COLOR = '9'; // cor de evento do Google Agenda: 9 = "Mirtilo" (azul)
const CALENDAR_BG = '#3f51b5';
const LOCAL_DELAY = 1500;
const REMOTE_DELAY = 20000; // dá tempo do outro aparelho terminar e o estado chegar aqui

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
const pad = n => String(n).padStart(2, '0');

let token = null;
let tokenExp = 0;
let tokenClient = null;
let gisLoading = null;
let running = false;
let timer = null;
let status = { state: 'off' };
const statusFns = new Set();

const queue = new Set(readJSON(QUEUE_KEY, []));
try {
  const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
  if (t?.tokenExp > Date.now()) ({ token, tokenExp } = t);
} catch { /* sem sessão */ }

function readJSON(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
function saveQueue() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify([...queue])); } catch { /* ignora */ } }

export const available = () => !!googleClientId;
export const enabled = () => available() && !!store.get(CFG_ID)?.enabled;
export const getStatus = () => status;
export const onStatus = fn => statusFns.add(fn);
const hasToken = () => token && Date.now() < tokenExp;

function setStatus(s) {
  status = { ...s, pending: queue.size };
  statusFns.forEach(fn => fn(status));
}

// ---------- autorização (Google Identity Services) ----------
export function preload() {
  if (!available()) return Promise.resolve();
  gisLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = () => { gisLoading = null; reject(new Error('Não foi possível carregar o login do Google.')); };
    document.head.appendChild(s);
  }).then(() => {
    tokenClient ||= google.accounts.oauth2.initTokenClient({
      client_id: googleClientId, scope: SCOPES.join(' '), callback: () => {},
    });
  });
  return gisLoading;
}

/** Precisa ser chamado direto de um toque/clique (abre a janela do Google). */
export function authorize() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) { preload(); reject(new Error('O Google ainda está carregando. Tente de novo em alguns segundos.')); return; }
    tokenClient.callback = r => {
      if (r.error) { reject(new Error(r.error_description || r.error)); return; }
      if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...SCOPES)) {
        reject(new Error('É preciso permitir o acesso à agenda e às tarefas para sincronizar.'));
        return;
      }
      token = r.access_token;
      tokenExp = Date.now() + (Number(r.expires_in) - 60) * 1000;
      try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, tokenExp })); } catch { /* ignora */ }
      resolve();
    };
    tokenClient.error_callback = e => reject(new Error(e.type === 'popup_closed' ? 'A janela do Google foi fechada.' : (e.message || e.type)));
    tokenClient.requestAccessToken({ prompt: enabled() ? '' : 'consent', hint: store.status().user?.email });
  });
}

export async function connect() {
  await authorize();
  store.set(CFG_ID, { ...store.get(CFG_ID), enabled: true });
  // envia os últimos 30 dias e tudo o que vem pela frente
  const from = new Date(); from.setDate(from.getDate() - 30);
  const min = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
  for (const id of store.keys('day:')) if (id.slice(4) >= min) queue.add(id.slice(4));
  saveQueue();
  await run();
}

export async function reconnect() {
  await authorize();
  await run();
}

export function disconnect() {
  store.set(CFG_ID, { ...store.get(CFG_ID), enabled: false });
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
  token = null; tokenExp = 0;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignora */ }
  setStatus({ state: 'off' });
}

export function syncNow() {
  for (const id of store.keys('day:')) queue.add(id.slice(4));
  saveQueue();
  return run();
}

// ---------- API ----------
async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { token = null; throw Object.assign(new Error('Sessão do Google expirou.'), { auth: true }); }
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || `Erro ${r.status} no Google`), { status: r.status });
  return data;
}

async function ensureTargets() {
  let cfg = store.get(CFG_ID) || {};
  if (!cfg.calendarId) {
    const cal = await api('POST', `${CAL}/calendars`, { summary: 'Agenda HC', timeZone: tz });
    cfg = { ...cfg, calendarId: cal.id };
    store.set(CFG_ID, cfg);
  }
  if (!cfg.tasklistId) {
    const list = await api('POST', `${TASKS}/users/@me/lists`, { title: 'Agenda HC' });
    cfg = { ...cfg, tasklistId: list.id };
    store.set(CFG_ID, cfg);
  }
  return cfg;
}

// cor mudou desde o último envio? reenvia os eventos existentes (mesmo id → só atualiza)
const needsRecolor = () => {
  const cfg = store.get(CFG_ID) || {};
  return !!cfg.calendarId && cfg.eventColor !== EVENT_COLOR;
};

async function recolor(cfg) {
  // a cor da agenda na lista do Google (se a permissão não cobrir, segue só com a cor dos eventos)
  await api('PATCH', `${CAL}/users/me/calendarList/${encodeURIComponent(cfg.calendarId)}?colorRgbFormat=true`,
    { backgroundColor: CALENDAR_BG, foregroundColor: '#ffffff' }).catch(() => {});
  for (const id of store.keys('gsync:2')) {
    const st = store.get(id);
    if (!Object.keys(st?.slots || {}).length) continue;
    store.set(id, { ...st, slots: {} });
    queue.add(id.slice('gsync:'.length));
  }
  saveQueue();
  store.set(CFG_ID, { ...store.get(CFG_ID), eventColor: EVENT_COLOR });
}

async function ignoreGone(p) {
  try { await p; } catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
}

async function syncDay(date, cfg) {
  const day = store.get('day:' + date) || {};
  const st = JSON.parse(JSON.stringify(store.get('gsync:' + date) || { slots: {}, tasks: {} }));
  const cal = encodeURIComponent(cfg.calendarId);
  const list = encodeURIComponent(cfg.tasklistId);
  try {
    // horários → eventos (id fixo por dia/horário, então reenviar só atualiza)
    const hours = day.hours || {};
    for (const k of new Set([...Object.keys(hours), ...Object.keys(st.slots)])) {
      const m = /^(\d+)([ab])$/.exec(k);
      if (!m) continue;
      const text = (hours[k] || '').trim();
      if (text === (st.slots[k] || '')) continue;
      const h = +m[1], half = m[2];
      const id = `ahc${date.replaceAll('-', '')}s${pad(h)}${half}`;
      const url = `${CAL}/calendars/${cal}/events/${id}`;
      if (text) {
        const start = half === 'a' ? `${pad(h)}:00` : `${pad(h)}:30`;
        const end = half === 'a' ? `${pad(h)}:30` : `${pad(h + 1)}:00`;
        const body = {
          id, summary: text, status: 'confirmed', colorId: EVENT_COLOR,
          start: { dateTime: `${date}T${start}:00`, timeZone: tz },
          end: { dateTime: `${date}T${end}:00`, timeZone: tz },
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: REMINDER_MIN }] },
        };
        try { await api('PUT', url, body); }
        catch (e) { if (e.status === 404) await api('POST', `${CAL}/calendars/${cal}/events`, body); else throw e; }
        st.slots[k] = text;
      } else {
        await ignoreGone(api('DELETE', url));
        delete st.slots[k];
      }
    }

    // tarefas → Google Tarefas
    const seen = new Set();
    for (const t of day.tasks || []) {
      if (!t.id) continue;
      seen.add(t.id);
      const text = (t.text || '').trim();
      const prev = st.tasks[t.id];
      if (!text) {
        if (prev) { await ignoreGone(api('DELETE', `${TASKS}/lists/${list}/tasks/${prev.gid}`)); delete st.tasks[t.id]; }
        continue;
      }
      if (prev && prev.text === text && prev.done === !!t.done) continue;
      const body = { title: text, status: t.done ? 'completed' : 'needsAction', due: `${date}T00:00:00.000Z` };
      let gid = prev?.gid;
      if (gid) {
        try { await api('PATCH', `${TASKS}/lists/${list}/tasks/${gid}`, body); }
        catch (e) { if (e.status === 404) gid = null; else throw e; }
      }
      if (!gid) gid = (await api('POST', `${TASKS}/lists/${list}/tasks`, body)).id;
      st.tasks[t.id] = { gid, text, done: !!t.done };
    }
    for (const [lid, v] of Object.entries(st.tasks)) {
      if (seen.has(lid)) continue;
      await ignoreGone(api('DELETE', `${TASKS}/lists/${list}/tasks/${v.gid}`));
      delete st.tasks[lid];
    }
  } finally {
    store.set('gsync:' + date, st);
  }
}

// o dia tem algo diferente do que já foi enviado? (se outro aparelho já enviou, não precisa de token)
function isDirty(date) {
  const day = store.get('day:' + date) || {};
  const st = store.get('gsync:' + date) || { slots: {}, tasks: {} };
  const hours = day.hours || {};
  for (const k of new Set([...Object.keys(hours), ...Object.keys(st.slots)])) {
    if (/^\d+[ab]$/.test(k) && (hours[k] || '').trim() !== (st.slots[k] || '')) return true;
  }
  const tasks = (day.tasks || []).filter(t => t.id);
  for (const t of tasks) {
    const text = (t.text || '').trim();
    const prev = st.tasks[t.id];
    if (!text) { if (prev) return true; continue; }
    if (!prev || prev.text !== text || prev.done !== !!t.done) return true;
  }
  const ids = new Set(tasks.map(t => t.id));
  return Object.keys(st.tasks).some(id => !ids.has(id));
}

// ---------- fila ----------
function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(run, delay);
}

export function enqueue(date, delay = LOCAL_DELAY) {
  if (!enabled()) return;
  queue.add(date);
  saveQueue();
  schedule(delay);
}

async function run() {
  if (running || !enabled()) return;
  for (const date of [...queue]) if (!isDirty(date)) queue.delete(date);
  saveQueue();
  if (!queue.size && !needsRecolor()) { setStatus({ state: 'ready', last: status.last }); return; }
  if (!hasToken()) { setStatus({ state: 'need-auth' }); return; }
  if (!navigator.onLine) { setStatus({ state: 'offline' }); return; }
  running = true;
  setStatus({ state: 'syncing' });
  try {
    const cfg = await ensureTargets();
    if (needsRecolor()) await recolor(cfg);
    for (const date of [...queue].sort()) {
      await syncDay(date, cfg);
      queue.delete(date);
      saveQueue();
    }
    setStatus({ state: 'ready', last: Date.now() });
  } catch (e) {
    if (e.auth) setStatus({ state: 'need-auth' });
    else setStatus({ state: 'error', message: e.message });
  } finally {
    running = false;
  }
}

// ---------- ligação com o app ----------
export function init() {
  if (!available()) return;
  store.onLocalSet(id => { if (id.startsWith('day:')) enqueue(id.slice(4)); });
  store.onChange(ids => { for (const id of ids) if (id.startsWith('day:')) enqueue(id.slice(4), REMOTE_DELAY); });
  addEventListener('online', () => run());
  if (enabled()) { preload().catch(() => {}); run(); }
}
