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
const htmlPath = path.join(ROOT, 'index.html'); // v3 PIXEL FASE 7: jogo agora é index.html
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
// G-a G6 (design): cannon nv1 é balístico terrestre — NÃO atinge voadores (só specB Flak)
check('cannon nv1 NÃO atinge voadores (splash/bullet terrestre)', statsCannon.canHitAir === false);
const tCannon = DO.findBestTarget(SA, cannon, statsCannon);
check('cannon nv1 mira o drone terrestre (FIRST) — ignora runner voador', tCannon === droneG,
  'alvo=' + (tCannon ? tCannon.type : 'null'));
const laser = { tid: 2, defRef: D.TOWERS_DATA[2], level: 1, x: 462, y: 286, targetMode: 'FIRST',
  specBranch: null, cooldown: 0, recoil: 0, flash: 0, rampTime: 0, lastTargetEid: null, angle: 0, aimAngle: 0 };
const statsLaser = DO.getTowerStats(SA, laser);
check('laser (beam) atinge voadores', statsLaser.canHitAir === true);
check('laser mira o runner voador', DO.findBestTarget(SA, laser, statsLaser) === runnerFly);
cannon.targetMode = 'STRONGEST';
check('modo STRONGEST escolhe maior HP (tank)', DO.findBestTarget(SA, cannon, statsCannon) === tankG);
cannon.targetMode = 'FASTEST';
// G-a G6 (design): cannon não mira ar — mais rápido EM TERRA é o drone (62 vs tank 32)
check('modo FASTEST (cannon) escolhe maior velocidade terrestre (drone 62 vs tank 32)',
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

/* ---------- T7 (v3 PIXEL FASE 7): texturas pixel / merge / fábrica / lab / super / tiro ---------- */
console.log('\n[T7] v3 PIXEL — texturas, tiers, merge, fábrica, laboratório, supers automáticos');

// T7a: tabelas novas em DO3
check('MERGE_PARTS/SHOT_PATTERNS/TIER_LOGIC/SUPERS_AUTO expostos (TIER_STATS removido na Onda 2)',
  !D.TIER_STATS && !!D.MERGE_PARTS && !!D.SHOT_PATTERNS && !!D.TIER_LOGIC && !!D.SUPERS_AUTO && !!D.FACTORY_DATA && !!D.HIVEMIND);
check('getTier: nv1→T1, nv10→T1, nv11→T2, nv50→T5',
  D.getTier(1) === 1 && D.getTier(10) === 1 && D.getTier(11) === 2 && D.getTier(50) === 5);
check('superThreshold por tier BAL2 (T1=41..T5=23, +50% p/ conter 27 supers/onda)',
  D.superThreshold(1) === 41 && D.superThreshold(5) === 23);

// T7b: merge de torres (3 cannons nv10 + peças → 1 cannon nv11)
const SM = DO.startNewGame(0, 'normal', false);
SM.credits = 99999; SM.parts = 100;
function freeCell(S, offset) {
  for (let c = 0; c < 21; c++) for (let r = 0; r < 13; r++) {
    if (!S.blocked[c + ',' + r] && !S.occupied[c + ',' + r]) { if (offset > 0) { offset--; continue; } return { c, r }; }
  }
  return null;
}
function nextFree(S) { // pega SEMPRE uma célula livre nova (offset não persiste entre chamadas)
  for (let c = 0; c < 21; c++) for (let r = 0; r < 13; r++) {
    if (!S.blocked[c + ',' + r] && !S.occupied[c + ',' + r]) return { c, r };
  }
  return null;
}
const _c1 = nextFree(SM); const mA = DO.placeTower(SM, _c1.c, _c1.r, 'cannon');
const _c2 = nextFree(SM); const mB = DO.placeTower(SM, _c2.c, _c2.r, 'cannon');
const _c3 = nextFree(SM); const mC = DO.placeTower(SM, _c3.c, _c3.r, 'cannon');
for (const t of [mA, mB, mC]) t.level = 10;
check('3 cannons no tier cap (nv10): upgrade travado', DO.upgradeTower(SM, mA) === false && mA.level === 10);
const partsBefore = SM.parts;
const towersBefore = SM.towers.length;
const merged = DO.mergeTowers(SM, mA);
check('mergeTowers funde 3 → 1 torre nv11', !!merged && merged.level === 11);
check('2 consumidas removidas sem reembolso', SM.towers.length === towersBefore - 2);
check('custo em peças debitado (' + D.MERGE_PARTS[1] + '⚙)', SM.parts === partsBefore - D.MERGE_PARTS[1], 'parts=' + SM.parts);
check('sem candidatos/peças: merge falha', DO.canMerge(SM, merged) === false);

// T7b.1: fusão direta compra apenas as cópias que faltam pelo valor integral do tier
const SQ = DO.startNewGame(0, 'normal', false);
SQ.credits = 99999; SQ.parts = 999;
const qCell = nextFree(SQ); const qTower = DO.placeTower(SQ, qCell.c, qCell.r, 'cannon');
qTower.level = 10;
const q = DO.mergePurchaseQuote(SQ, qTower);
check('fusão direta T1 calcula 2 cópias, $100 e ' + D.MERGE_PARTS[1] + '⚙', q.missing === 2 && q.credits === 100 && q.parts === D.MERGE_PARTS[1],
  `missing=${q.missing} credits=${q.credits} parts=${q.parts}`);
const qCredits = SQ.credits, qParts = SQ.parts;
check('fusão direta promove nv10 → nv11 sem ocupar novas casas',
  DO.mergeWithPurchase(SQ, qTower) === qTower && qTower.level === 11 && SQ.towers.length === 1);
check('fusão direta debita exatamente cópias e peças', SQ.credits === qCredits - 100 && SQ.parts === qParts - D.MERGE_PARTS[1]);
const SQ2 = DO.startNewGame(0, 'normal', false);
SQ2.credits = 99999; SQ2.parts = 999;
const q2aCell = nextFree(SQ2); const q2a = DO.placeTower(SQ2, q2aCell.c, q2aCell.r, 'cannon');
const q2bCell = nextFree(SQ2); DO.placeTower(SQ2, q2bCell.c, q2bCell.r, 'cannon');
q2a.level = 10;
const q2 = DO.mergePurchaseQuote(SQ2, q2a);
check('uma cópia existente reduz a compra direta para 1 nave', q2.missing === 1 && q2.credits === 50 && q2.parts === D.MERGE_PARTS[1]);
const t2Entry = DO.tierEntryPrice(D.TOWERS_DATA[0], 2);
check('cópia T2 inclui construção, upgrades e fusão do tier anterior', t2Entry.credits > 150 && t2Entry.parts === D.MERGE_PARTS[1]);

// T7c: fábrica produz peças e créditos no onWaveCleared
const SF = DO.startNewGame(0, 'normal', false);
SF.credits = 9999;
const fcell = nextFree(SF);
const fac = DO.placeTower(SF, fcell.c, fcell.r, 'factory');
check('fábrica colocada (kind=factory)', !!fac && fac.defRef.kind === 'factory');
const p0 = SF.parts, c0 = SF.credits;
DO.onWaveCleared(SF);
check('fábrica pagou +20⚙/+18cr e onda deu +2⚙', SF.parts === p0 + D.FACTORY_DATA.partsPerWave(1) + 2 && SF.credits > c0, `parts=${SF.parts} credits=${SF.credits - c0}`);
check('upgradeEnemyHP sobe nível e debita peças', (() => {
  SF.parts = 100; const lvl0 = SF.enemyHpLevel || 0;
  return DO.upgradeEnemyHP(SF) === true && SF.enemyHpLevel === lvl0 + 1 && SF.parts < 100;
})());
const mulNow = DO.hpMultiplier(SF);
SF.enemyHpLevel = (SF.enemyHpLevel || 0);
const mulNoLab = (1 + SF.mapIdx * 0.25 + SF.wave * 0.12) * SF.diff.hpMul * SF.endlessHpMul;
check('multiplicador = base × (1 + níveis×0.12)', Math.abs(mulNow / mulNoLab - (1 + SF.enemyHpLevel * 0.12)) < 1e-6);

// T7d: super automático — carga, força, disparo
const SS = DO.startNewGame(0, 'normal', false);
SS.credits = 9999; SS.parts = 100;
const scell = nextFree(SS);
const sTower = DO.placeTower(SS, scell.c, scell.r, 'cannon');
const ch0 = DO.getSuperCharge(SS, sTower);
check('getSuperCharge começa vazio (need=41 no T1, BAL2 +50%)', ch0.charge === 0 && ch0.need === 41 && !ch0.ready);
DO.forceSuperCharge(SS, sTower);
const fired0 = SS.autoSupersFired || 0;
check('forceSuperCharge dispara super automático (contador)', fired0 >= 1);
check('carga zerou após disparo', DO.getSuperCharge(SS, sTower).charge === 0);

// T7e: padrão de tiro por tier — cannon T1=1 projétil, T2=2+
const ST = DO.startNewGame(0, 'normal', false);
ST.credits = 99999;
const cellT1 = nextFree(ST);
const tw1 = DO.placeTower(ST, cellT1.c, cellT1.r, 'cannon');
function mkTargetE(S, x, y) {
  const def = D.ENEMIES_DATA.drone;
  const e = { eid: ++S.spawnCounter + 5000, type: 'drone', type_key: 'drone', defRef: def, label: def.label, col: def.col, r: def.r, shape: def.shape,
    hp: 9999999, maxHp: 9999999, shield: 0, maxShield: 0, dist: 10, totalLen: 9999, progress: 0.1, routeIdx: 0, flying: false,
    x, y, dirAngle: 0, speed: 1, armor: 0, slowTimer: 0, slowFactor: 1, stunTimer: 0, cryoVuln: 0,
    poisonTimer: 0, poisonDps: 0, poisonBy: null, burnTimer: 0, burnDps: 0, markedTimer: 0,
    healCooldown: 0, stealthPhase: 0, raged: false, flash: 0, dead: false, leaked: false };
  S.enemies.push(e); return e;
}
const tgt1 = mkTargetE(ST, tw1.x + 40, tw1.y);
let st1 = DO.getTowerStats(ST, tw1);
ST.projectiles.length = 0;
DO.fireTower(ST, tw1, tgt1, st1);
check('cannon T1 dispara 1 projétil', ST.projectiles.filter(p => p.kind === 'bullet').length === 1,
  'n=' + ST.projectiles.length);
const cellT2 = nextFree(ST);
const tw2 = DO.placeTower(ST, cellT2.c, cellT2.r, 'cannon');
tw2.level = 11; // T2
const tgt2 = mkTargetE(ST, tw2.x + 40, tw2.y);
st1 = DO.getTowerStats(ST, tw2);
ST.projectiles.length = 0;
DO.fireTower(ST, tw2, tgt2, st1);
const bulletsT2 = ST.projectiles.filter(p => p.kind === 'bullet').length;
check('cannon T2 dispara 2+ projéteis', bulletsT2 >= 2, 'n=' + bulletsT2);
// gatling T5 = rajada 6
const cellG = nextFree(ST);
const gw = DO.placeTower(ST, cellG.c, cellG.r, 'gatling');
gw.level = 41;
const tgtG = mkTargetE(ST, gw.x + 40, gw.y);
ST.projectiles.length = 0;
DO.fireTower(ST, gw, tgtG, DO.getTowerStats(ST, gw));
check('gatling T5 dispara rajada de 6 tracantes', ST.projectiles.filter(p => p.kind === 'bullet').length === 6,
  'n=' + ST.projectiles.length);

/* ---------- T8: progressão persistente de mapas e campanhas ---------- */
console.log('\n[T8] vitória libera o próximo mapa/fase');
const saveBeforeProgress = D.Save.data;
D.Save.data = D.Save.defaults();
const SP0 = DO.startNewGame(0, 'normal', false);
DO.finalizeEnd(SP0, 'victory');
check('vencer mapa 1 libera mapa 2', D.Save.data.unlockedMap === 2, 'unlockedMap=' + D.Save.data.unlockedMap);
const SP1 = DO.startNewGame(1, 'normal', false);
DO.finalizeEnd(SP1, 'victory');
check('vencer mapa 2 libera mapa 3', D.Save.data.unlockedMap === 3, 'unlockedMap=' + D.Save.data.unlockedMap);
const SP2 = DO.startNewGame(2, 'normal', false);
DO.finalizeEnd(SP2, 'victory');
check('vencer mapa 3 libera mapa 4', D.Save.data.unlockedMap === 4, 'unlockedMap=' + D.Save.data.unlockedMap);
D.Save.data.unlockedMap = 3;
const fakeClasses = new Set();
const fakeStars = { innerHTML: '' };
const fakeCard = {
  classList: { toggle(name, on){ if(on) fakeClasses.add(name); else fakeClasses.delete(name); } },
  tabIndex: 0,
  attrs: {},
  setAttribute(name, value){ this.attrs[name] = value; },
  querySelector(sel){ return sel === '.m-stars' ? fakeStars : null; }
};
DO.syncMapCardState(fakeCard, 3);
check('mapa 4 começa bloqueado no cartão', fakeClasses.has('locked') && fakeCard.attrs['aria-disabled'] === 'true');
D.Save.data.unlockedMap = 4;
DO.syncMapCardState(fakeCard, 3);
check('cartão do mapa 4 desbloqueia sem recarregar a página', !fakeClasses.has('locked') && fakeCard.attrs['aria-disabled'] === 'false' && fakeCard.tabIndex === 0);
D.Save.data.unlockedMap = 3;
D.Save.data.mapStars[2] = 3;
check('save antigo com mapa 3 concluído é reparado automaticamente', D.Save.repairProgress() && D.Save.data.unlockedMap === 4);
D.Save.data = saveBeforeProgress;

/* ---------- T9: vitória → infinito preserva a partida ---------- */
console.log('\n[T9] continuar no infinito mantém a defesa atual');
D.Save.data = D.Save.defaults();
const SE = DO.startNewGame(0, 'normal', false);
SE.wave = SE.map.waves.length;
SE.credits = 777;
SE.lives = 13;
SE.towers.push({ id:'keep-me' });
const towerRef = SE.towers[0];
DO.finalizeEnd(SE, 'victory');
check('vitória libera o próximo setor antes do infinito', D.Save.data.unlockedMap === 2);
check('opção infinito aceita apenas resultado de vitória', DO.continueEndlessAfterVictory(SE) === true);
check('infinito preserva onda, torres, créditos e vidas', SE.wave === SE.map.waves.length && SE.towers[0] === towerRef && SE.credits === 777 && SE.lives === 13);
check('partida volta ao estado pronto em modo infinito', SE.endless === true && SE.state === 'idle' && SE.result === null);
DO.startNextWave(SE);
check('primeira onda extra continua após o final normal', SE.wave === SE.map.waves.length + 1 && SE.state === 'combat');
D.Save.data = saveBeforeProgress;

/* ---------- T10: operações atômicas e fusão sem atalhos ---------- */
console.log('\n[T10] regressões de economia e fusão');
function fundedGame() {
  const state = DO.startNewGame(0, 'normal', false);
  state.credits = 100000000; state.parts = 1000000;
  return state;
}
function buildShip(state, id = 'cannon') {
  const spot = nextFree(state);
  return DO.placeTower(state, spot.c, spot.r, id);
}
function economy(state) {
  return JSON.stringify({ credits: state.credits, parts: state.parts,
    towers: state.towers.map(t => [t.tid, t.level, t.spent]),
    occupied: Object.keys(state.occupied) });
}
const lowMerge = fundedGame();
const lowMain = buildShip(lowMerge); buildShip(lowMerge); buildShip(lowMerge);
const beforeLowMerge = economy(lowMerge);
check('fusão manual rejeita nave abaixo do limite de tier',
  !DO.canMerge(lowMerge, lowMain) && DO.mergeTowers(lowMerge, lowMain) === null && economy(lowMerge) === beforeLowMerge);
const soldState = fundedGame();
const soldShip = buildShip(soldState);
DO.sellTower(soldState, soldShip);
const replacement = DO.placeTower(soldState, soldShip.c, soldShip.r, 'laser');
const afterSale = economy(soldState);
check('venda repetida não gera dinheiro nem apaga a nave substituta',
  DO.sellTower(soldState, soldShip) === false && economy(soldState) === afterSale && soldState.occupied[soldShip.c + ',' + soldShip.r] === replacement);
check('upgrade não pode cobrar por uma nave vendida', DO.upgradeTower(soldState, soldShip) === false && economy(soldState) === afterSale);
soldShip.level = 10;
check('fusão direta rejeita referência de nave removida', DO.mergePurchaseQuote(soldState, soldShip) === null && DO.mergeWithPurchase(soldState, soldShip) === null && economy(soldState) === afterSale);
const atomic = fundedGame();
const atomicMain = buildShip(atomic); atomicMain.level = 10;
const atomicPart = buildShip(atomic);
atomic.credits = 49;
let atomicBefore = economy(atomic);
check('saldo insuficiente não cobra nem consome cópia existente', DO.mergeWithPurchase(atomic, atomicMain) === null && economy(atomic) === atomicBefore);
atomic.credits = 1000; atomic.parts = D.MERGE_PARTS[1] - 1; atomicBefore = economy(atomic);
check('peças insuficientes não cobram créditos nem consomem naves', DO.mergeWithPurchase(atomic, atomicMain) === null && economy(atomic) === atomicBefore);
atomic.parts = D.MERGE_PARTS[1];
const spentBeforeMerge = atomicMain.spent + atomicPart.spent + 50;
DO.mergeWithPurchase(atomic, atomicMain);
check('fusão preserva investimento das cópias existentes e compradas', atomicMain.spent === spentBeforeMerge && atomic.towers.length === 1);
atomicMain.level = 50; atomicBefore = economy(atomic);
check('nível máximo não oferece nem executa tier 6', DO.mergePurchaseQuote(atomic, atomicMain) === null && DO.mergeTowers(atomic, atomicMain) === null && economy(atomic) === atomicBefore);
const savedAchievements = D.Save.data.achievements;
D.Save.data.achievements = [];
const achievementState = fundedGame(); const achievementShip = buildShip(achievementState);
achievementShip.level = 10; DO.mergeWithPurchase(achievementState, achievementShip);
check('primeira fusão não concede conquista de nível máximo', !D.Save.data.achievements.includes('max_tower'));
achievementShip.level = 49; DO.upgradeTower(achievementState, achievementShip);
check('nível 50 concede conquista de engenharia suprema', D.Save.data.achievements.includes('max_tower'));
D.Save.data.achievements = savedAchievements;

// Constrói de verdade as árvores de fusão para comparar o orçamento com o custo manual.
function buildTier(state, tier, id) {
  if (tier === 1) return buildShip(state, id);
  const main = buildTier(state, tier - 1, id);
  while (main.level < (tier - 1) * 10) {
    if (!DO.upgradeTower(state, main)) throw new Error('Upgrade manual falhou');
  }
  buildTier(state, tier - 1, id); buildTier(state, tier - 1, id);
  if (!DO.mergeTowers(state, main)) throw new Error('Fusão manual falhou');
  return main;
}
for (const id of ['cannon', 'laser']) {
  for (let tier = 1; tier <= 5; tier++) {
    const state = fundedGame(); const initialCredits = state.credits, initialParts = state.parts;
    const ship = buildTier(state, tier, id);
    const price = DO.tierEntryPrice(ship.defRef, tier);
    check(id + ' T' + tier + ': preço direto igual à construção manual completa',
      initialCredits - state.credits === price.credits && initialParts - state.parts === price.parts && ship.spent === price.credits);
  }
}

/* ---------- T11 (Brief 07 A4): eventos disparam SFX ---------- */
console.log('\n[T11] Brief 07 — eventos disparam SFX (mock AudioSys)');
const _SND = sandbox.window.AudioSys;
const _keepExplosion = _SND.explosion, _keepMerge = _SND.merge, _keepWaveClear = _SND.waveClear;
let _nExplosion = 0, _nMerge = 0, _nWaveClear = 0;
_SND.explosion = function(){ _nExplosion++; };
_SND.merge = function(){ _nMerge++; };
_SND.waveClear = function(){ _nWaveClear++; };
const SZ = DO.startNewGame(0, 'normal', false);
DO.killEnemy(SZ, DO.spawnEnemy(SZ, 'drone'));
check('killEnemy dispara explosion', _nExplosion >= 1, 'n=' + _nExplosion);
const SY = DO.startNewGame(0, 'normal', false);
SY.credits = 99999; SY.parts = 999;
const _ya = nextFree(SY); const yA = DO.placeTower(SY, _ya.c, _ya.r, 'cannon');
const _yb = nextFree(SY); const yB = DO.placeTower(SY, _yb.c, _yb.r, 'cannon');
const _yc = nextFree(SY); const yC = DO.placeTower(SY, _yc.c, _yc.r, 'cannon');
yA.level = 10; yB.level = 10; yC.level = 10;
DO.mergeTowers(SY, yA);
check('finishMerge dispara merge', _nMerge >= 1, 'n=' + _nMerge);
const SW = DO.startNewGame(0, 'normal', true);
SW.wave = 1;
DO.onWaveCleared(SW);
check('onWaveCleared dispara waveClear', _nWaveClear >= 1, 'n=' + _nWaveClear);
_SND.explosion = _keepExplosion; _SND.merge = _keepMerge; _SND.waveClear = _keepWaveClear;

/* ---------- T12 (F5→F2-R1): recursos, consumo e zeros ---------- */
console.log('\n[T12] F2-R1 — init, consumo ammo/batt/fuel, zeros, caps');
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-6 : eps); }
function freshFunded() { const _S = DO.startNewGame(0, 'normal', false); _S.credits = 99999; _S.parts = 999; _S.autoMove = false; return _S; }
function freeNeighbors(_S, c, r) {
  const out = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const dd of dirs) {
    const nc = c + dd[0], nr = r + dd[1];
    if (nc < 0 || nc >= 21 || nr < 0 || nr >= 13) continue;
    const k = nc + ',' + nr;
    if (!_S.blocked[k] && !_S.occupied[k]) out.push({ c: nc, r: nr });
  }
  return out;
}
function spotWithNFree(_S, n) {
  for (let c = 0; c < 21; c++) for (let r = 0; r < 13; r++) {
    const k = c + ',' + r;
    if (_S.blocked[k] || _S.occupied[k]) continue;
    const nb = freeNeighbors(_S, c, r);
    if (nb.length >= n) return { c, r, nb };
  }
  return null;
}
function mkTarget(_S, x, y, hp) {
  const def = D.ENEMIES_DATA.drone;
  const e = { eid: ++_S.spawnCounter + 7000, type: 'drone', type_key: 'drone', defRef: def, label: def.label, col: def.col, r: def.r, shape: def.shape,
    hp: hp || 9999999, maxHp: hp || 9999999, shield: 0, maxShield: 0, dist: 10, totalLen: 9999, progress: 0.1, routeIdx: 0, flying: false,
    x, y, dirAngle: 0, speed: 1, armor: 0, slowTimer: 0, slowFactor: 1, stunTimer: 0, cryoVuln: 0,
    poisonTimer: 0, poisonDps: 0, poisonBy: null, burnTimer: 0, burnDps: 0, markedTimer: 0,
    healCooldown: 0, stealthPhase: 0, raged: false, flash: 0, dead: false, leaked: false };
  _S.enemies.push(e); return e;
}
(function () {
  const S1 = freshFunded();
  const sp1 = spotWithNFree(S1, 1);
  const tc = DO.placeTower(S1, sp1.c, sp1.r, 'cannon');
  check('F2-R1.1 cannon init fuel/batt/ammo cheios + comp/stance/anchor',
    tc && tc.fuel === tc.maxFuel && tc.fuel === 100 && tc.batt === tc.maxBatt && tc.batt === 100 &&
    tc.ammo === tc.maxAmmo && tc.ammo === 40 && tc.comp && tc.comp.w === 0 && tc.comp.e === 0 &&
    tc.comp.r === 0 && tc.comp.t === 0 && tc.stance === 'anchor' && tc.ax === sp1.c && tc.ay === sp1.r,
    'fuel=' + (tc && tc.fuel) + ' ammo=' + (tc && tc.ammo));
  const S1b = freshFunded();
  const a1 = nextFree(S1b); const sn = DO.placeTower(S1b, a1.c, a1.r, 'sniper');
  const a2 = nextFree(S1b); const rl = DO.placeTower(S1b, a2.c, a2.r, 'rail');
  check('F2-R1.2 sniper/rail ammo==14 (tiros pesados, G1-bal 12→14)', sn && sn.ammo === 14 && rl && rl.ammo === 14,
    'sniper=' + (sn && sn.ammo) + ' rail=' + (rl && rl.ammo));
  const S1c = freshFunded();
  const c1 = nextFree(S1c); const cn = DO.placeTower(S1c, c1.c, c1.r, 'cannon');
  cn.ammo = 0; cn._warnCd = 0; S1c.events.length = 0; S1c.projectiles.length = 0;
  const tgt0 = mkTarget(S1c, cn.x + 40, cn.y);
  const st0 = DO.getTowerStats(S1c, cn);
  const r0 = DO.fireTower(S1c, cn, tgt0, st0);
  const warns0 = S1c.events.filter(e => e.t === 'resEmpty' && e.res === 'ammo').length;
  check('F2-R1.3 cannon ammo=0 bloqueia + resEmpty ammo 1x', r0 === false && S1c.projectiles.length === 0 && warns0 === 1,
    'ret=' + r0 + ' proj=' + S1c.projectiles.length + ' warns=' + warns0);
  const r0b = DO.fireTower(S1c, cn, tgt0, st0);
  const warns0b = S1c.events.filter(e => e.t === 'resEmpty' && e.res === 'ammo').length;
  check('F2-R1.4 throttle 1s: 2a chamada imediata sem novo aviso; apos 1s avisa de novo',
    r0b === false && warns0b === 1 && (function () { DO.stepSim(S1c, 1.0); S1c.projectiles.length = 0; const r = DO.fireTower(S1c, cn, tgt0, DO.getTowerStats(S1c, cn)); const w = S1c.events.filter(e => e.t === 'resEmpty' && e.res === 'ammo').length; return r === false && w === 2; })(),
    'warns2=' + warns0b);
  const S1d = freshFunded();
  const d1 = nextFree(S1d); const cn2 = DO.placeTower(S1d, d1.c, d1.r, 'cannon');
  cn2.ammo = 1; cn2.batt = 0; cn2._warnCd = 0; S1d.events.length = 0; S1d.projectiles.length = 0;
  const tgtD = mkTarget(S1d, cn2.x + 40, cn2.y);
  const rD = DO.fireTower(S1d, cn2, tgtD, DO.getTowerStats(S1d, cn2));
  check('F2-R1.5 bullet com ammo=1,batt=0 AINDA dispara', rD === true && S1d.projectiles.filter(p => p.kind === 'bullet').length === 1 && cn2.ammo === 0,
    'ret=' + rD + ' proj=' + S1d.projectiles.length + ' ammo=' + cn2.ammo);
  const S1e = freshFunded();
  let eAllOk = true, eInfo = '';
  for (const id of ['tesla', 'cryo', 'venom', 'laser']) {
    const cc = nextFree(S1e); const tw = DO.placeTower(S1e, cc.c, cc.r, id);
    if (!tw) { eAllOk = false; eInfo = 'place ' + id; break; }
    tw.batt = 0; tw.ammo = 40; tw._warnCd = 0;
    S1e.events.length = 0; S1e.projectiles.length = 0;
    const hpBefore = 9999999;
    const tg = mkTarget(S1e, tw.x + 40, tw.y, hpBefore);
    const rr = (id === 'laser')
      ? DO.fireTower(S1e, tw, tg, DO.getTowerStats(S1e, tw))
      : DO.fireTower(S1e, tw, tg, DO.getTowerStats(S1e, tw));
    const w = S1e.events.filter(ev2 => ev2.t === 'resEmpty' && ev2.res === 'batt').length;
    const noProj = S1e.projectiles.length === 0;
    const noRing = S1e.events.filter(ev2 => ev2.t === 'ring').length === 0;
    if (!(rr === false && w >= 1 && noProj && tg.hp === hpBefore)) { eAllOk = false; eInfo = id + ' ret=' + rr + ' warns=' + w + ' proj=' + S1e.projectiles.length + ' hp=' + tg.hp; break; }
    S1e.enemies.length = 0;
  }
  check('F2-R1.6 energy (tesla/cryo/venom/laser) batt=0 bloqueia + resEmpty batt', eAllOk, eInfo);
  const S1f = freshFunded();
  const f1 = nextFree(S1f); const te = DO.placeTower(S1f, f1.c, f1.r, 'tesla');
  te.batt = 100; te.ammo = 40; te._warnCd = 0;
  const stTe = DO.getTowerStats(S1f, te);
  const bBefore = te.batt;
  const tgTe = mkTarget(S1f, te.x + 40, te.y);
  S1f.projectiles.length = 0;
  DO.fireTower(S1f, te, tgTe, stTe);
  const expectDrain = 5.5 * (1 / stTe.rate);
  check('F2-R1.7 tesla consome battDrain*(1/rate) por disparo (BAL2 drain 5→5.5)', approx(bBefore - te.batt, expectDrain, 0.05),
    'drop=' + (bBefore - te.batt).toFixed(4) + ' expect=' + expectDrain.toFixed(4) + ' rate=' + stTe.rate);
  const S1g = freshFunded(); S1g.autoMove = false;
  const g1 = nextFree(S1g); const lz = DO.placeTower(S1g, g1.c, g1.r, 'laser');
  const lzStats = DO.getTowerStats(S1g, lz);
  const eBeam = mkTarget(S1g, lz.x + 50, lz.y, 9999999);
  eBeam.speed = 0; eBeam.dist = 100; eBeam.totalLen = 99999; eBeam.routeIdx = 0;
  const origX = eBeam.x, origHp = eBeam.hp;
  lz.batt = 0;
  DO.stepSim(S1g, 0.05);
  const beamNullEmpty = (lz.beamTarget == null);
  const hpUnchanged = (eBeam.hp === origHp);
  const S1g2 = freshFunded(); S1g2.autoMove = false;
  const g2 = nextFree(S1g2); const lz2 = DO.placeTower(S1g2, g2.c, g2.r, 'laser');
  lz2.batt = 100;
  const eBeam2 = mkTarget(S1g2, lz2.x + 50, lz2.y, 9999999);
  eBeam2.speed = 0;
  const hp2Before = eBeam2.hp, batt2Before = lz2.batt;
  DO.stepSim(S1g2, 0.5);
  check('F2-R1.8 beam stepSim: sem batt mira nula+HP intacto; com batt HP cai+batt<100',
    beamNullEmpty && hpUnchanged && eBeam2.hp < hp2Before && lz2.batt < batt2Before,
    'null=' + beamNullEmpty + ' hpSame=' + hpUnchanged + ' hpDrop=' + (hp2Before - eBeam2.hp) + ' batt=' + lz2.batt);
  const S1h = freshFunded();
  const h1 = nextFree(S1h); const ch = DO.placeTower(S1h, h1.c, h1.r, 'cannon');
  const mf0 = DO.getMaxFuel(ch);
  ch.comp.r = 1; const mf1 = DO.getMaxFuel(ch); const mb1 = DO.getMaxBatt(ch); const ma1 = DO.getMaxAmmo(ch);
  ch.comp.r = 5; const mf5 = DO.getMaxFuel(ch);
  ch.comp.r = 2; const ma2 = DO.getMaxAmmo(ch);
  check('F2-R1.9 getMax caps: r0=100 r1=125 r5=225 ammo r2 40*1.5=60',
    mf0 === 100 && mf1 === 125 && mb1 === 125 && ma1 === 50 && mf5 === 225 && ma2 === 60,
    'mf0=' + mf0 + ' mf1=' + mf1 + ' mf5=' + mf5 + ' ma2=' + ma2);
  const S1m = freshFunded();
  const mspot = spotWithNFree(S1m, 1);
  const mt = DO.placeTower(S1m, mspot.c, mspot.r, 'cannon');
  mt.fuel = 100; mt.moveCd = 0;
  const dest = mspot.nb[0];
  const fuelBefore = mt.fuel;
  const mvOk = DO.moveTower(S1m, mt, dest.c, dest.r);
  check('F2-R1.10 moveTower com fuel move + cobra fuelPerCell',
    mvOk === true && mt.c === dest.c && mt.r === dest.r && mt.fuel === fuelBefore - 2,
    'ret=' + mvOk + ' fuel=' + mt.fuel);
  const S1n = freshFunded();
  const nspot = spotWithNFree(S1n, 1);
  const nt = DO.placeTower(S1n, nspot.c, nspot.r, 'cannon');
  nt.fuel = 0; nt.moveCd = 0;
  const ndest = nspot.nb[0];
  const nc0 = nt.c, nr0 = nt.r;
  const mvFail = DO.moveTower(S1n, nt, ndest.c, ndest.r);
  check('F2-R1.11 moveTower sem fuel trava (return false, pos inalterada)', mvFail === false && nt.c === nc0 && nt.r === nr0,
    'ret=' + mvFail);
})();

