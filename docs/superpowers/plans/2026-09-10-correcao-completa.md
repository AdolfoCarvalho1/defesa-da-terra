# Correção Completa "Deixa Top" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir todos os bugs e mecânicas mortas, polir UX/mobile, performance, áudio/arte e remover os modos Nave, mantendo a suíte de testes verde e adicionando regressões.

**Architecture:** Ondas por risco com donos de arquivo exclusivos. Batch 1 paralelo: Task 1A (sim/data, Onda 1), Task 2 (frontend, Onda 3+), Task 3 (render/audio, Ondas 4/5). Depois Task 1B (sim/data, Onda 2), Task 4 (remoção Nave, todos os arquivos) e Task 5 (verificação final). Nenhuma tarefa é concluída com gate vermelho.

**Tech Stack:** Phaser 3 local (`phaser.min.js`), JS puro (sem build step para o jogo), Vite só para preview/deploy, Playwright para testes de browser, `node smoke-v3.js` (VM headless) para lógica.

## Global Constraints

- Texto de UI em PT-BR.
- **NÃO commitar** nada (salvo pedido explícito do usuário).
- Não alterar o balanceamento validado (G1/BAL2/RANGESQ/REFUEL) — os testes atuais são a linha de base.
- Não tocar em arquivos fora do escopo da tarefa (donos de arquivo abaixo).
- FX novos devem decair a zero mesmo com o jogo pausado (sem artefato preso no canvas).
- Sem alocação por frame em loops quentes; reusar pools existentes.
- Gates por tarefa: `node --check <arquivos tocados>`, `npm run smoke`, `npm run pw` (Playwright 99 PASS ou mais).
- Se um gate falhar: consertar e rodar de novo; não reportar sucesso com gate vermelho.

## Donos de arquivo (evita conflito entre subagentes)

| Batch | Tarefa | Arquivos exclusivos |
|---|---|---|
| 1 (paralelo) | Task 1A | `assets/sim.js`, `assets/data.js`, `smoke-v3.js` |
| 1 (paralelo) | Task 2 | `index.html`, `assets/game.js`, `assets/ui.js`, `playwright-test.js` |
| 1 (paralelo) | Task 3 | `assets/scenes.js`, `assets/audio.js`, `assets/textures.js`, `assets/tiles.js`, `assets/pixelart.js` |
| 2 | Task 1B | `assets/sim.js`, `assets/data.js`, `tools/balance-sim.js`, `smoke-v3.js` |
| 3 | Task 4 | todos os arquivos do jogo + `assets/nave.js` (remoção) + testes |
| 4 | Task 5 (verificação) | nenhum (só mede; correções viram micro-tarefas) |

---

## Task 1A: Onda 1 — Bug crítico e combate quebrado (sim/data)

**Files:**
- Modify: `assets/sim.js`
- Modify: `assets/data.js`
- Test: `smoke-v3.js`

**Interfaces:**
- Consumes: `DO.placeTower`, `DO.sellTower`, `DO.stepSim`, `DO.spawnEnemy`, `DO.getTowerStats`, `DO.startNextWave` (já existem).
- Produces: comportamento corrigido; nenhuma assinatura pública muda.

- [ ] **Step 1: Corrigir a torre fantasma (CRÍTICO)**

Em `assets/sim.js`, nas funções `tryPursueStep` (~linha 1188) e `tryRefuelStep` (~linha 1249), após `t.c = nc; t.r = nr;` adicionar a gravação da célula nova:

```js
delete S.occupied[t.c + ',' + t.r];
t.c = nc; t.r = nr;
t.x = nc * CELL + CELL / 2; t.y = nr * CELL + CELL / 2;
S.occupied[nc + ',' + nr] = t; // FIX: célula nova registrada (antes: torre fantasma)
return true;
```

- [ ] **Step 2: Teste de regressão da torre fantasma (smoke)**

Adicionar no fim de `smoke-v3.js`, antes do resumo final:

