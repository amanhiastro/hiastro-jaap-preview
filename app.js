const app = document.querySelector("#jaap-app");

const JAAP_SOUND_SRC = "assets/jaap-sound.mp3";
const RUDRAKSHA_BEAD_SRC = "assets/rudraksha-bead.png";
const VISIBLE_BEADS = 13;
const STORAGE_PREFIX = "hiastro:jaap:";
const MUTED_KEY = "hiastro:jaap:muted";
const STALE_COUNT_MS = 24 * 60 * 60 * 1000;
const HAPTIC_PATTERNS = {
  selection: 6,
  start: 12,
  bead: 10,
  complete: [18, 44, 28, 44, 36],
  reset: [10, 26, 10],
};

const mantras = [
  {
    id: "om-namah-shivaya",
    name: "Om Namah Shivaya",
    helper: "Calm, surrender, and steady energy",
  },
  {
    id: "maha-mrityunjay",
    name: "Maha Mrityunjay Mantra",
    helper: "Healing, protection, and resilience",
  },
  {
    id: "gayatri",
    name: "Gayatri Mantra",
    helper: "Clarity, learning, and inner focus",
  },
];

const musicTracks = [
  {
    id: "jaap-sound",
    name: "Jaap Ambient",
    duration: "loop",
    cover: "assets/krishna-flute.png",
  },
];

const targets = [11, 21, 51, 108, 1008];

const state = {
  screen: "launch",
  selectedMantraId: "om-namah-shivaya",
  selectedMusicId: "jaap-sound",
  target: 108,
  customCount: "",
  customOpen: false,
  sheet: null,
  count: 0,
  malas: 0,
  totalLifetime: 0,
  restoredCount: 0,
  passingIdx: 0,
  showCelebrate: false,
  showResumeSheet: false,
  showExitSheet: false,
  muted: readMuted(),
  musicPlaying: false,
  ignoreNextGestureClick: false,
};

const audioEngine = {
  element: null,
};

let gestureStartY = null;
let celebrateTimer = null;

render();

app.addEventListener("click", (event) => {
  const gestureZone = event.target.closest("[data-gesture-zone]");
  if (gestureZone) {
    if (state.ignoreNextGestureClick) {
      state.ignoreNextGestureClick = false;
      return;
    }
    handleAction("increment-jaap");
    return;
  }

  const action = event.target.closest("[data-action]");
  const targetButton = event.target.closest("[data-target]");
  const option = event.target.closest("[data-option]");

  if (targetButton) {
    triggerHaptic("selection");
    state.target = Number(targetButton.dataset.target);
    state.customCount = "";
    state.customOpen = false;
    render();
    return;
  }

  if (option) {
    triggerHaptic("selection");
    if (state.sheet === "mantra") {
      state.selectedMantraId = option.dataset.option;
    }
    state.sheet = null;
    render();
    return;
  }

  if (!action) return;
  handleAction(action.dataset.action);
});

app.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-custom-form]");
  if (!form) return;

  event.preventDefault();
  const input = form.querySelector("input");
  const value = Number(input.value);
  if (Number.isInteger(value) && value > 0 && value <= 100000) {
    state.target = value;
    state.customCount = String(value);
    state.customOpen = false;
    render();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.matches("[data-custom-input]")) {
    state.customCount = event.target.value.replace(/[^\d]/g, "").slice(0, 6);
    event.target.value = state.customCount;
  }
});

app.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("[data-gesture-zone]")) return;
  gestureStartY = event.clientY;
});

app.addEventListener("pointerup", (event) => {
  if (gestureStartY === null || !event.target.closest("[data-gesture-zone]")) {
    gestureStartY = null;
    return;
  }

  const movedUp = gestureStartY - event.clientY;
  gestureStartY = null;
  if (movedUp >= 24) {
    state.ignoreNextGestureClick = true;
    handleAction("increment-jaap");
  }
});

