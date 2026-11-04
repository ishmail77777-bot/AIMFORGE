/* ════════════════════════════════════════════════════════════
   AIMFORGE — game.js
   Full game logic, developer config system, leaderboard
   ════════════════════════════════════════════════════════════ */

'use strict';

/* ── DIFFICULTY CONFIG ─────────────────────────────────────────── */
const DIFFICULTIES = {
  bot: {
    label:       'BOT',
    minRadius:   50,  maxRadius:  75,
    minLifetime: 2800, maxLifetime: 4200,
    spawnInterval: 900,
    maxTargets:  2,
    moveTargets: false,
    scoreMultiplier: 0.7,
    bgOverlay: 'rgba(0,245,212,0.03)',
  },
  normal: {
    label:       'NORMAL',
    minRadius:   30,  maxRadius:  55,
    minLifetime: 1800, maxLifetime: 2800,
    spawnInterval: 650,
    maxTargets:  3,
    moveTargets: false,
    scoreMultiplier: 1.0,
    bgOverlay: 'rgba(124,58,237,0.04)',
  },
  pro: {
    label:       'PRO',
    minRadius:   18,  maxRadius:  34,
    minLifetime: 1000, maxLifetime: 1700,
    spawnInterval: 480,
    maxTargets:  4,
    moveTargets: true,
    moveSpeed:   1.4,
    scoreMultiplier: 1.8,
    bgOverlay: 'rgba(255,132,0,0.03)',
  },
  hacker: {
    label:       'HACKER',
    minRadius:   9,   maxRadius:  22,
    minLifetime: 550, maxLifetime: 1100,
    spawnInterval: 300,
    maxTargets:  6,
    moveTargets: true,
    moveSpeed:   3.2,
    scoreMultiplier: 3.5,
    bgOverlay: 'rgba(255,60,110,0.05)',
  }
};

/* ── DEVELOPER CONFIG (populated from settings) ──────────────── */
let CONFIG = {
  duration:       30,
  maxTargets:     null,   // null = use difficulty default
  lifetimeMult:   1.0,
  bgType:         'gradient',
  bgColor1:       '#0a0a1a',
  bgColor2:       '#1a0a2e',
  bgDir:          '135deg',
  bgImage:        '',
  accentColor:    '#00f5d4',
  targetColor:    '#ff3c6e',
  targetGlow:     '#ff3c6e',
  targetShape:    'circle',
  hitColor:       '#00f5d4',
  crosshairStyle: 'default',
  crosshairColor: '#ffffff',
  crosshairSize:  24,
  particles:      true,
  missShake:      true,
  hitSound:       true,
  missSound:      true,
  volume:         0.4,
  showFps:        false,
  hitPts:         100,
  missPts:        25,
  streakMult:     1.5,
};

/* ── GAME STATE ──────────────────────────────────────────────── */
let state = {
  mode:       null,
  running:    false,
  paused:     false,
  score:      0,
  hits:       0,
  misses:     0,
  streak:     0,
  bestStreak: 0,
  timeLeft:   30,
  targets:    [],
  animFrame:  null,
  spawnTimer: null,
  countdownTimer: null,
  reactionTimes:  [],
  lastHitTime:    0,
};

let mouseX = 0, mouseY = 0;
let fpsFrames = 0, fpsLast = 0, fpsVal = 0;

/* ── AUDIO CONTEXT ───────────────────────────────────────────── */
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playHitSound() {
  if (!CONFIG.hitSound) return;
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(CONFIG.volume * 0.6, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    o.start(); o.stop(ctx.currentTime + 0.12);
  } catch(e){}
}
function playMissSound() {
  if (!CONFIG.missSound) return;
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, ctx.currentTime);
    g.gain.setValueAtTime(CONFIG.volume * 0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    o.start(); o.stop(ctx.currentTime + 0.15);
  } catch(e){}
}
function playCountdownSound(n) {
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = n === 0 ? 1200 : 600;
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    o.start(); o.stop(ctx.currentTime + 0.18);
  } catch(e){}
}

