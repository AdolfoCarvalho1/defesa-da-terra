# Design — Correção Completa "Deixa Top" (Defesa da Terra ULTRA)

Data: 2026-09-10
Status: aprovado pelo usuário (brainstorming)

## Contexto

O jogo é um Tower Defense em Phaser 3 (`index.html` + `assets/*.js`), com 15 mapas,
10 torres + fábrica/estação/apoio, tiers com fusão, supers automáticos, sistema de frota
(fuel/batt/ammo, postura, perseguição, componentes), mutações, laboratório, codex,
conquistas e modo infinito. Há trabalho não commitado (balanceamento G1/BAL2, RANGESQ,
REFUEL, componentes) e a suíte atual passa: smoke 174/174, Playwright 99/99.

Auditoria de ponta a ponta (3 varreduras de código + testes reais no browser em
desktop 1366×768, matriz de resoluções, portrait 390×844 e landscape 844×390) revelou
bugs críticos, mecânicas prometidas que não funcionam, problemas de UX/mobile,
desperdício de performance e código morto. Este design corrige tudo em 6 ondas,
com teste de regressão por correção.

## Objetivos

1. Nenhuma mecânica anunciada na UI pode ser inócua (specs, TIER_LOGIC, mutações).
2. Nenhum bug que impeça vender/melhorar/fundir torres.
3. Mobile (portrait e landscape) 100% operável: sem elementos cortados, tooltip preso,
   alvos pequenos ou overlays vazando.
4. Performance previsível em ondas grandes (sem O(T²)/frame, sem alocações quentes).
5. Remover todo o conteúdo morto dos modos Nave/SHMUP/Metal.
6. Manter os testes existentes verdes e adicionar regressões para cada correção.

## Não-objetivos

- Não redesenhar a identidade visual (SUNSET/pixel art) — apenas nitidez e coerência de contorno.
- Não adicionar conteúdo novo (mapas, torres, inimigos).
- Não commitar nada (salvo pedido explícito do usuário).
- Não mexer no balanceamento validado da suíte atual (G1/BAL2/RANGESQ).

## Estratégia

Ondas por risco. Cada onda termina com `node --check` nos arquivos tocados,
`npm run smoke`, `npm run pw` e testes novos da onda. Nenhuma onda é dada como
concluída com gate vermelho.

---

## Onda 1 — Bug crítico + combate quebrado

### 1.1 Torre fantasma (CRÍTICO)

`sim.js:1188-1202` (`tryPursueStep`) e `sim.js:1249-1265` (`tryRefuelStep`) apagam
`S.occupied[célula antiga]` mas nunca gravam `S.occupied[célula nova]`. Consequência:
`isLiveTower` (`sim.js:1310`) falha, a torre fica impossível de vender/melhorar/fundir,
e outra torre pode ser construída sobre ela.

Correção: após mover, `S.occupied[nc + ',' + nr] = t`.

Aceite (smoke):
- torre em PERSEGUIR move com alvo, `S.occupied[t.c+','+t.r] === t`;
- `sellTower` retorna true e devolve créditos;
- célula antiga livre para construir.

### 1.2 Míssil spec A com dano dobrado

`spec.dmgMul` (0,45) é aplicado em `sim.js:226` (`getTowerStats`) e de novo em
`sim.js:698` (`mkMissile`). Correção: manter só em `getTowerStats` (os projéteis usam
`stats.dmg`). Aceite: `stats.dmg` do míssil spec A ×4 projéteis ≈ 4×0,45×base, sem 0,45².

### 1.3 MIRV T5 sem dano

Submunições em `sim.js:2344-2354` nascem com `targetId: null` e só detonam com alvo.
Correção: herdar o alvo do projétil original e/ou ao expirar detonar em área no ponto.
Aceite: míssil T5 danifica/killa inimigos (contador de dano > 0).

### 1.4 Specs/efeitos mortos de dano

- `cannon` spec A (`data.js:29`, `splash: 50`): aplicar concussão no impacto de `bullet`
  (`stats.splash` já é calculado em `sim.js:373`).
- `missile` spec B (`data.js:54`, `splashAdd: 40`): somar em `baseSplash` (65→105 px).
- `cryo` spec B (`data.js:62`, `auraSlow`): aura passiva real (aplica slow periodicamente
  sem gastar tiro/cadência), além do +5% de dano genérico hoje.
- Mutações `mut_cryo` e `mut_poison` (`data.js:747-748`, `757-758`): consumir
  `S.mutBuffs.cryo` (duração/área do gelo) e `S.mutBuffs.poison` (duração/alvos do veneno)
  nos caminhos de slow/dot.

Aceite (smoke por efeito): cannon spec A atinge 2 inimigos próximos; míssil spec B tem
`splash ≈ 105`; cryo spec B aplica slow sem atirar; mutações alteram duração/área.

### 1.5 `getWaveSpawnMultiplier` ausente

`sim.js:1601` e `1641` chamam `D.getWaveSpawnMultiplier` (não existe em `data.js`
nem na exportação). Resultado: o "+30% de inimigos" anunciado nunca acontece.
Correção: implementar em `data.js` (+30% de spawn por faixa de 10 ondas; ex.:
`1 + 0.3 * floor((wave - 1) / 10)`) e exportar. Aceite: onda 11 no infinito tem mais
spawns que a fórmula antiga; a UI/preview continua coerente.

