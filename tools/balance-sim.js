#!/usr/bin/env node
/* balance-sim.js — harness de simulação de balanceamento (node puro, SOMENTE LEITURA).
 * Carrega assets/data.js com stubs e imprime: economia de peças/merges,
 * curva HP×DPS por tier, e custo de upgrade×renda de créditos.
 * Uso: node tools/balance-sim.js
 */
'use strict';
const path = require('path');

// ---- stubs mínimos para carregar assets/data.js fora do browser ----
global.window = global;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.document = { createElement: () => ({ style: {}, getContext: () => null }), addEventListener: () => {} };

require(path.join(__dirname, '..', 'assets', 'data.js'));
const D = global.DO3;
if (!D) { console.error('ERRO: assets/data.js não exportou window.DO3'); process.exit(1); }

const fmt = (n, d = 1) => Number(n).toFixed(d);
function missing(name, v) { if (v === undefined || v === null) { console.log('MISSING: ' + name); return true; } return false; }
const pad = (s, n) => String(s).padStart(n);

// Fórmula espelhada de scenes.js hpMultiplier(): (1 + mapIdx*0.25 + wave*0.12) * diff.hpMul * (1 + lab*HIVEMIND.hpAdd)
const hpFactor = (mapIdx, wave, diffHpMul, labLvl) =>
  (1 + mapIdx * 0.25 + wave * 0.12) * diffHpMul * (1 + labLvl * ((D.HIVEMIND && D.HIVEMIND.hpAdd) || 0.12));

// ============================================================
console.log('=== BALANCE-SIM :: DO3 (dados lidos de assets/data.js) ===');
let anyMissing = false;

// ---------- 1) ECONOMIA DE PEÇAS ⚙ ----------
console.log('\n--- 1) ECONOMIA DE PEÇAS: renda por onda vs custos de merge ---');
anyMissing |= missing('MERGE_PARTS', D.MERGE_PARTS);
anyMissing |= missing('FACTORY_DATA', D.FACTORY_DATA);
if (!anyMissing) {
  const PARTS_PER_WAVE = 2; // scenes.js: S.parts += 2 a cada onda completa
  const MAX_WAVE = 40;
  const fLv = [0, 1, 2, 3, 4, 5];
  const ppw = lvl => (D.FACTORY_DATA.partsPerWave ? D.FACTORY_DATA.partsPerWave(lvl) : 10 * lvl);
  const mergeTiers = Object.keys(D.MERGE_PARTS).map(Number).sort((a, b) => a - b);
  // primeira onda em que a renda acumulada cobre cada custo de merge
  const waveFor = (cost, fLvl) => {
    let cum = 0;
    for (let w = 1; w <= MAX_WAVE; w++) { cum += PARTS_PER_WAVE + ppw(fLvl); if (cum >= cost) return w; }
    return null;
  };
  console.log(`renda/on: ${PARTS_PER_WAVE}⚙ base${D.FACTORY_DATA ? ' + fábrica ' + fLv.map(l => `${l}→${ppw(l)}⚙`).join(', ') : ''}`);
  console.log('custos de merge (fundir 3 torres do mesmo tier): ' + mergeTiers.map(t => `T${t}→T${t + 1}: ${D.MERGE_PARTS[t]}⚙`).join(' | '));
  const head = pad('merge', 9) + pad('custo', 7) + fLv.map(l => pad(`fab nv${l}`, 9)).join('');
  console.log(head);
  for (const t of mergeTiers) {
    const cost = D.MERGE_PARTS[t];
    const row = pad(`T${t}→T${t + 1}`, 9) + pad(cost + '⚙', 7) +
      fLv.map(l => { const w = waveFor(cost, l); return pad(w ? 'onda ' + w : '—', 9); }).join('');
    console.log(row);
  }
  const totalToMax = mergeTiers.reduce((s, t) => s + D.MERGE_PARTS[t], 0);
  console.log(`total p/ levar 1 torre T1→T5: ${totalToMax}⚙ (sem contar as 2 consumidas por merge)`);
}