/* ── DOM REFS ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const arena       = $('game-arena');
const crosshair   = $('crosshair');
const hudScore    = $('hud-score');
const hudTimer    = $('hud-timer');
const hudAccuracy = $('hud-accuracy');
const hudHits     = $('hud-hits');
const hudMisses   = $('hud-misses');
const hudMode     = $('hud-mode-label');
const timerRingFg = $('timer-ring-fg');
const fpsCounter  = $('fps-counter');
const streakBadge = document.getElementById('streak-badge') || createStreakBadge();

function createStreakBadge() {
  const el = document.createElement('div');
  el.id = 'streak-badge';
  document.body.appendChild(el);
  return el;
}

/* ── SCREEN TRANSITIONS ─────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
    s.style.opacity = '0';
  });
  const el = $(id);
  if (!el) return;
  el.style.display = 'flex';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.classList.add('active');
    });
  });
}

/* ── MOUSE TRACKING ─────────────────────────────────────────── */
document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  crosshair.style.left = mouseX + 'px';
  crosshair.style.top  = mouseY + 'px';
});

/* ── SETTINGS PERSISTENCE ───────────────────────────────────── */
function loadSettings() {
  try {
    const saved = localStorage.getItem('aimforge_config');
    if (saved) Object.assign(CONFIG, JSON.parse(saved));
  } catch(e){}
  syncUIFromConfig();
  applySettings();
}
function saveSettings() {
  try { localStorage.setItem('aimforge_config', JSON.stringify(CONFIG)); } catch(e){}
  applySettings();
  closeSettings();
}
function resetSettings() {
  CONFIG = {
    duration: 30, maxTargets: null, lifetimeMult: 1.0,
    bgType:'gradient', bgColor1:'#0a0a1a', bgColor2:'#1a0a2e', bgDir:'135deg', bgImage:'',
    accentColor:'#00f5d4', targetColor:'#ff3c6e', targetGlow:'#ff3c6e', targetShape:'circle',
    hitColor:'#00f5d4', crosshairStyle:'default', crosshairColor:'#ffffff', crosshairSize:24,
    particles:true, missShake:true, hitSound:true, missSound:true, volume:0.4,
    showFps:false, hitPts:100, missPts:25, streakMult:1.5,
  };
  syncUIFromConfig();
  applySettings();
}

function syncUIFromConfig() {
  setV('cfg-bg-type',          CONFIG.bgType);
  setV('cfg-bg-color1',        CONFIG.bgColor1);
  setV('cfg-bg-color2',        CONFIG.bgColor2);
  setV('cfg-bg-dir',           CONFIG.bgDir);
  setV('cfg-bg-image',         CONFIG.bgImage);
  setV('cfg-target-color',     CONFIG.targetColor);
  setV('cfg-target-glow',      CONFIG.targetGlow);
  setV('cfg-target-shape',     CONFIG.targetShape);
  setV('cfg-hit-color',        CONFIG.hitColor);
  setV('cfg-crosshair-style',  CONFIG.crosshairStyle);
  setV('cfg-crosshair-color',  CONFIG.crosshairColor);
  setV('cfg-crosshair-size',   CONFIG.crosshairSize);
  setV('cfg-accent',           CONFIG.accentColor);
  setV('cfg-duration',         CONFIG.duration);
  setV('cfg-max-targets',      CONFIG.maxTargets ?? 3);
  setV('cfg-lifetime-mult',    CONFIG.lifetimeMult);
  setV('cfg-hit-pts',          CONFIG.hitPts);
  setV('cfg-miss-pts',         CONFIG.missPts);
  setV('cfg-streak-mult',      CONFIG.streakMult);
  setV('cfg-volume',           CONFIG.volume);
  setChecked('cfg-particles',   CONFIG.particles);
  setChecked('cfg-miss-shake',  CONFIG.missShake);
  setChecked('cfg-hit-sound',   CONFIG.hitSound);
  setChecked('cfg-miss-sound',  CONFIG.missSound);
  setChecked('cfg-show-fps',    CONFIG.showFps);
  // update labels
  syncDuration(); syncMax(); syncLifetime(); syncStreak(); syncVolume();
  $('cfg-crosshair-size-label').textContent = CONFIG.crosshairSize + 'px';
}

function setV(id, val) { const el = $(id); if(el) el.value = val; }
function setChecked(id, val) { const el = $(id); if(el) el.checked = val; }