```js
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
  for (let i = 0; i < 300; i++) DO.stepSim(Sp, 1 / 60);
  check('T18.1 ocupação acompanha a torre em pursue', Sp.occupied[tp.c + ',' + tp.r] === tp, 'pos=' + tp.c + ',' + tp.r);
  check('T18.2 torre viva é vendável', DO.sellTower(Sp, tp) === true);
  check('T18.3 célula antiga fica livre', !Sp.occupied[cell.c + ',' + cell.r]);
})();
```

- [ ] **Step 3: Rodar o smoke e confirmar T18 PASS**

Run: `npm run smoke`
Expected: `T18.1..T18.3 PASS` e total sem FAIL novos.

- [ ] **Step 4: Corrigir o dano dobrado do míssil spec A**

Em `assets/sim.js` (~linha 696-703), o míssil usa `stats.dmg` que já inclui `spec.dmgMul`. Trocar:

```js
// antes
dmg: stats.dmg * ((spec && spec.dmgMul) || 1), splash: stats.splash,
// depois
dmg: stats.dmg, splash: stats.splash,
```

- [ ] **Step 5: Somar `splashAdd` do míssil spec B**

Em `assets/sim.js`, `getTowerStats` (~linha 373):

```js
// antes
const baseSplash = ((def.splash || (spec && spec.splash) || 0) + splashBonus) * splashMulAcc;
// depois
const baseSplash = ((def.splash || (spec && spec.splash) || 0) + ((spec && spec.splashAdd) || 0) + splashBonus) * splashMulAcc;
```

- [ ] **Step 6: Corrigir submunições do MIRV T5**

Ler `assets/sim.js` ~2340-2360 (explosão de míssil / criação de submunições) e garantir:
1. cada submunição nasce com `targetId` de um inimigo vivo próximo do ponto de impacto (o pai guarda `targetId`; se o alvo morreu, pegar o inimigo vivo mais próximo em raio `1.5 × CELL`; se não houver, `targetId: null`);
2. submunição sem alvo **detona em área ao expirar** (aplicar o mesmo dano de splash no ponto), em vez de sumir sem efeito.

- [ ] **Step 7: Testes de regressão de míssil (smoke)**

Adicionar seção `[T19]`:

```js
/* ---------- T19: míssil spec A/B e MIRV ---------- */
console.log('\n[T19] dano de míssil (spec A ×1, splashAdd B, MIRV detona)');
(function(){
  const Sm = DO.startNewGame(0, 'normal', false);
  Sm.credits = 99999; Sm.parts = 999; Sm.autoMove = false;
  const defM = D.TOWERS_DATA.find(t => t.id === 'missile');
  const cellM = { c: 3, r: 3 };
  const tm = DO.placeTower(Sm, cellM.c, cellM.r, 'missile');
  tm.specBranch = 'A';
  const st = DO.getTowerStats(Sm, tm);
  check('T19.1 spec A não multiplica de novo (dmg = stats.dmg)',
    (function(){ DO.spawnEnemy(Sm, 'tank'); const e = Sm.enemies[Sm.enemies.length-1]; e.x = tm.x; e.y = tm.y + 10; DO.fireTower(Sm, tm, e, st); const pr = Sm.projectiles[Sm.projectiles.length-1]; return pr && Math.abs(pr.dmg - st.dmg) < 1e-6; })());
  tm.specBranch = 'B';
  const stB = DO.getTowerStats(Sm, tm);
  check('T19.2 spec B soma splashAdd (65+40)', Math.abs(stB.splash - 105) < 1e-6, 'splash=' + stB.splash);
})();
```

- [ ] **Step 8: Cannon spec A concussão + cryo spec B aura + mutações**