### 1.6 Barra de chefe com múltiplos chefes

`S.activeBoss` (`sim.js:143`) é sobrescrito pelo último boss e zerado por qualquer
morte/vazamento (`sim.js:571`, `1896`), apagando barra/áudio com outro chefe vivo.
Correção: ao morrer/zerar, recalcular `activeBoss` como o chefe vivo de maior HP.
Aceite: dois bosses, matar um → barra continua no outro.

### 1.7 `slowImmune` furado

Colosso (`data.js:273`, `slowImmune`) é slowed por EMP (`sim.js:862`, `970`) e supers,
pois só o pulso normal da cryo checa a flag. Correção: respeitar `slowImmune` também
nesses caminhos (bosses podem ter resistência parcial, conforme design existente).
Aceite: colosso não é slowed por EMP/super; bosses seguem regra própria.

### 1.8 Save v3 frágil

`data.js:656-694`: `tech:null` estoura `techLvl` (`sim.js:52`); valores não numéricos
geram NaN em `livesMax` (`sim.js:63`); `mapStars` pode estourar `sim.js:1756`.
Correção: normalização defensiva no load (objeto/números válidos, defaults). Aceite:
save corrompido carrega sem throw/NaN.

---

## Onda 2 — TIER_LOGIC verdadeiro

Hoje `sim.js:374-383` converte todo efeito de tier sem consumo em +5% de dano genérico.
Implementar os efeitos reais usando a infra existente (armor, burn, slow, stun, marked,
`cryoVuln`, execução):

- `cannon`: T2 concussão (splash pequeno no bullet); T4 ricochete (+1 alvo próximo);
  T5 Dente de Ferro (stacks de dano por abate, cap +50%).
- `gatling`: T3 chance de atordoar; (T4 pierce e T5 combo já funcionam).
- `laser`: T2 +25% vs alvo em chamas; T3 +1 alvo varrido; T4 `shieldPhase` lido no dano
  (metade atravessa escudo); T5 corrói 1 armor/s.
- `missile`: T3 +1 fragmento na explosão; T4 alcance aéreo explícito; (T5 MIRV corrigido
  na Onda 1.3).
- `cryo`: T4 aura de frio sem tiro; T5 congelamento em chefes (50%).
- `tesla`: T2 lentidão iônica; T4 +60% vs escudos; T5 cadeia global.
- `sniper`: T2 marca (+15% dano de todos); T3 ignora armor; T5 execução <25%.
- `venom`: T2 corrosão empilhável; T3 praga como base; T4 veneno % da vida máx.;
  T5 nuvem tóxica na morte.
- `rail`: T4 perfuração total como base; T5 linha estelar (mapa inteiro).
- `amp` T2-T5: já implementados; manter.

Depois de todos terem hook real, remover o fallback genérico `+5%` (`sim.js:374-383`).

`TIER_STATS` (`data.js:786-793`) nunca é aplicado e a curva atual foi recalibrada sem
ele — remover do `data.js`, da exportação e do `tools/balance-sim.js`.

Aceite: teste smoke por efeito (pelo menos um cenário que prove o efeito e um que prove
que não vaza para outras torres).

---

## Onda 3 — UX/Mobile

1. **Tooltip preso no toque** (`index.html:374-378`, `game.js:932-941`): fechar no tap
   fora/`showMutation`; z-index abaixo de modais; nunca interceptar clique do modal de
   mutação. Aceite (Playwright): tap em card → tooltip abre; abrir mutação → some;
   tap fora → fecha.
2. **4º super cortado no portrait** (medido: bottom 454 > board 418): layout dos supers
   em 2 colunas ou tamanho reduzido; todos dentro do board. Aceite: bounding boxes dos 4
   supers dentro de `#board-shell`.
3. **Textos literais**: `game.js:1976/2024/2038` usam `'\\u00D7'`/`'\\u221E'` — trocar
   por `×`/`∞`. Aceite: `#btn-speed` começa com `×1`; infinito mostra `∞`.
4. **Painel da torre**: não fechar ao rolar/tocar dentro no mobile
   (`game.js:1267-1278`); no desktop não cobrir os supers quando aberto
   (`index.html:157-161`, z-index 33 vs 36). Aceite (Playwright): rolar painel compacto
   mantém aberto; bounding box dos supers fora do painel.
5. **Alvos ≥44px** no mobile (`.pill` ~40/42, `.menu-row button` 38/42, summaries ~26).
   Aceite: medição automática.
6. **ESPAÇO sem pause duplo** (`game.js:1192-1200`, falta `preventDefault`). Aceite:
   clicar botão, apertar Espaço → um toggle.
7. **Modais bloqueando no portrait**: `#pause-overlay`/`#modal-end` dentro do board não
   bloqueiam topbar/shopbar. Tornar `fixed` como os demais. Aceite: pausado, clique em
   "▶ ONDA" não inicia onda.