function applySettings() {
  // read from inputs
  CONFIG.bgType         = getV('cfg-bg-type');
  CONFIG.bgColor1       = getV('cfg-bg-color1');
  CONFIG.bgColor2       = getV('cfg-bg-color2');
  CONFIG.bgDir          = getV('cfg-bg-dir');
  CONFIG.bgImage        = getV('cfg-bg-image');
  CONFIG.accentColor    = getV('cfg-accent');
  CONFIG.targetColor    = getV('cfg-target-color');
  CONFIG.targetGlow     = getV('cfg-target-glow');
  CONFIG.targetShape    = getV('cfg-target-shape');
  CONFIG.hitColor       = getV('cfg-hit-color');
  CONFIG.crosshairStyle = getV('cfg-crosshair-style');
  CONFIG.crosshairColor = getV('cfg-crosshair-color');
  CONFIG.crosshairSize  = +getV('cfg-crosshair-size') || 24;
  CONFIG.particles      = getChecked('cfg-particles');
  CONFIG.missShake      = getChecked('cfg-miss-shake');
  CONFIG.hitSound       = getChecked('cfg-hit-sound');
  CONFIG.missSound      = getChecked('cfg-miss-sound');
  CONFIG.volume         = +getV('cfg-volume') || 0.4;
  CONFIG.showFps        = getChecked('cfg-show-fps');
  CONFIG.hitPts         = +getV('cfg-hit-pts') || 100;
  CONFIG.missPts        = +getV('cfg-miss-pts') || 25;

  // crosshair size label
  $('cfg-crosshair-size-label').textContent = CONFIG.crosshairSize + 'px';

  // bg type row visibility
  const isBgImage = CONFIG.bgType === 'image';
  toggleHidden('row-bg-image',   !isBgImage);
  toggleHidden('row-bg-color1',  isBgImage);
  toggleHidden('row-bg-color2',  isBgImage || CONFIG.bgType === 'solid' ? false : false);
  if (CONFIG.bgType === 'solid') toggleHidden('row-bg-color2', true);
  else toggleHidden('row-bg-color2', isBgImage);

  // apply CSS vars
  const root = document.documentElement.style;
  root.setProperty('--accent',             CONFIG.accentColor);
  root.setProperty('--target-color',       CONFIG.targetColor);
  root.setProperty('--target-glow',        CONFIG.targetGlow);
  root.setProperty('--hit-color',          CONFIG.hitColor);
  root.setProperty('--crosshair-color',    CONFIG.crosshairColor);
  root.setProperty('--crosshair-size',     CONFIG.crosshairSize + 'px');

  // apply background
  applyBackground();

  // crosshair style
  updateCrosshair();

  // FPS
  if (CONFIG.showFps) fpsCounter.classList.remove('hidden');
  else                fpsCounter.classList.add('hidden');
}

function applyBackground() {
  const screens = ['menu-screen', 'game-screen', 'results-screen'];
  let bg = '';
  if (CONFIG.bgType === 'gradient') {
    bg = `linear-gradient(${CONFIG.bgDir}, ${CONFIG.bgColor1}, ${CONFIG.bgColor2})`;
  } else if (CONFIG.bgType === 'solid') {
    bg = CONFIG.bgColor1;
  } else if (CONFIG.bgType === 'image' && CONFIG.bgImage) {
    bg = `url(${CONFIG.bgImage}) center/cover no-repeat`;
  } else if (CONFIG.bgType === 'animated') {
    bg = `linear-gradient(${CONFIG.bgDir}, ${CONFIG.bgColor1}, ${CONFIG.bgColor2})`;
    startParticleBg();
  }
  screens.forEach(id => {
    const el = $(id);
    if (el) el.style.background = bg;
  });
  document.body.style.background = bg;
  // update CSS vars for reference
  document.documentElement.style.setProperty('--bg-color1', CONFIG.bgColor1);
  document.documentElement.style.setProperty('--bg-color2', CONFIG.bgColor2);
  document.documentElement.style.setProperty('--bg-dir',    CONFIG.bgDir);
}

