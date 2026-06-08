// ============================================================
// Italiano Vokabeltrainer - Leitner System (5 Boxen)
// ============================================================

// --- Leitner-Intervalle (Tage) ---
// Box 1: täglich, Box 2: alle 2 Tage, Box 3: alle 4 Tage,
// Box 4: alle 8 Tage, Box 5: alle 16 Tage (gelernt)
const LEITNER_INTERVALS = [1, 2, 4, 8, 16];

// --- Beispiel-Startvokabeln (klassische Stolperer) ---
const SAMPLE_VOCAB = [
  { de: "obwohl",      it: "anche se" },
  { de: "trotzdem",    it: "comunque" },
  { de: "weil",        it: "perché" },
  { de: "deshalb",     it: "perciò" },
  { de: "vielleicht",  it: "forse" },
  { de: "bereits",     it: "già" },
  { de: "noch",        it: "ancora" },
  { de: "fast",        it: "quasi" },
  { de: "endlich",     it: "finalmente" },
  { de: "plötzlich",   it: "improvvisamente" }
];

// --- State ---
let state = loadState();
let currentCard = null;
let currentMode = state.mode || "mix"; // "de-it", "it-de" oder "mix"
let currentCardDirection = null; // für mix-Modus: aktuelle Richtung der Karte
let answered = false;

// ============================================================
// Storage
// ============================================================
function loadState() {
  try {
    const raw = localStorage.getItem("vokabeltrainer-state");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migration: alte Struktur (single box) → dual tracks
      if (parsed.vocab && parsed.vocab.length > 0 && !parsed.vocab[0].deIt) {
        parsed.vocab = parsed.vocab.map(v => migrateCard(v));
      }
      return parsed;
    }
  } catch (e) { console.warn("State-Load fehlgeschlagen:", e); }
  return {
    vocab: SAMPLE_VOCAB.map((v, i) => ({
      id: "v" + i + "-" + Date.now(),
      de: v.de,
      it: v.it,
      deIt: { box: 1, nextDue: todayISO(), correct: 0, wrong: 0 },
      itDe: { box: 1, nextDue: todayISO(), correct: 0, wrong: 0 },
      created: todayISO()
    })),
    mode: "de-it",
    lastUsed: todayISO()
  };
}

// Migration von alter Struktur (single box/nextDue) zu dual tracks
function migrateCard(v) {
  if (v.deIt) return v; // schon migriert
  const track = { box: v.box || 1, nextDue: v.nextDue || todayISO(), correct: v.stats?.correct || 0, wrong: v.stats?.wrong || 0 };
  return {
    id: v.id,
    de: v.de,
    it: v.it,
    deIt: { ...track },
    itDe: { box: 1, nextDue: todayISO(), correct: 0, wrong: 0 },
    created: v.created || todayISO()
  };
}

function saveState() {
  state.lastUsed = todayISO();
  localStorage.setItem("vokabeltrainer-state", JSON.stringify(state));
}

function todayISO() { return new Date().toISOString().split("T")[0]; }
function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
function isDue(card) {
  if (currentMode === "mix") {
    return card.deIt.nextDue <= todayISO() || card.itDe.nextDue <= todayISO();
  }
  const track = currentMode === "de-it" ? card.deIt : card.itDe;
  return track.nextDue <= todayISO();
}

function getTrack(card) {
  if (currentMode === "mix") {
    return currentCardDirection === "it-de" ? card.itDe : card.deIt;
  }
  return currentMode === "de-it" ? card.deIt : card.itDe;
}

// Bestimmt die Richtung für eine Karte im Mix-Modus
function pickDirection(card) {
  const deItDue = card.deIt.nextDue <= todayISO();
  const itDeDue = card.itDe.nextDue <= todayISO();
  if (deItDue && itDeDue) return Math.random() < 0.5 ? "de-it" : "it-de";
  if (deItDue) return "de-it";
  return "it-de";
}

// ============================================================
// Normalisierung (für Antwort-Vergleich)
// ============================================================
function normalize(s) {
  return s.toLowerCase()
    .trim()
    .replace(/[àáâ]/g, "a")
    .replace(/[èéê]/g, "e")
    .replace(/[ìíî]/g, "i")
    .replace(/[òóô]/g, "o")
    .replace(/[ùúû]/g, "u")
    .replace(/[ç]/g, "c")
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]/g, "");
}