function handleAction(action) {
  if (action === "open-mantra") {
    triggerHaptic("selection");
    state.sheet = "mantra";
  }

  if (action === "close-sheet") {
    triggerHaptic("selection");
    state.sheet = null;
  }

  if (action === "custom-count") {
    triggerHaptic("selection");
    state.customOpen = true;
    state.sheet = null;
  }

  if (action === "start-jaap") {
    triggerHaptic("start");
    launchJaap();
    return;
  }

  if (action === "increment-jaap") {
    advanceJaap();
    return;
  }

  if (action === "reset-jaap") {
    triggerHaptic("reset");
    resetRound();
  }

  if (action === "toggle-mute") {
    triggerHaptic("selection");
    state.muted = !state.muted;
    writeMuted(state.muted);
    applyAudioVolume();
  }

  if (action === "back-launch") {
    triggerHaptic("selection");
    if (state.count > 0) {
      state.showExitSheet = true;
    } else {
      closeJaap();
      return;
    }
  }

  if (action === "resume-continue") {
    triggerHaptic("start");
    state.count = state.restoredCount;
    state.passingIdx += 1;
    state.showResumeSheet = false;
  }

  if (action === "resume-fresh") {
    triggerHaptic("reset");
    state.count = 0;
    state.restoredCount = 0;
    state.showResumeSheet = false;
    persistJaapState();
  }

  if (action === "exit-dismiss") {
    triggerHaptic("selection");
    state.showExitSheet = false;
  }

  if (action === "exit-confirm") {
    triggerHaptic("selection");
    state.showExitSheet = false;
    closeJaap();
    return;
  }

  render();
}

function launchJaap() {
  const saved = readJaapState(state.target);
  state.count = saved.count > 0 ? 0 : saved.count;
  state.restoredCount = saved.count;
  state.malas = saved.malas;
  state.totalLifetime = saved.totalLifetime;
  state.showResumeSheet = saved.count > 0;
  state.showExitSheet = false;
  state.showCelebrate = false;
  state.passingIdx = 0;
  state.screen = "session";
  state.musicPlaying = true;
  startAmbientSound();
  render();
}

function closeJaap() {
  persistJaapState();
  stopAmbientSound();
  state.screen = "launch";
  state.musicPlaying = false;
  state.showResumeSheet = false;
  state.showExitSheet = false;
  state.showCelebrate = false;
  render();
}

function advanceJaap() {
  if (state.screen !== "session") return;

  state.passingIdx += 1;
  state.totalLifetime += 1;
  const nextCount = state.count + 1;

  if (nextCount >= state.target) {
    state.count = 0;
    state.malas += 1;
    state.showCelebrate = true;
    triggerHaptic("complete");
    persistJaapState();
    window.clearTimeout(celebrateTimer);
    celebrateTimer = window.setTimeout(() => {
      state.showCelebrate = false;
      render();
    }, 1800);
  } else {
    state.count = nextCount;
    triggerHaptic("bead");
    persistJaapState();
  }

  render();
}

function resetRound() {
  state.count = 0;
  state.passingIdx += 1;
  persistJaapState();
}

function triggerHaptic(type) {
  const pattern = HAPTIC_PATTERNS[type];
  if (!pattern || !("vibrate" in navigator)) return;

  try {
    navigator.vibrate(pattern);
  } catch {
    // Haptics are best-effort; unsupported browsers should keep the jaap flow silent.
  }
}

function render() {
  if (state.screen === "session") {
    app.innerHTML = `
      <section class="app-screen session-mode">
        ${renderSession()}
        ${state.showResumeSheet ? renderConfirmSheet({
          title: "Resume your Jaap?",
          description: `You left off at bead ${state.restoredCount} of ${state.target}. Continue where you stopped, or start a fresh round.`,
          primaryAction: "resume-continue",
          primaryLabel: "Continue session",
          secondaryAction: "resume-fresh",
          secondaryLabel: "Start a new round",
        }) : ""}
        ${state.showExitSheet ? renderConfirmSheet({
          title: "Exit Jaap?",
          description: "Your progress on this round is saved. You can pick it up right where you left off.",
          primaryAction: "exit-dismiss",
          primaryLabel: "Continue chanting",
          secondaryAction: "exit-confirm",
          secondaryLabel: "Exit Jaap",
        }) : ""}
        ${state.sheet ? renderSheet() : ""}
      </section>
    `;
    return;
  }

  app.innerHTML = `
    <section class="app-screen">
      ${renderStatusBar()}
      ${renderHeader()}
      ${renderLaunch()}
      ${renderBottomNav()}
      ${state.sheet ? renderSheet() : ""}
    </section>
  `;
}