let particleCanvas = null;
function startParticleBg() {
  if (particleCanvas) return;
  particleCanvas = document.createElement('canvas');
  particleCanvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.5';
  document.body.prepend(particleCanvas);
  const ctx = particleCanvas.getContext('2d');
  const pts = Array.from({length:60}, () => ({
    x: Math.random()*innerWidth, y: Math.random()*innerHeight,
    vx: (Math.random()-0.5)*0.5, vy: (Math.random()-0.5)*0.5,
    r: Math.random()*2+1, a: Math.random()
  }));
  function animPts() {
    particleCanvas.width = innerWidth; particleCanvas.height = innerHeight;
    ctx.clearRect(0,0,innerWidth,innerHeight);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if(p.x<0) p.x=innerWidth; if(p.x>innerWidth) p.x=0;
      if(p.y<0) p.y=innerHeight; if(p.y>innerHeight) p.y=0;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = CONFIG.accentColor + Math.floor(p.a*60).toString(16).padStart(2,'0');
      ctx.fill();
    });
    requestAnimationFrame(animPts);
  }
  animPts();
}

function updateCrosshair() {
  crosshair.className = 'style-' + CONFIG.crosshairStyle;
  crosshair.innerHTML = '';
  if (CONFIG.crosshairStyle === 'default') {
    const dot = document.createElement('div');
    dot.className = 'ch-dot'; crosshair.appendChild(dot);
  }
}

function getV(id) { const el = $(id); return el ? el.value : ''; }
function getChecked(id) { const el = $(id); return el ? el.checked : false; }
function toggleHidden(id, hidden) {
  const el = $(id);
  if (!el) return;
  if (hidden) el.classList.add('hidden'); else el.classList.remove('hidden');
}

/* Settings slider sync helpers */
function syncDuration()  {
  CONFIG.duration = +getV('cfg-duration') || 30;
  $('cfg-duration-label').textContent = CONFIG.duration + 's';
}
function syncMax()       {
  CONFIG.maxTargets = +getV('cfg-max-targets') || 3;
  $('cfg-max-targets-label').textContent = CONFIG.maxTargets;
}
function syncLifetime()  {
  CONFIG.lifetimeMult = +getV('cfg-lifetime-mult') || 1;
  $('cfg-lifetime-mult-label').textContent = '×' + CONFIG.lifetimeMult.toFixed(1);
}
function syncStreak()    {
  CONFIG.streakMult = +getV('cfg-streak-mult') || 1.5;
  $('cfg-streak-mult-label').textContent = '×' + CONFIG.streakMult.toFixed(1);
}
function syncVolume()    {
  CONFIG.volume = +getV('cfg-volume') || 0.4;
  $('cfg-volume-label').textContent = Math.round(CONFIG.volume*100) + '%';
}

/* Settings panel open/close */
function openSettings() { $('settings-overlay').classList.remove('hidden'); }
function closeSettings() { $('settings-overlay').classList.add('hidden'); }

function switchTab(name) {
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
  $('stab-'+name).classList.add('active');
  $('spane-'+name).classList.add('active');
}

/* ── LEADERBOARD ─────────────────────────────────────────────── */
let currentLBMode = 'bot';
function openLeaderboard() {
  $('leaderboard-overlay').classList.remove('hidden');
  showLB(currentLBMode);
}
function closeLeaderboard() { $('leaderboard-overlay').classList.add('hidden'); }

function showLB(mode) {
  currentLBMode = mode;
  document.querySelectorAll('.lbtab').forEach(t => t.classList.remove('active'));
  $('lbtab-'+mode).classList.add('active');

  const scores = getLBScores(mode);
  const list = $('lb-list');
  if (!scores.length) {
    list.innerHTML = '<p class="lb-empty">No scores yet. Play a round!</p>';
    return;
  }
  list.innerHTML = scores.slice(0,10).map((s,i) => {
    const rankClass = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const date = new Date(s.date).toLocaleDateString();
    return `<div class="lb-entry">
      <span class="lb-rank ${rankClass}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}</span>
      <span style="flex:1;font-size:0.82rem;color:rgba(255,255,255,0.5)">${s.acc}% acc</span>
      <span class="lb-score">${s.score.toLocaleString()}</span>
      <span class="lb-date">${date}</span>
    </div>`;
  }).join('');
}

