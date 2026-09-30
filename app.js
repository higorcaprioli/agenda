import * as store from './store.js';
import { holidaysOf } from './holidays.js';
import * as gsync from './gsync.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MES3 = MESES.map(m => m.slice(0, 3));
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const DIA3 = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const INICIAIS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6h às 22h
const STEPS = 6;

// ---------- utilidades de data ----------
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (y, m) => `${y}-${pad(m + 1)}`;
const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const utc = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
const dayOfYear = d => (utc(d) - Date.UTC(d.getFullYear(), 0, 1)) / 864e5 + 1;
function isoWeek(d) {
  const t = new Date(utc(d));
  const wd = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wd);
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const holCache = new Map();
const holidays = y => { if (!holCache.has(y)) holCache.set(y, holidaysOf(y)); return holCache.get(y); };

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] == null) o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    o = o[ks[i]];
  }
  o[ks.at(-1)] = val;
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const load = (id, fallback) => { const d = store.get(id); return d ? JSON.parse(JSON.stringify(d)) : fallback; };

function dayHasContent(day) {
  if (!day) return false;
  return !!(day.notes?.trim() || day.tasks?.length || Object.values(day.hours || {}).some(v => v?.trim()));
}

// ---------- ícones ----------
const ICON = {
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  marker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 11-5 5v3h3l5-5M9 11l6-6 4 4-6 6M9 11l4 4"/></svg>',
};

// ---------- estado ----------
const app = document.getElementById('app');
let view = { docId: null };
let ctx = { y: today().getFullYear(), m: today().getMonth() };
let shownToday = null;
let deferred = false;

function toolbar({ prev, next, title, todayHref, showToday, titleAction = '' }) {
  return `<div class="toolbar">
    <a class="tb-btn" href="${prev}" aria-label="Anterior">‹</a>
    ${titleAction
      ? `<button class="tb-title" data-action="${titleAction}">${title}<span class="caret">▾</span></button>`
      : `<div class="tb-title">${title}</div>`}
    <a class="tb-btn" href="${next}" aria-label="Próximo">›</a>
    ${showToday ? `<a class="tb-today" href="${todayHref}">Hoje</a>` : ''}
  </div>`;
}