function renderStatusBar() {
  return `
    <div class="status-bar" aria-label="Status bar">
      <span>9:30</span>
      <span class="status-icons" aria-hidden="true">
        <span class="wifi-icon"></span>
        <span class="signal-icon"></span>
        <span class="battery-icon"></span>
      </span>
    </div>
  `;
}

function renderHeader() {
  return `
    <header class="jaap-header">
      <h1>Mantra Jaap</h1>
      <div class="streak">
        <span>Rounds:</span>
        <strong><span class="flame-icon" aria-hidden="true"></span>${state.malas || 5}</strong>
      </div>
    </header>
  `;
}

function renderLaunch() {
  const mantra = getSelectedMantra();
  const music = getSelectedMusic();

  return `
    <main class="entry-content">
      <div class="title-block">
        <h2>Let's begin your Jaap</h2>
        <p>Choose your mantra, target, and music to start.</p>
      </div>

      <button class="select-card" type="button" data-action="open-mantra">
        <span class="select-copy">
          <span class="field-label">Mantra</span>
          <strong>${escapeHtml(mantra.name)}</strong>
        </span>
        <span class="chevron" aria-hidden="true">›</span>
      </button>

      <section class="target-section" aria-labelledby="target-heading">
        <h3 id="target-heading">Target count</h3>
        <div class="chip-row">
          ${targets.map((target) => renderTargetChip(target)).join("")}
        </div>
        ${state.customOpen ? renderCustomForm() : renderCustomButton()}
      </section>

      <button class="select-card music-card" type="button" disabled>
        ${renderAlbumArt(music)}
        <span class="select-copy">
          <span class="field-label">Background music</span>
          <strong>${escapeHtml(music.name)} &middot; ${escapeHtml(music.duration)}</strong>
        </span>
      </button>

      <div class="entry-spacer"></div>

      <button class="start-button" type="button" data-action="start-jaap">
        Start Jaap
      </button>
    </main>
  `;
}

function renderSession() {
  const mantra = getSelectedMantra();
  const progress = (state.count / state.target) * 100;

  return `
    <main class="jaap-fullscreen">
      <div class="jaap-bg"></div>
      <button class="jaap-top-button jaap-close" type="button" data-action="back-launch" aria-label="Close Jaap">
        ${renderIcon("close")}
      </button>
      <button
        class="jaap-top-button jaap-mute"
        type="button"
        data-action="toggle-mute"
        aria-label="${state.muted ? "Unmute background sound" : "Mute background sound"}"
      >
        ${renderIcon(state.muted ? "speakerOff" : "speaker")}
      </button>

      <div class="jaap-brand" aria-hidden="true"><span>Hi</span>Astro</div>

      <section class="jaap-mantra-block">
        <span>TODAY'S MANTRA</span>
        <h2>${escapeHtml(mantra.name)}</h2>
        <i></i>
      </section>

      <section class="jaap-count-block" aria-live="polite">
        <span>COUNT</span>
        <strong class="jaap-count-number">${String(state.count).padStart(2, "0")}</strong>
        <small>of ${state.target}</small>
        <div class="jaap-progress"><i style="width:${progress}%"></i></div>
        <div class="jaap-stats">
          <div>
            <b>${state.malas}</b>
            <em>ROUNDS TODAY</em>
          </div>
          <hr />
          <div>
            <b>${state.totalLifetime}</b>
            <em>TOTAL CHANTS</em>
          </div>
        </div>
      </section>

      <section class="jaap-bottom-help">
        <p>Drag the mala upward with your thumb. Each bead = one chant.</p>
        <button type="button" data-action="reset-jaap">↺ Reset round</button>
      </section>

      <section class="jaap-mala-layer" aria-label="Jaap mala counter">
        <svg class="jaap-arc-line" viewBox="0 0 390 844" aria-hidden="true">
          <circle cx="${getArcGeometry().cx}" cy="${getArcGeometry().cy}" r="${getArcGeometry().radius}" />
        </svg>
        ${renderActiveIndicator()}
        ${renderBeadArc()}
      </section>

      <div class="jaap-gesture-zone" data-gesture-zone>
        ${state.count === 0 ? "<span>SWIPE ↑</span>" : ""}
      </div>

      ${state.showCelebrate ? renderCelebration() : ""}
    </main>
  `;
}

