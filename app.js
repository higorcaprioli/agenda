import * as store from './store.js';
import { holidaysOf } from './holidays.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MES3 = MESES.map(m => m.slice(0, 3));
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const DIA3 = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const INICIAIS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7h às 21h
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
      ${h ? `<span class="chip hol">${esc(h.name)}${h.official ? ' *' : ''}</span>` : ''}
      ${plan?.trim() ? `<a class="chip plan" href="#/mes/${ym(y, m)}" title="Do planejamento do mês"><small>Plano</small> ${esc(plan)}</a>` : ''}
      <button class="hl-btn ${model.hl ? 'on' : ''}" data-action="hl" aria-pressed="${!!model.hl}" title="Destacar este dia no calendário anual">${ICON.marker}<span>Destacar</span></button>
    </div>
    <div class="day-grid">
      <section class="hours" aria-label="Horários">
        ${HOURS.map(hr => `<div class="hour">
          <span class="h">${hr}</span>
          <input type="text" data-path="hours.${hr}a" value="${esc(model.hours[hr + 'a'])}" aria-label="${hr}h">
          <input type="text" class="half" data-path="hours.${hr}b" value="${esc(model.hours[hr + 'b'])}" aria-label="${hr}h30">
        </div>`).join('')}
      </section>
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
  document.title = `${n} ${MES3[m]} · Agenda HC`;
}

function afterDayInput(el) {
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
      ${h ? `<span class="tag" title="${esc(h.name)}">${esc(h.name)}${h.official ? ' *' : ''}</span>` : ''}
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
  document.title = `${MESES[m]} ${y} · Agenda HC`;
}

// ---------- calendário anual ----------
function renderYear(y) {
  view = { docId: null };
  if (ctx.y !== y) ctx = { y, m: 0 };
  const H = holidays(y);
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
      const cls = [
        col >= 5 && 'we', h && 'hol', di === t && 'today', day?.hl && 'hl',
        (dayHasContent(day) || lines[n]?.trim()) && 'has',
      ].filter(Boolean).join(' ');
      cells.push(`<td class="${cls}"><a href="#/dia/${di}"${h ? ` title="${esc(h.name)}"` : ''}>${n}</a></td>`);
    }
    while (cells.length % 7) cells.push('<td></td>');
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
    const hols = [...H.values()].filter(h => h.m === m);
    return `<section class="mini">
      <h3><a href="#/mes/${ym(y, m)}">${name}</a></h3>
      <table><thead><tr>${INICIAIS.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>
      <ul>${hols.map(h => `<li><b>${h.d}</b>${esc(h.name)}${h.official ? ' *' : ''}</li>`).join('')}</ul>
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
      <span>* Feriados nacionais</span>
    </footer>
  </article>`;
  document.title = `Calendário ${y} · Agenda HC`;
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
  document.title = `Objetivos ${y} · Agenda HC`;
}

function afterGoalInput(el) {
  const card = el.closest('.goal');
  if (!card) return;
  const g = view.model.items[+card.dataset.i];
  if (el.type === 'checkbox') el.closest('.step').classList.toggle('done', el.checked);
  card.querySelector('.g-sub .g-prog').innerHTML = progressHtml(goalProgress(g));
  app.querySelector('.goals-sum').innerHTML = summaryHtml(view.model.items);
}

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
  else if (v === 'mes' && /^\d{4}-\d{2}$/.test(a)) renderMonth(+a.slice(0, 4), +a.slice(5) - 1);
  else if (v === 'ano' && /^\d{4}$/.test(a)) renderYear(+a);
  else if (v === 'objetivos') renderGoals(/^\d{4}$/.test(a) ? +a : t.getFullYear());
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
      : t === 'mes' ? `#/mes/${ym(ctx.y, ctx.m)}`
      : `#/${t}/${ctx.y}`;
  }
}

const isEditing = () => app.contains(document.activeElement) && document.activeElement.matches('input[type=text], textarea');

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
});

const actions = {
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
  e.preventDefault();
  if (el.classList.contains('new-task')) {
    const text = el.value.trim();
    if (!text) return;
    view.model.tasks.push({ text, done: false });
    store.set(view.docId, view.model);
    rerender();
    app.querySelector('.new-task').focus();
    return;
  }
  if (el.dataset.path?.startsWith('tasks.')) { app.querySelector('.new-task').focus(); return; }
  const inputs = [...app.querySelectorAll('input[type=text]')];
  const next = inputs[inputs.indexOf(el) + 1];
  if (next) next.focus(); else el.blur();
});

// mudanças vindas de outro aparelho: re-renderiza sem atrapalhar quem está digitando
store.onChange(() => { if (isEditing()) deferred = true; else rerender(); });
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

addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

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
  else if (s.user && confirm(`Conectado como ${s.user.email}.${s.error ? '\n\nÚltimo erro: ' + s.error : ''}\n\nDeseja sair?`)) store.signOut();
});
store.onStatus(paintSync);
paintSync(store.status());

// ---------- início ----------
render();
store.init();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
