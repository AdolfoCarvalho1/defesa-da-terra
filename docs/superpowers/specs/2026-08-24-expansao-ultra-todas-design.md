# Design: Expansão Ultra — Todas (Caminho, Velocidade, Upgrades, Visual T1-T5, Armas Visíveis, Fusão Híbrida, Fábricas, Supers)

**Data:** 2026-08-24
**Status:** Aprovado — Approach 1 Incremental Paralelo
**Escopo:** 7 frentes paralelas, sem rebuild

## 1. Arquitetura Geral
Manter `DO3` namespace `data.js:2` como fonte única. Cada frente altera 1-2 arquivos isolados, sem conflito:
- `data.js` → `MAPS_DATA`, `ENEMIES_DATA`, `TOWERS_DATA`, `FACTORY_DATA`
- `scenes.js` → `buildStatic`, `canHitAir`, `mergeTowers`, `syncTowers`, `NaveScene`
- `pixelart.js` → `TOWER_ART`, `ENEMY_ART`, `PROJ_ART`
- `tiles.js` → `THEMES`, `drawTile`, `drawPathTile`
Todos os testes `smoke-v3.js:47 PASS` e `playwright-test.js:30 PASS` devem permanecer verdes.

## 2. Componentes

### 2.1 Caminho Maior
- **Onde:** `scenes.js:2240` `routeGfx.lineStyle(CELL*0.62,...)` e `tiles.js:38` `drawPathTile`
- **O que:** Corredor de 44px → 64px. `CELL` continua 44 para não quebrar `getPathBlockedCells`, mas `pathTile` renderiza 64x64 (overlap 10px) e `routeGfx` usa `CELL*0.88`. Visual: parede 8px extra, borda cyan mais grossa.
- **Interface:** `D.getPathBlockedCells()` inalterado; só visual muda.
- **Risco:** Baixo — só `buildStatic`.

### 2.2 Velocidade Inimigos Menor
- **Onde:** `data.js:248` `ENEMIES_DATA.*.spd` e `scenes.js:67` `hpMultiplier`
- **O que:** `spd *0.82` global. Ex: `drone.spd 62→50`, `runner 110→90`. Aplicado via `mul *0.82` em `spawnEnemy` para não alterar `data.js` diretamente (preserva saves).
- **Teste:** `smoke[T3]` 16 ondas ainda passa, mas com `S.wave` 10% mais lento.

### 2.3 Mais Escolhas nos Upgrades
- **Hoje:** `specA/specB` no nível 4 `data.js:22` + `skills` a cada 4 níveis até 48 `data.js:92` (12 skills).
- **Novo:** `specC` no nível 20 (terceira via) + 2 skills extras nível 52/56 (total 14). Ex: `cannon.specC = {name:'Bateria de Plasma', dmgMul:1.8, burn:true}`.
- **UI:** `scenes.js:1710` `showTowerPanel` mostra 3 botões `Spec A/B/C` se `level>=4 && !specBranch`, desabilita se já escolheu.
- **Regra:** Uma escolha por torre, não acumulativa.

### 2.4 Evolução Visual T1-T5 + Armas Visíveis
- **Já existe:** `D.getTier(level)` `data.js:684` → T1 1-10, T5 41-50, `pixelart.js:44` `TOWER_ART` + `applyTierArt:419` (pods/trim/núcleo/aura) + escala `1.0/1.08/1.18/1.30/1.45`.
- **Novo:** Cada `TOWER_ART` ganha arma visível por `kind`:
  - `cannon` cano duplo frontal com brilho ao atirar
  - `laser` tubo alongado + lente `G` grande com `tint(col,0.5)`
  - `missile` rack vertical com 2 ogivas `O/Y`
  - `tesla` bobina com arco `Y`
  - `rail` trilhos paralelos `M` longos
- **Implementação:** Trocar 10 entradas `TOWER_ART` (12 linhas cada) para versão com arma destacada. `buildTowerTextures` já usa `towerPalette` + `applyTierArt`, sem mudar `syncTowers`.
- **Teste:** `tur_cannon_t5` deve existir e ser visualmente distinto de `t1`.

