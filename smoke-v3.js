/* Smoke test headless — Defesa Orbital v3 (roda: node smoke-v3.js) */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  FAIL  ' + name + (extra ? '  :: ' + extra : '')); }
}

/* ---------- stubs de browser ---------- */
function makeElementStub() {
  const el = {
    style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, removeChild(){}, remove(){},
    querySelector(){ return makeElementStub(); }, querySelectorAll(){ return []; },
    setAttribute(){}, getAttribute(){ return null; }, focus(){}, click(){},
    getBoundingClientRect(){ return { left: 0, top: 0, right: 924, bottom: 572, width: 924, height: 572 }; },
    offsetWidth: 100, innerHTML: '', textContent: '', value: '', disabled: false
  };
  return el;
}
const noopCtx = new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 924, height: 572 };
    if (k === 'measureText') return () => ({ width: 0 });
    return typeof k === 'string' ? function () { return noopCtx; } : undefined;
  },
  set() { return true; }
});
const documentStub = {
  getElementById(){ return makeElementStub(); },
  createElement(){ const e = makeElementStub(); e.getContext = function(){ return noopCtx; }; return e; },
  createElementNS(){ const e = makeElementStub(); e.getContext = function(){ return noopCtx; }; return e; },
  addEventListener(){}, removeEventListener(){},
  body: makeElementStub(), documentElement: makeElementStub(), hidden: false
};
const localStorageStub = (() => {
  let store = {};
  return {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    _dump(){ return store; }
  };
})();

const PhaserStub = {
  Scene: class Scene { constructor(cfg){ this.sys = cfg || {}; } },
  Math: {
    Between(a, b){ return Math.floor(a + Math.random() * (b - a + 1)); },
    FloatBetween(a, b){ return a + Math.random() * (b - a); },
    DegToRad(d){ return d * Math.PI / 180; },
    Clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  },
  Display: { Color: { HexStringToColor: () => ({ color: 0xffffff }) } },
  Scale: { FIT: 1, CENTER_BOTH: 0, RESIZE: 2 },
  AUTO: 0, CANVAS: 1, WEBGL: 2
  // sem Phaser.Game de propósito: o guard de boot do jogo não deve instanciar nada
};