// ---------- página do dia ----------
function renderDay(d, isTodayRoute) {
  const di = iso(d);
  const id = 'day:' + di;
  const model = load(id, { hl: false, hours: {}, tasks: [], notes: '' });
  model.hours ||= {};
  model.tasks ||= [];
  // tarefas antigas sem id ganham um (o Google Tarefas precisa de id estável)
  if (model.tasks.some(t => !t.id)) {
    model.tasks.forEach(t => { t.id ||= newId(); });
    store.set(id, model);
  }
  const y = d.getFullYear(), m = d.getMonth(), n = d.getDate();
  const h = holidays(y).get(di);
  const plan = store.get(`month:${ym(y, m)}`)?.lines?.[n];
  const isToday = di === iso(today());
  if (isTodayRoute) shownToday = di;
  ctx = { y, m };
  view = { docId: id, model, after: afterDayInput };

  const done = model.tasks.filter(t => t.done).length;

  app.innerHTML = `
  ${toolbar({
    prev: `#/dia/${iso(addDays(d, -1))}`, next: `#/dia/${iso(addDays(d, 1))}`,
    title: `${n} de ${MESES[m].toLowerCase()} ${y}`, titleAction: 'pick-date',
    todayHref: '#/hoje', showToday: !isToday,
  })}
  <input type="date" class="sr-date" value="${di}" tabindex="-1" aria-hidden="true">
  <article class="sheet day">
    <header class="day-head">
      <div class="dh-month">${MES3[m]}</div><div class="dh-bar"></div>
      <div class="dh-num">${n}</div>
      <div class="dh-bar"></div><div class="dh-wd">${DIA3[d.getDay()]}</div>
    </header>
    <div class="day-meta">
      ${isToday ? '<span class="chip today">Hoje</span>' : ''}
      ${(eventsOf(y).get(di) || []).map(e => `<span class="chip ev">★ ${esc(e.title)}</span>`).join('')}
      ${h ? `<span class="chip hol">${esc(h.name)}${h.official ? ' *' : ''}</span>` : ''}
      ${plan?.trim() ? `<a class="chip plan" href="#/mes/${ym(y, m)}" title="Do planejamento do mês"><small>Plano</small> ${esc(plan)}</a>` : ''}
      <button class="hl-btn ${model.hl ? 'on' : ''}" data-action="hl" aria-pressed="${!!model.hl}" title="Destacar este dia no calendário anual">${ICON.marker}<span>Destacar</span></button>
    </div>
    <div class="day-grid">
      <section class="hours" aria-label="Horários">${isToday ? remindersHtml(urgentReminders()) : ''}${hoursHtml(model)}</section>
      <section class="tasks" aria-label="Tarefas">
        <h3 class="col-title">Tarefas <span class="tasks-count">${model.tasks.length ? `${done}/${model.tasks.length}` : ''}</span></h3>
        <ul class="task-list">
          ${model.tasks.map((t, i) => `<li class="task ${t.done ? 'done' : ''}">
            <input type="checkbox" data-path="tasks.${i}.done" ${t.done ? 'checked' : ''} aria-label="Concluída">
            <input type="text" data-path="tasks.${i}.text" value="${esc(t.text)}" aria-label="Tarefa ${i + 1}">
            <button class="x" data-action="del-task" data-i="${i}" aria-label="Remover tarefa">×</button>
          </li>`).join('')}
        </ul>
        <div class="task new">${ICON.plus}<input type="text" class="new-task" placeholder="Nova tarefa" enterkeyhint="done" aria-label="Nova tarefa"></div>
      </section>
    </div>
    <section class="notes">
      <div class="lbl">Notas</div>
      <textarea class="ruled" rows="4" data-path="notes" aria-label="Notas">${esc(model.notes)}</textarea>
    </section>
    <footer class="sheet-foot"><span>Semana ${isoWeek(d)}</span><span>${dayOfYear(d)} de ${isLeap(y) ? 366 : 365}</span></footer>
  </article>`;
  document.title = `${n} ${MES3[m]} · AGENDA HC`;
}

// ---------- horários que ocupam várias linhas ----------
// model.spans = { "10a": 4 } → começa às 10:00 e ocupa 4 meias-horas (até 12:00)
const SLOTS = HOURS.flatMap(h => [h + 'a', h + 'b']);
const slotTime = i => { const h = HOURS[0] + Math.floor(i / 2); return `${pad(h)}:${i % 2 ? '30' : '00'}`; };

/** Para cada slot: { owner: índice do slot que o cobre, span } */
function spanMap(model) {
  const spans = model.spans || {};
  const cover = new Array(SLOTS.length).fill(null);
  SLOTS.forEach((s, i) => {
    if (cover[i] !== null) return;
    const n = (model.hours[s] || '').trim() ? Math.max(1, spans[s] || 1) : 1;
    for (let k = i; k < Math.min(SLOTS.length, i + n); k++) cover[k] = i;
  });
  return cover;
}

function slotInputHtml(model, i, cover) {
  const s = SLOTS[i];
  const hr = parseInt(s, 10);
  const label = `${hr}h${s.endsWith('b') ? '30' : ''}`;
  const half = s.endsWith('b') ? 'half' : '';
  const owner = cover[i];
  if (owner !== i) {
    const txt = model.hours[SLOTS[owner]];
    return `<input type="text" class="${half} covered" data-slot="${i}" value="" placeholder="↳ ${esc(txt)}" disabled aria-label="${label} (ocupado)">`;
  }
  const text = model.hours[s] || '';
  const n = cover.filter(o => o === i).length;
  const range = n > 1 ? `<span class="span-range">${slotTime(i)} – ${slotTime(i + n)}</span>` : '';
  const grip = text.trim() ? `<span class="grip span-grip" data-grip="slot" data-slot="${i}" title="Arraste para baixo para ocupar mais horários">⇕</span>` : '';
  return `<span class="slot ${n > 1 ? 'span-start' : ''} ${text.trim() ? 'filled' : ''}" data-slot="${i}"><input type="text" class="${half}" data-path="hours.${s}" value="${esc(text)}" aria-label="${label}">${range}${grip}</span>`;
}

// lembretes: anotações urgentes (!) ainda não feitas aparecem em Hoje num quadro próprio,
// acima dos horários, na mesma ordem das Anotações; todo dia, até serem marcadas como feitas
// ou excluídas (nada é gravado nos dias)
function urgentReminders() {
  const list = [];
  for (const c of store.get(NOTES_ID)?.cats || []) for (const it of c.items || []) {
    if (it.urgent && !it.done && it.text?.trim()) list.push({ ...it, cat: c.title });
  }
  return list;
}

function remindersHtml(list) {
  return list.length ? `<section class="rem-box" aria-label="Lembretes urgentes">
    <h3 class="rem-title"><b class="urg">!</b> Urgentes <span>${list.length}</span></h3>
    <ul class="rem">${list.map(it => `<li>
      <input type="checkbox" data-action="rem-done" data-id="${esc(it.id)}" aria-label="Marcar como feito">
      <span class="rem-text">${esc(it.text)}</span>${it.cat?.trim() ? `<a class="rem-cat" href="#/notas">${esc(it.cat)}</a>` : ''}
    </li>`).join('')}</ul>
  </section>` : '';
}

function hoursHtml(model) {
  const cover = spanMap(model);
  return HOURS.map((hr, k) => `<div class="hour">
    <span class="h">${hr}</span>
    ${slotInputHtml(model, k * 2, cover)}
    ${slotInputHtml(model, k * 2 + 1, cover)}
  </div>`).join('');
}

// Hoje: segurar um afazer sem mexer o dedo e arrastar para outra linha.
// Afazer solto em cima de outro afazer: troca os dois. Toque rápido no afazer: edita o texto.
const HOLD_MS = 350; // tempo segurando o dedo parado para começar a arrastar
let dayDragActive = false, dayDragged = false;
function dayDragStart(src, x0, y0, bindMove) {
  const from = +src.dataset.slot;
  const rows = [...app.querySelectorAll('.hours .slot, .hours input.covered')];
  let active = false, lastY = y0, to = null;
  const pick = () => {
    const hit = rows.find(r => { const b = r.getBoundingClientRect(); return lastY >= b.top && lastY < b.bottom; });
    if (!hit) return;
    to = +hit.dataset.slot;
    rows.forEach(r => r.classList.toggle('move-target', r === hit && to !== from));
  };
  const auto = () => {
    if (!active) return;
    const top = (document.querySelector('.appbar')?.offsetHeight || 0) + 40;
    const bottom = (document.getElementById('tabs')?.getBoundingClientRect().top ?? innerHeight) - 40;
    const d = lastY < top ? -8 : lastY > bottom ? 8 : 0;
    if (d) { scrollBy(0, d); pick(); }
    requestAnimationFrame(auto);
  };
  const timer = setTimeout(() => {
    active = dayDragActive = dayDragged = true;
    src.classList.add('moving');
    navigator.vibrate?.(25);
    getSelection()?.removeAllRanges();
    pick();
    requestAnimationFrame(auto);
  }, HOLD_MS);
  const unbind = bindMove({
    move(x, y, ev) {
      lastY = y;
      if (!active) {
        if (Math.hypot(x - x0, y - y0) > 10) { clearTimeout(timer); unbind(); } // é rolagem
        return;
      }
      if (ev.cancelable) ev.preventDefault();
      pick();
    },
    end(cancelled) {
      clearTimeout(timer); unbind();
      if (!active) return;
      active = dayDragActive = false;
      if (!cancelled && to !== null) {
        if (to !== from) moveSlot(view.model, from, to);
      }
      rerender();
      setTimeout(() => { dayDragged = false; }, 60);
    },
  });
}
const dayDragTarget = t => {
  if (!t.closest?.('.hours') || t.closest('[data-grip], [data-action], a')) return null;
  const slot = t.closest('.slot.filled');
  return slot && document.activeElement !== slot.querySelector('input') ? slot : null;
};
app.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  const src = dayDragTarget(e.target);
  if (!src) return;
  const t0 = e.touches[0];
  dayDragStart(src, t0.clientX, t0.clientY, h => {
    const move = ev => { const t = ev.touches[0]; if (t) h.move(t.clientX, t.clientY, ev); };
    const end = ev => h.end(ev.type === 'touchcancel');
    addEventListener('touchmove', move, { passive: false });
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    return () => {
      removeEventListener('touchmove', move, { passive: false });
      removeEventListener('touchend', end);
      removeEventListener('touchcancel', end);
    };
  });
}, { passive: true });
app.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const src = dayDragTarget(e.target);
  if (!src) return;
  dayDragStart(src, e.clientX, e.clientY, h => {
    const move = ev => h.move(ev.clientX, ev.clientY, ev);
    const end = () => h.end(false);
    addEventListener('mousemove', move);
    addEventListener('mouseup', end);
    return () => { removeEventListener('mousemove', move); removeEventListener('mouseup', end); };
  });
});
app.addEventListener('touchmove', e => { if (dayDragActive && e.cancelable) e.preventDefault(); }, { passive: false });
app.addEventListener('contextmenu', e => { if (e.target.closest('.hours .slot.filled')) e.preventDefault(); });
// toque rápido num afazer escrito → edita (o campo só recebe toque direto quando já está em edição)
app.addEventListener('click', e => {
  const slot = e.target.closest('.hours .slot.filled');
  if (!slot || e.target.closest('[data-grip]')) return;
  if (dayDragged) { dayDragged = false; return; }
  const inp = slot.querySelector('input');
  if (document.activeElement === inp) return;
  inp.focus();
  const n = inp.value.length;
  inp.setSelectionRange(n, n);
});

function moveSlot(model, from, to) {
  const H = model.hours, S = (model.spans ||= {});
  const cover = spanMap(model);
  const a = SLOTS[from];
  // soltou dentro de um bloco esticado de outro afazer → vale o início dele
  const owner = cover[to];
  if (owner !== null && owner !== from && owner !== to && (H[SLOTS[owner]] || '').trim()) to = owner;
  const b = SLOTS[to];
  if (a === b) return;
  const ta = H[a], sa = S[a];
  const tb = H[b], sb = S[b];
  if ((tb || '').trim()) { H[a] = tb; if (sb) S[a] = sb; else delete S[a]; }
  else { delete H[a]; delete S[a]; }
  H[b] = ta; if (sa) S[b] = sa; else delete S[b];
  // um bloco esticado não pode passar por cima de outro afazer nem do fim do dia
  SLOTS.forEach((s, i) => {
    if (!S[s]) return;
    let n = Math.min(S[s], SLOTS.length - i);
    for (let k = i + 1; k < i + n; k++) if ((H[SLOTS[k]] || '').trim()) { n = k - i; break; }
    if (n > 1) S[s] = n; else delete S[s];
  });
  store.set(view.docId, model);
}

function afterDayInput(el) {
  const slot = /^hours\.(\w+)$/.exec(el.dataset.path)?.[1];
  if (slot) {
    // apagou o texto de um horário esticado → desfaz o bloco
    const had = !!view.model.spans?.[slot];
    if (had && !el.value.trim()) { delete view.model.spans[slot]; store.set(view.docId, view.model); rerender(); }
    // passou a ter texto (ou deixou de ter) → mostra/esconde a alça
    const wrap = el.closest('.slot');
    if (wrap && !!wrap.querySelector('.span-grip') !== !!el.value.trim() && !had) {
      const i = +wrap.dataset.slot;
      wrap.outerHTML = slotInputHtml(view.model, i, spanMap(view.model));
      app.querySelector(`[data-path="hours.${slot}"]`)?.focus();
      const inp = app.querySelector(`[data-path="hours.${slot}"]`);
      inp?.setSelectionRange(inp.value.length, inp.value.length);
    }
    return;
  }
  if (!el.dataset.path.startsWith('tasks.')) return;
  if (el.type === 'checkbox') el.closest('.task').classList.toggle('done', el.checked);
  const tasks = view.model.tasks;
  app.querySelector('.tasks-count').textContent = `${tasks.filter(t => t.done).length}/${tasks.length}`;
}

// ---------- planejamento do mês ----------
function renderMonth(y, m) {
  const id = `month:${ym(y, m)}`;
  const model = load(id, { lines: {} });
  model.lines ||= {};
  ctx = { y, m };
  view = { docId: id, model };
  const H = holidays(y);
  const E = eventsOf(y);
  const t = iso(today());
  const prev = new Date(y, m - 1, 1), next = new Date(y, m + 1, 1);

  const rows = Array.from({ length: daysIn(y, m) }, (_, i) => {
    const n = i + 1;
    const date = new Date(y, m, n);
    const di = iso(date);
    const wd = date.getDay();
    const h = H.get(di);
    const day = store.get('day:' + di);
    const cls = [wd === 0 && 'sun', di === t && 'today', day?.hl && 'hl'].filter(Boolean).join(' ');
    return `<div class="mrow ${cls}">
      <a class="md" href="#/dia/${di}" title="Abrir a página do dia ${n}"><b>${n}</b><span>${DIA3[wd]}</span>${dayHasContent(day) ? '<i class="dot" title="Tem anotações no dia"></i>' : ''}</a>
      <input type="text" data-path="lines.${n}" value="${esc(model.lines[n])}" aria-label="Dia ${n}">
      <span class="tags">${(E.get(di) || []).map(e => `<span class="tag ev" title="${esc(e.title)}">★ ${esc(e.title)}</span>`).join('')}${h ? `<span class="tag" title="${esc(h.name)}">${esc(h.name)}${h.official ? ' *' : ''}</span>` : ''}</span>
    </div>`;
  }).join('');

  const now = today();
  app.innerHTML = `
  ${toolbar({
    prev: `#/mes/${ym(prev.getFullYear(), prev.getMonth())}`, next: `#/mes/${ym(next.getFullYear(), next.getMonth())}`,
    title: `${MESES[m]} ${y}`, todayHref: `#/mes/${ym(now.getFullYear(), now.getMonth())}`,
    showToday: y !== now.getFullYear() || m !== now.getMonth(),
  })}
  <article class="sheet month">
    <h1 class="page-title">Planejamento ${y}</h1>
    <h2 class="month-name">${MESES[m]}</h2>
    <div class="month-list">${rows}</div>
    <footer class="sheet-foot"><span>Toque no número para abrir a página do dia</span><span>* Feriado nacional</span></footer>
  </article>`;
  document.title = `${MESES[m]} ${y} · AGENDA HC`;
}

// ---------- aniversários e datas anuais ----------
// item: { id, title, m (0-11), d, yearly, y (só quando não repete) }
const EVENTS_ID = 'events';
const SEED_EVENTS = [
  { title: 'Aniversário do Pai', m: 1, d: 3, yearly: true },
  { title: 'Aniversário da Mãe', m: 6, d: 22, yearly: true },
];
// o exemplo só é salvo na primeira alteração (não sobrescreve a nuvem num aparelho novo)
const eventsDoc = () => load(EVENTS_ID, null) || { items: SEED_EVENTS.map(e => ({ id: newId(), ...e })) };

/** Map "AAAA-MM-DD" -> [eventos] do ano y */
function eventsOf(y) {
  const map = new Map();
  for (const e of eventsDoc().items) {
    if (!e.yearly && e.y !== y) continue;
    if (e.m === 1 && e.d === 29 && !isLeap(y)) continue;
    const k = iso(new Date(y, e.m, e.d));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return map;
}

function eventsSectionHtml(y) {
  const items = eventsDoc().items
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => a.m - b.m || a.d - b.d || a.title.localeCompare(b.title));
  return `<section class="yev" id="datas">
    <h2 class="yev-title">Aniversários e datas anuais</h2>
    <form class="yev-form">
      <input type="text" name="title" placeholder="Ex.: Aniversário do Pai" required aria-label="Nome do evento">
      <input type="date" name="date" value="${y}-${pad(today().getMonth() + 1)}-${pad(today().getDate())}" required aria-label="Data">
      <label class="yev-rep"><input type="checkbox" name="yearly" checked> Repetir todos os anos</label>
      <button class="btn primary" type="submit">Adicionar</button>
    </form>
    ${items.length ? `<ul class="yev-list">${items.map(e => `<li>
      <span class="yev-date">${pad(e.d)}/${pad(e.m + 1)}</span>
      <span class="yev-name">${esc(e.title)}</span>
      <span class="yev-tag">${e.yearly ? 'todo ano' : e.y}</span>
      <button class="x" data-action="del-event" data-i="${e.i}" aria-label="Remover ${esc(e.title)}">×</button>
    </li>`).join('')}</ul>` : '<p class="m-note">Nenhuma data cadastrada.</p>'}
  </section>`;
}

function addEvent(form) {
  const f = new FormData(form);
  const title = String(f.get('title') || '').trim();
  const date = String(f.get('date') || '');
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const [yy, mm, dd] = date.split('-').map(Number);
  const yearly = f.get('yearly') === 'on';
  const doc = eventsDoc();
  doc.items.push({ id: newId(), title, m: mm - 1, d: dd, yearly, ...(yearly ? {} : { y: yy }) });
  store.set(EVENTS_ID, doc);
  rerender();
  document.getElementById('datas')?.scrollIntoView({ block: 'start' });
}

// ---------- calendário anual ----------
function renderYear(y) {
  view = { docId: null };
  if (ctx.y !== y) ctx = { y, m: 0 };
  const H = holidays(y);
  const E = eventsOf(y);
  const t = iso(today());

  const months = MESES.map((name, m) => {
    const off = (new Date(y, m, 1).getDay() + 6) % 7; // segunda = 0
    const lines = store.get(`month:${ym(y, m)}`)?.lines || {};
    const cells = Array(off).fill('<td></td>');
    for (let n = 1; n <= daysIn(y, m); n++) {
      const di = iso(new Date(y, m, n));
      const col = (off + n - 1) % 7;
      const day = store.get('day:' + di);
      const h = H.get(di);
      const ev = E.get(di);
      const cls = [
        col >= 5 && 'we', h && 'hol', di === t && 'today', day?.hl && 'hl',
        (dayHasContent(day) || lines[n]?.trim()) && 'has', ev && 'ev',
      ].filter(Boolean).join(' ');
      const tip = [h?.name, ...(ev || []).map(e => e.title)].filter(Boolean).join(' · ');
      cells.push(`<td class="${cls}"><a href="#/dia/${di}"${tip ? ` title="${esc(tip)}"` : ''}>${n}</a></td>`);
    }
    while (cells.length % 7) cells.push('<td></td>');
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
    const notes = [
      ...[...H.values()].filter(h => h.m === m).map(h => ({ d: h.d, html: `${esc(h.name)}${h.official ? ' *' : ''}` })),
      ...[...E.values()].flat().filter(e => e.m === m).map(e => ({ d: e.d, html: `<span class="ev-name">★ ${esc(e.title)}</span>` })),
    ].sort((a, b) => a.d - b.d);
    return `<section class="mini">
      <h3><a href="#/mes/${ym(y, m)}">${name}</a></h3>
      <table><thead><tr>${INICIAIS.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>
      <ul>${notes.map(x => `<li><b>${x.d}</b>${x.html}</li>`).join('')}</ul>
    </section>`;
  }).join('');

  const now = today().getFullYear();
  app.innerHTML = `
  ${toolbar({ prev: `#/ano/${y - 1}`, next: `#/ano/${y + 1}`, title: String(y), todayHref: `#/ano/${now}`, showToday: y !== now })}
  <article class="sheet year">
    <h1 class="page-title">Calendário ${y}</h1>
    <div class="year-grid">${months}</div>
    <footer class="sheet-foot legend">
      <span><i class="lg hl"></i>destacado</span>
      <span><i class="lg has"></i>com anotação</span>
      <span><i class="lg today"></i>hoje</span>
      <span><i class="lg ev"></i>aniversário / data anual</span>
      <span>* Feriados nacionais</span>
    </footer>
    ${eventsSectionHtml(y)}
  </article>`;
  document.title = `Calendário ${y} · AGENDA HC`;
}

// ---------- objetivos ----------
const blankGoal = () => ({
  title: '', steps: Array.from({ length: STEPS }, () => ({ t: '', done: false })), start: '', due: '', notes: '',
});

function goalProgress(g) {
  const filled = g.steps.filter(s => s.t?.trim());
  const done = filled.filter(s => s.done).length;
  return { filled: filled.length, done, pct: filled.length ? Math.round((done / filled.length) * 100) : 0 };
}

function progressHtml(p) {
  return `<span class="bar"><i style="width:${p.pct}%"></i></span><span class="pct">${p.filled ? `${p.done}/${p.filled} · ${p.pct}%` : 'sem etapas'}</span>`;
}

function summaryHtml(items) {
  const all = items.map(goalProgress);
  const filled = all.reduce((a, p) => a + p.filled, 0);
  const done = all.reduce((a, p) => a + p.done, 0);
  const pct = filled ? Math.round((done / filled) * 100) : 0;
  return `<span>${items.length} objetivo${items.length === 1 ? '' : 's'} · ${done} de ${filled} etapas concluídas</span>
    <span class="g-prog">${progressHtml({ filled, done, pct })}</span>`;
}

function goalHtml(g, i) {
  return `<article class="goal" data-i="${i}">
    <div class="g-title">
      <span class="g-lbl">OBJ</span>
      <textarea class="ruled" rows="2" data-path="items.${i}.title" placeholder="Qual é o objetivo?" aria-label="Objetivo ${i + 1}">${esc(g.title)}</textarea>
      <button class="g-del" data-action="del-goal" data-i="${i}" title="Excluir objetivo" aria-label="Excluir objetivo">${ICON.trash}</button>
    </div>
    <div class="g-sub"><span class="g-h">Etapas</span><span class="g-prog">${progressHtml(goalProgress(g))}</span></div>
    <div class="g-steps">
      ${g.steps.map((s, j) => `<div class="step ${s.done ? 'done' : ''}">
        <input type="checkbox" data-path="items.${i}.steps.${j}.done" ${s.done ? 'checked' : ''} aria-label="Etapa ${j + 1} concluída">
        <input type="text" data-path="items.${i}.steps.${j}.t" value="${esc(s.t)}" aria-label="Etapa ${j + 1}">
      </div>`).join('')}
    </div>
    <div class="g-dates">
      <label><span>Início</span><input type="text" data-path="items.${i}.start" value="${esc(g.start)}" placeholder="ex.: Fevereiro"></label>
      <label><span>Prazo</span><input type="text" data-path="items.${i}.due" value="${esc(g.due)}" placeholder="ex.: Julho"></label>
    </div>
    <div class="g-box"><textarea class="ruled" rows="4" data-path="items.${i}.notes" aria-label="Anotações do objetivo">${esc(g.notes)}</textarea></div>
  </article>`;
}

function renderGoals(y) {
  const id = 'goals:' + y;
  const model = load(id, { items: [blankGoal(), blankGoal()] });
  model.items ||= [];
  for (const g of model.items) {
    g.steps ||= [];
    while (g.steps.length < STEPS) g.steps.push({ t: '', done: false });
  }
  if (ctx.y !== y) ctx = { y, m: 0 };
  view = { docId: id, model, after: afterGoalInput };
  const now = today().getFullYear();

  app.innerHTML = `
  ${toolbar({ prev: `#/objetivos/${y - 1}`, next: `#/objetivos/${y + 1}`, title: `Objetivos ${y}`, todayHref: `#/objetivos/${now}`, showToday: y !== now })}
  <article class="sheet goals">
    <h1 class="page-title">Objetivos ${y}</h1>
    <div class="goals-sum">${summaryHtml(model.items)}</div>
    <div class="goal-list">${model.items.map(goalHtml).join('')}</div>
    <button class="add-goal" data-action="add-goal">${ICON.plus}Adicionar objetivo</button>
  </article>`;
  document.title = `Objetivos ${y} · AGENDA HC`;
}

function afterGoalInput(el) {
  const card = el.closest('.goal');
  if (!card) return;
  const g = view.model.items[+card.dataset.i];
  if (el.type === 'checkbox') el.closest('.step').classList.toggle('done', el.checked);
  card.querySelector('.g-sub .g-prog').innerHTML = progressHtml(goalProgress(g));
  app.querySelector('.goals-sum').innerHTML = summaryHtml(view.model.items);
}

// ---------- anotações (categorias de afazeres) ----------
const NOTES_ID = 'notes';
const newCat = (title = '', items = []) => ({
  id: newId(), title, items: items.map(text => ({ id: newId(), text, done: false })),
});

function renderNotes() {
  const model = load(NOTES_ID, null) || {
    cats: [
      newCat('Chácara', ['Muro arrimo', 'Advogado', 'Alinhamento construção', 'Passar veneno']),
      newCat('Pessoal / Ideias', ['APP desenvolvimento', 'Levar a churrasqueira no Dionata']),
    ],
  };
  model.cats ||= [];
  // o exemplo inicial só é salvo na primeira edição (assim não sobrescreve a nuvem num aparelho novo)
  view = { docId: NOTES_ID, model, after: afterNoteInput };

  const cats = model.cats.map((c, i) => {
    const done = c.items.filter(it => it.done).length;
    return `<section class="note-cat ${c.min ? 'min' : ''}" data-c="${i}">
      <div class="nc-head">
        <button class="nc-fold" data-action="fold-cat" data-c="${i}" aria-expanded="${!c.min}" title="${c.min ? 'Abrir lista' : 'Minimizar lista'} (ou toque duas vezes no nome)">${c.min ? '▸' : '▾'}</button>
        <input type="text" class="nc-title" data-path="cats.${i}.title" value="${esc(c.title)}" placeholder="Nome da categoria" aria-label="Categoria ${i + 1}">
        <span class="nc-count">${c.items.length ? `${done}/${c.items.length}` : ''}</span>
        <button class="nc-move" data-action="move-cat" data-c="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Mover para cima" aria-label="Mover lista para cima">↑</button>
        <button class="nc-move" data-action="move-cat" data-c="${i}" data-dir="1" ${i === model.cats.length - 1 ? 'disabled' : ''} title="Mover para baixo" aria-label="Mover lista para baixo">↓</button>
        <button class="g-del" data-action="del-cat" data-c="${i}" title="Excluir categoria" aria-label="Excluir categoria">${ICON.trash}</button>
      </div>
      <ul class="nc-list">
        ${c.items.map((it, j) => `<li class="task nitem ${it.done ? 'done' : ''} ${it.urgent ? 'urgent' : ''}" data-j="${j}">
          <span class="ntext">${it.urgent ? '<b class="urg" aria-label="Urgente">!</b>' : ''}<input type="text" readonly data-path="cats.${i}.items.${j}.text" value="${esc(it.text)}" aria-label="Item ${j + 1}${it.done ? ' (feito)' : ''}. Toque para riscar, dois toques para editar"></span>
          <button class="urg-btn ${it.urgent ? 'on' : ''}" data-action="urgent" data-c="${i}" data-j="${j}" aria-pressed="${!!it.urgent}" title="${it.urgent ? 'Tirar urgência' : 'Marcar como urgente (sobe para o topo)'}">!</button>
          <button class="x" data-action="del-item" data-c="${i}" data-j="${j}" aria-label="Remover item">×</button>
        </li>`).join('')}
      </ul>
      <div class="task new">${ICON.plus}<input type="text" class="new-item" data-c="${i}" placeholder="Novo item" enterkeyhint="done" aria-label="Novo item em ${esc(c.title) || 'categoria'}"></div>
    </section>`;
  }).join('');

  app.innerHTML = `
  <article class="sheet notes-page">
    <h1 class="page-title">Anotações</h1>
    <div class="note-cats">${cats}</div>
    <button class="add-goal" data-action="add-cat">${ICON.plus}Nova lista</button>
  </article>`;
  document.title = 'Anotações · AGENDA HC';
}

// item das anotações: 1 toque risca/desrisca · 2 toques seguidos abrem para editar o texto
let tapTimer = null, tapItem = null;
app.addEventListener('click', e => {
  const li = e.target.closest('.nitem');
  if (!li || e.target.closest('[data-action], .grip')) return;
  if (noteDragged) { noteDragged = false; return; } // acabou de arrastar
  const inp = li.querySelector('.ntext input');
  if (!inp.readOnly) return; // já está editando
  e.preventDefault();
  if (tapTimer && tapItem === li) {
    clearTimeout(tapTimer); tapTimer = tapItem = null;
    inp.readOnly = false;
    inp.focus();
    const n = inp.value.length;
    inp.setSelectionRange(n, n);
    return;
  }
  clearTimeout(tapTimer);
  tapItem = li;
  tapTimer = setTimeout(() => {
    tapTimer = tapItem = null;
    inp.blur();
    const c = +li.closest('.note-cat').dataset.c, j = +li.dataset.j;
    const it = view.model.cats[c]?.items[j];
    if (!it) return;
    it.done = !it.done;
    store.set(view.docId, view.model);
    rerender();
  }, 300);
});
// terminou de editar → volta a ser só leitura
app.addEventListener('focusout', e => {
  if (e.target.matches?.('.nitem .ntext input')) e.target.readOnly = true;
});

function afterNoteInput(el) {
  const sec = el.closest('.note-cat');
  if (!sec) return;
  const c = view.model.cats[+sec.dataset.c];
  if (el.type === 'checkbox') el.closest('.task').classList.toggle('done', el.checked);
  const done = c.items.filter(it => it.done).length;
  sec.querySelector('.nc-count').textContent = c.items.length ? `${done}/${c.items.length}` : '';
}

const notesActions = {
  'add-cat'() {
    view.model.cats.push(newCat());
    store.set(view.docId, view.model);
    rerender();
    const secs = app.querySelectorAll('.note-cat');
    const last = secs[secs.length - 1];
    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    last.querySelector('.nc-title').focus({ preventScroll: true });
  },
  'fold-cat'(btn) { toggleCat(+btn.dataset.c); },
  'move-cat'(btn) {
    const cats = view.model.cats;
    const from = +btn.dataset.c, to = from + +btn.dataset.dir;
    if (to < 0 || to >= cats.length) return;
    cats.splice(to, 0, cats.splice(from, 1)[0]);
    store.set(view.docId, view.model);
    rerender();
    // acompanha a lista movida
    app.querySelectorAll('.note-cat')[to].scrollIntoView({ block: 'nearest' });
  },
  'del-cat'(btn) {
    const c = view.model.cats[+btn.dataset.c];
    if (!confirm(`Excluir a categoria "${c.title.trim() || 'sem nome'}" e todos os ${c.items.length} itens?`)) return;
    view.model.cats.splice(+btn.dataset.c, 1);
    store.set(view.docId, view.model);
    rerender();
  },
  'del-item'(btn) {
    view.model.cats[+btn.dataset.c].items.splice(+btn.dataset.j, 1);
    store.set(view.docId, view.model);
    rerender();
  },
  urgent(btn) {
    const items = view.model.cats[+btn.dataset.c].items;
    const j = +btn.dataset.j;
    const it = items[j];
    it.urgent = !it.urgent;
    if (it.urgent) items.unshift(items.splice(j, 1)[0]); // urgente sobe para o topo
    store.set(view.docId, view.model);
    rerender();
  },
};

// minimizar/abrir uma lista (fica salvo em cats[i].min)
function toggleCat(i) {
  const c = view.model.cats[i];
  c.min = !c.min;
  store.set(view.docId, view.model);
  rerender();
}
// duplo toque/clique no nome da lista também minimiza/abre
app.addEventListener('dblclick', e => {
  const t = e.target.closest('.nc-title');
  if (!t) return;
  e.preventDefault();
  getSelection()?.removeAllRanges();
  t.blur();
  toggleCat(+t.closest('.note-cat').dataset.c);
});

// segurar o item (sem mexer o dedo) e arrastar para reordenar dentro da lista.
// Se o dedo se mexer antes, é rolagem normal da tela. No celular usa eventos de toque
// (mais confiáveis que pointer no Android); no PC, o mouse.
let noteDragged = false, noteDragActive = false;
function noteDragStart(li, x0, y0, bindMove) {
  const ul = li.parentElement;
  const c = +li.closest('.note-cat').dataset.c;
  const from = +li.dataset.j;
  let active = false, lastY = y0, ty = 0, grab = 0;
  const follow = () => {
    // posição "natural" do item (sem o deslocamento) → desloca para ficar sob o dedo
    const top = li.getBoundingClientRect().top - ty;
    ty = lastY - grab - top;
    li.style.transform = `translateY(${ty}px)`;
  };
  const place = () => {
    const mid = lastY;
    const others = [...ul.children].filter(x => x !== li);
    const after = others.find(x => { const r = x.getBoundingClientRect(); return mid < r.top + r.height / 2; });
    if (after) { if (li.nextElementSibling !== after) ul.insertBefore(li, after); }
    else if (ul.lastElementChild !== li) ul.appendChild(li);
    follow();
  };
  const auto = () => {
    if (!active) return;
    const top = (document.querySelector('.appbar')?.offsetHeight || 0) + 40;
    const bottom = (document.getElementById('tabs')?.getBoundingClientRect().top ?? innerHeight) - 40;
    const d = lastY < top ? -8 : lastY > bottom ? 8 : 0;
    if (d) { scrollBy(0, d); place(); }
    requestAnimationFrame(auto);
  };
  const timer = setTimeout(() => {
    active = true; noteDragged = true; noteDragActive = true;
    grab = y0 - li.getBoundingClientRect().top;
    li.classList.add('dragging');
    navigator.vibrate?.(25);
    getSelection()?.removeAllRanges();
    requestAnimationFrame(auto);
  }, HOLD_MS);
  const unbind = bindMove({
    move(x, y, ev) {
      lastY = y;
      if (!active) {
        if (Math.hypot(x - x0, y - y0) > 10) { clearTimeout(timer); unbind(); } // é rolagem
        return;
      }
      if (ev.cancelable) ev.preventDefault(); // não rola a tela enquanto arrasta
      place();
    },
    end(cancelled) {
      clearTimeout(timer); unbind();
      if (!active) return;
      active = false; noteDragActive = false;
      li.classList.remove('dragging');
      li.style.transform = '';
      const to = [...ul.children].indexOf(li);
      if (!cancelled && to !== from) {
        const items = view.model.cats[c].items;
        items.splice(to, 0, items.splice(from, 1)[0]);
        store.set(view.docId, view.model);
      }
      rerender();
      setTimeout(() => { noteDragged = false; }, 60); // o "click" que vem depois não risca o item
    },
  });
}
const dragTarget = t => {
  const li = t.closest?.('.nitem');
  if (!li || t.closest('[data-action]')) return null;
  return li.querySelector('.ntext input').readOnly ? li : null; // editando o texto → não arrasta
};
app.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  const li = dragTarget(e.target);
  if (!li) return;
  const t0 = e.touches[0];
  noteDragStart(li, t0.clientX, t0.clientY, h => {
    const move = ev => { const t = ev.touches[0]; if (t) h.move(t.clientX, t.clientY, ev); };
    const end = ev => h.end(ev.type === 'touchcancel');
    addEventListener('touchmove', move, { passive: false });
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    return () => {
      removeEventListener('touchmove', move, { passive: false });
      removeEventListener('touchend', end);
      removeEventListener('touchcancel', end);
    };
  });
}, { passive: true });
app.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const li = dragTarget(e.target);
  if (!li) return;
  noteDragStart(li, e.clientX, e.clientY, h => {
    const move = ev => h.move(ev.clientX, ev.clientY, ev);
    const end = () => h.end(false);
    addEventListener('mousemove', move);
    addEventListener('mouseup', end);
    return () => { removeEventListener('mousemove', move); removeEventListener('mouseup', end); };
  });
});
// ouvinte fixo (não passivo) para o Android permitir travar a rolagem durante o arrasto
app.addEventListener('touchmove', e => { if (noteDragActive && e.cancelable) e.preventDefault(); }, { passive: false });
// o toque longo não abre o menu do sistema
app.addEventListener('contextmenu', e => { if (e.target.closest('.nitem')) e.preventDefault(); });

// ---------- menu (toque em AGENDA HC) ----------
let installEvt = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvt = e;
  if (parseRoute().v === 'menu') rerender();
});
addEventListener('appinstalled', () => {
  installEvt = null;
  if (parseRoute().v === 'menu') rerender();
});

const UA = navigator.userAgent;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(UA);
const isSamsung = /samsungbrowser/i.test(UA);
const isAndroid = /android/i.test(UA);

const APK_URL = 'download/agenda-hc.apk';

function installHtml() {
  if (isStandalone()) {
    return '<p class="m-ok">✓ Você já está usando o app instalado.</p>';
  }
  if (isAndroid) {
    return `<p>Baixe o app <b>AGENDA HC</b> para Android. Ele funciona <b>sem internet</b> e sincroniza quando a rede voltar.</p>
      <a class="btn primary big" href="${APK_URL}" download="AGENDA-HC.apk">Baixar app (APK)</a>
      <ol class="m-steps">
        <li>Toque em <b>Baixar app (APK)</b> e confirme o download.</li>
        <li>Abra o arquivo <b>AGENDA-HC.apk</b> (na notificação ou em <b>Downloads</b>).</li>
        <li>Se o Android pedir, toque em <b>Configurações</b> e ative <b>Permitir desta fonte</b>. Depois volte e toque em <b>Instalar</b>.</li>
        <li>Se aparecer o aviso do <b>Play Protect</b>, toque em <b>Mais detalhes → Instalar mesmo assim</b> (o app ainda não está na loja).</li>
      </ol>
      <p class="m-note">Na primeira abertura, use com internet para entrar na conta. Depois ele funciona offline.</p>`;
  }
  if (installEvt) {
    return `<p>Instale a AGENDA HC para abrir direto pela tela inicial, em tela cheia e funcionando sem internet.</p>
      <button class="btn primary big" data-action="install">Instalar AGENDA HC</button>`;
  }
  if (isIOS) {
    return `<ol class="m-steps">
      <li>Abra este endereço no <b>Safari</b>.</li>
      <li>Toque no botão <b>Compartilhar</b> (quadrado com seta para cima, na barra de baixo).</li>
      <li>Role e toque em <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.</li>
    </ol>`;
  }
  if (isSamsung) {
    return `<ol class="m-steps">
      <li>Toque no menu <b>≡</b> na barra de baixo do Samsung Internet.</li>
      <li>Toque em <b>Adicionar página a</b> → <b>Tela inicial</b>.</li>
    </ol>
    <p class="m-note">Recomendado: abra no <b>Chrome</b>, onde o app instala completo (com funcionamento offline).</p>
    <button class="btn" data-action="copy-link">Copiar endereço</button>`;
  }
  return `<ol class="m-steps">
      <li>Abra este endereço no <b>Google Chrome</b>${isAndroid ? ' do celular' : ''}.</li>
      <li>Toque nos <b>três pontinhos ⋮</b> do Chrome (ao lado da barra de endereço, fora do app).</li>
      <li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
    </ol>
    <p class="m-note">Se o app já estiver instalado, procure o ícone <b>AGENDA HC</b> na tela inicial.</p>
    <button class="btn" data-action="copy-link">Copiar endereço</button>`;
}

// ---------- Cor / Fonte ----------
const SETTINGS_ID = 'settings';
const THEMES = [['', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']];
const PALETTES = {
  ev: { label: 'Eventos anuais e aniversários', colors: ['#8e3fb5', '#d6336c', '#1e6fd9', '#2b8a3e', '#e8590c', '#8d5524'] },
  hl: { label: 'Destacar data', colors: ['#f3ee6f', '#b2f2bb', '#ffc9de', '#a5d8ff', '#ffd8a8', '#d0bfff'] },
  hol: { label: 'Feriados', colors: ['#b3261e', '#d9480f', '#862e9c', '#1864ab', '#2b8a3e', '#495057'] },
};
const settings = () => store.get(SETTINGS_ID) || {};

function saveSetting(k, v) {
  const s = { ...settings() };
  if (v) s[k] = v; else delete s[k];
  store.set(SETTINGS_ID, s);
  window.AgendaTheme?.apply(s);
  rerender();
}

function settingsHtml() {
  const s = settings();
  const fonts = window.AgendaTheme?.FONTS || [];
  fonts.forEach(f => window.AgendaTheme.loadFont(f)); // para mostrar cada opção na própria fonte
  const colorRow = (k, p) => {
    const cur = s[k] || '';
    return `<div class="set-row">
      <span class="set-lbl">${p.label}</span>
      <div class="swatches">
        ${p.colors.map((c, i) => {
          const on = cur ? cur.toLowerCase() === c : i === 0;
          return `<button class="sw ${on ? 'on' : ''}" style="background:${c}" data-action="set" data-k="${k}" data-v="${i === 0 ? '' : c}" aria-label="Cor ${i + 1}" aria-pressed="${on}"></button>`;
        }).join('')}
        <label class="sw sw-custom ${cur && !p.colors.includes(cur.toLowerCase()) ? 'on' : ''}" title="Outra cor">
          <input type="color" class="set-color" data-k="${k}" value="${cur || p.colors[0]}" aria-label="Escolher outra cor">+
        </label>
      </div>
    </div>`;
  };
  return `<section class="m-sec">
    <h2>Cor / Fonte</h2>
    <div class="set-row">
      <span class="set-lbl">Tema</span>
      <div class="seg">${THEMES.map(([v, n]) => `<button class="${(s.theme || '') === v ? 'on' : ''}" data-action="set" data-k="theme" data-v="${v}">${n}</button>`).join('')}</div>
    </div>
    ${Object.entries(PALETTES).map(([k, p]) => colorRow(k, p)).join('')}
    <div class="set-row">
      <span class="set-lbl">Fonte</span>
      <div class="fonts">
        ${fonts.map(f => `<button class="font-opt ${(s.font || '') === f.id ? 'on' : ''}" data-action="set" data-k="font" data-v="${f.id}"${f.stack ? ` style='font-family:${f.stack}'` : ''}>
          <b>${f.name}</b><small>${f.note || 'Agenda 2026 · Aa Bb 123'}</small>
        </button>`).join('')}
      </div>
    </div>
    <button class="btn" data-action="reset-settings">Restaurar padrão</button>
  </section>`;
}

const settingsActions = {
  set(btn) { saveSetting(btn.dataset.k, btn.dataset.v); },
  'reset-settings'() {
    if (!confirm('Voltar tema, cores e fonte para o padrão?')) return;
    store.set(SETTINGS_ID, {});
    window.AgendaTheme?.apply({});
    rerender();
  },
};

function renderMenu() {
  view = { docId: null };
  const s = store.status();
  const t = today();
  const account = s.user
    ? `<p class="m-note">Conectado como <b>${esc(s.user.email)}</b></p><button class="btn" data-action="account">Conta e Google Agenda</button>`
    : s.status === 'signed-out'
      ? '<p class="m-note">Entre com o Google para sincronizar celular e PC.</p><button class="btn primary" data-action="signin">Entrar com Google</button>'
      : s.status === 'local'
        ? '<p class="m-note">Modo local: salvo só neste aparelho.</p>'
        : '<p class="m-note">Carregando a conta…</p>';

  app.innerHTML = `
  <article class="sheet menu">
    <h1 class="page-title">AGENDA HC</h1>

    <section class="m-sec">
      <h2>Instalar o app</h2>
      ${installHtml()}
    </section>

    <section class="m-sec">
      <h2>Páginas</h2>
      <nav class="m-links">
        <a href="#/ano/${t.getFullYear()}"><b>Calendário anual</b><span>Os 12 meses e os feriados</span></a>
        <a href="#/mes/${ym(t.getFullYear(), t.getMonth())}"><b>Planejamento do mês</b><span>Uma linha por dia</span></a>
        <a href="#/hoje"><b>Hoje</b><span>Página do dia com horários, tarefas e notas</span></a>
        <a href="#/objetivos/${t.getFullYear()}"><b>Objetivos</b><span>Metas do ano com etapas e prazos</span></a>
        <a href="#/notas"><b>Anotações</b><span>Bloco de notas com categorias de afazeres</span></a>
      </nav>
    </section>

    ${settingsHtml()}

    <section class="m-sec">
      <h2>Conta</h2>
      ${account}
    </section>

    <footer class="sheet-foot"><a href="privacidade.html">Política de privacidade</a><span>AGENDA HC</span></footer>
  </article>`;
  document.title = 'Menu · AGENDA HC';
}

const menuActions = {
  async install() {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice.catch(() => {});
    installEvt = null;
    rerender();
  },
  account() { openAccount(); },
  signin() { store.signIn(); },
  async 'copy-link'(btn) {
    const url = location.origin + location.pathname;
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Endereço copiado ✓'; }
    catch { prompt('Copie o endereço:', url); }
  },
};

// ---------- roteamento ----------
function parseRoute() {
  const [, v = 'hoje', a = ''] = (location.hash || '#/hoje').slice(1).split('/');
  return { v, a };
}

function render() {
  deferred = false;
  const { v, a } = parseRoute();
  const t = today();
  let tab = v;
  if (v === 'dia' && /^\d{4}-\d{2}-\d{2}$/.test(a)) renderDay(parseIso(a), false);
  else if (v === 'mes') /^\d{4}-\d{2}$/.test(a) ? renderMonth(+a.slice(0, 4), +a.slice(5) - 1) : renderMonth(t.getFullYear(), t.getMonth());
  else if (v === 'ano') renderYear(/^\d{4}$/.test(a) ? +a : t.getFullYear());
  else if (v === 'objetivos') renderGoals(/^\d{4}$/.test(a) ? +a : t.getFullYear());
  else if (v === 'menu') renderMenu();
  else if (v === 'notas') renderNotes();
  else { renderDay(t, true); tab = 'hoje'; }
  paintTabs(tab === 'dia' ? 'hoje' : tab);
}

function rerender() {
  const y = scrollY;
  render();
  scrollTo(0, y);
}

function paintTabs(active) {
  for (const a of document.querySelectorAll('#tabs a')) {
    const t = a.dataset.tab;
    a.classList.toggle('on', t === active);
    a.href = t === 'hoje' ? '#/hoje'
      : t === 'notas' ? '#/notas'
      : t === 'mes' ? `#/mes/${ym(ctx.y, ctx.m)}`
      : `#/${t}/${ctx.y}`;
  }
}

