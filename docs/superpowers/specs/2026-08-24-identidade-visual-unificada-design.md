# Design: Identidade Visual Unificada — Defesa da Terra ULTRA

**Data:** 2026-08-24
**Status:** Aprovado (fast-track paralelo)
**Escolha:** A/A/A/A — Pixel Art Militar Consistente, Paleta 6 cores, Kit Chanfrado Total, Silhueta manda

## 1. Objetivo
Padronizar TODOS os elementos visuais (10 torres-naves ×5 tiers, ~100 inimigos, 5 mapas TD + 25 fases navinha, projéteis, fábrica, botões, menus, modais, topbar, shop) sob um único design system pixel militar navy/cyan/gold.

## 2. Tokens Centrais (assets/tokens.js)

**Palette 6-mãe:**
- Humanas: STEEL `#e2e8f0` (cannon base), GOLD `#fbbf24` (economia/destaque), CYAN `#38bdf8` (UI/laser/cryo)
- Hivemind: BIO_ORANGE `#f97316` (drone), ACID `#a3e635` (venom), SHIELD_BLUE `#60a5fa` (shielded)
- Neutra: NAVY `#050914` bg, NAVY2 `#0a1128` bg2, PANEL `#0d1526`, LINE `rgba(56,189,248,.18)`, MUTED `#8fa3c4`

**Pixel:** PX=3, K `#000000` contorno obrigatório, W `#ffffff` brilho, D sombra `tint(col,-0.55)`, M metal `#8b95a8`

**Typography:** Orbitron 700/800/900 títulos, Rajdhani 600/700 corpo, JetBrains Mono 600/700 números (index.html:10)

**Effects:** chamf `clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)` + border `1px solid var(--line)` + border-bottom `2px solid var(--tc)` + shadow `0 4px 12px rgba(0,0,0,.3)` + top line gradient cyan.

## 3. Componentes

### 3.1 Torres-Naves (pixelart.js:44 TOWER_ART)
- Mesma base aço `M` + 1 detalhe cor família (ex: tesla bobina `N:#34d399`, venom tanques `L:#a3e635`)
- Silhueta distinta mantida (cannon cano duplo, gatling multi-canos, rail trilhos longos, etc.)
- Tier T1-T5 via applyTierArt: T2 pods asa `L`, T3 trim dourado `Y`, T4 núcleo `W`, T5 aura dourada. Escala 1.0/1.08/1.18/1.30/1.45
- Chaves `tur_<id>_t<tier>` já existem, unificar palette via towerPalette(col) derivada de TOKENS

### 3.2 Inimigos (pixelart.js:195 ENEMY_ART)
- Mesmo drawRows + enemyPalette derivada de TOKENS
- 14 bases + 86 variantes reutilizam arte base via variantOf (pixelart.js:494)
- Diferenciação por shape/r (5-26) e cor dentro das 3 Hivemind mães, não aleatória HSL desenfreada (data.js:304)

### 3.3 Projéteis & Fábrica
- PROJ_ART (pixelart.js:406) com K/W/O/Y/R/G unificados
- Fábrica lvl1-5 (pixelart.js:378) com K/W/G/D/M/N (verde `N:#34d399`)

### 3.4 Mapas
- Grid COLS 21 × ROWS 13 × CELL 44 (data.js:3-7)
- Tiles pixelados por tema (neptune, saturn, jupiter, asteroid, earth) mas mesma textura navy base radial-gradient (index.html:116)
- Rotas wpToPixels (data.js:526) desenhadas com borda cyan 1px + overlay repeating-linear-gradient (index.html:121)

### 3.5 UI Kit
- :root vars migradas para TOKENS, index.html:12 vira import
- Shop-card (--tc por torre), map-card, pill, super-btn, tower-panel, modais, topbar/wave-ring todos com mesmo chamf + gradiente + blur + glow
- Botões: hover `border-color:var(--cyan)` + `box-shadow:var(--glow-cyan)` (index.html:53), active scale .98
- Estados sel/sel vs locked consistentes

## 4. Implementação Paralela (4 frentes)
- **P1 Torres:** tokens.js + towerPalette refactor + validar tur_cannon_t1..t5 existem
- **P2 Inimigos:** enemyPalette + variantes HSL contidas + projéteis + fábrica
- **P3 Mapas:** tiles.js + sync scenes.js makeTextures + MAPS_DATA theme mapping
- **P4 UI:** index.html CSS vars + shopbar/map-grid/modal/panel unificação

## 5. Testes
- node --check assets/*.js
- textures existem: tur_cannon_t1, tur_laser_t5, en_drone, px_factory_l1, px_pr_bullet
- Merge 3 cannons lvl10 + peças → T2 lvl11 (DO.mergeTowers)
- Fábrica onda → parts++
- Lab Hivemind → hp ×1.12
- Super auto force → autoSupersFired++
- Cannon T2 dispara 2+ projéteis

## 6. Não-goals
- Não mudar lógica de NAVE_STYLES ou SHMUP além de textura
- Sem novas dependências, sem mudar vite.config.mjs