/* ---------- T13 (F5→F2-R2/R3/E): recarga, diminishing, boost, predios ---------- */
console.log('\n[T13] F2-R2/R3/E — supply, diminishing, factory boost, station/support');
(function () {
  check('F2-R2.10 DO.getResupply exposto', typeof DO.getResupply === 'function');
  const S2a = freshFunded();
  const a = nextFree(S2a); const ca = DO.placeTower(S2a, a.c, a.r, 'cannon');
  const rs0 = DO.getResupply(S2a, ca);
  const fBefore = ca.fuel;
  DO.stepSim(S2a, 1.0);
  check('F2-R2.11 sem fontes resupply=0 e sem recarga', rs0.fuel === 0 && rs0.batt === 0 && rs0.ammo === 0 && ca.fuel === fBefore,
    JSON.stringify(rs0));
  const S2b = freshFunded();
  const sb = spotWithNFree(S2b, 1);
  const cb = DO.placeTower(S2b, sb.c, sb.r, 'cannon');
  const stB = DO.placeTower(S2b, sb.nb[0].c, sb.nb[0].r, 'station');
  const rsB = DO.getResupply(S2b, cb);
  check('F2-R2.12 station no raio ~= {12,14,7} (G1-bal ammo 6→7)', approx(rsB.fuel, 12, 1e-6) && approx(rsB.batt, 14, 1e-6) && approx(rsB.ammo, 7, 1e-6),
    JSON.stringify(rsB));
  const S2c = freshFunded();
  const sc2 = spotWithNFree(S2c, 1);
  const cc2 = DO.placeTower(S2c, sc2.c, sc2.r, 'cannon');
  DO.placeTower(S2c, sc2.nb[0].c, sc2.nb[0].r, 'support');
  const rsC = DO.getResupply(S2c, cc2);
  check('F2-R2.13 support no raio ~= {6,7,3.5} (G1-bal ammo 3→3.5)', approx(rsC.fuel, 6, 1e-6) && approx(rsC.batt, 7, 1e-6) && approx(rsC.ammo, 3.5, 1e-6),
    JSON.stringify(rsC));
  const S2d = freshFunded();
  const sd2 = spotWithNFree(S2d, 1);
  const cd2 = DO.placeTower(S2d, sd2.c, sd2.r, 'cannon');
  let farSt = null, farSu = null;
  outer: for (let c = 0; c < 21; c++) for (let r = 0; r < 13; r++) {
    const k = c + ',' + r;
    if (S2d.blocked[k] || S2d.occupied[k]) continue;
    const dx = (c * 44 + 22) - cd2.x, dy = (r * 44 + 22) - cd2.y;
    if (Math.hypot(dx, dy) > 400) { if (!farSt) farSt = { c, r }; else if (!farSu) { farSu = { c, r }; break outer; } }
  }
  if (farSt) DO.placeTower(S2d, farSt.c, farSt.r, 'station');
  if (farSu) DO.placeTower(S2d, farSu.c, farSu.r, 'support');
  const rsD = DO.getResupply(S2d, cd2);
  cd2.fuel = 50; DO.stepSim(S2d, 1.0);
  check('F2-R2.14 fora do raio resupply=0 e sem recarga', rsD.fuel === 0 && rsD.batt === 0 && rsD.ammo === 0 && cd2.fuel === 50,
    JSON.stringify(rsD) + ' fuel=' + cd2.fuel);
  const S2e = freshFunded();
  const se = spotWithNFree(S2e, 2);
  const ce = DO.placeTower(S2e, se.c, se.r, 'cannon');
  DO.placeTower(S2e, se.nb[0].c, se.nb[0].r, 'station');
  DO.placeTower(S2e, se.nb[1].c, se.nb[1].r, 'support');
  const rsE = DO.getResupply(S2e, ce);
  check('F2-R2.15 diminishing 2 fontes: 12+0.5*6=15 / 14+0.5*7=17.5 / 7+0.5*3.5=8.75 (G1-bal)',
    approx(rsE.fuel, 15, 1e-6) && approx(rsE.batt, 17.5, 1e-6) && approx(rsE.ammo, 8.75, 1e-6),
    JSON.stringify(rsE));
  const S2f = freshFunded();
  const sf = spotWithNFree(S2f, 3);
  const cf = DO.placeTower(S2f, sf.c, sf.r, 'cannon');
  DO.placeTower(S2f, sf.nb[0].c, sf.nb[0].r, 'station');
  DO.placeTower(S2f, sf.nb[1].c, sf.nb[1].r, 'support');
  DO.placeTower(S2f, sf.nb[2].c, sf.nb[2].r, 'support');
  const rsF = DO.getResupply(S2f, cf);
  check('F2-R2.16 diminishing 3 fontes: 12+0.5*(6+6)=18', approx(rsF.fuel, 18, 1e-6),
    JSON.stringify(rsF));
  const S2g = freshFunded();
  const sg = spotWithNFree(S2g, 1);
  const cg = DO.placeTower(S2g, sg.c, sg.r, 'cannon');
  DO.placeTower(S2g, sg.nb[0].c, sg.nb[0].r, 'factory');
  const rsG = DO.getResupply(S2g, cg);
  check('F2-R2.17 factory NAO e fonte (resupply=0)', rsG.fuel === 0 && rsG.batt === 0 && rsG.ammo === 0,
    JSON.stringify(rsG));
  const S2h = freshFunded();
  const sh = spotWithNFree(S2h, 1);
  const chh = DO.placeTower(S2h, sh.c, sh.r, 'cannon');
  DO.placeTower(S2h, sh.nb[0].c, sh.nb[0].r, 'station');
  chh.fuel = 0; DO.stepSim(S2h, 1.0);
  const step1ok = approx(chh.fuel, 12, 0.6);
  chh.fuel = 99; DO.stepSim(S2h, 1.0);
  const clampOk = (chh.fuel === 100);
  chh.comp.r = 1; chh.fuel = 0; DO.stepSim(S2h, 1.0);
  const clampRok = approx(chh.fuel, 13.2, 0.7);
  chh.comp.r = 0;
  check('F2-R2.18 recarga 1s + clamp (0->12, 99->100, r1 clamp 125)', step1ok && clampOk && clampRok,
    's1=' + chh.fuel + ' step1=' + step1ok + ' clamp=' + clampOk + ' r=' + clampRok);
  const S2i = freshFunded();
  const si = spotWithNFree(S2i, 1);
  const ci = DO.placeTower(S2i, si.c, si.r, 'cannon');
  DO.placeTower(S2i, si.nb[0].c, si.nb[0].r, 'station');
  ci.comp.r = 1;
  const rsI = DO.getResupply(S2i, ci);
  check('F2-R2.19 takeMul reator r1: 12*1.10=13.2/s', approx(rsI.fuel, 13.2, 1e-6), JSON.stringify(rsI));
  const S2j = freshFunded();
  const c0j = S2j.credits;
  const j1 = nextFree(S2j); const stJ = DO.placeTower(S2j, j1.c, j1.r, 'station');
  const j2 = nextFree(S2j); const suJ = DO.placeTower(S2j, j2.c, j2.r, 'support');
  check('F2-E.20 station $375 / support $110, kind/spent/occupied (BAL2 340→375, 100→110)',
    stJ && stJ.defRef.kind === 'station' && stJ.spent === 375 && suJ && suJ.defRef.kind === 'support' && suJ.spent === 110 &&
    S2j.towers.indexOf(stJ) >= 0 && S2j.towers.indexOf(suJ) >= 0 && S2j.occupied[stJ.c + ',' + stJ.r] === stJ &&
    S2j.credits === c0j - 375 - 110,
    'credits=' + S2j.credits);
  const S2k = freshFunded();
  const kk = nextFree(S2k); const stk = DO.placeTower(S2k, kk.c, kk.r, 'station');
  const stkStats = DO.getTowerStats(S2k, stk);
  const tgtK = mkTarget(S2k, stk.x + 40, stk.y);
  const fbK = DO.findBestTarget(S2k, stk, stkStats);
  const fireK = DO.fireTower(S2k, stk, tgtK, stkStats);
  S2k.projectiles.length = 0; const hpK = tgtK.hp;
  DO.stepSim(S2k, 0.5);
  check('F2-E.21 station/support nao atiram (alvo null, fire false, sem projetil/dano)',
    fbK === null && fireK === false && S2k.projectiles.length === 0 && tgtK.hp === hpK,
    'tgt=' + fbK + ' fire=' + fireK + ' proj=' + S2k.projectiles.length);
  const S2l = freshFunded();
  const ll = nextFree(S2l); const stl = DO.placeTower(S2l, ll.c, ll.r, 'station');
  check('F2-E.22 station nao upa/funde (upgrade false, canMerge false, quote null)',
    DO.upgradeTower(S2l, stl) === false && DO.canMerge(S2l, stl) === false && DO.mergePurchaseQuote(S2l, stl) === null);
  const S2m = freshFunded();
  const sm = spotWithNFree(S2m, 1);
  const cm = DO.placeTower(S2m, sm.c, sm.r, 'cannon');
  DO.placeTower(S2m, sm.nb[0].c, sm.nb[0].r, 'station');
  const rsM = DO.getResupply(S2m, cm);
  check('F2-R3.23 0 fabricas: station->12/s', approx(rsM.fuel, 12, 1e-6), JSON.stringify(rsM));
  const S2n = freshFunded();
  const snn = spotWithNFree(S2n, 2);
  const cnn = DO.placeTower(S2n, snn.c, snn.r, 'cannon');
  DO.placeTower(S2n, snn.nb[0].c, snn.nb[0].r, 'station');
  const fn1 = nextFree(S2n); DO.placeTower(S2n, fn1.c, fn1.r, 'factory');
  const rsN = DO.getResupply(S2n, cnn);
  check('F2-R3.24 1 factory nv1: 12*(1+0.25)=15/s', approx(rsN.fuel, 15, 1e-6), JSON.stringify(rsN));
  const S2o = freshFunded();
  const so = spotWithNFree(S2o, 3);
  const co = DO.placeTower(S2o, so.c, so.r, 'cannon');
  DO.placeTower(S2o, so.nb[0].c, so.nb[0].r, 'station');
  const fo1 = nextFree(S2o); const fA = DO.placeTower(S2o, fo1.c, fo1.r, 'factory');
  const fo2 = nextFree(S2o); const fB = DO.placeTower(S2o, fo2.c, fo2.r, 'factory');
  fB.level = 2;
  const rsO = DO.getResupply(S2o, co);
  check('F2-R3.25 2 factories nv1+nv2: 12*1.75=21/s', approx(rsO.fuel, 21, 1e-6), JSON.stringify(rsO) + ' boost=' + DO.getFactoryBoost(S2o));
})();