const isEditing = () => app.contains(document.activeElement) && document.activeElement.matches('input[type=text]:not([readonly]), textarea');

// ---------- eventos ----------
function bind(el) {
  const p = el.dataset.path;
  if (!p || !view.docId) return;
  setPath(view.model, p, el.type === 'checkbox' ? el.checked : el.value);
  store.set(view.docId, view.model);
  view.after?.(el);
}

app.addEventListener('input', e => { if (e.target.type !== 'checkbox') bind(e.target); });
app.addEventListener('change', e => {
  const el = e.target;
  if (el.type === 'checkbox') bind(el);
  else if (el.classList.contains('sr-date') && el.value) location.hash = '#/dia/' + el.value;
  else if (el.classList.contains('set-color')) saveSetting(el.dataset.k, el.value);
});

app.addEventListener('submit', e => {
  if (!e.target.matches('.yev-form')) return;
  e.preventDefault();
  addEvent(e.target);
});

const actions = {
  'rem-done'(el) {
    const doc = load(NOTES_ID, null);
    const it = doc?.cats.flatMap(c => c.items).find(x => x.id === el.dataset.id);
    if (!it) return;
    it.done = true;
    store.set(NOTES_ID, doc);
    rerender();
  },
  'del-event'(btn) {
    const doc = eventsDoc();
    const ev = doc.items[+btn.dataset.i];
    if (!ev || !confirm(`Remover "${ev.title}"?`)) return;
    doc.items.splice(+btn.dataset.i, 1);
    store.set(EVENTS_ID, doc);
    rerender();
  },
  ...menuActions,
  ...notesActions,
  ...settingsActions,
  'pick-date'() {
    const input = app.querySelector('.sr-date');
    try { input.showPicker(); } catch { input.focus(); input.click(); }
  },
  hl(btn) {
    view.model.hl = !view.model.hl;
    store.set(view.docId, view.model);
    btn.classList.toggle('on', view.model.hl);
    btn.setAttribute('aria-pressed', view.model.hl);
  },
  'del-task'(btn) {
    view.model.tasks.splice(+btn.dataset.i, 1);
    store.set(view.docId, view.model);
    rerender();
  },
  'add-goal'() {
    view.model.items.push(blankGoal());
    store.set(view.docId, view.model);
    rerender();
    const goals = app.querySelectorAll('.goal');
    const last = goals[goals.length - 1];
    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    last.querySelector('textarea').focus({ preventScroll: true });
  },
  'del-goal'(btn) {
    const i = +btn.dataset.i;
    const title = view.model.items[i].title.trim() || 'sem título';
    if (!confirm(`Excluir o objetivo "${title}"?`)) return;
    view.model.items.splice(i, 1);
    store.set(view.docId, view.model);
    rerender();
  },
};

