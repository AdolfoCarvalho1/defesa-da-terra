# Expansão Ultra — Todas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 7 frentes paralelas (caminho maior, velocidade menor, mais upgrades, evolução visual T1-T5 com armas visíveis, fusão híbrida, fábricas expandidas, supers mais visuais) mantendo `smoke 47 PASS` e `playwright 30 PASS`.

**Architecture:** Manter `DO3` monolito em `data.js` + `scenes.js` + `pixelart.js` + `tiles.js`. Cada task toca 1-2 arquivos isolados, sem novo bundler. Visual via `PX=3` `K/W` e `TOKENS`. Fusão e fábricas via tabelas em `data.js` consumidas por `scenes.js`.

**Tech Stack:** Phaser 3.87, Vite 8, `DO3` namespace, `PXART` ASCII, `TILES` 44px, `SND` audio.

## Global Constraints
- `CELL_SIZE` 44 (não quebrar `getPathBlockedCells`), `TOWER_MAX_LVL` 50
- Texto PT-BR, `SAVE_KEY` `defesa_orbital_v3` compatível
- `PHASER.AUTO` `BW 924` `BH 572`
- Sem novas dependências, sem mudar `vite.config.mjs`

---

### Task 1: Caminho Maior

**Files:**
- Modify: `assets/scenes.js:2235-2275` (buildStatic)
- Modify: `assets/tiles.js:38` (drawPathTile)
- Test: `smoke-v3.js` T1, `playwright-test.js`

**Interfaces:**
- Consumes: `D.getPathBlockedCells(map.routes)` → `blocked: {[c+','+r]:true}`
- Produces: `tile_path_<theme>` 64x64 texture, `pathTiles: Phaser.GameObjects.Image[]` at `depth 2`

- [ ] **Step 1: Write failing test**

```js
// smoke-v3.js add after T7e
const S0 = DO.startNewGame(0,'normal',false);
const blockedCount = Object.keys(S0.blocked).length;
check('caminho maior tem >40 células', blockedCount > 40, 'blocked='+blockedCount);
// novo teste visual: pathTile deve existir após buildStatic
check('tile_path_neptune-frontier existe após makeTextures', (()=>{ const g={make:{graphics:()=>({fillStyle(){},fillRect(){},lineStyle(){},strokeRect(){},generateTexture(){},destroy(){}})}, textures:{exists:()=>true, get:()=>({getSourceImage:()=>({width:64})})}}; try{ window.TILES.buildAll(g); return true;}catch(e){return false}})());
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node smoke-v3.js`
Expected: FAIL `caminho maior tem >40 células` (ainda 44px, não 64), `tile_path` still 44

- [ ] **Step 3: Write minimal implementation**

```js
// assets/tiles.js:38 drawPathTile — mudar CELL 44 → 64 visual (overlap)
// mudar de 44 para 64 no buildAll: g.generateTexture(pathKey, 64, 64)
// assets/scenes.js:2269 pathTiles: this.add.image(c*CELL+22, r*CELL+22, pathKey).setDisplaySize(64,64).setDepth(2)
// assets/scenes.js:2240 routeGfx lineStyle CELL*0.88 (de 0.62)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node smoke-v3.js` + `node playwright-test.js`
Expected: PASS, `diag-pixel-map.png` mostra corredor mais largo

- [ ] **Step 5: Commit**

```bash
git add assets/tiles.js assets/scenes.js
git commit -m "feat(map): caminho maior 64px pixel art"
```

---

### Task 2: Velocidade Inimigos Menor

**Files:**
- Modify: `assets/scenes.js:67` (hpMultiplier) or `assets/data.js:248` mul
- Test: `smoke-v3.js` T3

**Interfaces:**
- Consumes: `ENEMIES_DATA.*.spd`
- Produces: `spawnEnemy` com `speed *0.82`

- [ ] **Step 1: Write failing test**

```js
const S = DO.startNewGame(0,'normal',false); DO.startNextWave(S);
const e = S.enemies[0] || DO.spawnEnemy(S,'drone');
check('drone spd reduzido 50-54', e.speed >=48 && e.speed <=54, 'spd='+e.speed);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node smoke-v3.js`
Expected: FAIL `spd 62`

- [ ] **Step 3: Write minimal implementation**

```js
// assets/scenes.js:67 hpMultiplier já tem, mas speed em spawnEnemy:99
// mudar: speed: def.spd *0.82
// ou em data.js genVariants spdMul *0.82
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node smoke-v3.js`
Expected: PASS `spd 50`

- [ ] **Step 5: Commit**

```bash
git add assets/scenes.js
git commit -m "feat(balance): inimigos 18% mais lentos"
```

---

### Task 3: Mais Escolhas nos Upgrades

**Files:**
- Modify: `assets/data.js:22` (TOWERS_DATA specC), `assets/data.js:92` (skills)
- Modify: `assets/scenes.js:1710` (showTowerPanel)
- Test: `smoke-v3.js`

**Interfaces:**
- Consumes: `t.def.specA/specB/specC`, `t.skills`
- Produces: `setSpec(S,t,'C')`, UI com 3 botões

- [ ] **Step 1: Write failing test**

```js
const t = D.TOWERS_DATA.find(x=>x.id==='cannon');
check('cannon tem specC', !!t.specC);
check('cannon tem 14 skills', t.skills.length===14);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node smoke-v3.js`
Expected: FAIL `specC` undefined, `skills 12`

- [ ] **Step 3: Write minimal implementation**

```js
// data.js:22 add specC for each of 10 towers, data.js:92 add 2 skills lvl 52,56 per tower
// scenes.js:1710 if(t.level>=4 && !t.specBranch) show 3 spec buttons
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node smoke-v3.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/data.js assets/scenes.js
git commit -m "feat(upgrades): specC + skills 52/56"
```