1. **Cannon spec A**: no impacto de projétil `bullet` (ver caminho de impacto em `assets/sim.js` ~2260-2340), se `stats.splash > 0`, aplicar dano de área (mesma fórmula da explosão de míssil: `dmg * (1 - dist/raio * 0.5)`) aos inimigos no raio, sem re-aplicar no alvo direto.
2. **Cryo spec B aura** (`auraSlow`): em `stepSim`, para torre cryo com `specBranch === 'B'`, a cada 0.5s aplicar slow (`slowTimer = 1.0`, `slowFactor = 0.85`) aos inimigos dentro de `stats.rngSq`, sem consumir batt/ammo e sem `ev` de tiro.
3. **mut_cryo**: no disparo cryo, `slowTimer = 2.2 * (1 + 0.4 * (S.mutBuffs.cryo||0))` e `rngSq` do pulso `* (1 + 0.2 * (S.mutBuffs.cryo||0))`.
4. **mut_poison**: no disparo venom, `poisonTimer = 3.5 * (1 + 0.45 * (S.mutBuffs.poison||0))` e aplicar veneno a +1 inimigo mais próximo (se houver) com os mesmos valores.

- [ ] **Step 9: `getWaveSpawnMultiplier` (data.js)**

Adicionar em `assets/data.js` (junto de `makeEndlessWave`):

```js
function getWaveSpawnMultiplier(wave) {
  return 1 + 0.3 * Math.floor((Math.max(1, wave) - 1) / 10);
}
```

E exportar na lista final (`getWaveSpawnMultiplier,`). O consumo em `sim.js:1601/1641` deve passar a valer: garantir que o multiplicador **aumente a quantidade de spawns** da fila (a leitura atual usa `mult` — verificar o trecho e aplicar `Math.round(qtd * mult)` quando for contagem).

- [ ] **Step 10: Barra de chefe com múltiplos chefes**

Em `assets/sim.js`:
- No `killEnemy` do boss (~linha 571): em vez de `S.activeBoss = null;`, usar `S.activeBoss = strongerLivingBoss(S);` (helper: primeiro boss vivo com maior `hp + shield`, ou `null`).
- No vazamento (~linha 1896): mesma troca.

- [ ] **Step 11: `slowImmune` nos supers/EMP**

Em `assets/sim.js` ~862 e ~970: envolver a aplicação de `slowTimer/slowFactor` com `if (!e.defRef.slowImmune)`, mantendo stun/dano como já definido.

- [ ] **Step 12: Save v3 tolerante a corrupção**

Em `assets/data.js` (`Save.load`/`defaults`, ~linha 656-694): normalizar o objeto carregado — `tech` sempre `{}` com números; `mapStars` sempre array de números; `crystals/credits` numéricos; campos desconhecidos ignorados. `techLvl` (`sim.js:52`) e `livesMax` (`sim.js:63`) não podem estourar/NaN.

- [ ] **Step 13: Testes de regressão restantes + gates**

Adicionar `[T20]` com: wave multiplier (1.0/1.3/1.6), dois bosses (matar um → `activeBoss` não nulo), slowImmune do colosso (EMP não altera `slowTimer`), save corrompido (`D.Save.load` de um objeto `{tech:null, mapStars:'x'}` não lança e devolve defaults), cryo B aura sem gastar batt, mutações.

Run: `node --check assets/sim.js && node --check assets/data.js && npm run smoke`
Expected: todos PASS (174+ novos), 0 FAIL.

- [ ] **Step 14: Playwright não pode regredir**

Run: `npm run pw`
Expected: 99 PASS / 0 FAIL.

---

## Task 1B: Onda 2 — TIER_LOGIC verdadeiro + TIER_STATS (sim/data)

**Files:**
- Modify: `assets/sim.js`
- Modify: `assets/data.js`
- Modify: `tools/balance-sim.js`
- Test: `smoke-v3.js`

**Interfaces:**
- Consumes: infra de dano existente — `e.armor`, `e.burnTimer/burnDps`, `e.slowTimer/slowFactor`, `e.stunTimer`, `e.markedTimer`, `e.cryoVuln`, `stats.pierceBonus/critBonus`.
- Produces: `D.TIER_LOGIC` 100% consumido; nenhuma chave fica só no fallback.

- [ ] **Step 1: Implementar os efeitos por torre (hooks exatos)**

Em `assets/sim.js`, garantir consumo real de cada `eff` (removendo aos poucos o fallback de `sim.js:374-383`):