// ---------- 2) CURVA DE HP vs DPS POR TIER ----------
console.log('\n--- 2) CURVA DE DIFICULDADE: HP inimigo (mapa 5, normal, lab 0) vs DPS por tier ---');
anyMissing |= missing('ENEMIES_DATA', D.ENEMIES_DATA);
anyMissing |= missing('MAPS_DATA (waves)', D.MAPS_DATA && D.MAPS_DATA[4] && D.MAPS_DATA[4].waves);
anyMissing |= missing('TIER_STATS', D.TIER_STATS);
if (!anyMissing) {
  const MAP_IDX = 4, DIFF_HP = 1, MAX_LAB = 5;
  const waves = D.MAPS_DATA[4].waves;
  const parse = D.parseWaveString || (s => s.trim().split(/\s+/).map(tok => ({ type: tok.replace(/\d/g, '') })));
  // DPS relativo por tier = dmg × rate de TIER_STATS (T1 = 1.0)
  const dpsMul = D.TIER_STATS.map(s => (s ? s.dmg * s.rate : null)); // dpsMul[tier]
  const tierNames = D.TIER_NAMES || ['T1', 'T2', 'T3', 'T4', 'T5'];
  console.log('DPS relativo por tier: ' + tierNames.map((n, i) => `${n}×${fmt(dpsMul[i + 1], 2)}`).join('  '));
  const labNote = Array.from({ length: MAX_LAB + 1 }, (_, l) => `lab${l}:×${fmt(1 + l * ((D.HIVEMIND && D.HIVEMIND.hpAdd) || 0.12), 2)}`).join(' ');
  console.log(`multiplicador Hivemind sobre HP (${labNote})`);
  const head = pad('onda', 5) + pad('inim.', 6) + pad('EHP total', 11) + pad('hpMul', 8) +
    tierNames.map((n, i) => pad(`marg ${n}`, 9)).join('');
  console.log(head);
  waves.forEach((wstr, i) => {
    const wave = i + 1;
    const mul = hpFactor(MAP_IDX, wave, DIFF_HP, 0);
    let ehp = 0, count = 0;
    for (const q of parse(wstr)) {
      const def = D.ENEMIES_DATA[q.type];
      if (!def) continue;
      count++;
      ehp += (def.hp + (def.shield || 0)) * mul; // escudo conta como vida efetiva
    }
    const margins = [1, 2, 3, 4, 5].map(t => dpsMul[t] / mul);
    console.log(pad(wave, 5) + pad(count, 6) + pad(Math.round(ehp), 11) + pad(fmt(mul, 2), 7) + ' ' +
      margins.map(m => pad(fmt(m, 2) + (m >= 1 ? ' ok' : ' FRACO'), 12)).join(''));
  });
  console.log('margem = DPSrel(tier) ÷ hpMul(onda); ≥1 ⇒ DPS do tier acompanha o HP da onda (baseline onda 1, T1).');
}

// ---------- 3) CUSTO DE UPGRADE vs RENDA DE CRÉDITOS ----------
console.log('\n--- 3) CRÉDITOS: custo de upgrade vs renda por onda (bônus 60+15×onda [+fábrica]) ---');
anyMissing |= missing('TOWERS_DATA', D.TOWERS_DATA);
if (!anyMissing) {
  const upgradeCost = (base, lvl) => Math.round(base * (0.72 + lvl * 0.42 * Math.pow(1.03, lvl / 12))); // scenes.js
  const cpw = lvl => (D.FACTORY_DATA.creditsPerWave ? D.FACTORY_DATA.creditsPerWave(lvl) : 18 * lvl);
  const MAX_WAVE = 40;
  const coverWave = (accCost, fLvl) => {
    let cum = 0;
    for (let w = 1; w <= MAX_WAVE; w++) { cum += 60 + 15 * w + cpw(fLvl); if (cum >= accCost) return w; }
    return null;
  };
  const cheap = D.TOWERS_DATA.reduce((a, b) => (a.cost <= b.cost ? a : b));
  const dear = D.TOWERS_DATA.reduce((a, b) => (a.cost >= b.cost ? a : b));
  for (const tw of [cheap, dear]) {
    console.log(`\ntorre "${tw.name || tw.id}" (base $${tw.cost}), upgrades nível 2→10:`);
    console.log(pad('nível', 7) + pad('custo', 8) + pad('acumulado', 11) +
      pad('onda c/fab nv0', 16) + pad('onda c/fab nv3', 16));
    let acc = 0;
    for (let lvl = 1; lvl < 10; lvl++) {
      const c = upgradeCost(tw.cost, lvl); // custo p/ ir de lvl → lvl+1
      acc += c;
      console.log(pad(`${lvl}→${lvl + 1}`, 7) + pad('$' + c, 8) + pad('$' + acc, 11) +
        pad(String(coverWave(acc, 0) ?? '—'), 16) + pad(String(coverWave(acc, 3) ?? '—'), 16));
    }
  }
  console.log('\nnota: renda de abates (gold por inimigo) e combo somam À PARTE — aqui só o bônus de onda.');
}

console.log(anyMissing ? '\n(há tabelas ausentes acima — rode de novo após atualizar data.js)' : '\n(ok: todas as tabelas presentes)');