app.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (btn) actions[btn.dataset.action]?.(btn, e);
});

// Enter: adiciona tarefa / pula para a próxima linha
app.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key !== 'Enter' || e.isComposing || el.tagName !== 'INPUT' || el.type !== 'text') return;
  if (el.form) return; // formulários (ex.: datas anuais) enviam com Enter
  e.preventDefault();
  if (el.classList.contains('new-task')) {
    const text = el.value.trim();
    if (!text) return;
    view.model.tasks.push({ id: newId(), text, done: false });
    store.set(view.docId, view.model);
    rerender();
    app.querySelector('.new-task').focus();
    return;
  }
  if (el.dataset.path?.startsWith('tasks.')) { app.querySelector('.new-task').focus(); return; }
  if (el.classList.contains('new-item')) {
    const text = el.value.trim();
    if (!text) return;
    const c = +el.dataset.c;
    view.model.cats[c].items.push({ id: newId(), text, done: false });
    store.set(view.docId, view.model);
    rerender();
    app.querySelector(`.new-item[data-c="${c}"]`).focus();
    return;
  }
  const item = /^cats\.(\d+)\.(title|items\.\d+\.text)$/.exec(el.dataset.path || '');
  if (item) { app.querySelector(`.new-item[data-c="${item[1]}"]`).focus(); return; }
  const inputs = [...app.querySelectorAll('input[type=text]:not(:disabled)')];
  const next = inputs[inputs.indexOf(el) + 1];
  if (next) next.focus(); else el.blur();
});