function answerMatches(input, expected) {
  const ni = normalize(input);
  // Mehrere mögliche Antworten durch "/" oder "," getrennt
  const variants = expected.split(/[\/,]/).map(s => normalize(s));
  return variants.some(v => v === ni);
}

// ============================================================
// Leitner-Logik
// ============================================================
function promoteCard(card) {
  const track = getTrack(card);
  track.box = Math.min(track.box + 1, LEITNER_INTERVALS.length);
  track.nextDue = addDays(todayISO(), LEITNER_INTERVALS[track.box - 1]);
  track.correct++;
}
function demoteCard(card) {
  const track = getTrack(card);
  track.box = 1;
  track.nextDue = todayISO();
  track.wrong++;
}

function pickNextCard() {
  const due = state.vocab.filter(isDue);
  if (due.length === 0) return null;
  // Niedrigere Box zuerst, innerhalb gleicher Box zufällig
  due.sort((a, b) => {
    const aBox = getTrack(a).box;
    const bBox = getTrack(b).box;
    return aBox - bBox || Math.random() - 0.5;
  });
  return due[0];
}

// Wählt nächste Karte + setzt im Mix-Modus die Richtung
function advanceToNextCard() {
  currentCard = pickNextCard();
  answered = false;
  if (currentCard && currentMode === "mix") {
    currentCardDirection = pickDirection(currentCard);
  }
}

// ============================================================
// Views
// ============================================================
function renderTrain() {
  const view = document.getElementById("view-train");
  const due = state.vocab.filter(isDue).length;
  const total = state.vocab.length;

  // Stats-Boxen (im Mix: niedrigste Box beider Tracks)
  const getBoxForStats = (v) => {
    if (currentMode === "mix") return Math.min(v.deIt.box, v.itDe.box);
    return getTrack(v).box;
  };
  const counts = [1, 2, 3, 4, 5].map(b => state.vocab.filter(v => getBoxForStats(v) === b).length);
  const dueCount = state.vocab.filter(isDue).length;

  let html = '<div class="stats">';
  for (let i = 0; i < 5; i++) {
    html += `<div class="stat-box"><div class="num">${counts[i]}</div><div class="label">Box ${i+1}</div></div>`;
  }
  html += "</div>";
  html += `<div class="stat-box due" style="margin-bottom:1rem"><div class="num">${dueCount}</div><div class="label">Heute fällig</div></div>`;

  // Modus-Umschalter
  html += '<div class="mode-toggle">';
  html += `<button data-mode="de-it" class="${currentMode==="de-it"?"active":""}">🇩🇪 → 🇮🇹</button>`;
  html += `<button data-mode="mix" class="${currentMode==="mix"?"active":""}">Mix</button>`;
  html += `<button data-mode="it-de" class="${currentMode==="it-de"?"active":""}">🇮🇹 → 🇩🇪</button>`;
  html += "</div>";

  if (total === 0) {
    html += `<div class="empty-state"><div class="icon">📝</div><p>Noch keine Vokabeln.</p><p>Tipp auf <strong>+ Neu</strong> um anzufangen.</p></div>`;
    view.innerHTML = html;
    bindModeButtons();
    return;
  }

  if (due === 0) {
    html += `<div class="empty-state"><div class="icon">🎉</div><p><strong>Alles erledigt!</strong></p><p>Komm morgen wieder.</p></div>`;
    view.innerHTML = html;
    bindModeButtons();
    return;
  }

  // Karte
  if (!currentCard || !isDue(currentCard) || !state.vocab.find(v => v.id === currentCard.id)) {
    advanceToNextCard();
  }

  const effectiveMode = currentMode === "mix" ? currentCardDirection : currentMode;
  const promptIsDE = effectiveMode === "de-it";
  const promptWord = promptIsDE ? currentCard.de : currentCard.it;
  const expectedWord = promptIsDE ? currentCard.it : currentCard.de;
  const promptLabel = promptIsDE ? "Deutsch" : "Italienisch";
  const answerLabel = promptIsDE ? "Italienisch" : "Deutsch";

  html += `<div class="card">
    <div class="prompt-label">${promptLabel} (Box ${getTrack(currentCard).box})</div>
    <div class="prompt-word">${escapeHtml(promptWord)}</div>
    <input type="text" id="answer-input" placeholder="${answerLabel} eingeben..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
    <div id="feedback" class="feedback empty">&nbsp;</div>
  </div>`;

  if (!answered) {
    html += `<button class="btn" id="check-btn">Prüfen</button>`;
    html += `<button class="btn btn-secondary" id="show-btn">Lösung zeigen</button>`;
  } else {
    html += `<button class="btn" id="next-btn">Weiter</button>`;
  }

  view.innerHTML = html;
  bindModeButtons();

  const input = document.getElementById("answer-input");
  if (input && !answered) {
    setTimeout(() => input.focus(), 50);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); checkAnswer(expectedWord); }
    });
    document.getElementById("check-btn").addEventListener("click", () => checkAnswer(expectedWord));
    document.getElementById("show-btn").addEventListener("click", () => showSolution(expectedWord));
  } else if (answered) {
    document.getElementById("next-btn").addEventListener("click", () => {
      advanceToNextCard();
      renderTrain();
    });
  }
}

