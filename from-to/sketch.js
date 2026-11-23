// ===== BELOW II – watercolor – Missing Migrants 2014–2024 – p5.js =====
// The whole page is paper. At sea, each incident is a small boat with a light
// crossing from one side; where it was lost it goes down and the paper gets wet:
// blue blooms, and drips that fall like weight. The dead leave pigment at the bottom,
// the missing leave a faint stain where the trace stops.
// On land, abstract figures walk; where they died they sink into the sand and leave sediment.
// Data: IOM Missing Migrants Project (minimum figures). Needs routes.json.

// ---------- PARAMETERS ----------
let DAYS_PER_SEC = 12;          // speed of time (slider)
let WET = 1;                    // how wet the paper is: bloom size and drip length (slider)
const SURFACE = 0.4;            // waterline / ground line (share of screen)
const FLOOR = 0.93;
const MARGIN = 0.07;
const BOAT_SPEED = 85;          // px/s
const WALK_SPEED = 55;          // px/s
const MAX_FIGURES = 30;
const LIGHT_ON = 0.2;           // 1 boat in 5 has its light on, 4 sail dark
const MIN_BOAT = 3;             // smaller incidents are only dots, no boat         // figures drawn per incident (the rest still counts and still leaves sediment)
const COL_W = 4;

const STYLE = {
  sea: {
    pigments: ['#0c223b', '#12304f', '#1a4266', '#2f5d85'], ink: [12, 30, 52], wash: '#3d6a91',
    deposit: '#0c223b', trace: '#2f5d85', light: [246, 190, 80],
    dot: [12, 34, 59], survivor: [70, 110, 150],
  },
  land: {
    pigments: ['#5e3a1e', '#7a4b26', '#8f5d33', '#a8825a'], ink: [52, 33, 18], wash: '#9c7650',
    deposit: '#4a2c14', trace: '#8f5d33', light: [255, 236, 200], dot: [52, 33, 18],
  },
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FONT = '"Josefin Sans", system-ui, sans-serif';

// ---------- NIGHT AND DAY (an oscillator over the whole page) ----------
const NIGHT_SEC = 3, DAWN_SEC = 1, DAY_SEC = 3, DUSK_SEC = 1;   // one cycle = 8 s
const NIGHT_DARK = 0.93, DAY_DARK = 0.42;                       // how dark: night is almost black, day stays dim
const NIGHT_TINT = { sea: [4, 10, 20], land: [14, 9, 5] };
function darkness(T) {
  const C = NIGHT_SEC + DAWN_SEC + DAY_SEC + DUSK_SEC, t = T % C;
  let k;                                                         // 1 = night, 0 = day
  if (t < NIGHT_SEC) k = 1;
  else if (t < NIGHT_SEC + DAWN_SEC) k = 1 - (t - NIGHT_SEC) / DAWN_SEC;
  else if (t < NIGHT_SEC + DAWN_SEC + DAY_SEC) k = 0;
  else k = (t - NIGHT_SEC - DAWN_SEC - DAY_SEC) / DUSK_SEC;
  k = k * k * (3 - 2 * k);
  return { k, a: DAY_DARK + (NIGHT_DARK - DAY_DARK) * k };
}

// ---------- STATE ----------
let DATA = null, region = null, S = null, regionIndex = 0;
let paper, wash, day = 0, nextInc = 0, paused = false;
let boats = [], walkers = [], drips = [], lights = [], blooms = [], dots = [], bed = [], inc = 1;
let counts = { dead: 0, missing: 0, children: 0, survivors: 0 };
const D0 = new Date('2014-01-01T00:00:00');
const TOTAL_DAYS = 4017;

function setup() {
  createCanvas(windowWidth, windowHeight).parent('stage');
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  loadJSON('routes.json', (d) => { DATA = d; buildUI(); startRegion(DATA.presets.sea.Centre); });
}
function windowResized() { resizeCanvas(windowWidth, windowHeight); if (DATA) startRegion(regionIndex); }

const xOf = (t) => width * MARGIN + t * width * (1 - 2 * MARGIN);
const surfaceY = () => height * SURFACE;
const floorY = () => height * FLOOR;
const isSea = () => region.medium === 'sea';

// ---------- PAPER ----------
const PAPER = { sea: '#c9d2d8', land: '#bf9c74' };   // blue-grey paper for the sea, brown paper for land
function makePaper() {
  paper = createGraphics(width, height);
  const g = paper.drawingContext;
  g.fillStyle = PAPER[isSea() ? 'sea' : 'land']; g.fillRect(0, 0, width, height);
  randomSeed(3);
  for (let i = 0; i < width * height / 60; i++) {          // grain
    const v = random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${random(0.015, 0.05)})`;
    g.fillRect(random(width), random(height), random(0.6, 1.6), random(0.6, 1.6));
  }
  g.strokeStyle = 'rgba(120,100,80,0.05)'; g.lineWidth = 0.6;   // fibres
  for (let i = 0; i < 260; i++) {
    const x = random(width), y = random(height), a = random(TWO_PI), l = random(6, 26);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l / 2 + random(-3, 3), y + Math.sin(a) * l / 2 + random(-3, 3), x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const v = g.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(90,70,40,0.12)');
  g.fillStyle = v; g.fillRect(0, 0, width, height);
  randomSeed(millis());
}

// ---------- WATERCOLOUR (layered deformed polygons) ----------
function deform(pts, depth, v) {
  for (let d = 0; d < depth; d++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      out.push(a, [(a[0] + b[0]) / 2 + randomGaussian(0, len * v), (a[1] + b[1]) / 2 + randomGaussian(0, len * v)]);
    }
    pts = out;
  }
  return pts;
}
function bloomShape(x, y, rx, ry) {
  const n = 9, base = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TWO_PI; base.push([x + Math.cos(a) * rx * random(0.8, 1.2), y + Math.sin(a) * ry * random(0.8, 1.2)]); }
  return deform(base, 3, 0.32);
}
// a bloom is painted over a few frames, a few thin layers each frame
function queueBloom(x, y, rx, ry, color, layers, alpha) {
  blooms.push({ base: bloomShape(x, y, rx, ry), color, layers, alpha, done: 0 });
}
function paintBlooms() {
  const g = wash.drawingContext;
  let budget = 60;
  while (blooms.length && budget > 0) {
    const b = blooms[0];
    const c = color(b.color);
    g.fillStyle = `rgba(${red(c)},${green(c)},${blue(c)},${b.alpha})`;
    const p = deform(b.base, 2, 0.28);
    g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (const q of p) g.lineTo(q[0], q[1]); g.closePath(); g.fill();
    b.done++; budget--;
    if (b.done >= b.layers) blooms.shift();
  }
}

// ---------- REGION ----------
function startRegion(i) {
  regionIndex = i;
  region = DATA.regions[i];
  S = STYLE[isSea() ? 'sea' : 'land'];
  document.body.className = isSea() ? 'sea' : 'land';
  day = 0; nextInc = 0; paused = false;
  boats = []; walkers = []; drips = []; lights = []; blooms = []; dots = [];
  counts = { dead: 0, missing: 0, children: 0, survivors: 0 };
  makePaper();
  wash = createGraphics(width, height);
  // the body of water / sand: a few broad washes, nothing drawn as a map
  for (let k = 0; k < 5; k++) {
    const y = surfaceY() + (floorY() - surfaceY()) * random(0.15, 0.9);
    queueBloom(width / 2, y, width * random(0.45, 0.7), (floorY() - surfaceY()) * random(0.2, 0.45), S.wash, 18, 0.025);
  }
  queueBloom(width / 2, surfaceY() + 6, width * 0.62, 10, S.pigments[3], 14, 0.035);
  bed = new Array(Math.ceil(width / COL_W) + 2).fill(0);
  const hist = new Array(bed.length).fill(0);
  region.inc.forEach((r) => { const c = Math.floor(xOf(r[1]) / COL_W); hist[c] = (hist[c] || 0) + (r[2] - r[3]); });
  const smooth = hist.map((_, c) => { let s = 0; for (let k = -5; k <= 5; k++) s += hist[c + k] || 0; return s / 11; });
  inc = Math.min(4, ((floorY() - surfaceY()) * 0.35) / Math.max(1, Math.max(...smooth)));
  document.querySelectorAll('[data-route]').forEach((b) => b.classList.toggle('on', +b.dataset.route === i));
  $('from').value = region.from; fillTo(); $('to').value = String(i); showCount();
  $('play').textContent = '⏸';
  updateHud(true);
}

function spawnIncident(r) {
  const [, t, total, missing, children, survivors] = r;
  counts.dead += total - missing; counts.missing += missing; counts.children += children; counts.survivors += survivors;
  const tx = xOf(t) + randomGaussian(0, width * 0.01);
  if (isSea()) {
    const n = total + survivors, size = 5 + Math.sqrt(n) * 1.6;
    const b = { x: xOf(0) - random(10, 40), tx, size, n, hasBoat: n >= MIN_BOAT, light: random() < LIGHT_ON,
      state: 'sail', tilt: 0, sink: 0, life: 1, phase: random(TWO_PI), hull: [], people: [] };
    // a soft hull: a few deformed half-ellipses, painted as watercolour fill
    for (let L = 0; L < 4; L++) {
      const base = [];
      for (let i = 0; i <= 8; i++) { const a = (i / 8) * PI; base.push([Math.cos(a) * size * 1.25, Math.sin(a) * size * 0.42]); }
      base.push([-size * 1.3, -size * 0.06], [size * 1.3, -size * 0.06]);
      b.hull.push(deform(base, 2, 0.12));
    }
    // every person is a dot on the boat
    for (let k = 0; k < n; k++) {
      const kind = k < total - missing ? 'dead' : k < total ? 'missing' : 'survivor';
      b.people.push({ kind, child: k < children, ox: random(-1, 1) * size * 1.05, oy: -random(0.5, 1) * Math.min(size * 0.5, 4 + Math.sqrt(n) * 0.5) });
    }
    boats.push(b);
  } else {
    const n = total + survivors, shown = Math.min(n, MAX_FIGURES + Math.min(survivors, 8));
    for (let k = 0; k < shown; k++) {
      const kind = k < Math.min(total - missing, MAX_FIGURES) ? 'dead' : k < Math.min(total, MAX_FIGURES) ? 'missing' : 'survivor';
      walkers.push({ kind, x: xOf(0) - k * 9 - random(4), tx: tx + random(-10, 10), y: surfaceY() - 1, state: 'walk', depth: 0, life: 1,
        phase: random(TWO_PI), h: (k < children ? 0.7 : 1) * random(0.9, 1.1), stopAt: random(0.25, 0.8),
        weight: k === 0 ? Math.max(1, (total - missing) - MAX_FIGURES + 1) : 1 });
    }
  }
}

// ---------- LOOP ----------
function draw() {
  if (!region) return;
  const dt = Math.min(0.05, deltaTime / 1000), T = millis() / 1000;
  if (!paused) {
    day += DAYS_PER_SEC * dt;
    while (nextInc < region.inc.length && region.inc[nextInc][0] <= day) spawnIncident(region.inc[nextInc++]);
    stepDrips(dt);
  }
  paintBlooms();

  image(paper, 0, 0);
  blendMode(MULTIPLY); image(wash, 0, 0); blendMode(BLEND);

  if (isSea()) {
    if (!paused) { boats.forEach((b) => stepBoat(b, dt, T)); stepDots(dt, T); }
    boats = boats.filter((b) => !b.gone); boats.forEach((b) => drawBoat(b, T)); drawDots();
  }
  else { if (!paused) walkers.forEach((w) => stepWalker(w, dt)); walkers = walkers.filter((w) => !w.gone); walkers.forEach((w) => drawWalker(w, T)); }
  if (!paused) lights.forEach((l) => { l.x += l.vx * dt; l.life -= dt * 0.35; });
  lights = lights.filter((l) => l.life > 0);

  // night falls over everything; only the lights stay
  const D = darkness(T), tint = NIGHT_TINT[isSea() ? 'sea' : 'land'];
  noStroke(); fill(tint[0], tint[1], tint[2], 255 * D.a); rect(0, 0, width, height);
  if (isSea()) {
    // the light on a boat grows with the number of people on it
    boats.forEach((b) => { if (b.light && b.state === 'sail') glow(b.x, surfaceY() + Math.sin(T * 1.6 + b.phase) * 2.5 - 6, 2 + Math.sqrt(b.n) * 0.7, S.light, 0.55 + 0.45 * D.k); });
  } else {
    // at night every walker carries a small light, a dot
    const g = drawingContext;
    g.fillStyle = `rgba(${S.light[0]},${S.light[1]},${S.light[2]},${0.85 * D.k})`;
    g.beginPath();
    walkers.forEach((w) => { if (w.state !== 'sink') { const x = w.x + Math.sin(T * 6 + w.phase) * 1.6, y = surfaceY() - 17 * w.h - 2; g.moveTo(x + 1.3, y); g.arc(x, y, 1.3, 0, TWO_PI); } });
    g.fill();
  }

  // shores: just words
  noStroke(); fill(225, 232, 236, 150); textFont(FONT); textSize(13); textAlign(CENTER, BOTTOM);
  text(region.from, xOf(0), surfaceY() - 34);
  text(region.to, xOf(1), surfaceY() - 34);

  const date = new Date(D0.getTime() + Math.min(day, TOTAL_DAYS) * 864e5);
  updateHud(false, date);
  const busy = boats.length || walkers.length || drips.length || lights.length || dots.length;
  if (day > TOTAL_DAYS && !busy && !paused) { paused = true; $('play').textContent = '↺'; }
}

// ---------- SEA: boats ----------
function stepBoat(b, dt, T) {
  if (b.state === 'sail') {
    b.x += BOAT_SPEED * dt;
    if (b.x >= b.tx) { b.state = 'sinking'; b.light = false; wetPaper(b, T); }
  } else {
    b.tilt = Math.min(0.9, b.tilt + dt * 0.5);
    b.sink += dt * 18;
    b.life -= dt * 0.45;
    if (b.life <= 0) b.gone = true;
  }
}

function wetPaper(b, T) {
  const lost = b.people.filter((p) => p.kind !== 'survivor').length, sz = (6 + Math.sqrt(lost) * 3.2) * WET;
  // the paper gets wet where it went down
  if (lost) queueBloom(b.x, surfaceY() + sz * 0.25, sz, sz * 0.45, S.pigments[floor(random(3))], 8, 0.05);
  const y0 = surfaceY() + Math.sin(T * 1.6 + b.phase) * 2.5;
  for (const p of b.people) {
    dots.push({ kind: p.kind, child: p.child, x: b.x + p.ox, y: y0 + p.oy, px: b.x + p.ox, py: y0 + p.oy,
      vy: random(2, 8), vx: random(55, 90), life: 1, seed: random(1000), delay: random(0, 0.6),
      stopAt: surfaceY() + (floorY() - surfaceY()) * random(0.25, 0.8) });
  }
}

// dots after the boat is lost: the dead fall to the bottom, the missing fade in the depth, survivors go on
function stepDots(dt, T) {
  const g = wash.drawingContext;
  for (const d of dots) {
    if (d.delay > 0) { d.delay -= dt; continue; }
    d.px = d.x; d.py = d.y;
    if (d.kind === 'survivor') { d.x += d.vx * dt; d.y += Math.sin(T * 2 + d.seed) * 0.15; d.life -= dt * 0.3; if (d.life <= 0 || d.x > width) d.done = true; continue; }
    const heavy = d.kind === 'dead';
    d.vy = Math.min(d.vy + (heavy ? 26 : 10) * dt, heavy ? 58 : 22);
    d.y += d.vy * dt;
    d.x += (noise(d.seed, T * 0.35, d.y * 0.004) - 0.5) * (heavy ? 1 : 2.4) * dt * 60 * WET;
    // a faint wet trail on the paper
    const c = color(heavy ? S.pigments[1] : S.trace);
    g.strokeStyle = `rgba(${red(c)},${green(c)},${blue(c)},${heavy ? 0.05 : 0.035})`;
    g.lineWidth = (d.child ? 1.2 : 1.8) * WET; g.lineCap = 'round';
    g.beginPath(); g.moveTo(d.px, d.py); g.lineTo(d.x, d.y); g.stroke();
    if (heavy) {
      const col = Math.max(0, Math.min(bed.length - 1, Math.floor(d.x / COL_W)));
      if (d.y >= floorY() - bed[col]) {
        g.fillStyle = `rgba(${S.dot[0]},${S.dot[1]},${S.dot[2]},0.55)`;
        g.beginPath(); g.arc(d.x, floorY() - bed[col], d.child ? 1.2 : 1.7, 0, TWO_PI); g.fill();
        const share = [0.1, 0.2, 0.4, 0.2, 0.1], cap = (floorY() - surfaceY()) * 0.45;
        for (let k = -2; k <= 2; k++) if (bed[col + k] !== undefined) bed[col + k] = Math.min(cap, bed[col + k] + inc * share[k + 2]);
        if (random() < 0.08) queueBloom(d.x, floorY() - bed[col], 6 * WET, 3 * WET, S.deposit, 3, 0.08);
        d.done = true;
      }
    } else if (d.y >= d.stopAt) {
      d.life -= dt * 0.6;
      if (d.life <= 0) { g.fillStyle = `rgba(${red(c)},${green(c)},${blue(c)},0.22)`; g.beginPath(); g.arc(d.x, d.y, 1.8, 0, TWO_PI); g.fill(); d.done = true; }
    }
  }
  dots = dots.filter((d) => !d.done);
}

function drawDots() {
  const g = drawingContext, groups = new Map();
  for (const d of dots) {
    if (d.delay > 0 && d.kind !== 'survivor') { /* still on the sinking boat */ }
    const c = d.kind === 'survivor' ? S.survivor : S.dot;
    const a = Math.round((d.kind === 'survivor' ? 0.55 : d.kind === 'dead' ? 0.85 : 0.65) * Math.max(0, d.life) * 10) / 10;
    if (a <= 0) continue;
    const key = c.join() + a;
    if (!groups.has(key)) groups.set(key, { style: `rgba(${c[0]},${c[1]},${c[2]},${a})`, p: [] });
    groups.get(key).p.push(d.x, d.y, d.child ? 1.1 : 1.6);
  }
  groups.forEach((gr) => { g.fillStyle = gr.style; g.beginPath(); for (let k = 0; k < gr.p.length; k += 3) { g.moveTo(gr.p[k] + gr.p[k + 2], gr.p[k + 1]); g.arc(gr.p[k], gr.p[k + 1], gr.p[k + 2], 0, TWO_PI); } g.fill(); });
}

function newDrip(x, kind, weight) {
  const sea = isSea();
  return { x: x + randomGaussian(0, 6 * WET), y: surfaceY() + random(4, 14), vy: random(18, 32) * (sea ? 1 : 0.6), kind, weight,
    w: random(1.6, 3.4) * WET, stopAt: kind === 'missing' ? surfaceY() + (floorY() - surfaceY()) * random(0.25, 0.8) : Infinity, sway: random(TWO_PI) };
}

function stepDrips(dt) {
  const g = wash.drawingContext;
  for (const d of drips) {
    const c = color(d.kind === 'dead' ? S.pigments[0] : S.trace);
    d.vy = Math.min(d.vy + 22 * dt, isSea() ? 70 : 30);
    const ny = d.y + d.vy * dt;
    const nx = d.x + Math.sin(d.y * 0.03 + d.sway) * 0.25;
    g.strokeStyle = `rgba(${red(c)},${green(c)},${blue(c)},${d.kind === 'dead' ? 0.1 : 0.06})`;
    g.lineWidth = d.w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(nx, ny); g.stroke();
    d.x = nx; d.y = ny; d.w *= 0.997;
    const col = Math.max(0, Math.min(bed.length - 1, Math.floor(d.x / COL_W)));
    if (d.kind === 'dead' && d.y >= floorY() - bed[col]) { deposit(d.x, col, d.weight); d.done = true; }
    if (d.kind === 'missing' && d.y >= d.stopAt) { queueBloom(d.x, d.y, 5 * WET, 4 * WET, S.trace, 3, 0.07); d.done = true; }
  }
  drips = drips.filter((d) => !d.done);
}

// the dead leave pigment at the bottom; it piles up like sediment
function deposit(x, col, weight) {
  const r = Math.min(10, 2.5 + Math.sqrt(weight) * 1.2);
  queueBloom(x, floorY() - bed[col] - r * 0.3, r * 1.4, r * 0.7, S.deposit, 4, 0.1);
  const share = [0.1, 0.2, 0.4, 0.2, 0.1], cap = (floorY() - surfaceY()) * 0.45;
  for (let k = -2; k <= 2; k++) if (bed[col + k] !== undefined) bed[col + k] = Math.min(cap, bed[col + k] + inc * weight * share[k + 2]);
}

function drawBoat(b, T) {
  const y = surfaceY() + Math.sin(T * 1.6 + b.phase) * 2.5 + b.sink;
  const g = drawingContext, a = Math.max(0, b.life);
  g.save(); g.translate(b.x, y); g.rotate(b.tilt + Math.sin(T * 1.6 + b.phase) * 0.04);
  if (b.state === 'sail') {
    // the people: one dot each
    g.fillStyle = `rgba(${S.dot[0]},${S.dot[1]},${S.dot[2]},0.85)`;
    g.beginPath();
    for (const p of b.people) { const r = p.child ? 1.1 : 1.6; g.moveTo(p.ox + r, p.oy); g.arc(p.ox, p.oy, r, 0, TWO_PI); }
    g.fill();
  }
  if (b.hasBoat) {
    // the hull: watercolour fill, no outline
    g.fillStyle = `rgba(${S.ink[0]},${S.ink[1]},${S.ink[2]},${0.2 * a})`;
    for (const h of b.hull) { g.beginPath(); g.moveTo(h[0][0], h[0][1]); for (const q of h) g.lineTo(q[0], q[1]); g.closePath(); g.fill(); }
  }
  g.restore();
}

function glow(x, y, r, c, a) {
  const g = drawingContext;
  const grd = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
  grd.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`);
  grd.addColorStop(0.25, `rgba(${c[0]},${c[1]},${c[2]},${0.45 * a})`);
  grd.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 2.4, 0, TWO_PI); g.fill();
}