// mudanças vindas de outro aparelho: re-renderiza sem atrapalhar quem está digitando
store.onChange(ids => {
  if (ids.includes(SETTINGS_ID)) window.AgendaTheme?.apply(settings());
  if (isEditing()) deferred = true; else rerender();
});
app.addEventListener('focusout', () => {
  if (deferred) setTimeout(() => { if (deferred && !isEditing()) rerender(); }, 0);
});

// virou o dia com o app aberto → mostra o novo dia
function checkNewDay() {
  if (parseRoute().v !== 'hoje' && location.hash) return;
  if (shownToday !== iso(today()) && !isEditing()) rerender();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNewDay(); });
setInterval(checkNewDay, 60_000);

// Ano: rola até o mês atual · Mês: até o dia de hoje · Hoje: até a hora atual
function focusToday() {
  let el, target;
  const cell = app.querySelector('.year td.today');
  const mrow = app.querySelector('.month-list .mrow.today');
  if (cell) { el = cell; target = cell.closest('.mini'); }
  else if (mrow) el = target = mrow;
  else if (app.querySelector('.day-meta .chip.today')) {
    const rows = app.querySelectorAll('.hours .hour');
    const k = Math.min(Math.max(new Date().getHours() - HOURS[0], 0), rows.length - 1);
    el = target = rows[k];
  }
  if (!el) return;
  const bar = document.querySelector('.appbar')?.offsetHeight || 0;
  const tabs = document.getElementById('tabs')?.getBoundingClientRect().top ?? innerHeight;
  const r = el.getBoundingClientRect();
  // no mês e no dia, precisa estar na metade de cima; no ano, basta estar visível
  const limit = cell ? Math.min(innerHeight, tabs) : bar + (Math.min(innerHeight, tabs) - bar) / 2;
  if (r.top >= bar && r.bottom <= limit) return;
  // não passa do fim do calendário / da lista / dos horários (o fim fica no pé da tela)
  const box = el.closest('.year-grid, .month-list, .hours');
  const max = box.getBoundingClientRect().bottom + scrollY - Math.min(innerHeight, tabs);
  const want = target.getBoundingClientRect().top + scrollY - bar - 12;
  scrollTo(0, Math.max(0, Math.min(want, max)));
}