function checkAnswer(expected) {
  const input = document.getElementById("answer-input");
  const fb = document.getElementById("feedback");
  const value = input.value;
  if (!value.trim()) { input.focus(); return; }

  if (answerMatches(value, expected)) {
    promoteCard(currentCard);
    fb.className = "feedback correct";
    fb.innerHTML = `✓ Richtig! <span class="correct-answer">→ Box ${getTrack(currentCard).box}</span>`;
  } else {
    demoteCard(currentCard);
    fb.className = "feedback wrong";
    fb.innerHTML = `✗ Falsch. <span class="correct-answer">${escapeHtml(expected)}</span>`;
  }
  input.disabled = true;
  answered = true;
  saveState();

  // "Weiter"-Button nachziehen
  const checkBtn = document.getElementById("check-btn");
  const showBtn = document.getElementById("show-btn");
  if (checkBtn) checkBtn.remove();
  if (showBtn) showBtn.remove();
  const nextBtn = document.createElement("button");
  nextBtn.className = "btn";
  nextBtn.id = "next-btn";
  nextBtn.textContent = "Weiter";
  nextBtn.addEventListener("click", () => {
    advanceToNextCard();
    renderTrain();
  });
  document.getElementById("view-train").appendChild(nextBtn);
  setTimeout(() => nextBtn.focus(), 50);
}

function showSolution(expected) {
  const input = document.getElementById("answer-input");
  const fb = document.getElementById("feedback");
  demoteCard(currentCard);
  fb.className = "feedback wrong";
  fb.innerHTML = `<span class="correct-answer">${escapeHtml(expected)}</span>`;
  input.value = "";
  input.disabled = true;
  answered = true;
  saveState();

  const checkBtn = document.getElementById("check-btn");
  const showBtn = document.getElementById("show-btn");
  if (checkBtn) checkBtn.remove();
  if (showBtn) showBtn.remove();
  const nextBtn = document.createElement("button");
  nextBtn.className = "btn";
  nextBtn.id = "next-btn";
  nextBtn.textContent = "Weiter";
  nextBtn.addEventListener("click", () => {
    advanceToNextCard();
    renderTrain();
  });
  document.getElementById("view-train").appendChild(nextBtn);
  setTimeout(() => nextBtn.focus(), 50);
}

function bindModeButtons() {
  document.querySelectorAll(".mode-toggle button").forEach(btn => {
    btn.addEventListener("click", () => {
      currentMode = btn.dataset.mode;
      state.mode = currentMode;
      saveState();
      currentCard = null;
      currentCardDirection = null;
      answered = false;
      renderTrain();
    });
  });
}