### 2.5 Fusão Híbrida (2 tipos)
- **Hoje:** `mergeTowers(S,t)` `scenes.js:798` consome 2 do mesmo `id` + mesmo `tier` + `MERGE_PARTS[tier]` → `t.level = tier*10+1`.
- **Novo:** `FUSION_RECIPES = { 'missile+venom': {id:'missile_venom', name:'Míssil Peste', kind:'splash', dmg:35, dot:true, color:'#a3e635', icon:'☣➤'} }` (10 combos, 1 por par popular).
- **Lógica:** `fusionTower(S, tA, tB)` consome `tA` e `tB` (tiers iguais ou `|tierA-tierB|<=1`), paga `MERGE_PARTS[maxTier]+20`, cria nova torre híbrida no `c,r` de `tA` com `level = max(tA.level,tB.level)`, `specBranch=null`, `isFusion=true`, `fusionIds=[tA.id,tB.id]`. Usa `sellTowerRaw` para remover `tB`.
- **Visual:** Nova entrada `TOWER_ART.missile_venom` com rack + tanques verdes.
- **UI:** Botão `FUNDIR HÍBRIDO` no painel quando 2 torres diferentes selecionáveis.

### 2.6 Fábricas Expandidas
- **Hoje:** `FACTORY_DATA:724` uma fábrica `id:factory` que gera `+10⚙ e +18cr` por onda `data.js:730`.
- **Novo:** 3 tipos:
  - `factory` (créditos/peças) — já existe
  - `factory_shield` — gera `+8 escudo` para torres vizinhas (anel `B:#60a5fa`)
  - `factory_fusion` — reduz custo de fusão `-25%` e permite fusão a distância `rng 180`
- **Dados:** `FACTORIES = [FACTORY_DATA, SHIELD_FACTORY, FUSION_FACTORY]` cada com `cost, kind, color, partsPerWave`.
- **Render:** `pixelart.js:378` `factoryArt(lvl, type)` com chaminé + luz `N` (verde), `Y` (dourado) ou `B` (azul).
- **UI:** 3 cards na `shopbar` com ícone `⚙/🛡/⚗`.

### 2.7 Supers Mais Visuais
- **Hoje:** `SUPERS_AUTO:707` 10 supers com `ev({t:'boom'})` e `SUPERS:628` 4 supers orbitais.
- **Novo:** Cada super ganha `anim` + `particles` + `shake` + `banner`:
  - `cannon: Barragem` — 20 `boom` com `flare` + `shake 14`
  - `laser: Prisma` — `beam` varrendo com `trail`
  - `missile_venom` híbrido — `missile` + `dot` verde
- **Implementação:** Em `fireTower` e `SUPERS_AUTO`, trocar `ev({t:'boom'})` por `ev({t:'anim', key:'super_'+id, dur:1.2})` e criar `this.fx.add(anim)` com `tween`.
- **Teste:** `S.autoSupersFired` ainda incrementa.

## 3. Fluxo de Dados
`placeTower` → `occupied` → `syncTowers` → `towerViews` → `canHitAir() → findBestTarget → fireTower` (arma visível) → `killEnemy` → `parts` → `mergeTowers/fusionTower` → `buildTowerTextures` (tier) → `syncTowers` (nova textura) → `SUPERS_AUTO` (carga → anim). `buildStatic` lê `TILES` e `MAPS_DATA` para desenhar `pathTiles`.

## 4. Tratamento de Erros
- `canHitAir` novo sempre `true` (exceto factory/buff) — sem erro se `def` faltar.
- `fusionTower` valida `tier` e `parts` antes de consumir; se falhar, `SND.error()` e `ev float 'PEÇAS INSUFICIENTES'`.
- `factory_shield` só buffa se `dist <= rng`, sem crash se `S.towers` vazio.
- `SUPERS` novos têm fallback para `boom` se `anim` falhar.

## 5. Testes
- `node --check` 4 arquivos
- `smoke-v3.js` 47 PASS (adicionar `fusion`, `shield` testes)
- `playwright-test.js` 30 PASS → 31 PASS (6 mapas + fusão)
- Novo teste visual: `tur_missile_venom_t3` existe, `tile_path_*` com seta.

## 6. Não-goals
- Não refazer `vite.config.mjs`, não tocar `audio.js`.
- Sem novo `physics` engine.
- Sem mudar `SAVE_KEY` (compatível com saves v3).