| Torre/Tier | Efeito | Onde implementar | Semântica |
|---|---|---|---|
| cannon T4 | ricochet 1 | impacto do bullet | 50% do dano num 2º inimigo a ≤1.5□ do impacto, 1× por projétil (checar `hitIds`) |
| cannon T5 | killDmg | `killEnemy` + `getTowerStats` | +1% dano por abate DESTA torre, cap +50% (`t.killStacks`; em `damageEnemy` guardar `e._lastSrc = opt.src`; em `killEnemy` incrementar `_lastSrc.killStacks` se a torre tem o efeito) |
| gatling T3 | stunChance 12% | impacto do bullet | `e.stunTimer = max(e.stunTimer, 0.25)` com 12% de chance pelo atirador |
| laser T2 | vsBurn 1.25 | `damageEnemy` | se `src` laser com T2 e `e.burnTimer > 0`: `finalDmg *= 1.25` |
| laser T3 | sweepAdd 1 | disparo do beam | +1 alvo varrido (aplicar dano ao inimigo vivo mais próximo do alvo atual dentro do alcance) |
| laser T4 | shieldPhase 0.5 | `damageEnemy` | `opt.src._shieldPhase`: `phase×dmg` vai direto ao HP mesmo com escudo; o resto consome escudo |
| laser T5 | meltArmor 1/s | step do beam | enquanto o beam atinge o mesmo alvo, acumular tempo e reduzir 1 armor/s (cap no armor do inimigo) |
| missile T3 | fragAdd 1 | explosão | +1 fragmento (dano 40% do míssil, splash 60%) no impacto |
| missile T4 | hitAir | já existe (`sim.js:699`) | validar e marcar como implementado |
| cryo T4 | coldAura 0.15 | `stepSim` | slow passivo 15% em raio, sem custo (similar ao spec B, mais fraco) |
| cryo T5 | bossFreeze 0.5 | pulso cryo | freezeChance também em bosses, com duração ×0.5 |
| tesla T2 | ionSlow 0.12 | cadeia | cada alvo atingido: `slowTimer=1.5`, `slowFactor=min(0.88, atual)` |
| tesla T4 | vsShield 1.6 | `damageEnemy` | `e.shield > 0` e `src` tesla T4: `finalDmg *= 1.6` |
| tesla T5 | globalChain | cadeia | saltos ignoram distância (`nextDistSq = Infinity`) |
| sniper T2 | mark | acerto | `e.markedTimer = 1.5`, `e.markMul = 1.15`; `damageEnemy` usa `e.markMul || 1.35` |
| sniper T3 | ignoreArmor | `damageEnemy` | pular o desconto de armor quando `shooterLogic.eff.ignoreArmor` |
| sniper T5 | execAdd 0.25 | disparo snipe | limiar de execução = `max(spec.exec||0, 0.25)` |
| venom T2 | corrode | aplicação de dot | `e.armor = max(0, e.armor - 1)` por aplicação |
| venom T3 | plagueBase | `towerHasPlague` | retornar true para venom T3+ (verificar a função existente) |
| venom T4 | pctPoison 0.006 | aplicação de dot | `poisonDps += 0.006 * e.maxHp` |
| venom T5 | deathCloud | `killEnemy` | morte envenenada por venom T5: nuvem em 2□ com dano = `poisonDps × 2` |
| rail T4 | fullBase | já existe (`sim.js:805`) | validar e marcar |
| rail T5 | starLine | já existe (`sim.js:804`) | validar e marcar |

- [ ] **Step 2: Remover o fallback genérico**

Depois de todos os efeitos acima terem consumo, remover o bloco `sim.js:374-383` (o `+5%` para chaves desconhecidas). Manter as chaves já consumidas explicitamente.

- [ ] **Step 3: Cache de `getTowerStats` por frame (Onda 4.1)**

