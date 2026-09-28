// Tema, cores e fonte escolhidos em Menu → Cor / Fonte.
// Script comum (não módulo), carregado no <head> para aplicar antes de desenhar a tela.
(function () {
  // cada fonte usa a original do Windows/Office quando existe, senão uma equivalente do Google Fonts
  var FONTS = [
    { id: '', name: 'Padrão', note: 'Crimson Pro + Inter' },
    { id: 'calibri', name: 'Calibri', css: 'Carlito:wght@400;700', stack: 'Calibri, Carlito, "Segoe UI", sans-serif' },
    { id: 'arial', name: 'Arial', css: 'Arimo:wght@400;500;600;700', stack: 'Arial, Arimo, Helvetica, sans-serif' },
    { id: 'times', name: 'Times New Roman', css: 'Tinos:wght@400;700', stack: '"Times New Roman", Tinos, Times, serif' },
    { id: 'cambria', name: 'Cambria', css: 'Caladea:wght@400;700', stack: 'Cambria, Caladea, Georgia, serif' },
    { id: 'garamond', name: 'Garamond', css: 'EB+Garamond:wght@400;500;600;700', stack: 'Garamond, "EB Garamond", Georgia, serif' },
    { id: 'georgia', name: 'Georgia', css: 'Gelasio:wght@400;500;600;700', stack: 'Georgia, Gelasio, serif' },
  ];
  var COLORS = ['ev', 'hl', 'hol'];

  function loadFont(f) {
    if (!f || !f.css || document.getElementById('font-' + f.id)) return;
    var l = document.createElement('link');
    l.id = 'font-' + f.id;
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + f.css + '&display=swap';
    document.head.appendChild(l);
  }

  function apply(s) {
    s = s || {};
    var root = document.documentElement;
    if (s.theme === 'light' || s.theme === 'dark') root.setAttribute('data-theme', s.theme);
    else root.removeAttribute('data-theme');
    COLORS.forEach(function (k) {
      if (s[k]) root.style.setProperty('--' + k, s[k]);
      else root.style.removeProperty('--' + k);
    });
    var f = FONTS.filter(function (x) { return x.id && x.id === s.font; })[0];
    if (f) {
      loadFont(f);
      root.style.setProperty('--serif', f.stack);
      root.style.setProperty('--sans', f.stack);
    } else {
      root.style.removeProperty('--serif');
      root.style.removeProperty('--sans');
    }
  }

  var saved = {};
  try { saved = (JSON.parse(localStorage.getItem('agenda:v1:settings')) || {}).data || {}; } catch (e) { /* sem acesso */ }
  apply(saved);

  window.AgendaTheme = { FONTS: FONTS, apply: apply, loadFont: loadFont };
})();