function renderBeadArc() {
  const positions = Array.from({ length: VISIBLE_BEADS + 2 }, (_, rawIndex) => {
    const slot = rawIndex - 1;
    return { slot, ...slotPosition(slot) };
  });

  return positions
    .map(({ slot, x, y }) => {
      const centerSlot = Math.floor(VISIBLE_BEADS / 2);
      const isCenter = slot === centerSlot;
      let opacity = 1;
      if (slot === -1 || slot === VISIBLE_BEADS) opacity = 0;
      else if (slot === 0) opacity = 0.5;
      else if (slot === VISIBLE_BEADS - 1) opacity = 0.7;

      const seed = positiveModulo(state.passingIdx + slot, 17);
      const size = isCenter ? 66 : 56;
      return `
        <span
          class="jaap-bead-slot ${isCenter ? "is-center" : ""}"
          style="left:${x - size / 2}px; top:${y - size / 2}px; width:${size}px; height:${size}px; opacity:${opacity}"
        >
          ${renderRudrakshBead(size, seed, isCenter)}
        </span>
      `;
    })
    .join("");
}

function renderActiveIndicator() {
  const centerSlot = Math.floor(VISIBLE_BEADS / 2);
  const pos = slotPosition(centerSlot);
  const size = 90;
  return `
    <span class="jaap-active-ring" style="left:${pos.x - size / 2}px; top:${pos.y - size / 2}px; width:${size}px; height:${size}px"></span>
    <span class="jaap-pulse-ring" style="left:${pos.x - size / 2}px; top:${pos.y - size / 2}px; width:${size}px; height:${size}px"></span>
  `;
}

function renderRudrakshBead(size, seed, isCenter) {
  const rotation = ((seed * 23) % 32) - 16;
  return `
    <img
      class="rudraksh-bead-img ${isCenter ? "is-center" : ""}"
      src="${RUDRAKSHA_BEAD_SRC}"
      width="${size}"
      height="${size}"
      alt=""
      aria-hidden="true"
      draggable="false"
      style="transform:rotate(${rotation}deg)"
    />
  `;
}

function renderCelebration() {
  return `
    <div class="jaap-celebrate" aria-live="polite">
      <span>✦ Mala complete · ${state.malas} ${state.malas === 1 ? "round" : "rounds"} today</span>
    </div>
  `;
}

function renderConfirmSheet({
  title,
  description,
  primaryAction,
  primaryLabel,
  secondaryAction,
  secondaryLabel,
}) {
  return `
    <div class="confirm-backdrop">
      <section class="confirm-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <span class="sheet-handle"></span>
        <div class="confirm-icon">${renderIcon("reset")}</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
        <button class="confirm-primary" type="button" data-action="${primaryAction}">
          ${escapeHtml(primaryLabel)}
        </button>
        <button class="confirm-secondary" type="button" data-action="${secondaryAction}">
          ${escapeHtml(secondaryLabel)}
        </button>
      </section>
    </div>
  `;
}