Em `assets/sim.js`: `getTowerStats(S, t)` é chamado por torre por frame e varre todas as torres em busca de amps (`sim.js:313-353`) + `getResupply` O(T) — O(T²)/frame com alocações. Implementar cache com invalidação:
- guardar em `t._statsCache = { key, value }` com `key` composta por: `t.level`, `t.specBranch`, JSON de `t.comp`, `S.mutBuffs` (valores), `S.combo`, `techLvl('global_dmg')`/`global_rng`, overdrive (`S.powers.overdrive.dur > 0`), `S.overdriveBuff`, e uma versão global `S._ampVersion` incrementada em `placeTower`/`sellTower`/`moveTower`/`mergeTowers` e mudanças de tier.
- retornar `t._statsCache.value` quando a chave bate.
- Teste: `DO.getTowerStats(S,t)` duas vezes seguidas devolve o **mesmo objeto**; após `t.level++` (ou trocar spec/comp) devolve valor atualizado; comparar valores com um clone "fresco" forçando cache miss (ex.: zerar `t._statsCache` no teste).

- [ ] **Step 4: Remover `TIER_STATS`**

- `assets/data.js`: remover o array `TIER_STATS` (~786-793) e da exportação (~963).
- `tools/balance-sim.js`: ajustar para calcular progressão só pela curva de nível + efeitos reais (ler o arquivo; remover referências à tabela).
- `npm run smoke` deve continuar verde (nenhum teste usa TIER_STATS).

- [ ] **Step 5: Testes de regressão de TIER_LOGIC (smoke)**

Adicionar `[T21]` com um teste por efeito implementado (pelo menos os de dano direto: cannon T4/T5, gatling T3, laser T2/T4, tesla T2/T4, sniper T2/T3/T5, venom T2/T4/T5, cryo T4/T5). Exemplo de padrão:

```js
// cannon T4 ricochete: dois inimigos próximos, um disparo fere os dois
const Src = DO.startNewGame(0, 'normal', false);
Src.credits = 99999; Src.autoMove = false;
const tc = DO.placeTower(Src, 3, 3, 'cannon'); tc.level = 31; // T4
DO.spawnEnemy(Src, 'drone'); DO.spawnEnemy(Src, 'drone');
const ea = Src.enemies[0], eb = Src.enemies[1];
ea.x = tc.x + 30; ea.y = tc.y; ea.speed = 0;
eb.x = tc.x + 55; eb.y = tc.y; eb.speed = 0;
const hpB0 = eb.hp;
DO.fireTower(Src, tc, ea, DO.getTowerStats(Src, tc));
for (let i = 0; i < 120; i++) DO.stepSim(Src, 1/60);
check('T21 cannon T4 ricochete fere o segundo alvo', eb.hp < hpB0 || eb.dead);
```

- [ ] **Step 6: Gates**

Run: `node --check assets/sim.js && node --check assets/data.js && node --check tools/balance-sim.js && node tools/balance-sim.js && npm run smoke && npm run pw`
Expected: smoke e pw verdes; balance-sim roda sem erro.

---

## Task 2: Onda 3 — UX/Mobile + game.js perf/áudio (frontend)

**Files:**
- Modify: `index.html`
- Modify: `assets/game.js`
- Modify: `assets/ui.js`
- Test: `playwright-test.js`

**Interfaces:**
- Consumes: DOM existente; `window.__game`, `window.DO`.
- Produces: nenhuma API nova; comportamento de DOM corrigido.

- [ ] **Step 1: Tooltip não fica preso no toque**

Em `assets/game.js` (~932-941): adicionar dismiss — `document.addEventListener('pointerdown', ...)` fecha `#tooltip` quando o alvo não é o card que a fixou; `showMutation()` (e `showLab/showCodex/showAch` se houver) chama a função de esconder; garantir `#tooltip` com `z-index` menor que os modais (ex.: 49 < 50). Não interceptar cliques do modal.

- [ ] **Step 2: Supers acessíveis no portrait e sem sobreposição no desktop**

`index.html` CSS:
- Em `@media (orientation:portrait) and (max-width:760px)`: `#supers` vira 2 colunas (`flex-wrap:wrap` com largura para 2 botões) ou botões de 56×44, de forma que o 4º fique dentro de `#board-shell`.
- Desktop: quando `#board-shell.tower-panel-open`, deslocar `#supers` para `right: 320px` (ou `left` quando o painel estiver aberto) garantindo que o painel (`z-index:36`) não cubra os supers clicáveis.
- Nitidez do pixel art (par da Task 3): adicionar `#game-canvas canvas{image-rendering:pixelated;image-rendering:crisp-edges}` no CSS.