8. **Tutorial volta a avançar** ao construir a 1ª torre (hook `_tutNext` perdido no
   override de `scenes.js:440-476`). Aceite (Playwright).
9. **Toasts não cobrem a loja** no desktop; **topbar compacta** em 1024–1366 (116px hoje).
   Aceite visual (screenshot).
10. **Remover aviso "gire a tela" morto** (`index.html:483/747` + `#orientation-nudge`)
    mantendo o fullscreen/lock no start. Aceite: nenhum elemento morto no DOM.

---

## Onda 4 — Performance

1. `getTowerStats` O(T²)/frame (`sim.js:203-416`, chamado por torre por frame, varre amps
   e `getResupply` O(T)): cache por frame com invalidação em mudanças de estado
   (nível/spec/comp/tier/mutações/posição de amps) + teste "cache == cálculo fresco".
2. `scenes.js:82-85`/`112-115`: `String()`+`find` por view por frame → `Map` eid→view.
3. Rebuild de ~150 texturas a cada volta ao menu (`tiles.js:143-161`, `pixelart.js`,
   `scenes.js:15-20`): gerar só se não existir. `bgstars` (`game.js:207-211`): guard
   `textures.exists`.
4. Preview de onda por frame (`game.js:2066-2069`): cachear por número de onda.
5. Pools de partículas: contador em vez de varredura por frame (`game.js:338-350`,
   `1526-1531`).
6. Pixel art nítido: `pixelArt`/`antialias` no `gameConfig` (`scenes.js:905-914`) +
   `image-rendering: pixelated` no canvas. Aceite: screenshot comparativo.

Aceite: nenhum teste de comportamento muda; FPS de referência medido antes/depois
(documentado; headless é indicativo).

---

## Onda 5 — Áudio/Arte/FX

1. Mute: drones da música não voltam ao desmutar (`audio.js:66/71`) — guardar ganhos base.
2. Laser continua soando na pausa/fim (`game.js:1317-1324`) — `SND.laserStopAll()`.
3. `odFlame` nunca destruído (`scenes.js:124-127`); `supply-ring` não limpo no
   `cleanup` (`game.js:135-149`) — destruir/limpar.
4. Texturas órfãs geradas e nunca usadas (`trail`, `star2`, `px_pr_*`, `tile_*_mini`):
   remover geração.
5. Terra/lua vetoriais com estética diferente do pixel art (`scenes.js:342-368`,
   `textures.js:321-337`): aplicar contorno preto 1px e escala coerente (sem redesenhar).
6. Pausa: FX ambientais continuam e de combate congelam (`game.js:1378-1380`) — unificar
   comportamento (combate E ambientais pausam).

Aceite: mutar/desmutar mantém trilha; pausar com laser ativo silencia; sem erros de
textura; screenshots.

---

## Onda 6 — Remoção dos modos Nave + limpeza

1. Apagar `assets/nave.js` e o `<script>` em `index.html:1179`.
2. `scenes.js`: remover `MetalSlugScene` (`:513-697`), overrides de campanha
   (`:700-790`), classes Nave da lista de cenas (`:913`) e export
   `window.DO.recordNaveProgress` (`:957`).
3. `data.js`: remover `SHMUP_STAGES`/`NAVE_STYLES`/`NAVE_CAMPAIGNS`/`METAL_STAGES`
   (`:467-536`), campos de save `naveProgress`/`naveStars` (`:651-652`) e da exportação
   (`:958`).
4. `sim.js`: remover `recordNaveProgress`/`resolveNaveStage` (`:2394-2416`).
5. `ui.js`: remover `showNaveCampaign` e o bloco `#shmup-grid`.
6. `index.html`: CSS morto (`#shmup-grid`, `#metal-grid`, `#extra-phases`, `#btn-shmup`)
   e seletor `[data-phase]` no listener de fullscreen (`:1260`).
7. Testes: remover os 4 checks de `recordNaveProgress` do smoke; manter os checks
   Playwright "não existe" como guardas.
8. Limpezas menores: `GameScene.toggleMute` morto, `projLayer`/`spawners` sem uso,
   textura `tbase` invisível (confirmar antes), objeto `selectedShip` sem consumidor.

Aceite: `index.html` boota sem nave.js; smoke e Playwright verdes com as contagens
atualizadas; nenhum `ReferenceError` de classes Nave.

---

## Verificação global

- Por onda: `node --check` nos arquivos tocados + `npm run smoke` + `npm run pw`.
- Regressões novas: gravadas em `smoke-v3.js` (lógica) e `playwright-test.js` (browser),
  listadas nas ondas 1–3.
- Final: capturas desktop/portrait/landscape, FPS antes/depois, suíte completa verde.
- Sem commits sem pedido explícito.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Efeitos de tier alteram balance | Valores pequenos, um teste por efeito, rodar suíte completa |
| Cache de stats estagna valores | Dirty flag + teste cache == fresco |
| `pixelArt` muda render | Comparação por screenshots antes/depois |
| Remoção dos modos Nave quebra saves | Campos ignorados no load; defaults preservados |
| TIER_STATS removido afeta ferramenta | Atualizar `tools/balance-sim.js` junto |