function getArcGeometry() {
  const screenW = 390;
  const screenH = 844;
  const bulgeLeftX = screenW * 0.58;
  const bend = screenW - bulgeLeftX;
  const halfHeight = screenH / 2;
  const distance = (halfHeight * halfHeight - bend * bend) / (2 * bend);
  const cx = screenW + distance;
  const cy = screenH / 2;
  const radius = distance + bend;
  const top = Math.atan2(-distance, halfHeight);
  const bottom = -Math.PI - top;
  return { cx, cy, radius, top, bottom };
}

function slotPosition(slot) {
  const { cx, cy, radius, top, bottom } = getArcGeometry();
  const t = slot / (VISIBLE_BEADS - 1);
  const angle = top + t * (bottom - top);
  return {
    x: cx + Math.sin(angle) * radius,
    y: cy - Math.cos(angle) * radius,
  };
}

function renderTargetChip(target) {
  const active = state.target === target && state.customCount === "";
  return `
    <button class="target-chip ${active ? "is-active" : ""}" type="button" data-target="${target}">
      ${target}
    </button>
  `;
}

function renderCustomButton() {
  const label = state.customCount ? `${state.customCount} selected` : "Custom count";
  return `
    <button class="custom-row" type="button" data-action="custom-count">
      <span aria-hidden="true">+</span>
      ${escapeHtml(label)}
    </button>
  `;
}

function renderCustomForm() {
  return `
    <form class="custom-form" data-custom-form>
      <label for="custom-count">Custom count</label>
      <input
        id="custom-count"
        inputmode="numeric"
        autocomplete="off"
        value="${escapeHtml(state.customCount)}"
        placeholder="Enter count"
        data-custom-input
      />
      <button type="submit">Set</button>
    </form>
  `;
}

function renderSheet() {
  const items = mantras;
  return `
    <div class="sheet-backdrop" data-action="close-sheet">
      <section class="bottom-sheet" aria-modal="true" role="dialog" aria-label="Choose mantra">
        <div class="sheet-handle"></div>
        <header>
          <h2>Choose mantra</h2>
          <button type="button" data-action="close-sheet" aria-label="Close">
            ${renderIcon("close")}
          </button>
        </header>
        <div class="sheet-options">
          ${items
            .map(
              (item) => `
                <button
                  class="sheet-option ${item.id === state.selectedMantraId ? "is-selected" : ""}"
                  type="button"
                  data-option="${item.id}"
                >
                  <span>
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>${escapeHtml(item.helper)}</small>
                  </span>
                  ${item.id === state.selectedMantraId ? renderIcon("check") : ""}
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function renderBottomNav() {
  const items = [
    ["Astrologer", "astrologer"],
    ["Chats", "chat"],
    ["My Day", "sun"],
    ["Profile", "profile"],
  ];

  return `
    <nav class="bottom-nav" aria-label="Primary">
      <div class="bottom-nav-items">
        ${items
          .map(([label, icon]) => {
            const active = label === "My Day";
            return `
              <button class="nav-item ${active ? "is-active" : ""}" type="button">
                ${renderIcon(icon)}
                <span>${label}</span>
              </button>
            `;
          })
          .join("")}
      </div>
      <div class="home-indicator" aria-hidden="true"></div>
    </nav>
  `;
}

function renderAlbumArt(track) {
  if (track.cover) {
    return `
      <span class="album-art">
        <img src="${track.cover}" alt="" />
      </span>
    `;
  }

  return `
    <span class="album-art album-fallback" aria-hidden="true">
      ${renderIcon("music")}
    </span>
  `;
}

function getSelectedMantra() {
  return mantras.find((mantra) => mantra.id === state.selectedMantraId) || mantras[0];
}

function getSelectedMusic() {
  return musicTracks.find((track) => track.id === state.selectedMusicId) || musicTracks[0];
}

function startAmbientSound() {
  if (!audioEngine.element) {
    audioEngine.element = new Audio(JAAP_SOUND_SRC);
    audioEngine.element.loop = true;
  }

  applyAudioVolume();
  audioEngine.element.play().catch(() => {
    state.musicPlaying = false;
    render();
  });
}

function stopAmbientSound() {
  if (!audioEngine.element) return;
  audioEngine.element.pause();
  audioEngine.element.currentTime = 0;
}

function applyAudioVolume() {
  if (!audioEngine.element) return;
  audioEngine.element.volume = state.muted ? 0 : 0.6;
}

function readJaapState(target) {
  const fresh = {
    count: 0,
    malas: 0,
    totalLifetime: 0,
    date: todayKey(),
    lastTouchedAt: Date.now(),
  };

  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return fresh;
    const parsed = JSON.parse(raw);
    const today = todayKey();
    const stale =
      typeof parsed.lastTouchedAt === "number" &&
      Date.now() - parsed.lastTouchedAt > STALE_COUNT_MS;
    const isNewDay = parsed.date !== today;

    return {
      count: isNewDay || stale ? 0 : Math.min(Math.max(Number(parsed.count) || 0, 0), target),
      malas: isNewDay ? 0 : Math.max(Number(parsed.malas) || 0, 0),
      totalLifetime: Math.max(Number(parsed.totalLifetime) || 0, 0),
      date: today,
      lastTouchedAt: Date.now(),
    };
  } catch {
    return fresh;
  }
}

