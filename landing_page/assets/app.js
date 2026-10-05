(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- copy: English lives in the HTML, Greek lives here ---------- */
  var EL = {
    skip: 'Μετάβαση στο περιεχόμενο', copy: 'Αντιγραφή', copied: 'Αντιγράφηκε', close: 'Κλείσιμο ✕',
    'nav.tour': 'Περιήγηση', 'nav.privacy': 'Απόρρητο', 'nav.install': 'Εγκατάσταση', 'nav.docs': 'Τεκμηρίωση',
    'hero.eyebrow': 'Self-hosted · Ανοιχτός κώδικας · EN / EL',
    'h1.1': 'Τα οικονομικά σου,', 'h1.2': 'στον δικό σου', 'h1.3': 'server.',
    'hero.lede': 'Λογαριασμοί, προϋπολογισμοί, χρέη, στόχοι, σύνδεση τραπεζών, επενδύσεις και AI σύμβουλος. Ένα Docker container και ένα αρχείο SQLite, χωρίς συνδρομή και χωρίς τρίτους να διαβάζουν τις κινήσεις σου.',
    'cta.install': 'Εγκατάσταση σε 5 λεπτά', 'cta.demo': 'Δες το demo',
    'fact.1': 'Χωρίς telemetry', 'fact.2': 'amd64 & arm64', 'fact.3': 'Ιδιωτικός λογαριασμός για κάθε άτομο',
    'app.title': 'Πίνακας', 'app.month': 'Οκτώβριος 2026', 'app.live': 'Ζωντανή προεπισκόπηση',
    'app.total': 'Συνολικό υπόλοιπο', 'app.in': 'Έσοδα', 'app.out': 'Έξοδα', 'app.saved': 'Αποταμίευση',
    'app.try': 'Σούπερ μάρκετ αυτόν τον μήνα', 'app.drag': '· σύρε για δοκιμή',
    'app.budgets': 'Προϋπολογισμοί', 'cat.housing': 'Στέγαση', 'cat.groceries': 'Σούπερ μάρκετ', 'cat.utilities': 'Λογαριασμοί', 'cat.dining': 'Φαγητό έξω',
    'app.goal': 'Στόχος', 'app.laptop': 'Νέο laptop', 'app.ontrack': 'Στην πορεία', 'app.car': 'Δάνειο αυτοκινήτου',
    'st.ok': 'Εντός ορίου', 'st.close': 'Κοντά στο όριο', 'st.over': 'Υπέρβαση ',
    'reel.eyebrow': 'Περιήγηση στην εφαρμογή', 'reel.h2': 'Κάθε οθόνη που ανοίγεις μέσα στον μήνα.',
    's1.h': 'Πίνακας', 's1.p': 'Υπόλοιπα, πληρωμές των επόμενων 30 ημερών, προϋπολογισμοί και στόχοι σε μία οθόνη.',
    's2.h': 'Συναλλαγές', 's2.p': 'Αναζήτηση, φίλτρα, διαχωρισμός και αντιστοίχιση μεταφορών. Οι κανόνες κατηγοριοποιούν κάθε μελλοντική εισαγωγή.',
    's3.h': 'Προϋπολογισμοί', 's3.p': 'Όριο ανά κατηγορία και περίοδο, με ειδοποιήσεις στα όρια που επιλέγεις.',
    's4.h': 'Χρέη', 's4.p': 'Ημερομηνία εξόφλησης για κάθε δάνειο και κάρτα, και σύγκριση snowball με avalanche.',
    's5.h': 'Στόχοι', 's5.p': 'Πόσα να βάζεις κάθε μήνα για να φτάσεις στην ημερομηνία σου, σε σύγκριση με όσα πραγματικά αποταμιεύεις.',
    's6.h': 'Αναφορές', 's6.p': 'Ταμειακή ροή, δαπάνες, προϋπολογισμοί και χρέη, με αποθηκευμένες προβολές, προγραμματισμένα email και εξαγωγή CSV.',
    'in.eyebrow': 'Επίσης μέσα', 'in.h2': 'Τα υπόλοιπα εργαλεία.', 'in.p': 'Όλα έρχονται στο ίδιο container. Όσα επικοινωνούν με εξωτερικές υπηρεσίες είναι κλειστά μέχρι να τα ρυθμίσεις.',
    'f1.h': 'Σύνδεση τραπεζών', 'f1.p': 'Ευρωπαϊκές τράπεζες μέσω Enable Banking (PSD2, μόνο ανάγνωση), με νυχτερινό συγχρονισμό.',
    'f2.h': 'Επενδύσεις', 'f2.p': 'Συγχρονισμός Freedom24 και Binance, ανάλυση, backtesting και έρευνα.',
    'f3.h': 'Κανόνες', 'f3.p': '«Αν η περιγραφή περιέχει Χ, βάλε κατηγορία Υ.» Τον γράφεις μία φορά.',
    'f4.h': 'Επαναλαμβανόμενες πληρωμές', 'f4.p': 'Συνδρομές και λογαριασμοί, και πότε λήγει ο καθένας.',
    'f5.h': 'AI σύμβουλος', 'f5.p': 'Διαβάζει τα δεδομένα σου μέσω εργαλείων. Κάθε νούμερο βγαίνει από υπολογισμό στον server, ποτέ από το μοντέλο.',
    'f6.h': 'Αριθμομηχανές', 'f6.p': 'Ανατοκισμός, σύνταξη, δάνεια, αναχρηματοδότηση και αποθεματικό έκτακτης ανάγκης.',
    'f7.h': 'Ειδοποιήσεις', 'f7.p': 'Email και push για πληρωμές, χαμηλά υπόλοιπα και προϋπολογισμούς, με ώρες ησυχίας.',
    'f8.h': 'Trackers & έγγραφα', 'f8.p': 'Παρακολούθησε ένα ταξίδι ή μια ανακαίνιση σε όλους τους λογαριασμούς. Επισύναψε αποδείξεις και statements.',
    'pv.eyebrow': 'Απόρρητο', 'pv.h2': 'Δες τι θα έφευγε από τον server σου.',
    'pv.p': 'Από προεπιλογή, τίποτα. Ενεργοποίησε μια λειτουργία για να δεις ποια υπηρεσία καλεί και τι στέλνει.',
    'pv.log': 'Εξερχόμενες συνδέσεις', 'pv.reset': 'Όλα κλειστά',
    'pv.zero': 'εξωτερικές υπηρεσίες. Όλα μένουν σε αυτό το μηχάνημα.', 'pv.some': 'εξωτερικές υπηρεσίες σε επαφή, μόνο επειδή τις ενεργοποίησες.',
    'pv.idle': 'Καμία εξερχόμενη σύνδεση. Τα δεδομένα υπολογίζονται και αποθηκεύονται τοπικά.',
    'pv.foot': 'Λογαριασμοί, συναλλαγές, προϋπολογισμοί, χρέη, στόχοι, αναφορές, κανόνες και έγγραφα υπολογίζονται και αποθηκεύονται πάντα τοπικά.',
    'pv.link': 'Τεκμηρίωση ασφάλειας →',
    'is.eyebrow': 'Εγκατάσταση', 'is.h2': 'Πέντε λεπτά για το δικό σου instance.',
    'is.p': 'Χρειάζεσαι Docker με Compose και openssl. Το έτοιμο image τρέχει σε PC, οικιακό server ή Raspberry Pi.',
    'is.guide': 'Οδηγός εκκίνησης', 'is.gh': 'Δες το στο GitHub',
    'faq.h2': 'Ερωτήσεις πριν την εγκατάσταση',
    'q1': 'Φεύγουν τα οικονομικά μου δεδομένα από τον server;', 'a1': 'Όχι από προεπιλογή. Δεν υπάρχει analytics, telemetry ή λογαριασμός προμηθευτή. Το AI chat, ο συγχρονισμός τράπεζας και broker, τα δεδομένα αγοράς και το email καλούν εξωτερική υπηρεσία μόνο αν τα ενεργοποιήσεις.',
    'q2': 'Πόσο κοστίζει;', 'a2': 'Τίποτα. Είναι ανοιχτού κώδικα με άδεια ISC. Ο προαιρετικός AI σύμβουλος χρησιμοποιεί δικό σου κλειδί OpenRouter και δείχνει το κόστος κάθε απάντησης, με μηνιαία όρια.',
    'q3': 'Μπορούν να το χρησιμοποιούν κι άλλα άτομα του σπιτιού;', 'a3': 'Ναι, ο καθένας στον δικό του ιδιωτικό χώρο. Η εγγραφή γίνεται μόνο με πρόσκληση και κάθε άτομο έχει ξεχωριστό λογαριασμό με δικούς του τραπεζικούς λογαριασμούς, συναλλαγές και προϋπολογισμούς. Τα δεδομένα δεν μοιράζονται μεταξύ χρηστών, άρα δεν υπάρχουν κοινοί λογαριασμοί ούτε συνολικός προϋπολογισμός νοικοκυριού.',
    'q4': 'Πώς κάνω backup;', 'a4': 'Τα δεδομένα σου είναι ένα αρχείο SQLite σε έναν φάκελο data. Κράτα αντίγραφο του φακέλου και των δύο μυστικών κλειδιών.',
    'ft.sec': 'Ασφάλεια', 'ft.rel': 'Εκδόσεις',
    'ft.small': 'Το Home Finance είναι προσωπικό εργαλείο. Τίποτα σε αυτό, ούτε ο AI σύμβουλος, δεν αποτελεί οικονομική, φορολογική ή νομική συμβουλή. Τα screenshots και η προεπισκόπηση χρησιμοποιούν demo δεδομένα. Αυτή η σελίδα δεν κάνει αιτήματα σε τρίτους.',
    title: 'Home Finance: self-hosted εφαρμογή προσωπικών οικονομικών'
  };
  var EN = { copied: 'Copied', 'st.ok': 'On track', 'st.close': 'Close to limit', 'st.over': 'Over by ',
    'pv.some': 'outside services contacted, only because you switched them on.',
    'pv.idle': 'No outbound connections. Data is computed and stored locally.' };

  var SERVICES = [
    { id: 'ai', en: ['AI chat', 'OpenRouter + the model provider you pick', 'your messages, a system prompt and the tool results the model reads, only when you send a message'],
      el: ['AI chat', 'OpenRouter + ο πάροχος του μοντέλου', 'τα μηνύματά σου, ένα system prompt και τα αποτελέσματα εργαλείων, μόνο όταν στέλνεις μήνυμα'] },
    { id: 'web', en: ['AI web search', 'OpenRouter', 'the search query'], el: ['AI αναζήτηση web', 'OpenRouter', 'το ερώτημα αναζήτησης'] },
    { id: 'bank', en: ['Bank sync', 'Enable Banking and your bank', 'authorization requests; your own transactions come back'], el: ['Σύνδεση τράπεζας', 'Enable Banking και η τράπεζά σου', 'αιτήματα εξουσιοδότησης· επιστρέφουν οι δικές σου συναλλαγές'] },
    { id: 'broker', en: ['Brokerage sync', 'Freedom24 or Binance', 'API requests with your read-only keys'], el: ['Σύνδεση broker', 'Freedom24 ή Binance', 'αιτήματα API με τα κλειδιά σου μόνο για ανάγνωση'] },
    { id: 'market', en: ['Market data', 'Yahoo Finance', 'the ticker symbols you look up or hold'], el: ['Δεδομένα αγοράς', 'Yahoo Finance', 'τα σύμβολα που αναζητάς ή κατέχεις'] },
    { id: 'mail', en: ['Email', 'your own SMTP server', 'the alert, report or verification email'], el: ['Email', 'ο δικός σου SMTP server', 'το email ειδοποίησης, αναφοράς ή επαλήθευσης'] },
    { id: 'push', en: ['Push', "your browser's push service", 'an encrypted push message'], el: ['Push', 'η υπηρεσία push του browser', 'ένα κρυπτογραφημένο push μήνυμα'] }
  ];

  var lang = 'en';
  function t(k) { return lang === 'el' ? (EL[k] != null ? EL[k] : EN[k]) : EN[k]; }

  $$('[data-i18n]').forEach(function (el) { el._en = el.innerHTML; });
  var enTitle = document.title;
  function applyLang(l) {
    lang = l; root.lang = l;
    $$('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      el.innerHTML = l === 'el' && EL[k] != null ? EL[k] : el._en;
    });
    document.title = l === 'el' ? EL.title : enTitle;
    var b = $('#lang'); b.textContent = l === 'el' ? 'EN' : 'EL';
    b.setAttribute('aria-label', l === 'el' ? 'Switch to English' : 'Αλλαγή σε Ελληνικά');
    renderSwitches(); renderLog(); update(+range.value, true);
    store.set('hf-lang', l);
  }

  /* ---------- theme ---------- */
  var themeBtn = $('#theme');
  var darkMQ = matchMedia('(prefers-color-scheme: dark)');
  function isDark() { return root.dataset.theme ? root.dataset.theme === 'dark' : darkMQ.matches; }
  function paintTheme() {
    themeBtn.innerHTML = isDark()
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  }
  themeBtn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next; store.set('hf-theme', next); paintTheme();
  });
  darkMQ.addEventListener && darkMQ.addEventListener('change', paintTheme);
  paintTheme();
  $('#lang').addEventListener('click', function () { applyLang(lang === 'en' ? 'el' : 'en'); });

  /* ---------- hero: live dashboard slice ---------- */
  var fmt = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var eur = function (n) { return fmt.format(n) + ' €'; };
  var BASE = { total: 35844.99, inc: 2850, outOther: 1309.32 - 266.92, gBudget: 420, otherSpent: 850 + 74.20 + 30.82, budgetTotal: 1700 };
  var range = $('#groceries');
  var el = { out: $('#v-out'), saved: $('#v-saved'), groc: $('#v-groc'), gbud: $('#v-gbud'), bar: $('#b-groc'), sum: $('#v-budsum'), st: $('#g-status'), total: $('#v-total') };

  function update(g, silent) {
    var out = BASE.outOther + g, saved = BASE.inc - out, pct = g / BASE.gBudget;
    el.groc.textContent = eur(g);
    el.out.textContent = eur(out);
    el.saved.textContent = eur(saved);
    el.gbud.textContent = fmt.format(g) + ' / ' + fmt.format(BASE.gBudget);
    el.sum.textContent = fmt.format(BASE.otherSpent + g) + ' / ' + eur(BASE.budgetTotal);
    el.bar.style.width = Math.min(100, pct * 100) + '%';
    el.bar.className = pct > 1 ? 'over' : pct > .85 ? 'warn' : '';
    el.st.className = 'chip' + (pct > 1 ? ' bad' : pct > .85 ? ' warn' : '');
    el.st.textContent = pct > 1 ? t('st.over') + eur(g - BASE.gBudget) : pct > .85 ? t('st.close') : t('st.ok');
    range.style.setProperty('--p', (g / +range.max * 100) + '%');
  }
  var touched = false;
  range.addEventListener('input', function () { touched = true; update(+range.value); });
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { range.addEventListener(e, function () { touched = true; }, { passive: true }); });
  update(266.92);

  function tween(from, to, ms, step, done) {
    var t0 = performance.now();
    (function frame(now) {
      var p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      step(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(frame); else if (done) done();
    })(t0);
  }
  if (!reduced) {
    tween(0, BASE.total, 1300, function (v) { el.total.textContent = eur(v); });
    // one short self-demo of the slider, cancelled the moment the visitor touches it
    setTimeout(function () {
      if (touched) return;
      var go = function (a, b, ms, next) { tween(a, b, ms, function (v) { if (!touched) { range.value = Math.round(v); update(v); } }, function () { if (!touched && next) next(); }); };
      go(266.92, 468, 1400, function () { setTimeout(function () { if (!touched) go(468, 266.92, 1200); }, 700); });
    }, 1700);
  }

  /* ---------- reel ---------- */
  var reel = $('#tour'), pin = $('.reel-pin', reel), viewport = $('#viewport'), track = $('#track');
  var slides = $$('.slide', track), tabs = $('#tabs'), meter = $('#meter');
  var dist = 0, active = -1;
  slides.forEach(function (s, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab');
    b.setAttribute('data-i18n-tab', i);
    b.addEventListener('click', function () { goTo(i); });
    tabs.appendChild(b);
  });
  function tabLabels() { $$('button', tabs).forEach(function (b, i) { b.textContent = $('h3', slides[i]).textContent; }); }
  tabLabels();
  var mo = new MutationObserver(tabLabels); slides.forEach(function (s) { mo.observe($('h3', s), { childList: true }); });

  function setActive(i) {
    if (i === active) return; active = i;
    $$('button', tabs).forEach(function (b, j) { b.setAttribute('aria-selected', j === i); });
  }
  function pinned() { return reel.classList.contains('pinned'); }
  function layout() {
    var wide = innerWidth > 900 && innerHeight > 620 && !reduced;
    reel.classList.toggle('pinned', wide);
    track.style.transform = '';
    slides.forEach(function (s) { s.style.transform = ''; s.style.opacity = ''; });
    if (wide) {
      dist = Math.max(0, track.scrollWidth - viewport.clientWidth);
      reel.style.setProperty('--reel-h', (pin.offsetHeight + dist * .85) + 'px');
    } else reel.style.removeProperty('--reel-h');
    onScroll();
  }
  function progress() {
    var hdr = $('.top').offsetHeight, r = reel.getBoundingClientRect();
    var total = reel.offsetHeight - pin.offsetHeight;
    return total > 0 ? Math.min(1, Math.max(0, (hdr - r.top) / total)) : 0;
  }
  function onScroll() {
    if (!pinned()) return;
    var p = progress(), x = -p * dist;
    track.style.transform = 'translate3d(' + x + 'px,0,0)';
    meter.style.setProperty('--prog', p);
    var mid = viewport.getBoundingClientRect(), cx = mid.left + mid.width * .42;
    slides.forEach(function (s) {
      var b = s.getBoundingClientRect(), d = Math.min(1, Math.abs(b.left + b.width / 2 - cx) / b.width);
      s.style.transform = 'scale(' + (1 - d * .07).toFixed(4) + ')';
      s.style.opacity = (1 - d * .5).toFixed(3);
    });
    setActive(Math.round(p * (slides.length - 1)));
  }
  function goTo(i) {
    if (pinned()) {
      var hdr = $('.top').offsetHeight, total = reel.offsetHeight - pin.offsetHeight;
      var top = reel.getBoundingClientRect().top + scrollY - hdr;
      scrollTo({ top: top + total * (i / (slides.length - 1)) + 1, behavior: reduced ? 'auto' : 'smooth' });
    } else {
      viewport.scrollTo({ left: slides[i].offsetLeft - (viewport.clientWidth - slides[i].offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' });
    }
  }
  viewport.addEventListener('scroll', function () {
    if (pinned()) return;
    var c = viewport.scrollLeft + viewport.clientWidth / 2, best = 0, bd = 1e9;
    slides.forEach(function (s, i) { var d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - c); if (d < bd) { bd = d; best = i; } });
    setActive(best);
  }, { passive: true });
  var ticking = false;
  addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { ticking = false; onScroll(); });
  }, { passive: true });
  var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 120); });
  addEventListener('load', layout);
  layout(); setActive(0);

  /* ---------- privacy monitor ---------- */
  var on = [];
  var sw = $('#switches'), lines = $('#lines');
  function svc(id) { for (var i = 0; i < SERVICES.length; i++) if (SERVICES[i].id === id) return SERVICES[i]; }
  function renderSwitches() {
    sw.innerHTML = '';
    SERVICES.forEach(function (s) {
      var tx = s[lang], row = document.createElement('div'); row.className = 'sw-row';
      var b = document.createElement('button'); b.className = 'sw'; b.type = 'button'; b.id = 'sw-' + s.id;
      b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', on.indexOf(s.id) > -1);
      var d = document.createElement('div');
      d.innerHTML = '<div class="nm"></div><div class="to"></div>';
      d.firstChild.textContent = tx[0]; d.lastChild.textContent = '→ ' + tx[1];
      b.setAttribute('aria-label', tx[0]);
      row.appendChild(d); row.appendChild(b);
      row.addEventListener('click', function () { toggle(s.id); });
      sw.appendChild(row);
    });
  }
  function line(s) {
    var tx = s[lang], p = document.createElement('p');
    p.innerHTML = '<b></b> → <span></span><br><span></span>';
    p.children[0].textContent = tx[0]; p.children[1].textContent = tx[1]; p.children[3].textContent = tx[2];
    return p;
  }
  function renderLog() {
    lines.innerHTML = '';
    if (!on.length) { var p = document.createElement('p'); p.className = 'idle'; p.textContent = t('pv.idle'); lines.appendChild(p); }
    on.forEach(function (id) { lines.appendChild(line(svc(id))); });
    var c = $('#count'); c.textContent = on.length; c.classList.toggle('some', on.length > 0);
    var l = $('#count-l'); l.innerHTML = on.length ? t('pv.some') : (lang === 'el' ? EL['pv.zero'] : l._en);
  }
  function toggle(id) {
    var i = on.indexOf(id);
    if (i > -1) on.splice(i, 1); else on.unshift(id);
    $('#sw-' + id).setAttribute('aria-checked', i === -1);
    renderLog();
  }
  $('#reset').addEventListener('click', function () { on = []; renderSwitches(); renderLog(); });
  renderSwitches(); renderLog();

  /* ---------- copy + video ---------- */
  $('#copy').addEventListener('click', function () {
    var b = this, txt = $('#code').innerText.split('\n').filter(function (l) { return l.indexOf('$ ') === 0 || l.indexOf('    ') === 0; })
      .map(function (l) { return l.replace(/^\$ /, ''); }).join('\n');
    var done = function () { b.textContent = t('copied'); setTimeout(function () { b.textContent = lang === 'el' ? EL.copy : 'Copy'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, function () {});
  });
  var dlg = $('#video'), vid = $('video', dlg);
  $$('[data-video]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!vid.src) vid.src = 'assets/video/demo.mp4';
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      vid.play().catch(function () {});
    });
  });
  $('.close', dlg).addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', function () { vid.pause(); });

  /* ---------- init language ---------- */
  var q = new URLSearchParams(location.search).get('lang');
  var pref = q || store.get('hf-lang') || ((navigator.language || '').toLowerCase().indexOf('el') === 0 ? 'el' : 'en');
  if (pref === 'el') applyLang('el'); else $('#lang').setAttribute('aria-label', 'Αλλαγή σε Ελληνικά');
})();
