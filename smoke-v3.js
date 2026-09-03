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
check('TIER_STATS/MERGE_PARTS/SHOT_PATTERNS/TIER_LOGIC/SUPERS_AUTO expostos',
  !!D.TIER_STATS && !!D.MERGE_PARTS && !!D.SHOT_PATTERNS && !!D.TIER_LOGIC && !!D.SUPERS_AUTO && !!D.FACTORY_DATA && !!D.HIVEMIND);
check('getTier: nv1→T1, nv10→T1, nv11→T2, nv50→T5',
  D.getTier(1) === 1 && D.getTier(10) === 1 && D.getTier(11) === 2 && D.getTier(50) === 5);
check('superThreshold por tier (T1=27..T5=15)',
  D.superThreshold(1) === 27 && D.superThreshold(5) === 15);

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
check('getSuperCharge começa vazio (need=27 no T1)', ch0.charge === 0 && ch0.need === 27 && !ch0.ready);
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
const campaignSave = D.Save.defaults();
check('vencer fase 1 libera fase 2', DO.recordNaveProgress(campaignSave, 'asteroids', 0, 3, true) === 2);
check('vencer fase 2 libera fase 3', DO.recordNaveProgress(campaignSave, 'asteroids', 1, 2, true) === 3);
check('falha não libera fase seguinte', DO.recordNaveProgress(campaignSave, 'asteroids', 2, 1, false) === 3);
check('estrelas da fase ficam persistidas', campaignSave.naveStars.asteroids[0] === 3 && campaignSave.naveStars.asteroids[1] === 2);
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

/* ---------- resultado ---------- */
console.log('\n==========================================');
console.log('SMOKE RESULT: ' + pass + ' PASS / ' + fail + ' FAIL');
if (fail) { console.log('FALHAS:\n - ' + failures.join('\n - ')); process.exit(1); }
process.exit(0);