function getLBScores(mode) {
  try {
    return JSON.parse(localStorage.getItem('aimforge_lb_'+mode) || '[]');
  } catch(e){ return []; }
}
function saveLBScore(mode, score, acc) {
  const scores = getLBScores(mode);
  scores.push({ score, acc, date: Date.now() });
  scores.sort((a,b) => b.score - a.score);
  try {
    localStorage.setItem('aimforge_lb_'+mode, JSON.stringify(scores.slice(0,50)));
  } catch(e){}
}

/* ── GAME FLOW ───────────────────────────────────────────────── */
function startGame(mode) {
  state.mode      = mode;
  state.score     = 0;
  state.hits      = 0;
  state.misses    = 0;
  state.streak    = 0;
  state.bestStreak= 0;
  state.timeLeft  = CONFIG.duration;
  state.running   = false;
  state.paused    = false;
  state.targets   = [];
  state.reactionTimes = [];
  state.lastHitTime   = 0;

  clearArena();
  showScreen('game-screen');
  hudMode.textContent = DIFFICULTIES[mode].label;
  updateHUD();
  updateTimerRing(1);

  // Countdown
  let count = 3;
  showCountdown(count);
  state.countdownTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(state.countdownTimer);
      hideCountdown();
      launchGame();
    } else {
      showCountdown(count);
    }
  }, 1000);
}

function showCountdown(n) {
  let overlay = $('countdown-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'countdown-overlay';
    overlay.innerHTML = '<div id="countdown-number"></div>';
    arena.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  const num = $('countdown-number');
  num.textContent = n === 0 ? 'GO!' : n;
  num.style.animation = 'none';
  requestAnimationFrame(() => { num.style.animation = 'countPop 0.5s ease-out'; });
  playCountdownSound(n);
}
function hideCountdown() {
  const overlay = $('countdown-overlay');
  if (overlay) overlay.style.display = 'none';
}

function launchGame() {
  state.running = true;
  const diff = DIFFICULTIES[state.mode];

  // Spawn loop
  function scheduleSpawn() {
    if (!state.running || state.paused) return;
    spawnTarget();
    const interval = diff.spawnInterval * (0.8 + Math.random()*0.4);
    state.spawnTimer = setTimeout(scheduleSpawn, interval);
  }
  scheduleSpawn();

  // Timer countdown (every second)
  let lastTick = performance.now();
  function tick(now) {
    if (!state.running) return;
    if (!state.paused) {
      const delta = now - lastTick;
      if (delta >= 1000) {
        state.timeLeft = Math.max(0, state.timeLeft - 1);
        lastTick = now;
        updateTimerRing(state.timeLeft / CONFIG.duration);
        hudTimer.textContent = state.timeLeft;
        // danger flash when <10s
        if (state.timeLeft <= 10) {
          timerRingFg.style.stroke = '#ff3c6e';
        }
        if (state.timeLeft <= 0) {
          endGame(); return;
        }
      }
      // FPS counter
      fpsFrames++;
      if (now - fpsLast >= 500) {
        fpsVal = Math.round(fpsFrames / ((now - fpsLast) / 1000));
        fpsFrames = 0; fpsLast = now;
        fpsCounter.textContent = 'FPS: ' + fpsVal;
      }
      // Move targets (pro/hacker)
      if (DIFFICULTIES[state.mode].moveTargets) moveTargets();
    }
    state.animFrame = requestAnimationFrame(tick);
  }
  fpsLast = performance.now();
  state.animFrame = requestAnimationFrame(tick);
}

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  $('pause-overlay').classList.toggle('hidden', !state.paused);
  $('pause-btn').textContent = state.paused ? '▶' : '⏸';
  if (!state.paused) {
    // resume spawn
    const diff = DIFFICULTIES[state.mode];
    clearTimeout(state.spawnTimer);
    (function reschedule() {
      if (!state.running || state.paused) return;
      spawnTarget();
      state.spawnTimer = setTimeout(reschedule, diff.spawnInterval*(0.8+Math.random()*0.4));
    })();
  }
}