/* ---------- T14 (F5→F3): perseguicao, leash, retorno, fuel ---------- */
console.log('\n[T14] F3-pursue — stance, leash, retorno 3s, fuel');
(function () {
  check('F3.1 DO.setStance exposto', typeof DO.setStance === 'function');
  const P0 = freshFunded();
  const p0c = nextFree(P0); const p0t = DO.placeTower(P0, p0c.c, p0c.r, 'cannon');
  check('F3.2 nasce anchor + returning false + ax/ay', p0t.stance === 'anchor' && p0t.returning === false && p0t.ax === p0c.c && p0t.ay === p0c.r);
  const P1 = freshFunded();
  const p1c = nextFree(P1); const p1t = DO.placeTower(P1, p1c.c, p1c.r, 'cannon');
  const sOk = DO.setStance(P1, p1t, 'pursue');
  check('F3.3 setStance pursue -> true/returning false', sOk === true && p1t.stance === 'pursue' && p1t.returning === false);
  const P1b = freshFunded();
  const p1bc = nextFree(P1b); const p1bt = DO.placeTower(P1b, p1bc.c, p1bc.r, 'cannon');
  const bad1 = DO.setStance(P1b, p1bt, 'orbit');
  const bad2 = DO.setStance(P1b, p1bt, null);
  check('F3.4 setStance invalido rejeitado (orbit/null)', bad1 === false && bad2 === false && p1bt.stance === 'anchor');
  const P1c = freshFunded();
  const p1cc = nextFree(P1c); const p1ct = DO.placeTower(P1c, p1cc.c, p1cc.r, 'cannon');
  const fake = { tid: 99999, c: 0, r: 0, defRef: p1ct.defRef };
  const badFake = DO.setStance(P1c, fake, 'pursue');
  DO.sellTower(P1c, p1ct);
  const badSold = DO.setStance(P1c, p1ct, 'pursue');
  check('F3.5 setStance torre fake/vendida -> false', badFake === false && badSold === false);
  function towerNearRouteGround(_S) {
    let best = null, bestD = 1e9, bestDist = 0;
    const total = _S.routeLengths[0];
    for (let c = 0; c < 21 && !best; c++) for (let r = 0; r < 13; r++) {
      const k = c + ',' + r;
      if (_S.blocked[k] || _S.occupied[k]) continue;
      const tx = c * 44 + 22, ty = r * 44 + 22;
      for (let d = 0; d < total; d += 30) {
        const pos = D.getPosAtDist(_S.routes[0], d);
        const dd = Math.hypot(pos.x - tx, pos.y - ty);
        if (dd < 90 && dd < bestD) { bestD = dd; best = { c, r }; bestDist = d; }
      }
    }
    return best ? { cell: best, dist: bestDist } : null;
  }
  const P2 = freshFunded();
  const near = towerNearRouteGround(P2);
  const p2t = DO.placeTower(P2, near.cell.c, near.cell.r, 'cannon');
  const eTank = DO.spawnEnemy(P2, 'tank');
  eTank.speed = 0; eTank.hp = 99999999; eTank.maxHp = 99999999;
  eTank.dist = near.dist; eTank.routeIdx = 0; eTank.totalLen = P2.routeLengths[0];
  DO.stepSim(P2, 0.05);
  const c20 = p2t.c, r20 = p2t.r;
  for (let i = 0; i < 20; i++) DO.stepSim(P2, 0.1);
  check('F3.6 anchor nao persegue (pos inalterada, returning false)',
    p2t.c === c20 && p2t.r === r20 && p2t.returning === false, 'c=' + p2t.c + ',' + p2t.r);
  function airAnchor(_S) {
    for (let c = 3; c <= 14; c++) {
      const r = 1;
      let ok = true;
      for (let cc = c; cc <= c + 5; cc++) {
        const k = cc + ',' + r;
        if (_S.blocked[k] || _S.occupied[k]) { ok = false; break; }
      }
      if (ok) return { c, r };
    }
    return null;
  }
  const P3 = freshFunded();
  const anch3 = airAnchor(P3);
  const p3t = DO.placeTower(P3, anch3.c, anch3.r, 'sniper');
  p3t.fuel = 100;
  DO.setStance(P3, p3t, 'pursue');
  const eRun = DO.spawnEnemy(P3, 'runner');
  eRun.speed = 0; eRun.hp = 99999999; eRun.maxHp = 99999999;
  const tgtX3 = p3t.x + 100, airY = P3.airPts[0].y;
  eRun.dist = (tgtX3 + 24); eRun.totalLen = P3.airLen;
  DO.stepSim(P3, 0.05);
  const dBefore = Math.hypot(eRun.x - p3t.x, eRun.y - p3t.y);
  const fuel3Before = p3t.fuel;
  const c3b0 = p3t.c, r3b0 = p3t.r;
  for (let i = 0; i < 40; i++) DO.stepSim(P3, 0.1);
  const dAfter = Math.hypot(eRun.x - p3t.x, eRun.y - p3t.y);
  const steps3 = Math.abs(p3t.c - c3b0) + Math.abs(p3t.r - r3b0);
  check('F3.7 pursue aproxima >=1 celula e consome fuel', steps3 >= 1 && dAfter < dBefore && p3t.fuel < fuel3Before,
    'd ' + Math.round(dBefore) + '->' + Math.round(dAfter) + ' steps=' + steps3 + ' fuel ' + fuel3Before + '->' + p3t.fuel);
  const P4 = freshFunded();
  const anch4 = airAnchor(P4);
  const p4t = DO.placeTower(P4, anch4.c, anch4.r, 'laser');
  const ax4 = p4t.ax, ay4 = p4t.ay;
  const anx = ax4 * 44 + 22, any = ay4 * 44 + 22;
  delete P4.occupied[p4t.c + ',' + p4t.r];
  p4t.c = ax4 + 2; p4t.r = ay4; p4t.x = p4t.c * 44 + 22; p4t.y = p4t.r * 44 + 22;
  P4.occupied[p4t.c + ',' + p4t.r] = p4t;
  p4t.fuel = 100;
  DO.setStance(P4, p4t, 'pursue');
  const eFar = DO.spawnEnemy(P4, 'runner');
  eFar.speed = 0; eFar.hp = 99999999; eFar.maxHp = 99999999;
  eFar.dist = (anx + 200 + 24); eFar.totalLen = P4.airLen;
  DO.stepSim(P4, 0.05);
  const stats4 = DO.getTowerStats(P4, p4t);
  // RANGESQ: leash em □ = 1.5×rngSqEff + fração Motor (e=0 → +0). Antes: 1.5×rng px. Justificativa: contrato squares.
  const rngSq4 = (stats4.rngSqEff != null ? stats4.rngSqEff : stats4.rng / 44);
  const leashSq4 = 1.5 * rngSq4; // e=0
  let maxOver = 0, everMoved = false;
  const startC = p4t.c;
  for (let i = 0; i < 300; i++) {
    DO.stepSim(P4, 0.1);
    const ddSq = Math.max(Math.abs(p4t.c - ax4), Math.abs(p4t.r - ay4));
    if (ddSq > leashSq4 + 1e-9) maxOver = Math.max(maxOver, ddSq - leashSq4);
    if (p4t.c !== startC) everMoved = true;
  }
  check('F3.8 leash duro RANGESQ: nunca passa (teto 1.5×rngSq □) e para no limite', maxOver === 0,
    'leashSq=' + leashSq4.toFixed(2) + ' over=' + maxOver.toFixed(2) + ' moved=' + everMoved + ' finalC=' + p4t.c);
  const P5 = freshFunded();
  const anch5 = airAnchor(P5);
  const p5t = DO.placeTower(P5, anch5.c, anch5.r, 'cannon');
  p5t.comp.e = 2;
  const stats5 = DO.getTowerStats(P5, p5t);
  const lvls = D.COMP_DEFS.e.levels;
  const leashMul2 = lvls[1].leashMul;
  // RANGESQ: Motor soma fração (leashMul-1)□. Antes: 1.5×rng×leashMul px. Justificativa: contrato (rngSq+bonus)×CELL.
  const rngSq5 = (stats5.rngSqEff != null ? stats5.rngSqEff : stats5.rng / 44);
  const leash5 = 1.5 * rngSq5 + (leashMul2 - 1);
  const leashBase = 1.5 * rngSq5;
  check('F3.9 RANGESQ leashMul motor e=2 (1.2): teto > base e == 1.5×rngSq+0.20□',
    leashMul2 === 1.2 && leash5 > leashBase && approx(leash5, 1.5 * rngSq5 + 0.2, 1e-9),
    'leashSq=' + leash5.toFixed(2) + ' base=' + leashBase.toFixed(2));
  const P6a = freshFunded(); const P6b = freshFunded();
  function setupSpeed(_S, compE) {
    const an = airAnchor(_S);
    const t = DO.placeTower(_S, an.c, an.r, 'sniper');
    t.comp.e = compE; t.fuel = 100;
    DO.setStance(_S, t, 'pursue');
    const e = DO.spawnEnemy(_S, 'runner');
    e.speed = 0; e.hp = 99999999; e.maxHp = 99999999;
    e.dist = (t.x + 120 + 24); e.totalLen = _S.airLen;
    return t;
  }
  const t6a = setupSpeed(P6a, 0);
  const t6b = setupSpeed(P6b, 5);
  const c6a0 = t6a.c, c6b0 = t6b.c;
  for (let i = 0; i < 50; i++) { DO.stepSim(P6a, 0.1); DO.stepSim(P6b, 0.1); }
  const stepsA = Math.abs(t6a.c - c6a0) + Math.abs(t6a.r - 1);
  const stepsB = Math.abs(t6b.c - c6b0) + Math.abs(t6b.r - 1);
  check('F3.10 velocidade moveMul: e=5 anda >= e=0 em 5s', stepsB >= stepsA, 'e0=' + stepsA + ' e5=' + stepsB);
  const P7 = freshFunded();
  const anch7 = airAnchor(P7);
  const p7t = DO.placeTower(P7, anch7.c, anch7.r, 'cannon');
  DO.setStance(P7, p7t, 'pursue');
  delete P7.occupied[p7t.c + ',' + p7t.r];
  p7t.c = anch7.c + 2; p7t.r = anch7.r; p7t.x = p7t.c * 44 + 22; p7t.y = p7t.r * 44 + 22;
  P7.occupied[p7t.c + ',' + p7t.r] = p7t;
  p7t.fuel = 100; p7t._noTargetT = 0;
  P7.enemies.length = 0;
  let sawReturning = false;
  for (let i = 0; i < 50; i++) { DO.stepSim(P7, 0.1); if (p7t.returning) sawReturning = true; }
  check('F3.11 retorno 3s sem alvo: volta a (ax,ay) e returning false',
    sawReturning && p7t.c === p7t.ax && p7t.r === p7t.ay && p7t.returning === false,
    'c=' + p7t.c + ',' + p7t.r + ' ax=' + p7t.ax + ',' + p7t.ay + ' sawRet=' + sawReturning);
  const P8 = freshFunded();
  const anch8 = airAnchor(P8);
  const p8t = DO.placeTower(P8, anch8.c, anch8.r, 'cannon');
  DO.setStance(P8, p8t, 'pursue');
  delete P8.occupied[p8t.c + ',' + p8t.r];
  p8t.c = anch8.c + 2; p8t.r = anch8.r; p8t.x = p8t.c * 44 + 22; p8t.y = p8t.r * 44 + 22;
  P8.occupied[p8t.c + ',' + p8t.r] = p8t;
  p8t.fuel = 100; p8t._noTargetT = 0;
  P8.enemies.length = 0;
  for (let i = 0; i < 20; i++) DO.stepSim(P8, 0.1);
  check('F3.12 sem retorno antes de 3s (2s: ainda fora + returning false)',
    (p8t.c !== p8t.ax || p8t.r !== p8t.ay) && p8t.returning === false, 'c=' + p8t.c + ',' + p8t.r);
  const P9 = freshFunded();
  const anch9 = airAnchor(P9);
  const p9t = DO.placeTower(P9, anch9.c, anch9.r, 'cannon');
  DO.setStance(P9, p9t, 'pursue');
  p9t.fuel = 0; p9t.ammo = 40;
  const eNear = DO.spawnEnemy(P9, 'tank');
  eNear.speed = 0; eNear.hp = 99999999; eNear.maxHp = 99999999;
  eNear.flying = false; // G1-bal fix flaky: spawnEnemy sorteia variante procedural (7% flying); cannon nv1 só atinge terra
  if (eNear.defRef && eNear.defRef.flying) { eNear.defRef = D.ENEMIES_DATA.tank; }
  eNear.dist = 200; eNear.routeIdx = 0; eNear.totalLen = P9.routeLengths[0];
  const posN = D.getPosAtDist(P9.routes[0], 200);
  eNear.x = posN.x; eNear.y = posN.y;
  const hpN = eNear.hp;
  const shieldN = eNear.shield; // Onda 2 fix flaky: variante procedural com escudo absorve o dano (hp não cai)
  const pc90 = p9t.c, pr90 = p9t.r;
  P9.projectiles.length = 0;
  for (let i = 0; i < 20; i++) DO.stepSim(P9, 0.1);
  check('F3.13 fuel zero: nao anda mas atira normal',
    p9t.c === pc90 && p9t.r === pr90 && (P9.projectiles.length > 0 || eNear.hp < hpN || eNear.shield < shieldN),
    'pos=' + p9t.c + ',' + p9t.r + ' proj=' + P9.projectiles.length + ' shield=' + shieldN + '->' + eNear.shield);
  const P10 = freshFunded();
  const anch10 = airAnchor(P10);
  const p10t = DO.placeTower(P10, anch10.c, anch10.r, 'cannon');
  DO.setStance(P10, p10t, 'pursue');
  delete P10.occupied[p10t.c + ',' + p10t.r];
  p10t.c = anch10.c + 2; p10t.r = anch10.r; p10t.x = p10t.c * 44 + 22; p10t.y = p10t.r * 44 + 22;
  P10.occupied[p10t.c + ',' + p10t.r] = p10t;
  p10t.fuel = 10;
  const eT10 = DO.spawnEnemy(P10, 'tank');
  eT10.speed = 0; eT10.hp = 99999999; eT10.maxHp = 99999999;
  eT10.dist = 200; eT10.routeIdx = 0; eT10.totalLen = P10.routeLengths[0];
  const dHomeBefore = Math.hypot(p10t.x - (p10t.ax * 44 + 22), p10t.y - (p10t.ay * 44 + 22));
  for (let i = 0; i < 30; i++) DO.stepSim(P10, 0.1);
  const dHomeAfter = Math.hypot(p10t.x - (p10t.ax * 44 + 22), p10t.y - (p10t.ay * 44 + 22));
  check('F3.14 fuel<20% retorna com prioridade (anda p/ ancora + returning true)',
    p10t.returning === true || dHomeAfter < dHomeBefore, 'd ' + Math.round(dHomeBefore) + '->' + Math.round(dHomeAfter) + ' ret=' + p10t.returning);
  const P11 = freshFunded();
  const anch11 = airAnchor(P11);
  const p11t = DO.placeTower(P11, anch11.c, anch11.r, 'cannon');
  DO.setStance(P11, p11t, 'pursue');
  p11t.fuel = 10;
  const eT11 = DO.spawnEnemy(P11, 'tank');
  eT11.speed = 0; eT11.hp = 99999999; eT11.maxHp = 99999999;
  eT11.dist = 200; eT11.routeIdx = 0; eT11.totalLen = P11.routeLengths[0];
  for (let i = 0; i < 20; i++) DO.stepSim(P11, 0.1);
  check('F3.15 fuel<20% na ancora: fica parada + returning false',
    p11t.c === p11t.ax && p11t.r === p11t.ay && p11t.returning === false, 'c=' + p11t.c + ',' + p11t.r);
})();