// ============================================================
// Vokabel-Liste
// ============================================================
function renderList() {
  const view = document.getElementById("view-list");
  let html = `<input type="text" class="search-box" id="search" placeholder="Suchen..." autocomplete="off">`;

  if (state.vocab.length === 0) {
    html += `<div class="empty-state"><div class="icon">📭</div><p>Keine Vokabeln vorhanden.</p></div>`;
    view.innerHTML = html;
    return;
  }

  // Nach Box gruppieren
  const search = (document.getElementById("search")?.value || "").toLowerCase();
  const filtered = state.vocab.filter(v =>
    !search || v.de.toLowerCase().includes(search) || v.it.toLowerCase().includes(search)
  );

  // Sortierung: niedrigste Box (DE→IT) aufsteigend, innerhalb alphabetisch
  filtered.sort((a, b) => a.deIt.box - b.deIt.box || a.de.localeCompare(b.de));

  html += `<ul class="vocab-list">`;
  for (const v of filtered) {
    html += `<li class="vocab-item">
      <span class="box-badge" title="DE→IT / IT→DE">${v.deIt.box}|${v.itDe.box}</span>
      <div class="words">
        <div class="de">${escapeHtml(v.de)}</div>
        <div class="it">${escapeHtml(v.it)}</div>
      </div>
      <button class="delete-btn" data-id="${v.id}" title="Löschen">×</button>
    </li>`;
  }
  html += `</ul>`;
  html += `<p style="text-align:center; color:#666; font-size:0.8rem; margin-top:1rem;">${filtered.length} von ${state.vocab.length} Vokabeln</p>`;

  view.innerHTML = html;

  document.getElementById("search").addEventListener("input", renderList);
  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const v = state.vocab.find(x => x.id === id);
      if (confirm(`"${v.de}" / "${v.it}" wirklich löschen?`)) {
        state.vocab = state.vocab.filter(x => x.id !== id);
        if (currentCard && currentCard.id === id) currentCard = null;
        saveState();
        renderList();
        toast("Gelöscht");
      }
    });
  });
}

// ============================================================
// Vokabel hinzufügen
// ============================================================
function renderAdd() {
  const view = document.getElementById("view-add");
  view.innerHTML = `
    <h2 class="section-title">Neue Vokabel</h2>
    <div class="form-group">
      <label for="add-de">Deutsch</label>
      <input type="text" id="add-de" autocomplete="off" placeholder="z.B. Haus">
    </div>
    <div class="form-group">
      <label for="add-it">Italienisch</label>
      <input type="text" id="add-it" autocomplete="off" autocapitalize="off" placeholder="z.B. casa">
    </div>
    <p style="font-size:0.8rem; color:#888; margin-bottom:1rem;">
      Mehrere Übersetzungen mit <code>/</code> trennen, z.B. <code>casa/abitazione</code>
    </p>
    <button class="btn" id="add-btn">Hinzufügen</button>

    <h2 class="section-title">Mehrere auf einmal</h2>
    <p style="font-size:0.85rem; color:#aaa; margin-bottom:0.5rem;">
      Eine Vokabel pro Zeile, Format: <code>Deutsch = Italienisch</code>
    </p>
    <textarea id="bulk-input" rows="6" style="width:100%; padding:0.7rem; background:#16213e; border:1px solid #0f3460; color:#fff; border-radius:6px; font-family:inherit; font-size:0.95rem;" placeholder="Haus = casa&#10;Hund = cane&#10;laufen = correre"></textarea>
    <button class="btn btn-secondary" id="bulk-btn" style="margin-top:0.5rem;">Alle hinzufügen</button>
  `;

  document.getElementById("add-btn").addEventListener("click", () => {
    const de = document.getElementById("add-de").value.trim();
    const it = document.getElementById("add-it").value.trim();
    if (!de || !it) {
      toast("Beide Felder ausfüllen");
      return;
    }
    addVocab(de, it);
    document.getElementById("add-de").value = "";
    document.getElementById("add-it").value = "";
    document.getElementById("add-de").focus();
    toast(`"${de}" hinzugefügt`);
  });

  document.getElementById("bulk-btn").addEventListener("click", () => {
    const text = document.getElementById("bulk-input").value;
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    let added = 0, skipped = 0;
    for (const line of lines) {
      const m = line.split(/\s*=\s*/);
      if (m.length === 2 && m[0] && m[1]) {
        addVocab(m[0], m[1], false);
        added++;
      } else {
        skipped++;
      }
    }
    saveState();
    document.getElementById("bulk-input").value = "";
    toast(`${added} hinzugefügt${skipped ? ", " + skipped + " übersprungen" : ""}`);
  });

  setTimeout(() => document.getElementById("add-de").focus(), 50);
}