// ---------- LAND: walking figures ----------
function stepWalker(w, dt) {
  if (w.state === 'walk') {
    const target = w.kind === 'survivor' ? xOf(1) + 40 : w.tx;
    w.x += WALK_SPEED * dt;
    if (w.x >= target) {
      if (w.kind === 'survivor') w.state = 'leave';
      else { w.state = 'sink'; if (w.kind === 'dead') queueBloom(w.x, surfaceY() + 4, 7 * WET, 3 * WET, S.pigments[1], 3, 0.07); }
    }
  } else if (w.state === 'leave') {
    w.x += WALK_SPEED * dt; w.life -= dt * 0.5; if (w.life <= 0) w.gone = true;
  } else {
    // into the sand: slow, heavy; the dead go to the bottom, the missing stop and dissolve
    w.depth += dt * (w.kind === 'dead' ? 26 : 16);
    const y = surfaceY() + w.depth;
    const col = Math.max(0, Math.min(bed.length - 1, Math.floor(w.x / COL_W)));
    if (w.kind === 'dead' && y >= floorY() - bed[col]) { deposit(w.x, col, w.weight); w.gone = true; }
    if (w.kind === 'missing' && w.depth >= (floorY() - surfaceY()) * w.stopAt) { queueBloom(w.x, y, 6 * WET, 4 * WET, S.trace, 3, 0.07); w.gone = true; }
  }
}

