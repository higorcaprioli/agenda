// Feriados nacionais do Brasil + datas comemorativas que a agenda de papel lista.
// official = feriado nacional (marcado com * como na agenda).

function easter(y) {
  // Algoritmo de Meeus/Jones/Butcher (calendário gregoriano)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

const FIXED = [
  [0, 1, 'Confraternização Universal', true],
  [0, 6, 'Dia de Reis', false],
  [3, 21, 'Tiradentes', true],
  [4, 1, 'Dia do Trabalho', true],
  [5, 29, 'São Pedro', false],
  [7, 15, 'Assunção de Nossa Senhora', false],
  [8, 7, 'Independência do Brasil', true],
  [9, 12, 'Nossa Senhora Aparecida', true],
  [10, 1, 'Todos os Santos', false],
  [10, 2, 'Finados', true],
  [10, 15, 'Proclamação da República', true],
  [11, 8, 'Imaculada Conceição', false],
  [11, 25, 'Natal', true],
];

// dias em relação à Páscoa
const MOVABLE = [
  [-47, 'Carnaval', false],
  [-46, 'Cinzas', false],
  [-2, 'Paixão', true],
  [0, 'Páscoa', false],
  [39, 'Ascensão do Senhor', false],
  [49, 'Espírito Santo', false],
  [60, 'Corpus Christi', false],
];

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Map "YYYY-MM-DD" -> { name, official, m, d } */
export function holidaysOf(y) {
  const e = easter(y);
  const list = [
    ...FIXED.map(([m, d, name, official]) => ({ date: new Date(y, m, d), name, official })),
    ...MOVABLE.map(([o, name, official]) => ({
      date: new Date(y, e.getMonth(), e.getDate() + o), name, official,
    })),
  ];
  // Consciência Negra é feriado nacional desde 2024 (Lei 14.759/2023)
  if (y >= 2024) list.push({ date: new Date(y, 10, 20), name: 'Consciência Negra', official: true });

  list.sort((a, b) => a.date - b.date);
  const map = new Map();
  for (const h of list) {
    const k = iso(h.date);
    const ex = map.get(k);
    if (ex) { ex.name += ' · ' + h.name; ex.official ||= h.official; }
    else map.set(k, { name: h.name, official: h.official, m: h.date.getMonth(), d: h.date.getDate() });
  }
  return map;
}
