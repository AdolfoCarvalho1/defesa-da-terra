# INVASÃO 90 - 5 Estilos de Navinha + Skill por Nave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar as 5 fases extras em 5 estilos puros de nave dos anos 90/2000 (Asteroids, Horizontal, Vertical, Arena, Túnel) com skill temática por nave a cada 4 níveis até 50, HUD retrô não-BR, nave com movimento preditivo e 5+5 fases visíveis no menu.

**Architecture:** Manter Phaser 3.87 com `Arcade` gravidade só onde precisa; `data.js` vira fonte única com `NAVE_STYLES[5]` e `skills[12]` por nave; `scenes.js` com 1 `NaveScene` polimórfica (switch por style) + 5 subclasses leves; `MenuDOM` com grid 5+5; `getTowerStats` aplica skills; `stepSim` com predição `future = getPosAtDist(dist+speed*1.4)`.

**Tech Stack:** Phaser 3.87, Vite 8, Vanilla JS (sem React), Web Audio API

## Global Constraints
- Phaser 3.87 via `phaser.min.js` - não atualizar
- Vite build deve continuar `dist/index.html 38k` sem `type="module"` nos scripts legados
- `TOWER_MAX_LVL = 50` - não mudar
- `ENEMIES_DATA` 100 variações - manter
- `smoke-v3.js` 28/28 e `playwright-test.js` 30/30 devem passar
- HUD deve voltar ao ULTRA limpo (sem TV Colosso) - usar `Orbitron` não `Press Start 2P` monstro

---

## File Structure
- `assets/data.js` - adiciona `NAVE_STYLES`, `SKILLS`, por nave `skills[]`
- `assets/scenes.js` - refatora `ShmupScene`→`NaveScene` 5 modos, remove `MetalSlugScene` dup, adiciona `AsteroidsScene`, `HorizontalScene`, `ArenaScene`, `TunnelScene` ou modo switch, patch `getTowerStats`, `MenuDOM`, `GameScene`
- `defesa-orbital-3.html` / `index.html` - reverte título BR, HUD retro limpo, grid 5+5 visível
- `public/assets/*` - espelho
- `vite.config.mjs` - sem mudança

---

### Task 1: Fix Título e HUD (reverte BR bizarro)

**Files:**
- Modify: `defesa-orbital-3.html:1-15` (title, H1, CSS)
- Modify: `index.html` (copia)
- Test: `playwright-test.js` manual

**Interfaces:**
- Consumes: nada
- Produces: título `DEFESA DA TERRA` limpo, HUD `ULTRA` não 90s bobo

- [ ] **Step 1: Reverter título**
```html
<title>Defesa da Terra — ULTRA</title>
<h1>DEFESA DA TERRA</h1>
<p>ULTRA • FROTA HUMANA vs HIVEMIND • 50 NÍVEIS • 100 ALIENS</p>
```
- [ ] **Step 2: Reverter H1 CSS** remover `Press Start 2P` `INVASÃO 90` skew, voltar `Orbitron` `titleGlow`
- [ ] **Step 3: Reverter HUD** remover `.hud-stat Press Start 2P` e `ridge #ff0`, voltar `Orbitron 18px` `glow-cyan`
- [ ] **Step 4: Verificar** `node --check` e screenshot `playwright-test.js` H1

### Task 2: Expor 10 Fases no Grid Principal