- [ ] **Step 3: Corrigir os literais `\u00D7` / `\u221E`**

`assets/game.js`: linhas ~1976, ~2024, ~2038 — trocar `'\\u00D7'` por `'×'` e `'\\u221E'` por `'∞'`. Testar no Playwright: `#btn-speed` começa com `×1`; no infinito `#hud-wave-total` contém `∞`.

- [ ] **Step 4: Painel da torre não fecha ao rolar/tocar dentro (mobile)**

`assets/game.js` ~1267-1278: o handler de `pointerdown` que fecha o painel deve ignorar eventos dentro de `#tower-panel` (inclusive `summary`/scroll) e só fechar em toque fora. Não fechar durante scroll (se necessário, detectar deslocamento > 8px e cancelar o fechamento).

- [ ] **Step 5: Alvos ≥44px no mobile**

`index.html`: `.pill` e `.menu-row button` com `min-height:44px` nas media queries móveis (sobrescrever os 40/42px atuais); `#tower-panel.compact .tp-sec>summary` com `min-height:44px`.

- [ ] **Step 6: ESPAÇO sem pause duplo**

`assets/game.js` ~1192-1200: no `keydown-SPACE`, chamar `e.preventDefault()` (e checar `e.repeat`) antes do toggle.

- [ ] **Step 7: Modais de pause/fim bloqueiam a tela toda no portrait**

`index.html`: mover `#pause-overlay` e `#modal-end` para fora de `#board-shell` (filhos diretos de `body`, como `#modal-mut`) mantendo classes/IDs, ou forçar `position:fixed; inset:0` nessas duas. Testar: pausado, clique em `#btn-nextwave-mobile` não inicia onda.

- [ ] **Step 8: Tutorial volta a avançar ao construir a 1ª torre**

`assets/game.js` ~1176: o patch de `bindInput` que re-registra `pointerdown` deve incluir o trecho de auto-avanço do tutorial (`_tutIdx === 0` → avançar) do código original.

- [ ] **Step 9: Toasts não cobrem a loja + topbar compacta**

- `#toasts` desktop: subir para `bottom: 100px` ou alinhar à esquerda (`left:16px; bottom:16px`) para não cobrir a `#shopbar`.
- `@container layout (max-width:1150px)`: compactar a topbar (fontes/gaps/min-widths) para altura ≤ ~92px em 1024–1366.

- [ ] **Step 10: Remover o aviso "gire a tela" morto**

`index.html`: remover `#orientation-nudge` (markup + CSS `#orientation-nudge*` e `body.is-playing #orientation-nudge`); manter `requestLandscape` no clique de `#btn-start` (remover o seletor `[data-phase]`).

- [ ] **Step 11: game.js performance/áudio/higiene**

- `bgstars` (`game.js:207-211`): só gerar se `!this.textures.exists('bgstars')`.
- Preview de onda (`game.js:2066-2069`): cachear por `S.wave` (não recalcular todo frame).
- `spark`/`updateParticles` (`game.js:338-350`, `1526-1531`): contador de ativos em vez de varrer o pool.
- Laser na pausa/fim (`game.js:1317-1324`): chamar `SND.laserStopAll()` no pause e no encerramento.
- `cleanup()` (`game.js:135-149`): remover/ocultar `.supply-ring`.
- `syncHud` (`game.js:2059-2063`): só reconstruir `#tp-specs` quando a seleção/spec mudar (guardar assinatura).
- Pausa: pausar/retomar tweens e partículas da cena no toggle (`this.tweens.pauseAll()/resumeAll()`), para FX ambientais pararem junto com o combate.

- [ ] **Step 12: Testes Playwright das correções**

Adicionar em `playwright-test.js` (antes do resumo): tooltip fecha fora/abre modal; 4 supers dentro do board em portrait; `#btn-speed` = `×1`; painel continua aberto após scroll; `min-height` ≥44px de `.pill`; Espaço com foco no botão = 1 toggle; pausado não inicia onda; tutorial avança ao colocar torre.