// a person on land: one thin watercolour brush line; once they die or are lost, a dot
function drawWalker(w, T) {
  const g = drawingContext, c = S.ink;
  if (w.state === 'sink') {
    const y = surfaceY() + w.depth;
    const a = 0.85 * Math.max(0.25, 1 - w.depth / (floorY() - surfaceY()));
    g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    g.beginPath(); g.arc(w.x, y, w.h < 1 ? 1.4 : 2, 0, TWO_PI); g.fill();
    return;
  }
  const h = 17 * w.h, y = surfaceY();
  const lean = Math.sin(T * 6 + w.phase) * 1.6;           // the walk: the line sways
  const a = Math.max(0, w.life);
  if (!w.j) w.j = Array.from({ length: 6 }, () => [randomGaussian(0, 0.7), randomGaussian(0, 1.1), random(0.7, 1.05)]);
  g.lineCap = 'round';
  // a little pigment pooling where the brush touched the ground
  g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.12 * a})`;
  g.beginPath(); g.ellipse(w.x, y - 0.5, 2.6, 1.1, 0, 0, TWO_PI); g.fill();
  // six wet passes, each a slightly different path and width: the edges bleed
  w.j.forEach(([ox, cx, len], k) => {
    const wide = k < 2;
    g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(wide ? 0.07 : 0.2) * a})`;
    g.lineWidth = wide ? 4.2 : 1.6 - k * 0.15;
    g.beginPath();
    g.moveTo(w.x + ox * 0.5, y);
    g.quadraticCurveTo(w.x + lean * 0.4 + cx, y - h * 0.5, w.x + lean + ox, y - h * len);
    g.stroke();
  });
  // a darker drop where the stroke ends, like a brush lifted off wet paper
  g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.3 * a})`;
  g.beginPath(); g.arc(w.x + lean, y - h * w.j[2][2], 1.1, 0, TWO_PI); g.fill();
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');
let hudKey = '';
function updateHud(force, date) {
  if (!region) return;
  date = date || D0;
  const key = [regionIndex, date.getMonth(), date.getFullYear(), counts.dead, counts.missing, counts.survivors].join();
  if (!force && key === hudKey) return; hudKey = key;
  $('route').textContent = region.name;
  $('year').textContent = date.getFullYear();
  $('month').textContent = MONTHS[date.getMonth()];
  $('c-dead').textContent = fmt(counts.dead);
  $('c-missing').textContent = fmt(counts.missing);
  $('c-children').textContent = fmt(counts.children);
  $('c-surv').textContent = fmt(counts.survivors);
}

function buildUI() {
  [['sea', 'Sea'], ['land', 'Land']].forEach(([m, label]) => {
    const row = $('presets-' + m);
    const t = document.createElement('span'); t.className = 'grp'; t.textContent = label; row.appendChild(t);
    Object.entries(DATA.presets[m]).forEach(([dir, idx]) => {
      const b = document.createElement('button');
      b.textContent = dir; b.dataset.route = idx; b.title = DATA.regions[idx].from + ' → ' + DATA.regions[idx].to;
      b.onclick = () => startRegion(idx);
      row.appendChild(b);
    });
  });
  [...new Set(DATA.regions.map((r) => r.from))].sort().forEach((o) => $('from').appendChild(new Option(o, o)));
  $('from').onchange = fillTo;
  $('to').onchange = showCount;
  $('fromto-btn').onclick = () => { $('fromto').hidden = !$('fromto').hidden; };
  $('go').onclick = () => { startRegion(+$('to').value); $('fromto').hidden = true; };
  $('play').onclick = () => {
    const busy = boats.length || walkers.length || drips.length || dots.length;
    if (day > TOTAL_DAYS && !busy) { startRegion(regionIndex); return; }
    paused = !paused; $('play').textContent = paused ? '▶' : '⏸';
  };
  $('speed').oninput = (e) => { DAYS_PER_SEC = +e.target.value; $('speedv').textContent = (Math.round(TOTAL_DAYS / DAYS_PER_SEC / 6) / 10) + ' min'; };
  $('wet').oninput = (e) => { WET = +e.target.value; };
  $('toggle').onclick = () => { const h = ($('panel').hidden = !$('panel').hidden); $('controls').hidden = h; $('toggle').textContent = h ? '◐' : '●'; };
  $('speed').oninput({ target: $('speed') });
}

function fillTo() {
  const sel = $('to'), from = $('from').value;
  sel.replaceChildren();
  DATA.regions.forEach((r, i) => { if (r.from === from) sel.appendChild(new Option(r.to, String(i))); });
  showCount();
}
function showCount() {
  const r = DATA.regions[+$('to').value];
  $('ft-count').textContent = r ? r.total.toLocaleString('en-US') : '';
}