function addVocab(de, it, save = true) {
  // Duplikat-Check (case-insensitive auf deutscher Seite)
  const exists = state.vocab.find(v => v.de.toLowerCase() === de.toLowerCase());
  if (exists) {
    // Bei Duplikat: italienische Übersetzung erweitern, falls neu
    if (!exists.it.toLowerCase().split(/[\/,]/).some(x => x.trim() === it.toLowerCase())) {
      exists.it = exists.it + "/" + it;
    }
  } else {
    state.vocab.push({
      id: "v-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      de, it,
      deIt: { box: 1, nextDue: todayISO(), correct: 0, wrong: 0 },
      itDe: { box: 1, nextDue: todayISO(), correct: 0, wrong: 0 },
      created: todayISO()
    });
  }
  if (save) saveState();
}

// ============================================================
// Einstellungen
// ============================================================
function renderSettings() {
  const view = document.getElementById("view-settings");
  const total = state.vocab.length;
  const correct = state.vocab.reduce((s, v) => s + v.deIt.correct + v.itDe.correct, 0);
  const wrong = state.vocab.reduce((s, v) => s + v.deIt.wrong + v.itDe.wrong, 0);
  const totalAnswers = correct + wrong;
  const accuracy = totalAnswers ? Math.round((correct / totalAnswers) * 100) : 0;

  view.innerHTML = `
    <h2 class="section-title">Statistik</h2>
    <div class="card" style="text-align:left; padding:1rem 1.5rem;">
      <p style="margin-bottom:0.5rem;"><strong>${total}</strong> Vokabeln gesamt</p>
      <p style="margin-bottom:0.5rem;"><strong>${correct}</strong> richtige Antworten</p>
      <p style="margin-bottom:0.5rem;"><strong>${wrong}</strong> falsche Antworten</p>
      <p><strong>${accuracy}%</strong> Trefferquote</p>
    </div>

    <h2 class="section-title">Obsidian-Sync</h2>
    <button class="btn" id="sync-btn">🔄 Sync aus Obsidian</button>
    <p style="font-size:0.8rem; color:#888; margin-top:0.5rem;">Lädt neue Vokabeln aus der Obsidian-Datei (nach Ausführen des Sync-Scripts am Mac).</p>

    <h2 class="section-title">Daten</h2>
    <button class="btn btn-secondary" id="export-btn">📥 Als CSV exportieren</button>
    <button class="btn btn-secondary" id="import-btn" style="margin-top:0.5rem;">📤 CSV importieren</button>
    <input type="file" id="import-file" accept=".csv,.txt" style="display:none;">
    <button class="btn btn-tertiary" id="reset-btn" style="margin-top:0.5rem;">🔄 Fortschritt zurücksetzen</button>
    <button class="btn btn-tertiary" id="clear-btn" style="margin-top:0.5rem; color:#ff4d6d;">🗑️ Alles löschen</button>

    <h2 class="section-title">Über das Leitner-System</h2>
    <details>
      <summary>Wie funktioniert das?</summary>
      <p>Jede Vokabel startet in <strong>Box 1</strong> und wird täglich abgefragt.</p>
      <p>Richtig beantwortet → Vokabel wandert eine Box weiter. Box 2 = alle 2 Tage, Box 3 = alle 4 Tage, Box 4 = alle 8 Tage, Box 5 = alle 16 Tage.</p>
      <p>Falsch beantwortet → zurück in Box 1.</p>
      <p>So wiederholst du oft was du noch nicht kannst und seltener was du schon kannst.</p>
    </details>
    <details>
      <summary>Tipps</summary>
      <p>• Akzente sind optional (caffè = caffe).</p>
      <p>• Mehrere Übersetzungen mit <code>/</code> trennen.</p>
      <p>• 5–10 Minuten täglich bringen mehr als eine Stunde alle paar Tage.</p>
    </details>

    <p style="text-align:center; color:#444; font-size:0.75rem; margin-top:2rem;">v1.0 · Daten lokal im Browser</p>
  `;

  document.getElementById("sync-btn").addEventListener("click", syncFromObsidian);
  document.getElementById("export-btn").addEventListener("click", exportCSV);
  document.getElementById("import-btn").addEventListener("click", () => document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", importCSV);
  document.getElementById("reset-btn").addEventListener("click", () => {
    if (confirm("Alle Vokabeln zurück in Box 1? (Vokabeln bleiben erhalten, nur Lernfortschritt wird zurückgesetzt)")) {
      state.vocab.forEach(v => {
        v.deIt = { box: 1, nextDue: todayISO(), correct: 0, wrong: 0 };
        v.itDe = { box: 1, nextDue: todayISO(), correct: 0, wrong: 0 };
      });
      saveState();
      currentCard = null;
      toast("Fortschritt zurückgesetzt");
      renderSettings();
    }
  });
  document.getElementById("clear-btn").addEventListener("click", () => {
    if (confirm("ALLE Vokabeln löschen? Das kann nicht rückgängig gemacht werden.")) {
      if (confirm("Wirklich alle löschen?")) {
        state.vocab = [];
        currentCard = null;
        saveState();
        toast("Alles gelöscht");
        renderSettings();
      }
    }
  });
}

// ============================================================
// Obsidian Sync
// ============================================================
async function syncFromObsidian() {
  try {
    const resp = await fetch("./vocab.json?" + Date.now());
    if (!resp.ok) {
      toast("vocab.json nicht gefunden — erst Sync-Script am Mac ausführen");
      return;
    }
    const vocabList = await resp.json();
    let added = 0, updated = 0;
    for (const v of vocabList) {
      if (!v.de || !v.it) continue;
      const existing = state.vocab.find(x => x.de.toLowerCase() === v.de.toLowerCase());
      if (existing) {
        // Prüfen ob italienische Seite erweitert werden muss
        const newVariants = v.it.toLowerCase().split(/[\/,]/).map(s => s.trim());
        const existingVariants = existing.it.toLowerCase().split(/[\/,]/).map(s => s.trim());
        const toAdd = newVariants.filter(n => !existingVariants.includes(n));
        if (toAdd.length > 0) {
          existing.it = existing.it + "/" + toAdd.join("/");
          updated++;
        }
      } else {
        state.vocab.push({
          id: "v-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          de: v.de,
          it: v.it,
          deIt: { box: 1, nextDue: todayISO(), correct: 0, wrong: 0 },
          itDe: { box: 1, nextDue: todayISO(), correct: 0, wrong: 0 },
          created: todayISO()
        });
        added++;
      }
    }
    saveState();
    toast(`Sync: ${added} neu, ${updated} erweitert`);
    renderSettings();
  } catch (e) {
    toast("Sync fehlgeschlagen: " + e.message);
  }
}

// ============================================================
// CSV Export / Import
// ============================================================
function exportCSV() {
  const header = "deutsch;italienisch;box_de_it;box_it_de;richtig_de_it;falsch_de_it;richtig_it_de;falsch_it_de\n";
  const rows = state.vocab.map(v =>
    [csvEsc(v.de), csvEsc(v.it), v.deIt.box, v.itDe.box, v.deIt.correct, v.deIt.wrong, v.itDe.correct, v.itDe.wrong].join(";")
  ).join("\n");
  const csv = header + rows;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vokabeln-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Export gestartet");
}

function csvEsc(s) {
  if (/[;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function importCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const text = ev.target.result;
    const lines = text.split(/\r?\n/).filter(Boolean);
    let added = 0, skipped = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Header überspringen
      if (i === 0 && /^(deutsch|german|de)/i.test(line)) continue;
      // Trennzeichen erkennen: ; , oder Tab
      const sep = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
      const parts = parseCSVLine(line, sep);
      if (parts.length >= 2 && parts[0] && parts[1]) {
        addVocab(parts[0], parts[1], false);
        added++;
      } else {
        skipped++;
      }
    }
    saveState();
    toast(`${added} importiert${skipped ? ", " + skipped + " übersprungen" : ""}`);
    e.target.value = "";
    renderSettings();
  };
  reader.readAsText(file);
}

function parseCSVLine(line, sep) {
  const result = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === sep) { result.push(cur.trim()); cur = ""; }
      else cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// ============================================================
// Helper
// ============================================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

// ============================================================
// Navigation
// ============================================================
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
  document.querySelector(`nav button[data-view="${name}"]`).classList.add("active");

  if (name === "train") renderTrain();
  else if (name === "list") renderList();
  else if (name === "add") renderAdd();
  else if (name === "settings") renderSettings();
}

document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

// ============================================================
// Service Worker
// ============================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => console.warn("SW failed:", err));
  });
}

// ============================================================
// Init
// ============================================================
renderTrain();