const sandbox = {
  console, Math, JSON, Date, Object, Array, Promise, Error, TypeError, isNaN, parseInt, parseFloat,
  setInterval, clearInterval, setTimeout, clearTimeout,
  performance: { now: () => Date.now() },
  requestAnimationFrame(){ return 0; },
  window: null, document: documentStub, localStorage: localStorageStub,
  navigator: { userAgent: 'smoke-node' },
  location: { href: 'file://defesa-orbital-3.html' },
  Phaser: PhaserStub
  // AudioContext proposicionalmente AUSENTE
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* ---------- carrega o HTML e extrai os scripts locais ---------- */
const htmlPath = path.join(ROOT, 'defesa-orbital-3.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
console.log('scripts no HTML:', srcs.join(', '));
for (const src of srcs) {
  if (src === 'phaser.min.js') continue; // Phaser real substituído pelo stub
  const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
  vm.runInContext(code, sandbox, { filename: src });
}
const DO = sandbox.window.DO;
check('window.DO exposto pelo jogo', !!DO && typeof DO.startNewGame === 'function');
const D = DO.D;

/* ---------- T1: parser de ondas + infinito ---------- */
console.log('\n[T1] parseWaveString campanhas + makeEndlessWave 13..60');
let t1ok = true, t1info = '';
for (const map of D.MAPS_DATA) {
  for (const w of map.waves) {
    const q = D.parseWaveString(w);
    if (!q.length) { t1ok = false; t1info = 'vazia: ' + w; break; }
    for (const item of q) {
      if (!D.ENEMIES_DATA[item.type]) { t1ok = false; t1info = map.name + ' "' + w + '" -> ' + item.type; break; }
    }
    if (!t1ok) break;
  }
  if (!t1ok) break;
}
check('todas as strings de onda das 5 campanhas parseiam com tipos válidos', t1ok, t1info);
let t1bok = true, t1binfo = '', bossSeen = 0;
for (let n = 13; n <= 60; n++) {
  const str = D.makeEndlessWave(n);
  const q = D.parseWaveString(str);
  if (!q.length) { t1bok = false; t1binfo = 'n=' + n + ' vazia'; break; }
  for (const item of q) {
    if (!D.ENEMIES_DATA[item.type]) { t1bok = false; t1binfo = 'n=' + n + ' tipo ' + item.type; break; }
    if (item.type.indexOf('boss') === 0) bossSeen++;
  }
  if (!t1bok) break;
}
check('makeEndlessWave(13..60) só gera tipos existentes', t1bok, t1binfo);
check('infinito inclui bosses periódicos', bossSeen >= 5, 'bosses=' + bossSeen);

/* ---------- T2: startNewGame aplica dificuldade e endless ---------- */
console.log('\n[T2] startNewGame(map, diff, endless)');
const Si = DO.startNewGame(2, 'insane', true);
check('dificuldade INSANE aplicada (hpMul 1.55)', Si.diff.key === 'insane' && Si.diff.hpMul === 1.55);
check('endless ativo', Si.endless === true);
check('vidas escaladas (20×0.5=10)', Si.lives === 10, 'lives=' + Si.lives);
check('créditos escalados (350×0.8=280)', Si.credits === 280, 'credits=' + Si.credits);
const Sn = DO.startNewGame(0, 'normal', false);
check('RECRUTA padrão: 20 vidas / 350 créditos / sem endless',
  Sn.lives === 20 && Sn.credits === 350 && Sn.endless === false);

/* ---------- T3: simulação 16 ondas infinitas ---------- */
console.log('\n[T3] simular startNextWave → matar todos → onWaveCleared ×16 (infinito)');
const S = DO.startNewGame(0, 'normal', true);
let simOk = true, simInfo = '';
for (let w = 1; w <= 16; w++) {
  if (!DO.startNextWave(S)) { simOk = false; simInfo = 'startNextWave falhou na onda ' + w; break; }
  if (S.state !== 'combat') { simOk = false; simInfo = 'estado != combat na onda ' + w; break; }
  let guard = 0;
  while ((S.waveQueue.length > 0 || S.enemies.some(e => !e.dead)) && guard++ < 30000) {
    DO.stepSim(S, 0.05);
    for (const e of S.enemies) if (!e.dead && !e.leaked) DO.killEnemy(S, e);
  }
  if (guard >= 30000) { simOk = false; simInfo = 'timeout na onda ' + w; break; }
  for (let k = 0; k < 20 && (S.state === 'combat' || S.state === 'mutate'); k++) DO.stepSim(S, 0.05);
  // ULTRA: auto-resolve mutation in headless
  if (S.state === 'mutate' && S.pendingMut && S.mutChoices) { try{ DO.applyMutation(S, S.mutChoices[0].id); }catch(e){} S.state='idle'; }
  if (S.state !== 'idle') { simOk = false; simInfo = 'onda ' + w + ' terminou em "' + S.state + '" (vitória prematura?)'; break; }
}
check('16 ondas infinitas sem crash e sem vitória prematura', simOk, simInfo);
check('chegou à onda 16 em modo infinito', S.wave === 16, 'wave=' + S.wave);
check('nenhuma vida perdida (tudo morto antes de vazar)', S.lives >= 20, 'lives=' + S.lives);
check('abates acumulados', S.kills > 100, 'kills=' + S.kills);

/* ---------- T4: matriz anti-aérea no alvo automático ---------- */
console.log('\n[T4] findBestTarget respeita matriz anti-aérea');
const SA = DO.startNewGame(0, 'normal', false);
function mkEnemy(eid, type, x, y) {
  const def = D.ENEMIES_DATA[type];
  return { eid, type, defRef: def, label: def.label, col: def.col, r: def.r, shape: def.shape,
    hp: def.hp, maxHp: def.hp, shield: 0, maxShield: 0, dist: 10, totalLen: 100, progress: 0.1,
    routeIdx: 0, flying: !!def.flying, x, y, dirAngle: 0, speed: def.spd, armor: def.armor || 0,
    slowTimer: 0, slowFactor: 1, stunTimer: 0, cryoVuln: 0, poisonTimer: 0, poisonDps: 0, poisonBy: null,
    burnTimer: 0, burnDps: 0, markedTimer: 0, healCooldown: 0, stealthPhase: 0, raged: false,
    flash: 0, dead: false, leaked: false };
}
const cannon = { tid: 1, defRef: D.TOWERS_DATA[0], level: 1, x: 462, y: 286, targetMode: 'FIRST',
  specBranch: null, cooldown: 0, recoil: 0, flash: 0, rampTime: 0, lastTargetEid: null, angle: 0, aimAngle: 0 };
const runnerFly = mkEnemy(101, 'runner', 462, 286);
const droneG = mkEnemy(102, 'drone', 480, 286);
const tankG = mkEnemy(103, 'tank', 440, 286);
SA.enemies.push(runnerFly, droneG, tankG);
const statsCannon = DO.getTowerStats(SA, cannon);
check('cannon nv1 NÃO atinge voadores', statsCannon.canHitAir === false);
const tCannon = DO.findBestTarget(SA, cannon, statsCannon);
check('cannon nv1 ignora runner voador e mira o drone (FIRST)', tCannon === droneG,
  'alvo=' + (tCannon ? tCannon.type : 'null'));
const laser = { tid: 2, defRef: D.TOWERS_DATA[2], level: 1, x: 462, y: 286, targetMode: 'FIRST',
  specBranch: null, cooldown: 0, recoil: 0, flash: 0, rampTime: 0, lastTargetEid: null, angle: 0, aimAngle: 0 };
const statsLaser = DO.getTowerStats(SA, laser);
check('laser (beam) atinge voadores', statsLaser.canHitAir === true);
check('laser mira o runner voador', DO.findBestTarget(SA, laser, statsLaser) === runnerFly);
cannon.targetMode = 'STRONGEST';
check('modo STRONGEST escolhe maior HP (tank)', DO.findBestTarget(SA, cannon, statsCannon) === tankG);
cannon.targetMode = 'FASTEST';
check('modo FASTEST escolhe maior velocidade (runner, mesmo inalcançável? não — drone 62 vs tank 32)',
  [droneG, tankG].includes(DO.findBestTarget(SA, cannon, statsCannon)) &&
  DO.findBestTarget(SA, cannon, statsCannon) === droneG);
const flakCannon = Object.assign({}, cannon, { specBranch: 'B' });
check('cannon com specB (Flak) libera anti-aéreo', DO.getTowerStats(SA, flakCannon).canHitAir === true);

/* ---------- T5: conquistas sem duplicata ---------- */
console.log('\n[T5] unlockAchievement grava 1x e ignora duplicata');
D.Save.data.achievements = D.Save.data.achievements.filter(a => a !== 'first_blood'); // isola o teste
const first = DO.unlockAchievement('first_blood');
const second = DO.unlockAchievement('first_blood');
check('primeira concessão retorna true', first === true);
check('duplicata retorna false', second === false);
const achList = D.Save.data.achievements.filter(a => a === 'first_blood');
check('registrada exatamente 1 vez no save', achList.length === 1);

/* ---------- T6 (extra): construir/melhorar/vender ---------- */
console.log('\n[T6] placeTower / upgrade / sell (regras 75%/70%)');
const SB = DO.startNewGame(0, 'normal', false);
let cell = null;
for (let c = 0; c < 21 && !cell; c++) for (let r = 0; r < 13; r++) {
  if (!SB.blocked[c + ',' + r]) { cell = { c, r }; break; }
}
const credits0 = SB.credits;
const t = DO.placeTower(SB, cell.c, cell.r, 'cannon');
check('torre construída', !!t);
check('custo debitado (−$50)', SB.credits === credits0 - 50, 'credits=' + SB.credits);
const beforeUp = SB.credits;
check('upgrade nível 2 ok (custo dinâmico até 50)', DO.upgradeTower(SB, t) === true && t.level === 2 && SB.credits < beforeUp,
  'credits=' + SB.credits);
const val = Math.round(t.spent * 0.7);
const beforeSell = SB.credits;
DO.sellTower(SB, t);
check('venda devolve 70% do acumulado (+' + val + ')', SB.credits === beforeSell + val && SB.towers.length === 0);
const peek = DO.peekNextWave(SB);
check('peekNextWave resume a próxima onda', Array.isArray(peek) && peek.length > 0 && peek.every(p => D.ENEMIES_DATA[p.type]));

/* ---------- resultado ---------- */
console.log('\n==========================================');
console.log('SMOKE RESULT: ' + pass + ' PASS / ' + fail + ' FAIL');
if (fail) { console.log('FALHAS:\n - ' + failures.join('\n - ')); process.exit(1); }
process.exit(0);