- [ ] **Step 13: Gates**

Run: `node --check assets/game.js && node --check assets/ui.js && npm run smoke && npm run pw`
Expected: smoke 174+ PASS; Playwright 99+ novos PASS, 0 FAIL.

---

## Task 3: Ondas 4/5 — Render, performance e áudio (scenes/audio/textures)

**Files:**
- Modify: `assets/scenes.js`
- Modify: `assets/audio.js`
- Modify: `assets/textures.js`
- Modify: `assets/tiles.js`
- Modify: `assets/pixelart.js`

**Interfaces:**
- Consumes: `S.enemies` (`eid`), `S.towers` (`tid`), `window.PXART`, `TILES`.
- Produces: mesmas chaves de textura e APIs; só performance e FX.

- [ ] **Step 1: Views de inimigos/torres com Map (fim do `String().find`)**

`assets/scenes.js` ~82-85 e ~112-115: manter `Map` de `eid → view` e `tid → view` (limpar no destroy/onda) em vez de `S.enemies.find(en => String(en.eid) === eid)` por frame.

- [ ] **Step 2: Guarda de rebuild de texturas**

`assets/scenes.js` (`makeTextures`/Boot/Menu), `assets/tiles.js:143-161`, `assets/pixelart.js` (`buildAll`): só gerar textura se `!scene.textures.exists(key)` (as texturas são determinísticas). Aceite: iniciar → menu → iniciar não regenera ~150 texturas (medir com contador temporário no console; remover o contador ao final).

- [ ] **Step 3: Pixel art nítido**

`assets/scenes.js` ~905-914 (`gameConfig`): adicionar `pixelArt: true` (ou `antialias: false` + `roundPixels`). `index.html` é dono da Task 2 — se necessário, pedir a inclusão de `#game-canvas canvas { image-rendering: pixelated; }` no relatório da Task 3 e deixar a Task 2/4 aplicar. Comparar screenshots antes/depois.

- [ ] **Step 4: Destruir `odFlame` e limpar FX**

`assets/scenes.js` ~124-127: `destroy()` no fim do overdrive em vez de `setAlpha(0)`; garantir que `towerViews` limpa FX ao vender/merge (sem vazamento).

- [ ] **Step 5: Terra/lua coerentes com o pixel art**

`assets/scenes.js` ~342-368 e `assets/textures.js:321-337`: adicionar contorno preto de 1px lógico e manter a escala/paleta do PXART (sem redesenhar a identidade). Screenshot comparativo.

- [ ] **Step 6: Remover texturas órfãs**

`assets/scenes.js` e `assets/pixelart.js`: parar de gerar `trail`, `star2`, os 8 `px_pr_*` e os 7 `tile_*_mini` — confirmar antes com `rg "px_pr_|tile_.*_mini|'trail'|'star2'"` que não há consumidores.

- [ ] **Step 7: Áudio — mute/desmute e laser**

`assets/audio.js` ~66/71: guardar os ganhos base dos drones em vez de restaurar `d.g.gain.value` (que já é 0); desmutar restaura os ganhos originais. Validar que `SND.laserStopAll()` existe e é chamado pela Task 2 no pause.

- [ ] **Step 8: Gates**

Run: `node --check assets/scenes.js && node --check assets/audio.js && node --check assets/textures.js && node --check assets/tiles.js && node --check assets/pixelart.js && npm run smoke && npm run pw`
Expected: verdes; screenshots sem regressão visual grosseira.

---

## Task 4: Onda 6 — Remoção dos modos Nave + limpeza final

**Files:**
- Delete: `assets/nave.js`
- Modify: `index.html`, `assets/scenes.js`, `assets/data.js`, `assets/sim.js`, `assets/ui.js`, `smoke-v3.js`, `playwright-test.js`

**Interfaces:**
- Consumes: trabalho das Tasks 1-3 concluído.
- Produces: jogo sem referências a Nave/SHMUP/Metal.

- [ ] **Step 1: Apagar `assets/nave.js` e o `<script>` (`index.html:1179`)**