function persistJaapState() {
  try {
    window.localStorage.setItem(
      storageKey(),
      JSON.stringify({
        count: state.count,
        malas: state.malas,
        totalLifetime: state.totalLifetime,
        date: todayKey(),
        lastTouchedAt: Date.now(),
      })
    );
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

function readMuted() {
  try {
    return window.localStorage.getItem(MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeMuted(muted) {
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? "true" : "false");
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function storageKey() {
  return `${STORAGE_PREFIX}${state.selectedMantraId}:${state.target}`;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function renderIcon(name) {
  const icons = {
    astrologer: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5v3.2M7.9 5.2l1.6 2.8M16.1 5.2 14.5 8M6.8 15.5h10.4M8 18.5h8M9.5 21h5" />
        <path d="M7.2 13.5a4.8 4.8 0 1 1 9.6 0" />
        <path d="M9.5 13.5a2.5 2.5 0 1 1 5 0" />
      </svg>
    `,
    chat: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 6.8a6.8 6.8 0 0 1 6.8-3.8h1.4a6.8 6.8 0 0 1 6.8 6.8v.5a6.8 6.8 0 0 1-6.8 6.8h-2.8l-4.2 3v-4.2a6.8 6.8 0 0 1-1.2-9.1Z" />
        <path d="M8.3 9h7.4M8.3 12h5.3" />
      </svg>
    `,
    sun: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v2.2M5.6 5.6 7.1 7.1M3 12h2.2M18.8 12H21M16.9 7.1l1.5-1.5" />
        <path d="M6.8 15.2a7.7 7.7 0 0 1 10.4 0" />
        <path d="M9.1 12.8a3.4 3.4 0 0 1 5.8 0" />
        <path d="M4.5 18.2h15M7.8 20.8h8.4" />
      </svg>
    `,
    profile: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 12.2a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Z" />
        <path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0" />
      </svg>
    `,
    music: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18.5a2.6 2.6 0 1 1-1.2-2.2V5.8l8.2-1.7v10.7" />
        <path d="M16 16.8a2.6 2.6 0 1 1-1.2-2.2" />
      </svg>
    `,
    close: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    `,
    check: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 12.5 4.2 4.2L19 7" />
      </svg>
    `,
    speaker: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />
        <path d="M16 8c1.5 1.2 2.5 2.6 2.5 4s-1 2.8-2.5 4" />
        <path d="M19 5c2.5 1.7 4 4.2 4 7s-1.5 5.3-4 7" />
      </svg>
    `,
    speakerOff: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />
        <path d="m16 9 6 6M22 9l-6 6" />
      </svg>
    `,
    reset: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
    `,
  };

  return icons[name] || "";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