function endGame() {
  state.running = false;
  cancelAnimationFrame(state.animFrame);
  clearTimeout(state.spawnTimer);
  clearArena();

  const accuracy = state.hits + state.misses === 0
    ? 0
    : Math.round(state.hits / (state.hits + state.misses) * 100);
  const avgRT = state.reactionTimes.length
    ? Math.round(state.reactionTimes.reduce((a,b)=>a+b,0)/state.reactionTimes.length)
    : 0;

  saveLBScore(state.mode, Math.round(state.score), accuracy);

  const grade = getGrade(accuracy, state.score, state.mode);
  showResults(grade, accuracy, avgRT);
}

function getGrade(acc, score, mode) {
  const mult = DIFFICULTIES[mode].scoreMultiplier;
  const threshold = mult * CONFIG.hitPts * 15;
  if (acc >= 90 && score >= threshold * 1.5) return 'S+';
  if (acc >= 85 && score >= threshold)       return 'S';
  if (acc >= 75 && score >= threshold * 0.7) return 'A';
  if (acc >= 60 && score >= threshold * 0.4) return 'B';
  if (acc >= 45)                             return 'C';
  if (acc >= 30)                             return 'D';
  return 'F';
}

function showResults(grade, accuracy, avgRT) {
  showScreen('results-screen');
  $('results-title').textContent = gradeTitle(grade) + ' — ' + DIFFICULTIES[state.mode].label;
  $('results-grade').textContent = grade;
  $('rs-score').textContent      = Math.round(state.score).toLocaleString();
  $('rs-accuracy').textContent   = accuracy + '%';
  $('rs-hits').textContent       = state.hits;
  $('rs-misses').textContent     = state.misses;
  $('rs-streak').textContent     = state.bestStreak;
  $('rs-avg-rt').textContent     = avgRT + 'ms';

  // animate arc
  const arc = $('results-arc');
  const circumference = 2 * Math.PI * 52;
  arc.style.strokeDasharray  = circumference;
  arc.style.strokeDashoffset = circumference;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      arc.style.transition = 'stroke-dashoffset 1.2s ease-out';
      arc.style.strokeDashoffset = circumference * (1 - accuracy/100);
    });
  });
}

function gradeTitle(g) {
  const map = { 'S+':'Legendary','S':'Elite','A':'Expert','B':'Advanced','C':'Decent','D':'Keep Going','F':'Try Again' };
  return map[g] || 'Complete';
}

function restartGame() { startGame(state.mode); }
function goToMenu() {
  state.running = false;
  cancelAnimationFrame(state.animFrame);
  clearTimeout(state.spawnTimer);
  clearInterval(state.countdownTimer);
  $('pause-overlay').classList.add('hidden');
  clearArena();
  timerRingFg.style.stroke = '';
  showScreen('menu-screen');
}

/* ── TARGET MANAGEMENT ───────────────────────────────────────── */
function spawnTarget() {
  if (!state.running || state.paused) return;
  const diff = DIFFICULTIES[state.mode];
  const maxT = CONFIG.maxTargets !== null
    ? Math.min(CONFIG.maxTargets, diff.maxTargets)
    : diff.maxTargets;
  if (state.targets.length >= maxT) return;

  const radius = rand(diff.minRadius, diff.maxRadius);
  const arenaRect = arena.getBoundingClientRect();
  const pad = radius + 10;
  const x = rand(pad, arenaRect.width  - pad);
  const y = rand(pad, arenaRect.height - pad);
  const lifetime = rand(diff.minLifetime, diff.maxLifetime) * CONFIG.lifetimeMult;

  const el = document.createElement('div');
  el.className = 'target';
  el.dataset.shape = CONFIG.targetShape;

  const size = radius * 2;
  el.style.cssText = `
    width:${size}px; height:${size}px;
    left:${x}px; top:${y}px;
    background: radial-gradient(circle at 35% 35%, ${lighten(CONFIG.targetColor, 40)}, ${CONFIG.targetColor});
    box-shadow: 0 0 ${radius*0.6}px ${CONFIG.targetGlow}, 0 0 ${radius*1.2}px ${CONFIG.targetGlow}44;
    border-radius: ${shapeRadius(CONFIG.targetShape)};
  `;

  const inner = document.createElement('div');
  inner.className = 'target-inner';
  inner.style.background = 'none';

  // inner rings for circle
  if (CONFIG.targetShape === 'circle') {
    inner.style.background = 'none';
    inner.style.border      = `2px solid rgba(255,255,255,0.25)`;
  }

  el.appendChild(inner);

  // Decay ring via conic-gradient border
  const decayEl = document.createElement('div');
  decayEl.className = 'target-decay';
  decayEl.style.animationDuration = lifetime + 'ms';
  el.appendChild(decayEl);

  // velocity for moving targets
  let vx = 0, vy = 0;
  if (diff.moveTargets) {
    const angle = Math.random() * Math.PI * 2;
    vx = Math.cos(angle) * diff.moveSpeed;
    vy = Math.sin(angle) * diff.moveSpeed;
  }

  const id = Date.now() + Math.random();
  const target = { id, el, x, y, radius, vx, vy, spawnTime: performance.now() };
  state.targets.push(target);
  arena.appendChild(el);

  el.addEventListener('click', e => { e.stopPropagation(); hitTarget(id, e); });

  // auto-expire
  target.expireTimer = setTimeout(() => expireTarget(id), lifetime);
}