**Files:**
- Modify: `defesa-orbital-3.html:415` (adicionar #nave-styles-grid)
- Modify: `assets/scenes.js:1400` (MenuDOM.build popula)
- Test: `playwright-test.js` espera 5+5

**Interfaces:**
- Consumes: `D.NAVE_STYLES[5]`
- Produces: `DOM #nave-styles-grid` com 5 cards clicáveis

- [ ] **Step 1: HTML** já tem `#shmup-grid` e `#metal-grid`, renomear para `#nave-grid` com 5 cards ou manter 2 grids mas garantir visível
- [ ] **Step 2: JS** `MenuDOM.build` já popula 5+5, garantir que `D.NAVE_STYLES` existe (se ainda for SHMUP/METAL, migrar)
- [ ] **Step 3: Teste** `await page.locator('#shmup-grid .map-card').count() ===5`

### Task 3: Criar NAVE_STYLES[5] e SKILLS por Nave em data.js

**Files:**
- Modify: `assets/data.js:107` (MAPS_DATA)
- Modify: `assets/data.js:152` (TECH_UPGRADES)
- Modify: `assets/data.js:374` (return)
- Test: `final_check.js`

**Interfaces:**
- Consumes: `TOWERS_DATA[10]`
- Produces: `D.NAVE_STYLES`, `D.SKILLS`, `TOWERS_DATA[i].skills[12]`

- [ ] **Step 1: Adicionar NAVE_STYLES**
```js
const NAVE_STYLES = [
  {id:'asteroids', name:'Asteroids', bg:'#020617', accent:'#38bdf8', enemyPool:['swarm','drone'], duration:22, target:22, speed:1.0},
  {id:'horizontal', name:'Corredor Horizontal', bg:'#0a0f1a', accent:'#fbbf24', enemyPool:['tank','runner'], duration:24, target:25, speed:1.15},
  {id:'vertical', name:'Vertical Bullet Hell', bg:'#87CEEB', accent:'#f43f5e', enemyPool:['drone','bomber'], duration:26, target:28, speed:1.25},
  {id:'arena', name:'Arena 360°', bg:'#0f172a', accent:'#34d399', enemyPool:['swarm','splitter'], duration:28, target:30, speed:1.35},
  {id:'tunnel', name:'Túnel 3D', bg:'#050914', accent:'#a78bfa', enemyPool:['phase','wasp'], duration:30, target:32, speed:1.45},
];
```
- [ ] **Step 2: Adicionar skills por nave** (exemplo tesla 12 níveis)
```js
TOWERS_DATA.forEach(def=>{
  def.skills = [
    {lvl:4, name:'Arco +1', apply:(S,t,stats)=> stats.chain++},
    // ... 12
  ]
});
```
- [ ] **Step 3: Exportar** em `return { NAVE_STYLES, ...}`

### Task 4: Skill a cada 4 Níveis em getTowerStats

**Files:**
- Modify: `assets/scenes.js:123`
- Test: `test50.js` up to 50 still passes

**Interfaces:**
- Consumes: `D.TOWERS_DATA[i].skills`
- Produces: `getTowerStats` aplica

- [ ] **Step 1: Loop skills**
```js
if(def.skills) for(const sk of def.skills) if(t.level >= sk.lvl){
  if(sk.dmgMul) dmg*=sk.dmgMul;
  if(sk.chain) stats.chain+=sk.chain;
}
```
- [ ] **Step 2: Teste** `node test50.js` still 50

### Task 5: Algoritmo Preditivo Aprimorado

**Files:**
- Modify: `assets/scenes.js:837`
- Test: `final_check.js` moved true

**Interfaces:**
- Consumes: `findBestTarget`, `D.getPosAtDist`
- Produces: auto-move preditivo

- [ ] **Step 1: Já feito** `future = getPosAtDist(pts, dist+speed*1.4)` com scoring, só ajustar `range` por estilo (Arena precisa maior)
- [ ] **Step 2: Teste** `node final_check.js` moved true

### Task 6: 5 Estilos de Nave - Refatorar ShmupScene em NaveScene Polimórfica

**Files:**
- Modify: `assets/scenes.js:3164` (ShmupScene)
- Create: `assets/scenes.js` 4 novas classes ou switch
- Test: `playwright` cada estilo

**Interfaces:**
- Consumes: `D.NAVE_STYLES`
- Produces: `NaveScene` com 5 modos

- [ ] **Step 1: Criar base `class NaveScene extends Phaser.Scene` com `create(data:{styleIdx})` e `update` switch por `this.styleId`
- [ ] **Step 2: Implementar 5 modos:**
  - `asteroids`: `wrap()` drift, `split` em `mini`
  - `horizontal`: `tilePositionX` scroll, `charge` hold, Pod `amp`
  - `vertical`: já existe (boss + bullet hell)
  - `arena`: `BOARD_W/H` fechada, `mouse` mira 360°, `moveToObject`
  - `tunnel`: anéis `strokeEllipse` + `scale`
- [ ] **Step 3: Registrar em `gameConfig.scene`**
- [ ] **Step 4: Teste** cada `stageIdx` 0-4 inicia sem erro

### Task 7: Fluxo Obrigatório 5 Interlúdios

**Files:**
- Modify: `assets/scenes.js:3450` (showEndModal)
- Test: `test_final.js` vitória

**Interfaces:**
- Consumes: `D.NAVE_STYLES`
- Produces: `Game i → Nave i → Game i+1`

- [ ] **Step 1: `GameScene.showEndModal` passa `stageIdx = mapIdx` para `NaveScene`**
- [ ] **Step 2: `NaveScene.finish` vai para `Game` `nextMap` ou `Menu` se final**
- [ ] **Step 3: `Menu` interlude selector mostra 5 `NAVE` (não 10)**
- [ ] **Step 4: Teste** `node test_final.js` vitória 12/12

### Task 8: Build e Testes Finais

**Files:**
- Modify: `public/assets/*`, `dist/`
- Test: `smoke-v3.js` `playwright-test.js`

**Interfaces:**
- Consumes: todos
- Produces: `dist` pronto

- [ ] **Step 1: `Copy-Item assets/* public/assets/`**
- [ ] **Step 2: `npm run build`**
- [ ] **Step 3: `node smoke-v3.js` 28/28**
- [ ] **Step 4: `node playwright-test.js` 30/30** (5+5)
