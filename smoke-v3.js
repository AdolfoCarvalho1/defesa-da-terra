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
  check('F2-R1.2 sniper/rail ammo==12 (tiros pesados)', sn && sn.ammo === 12 && rl && rl.ammo === 12,
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
  const expectDrain = 6 * (1 / stTe.rate);
  check('F2-R1.7 tesla consome battDrain*(1/rate) por disparo', approx(bBefore - te.batt, expectDrain, 0.05),
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
  check('F2-R2.12 station no raio ~= {12,14,6}', approx(rsB.fuel, 12, 1e-6) && approx(rsB.batt, 14, 1e-6) && approx(rsB.ammo, 6, 1e-6),
    JSON.stringify(rsB));
  const S2c = freshFunded();
  const sc2 = spotWithNFree(S2c, 1);
  const cc2 = DO.placeTower(S2c, sc2.c, sc2.r, 'cannon');
  DO.placeTower(S2c, sc2.nb[0].c, sc2.nb[0].r, 'support');
  const rsC = DO.getResupply(S2c, cc2);
  check('F2-R2.13 support no raio ~= {6,7,3}', approx(rsC.fuel, 6, 1e-6) && approx(rsC.batt, 7, 1e-6) && approx(rsC.ammo, 3, 1e-6),
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
  check('F2-R2.15 diminishing 2 fontes: 12+0.5*6=15 / 14+0.5*7=17.5 / 6+0.5*3=7.5',
    approx(rsE.fuel, 15, 1e-6) && approx(rsE.batt, 17.5, 1e-6) && approx(rsE.ammo, 7.5, 1e-6),
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
  check('F2-E.20 station $400 / support $90, kind/spent/occupied',
    stJ && stJ.defRef.kind === 'station' && stJ.spent === 400 && suJ && suJ.defRef.kind === 'support' && suJ.spent === 90 &&
    S2j.towers.indexOf(stJ) >= 0 && S2j.towers.indexOf(suJ) >= 0 && S2j.occupied[stJ.c + ',' + stJ.r] === stJ &&
    S2j.credits === c0j - 400 - 90,
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
  const leash4 = 1.5 * stats4.rng * 1;
  let maxOver = 0, everMoved = false;
  const startC = p4t.c;
  for (let i = 0; i < 300; i++) {
    DO.stepSim(P4, 0.1);
    const dd = Math.hypot(p4t.x - anx, p4t.y - any);
    if (dd > leash4 + 1) maxOver = Math.max(maxOver, dd - leash4);
    if (p4t.c !== startC) everMoved = true;
  }
  check('F3.8 leash duro: nunca passa (teto 1.5*rng) e para no limite', maxOver === 0,
    'leash=' + Math.round(leash4) + ' over=' + maxOver.toFixed(1) + ' moved=' + everMoved + ' finalC=' + p4t.c);
  const P5 = freshFunded();
  const anch5 = airAnchor(P5);
  const p5t = DO.placeTower(P5, anch5.c, anch5.r, 'cannon');
  p5t.comp.e = 2;
  const stats5 = DO.getTowerStats(P5, p5t);
  const lvls = D.COMP_DEFS.e.levels;
  const leashMul2 = lvls[1].leashMul;
  const leash5 = 1.5 * stats5.rng * leashMul2;
  const leashBase = 1.5 * stats5.rng * 1.0;
  check('F3.9 leashMul motor e=2 (1.2): teto > base e == 1.5*rng*1.2',
    leashMul2 === 1.2 && leash5 > leashBase && approx(leash5, 1.5 * stats5.rng * 1.2, 1e-6),
    'leash=' + leash5 + ' base=' + leashBase);
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
  eNear.dist = 200; eNear.routeIdx = 0; eNear.totalLen = P9.routeLengths[0];
  const posN = D.getPosAtDist(P9.routes[0], 200);
  eNear.x = posN.x; eNear.y = posN.y;
  const hpN = eNear.hp;
  const pc90 = p9t.c, pr90 = p9t.r;
  P9.projectiles.length = 0;
  for (let i = 0; i < 20; i++) DO.stepSim(P9, 0.1);
  check('F3.13 fuel zero: nao anda mas atira normal',
    p9t.c === pc90 && p9t.r === pr90 && (P9.projectiles.length > 0 || eNear.hp < hpN),
    'pos=' + p9t.c + ',' + p9t.r + ' proj=' + P9.projectiles.length);
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
  check('F4.12 t=1: rng*1.04 crit+0.02', approx(t18.rng, base8.rng * 1.04, 1e-6) && approx(t18.critBonus, base8.critBonus + 0.02, 1e-9),
    'rng ' + t18.rng + ' crit ' + t18.critBonus);
  q8t.comp.t = 5;
  const t58 = DO.getTowerStats(Q8, q8t);
  check('F4.13 t=5: rng*1.20 crit+0.10', approx(t58.rng, base8.rng * 1.20, 1e-6) && approx(t58.critBonus, base8.critBonus + 0.10, 1e-9));
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

/* ---------- resultado ---------- */
console.log('\n==========================================');
console.log('SMOKE RESULT: ' + pass + ' PASS / ' + fail + ' FAIL');
if (fail) { console.log('FALHAS:\n - ' + failures.join('\n - ')); process.exit(1); }
process.exit(0);