function shapeRadius(shape) {
  if (shape === 'circle')  return '50%';
  if (shape === 'square')  return '6px';
  if (shape === 'diamond') return '4px';
  if (shape === 'cross')   return '2px';
  return '50%';
}

function hitTarget(id, e) {
  if (!state.running || state.paused) return;
  const idx = state.targets.findIndex(t => t.id === id);
  if (idx === -1) return;
  const target = state.targets[idx];
  clearTimeout(target.expireTimer);

  // reaction time
  const rt = performance.now() - target.spawnTime;
  state.reactionTimes.push(rt);

  // scoring
  const diff  = DIFFICULTIES[state.mode];
  state.streak++;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;

  const streakBonus = state.streak >= 3
    ? Math.pow(CONFIG.streakMult, Math.min(state.streak-2, 5))
    : 1;
  const pts = Math.round(CONFIG.hitPts * diff.scoreMultiplier * streakBonus);
  state.score += pts;
  state.hits++;

  playHitSound();
  spawnHitParticles(e.clientX - arena.getBoundingClientRect().left, e.clientY - arena.getBoundingClientRect().top);
  showScorePopup(e.clientX - arena.getBoundingClientRect().left, e.clientY - arena.getBoundingClientRect().top, '+'+pts, CONFIG.hitColor);

  if (state.streak >= 3) showStreakBadge(state.streak);

  // remove
  removeTarget(idx, true);
  updateHUD();
  spawnTarget(); // immediately spawn a new one
}

function expireTarget(id) {
  const idx = state.targets.findIndex(t => t.id === id);
  if (idx === -1) return;
  removeTarget(idx, false);
}

function removeTarget(idx, hit) {
  const target = state.targets[idx];
  target.el.classList.add('dying');
  setTimeout(() => target.el.remove(), 150);
  state.targets.splice(idx, 1);
}

function missShot(e) {
  if (!state.running || state.paused) return;
  const arenaRect = arena.getBoundingClientRect();
  const mx = e.clientX - arenaRect.left;
  const my = e.clientY - arenaRect.top;
  state.misses++;
  state.streak = 0;
  state.score  = Math.max(0, state.score - CONFIG.missPts);
  streakBadge.style.display = 'none';

  playMissSound();
  spawnMissRipple(mx, my);
  showScorePopup(mx, my, '-'+CONFIG.missPts, '#ff3c6e');

  if (CONFIG.missShake) {
    arena.classList.remove('shake');
    requestAnimationFrame(() => arena.classList.add('shake'));
    setTimeout(() => arena.classList.remove('shake'), 260);
  }
  updateHUD();
}

function clearArena() {
  state.targets.forEach(t => { clearTimeout(t.expireTimer); t.el.remove(); });
  state.targets = [];
}