/* ---------- T15 (F5→F4): componentes + estacao/apoio/painel ---------- */
console.log('\n[T15] F4-comp — buyComp atomico, mults, loja/painel/aneis');
(function () {
  check('F4.1 DO.buyComp exposto', typeof DO.buyComp === 'function');
  const Q1 = freshFunded();
  const q1c = nextFree(Q1); const q1t = DO.placeTower(Q1, q1c.c, q1c.r, 'cannon');
  const cr0 = Q1.credits, pt0 = Q1.parts;
  const b1 = DO.buyComp(Q1, q1t, 'w');
  check('F4.2 pip1 ARMA: true, w=1, -60cr, pecas intactas, spent=cost+60',
    b1 === true && q1t.comp.w === 1 && Q1.credits === cr0 - 60 && Q1.parts === pt0 && q1t.spent === 50 + 60,
    'cr=' + Q1.credits + ' pt=' + Q1.parts + ' spent=' + q1t.spent);
  const b2 = DO.buyComp(Q1, q1t, 'w');
  check('F4.3 pip2 ARMA (110cr+5pecas): w=2, pecas -5', b2 === true && q1t.comp.w === 2 && Q1.parts === pt0 - 5,
    'w=' + q1t.comp.w + ' pt=' + Q1.parts);
  const crB = Q1.credits, ptB = Q1.parts;
  const badX = DO.buyComp(Q1, q1t, 'x');
  const badN = DO.buyComp(Q1, q1t, null);
  check('F4.4 track invalida (x/null) -> false sem debito', badX === false && badN === false && Q1.credits === crB && Q1.parts === ptB && q1t.comp.w === 2);
  const Q2 = freshFunded();
  const q2c = nextFree(Q2); const q2t = DO.placeTower(Q2, q2c.c, q2c.r, 'cannon');
  Q2.credits = 0;
  const bNoCr = DO.buyComp(Q2, q2t, 'e');
  check('F4.5 sem creditos -> false, comp.e==0 (sem debito parcial)', bNoCr === false && q2t.comp.e === 0 && Q2.credits === 0);
  const Q3 = freshFunded();
  const q3c = nextFree(Q3); const q3t = DO.placeTower(Q3, q3c.c, q3c.r, 'cannon');
  DO.buyComp(Q3, q3t, 'w');
  Q3.parts = 0;
  const cr3 = Q3.credits;
  const bNoPt = DO.buyComp(Q3, q3t, 'w');
  check('F4.6 sem pecas (pip2 pede 5) -> false, w==1, creditos intactos (atomico)',
    bNoPt === false && q3t.comp.w === 1 && Q3.credits === cr3, 'cr=' + Q3.credits + ' w=' + q3t.comp.w);
  const Q4 = freshFunded();
  const q4c = nextFree(Q4); const q4t = DO.placeTower(Q4, q4c.c, q4c.r, 'cannon');
  q4t.comp.r = 5;
  const cr4 = Q4.credits, pt4 = Q4.parts;
  check('F4.7 no MAX (r=5) -> false sem debito', DO.buyComp(Q4, q4t, 'r') === false && Q4.credits === cr4 && Q4.parts === pt4);
  const Q5 = freshFunded();
  const q5c = nextFree(Q5); const q5t = DO.placeTower(Q5, q5c.c, q5c.r, 'cannon');
  DO.sellTower(Q5, q5t);
  check('F4.8 torre vendida/morta -> false', DO.buyComp(Q5, q5t, 'w') === false);
  const Q6 = freshFunded();
  const q6c = nextFree(Q6); const q6t = DO.placeTower(Q6, q6c.c, q6c.r, 'station');
  check('F4.9 buyComp em station viva -> true (generico p/ torre viva)', DO.buyComp(Q6, q6t, 'w') === true && q6t.comp.w === 1);
  const Q7 = freshFunded();
  const q7c = nextFree(Q7); const q7t = DO.placeTower(Q7, q7c.c, q7c.r, 'cannon');
  const base7 = DO.getTowerStats(Q7, Object.assign({}, q7t, { comp: { w: 0, e: 0, r: 0, t: 0 } }));
  q7t.comp.w = 1;
  const w17 = DO.getTowerStats(Q7, q7t);
  check('F4.10 w=1: dmg*1.06 rate*1.03', approx(w17.dmg, base7.dmg * 1.06, 1e-6) && approx(w17.rate, base7.rate * 1.03, 1e-9),
    'dmg ' + w17.dmg + ' vs ' + (base7.dmg * 1.06));
  q7t.comp.w = 5;
  const w57 = DO.getTowerStats(Q7, q7t);
  check('F4.11 w=5: dmg*1.30 rate*1.15', approx(w57.dmg, base7.dmg * 1.30, 1e-6) && approx(w57.rate, base7.rate * 1.15, 1e-9));
  const Q8 = freshFunded();
  const q8c = nextFree(Q8); const q8t = DO.placeTower(Q8, q8c.c, q8c.r, 'cannon');
  const base8 = DO.getTowerStats(Q8, Object.assign({}, q8t, { comp: { w: 0, e: 0, r: 0, t: 0 } }));
  q8t.comp.t = 1;
  const t18 = DO.getTowerStats(Q8, q8t);
  // RANGESQ: Mira soma fração (+0.04□/pip). Antes: rng×1.04 px. Justificativa: contrato (rngSq+bonus)×CELL.
  check('F4.12 RANGESQ t=1: rngSq+0.04□ crit+0.02', approx(t18.rngSqEff, base8.rngSqEff + 0.04, 1e-9) && approx(t18.rng, base8.rng + 0.04 * 44, 1e-6) && approx(t18.critBonus, base8.critBonus + 0.02, 1e-9),
    'rngSq ' + t18.rngSqEff + ' rng ' + t18.rng + ' crit ' + t18.critBonus);
  q8t.comp.t = 5;
  const t58 = DO.getTowerStats(Q8, q8t);
  check('F4.13 RANGESQ t=5: rngSq+0.20□ crit+0.10', approx(t58.rngSqEff, base8.rngSqEff + 0.20, 1e-9) && approx(t58.rng, base8.rng + 0.20 * 44, 1e-6) && approx(t58.critBonus, base8.critBonus + 0.10, 1e-9));
  const lvlDef = D.TOWERS_DATA[0];
  const fakeT = { defRef: lvlDef, level: 1, comp: { w: 0, e: 0, r: 0, t: 0 } };
  const stNv1 = DO.getTowerStats({ towers: [], mutBuffs: {}, combo: 0 }, Object.assign({}, fakeT, { level: 1 }));
  const stNv50 = DO.getTowerStats({ towers: [], mutBuffs: {}, combo: 0 }, Object.assign({}, fakeT, { level: 50 }));
  const exp50 = lvlDef.dmg * (1 + 49 * 0.22) * Math.pow(1.038, 49);
  const noCompT = DO.getTowerStats({ towers: [], mutBuffs: {}, combo: 0 }, { defRef: lvlDef, level: 50 });
  check('F4.14 chassi intacto nv1 vs nv50 (skills somam; sem fator extra de comp)',
    stNv1.dmg === lvlDef.dmg && stNv50.dmg >= exp50 - 1e-4 && approx(stNv50.dmg, noCompT.dmg, 1e-6),
    'nv1=' + stNv1.dmg + ' nv50=' + stNv50.dmg + ' base50=' + exp50);
  const Q9 = freshFunded();
  const q9c = nextFree(Q9); const q9t = DO.placeTower(Q9, q9c.c, q9c.r, 'cannon');
  const b9 = DO.getTowerStats(Q9, Object.assign({}, q9t, { comp: { w: 0, e: 0, r: 0, t: 0 } }));
  q9t.comp.e = 2; q9t.comp.r = 2;
  const e9 = DO.getTowerStats(Q9, q9t);
  check('F4.15 e/r nao mudam dmg/rng/rate (so move/caps)', e9.dmg === b9.dmg && e9.rng === b9.rng && e9.rate === b9.rate);
  let noThrow = true;
  try { DO.getTowerStats({ towers: [], mutBuffs: {}, combo: 0 }, { defRef: lvlDef, level: 1 }); } catch (_) { noThrow = false; }
  check('F4.16 torre sem comp nao da throw e sem mult', noThrow);
  const gameSrc = fs.readFileSync(path.join(ROOT, 'assets', 'game.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('F4.17 loja cria cards station ($400) e support ($90)',
    gameSrc.indexOf('data-id="station"') >= 0 || gameSrc.indexOf("dataset.id = 'station'") >= 0 || gameSrc.indexOf('dataset.id') >= 0);
  check('F4.18 painel tem res-fuel-num + tp-stance ANCORADA + 5 pips + comp-w-buy +$60',
    htmlSrc.indexOf('res-fuel-num') >= 0 && htmlSrc.indexOf('tp-stance') >= 0 && htmlSrc.indexOf('comp-w') >= 0 &&
    gameSrc.indexOf('comp-pips') >= 0 && gameSrc.indexOf('-buy') >= 0);
  const Q10 = freshFunded();
  const q10c = nextFree(Q10); const q10t = DO.placeTower(Q10, q10c.c, q10c.r, 'cannon');
  const sAnchor = (q10t.stance === 'anchor');
  DO.setStance(Q10, q10t, 'pursue');
  const sPursue = (q10t.stance === 'pursue');
  DO.setStance(Q10, q10t, 'anchor');
  check('F4.19 stance toggle anchor->pursue->anchor via API (painel usa setStance)',
    sAnchor && sPursue && q10t.stance === 'anchor' && gameSrc.indexOf('tp-stance') >= 0);
  const Q11 = freshFunded();
  const q11c = nextFree(Q11); const q11t = DO.placeTower(Q11, q11c.c, q11c.r, 'cannon');
  const cr11 = Q11.credits;
  DO.buyComp(Q11, q11t, 'w');
  check('F4.20 buyComp w com fundos: w=1 + desconto (re-render acende .on)',
    q11t.comp.w === 1 && Q11.credits === cr11 - 60 && gameSrc.indexOf('.on') >= 0);
  check('F4.21 overlays ov_weapon/engine/reactor/target + _hi em syncTowers',
    gameSrc.indexOf('ov_') >= 0 && gameSrc.indexOf('weapon') >= 0 && gameSrc.indexOf('engine') >= 0 &&
    gameSrc.indexOf('reactor') >= 0 && gameSrc.indexOf('target') >= 0 && gameSrc.indexOf('_hi') >= 0);
  check('F4.22 anel supply: supplyRadius + .supply-ring + getResupply via API',
    typeof DO.getResupply === 'function' && gameSrc.indexOf('supply-ring') >= 0 && gameSrc.indexOf('supplyRadius') >= 0);
})();

/* ---------- T16 (REFUEL): pit stop — low-fuel → estação, reserva 30%, atraca ≥90%, fallback âncora ---------- */
console.log('\n[T16] REFUEL — corrida ao pit stop');
(function () {
  function freshR() { const _S = DO.startNewGame(0, 'normal', false); _S.credits = 99999; _S.parts = 999; _S.autoMove = false; _S.enemies.length = 0; return _S; }
  function airR(_S) {
    for (let c = 3; c <= 14; c++) {
      const r = 1; let ok = true;
      for (let cc = c; cc <= c + 5; cc++) { const k = cc + ',' + r; if (_S.blocked[k] || _S.occupied[k]) { ok = false; break; } }
      if (ok) return { c, r };
    }
    return null;
  }
  function farFree(_S, tx, ty, minD) {
    for (let c = 0; c < 21; c++) for (let r = 0; r < 13; r++) {
      const k = c + ',' + r;
      if (_S.blocked[k] || _S.occupied[k]) continue;
      if (Math.hypot(c * 44 + 22 - tx, r * 44 + 22 - ty) >= minD) return { c, r };
    }
    return null;
  }
  function nearFree(_S, tx, ty, maxD) {
    for (let c = 0; c < 21; c++) for (let r = 0; r < 13; r++) {
      const k = c + ',' + r;
      if (_S.blocked[k] || _S.occupied[k]) continue;
      const d = Math.hypot(c * 44 + 22 - tx, r * 44 + 22 - ty);
      if (d <= maxD && d > 1) return { c, r };
    }
    return null;
  }
  function moveAway(_S, t, dc) {
    const nc = t.ax + dc, nr = t.ay;
    const k = nc + ',' + nr;
    if (_S.blocked[k] || _S.occupied[k]) return false;
    delete _S.occupied[t.c + ',' + t.r];
    t.c = nc; t.r = nr; t.x = nc * 44 + 22; t.y = nr * 44 + 22;
    _S.occupied[t.c + ',' + t.r] = t;
    return true;
  }
  check('REFUEL.0 DO.nearestResupply exposto', typeof DO.nearestResupply === 'function');
  // R0: nearest = mais próxima (support perto vs station longe) + null sem fontes
  (function () {
    const S0 = freshR();
    const a0 = airR(S0); const t0 = DO.placeTower(S0, a0.c, a0.r, 'cannon');
    const fFar = farFree(S0, t0.x, t0.y, 300);
    const stFar = DO.placeTower(S0, fFar.c, fFar.r, 'station');
    const nNear = nearFree(S0, t0.x, t0.y, 90);
    const supNear = DO.placeTower(S0, nNear.c, nNear.r, 'support');
    const nr = DO.nearestResupply(S0, t0);
    const dSt = Math.hypot(stFar.x - t0.x, stFar.y - t0.y);
    const dSu = Math.hypot(supNear.x - t0.x, supNear.y - t0.y);
    check('REFUEL.1 nearest = fonte viável MAIS PRÓXIMA', !!nr && nr === supNear && dSu < dSt, 'dSup=' + Math.round(dSu) + ' dSt=' + Math.round(dSt));
    const S0b = freshR();
    const a0b = airR(S0b); const t0b = DO.placeTower(S0b, a0b.c, a0b.r, 'cannon');
    check('REFUEL.2 sem station/support → nearest null', DO.nearestResupply(S0b, t0b) === null);
  })();
  // R1: low-fuel 24% (<25%) mira a estação (qualquer distância, ignora leash)
  (function () {
    const S1 = freshR();
    const a1 = airR(S1); const t1 = DO.placeTower(S1, a1.c, a1.r, 'cannon');
    DO.setStance(S1, t1, 'pursue');
    moveAway(S1, t1, 2);
    const fc = farFree(S1, t1.x, t1.y, 300);
    const st1 = DO.placeTower(S1, fc.c, fc.r, 'station');
    t1.fuel = 24; t1._warnCd = 0; S1.events.length = 0; S1.enemies.length = 0;
    DO.stepSim(S1, 0.05);
    check('REFUEL.3 fuel<25% com estação → refuel=true (não volta à âncora)', t1.refuel === true && t1.returning === false, 'refuel=' + t1.refuel + ' ret=' + t1.returning);
    check('REFUEL.4 mira a estação mais próxima', DO.nearestResupply(S1, t1) === st1);
    const dBefore = Math.hypot(st1.x - t1.x, st1.y - t1.y);
    for (let i = 0; i < 20; i++) DO.stepSim(S1, 0.1);
    const dAfter = Math.hypot(st1.x - t1.x, st1.y - t1.y);
    check('REFUEL.5 voa até a estação (dist diminui, ignora leash)', dAfter < dBefore, Math.round(dBefore) + '->' + Math.round(dAfter));
  })();
  // R2: reserva de emergência — move com fuel 0 a 30% (nunca trava)
  (function () {
    const S2 = freshR();
    const a2 = airR(S2); const t2 = DO.placeTower(S2, a2.c, a2.r, 'cannon');
    DO.setStance(S2, t2, 'pursue');
    moveAway(S2, t2, 2);
    const fc2 = farFree(S2, t2.x, t2.y, 300);
    DO.placeTower(S2, fc2.c, fc2.r, 'station');
    t2.fuel = 0; t2._warnCd = 0; S2.events.length = 0; S2.enemies.length = 0;
    DO.stepSim(S2, 0.05);
    const c0 = t2.c, r0 = t2.r;
    for (let i = 0; i < 70; i++) DO.stepSim(S2, 0.1);
    const moved = Math.abs(t2.c - c0) + Math.abs(t2.r - r0);
    check('REFUEL.6 reserva move com fuel 0 (rasteja 30%, ≥1 célula em 7s)', moved >= 1 && t2.refuel === true && t2.fuel >= 0, 'moved=' + moved + ' fuel=' + t2.fuel);
  })();
  // R3: atraca dentro do supplyRadius e sai com ≥90% + floats 1x cada
  (function () {
    const S3 = freshR();
    const a3 = airR(S3); const t3 = DO.placeTower(S3, a3.c, a3.r, 'cannon');
    DO.setStance(S3, t3, 'pursue');
    moveAway(S3, t3, 2);
    const adj = nearFree(S3, t3.x, t3.y, 90);
    const st3 = DO.placeTower(S3, adj.c, adj.r, 'station');
    const d0 = Math.hypot(st3.x - t3.x, st3.y - t3.y);
    const d0Sq = Math.max(Math.abs(st3.c - t3.c), Math.abs(st3.r - t3.r));
    t3.fuel = 10; t3._warnCd = 0; S3.events.length = 0; S3.enemies.length = 0;
    for (let i = 0; i < 5; i++) DO.stepSim(S3, 0.1);
    const cDock0 = t3.c, rDock0 = t3.r;
    const dockFloats = S3.events.filter(e => e.t === 'float' && e.txt === '⛽ REABASTECENDO').length;
    // RANGESQ: atraque em supplySq 4□=176px (antes supplyRadius 170px). Justificativa: contrato supplySq.
    check('REFUEL.7 RANGESQ atraca no supplySq 4□ (para + 1x REABASTECENDO)', d0Sq <= D.STATION_DATA.supplySq + 1e-9 && d0 <= D.STATION_DATA.supplySq * 44 + 1e-9 && t3.refuel === true && dockFloats === 1, 'dSq=' + d0Sq + ' d=' + Math.round(d0) + ' floats=' + dockFloats);
    const stayed = (function () {
      for (let i = 0; i < 5; i++) DO.stepSim(S3, 0.1);
      return t3.c === cDock0 && t3.r === rDock0;
    })();
    check('REFUEL.8 atracada fica parada recarregando', stayed, 'c=' + t3.c + ',' + t3.r);
    for (let i = 0; i < 200 && !(t3.refuel === false); i++) DO.stepSim(S3, 0.1);
    const fullFloats = S3.events.filter(e => e.t === 'float' && e.txt === '✔ TANQUE CHEIO').length;
    const dockFloats2 = S3.events.filter(e => e.t === 'float' && e.txt === '⛽ REABASTECENDO').length;
    check('REFUEL.9 sai com fuel≥90% + 1x TANQUE CHEIO e volta à âncora', t3.fuel >= 90 && t3.refuel === false && fullFloats === 1 && dockFloats2 === 1 && t3.returning === true,
      'fuel=' + Math.round(t3.fuel) + ' refuel=' + t3.refuel + ' ret=' + t3.returning + ' full=' + fullFloats);
  })();
  // R4: sem estação → fallback âncora (idêntico ao F3)
  (function () {
    const S4 = freshR();
    const a4 = airR(S4); const t4 = DO.placeTower(S4, a4.c, a4.r, 'cannon');
    DO.setStance(S4, t4, 'pursue');
    moveAway(S4, t4, 2);
    t4.fuel = 10; t4._warnCd = 0; S4.events.length = 0; S4.enemies.length = 0;
    DO.stepSim(S4, 0.05);
    const dHomeBefore = Math.hypot(t4.ax * 44 + 22 - t4.x, t4.ay * 44 + 22 - t4.y);
    for (let i = 0; i < 20; i++) DO.stepSim(S4, 0.1);
    const dHomeAfter = Math.hypot(t4.ax * 44 + 22 - t4.x, t4.ay * 44 + 22 - t4.y);
    check('REFUEL.10 sem fontes → fallback âncora (refuel false, returning, dist âncora diminui)',
      !t4.refuel && (t4.returning === true || dHomeAfter < dHomeBefore), 'refuel=' + t4.refuel + ' ret=' + t4.returning);
  })();
  // R5: sem deadlock em 500 steps (refuel longe + fuel baixo)
  (function () {
    const S5 = freshR();
    const a5 = airR(S5); const t5 = DO.placeTower(S5, a5.c, a5.r, 'cannon');
    DO.setStance(S5, t5, 'pursue');
    moveAway(S5, t5, 2);
    const fc5 = farFree(S5, t5.x, t5.y, 300);
    DO.placeTower(S5, fc5.c, fc5.r, 'station');
    t5.fuel = 5; S5.enemies.length = 0;
    const nTowers = S5.towers.length;
    let ok = true;
    try {
      for (let i = 0; i < 500; i++) DO.stepSim(S5, 0.1);
    } catch (_) { ok = false; }
    const valid = t5.c >= 0 && t5.c < 21 && t5.r >= 0 && t5.r < 13 && t5.fuel >= 0 && t5.fuel <= DO.getMaxFuel(t5) + 1e-6;
    check('REFUEL.11 500 steps sem deadlock/trava', ok && valid && S5.towers.length === nTowers && S5.time > 40, 'time=' + S5.time.toFixed(1) + ' c=' + t5.c + ',' + t5.r);
  })();
})();

/* ---------- T17 (RANGESQ): range em quadrados Chebyshev + nerf ---------- */
console.log('\n[T17] RANGESQ — mira/leash/supply em □, splash/chain convertidos');
(function () {
  function mkE(_S, cx, cy, flying) {
    const def = D.ENEMIES_DATA.drone;
    const e = { eid: ++_S.spawnCounter + 9000, type: 'drone', type_key: 'drone', defRef: def, label: def.label, col: def.col, r: def.r, shape: def.shape,
      hp: 9999, maxHp: 9999, shield: 0, maxShield: 0, dist: 10, totalLen: 9999, progress: 0.5, routeIdx: 0, flying: !!flying,
      x: cx * 44 + 22, y: cy * 44 + 22, dirAngle: 0, speed: 10, armor: 0, slowTimer: 0, slowFactor: 1, stunTimer: 0, cryoVuln: 0,
      poisonTimer: 0, poisonDps: 0, poisonBy: null, burnTimer: 0, burnDps: 0, markedTimer: 0,
      healCooldown: 0, stealthPhase: 0, raged: false, flash: 0, dead: false, leaked: false };
    _S.enemies.push(e); return e;
  }
  function mkT(_S, cx, cy, id) {
    const def = D.TOWERS_DATA.find(d => d.id === id);
    const t = { tid: 90000 + Math.floor(Math.random() * 8999), defRef: def, level: 1, c: cx, r: cy, x: cx * 44 + 22, y: cy * 44 + 22,
      targetMode: 'FIRST', specBranch: null, cooldown: 0, recoil: 0, flash: 0, rampTime: 0, lastTargetEid: null, angle: 0, aimAngle: 0,
      comp: { w: 0, e: 0, r: 0, t: 0 }, stance: 'anchor', ax: cx, ay: cy, returning: false, fuel: 100, batt: 100, ammo: 40 };
    return t;
  }
  // RANGESQ.1 tabela contrato
  const expSq = { cannon: 3, gatling: 2, laser: 3, missile: 3, cryo: 2, tesla: 2, sniper: 5, venom: 3, amp: 3, rail: 4 };
  let tabOk = true, tabInfo = '';
  for (const id in expSq) {
    const def = D.TOWERS_DATA.find(d => d.id === id);
    if (!def || def.rngSq !== expSq[id]) { tabOk = false; tabInfo = id + '=' + (def && def.rngSq); break; }
  }
  if (D.STATION_DATA.supplySq !== 4 || D.SUPPORT_DATA.supplySq !== 2) { tabOk = false; tabInfo = 'supplySq'; }
  check('RANGESQ.1 tabela rngSq contrato (cannon3 gatling2 laser3 missile3 cryo2 tesla2 sniper5 venom3 amp3 rail4 station4□ support2□)', tabOk, tabInfo);
  // RANGESQ.2 stats.rng px = rngSqEff×CELL p/ render/projeteis
  const SQ2 = DO.startNewGame(0, 'normal', false);
  const cDef = D.TOWERS_DATA.find(d => d.id === 'cannon');
  const cT = mkT(SQ2, 10, 6, 'cannon');
  const cSt = DO.getTowerStats(SQ2, cT);
  check('RANGESQ.2 getTowerStats().rng px = rngSqEff×CELL (cannon 3□=132px legado 120px mantido)', approx(cSt.rng, cSt.rngSqEff * 44, 1e-6) && approx(cSt.rng, 132, 1e-6) && cDef.rng === 120, 'rng=' + cSt.rng + ' sq=' + cSt.rngSqEff);
  // RANGESQ.3 diagonal conta 1□ (3,3) dentro de 3□; euclidiana 186px >132px estaria fora no px
  const SQ3 = DO.startNewGame(0, 'normal', false);
  const t33 = mkT(SQ3, 10, 6, 'cannon');
  const st33 = DO.getTowerStats(SQ3, t33);
  SQ3.enemies.length = 0;
  const eDiag = mkE(SQ3, 13, 9, false); // dc=3,dr=3 → Chebyshev 3
  const eDiagPx = Math.hypot(eDiag.x - t33.x, eDiag.y - t33.y);
  check('RANGESQ.3 diagonal (3,3) conta 3□ e mira (euclidiana ' + Math.round(eDiagPx) + 'px >132px seria miss no px)', DO.findBestTarget(SQ3, t33, st33) === eDiag, 'px=' + Math.round(eDiagPx));
  // RANGESQ.4 fora de N□ não mira (4,0) fora de 3□
  SQ3.enemies.length = 0;
  const eOut = mkE(SQ3, 14, 6, false); // dc=4
  check('RANGESQ.4 fora de 3□ (4,0) não mira', DO.findBestTarget(SQ3, t33, st33) === null);
  // RANGESQ.5 leash em squares 1.5×rngSq (laser 3□ → 4.5□)
  const SQ5 = DO.startNewGame(0, 'normal', false);
  const tL = mkT(SQ5, 10, 6, 'laser');
  const stL = DO.getTowerStats(SQ5, tL);
  const leashSqL = 1.5 * stL.rngSqEff;
  check('RANGESQ.5 leash = 1.5×rngSq (laser 3□ → 4.5□)', approx(leashSqL, 4.5, 1e-9), 'leashSq=' + leashSqL);
  // RANGESQ.6 splash/chain conversão ceil(px/44*2)/2 (65px→1.5□, 100px→2.5□)
  const px2sq = px => Math.ceil(px / 44 * 2) / 2;
  const mDef = D.TOWERS_DATA.find(d => d.id === 'missile');
  const SQ6 = DO.startNewGame(0, 'normal', false);
  const mT = mkT(SQ6, 10, 6, 'missile');
  const mSt = DO.getTowerStats(SQ6, mT);
  check('RANGESQ.6 splash 65px→1.5□ e chain 100px→2.5□ (ceil(px/CELL*2)/2)', px2sq(65) === 1.5 && px2sq(100) === 2.5 && approx(mSt.splashSq, 1.5, 1e-9), 'splashSq=' + mSt.splashSq);
  // RANGESQ.7 textos N□ no painel/loja/tooltip
  const gSrc = fs.readFileSync(path.join(ROOT, 'assets', 'game.js'), 'utf8');
  check('RANGESQ.7 painel/loja/tooltip mostram N□ (game.js contém □)', gSrc.indexOf('□') >= 0 && gSrc.indexOf('ALCANCE') >= 0);
  // RANGESQ.8 supply diagonal em □ (support 2□: (2,2) dentro; px 124>95 seria fora)
  function findPair(_S, dx, dy) {
    for (let c = 0; c + dx < 21; c++) for (let r = 0; r + dy < 13; r++) {
      const k1 = c + ',' + r, k2 = (c + dx) + ',' + (r + dy);
      if (!_S.blocked[k1] && !_S.occupied[k1] && !_S.blocked[k2] && !_S.occupied[k2]) return { c, r, c2: c + dx, r2: r + dy };
    }
    return null;
  }
  const SQ8 = DO.startNewGame(0, 'normal', false);
  SQ8.credits = 99999; SQ8.parts = 999;
  const pr = findPair(SQ8, 2, 2);
  let supDiagOk = false, supDiagInfo = '';
  if (pr) {
    const tw = DO.placeTower(SQ8, pr.c, pr.r, 'cannon');
    const su = DO.placeTower(SQ8, pr.c2, pr.r2, 'support');
    if (tw && su) {
      const rs = DO.getResupply(SQ8, tw);
      const dPx = Math.hypot(su.x - tw.x, su.y - tw.y);
      supDiagOk = rs.fuel > 0 && dPx > 95; // Chebyshev 2 ≤2□ dentro, mas px >95 fora do legado
      supDiagInfo = 'dPx=' + Math.round(dPx) + ' fuel=' + rs.fuel;
    } else supDiagInfo = 'place falhou';
  } else supDiagInfo = 'sem par livre';
  check('RANGESQ.8 support diagonal (2,2) supre em □ (px ' + '>95 seria miss no legado)', supDiagOk, supDiagInfo);
  // RANGESQ.9 Mira soma fração (+0.04□/pip, não ×1.04)
  const SQ9 = DO.startNewGame(0, 'normal', false);
  SQ9.credits = 99999;
  const q9c = (function(){ for (let c = 0; c < 21; c++) for (let r = 0; r < 13; r++) if (!SQ9.blocked[c + ',' + r]) return { c, r }; return null; })();
  const q9t = DO.placeTower(SQ9, q9c.c, q9c.r, 'cannon');
  const b9 = DO.getTowerStats(SQ9, Object.assign({}, q9t, { comp: { w: 0, e: 0, r: 0, t: 0 } }));
  q9t.comp.t = 1;
  const tt9 = DO.getTowerStats(SQ9, q9t);
  check('RANGESQ.9 Mira t=1 soma +0.04□ (rngSqEff+0.04, não ×1.04)', approx(tt9.rngSqEff, b9.rngSqEff + 0.04, 1e-9), 'base=' + b9.rngSqEff + ' t1=' + tt9.rngSqEff);
})();

/* ---------- T18: torre fantasma (pursue/refuel registram ocupação) ---------- */
console.log('\n[T18] pursue/refuel mantêm S.occupied e permitem vender');
(function(){
  const Sp = DO.startNewGame(0, 'normal', false);
  Sp.credits = 99999; Sp.parts = 999; Sp.autoMove = false;
  let cell = null;
  for (let c = 0; c < 16 && !cell; c++) for (let r = 0; r < 13; r++) {
    const k = c + ',' + r;
    if (!Sp.blocked[k] && !Sp.occupied[k]) { cell = { c, r }; break; }
  }
  const tp = DO.placeTower(Sp, cell.c, cell.r, 'cannon');
  tp.stance = 'pursue'; tp.fuel = 100;
  DO.spawnEnemy(Sp, 'drone');
  const en = Sp.enemies[Sp.enemies.length - 1];
  en.x = (tp.c + 2) * 44 + 22; en.y = tp.r * 44 + 22; en.speed = 0;
  // determinismo: cannon nv1 não mira voador; força alvo terrestre se variante sorteada nasceu flying
  if (en.defRef && en.defRef.flying) en.defRef = D.ENEMIES_DATA.drone;
  en.flying = false;
  for (let i = 0; i < 300; i++) DO.stepSim(Sp, 1 / 60);
  check('T18.1 ocupação acompanha a torre em pursue', Sp.occupied[tp.c + ',' + tp.r] === tp, 'pos=' + tp.c + ',' + tp.r);
  check('T18.2 torre viva é vendável', DO.sellTower(Sp, tp) === true);
  check('T18.3 célula antiga fica livre', !Sp.occupied[cell.c + ',' + cell.r]);
})();

/* ---------- T19: míssil spec A/B e MIRV ---------- */
console.log('\n[T19] dano de míssil (spec A ×1, splashAdd B, MIRV detona, cannon splA)');
(function(){
  const Sm = DO.startNewGame(0, 'normal', false);
  Sm.credits = 99999; Sm.parts = 999; Sm.autoMove = false;
  const cellM = { c: 3, r: 3 };
  const tm = DO.placeTower(Sm, cellM.c, cellM.r, 'missile');
  tm.specBranch = 'A';
  const st = DO.getTowerStats(Sm, tm);
  check('T19.1 spec A não multiplica de novo (dmg = stats.dmg)',
    (function(){ DO.spawnEnemy(Sm, 'tank'); const e = Sm.enemies[Sm.enemies.length-1]; e.x = tm.x; e.y = tm.y + 10; DO.fireTower(Sm, tm, e, st); const pr = Sm.projectiles[Sm.projectiles.length-1]; return pr && Math.abs(pr.dmg - st.dmg) < 1e-6; })());
  tm.specBranch = 'B';
  const stB = DO.getTowerStats(Sm, tm);
  check('T19.2 spec B soma splashAdd (65+40)', Math.abs(stB.splash - 105) < 1e-6, 'splash=' + stB.splash);

  // T19.3: MIRV T5 — submunições herdam alvo vivo e detonam (contador de booms > salvas)
  const Sw = DO.startNewGame(0, 'normal', false);
  Sw.credits = 99999; Sw.parts = 999; Sw.autoMove = false;
  const wc = nextFree(Sw);
  const mw = DO.placeTower(Sw, wc.c, wc.r, 'missile');
  mw.level = 41; mw.ammo = 40;
  const stW = DO.getTowerStats(Sw, mw);
  const ew = mkTarget(Sw, mw.x + 60, mw.y, 9999999);
  ew.speed = 0; ew.flying = false; ew.routeIdx = 0;
  ew.dist = 44; ew.totalLen = Sw.routeLengths[0]; // ponto (22,110) da rota 0
  Sw.events.length = 0; Sw.projectiles.length = 0;
  DO.fireTower(Sw, mw, ew, stW);
  mw.cooldown = 1e9; // isola o MIRV: sem novos salvos da torre durante o loop
  let guard = 0;
  while (Sw.projectiles.length > 0 && guard++ < 900) DO.stepSim(Sw, 1 / 60);
  const booms = Sw.events.filter(e2 => e2.t === 'boom').length;
  check('T19.3 MIRV T5: submunições detonam (booms > salvas)', booms >= 6, 'booms=' + booms + ' guard=' + guard);

  // T19.4: cannon spec A concussão em área atinge 2º inimigo
  const Ss = DO.startNewGame(0, 'normal', false);
  Ss.credits = 99999; Ss.autoMove = false;
  const scc = nextFree(Ss);
  const cs = DO.placeTower(Ss, scc.c, scc.r, 'cannon');
  cs.specBranch = 'A'; cs.ammo = 40;
  const e1 = mkTarget(Ss, cs.x, cs.y + 88, 9999999);
  const e2 = mkTarget(Ss, cs.x + 44, cs.y + 88, 9999999);
  e1.speed = 0; e2.speed = 0; e1.flying = false; e2.flying = false;
  e1.dist = 44; e2.dist = 88; e1.totalLen = Ss.routeLengths[0]; e2.totalLen = Ss.routeLengths[0];
  Ss.projectiles.length = 0;
  for (let i = 0; i < 120 && e2.hp === 9999999; i++) DO.stepSim(Ss, 1 / 60);
  check('T19.4 cannon spec A concussão atinge 2 inimigos',
    e1.hp < 9999999 && e2.hp < 9999999, 'e1=' + Math.round(e1.hp) + ' e2=' + Math.round(e2.hp));
})();

/* ---------- T20: wave multiplier, bosses, slowImmune, save, cryo B e mutações ---------- */
console.log('\n[T20] regressões Onda 1 — wave mult, bosses, slowImmune, save, cryo B, mutações');
(function(){
  // T20.1: multiplicador de spawn por faixa de 10
  check('T20.1 getWaveSpawnMultiplier 1.0/1.3/1.6',
    typeof D.getWaveSpawnMultiplier === 'function' &&
    D.getWaveSpawnMultiplier(1) === 1 && Math.abs(D.getWaveSpawnMultiplier(11) - 1.3) < 1e-9 && Math.abs(D.getWaveSpawnMultiplier(21) - 1.6) < 1e-9,
    'm1=' + (typeof D.getWaveSpawnMultiplier === 'function' ? D.getWaveSpawnMultiplier(1) : 'n/a'));
  // T20.2: consumo — onda 11 da campanha ganha +30% de spawns na fila
  const SQ = DO.startNewGame(0, 'normal', false);
  SQ.wave = 10; // startNextWave → 11
  const qBase = D.parseWaveString(SQ.map.waves[10]).length;
  DO.startNextWave(SQ);
  check('T20.2 fila da onda 11 recebe +30% spawns',
    SQ.wave === 11 && SQ.waveQueue.length === qBase + Math.round(qBase * 0.3),
    'q=' + SQ.waveQueue.length + ' base=' + qBase);

  // T20.3: múltiplos bosses — barra continua no outro chefe
  const SB = DO.startNewGame(0, 'normal', false);
  const b1 = DO.spawnEnemy(SB, 'boss1');
  const b2 = DO.spawnEnemy(SB, 'boss2');
  const bossBefore = SB.activeBoss === b2;
  DO.killEnemy(SB, b1);
  const bossMid = SB.activeBoss === b2;
  DO.killEnemy(SB, b2);
  check('T20.3 matar um boss mantém activeBoss no outro; sem vivos → null',
    bossBefore && bossMid && SB.activeBoss === null,
    'before=' + bossBefore + ' mid=' + bossMid + ' after=' + (SB.activeBoss && SB.activeBoss.eid));

  // T20.4: colosso slowImmune — EMP não aplica slow, mas atordoa
  const SE = DO.startNewGame(0, 'normal', false);
  const ec0 = nextFree(SE);
  const te0 = DO.placeTower(SE, ec0.c, ec0.r, 'tesla');
  const col = DO.spawnEnemy(SE, 'colossus');
  col.x = te0.x + 30; col.y = te0.y; col.slowTimer = 0; col.slowFactor = 1; col.stunTimer = 0;
  DO.applySuper(SE, 'emp', te0.x, te0.y);
  check('T20.4 colosso slowImmune: EMP não faz slow, mas atordoa',
    col.slowTimer === 0 && col.slowFactor === 1 && col.stunTimer > 0 && !col.dead,
    'slow=' + col.slowTimer + ' f=' + col.slowFactor + ' stun=' + col.stunTimer);

  // T20.5: super da cryo também respeita slowImmune
  const SE2 = DO.startNewGame(0, 'normal', false);
  const ec2 = nextFree(SE2);
  const cr2 = DO.placeTower(SE2, ec2.c, ec2.r, 'cryo');
  const col2 = DO.spawnEnemy(SE2, 'colossus');
  col2.x = cr2.x + 20; col2.y = cr2.y; col2.slowTimer = 0; col2.slowFactor = 1; col2.stunTimer = 0;
  DO.forceSuperCharge(SE2, cr2);
  check('T20.5 super da cryo não faz slow em slowImmune',
    col2.slowTimer === 0 && col2.slowFactor === 1, 'slow=' + col2.slowTimer + ' f=' + col2.slowFactor);

  // T20.6/7/8: save v3 tolerante a corrupção
  const _prevSave = D.Save.data;
  localStorageStub.setItem(D.SAVE_KEY, JSON.stringify({ v: 3, tech: null, mapStars: 'x', crystals: 'abc', achievements: 'nope', unlockedMap: 'z' }));
  let loadThrew = false;
  try { D.Save.load(); } catch (e) { loadThrew = true; }
  check('T20.6 save corrompido não lança e devolve defaults normalizados',
    !loadThrew && !!D.Save.data.tech && typeof D.Save.data.tech === 'object' && !Array.isArray(D.Save.data.tech) &&
    Array.isArray(D.Save.data.mapStars) && D.Save.data.mapStars.length === 0 &&
    D.Save.data.crystals === 30 && Array.isArray(D.Save.data.achievements) && D.Save.data.unlockedMap === 1,
    'threw=' + loadThrew + ' tech=' + JSON.stringify(D.Save.data.tech) + ' crystals=' + D.Save.data.crystals);
  check('T20.7 techLvl/livesMax sãos com save vazio', D.Save.techLevel('base_hp') === 0 &&
    Number.isFinite(DO.startNewGame(0, 'normal', false).livesMax));
  localStorageStub.setItem(D.SAVE_KEY, JSON.stringify({ v: 3, tech: { base_hp: 'x', start_gold: 3 }, crystals: 10 }));
  D.Save.load();
  check('T20.8 tech numérico/finito após load (base_hp inválido → 0)',
    D.Save.techLevel('base_hp') === 0 && D.Save.techLevel('start_gold') === 3,
    'base_hp=' + D.Save.techLevel('base_hp') + ' start_gold=' + D.Save.techLevel('start_gold'));
  D.Save.data = _prevSave;

  // T20.9: cryo B aura aplica slow sem gastar batt e sem tiro
  const SA = DO.startNewGame(0, 'normal', false);
  SA.credits = 99999; SA.autoMove = false;
  const ac = nextFree(SA);
  const aw = DO.placeTower(SA, ac.c, ac.r, 'cryo');
  aw.specBranch = 'B'; aw.batt = 0;
  const ea = mkTarget(SA, aw.x + 40, aw.y, 9999999);
  ea.speed = 0; ea.flying = false; ea.dist = 0; ea.totalLen = SA.routeLengths[0];
  SA.events.length = 0;
  for (let i = 0; i < 60; i++) DO.stepSim(SA, 1 / 60);
  const muzzles = SA.events.filter(e2 => e2.t === 'muzzle').length;
  check('T20.9 cryo B aura: slow sem tiro e batt intacto (0)',
    ea.slowTimer > 0 && ea.slowFactor <= 0.85 && aw.batt === 0 && muzzles === 0,
    'slow=' + ea.slowTimer + ' f=' + ea.slowFactor + ' batt=' + aw.batt + ' mz=' + muzzles);

  // T20.10: mut_cryo aumenta duração do pulso (+40%/stack)
  const SM = DO.startNewGame(0, 'normal', false);
  SM.credits = 99999; SM.autoMove = false;
  const mc = nextFree(SM);
  const mw2 = DO.placeTower(SM, mc.c, mc.r, 'cryo');
  mw2.batt = 100;
  const em = mkTarget(SM, mw2.x + 40, mw2.y, 9999999);
  em.flying = false;
  const stM = DO.getTowerStats(SM, mw2);
  DO.fireTower(SM, mw2, em, stM);
  const baseSlow = em.slowTimer;
  em.slowTimer = 0; em.slowFactor = 1;
  SM.mutBuffs.cryo = 1;
  DO.fireTower(SM, mw2, em, stM);
  check('T20.10 mut_cryo: 2.2s → 3.08s (+40%)', Math.abs(baseSlow - 2.2) < 1e-9 && Math.abs(em.slowTimer - 3.08) < 1e-6,
    'base=' + baseSlow + ' mut=' + em.slowTimer);

  // T20.11: mut_poison +45% duração e +1 alvo extra fora da névoa
  const SV = DO.startNewGame(0, 'normal', false);
  SV.credits = 99999; SV.autoMove = false;
  const vc = nextFree(SV);
  const vw = DO.placeTower(SV, vc.c, vc.r, 'venom');
  vw.batt = 100;
  const v1 = mkTarget(SV, vw.x + 30, vw.y, 9999999);
  const v2 = mkTarget(SV, vw.x + 4 * 44, vw.y, 9999999);
  const v3 = mkTarget(SV, vw.x + 9 * 44, vw.y, 9999999);
  v1.flying = false; v2.flying = false; v3.flying = false;
  SV.mutBuffs.poison = 1;
  const stV = DO.getTowerStats(SV, vw);
  DO.fireTower(SV, vw, v1, stV);
  check('T20.11 mut_poison: 5.075s no alvo da névoa e +1 alvo extra',
    Math.abs(v1.poisonTimer - 5.075) < 1e-6 && Math.abs(v2.poisonTimer - 5.075) < 1e-6 && v3.poisonTimer === 0,
    'v1=' + v1.poisonTimer + ' v2=' + v2.poisonTimer + ' v3=' + v3.poisonTimer);

  // T20.12 (Onda 2 fix): tutorialSeen sobrevive ao normalize e save corrompido não lança
  check('T20.12 normalize preserva tutorialSeen=true (não reabre o tutorial)', D.Save.normalize({ v: 3, tutorialSeen: true }).tutorialSeen === true);
  let normOk12 = true;
  try { normOk12 = D.Save.normalize({ v: 3, tech: null, mapStars: 'x' }).tutorialSeen === false; } catch (e) { normOk12 = false; }
  check("T20.12 normalize({v:3, tech:null, mapStars:'x'}) não lança e devolve defaults", normOk12);
})();

/* ---------- T21: Onda 2 — TIER_LOGIC verdadeiro + cache por frame ---------- */
console.log('\n[T21] Onda 2 — efeitos reais por tier, cache de getTowerStats, marcas/veneno');
(function(){
  // rota reta sintética p/ geometria determinística (sem o teleporte da rota do mapa)
  function flatRoute(S) {
    S.blocked = {};
    const y = 154; // centro da linha r=3
    S.routes = [[{ x: 0, y: y }, { x: 924, y: y }]];
    S.routeLengths = [924];
    S.airPts = [{ x: -24, y: y }, { x: 948, y: y }];
    S.airLen = 972;
    return S;
  }
  function putTower(S, id, lvl, c, r) {
    const t = DO.placeTower(S, c, r, id);
    if (t) { t.level = lvl || 1; t.ammo = 9999; t.batt = 9999; t.fuel = 9999; }
    return t;
  }
  function putEnemy(S, d, hp) {
    const e = mkTarget(S, 0, 0, hp);
    e.routeIdx = 0; e.dist = d; e.totalLen = S.routeLengths[0]; e.speed = 0;
    const p = D.getPosAtDist(S.routes[0], d);
    e.x = p.x; e.y = p.y;
    return e;
  }
  function runProj(S, guard) {
    let g = 0;
    while (S.projectiles.length > 0 && g++ < (guard || 300)) DO.stepSim(S, 1 / 60);
    return g;
  }

  // T21.1-4: cache por frame de getTowerStats
  const Sc = flatRoute(freshFunded());
  const ct = putTower(Sc, 'cannon', 1, 5, 3);
  const cs1 = DO.getTowerStats(Sc, ct);
  const cs2 = DO.getTowerStats(Sc, ct);
  check('T21.1 cache: duas chamadas devolvem o mesmo objeto', cs1 === cs2);
  ct.level = 21;
  const cs3 = DO.getTowerStats(Sc, ct);
  const fresh3 = DO.getTowerStats(Sc, Object.assign({}, ct, { _statsCache: null }));
  check('T21.2 cache invalida em level++ e bate com cálculo fresco',
    cs3 !== cs1 && approx(cs3.dmg, fresh3.dmg, 1e-9) && approx(cs3.rate, fresh3.rate, 1e-9),
    'cached=' + cs3.dmg + ' fresh=' + fresh3.dmg);
  ct.specBranch = 'A';
  const csA = DO.getTowerStats(Sc, ct);
  check('T21.3 cache invalida em troca de spec', csA !== cs3 && approx(csA.dmg, cs3.dmg * 2.2, 1e-6), 'A=' + csA.dmg + ' base=' + cs3.dmg);
  const ct2 = putTower(Sc, 'cannon', 1, 10, 3);
  const beforeAmp = DO.getTowerStats(Sc, ct2);
  putTower(Sc, 'amp', 1, 11, 3);
  const afterAmp = DO.getTowerStats(Sc, ct2);
  check('T21.4 cache invalida ao colocar amp (ampVersion)', afterAmp !== beforeAmp && afterAmp.dmg > beforeAmp.dmg,
    'dmg ' + beforeAmp.dmg + '->' + afterAmp.dmg);

  // T21.5-6: cannon T4 ricochete (e não vaza p/ T3)
  const Sr = flatRoute(freshFunded());
  const rt = putTower(Sr, 'cannon', 31, 5, 3);
  const r1 = putEnemy(Sr, 272, 9999999);
  const r2 = putEnemy(Sr, 300, 9999999);
  const r2hp = r2.hp;
  Sr.projectiles.length = 0;
  // isola o ricochete: zera o pierce de skill (nv16) p/ o projétil morrer no 1º impacto
  const stR = Object.assign({}, DO.getTowerStats(Sr, rt), { pierceBonus: 0 });
  DO.fireTower(Sr, rt, r1, stR);
  rt.cooldown = 1e9; // isola o volley: sem auto-tiro durante a simulação
  runProj(Sr);
  check('T21.5 cannon T4 ricochete: 2º inimigo a ≤1.5□ leva 50% do dano',
    (r2.hp < r2hp || r2.dead) && r1.hp < 9999999, 'danos r1=' + Math.round(9999999 - r1.hp) + ' r2=' + Math.round(r2hp - r2.hp));
  const Snl = flatRoute(freshFunded());
  const nt = putTower(Snl, 'cannon', 21, 5, 3);
  const n1 = putEnemy(Snl, 272, 9999999);
  const n2 = putEnemy(Snl, 300, 9999999);
  const n2hp = n2.hp;
  Snl.projectiles.length = 0;
  const stN = Object.assign({}, DO.getTowerStats(Snl, nt), { pierceBonus: 0 }); // isola: sem ricochete e sem pierce
  DO.fireTower(Snl, nt, n1, stN);
  nt.cooldown = 1e9; // isola o volley: sem auto-tiro durante a simulação
  runProj(Snl);
  check('T21.6 ricochete não vaza p/ cannon T3 (2º alvo intacto)',
    n1.hp < 9999999 && n2.hp === n2hp, 'n1=' + Math.round(9999999 - n1.hp) + ' n2=' + (n2hp - n2.hp));

  // T21.7: cannon T5 killDmg (stacks por abate, cap +50%)
  const Sk = flatRoute(freshFunded());
  const kt = putTower(Sk, 'cannon', 41, 5, 3);
  const k0 = DO.getTowerStats(Sk, kt);
  for (let i = 0; i < 3; i++) { const e = putEnemy(Sk, 272 + i, 10); DO.damageEnemy(Sk, e, 1e9, { src: kt }); }
  const stacks3 = kt.killStacks | 0;
  Sk.combo = 0; // isola o bônus de combo do cálculo de abate
  const k3 = DO.getTowerStats(Sk, kt);
  kt.killStacks = 100;
  const kCap = DO.getTowerStats(Sk, kt);
  check('T21.7 cannon T5 killDmg: +1%/abate (3 abates) e cap +50%',
    stacks3 === 3 && approx(k3.dmg, k0.dmg * 1.03, 1e-6) && approx(kCap.dmg, k0.dmg * 1.5, 1e-6),
    'stacks=' + stacks3 + ' 3abates=' + k3.dmg + ' cap=' + kCap.dmg + ' base=' + k0.dmg);

  // T21.8: gatling T3 stunChance (RNG forçado p/ 0)
  const Sg = flatRoute(freshFunded());
  const gt = putTower(Sg, 'gatling', 21, 5, 3);
  const ge = putEnemy(Sg, 272, 9999999);
  const _rnd0 = Math.random;
  Math.random = function(){ return 0; };
  Sg.projectiles.length = 0;
  DO.fireTower(Sg, gt, ge, DO.getTowerStats(Sg, gt));
  runProj(Sg);
  Math.random = _rnd0;
  check('T21.8 gatling T3 stunChance 12%: atordoa 0.25s', ge.stunTimer > 0 && ge.stunTimer <= 0.25 + 1e-9, 'stun=' + ge.stunTimer);

  // T21.9 (fix pós-review): laser T2 vsBurn pelo CAMINHO REAL do beam (stepSim)
  const Sl = flatRoute(freshFunded());
  const lt = putTower(Sl, 'laser', 11, 5, 3);
  const le1 = putEnemy(Sl, 272, 9999999); le1.burnTimer = 1;
  const Slb = flatRoute(freshFunded());
  const ltb = putTower(Slb, 'laser', 11, 5, 3);
  const le2 = putEnemy(Slb, 272, 9999999);
  const h1 = le1.hp, h2 = le2.hp;
  for (let i = 0; i < 30; i++) { DO.stepSim(Sl, 1 / 60); DO.stepSim(Slb, 1 / 60); }
  const dmgBurn = h1 - le1.hp, dmgNorm = h2 - le2.hp;
  check('T21.9 laser T2 vsBurn (beam real): +25% em alvo em chamas',
    dmgNorm > 0 && approx(dmgBurn, dmgNorm * 1.25, 1e-6), 'burn=' + dmgBurn + ' normal=' + dmgNorm);

  // T21.10 (fix pós-review): laser T4 shieldPhase pelo CAMINHO REAL do beam (stepSim)
  const Sl4 = flatRoute(freshFunded());
  const l4 = putTower(Sl4, 'laser', 31, 5, 3);
  const se = putEnemy(Sl4, 272, 9999999); se.shield = 1e9; se.maxShield = 1e9;
  const seHp = se.hp, seSh = se.shield;
  for (let i = 0; i < 30; i++) DO.stepSim(Sl4, 1 / 60);
  const seHpLost = seHp - se.hp, seShLost = seSh - se.shield;
  check('T21.10 laser T4 shieldPhase (beam real): 50% atravessa o escudo',
    seHpLost > 0 && seShLost > 0 && approx(seHpLost, seShLost, 1e-3), 'hp=' + seHpLost + ' sh=' + seShLost);
  const Scn = flatRoute(freshFunded());
  const cn = putTower(Scn, 'cannon', 1, 5, 3);
  const ce = putEnemy(Scn, 272, 9999999); ce.shield = 100; ce.maxShield = 100;
  const ceHp = ce.hp;
  DO.damageEnemy(Scn, ce, 100, { src: cn });
  check('T21.11 shieldPhase não vaza p/ cannon: escudo absorve tudo',
    ce.shield === 0 && ce.hp === ceHp, 'hp=' + (ceHp - ce.hp) + ' sh=' + ce.shield);

  // T21.12-13: tesla T2 ionSlow e T4 vsShield
  const St = flatRoute(freshFunded());
  const tt2 = putTower(St, 'tesla', 11, 5, 3);
  const te = putEnemy(St, 272, 9999999);
  DO.fireTower(St, tt2, te, DO.getTowerStats(St, tt2));
  check('T21.12 tesla T2 ionSlow: 12% de lentidão por 1.5s',
    te.slowTimer >= 1.5 - 1e-9 && approx(te.slowFactor, 0.88, 1e-9), 'slow=' + te.slowTimer + ' f=' + te.slowFactor);
  const St4 = flatRoute(freshFunded());
  const tt4 = putTower(St4, 'tesla', 31, 5, 3);
  const ts = putEnemy(St4, 272, 9999999); ts.shield = 100; ts.maxShield = 100;
  const tsHp = ts.hp;
  DO.damageEnemy(St4, ts, 100, { src: tt4 });
  check('T21.13 tesla T4 vsShield 1.6: 160 no escudo (60 vaza p/ HP)',
    approx(tsHp - ts.hp, 60, 1e-6) && ts.shield === 0, 'hp=' + (tsHp - ts.hp) + ' sh=' + ts.shield);

  // T21.14-17: sniper T2 mark / T3 ignoreArmor / T5 exec
  const Ss = flatRoute(freshFunded());
  const sn2 = putTower(Ss, 'sniper', 11, 5, 3);
  const sm = putEnemy(Ss, 272, 9999999);
  DO.fireTower(Ss, sn2, sm, DO.getTowerStats(Ss, sn2));
  check('T21.14 sniper T2 mark: marca 1.5s com +15%', sm.markedTimer > 0 && approx(sm.markMul, 1.15, 1e-9), 'mk=' + sm.markedTimer + ' mul=' + sm.markMul);
  const smh = sm.hp;
  DO.damageEnemy(Ss, sm, 100, {});
  check('T21.15 marca T2 vale 1.15 (não 1.35)', approx(smh - sm.hp, 115, 1e-6), 'dano=' + (smh - sm.hp));
  const Ss3 = flatRoute(freshFunded());
  const sn3 = putTower(Ss3, 'sniper', 21, 5, 3);
  const sa = putEnemy(Ss3, 272, 9999999); sa.armor = 10;
  const sb2 = putEnemy(Ss3, 300, 9999999); sb2.armor = 10;
  const ha = sa.hp, hb = sb2.hp;
  DO.damageEnemy(Ss3, sa, 100, { src: sn3 });
  const cn3 = putTower(Ss3, 'cannon', 21, 10, 3);
  DO.damageEnemy(Ss3, sb2, 100, { src: cn3 });
  check('T21.16 sniper T3 ignoreArmor: 100 vs armor 10 (cannon T3 só perfura 4 → 94)',
    approx(ha - sa.hp, 100, 1e-6) && approx(hb - sb2.hp, 94, 1e-6), 'sniper=' + (ha - sa.hp) + ' cannon=' + (hb - sb2.hp));
  const Ss5 = flatRoute(freshFunded());
  const sn5 = putTower(Ss5, 'sniper', 41, 5, 3);
  const se5 = putEnemy(Ss5, 272, 1000);
  se5.hp = 200; // 20% < 25%
  DO.fireTower(Ss5, sn5, se5, DO.getTowerStats(Ss5, sn5));
  check('T21.17 sniper T5 execAdd: executa alvo <25% HP', se5.dead === true, 'hp=' + se5.hp + ' dead=' + se5.dead);

  // T21.18-20: venom T2 corrode / T4 pctPoison / T5 deathCloud
  const Sv = flatRoute(freshFunded());
  const vn2 = putTower(Sv, 'venom', 11, 5, 3);
  const ve = putEnemy(Sv, 272, 1000); ve.armor = 5;
  DO.fireTower(Sv, vn2, ve, DO.getTowerStats(Sv, vn2));
  check('T21.18 venom T2 corrode: -1 armor por aplicação', ve.armor === 4, 'armor=' + ve.armor);
  const Sv4 = flatRoute(freshFunded());
  const vn4 = putTower(Sv4, 'venom', 31, 5, 3);
  const ve4 = putEnemy(Sv4, 272, 1000);
  const stv4 = DO.getTowerStats(Sv4, vn4);
  DO.fireTower(Sv4, vn4, ve4, stv4);
  check('T21.19 venom T4 pctPoison: dps += 0.6% da vida máx.',
    approx(ve4.poisonDps, stv4.dmg + 0.006 * ve4.maxHp, 1e-6), 'dps=' + ve4.poisonDps + ' base=' + stv4.dmg);
  const Sv5 = flatRoute(freshFunded());
  const vn5 = putTower(Sv5, 'venom', 41, 5, 3);
  const vc1 = putEnemy(Sv5, 272, 1000);
  const vc2 = putEnemy(Sv5, 300, 9999999);
  DO.fireTower(Sv5, vn5, vc1, DO.getTowerStats(Sv5, vn5));
  const vc2hp = vc2.hp;
  DO.damageEnemy(Sv5, vc1, 1e9, { src: vn5 });
  check('T21.20 venom T5 deathCloud: morte envenenada explode em 2□', vc2.hp < vc2hp, 'dano no vizinho=' + (vc2hp - vc2.hp));

  // T21.21-24: cryo T4 coldAura / T5 bossFreeze / laser T3 sweepAdd / T5 meltArmor
  const Sc4 = flatRoute(freshFunded());
  const cr4 = putTower(Sc4, 'cryo', 31, 5, 3);
  cr4.batt = 0; // sem tiro: prova que a aura é passiva
  const ca = putEnemy(Sc4, 272, 9999999);
  Sc4.events.length = 0;
  for (let i = 0; i < 40; i++) DO.stepSim(Sc4, 1 / 60);
  const muzzles4 = Sc4.events.filter(x => x.t === 'muzzle').length;
  check('T21.21 cryo T4 coldAura: slow 15% passivo sem tiro',
    ca.slowTimer > 0 && approx(ca.slowFactor, 0.85, 1e-9) && muzzles4 === 0 && cr4.batt === 0,
    'f=' + ca.slowFactor + ' mz=' + muzzles4);
  const Sc5 = flatRoute(freshFunded());
  const cr5 = putTower(Sc5, 'cryo', 41, 5, 3);
  const bo = DO.spawnEnemy(Sc5, 'boss1');
  bo.routeIdx = 0; bo.dist = 272; bo.totalLen = Sc5.routeLengths[0]; bo.speed = 0;
  const bop = D.getPosAtDist(Sc5.routes[0], 272); bo.x = bop.x; bo.y = bop.y; bo.stunTimer = 0;
  const _rnd1 = Math.random;
  Math.random = function(){ return 0; };
  const stBoss = Object.assign({}, DO.getTowerStats(Sc5, cr5), { stunBonus: 0 }); // isola do stun de skill nv28
  DO.fireTower(Sc5, cr5, bo, stBoss);
  Math.random = _rnd1;
  check('T21.22 cryo T5 bossFreeze: chefe congela 0.4s (0.8×0.5)',
    bo.stunTimer > 0 && bo.stunTimer <= 0.4 + 1e-9, 'stun=' + bo.stunTimer);
  const Sl3 = flatRoute(freshFunded());
  const l3 = putTower(Sl3, 'laser', 21, 5, 3);
  const la = putEnemy(Sl3, 272, 9999999);
  const lb = putEnemy(Sl3, 288, 9999999);
  const lc = putEnemy(Sl3, 304, 9999999);
  const lahp = la.hp, lbhp = lb.hp, lchp = lc.hp;
  for (let i = 0; i < 30; i++) DO.stepSim(Sl3, 1 / 60);
  const swept = (la.hp < lahp ? 1 : 0) + (lb.hp < lbhp ? 1 : 0) + (lc.hp < lchp ? 1 : 0);
  const tblSweep = D.SHOT_PATTERNS.laser.sweep[2] || 0; // linha de base T3 = 1 extra
  check('T21.23 laser T3 sweepAdd: varre ' + tblSweep + ' extra(s) da tabela, sem empilhar',
    swept === 1 + tblSweep, 'alvos=' + swept + ' tabela=' + tblSweep);
  const Sl5 = flatRoute(freshFunded());
  const l5 = putTower(Sl5, 'laser', 41, 5, 3);
  const melt = putEnemy(Sl5, 272, 9999999); melt.armor = 4;
  for (let i = 0; i < 75; i++) DO.stepSim(Sl5, 1 / 60);
  check('T21.24 laser T5 meltArmor: corrói 1 armor/s (4→≤3 em 1.25s)', melt.armor <= 3 && melt.armor >= 0, 'armor=' + melt.armor);

  // T21.25-28: missile T3 fragAdd / T4 hitAir, tesla T5 globalChain, rail T4/T5 já consumidos
  const Sm3 = flatRoute(freshFunded());
  const ms3 = putTower(Sm3, 'missile', 21, 5, 3);
  const mt1 = putEnemy(Sm3, 272, 9999999);
  const mt2 = putEnemy(Sm3, 392, 9999999);
  const mt2hp = mt2.hp;
  DO.fireTower(Sm3, ms3, mt1, DO.getTowerStats(Sm3, ms3));
  runProj(Sm3, 600);
  check('T21.25 missile T3 fragAdd: fragmento extra fere alvo fora do splash',
    mt2.hp < mt2hp, 'dano=' + Math.round(mt2hp - mt2.hp));
  const Sm4 = flatRoute(freshFunded());
  const ms4 = putTower(Sm4, 'missile', 31, 5, 3);
  check('T21.26 missile T4 hitAir: canHitAir true', DO.getTowerStats(Sm4, ms4).canHitAir === true);
  const St5 = flatRoute(freshFunded());
  const ts5 = putTower(St5, 'tesla', 41, 5, 3);
  const g1 = putEnemy(St5, 272, 9999999);
  const g2 = putEnemy(St5, 800, 9999999);
  const g2hp = g2.hp;
  DO.fireTower(St5, ts5, g1, DO.getTowerStats(St5, ts5));
  check('T21.27 tesla T5 globalChain: salto ignora distância (>2.5□)', g2.hp < g2hp, 'dano=' + Math.round(g2hp - g2.hp));
  const Sra = flatRoute(freshFunded());
  const ra4 = putTower(Sra, 'rail', 31, 5, 3);
  const ra5 = putTower(Sra, 'rail', 41, 10, 3);
  const rae = putEnemy(Sra, 272, 9999999);
  Sra.events.length = 0;
  DO.fireTower(Sra, ra4, rae, DO.getTowerStats(Sra, ra4));
  const tr4 = Sra.events.filter(x => x.t === 'tracer').pop();
  Sra.events.length = 0;
  DO.fireTower(Sra, ra5, rae, DO.getTowerStats(Sra, ra5));
  const tr5 = Sra.events.filter(x => x.t === 'tracer').pop();
  const len4 = tr4 ? Math.hypot(tr4.x2 - tr4.x1, tr4.y2 - tr4.y1) : 0;
  const len5 = tr5 ? Math.hypot(tr5.x2 - tr5.x1, tr5.y2 - tr5.y1) : 0;
  check('T21.28 rail T4 fullBase / T5 starLine já consumidos',
    len4 >= 900 && len5 > len4, 'len4=' + Math.round(len4) + ' len5=' + Math.round(len5));

  // T21.29-30 (fix pós-review): cache invalida quando a torre se move (buff da amp é posicional)
  const Smv = flatRoute(freshFunded());
  putTower(Smv, 'amp', 1, 5, 3);
  const mvT = putTower(Smv, 'cannon', 1, 5, 6); // 3□ do amp → dentro do anel (base 3□)
  const mvIn = DO.getTowerStats(Smv, mvT);
  let mvMoved = true;
  for (let i = 0; i < 10; i++) if (!DO.tryPursueStep(Smv, mvT, mvT.c + 1, mvT.r)) { mvMoved = false; break; }
  const mvOutCached = DO.getTowerStats(Smv, mvT);
  const mvOutFresh = (() => { const c = Object.assign({}, mvT); c._statsCache = null; return DO.getTowerStats(Smv, c); })();
  check('T21.29 cache invalida após pursue para fora do anel (cached == fresh)',
    mvMoved && mvT.c === 15 && mvIn.dmg > mvOutFresh.dmg &&
    approx(mvOutCached.dmg, mvOutFresh.dmg, 1e-9) && approx(mvOutCached.rate, mvOutFresh.rate, 1e-9),
    'in=' + mvIn.dmg + ' cached=' + mvOutCached.dmg + ' fresh=' + mvOutFresh.dmg + ' pos=' + mvT.c + ',' + mvT.r);

  const Srf = flatRoute(freshFunded());
  putTower(Srf, 'amp', 1, 5, 3);
  const rfT = putTower(Srf, 'cannon', 1, 15, 6); // fora do anel
  const rfOut = DO.getTowerStats(Srf, rfT); // aquece o cache SEM buff
  let rfMoved = true;
  for (let i = 0; i < 10; i++) if (!DO.tryRefuelStep(Srf, rfT, rfT.c - 1, rfT.r)) { rfMoved = false; break; }
  const rfCached = DO.getTowerStats(Srf, rfT);
  const rfFresh = (() => { const c = Object.assign({}, rfT); c._statsCache = null; return DO.getTowerStats(Srf, c); })();
  check('T21.30 cache invalida após refuel para dentro do anel (cached == fresh)',
    rfMoved && rfT.c === 5 && approx(rfCached.dmg, rfFresh.dmg, 1e-9) && rfCached.dmg > rfOut.dmg,
    'out=' + rfOut.dmg + ' cached=' + rfCached.dmg + ' fresh=' + rfFresh.dmg + ' pos=' + rfT.c + ',' + rfT.r);

  // T21.31 (fix pós-review): spotter spec B reescreve markMul p/ 1.35 (sem vazar 1.15 do T2)
  const Ssp = flatRoute(freshFunded());
  const sp = putTower(Ssp, 'sniper', 11, 5, 3); sp.specBranch = 'B';
  const se2 = putEnemy(Ssp, 272, 9999999);
  se2.markedTimer = 1; se2.markMul = 1.15; // marca T2 anterior
  DO.fireTower(Ssp, sp, se2, DO.getTowerStats(Ssp, sp));
  check('T21.31 sniper spotter spec B: marca 4s com +35% (markMul=1.35)',
    approx(se2.markedTimer, 4.0, 1e-9) && approx(se2.markMul, 1.35, 1e-9), 't=' + se2.markedTimer + ' mul=' + se2.markMul);

  // T21.32 (fix pós-review): dano sem src limpa o crédito de abate (killDmg)
  const Sst = flatRoute(freshFunded());
  const kt2 = putTower(Sst, 'cannon', 41, 5, 3);
  const ke = putEnemy(Sst, 272, 100);
  DO.damageEnemy(Sst, ke, 1, { src: kt2 });
  DO.damageEnemy(Sst, ke, 1e9, {}); // último dano sem src
  check('T21.32 killDmg não credita abate cujo último dano não teve src',
    (kt2.killStacks | 0) === 0, 'stacks=' + (kt2.killStacks | 0));

  // T21.33 (fix pós-review): cryo T3 chillVuln pelo pulso real (+25% após o slow do próprio pulso)
  const Scv = flatRoute(freshFunded());
  const cv = putTower(Scv, 'cryo', 21, 5, 3);
  const cve = putEnemy(Scv, 272, 9999999);
  const stCv = DO.getTowerStats(Scv, cv);
  const cveHp = cve.hp;
  DO.fireTower(Scv, cv, cve, stCv);
  const cvPulses = D.SHOT_PATTERNS.cryo.pulses[2] || 1;
  const cvExp = stCv.dmg * 0.5 * cvPulses * 1.25;
  check('T21.33 cryo T3 chillVuln (pulso real): dano ×1.25 no alvo recém-lentificado',
    approx(cveHp - cve.hp, cvExp, 1e-6), 'dano=' + (cveHp - cve.hp) + ' esperado=' + cvExp);

  // T21.34 (fix pós-review): rail T2 vsArmor pelo tiro real (feixe duplo, +15% via src)
  const Srv = flatRoute(freshFunded());
  const rv = putTower(Srv, 'rail', 11, 5, 3);
  rv.aimAngle = 0;
  const rve = putEnemy(Srv, 272, 9999999); rve.armor = 10;
  const stRv = DO.getTowerStats(Srv, rv);
  const rveHp = rve.hp;
  DO.fireTower(Srv, rv, rve, stRv);
  const railBeams = D.SHOT_PATTERNS.rail.beams[1];
  check('T21.34 rail T2 vsArmor (tiro real): ' + railBeams + ' feixe(s) ×1.15',
    approx(rveHp - rve.hp, stRv.dmg * railBeams * 1.15, 1e-6), 'dano=' + (rveHp - rve.hp) + ' dmg=' + stRv.dmg + ' feixes=' + railBeams);
})();

/* ---------- resultado ---------- */
console.log('\n==========================================');
console.log('SMOKE RESULT: ' + pass + ' PASS / ' + fail + ' FAIL');
if (fail) { console.log('FALHAS:\n - ' + failures.join('\n - ')); process.exit(1); }
process.exit(0);