addEventListener('hashchange', () => { render(); scrollTo(0, 0); focusToday(); animateSwipe(); });

// arrastar o dedo na horizontal (Hoje/dia e Mês): para a esquerda → próximo, para a direita → anterior (como virar página)
let swipe = null, swipeDir = 0;
addEventListener('touchstart', e => {
  const t = e.touches[0];
  const { v } = parseRoute();
  swipe = null;
  if (e.touches.length !== 1 || !['hoje', 'dia', 'mes'].includes(v)) return;
  if (document.querySelector('dialog[open]') || e.target.closest('[data-grip]')) return;
  if (t.clientX < 20 || t.clientX > innerWidth - 20) return; // bordas: gesto de voltar do Android
  swipe = { x: t.clientX, y: t.clientY, at: Date.now() };
}, { passive: true });
addEventListener('touchend', e => {
  if (!swipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  const quick = Date.now() - swipe.at < 800;
  swipe = null;
  if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
  if (getSelection()?.toString()) return; // estava selecionando texto
  if (dayDragged) return; // estava arrastando um afazer
  const link = app.querySelector(`.toolbar a[aria-label="${dx < 0 ? 'Próximo' : 'Anterior'}"]`);
  if (!link) return;
  swipeDir = dx < 0 ? 1 : -1;
  document.activeElement?.blur?.();
  location.hash = link.getAttribute('href');
}, { passive: true });
addEventListener('touchcancel', () => { swipe = null; });

function animateSwipe() {
  if (!swipeDir) return;
  const sheet = app.querySelector('.sheet');
  sheet?.classList.add(swipeDir > 0 ? 'enter-next' : 'enter-prev');
  swipeDir = 0;
}
// tocar em Ano/Mês/Hoje de novo, já estando nela, também leva a hoje
for (const t of ['ano', 'mes', 'hoje']) {
  document.querySelector(`#tabs a[data-tab="${t}"]`)?.addEventListener('click', e => {
    if (location.hash === e.currentTarget.getAttribute('href') || (t === 'hoje' && !location.hash)) setTimeout(focusToday);
  });
}

// ---------- sincronização (botão) ----------
const syncBtn = document.getElementById('sync');
const SYNC_LABEL = {
  local: ['', 'Local', 'Modo local: salvo só neste aparelho'],
  loading: ['busy', 'Conectando', 'Conectando ao Firebase…'],
  'signed-out': ['', 'Entrar', 'Entrar com Google para sincronizar'],
  pending: ['busy', 'Salvando', 'Enviando alterações…'],
  synced: ['ok', 'Sincronizado', 'Tudo salvo na nuvem'],
  offline: ['warn', 'Offline', 'Sem internet: as alterações serão enviadas quando voltar'],
  error: ['err', 'Erro', 'Erro de sincronização'],
};
function paintSync(s) {
  const [cls, label, title] = SYNC_LABEL[s.status] || ['', s.status, ''];
  syncBtn.className = 'sync s-' + s.status;
  syncBtn.innerHTML = `<span class="dot ${cls}"></span><span class="lbl">${label}</span>`;
  syncBtn.title = s.user ? `${title}\n${s.user.email}` : (s.error || title);
}
syncBtn.addEventListener('click', () => {
  const s = store.status();
  if (s.status === 'local') {
    alert('Modo local: suas anotações ficam salvas só neste aparelho/navegador.\n\nPara sincronizar celular e PC, preencha o arquivo firebase-config.js (veja o LEIAME.md).');
  } else if (s.status === 'signed-out') store.signIn();
  else if (s.status === 'error' && !s.user) alert(s.error);
  else if (s.user) openAccount();
});
store.onStatus(s => {
  paintSync(s);
  if (acct.open) paintAccount();
  // o menu mostra a conta (e não tem campos de texto): remonta quando o status muda
  if (parseRoute().v === 'menu') rerender();
});
paintSync(store.status());

// ---------- conta + Google Agenda ----------
const acct = document.getElementById('account');
// conta do criador do app (Firebase UID): só ela vê a seção Desenvolvimento
const CREATOR_UID = 'HcbJwAFdAucY027dPCssZTrzL5D2';
const gbar = document.getElementById('gbar');

function gsyncText(g) {
  const pend = g.pending ? ` · ${g.pending} dia${g.pending > 1 ? 's' : ''} na fila` : '';
  switch (g.state) {
    case 'ready': return g.last ? `Em dia · enviado às ${new Date(g.last).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Conectado';
    case 'syncing': return 'Enviando…' + pend;
    case 'need-auth': return 'Precisa reconectar' + pend;
    case 'offline': return 'Sem internet' + pend;
    case 'error': return 'Erro: ' + g.message;
    default: return 'Desligado';
  }
}

function paintAccount() {
  const s = store.status();
  const g = gsync.getStatus();
  const on = gsync.enabled();
  acct.querySelector('.acct-body').innerHTML = `
    <h2>Conta</h2>
    <p class="acct-email">${esc(s.user?.email)}</p>
    ${gsync.available() ? `
    <h3>Google Agenda</h3>
    <p class="acct-help">Horários do dia viram eventos na agenda <b>Agenda HC</b> e as tarefas vão para o <b>Google Tarefas</b>. Assim aparecem no widget do Google Agenda.</p>
    <p class="acct-status"><span class="dot ${on ? ({ ready: 'ok', syncing: 'busy', error: 'err' }[g.state] || 'warn') : ''}"></span>${on ? esc(gsyncText(g)) : 'Desligado'}</p>
    <div class="acct-actions">
      ${on ? `
        ${g.state === 'need-auth' ? '<button class="btn primary" data-g="reconnect">Reconectar</button>' : '<button class="btn primary" data-g="sync">Sincronizar tudo agora</button>'}
        <button class="btn" data-g="off">Desligar</button>`
      : '<button class="btn primary" data-g="connect">Conectar Google Agenda</button>'}
    </div>` : ''}
    ${s.user?.uid === CREATOR_UID ? `
    <h3>Desenvolvimento</h3>
    <p class="acct-help">Altere a AGENDA HC pelo <b>Claude Code</b>, rodando na nuvem. Peça a mudança por mensagem; ao terminar, ela é enviada ao GitHub (<b>higorcaprioli/agenda</b>) e o app se atualiza sozinho.</p>
    <div class="acct-actions">
      <a class="btn primary" href="https://claude.ai/code" target="_blank" rel="noopener">Abrir Claude Code</a>
      <a class="btn" href="https://github.com/higorcaprioli/agenda" target="_blank" rel="noopener">Ver código</a>
    </div>` : ''}
    <div class="acct-foot">
      <button class="btn danger" data-a="signout">Sair da conta</button>
      <button class="btn" data-a="close">Fechar</button>
    </div>`;
}

function openAccount() {
  gsync.preload().catch(() => {});
  paintAccount();
  acct.showModal();
}

acct.addEventListener('click', async e => {
  if (e.target === acct) { acct.close(); return; }
  const a = e.target.closest('[data-a]')?.dataset.a;
  const g = e.target.closest('[data-g]')?.dataset.g;
  if (a === 'close') acct.close();
  if (a === 'signout' && confirm('Sair da conta neste aparelho?')) { acct.close(); store.signOut(); }
  try {
    if (g === 'connect') await gsync.connect();
    if (g === 'reconnect') await gsync.reconnect();
    if (g === 'sync') await gsync.syncNow();
    if (g === 'off' && confirm('Parar de enviar para o Google Agenda?\n(O que já foi enviado continua lá.)')) gsync.disconnect();
  } catch (err) {
    alert(err.message);
  }
  paintAccount();
});

gbar.addEventListener('click', async () => {
  try { await gsync.reconnect(); } catch (err) { alert(err.message); }
});

gsync.onStatus(g => {
  gbar.hidden = !(g.state === 'need-auth' && g.pending);
  if (!gbar.hidden) gbar.querySelector('span').textContent = `Google Agenda: ${g.pending} dia${g.pending > 1 ? 's' : ''} aguardando envio.`;
  if (acct.open) paintAccount();
});

// ---------- início ----------
render();
focusToday();
store.init();
gsync.init();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // versão nova instalada → recarrega para aplicar (sem atrapalhar quem está digitando)
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  const applyUpdate = () => {
    if (reloading) return;
    if (isEditing()) { app.addEventListener('focusout', applyUpdate, { once: true }); return; }
    reloading = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) applyUpdate(); });
  navigator.serviceWorker.ready.then(reg => {
    // ao voltar para o app, procura versão nova
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