function moveTargets() {
  const arenaRect = arena.getBoundingClientRect();
  state.targets.forEach(t => {
    t.x += t.vx;
    t.y += t.vy;
    // bounce
    if (t.x - t.radius < 0)              { t.x = t.radius;                  t.vx *= -1; }
    if (t.x + t.radius > arenaRect.width){ t.x = arenaRect.width - t.radius; t.vx *= -1; }
    if (t.y - t.radius < 0)              { t.y = t.radius;                  t.vy *= -1; }
    if (t.y + t.radius > arenaRect.height){ t.y = arenaRect.height - t.radius; t.vy *= -1; }
    t.el.style.left = t.x + 'px';
    t.el.style.top  = t.y + 'px';
  });
}

/* ── HUD UPDATES ─────────────────────────────────────────────── */
function updateHUD() {
  hudScore.textContent    = Math.round(state.score).toLocaleString();
  hudHits.textContent     = state.hits;
  hudMisses.textContent   = state.misses;
  const total = state.hits + state.misses;
  hudAccuracy.textContent = total ? Math.round(state.hits/total*100) + '%' : '100%';
}
function updateTimerRing(frac) {
  const circ = 213.6;
  timerRingFg.style.strokeDashoffset = circ * (1 - frac);
}

/* ── PARTICLES & POPUPS ──────────────────────────────────────── */
function spawnHitParticles(x, y) {
  if (!CONFIG.particles) return;
  const count = 8;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'hit-particle';
    const angle = (i / count) * Math.PI * 2 + Math.random()*0.4;
    const dist  = 30 + Math.random() * 40;
    const dx    = Math.cos(angle) * dist;
    const dy    = Math.sin(angle) * dist;
    p.style.cssText = `
      left:${x}px; top:${y}px;
      width:${3+Math.random()*4}px; height:${3+Math.random()*4}px;
      background: ${CONFIG.hitColor};
      box-shadow: 0 0 6px ${CONFIG.hitColor};
      --dx: ${dx}px; --dy: ${dy}px;
      animation-duration: ${0.4+Math.random()*0.3}s;
    `;
    arena.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}

function spawnMissRipple(x, y) {
  const r = document.createElement('div');
  r.className = 'miss-ripple';
  r.style.left = x + 'px';
  r.style.top  = y + 'px';
  arena.appendChild(r);
  setTimeout(() => r.remove(), 450);
}

function showScorePopup(x, y, text, color) {
  const p = document.createElement('div');
  p.className = 'score-popup';
  p.style.cssText = `left:${x}px; top:${(y-20)}px; color:${color};`;
  p.textContent = text;
  arena.appendChild(p);
  setTimeout(() => p.remove(), 750);
}

function showStreakBadge(n) {
  streakBadge.textContent = `🔥 ${n}× STREAK`;
  streakBadge.style.display = 'block';
  streakBadge.style.animation = 'none';
  requestAnimationFrame(() => { streakBadge.style.animation = 'streakPop 0.3s ease-out'; });
  clearTimeout(streakBadge._t);
  streakBadge._t = setTimeout(() => { streakBadge.style.display = 'none'; }, 1200);
}

/* ── UTILITIES ───────────────────────────────────────────────── */
function rand(min, max) { return min + Math.random() * (max - min); }

function lighten(hex, amt) {
  const num = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, (num >> 16) + amt);
  const g = Math.min(255, ((num >> 8) & 0xff) + amt);
  const b = Math.min(255, (num & 0xff) + amt);
  return '#' + ((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
}

/* ── KEYBOARD SHORTCUTS ──────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('settings-overlay').classList.contains('hidden')) { closeSettings(); return; }
    if (!$('leaderboard-overlay').classList.contains('hidden')) { closeLeaderboard(); return; }
    if (!$('pause-overlay').classList.contains('hidden')) { togglePause(); return; }
    if (state.running) togglePause();
  }
  if (e.key === 'p' || e.key === 'P') { if (state.running) togglePause(); }
});

/* close overlays clicking backdrop */
document.querySelectorAll('.overlay').forEach(ov => {
  ov.addEventListener('click', e => {
    if (e.target === ov) {
      ov.classList.add('hidden');
      if (ov.id === 'settings-overlay') saveSettings();
    }
  });
});

/* ── INIT ────────────────────────────────────────────────────── */
(function init() {
  loadSettings();
  updateCrosshair();
  showScreen('menu-screen');
})();