- [ ] **Step 2: `assets/scenes.js`**

- Remover `MetalSlugScene` (~513-697).
- Remover os overrides de campanha (~700-790), incluindo o botão "AVENTURA NAVINHA" injetado na vitória e o `push` das classes Nave no `gameConfig`.
- `gameConfig.scene` (~913): `[BootScene, MenuScene, GameScene]`.
- Remover o export `window.DO.recordNaveProgress` (~957).

- [ ] **Step 3: `assets/data.js`**

- Remover `SHMUP_STAGES`, `NAVE_STYLES`, `NAVE_CAMPAIGNS`, `METAL_STAGES` (~467-536) e da exportação (~958).
- Remover `naveProgress`/`naveStars` dos defaults do save (~651-652) e qualquer validação associada.

- [ ] **Step 4: `assets/sim.js`**

- Remover `recordNaveProgress`/`resolveNaveStage` (~2394-2416) e referências.

- [ ] **Step 5: `assets/ui.js`**

- Remover `showNaveCampaign` (~262-330) e o bloco do `#shmup-grid` (~136-171) — manter `uastro` (astronauta) intacto.

- [ ] **Step 6: `index.html`**

- Remover CSS morto: `#shmup-grid`, `#metal-grid`, `#extra-phases`, `#btn-shmup` (linhas ~112-116, ~308, ~415, ~428, ~447, ~458-459) e o seletor `[data-phase]` (~1260).

- [ ] **Step 7: Testes**

- `smoke-v3.js`: remover os 4 checks de `recordNaveProgress` (~388-392).
- `playwright-test.js`: manter os checks "extra fases removidas"/"metal slug removido" (guardas). Ajustar contagens totais se houver.

- [ ] **Step 8: Limpezas menores**

- `GameScene.toggleMute` morto (`game.js:1305`), `projLayer`/`spawners` sem uso (`game.js:277/86`), textura `tbase` invisível se confirmado sem uso, `MetalSlugScene` sem referências.

- [ ] **Step 9: Busca final por referências**

Run: `rg -n "NAVE_|SHMUP_|METAL_STAGES|naveProgress|naveStars|showNaveCampaign|recordNaveProgress|resolveNaveStage|NaveScene|ShmupScene|AsteroidsScene|MetalSlugScene|nave_last_ship|btn-shmup|shmup-grid|metal-grid" assets index.html smoke-v3.js playwright-test.js`
Expected: nenhum resultado (ou apenas comentários/inertes documentados).

- [ ] **Step 10: Gates**

Run: `node --check assets/*.js && npm run smoke && npm run pw`
Expected: smoke (sem os 4 checks) e Playwright verdes; nenhum `ReferenceError`.

---

## Task 5: Verificação final (executada pelo orquestrador)

**Files:**
- Nenhum (somente leitura/execução)

- [ ] **Step 1: Sintaxe e suítes**

Run: `Get-ChildItem assets -Filter *.js | ForEach-Object { node --check $_.FullName }; npm run smoke; npm run pw`
Expected: smoke 100% PASS; Playwright 100% PASS.

- [ ] **Step 2: Auditoria de browser renovada**

Rodar o script de auditoria (`C:\Users\adolf\AppData\Local\Temp\opencode\hermes-audit.js` e `hermes-viewports.js`) e conferir:
- torre fantasma: `sold: true`;
- `#btn-speed` = `×1`; supers 4/4 visíveis no board do portrait;
- tooltip fecha;
- sem erros de console/página em desktop/portrait/landscape;
- matriz de resoluções sem overflow.

- [ ] **Step 3: Screenshots finais**

Capturar desktop (1366×768), portrait (390×844) e landscape (844×390) em combate e menu; revisar visual (pixel art nítido, sem elementos cortados).

- [ ] **Step 4: FPS comparativo**

Medir FPS com 90 inimigos + 12 torres como no diagnóstico; documentar antes/depois (headless é indicativo).

- [ ] **Step 5: Relatório final**

Resumir: correções por onda, testes adicionados, gates verdes, pendências/riscos restantes.