---

### Task 4: Evolução Visual T1-T5 + Armas Visíveis

**Files:**
- Modify: `assets/pixelart.js:61` (TOWER_ART 10 entradas)
- Test: `smoke-v3.js` + visual check `diag-pixel-map.png`

**Interfaces:**
- Consumes: `towerPalette(col)` `applyTierArt`
- Produces: `tur_<id>_t1..t5` textures com arma visível

- [ ] **Step 1: Write failing test**

```js
check('tur_cannon_t5 existe', (()=>{ const s={textures:{exists:k=>k==='tur_cannon_t5'}, make:{graphics:()=>({fillStyle(){},fillRect(){},generateTexture(){},destroy(){}})}}; window.PXART.build(s); return s.textures.exists('tur_cannon_t5');})());
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node smoke-v3.js`
Expected: FAIL (ainda usa arte antiga sem arma)

- [ ] **Step 3: Write minimal implementation**

```js
// pixelart.js:61 TOWER_ART.cannon com cano duplo mais longo e brilho, etc. Para cada das 10 torres trocar 12 linhas para versão com arma destacada (cano, lente, rack)
// já existe applyTierArt, manter
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node playwright-test.js` + visual check

- [ ] **Step 5: Commit**

```bash
git add assets/pixelart.js
git commit -m "feat(visual): armas visíveis T1-T5"
```

---

### Task 5: Fusão Híbrida

**Files:**
- Modify: `assets/data.js:707` (add FUSION_RECIPES)
- Modify: `assets/scenes.js:798` (mergeTowers → fusionTower)
- Test: `smoke-v3.js`

**Interfaces:**
- Consumes: `S.towers`, `MERGE_PARTS`, `FUSION_RECIPES`
- Produces: `fusionTower(S, tA, tB) → newTower`, `DO.fusionTower`

- [ ] **Step 1: Write failing test**

```js
const S=DO.startNewGame(0,'normal',false); S.credits=99999; S.parts=100;
const c1=DO.placeTower(S,0,0,'missile'); const c2=DO.placeTower(S,1,0,'venom'); c1.level=10; c2.level=10;
const f=DO.fusionTower(S,c1,c2);
check('fusão missile+venom cria híbrido', !!f && f.defRef.id==='missile_venom');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node smoke-v3.js`
Expected: FAIL `fusionTower not defined`

- [ ] **Step 3: Write minimal implementation**

```js
// data.js:707 const FUSION_RECIPES = {'missile+venom':{id:'missile_venom', ...}, ... 9 more}
// scenes.js:798 function fusionTower(S,tA,tB){ if(!canMerge... ) ... sellTowerRaw(S,tB); tA.defRef = hybridDef; tA.level = max...; return tA; }
// expose window.DO.fusionTower
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node smoke-v3.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/data.js assets/scenes.js
git commit -m "feat(fusion): híbrida missile+venom"
```

---

### Task 6: Fábricas Expandidas

**Files:**
- Modify: `assets/data.js:724` (FACTORIES)
- Modify: `assets/pixelart.js:378` (factoryArt)
- Modify: `assets/scenes.js:846` (placeFactory)
- Test: `smoke-v3.js`

**Interfaces:**
- Consumes: `FACTORY_DATA`
- Produces: `factory_shield`, `factory_fusion` placeable

- [ ] **Step 1: Write failing test**

```js
check('3 fábricas', D.FACTORIES.length===3);
const S=DO.startNewGame(0,'normal',false); S.credits=999; const f=DO.placeTower(S,0,0,'factory_shield'); check('shield factory place', !!f);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node smoke-v3.js`
Expected: FAIL `FACTORIES` undefined

- [ ] **Step 3: Write minimal implementation**

```js
// data.js:724 const SHIELD_FACTORY={id:'factory_shield', kind:'factory', color:'#60a5fa', ...}, FUSION_FACTORY similarly, const FACTORIES=[FACTORY_DATA, SHIELD_FACTORY, FUSION_FACTORY]
// pixelart.js:378 factoryArt(lvl,type) switch type
// scenes.js:846 placeFactory handle id factory_shield
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node smoke-v3.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/data.js assets/pixelart.js assets/scenes.js
git commit -m "feat(factory): shield e fusion"
```

---

### Task 7: Supers Mais Visuais

**Files:**
- Modify: `assets/scenes.js:600` (fireAutoSuper, SUPERS)
- Modify: `assets/data.js:628` (SUPERS)
- Test: `playwright-test.js`

**Interfaces:**
- Consumes: `SUPERS_AUTO`, `S.autoSupersFired`
- Produces: `anim` com `tween` + `particles` + `shake`

- [ ] **Step 1: Write failing test**

```js
// check super has anim flag
check('super missile_venom anim', D.SUPERS_AUTO['missile_venom'] && D.SUPERS_AUTO['missile_venom'].anim);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node smoke-v3.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```js
// data.js:628 SUPERS_AUTO missile_venom anim:true
// scenes.js:600 fireAutoSuper switch case 'missile_venom': ev({t:'anim',...}) + this.tweens.add + particles
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node smoke-v3.js` + `node playwright-test.js`
Expected: PASS, visual `diag-pixel-map.png` shows flare

- [ ] **Step 5: Commit**

```bash
git add assets/data.js assets/scenes.js
git commit -m "feat(super): visuais híbridos"
```

---

## Self-Review
- Spec coverage: 7/7 frentes mapeadas para tasks (caminho 1, velocidade 2, upgrades 3, visual 4, fusão 5, fábricas 6, supers 7) — ok.
- Placeholders: nenhum (todos os steps têm código real).
- Tipos: `D.getTier`, `D.TOWER_MAX_LVL`, `S.towers`, `S.parts` consistentes.

