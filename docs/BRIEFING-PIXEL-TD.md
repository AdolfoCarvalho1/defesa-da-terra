# BRIEFING ATÔMICO — Defesa Orbital v3 "PIRAR TUDO" (pixel art + tiers + fábricas + supers)

## Contexto
- Workdir: `C:/Users/adolf/Desktop/hermes` (Windows, bash git-msys; usar paths `C:/...` para ferramentas nativas).
- Jogo: TD "Defesa da Terra — ULTRA". Entrada: `index.html` → `phaser.min.js` → `assets/data.js` → `assets/audio.js` → `assets/scenes.js`. Phaser 3 local, canvas 924×572 (COLS 21 × ROWS 13 × CELL_SIZE 44).
- `assets/data.js` (namespace `DO3`): `TOWERS_DATA` (10 torres: cannon, gatling, laser, missile, cryo, tesla, sniper, venom, amp, rail), `ENEMIES_DATA` (14 tipos: drone, runner, tank, swarm, healer, phase, bomber, shielded, splitter, colossus, mini, wasp, boss1-3), `TOWER_MAX_LVL=50`, skills por nível (a cada 4 níveis até 48), save em `SAVE_KEY='defesa_orbital_v3'`.
- `assets/scenes.js` (~5300 linhas): `makeTextures(scene)` gera texturas (`tur_<id>_<level>`, `en_<tipo>`, `dot`, etc.); `placeTower(S,c,r,id)` ocupa `S.occupied['c,r']`; `upgradeTower`, `sellTower`, `setSpec`, `fireTower(S,t,target,stats)` com kinds: bullet/beam/splash/slow/chain/snipe/dot/pierce/buff; `syncTowers()` cria views `towerViews[t.tid]` = {base, tur, pips}; DOM: `#topbar` (hud-credits, hud-lives), `#shopbar` (cards `.shop-card`), `#tower-panel` (`tp-upgrade`, `tp-icon`...), supers em `#supers`; eventos via `ev(S,{t:...})`; sons via `SND.*`; API de teste `window.DO` no fim do arquivo.
- Testes: `playwright-test.js` e `smoke-v3.js` (Playwright local em node_modules). **PROBLEMA**: ambos apontam para `defesa-orbital-3.html` que NÃO EXISTE MAIS — o jogo agora é `index.html`. Corrigir os paths.
- Existe cópia espelhada `public/assets/scenes.js` (deploy Vite/Vercel). No fim, sincronizar `index.html` + `assets/*.js` → `public/` (mesmos arquivos).

## Regras duras
1. NÃO commitar, NÃO pushar. Só editar arquivos.
2. NÃO refatorar código existente. Adicionar sistemas novos e tocar o mínimo nos pontos listados.
3. Texto de UI em PT-BR. Estilo visual: pixel art chunky, fundo navy escuro, cascos off-white, acentos gold/cyan/red, contorno preto, 1px de brilho. SEM roxo dominante.
4. FX novos têm que decair a zero MESMO com o jogo pausado (o dono cobra zero artefatos visuais). Usar tweens com decay no update ou tweens reais, nunca FX estático preso no canvas.
5. Performance: sem alocação por frame em loops quentes; reusar pools existentes.
6. Se um gate falhar, consertar e rodar de novo. Não reportar sucesso com gate vermelho.

---

# FASE 1 — PIXEL ART POR CÓDIGO (novo arquivo `assets/pixelart.js`)
Criar `assets/pixelart.js` (carregado no `index.html` ANTES de `scenes.js`), exposto em `window.PXART`. Técnica:
- Sprites definidos como ASCII map (strings) + paleta por caractere. Helper `PXART.build(scene, key, rows, palette, pxScale)` desenha com `fillRect` escalado (1 pixel lógico = 3px reais) num `scene.make.graphics` e `generateTexture`. NÃO ligar `pixelArt:true` no config global (não afetar as outras cenas).
- Autorar sprites base (13-17 px lógicos) para:
  a) **10 torres** — silhuetas distintas e legíveis: cannon (corveta com cano duplo frontal), gatling (canhão rotativo multi-canos), laser (espelhos/prisma com lente), missile (rack de ogivas ombro a ombro), cryo (fuselagem angular com cristais), tesla (bobina/baio com arcos), sniper (fuselagem longa agulha), venom (nave gorda com tanques verdes), amp (disco com anel emissor), rail (trilhos longos paralelos). Cada uma na cor da `TOWERS_DATA`.
  b) **Tiers T1-T5 por torre** — mesma silhueta com acréscimos por tier (pods de asa extras, trim dourado, canos maiores, brilho no núcleo) + scale visual 1.0/1.08/1.18/1.30/1.45. Textura por chave NOVA `tur_<id>_t<tier>` (tier 1..5). Diferença entre tiers TEM que ser óbvia a olho nu.
  c) **14 inimigos** — estilo da referência pixel art (alienzinhos chunky com olhos, naves com cockpit de vidro, boss grande com detalhes): usar shape/label/cor do `ENEMIES_DATA` como guia de personalidade (drone=tri caça, tank=cruzador blindado, healer=matriarca com tentáculos, boss=leviatã). Chaves `en_<tipo>` (substituir as geradas hoje).
  d) **Fábrica** — prédio industrial pixelado com chaminé e luz verde (chave `px_factory`), versões lvl 1-5 (chaminés extras).
  e) **Projéteis pixel por kind**: bullet (tracante), missile (ogiva com chama), beam (glow segmentado), slow (floco), chain (raio zigzag), snipe (tracer fino), dot (bolha verde), pierce (sabot). Chaves `px_pr_<kind>`.
- Em `makeTextures` (scenes.js): após as texturas existentes, chamar `PXART.buildAll(scene)`; REMOVER/substituir a geração antiga de `tur_*` e `en_*` para não duplicar (as chaves novas prevalecem). Atualizar `syncTowers()` para usar `tur_<id>_t<tier>` (tier derivado de `t.level`: `Math.min(5, Math.floor((t.level-1)/10)+1)`).
- Muzzle flash pixelado + recoil já existem via `t.recoil/t.flash` — manter e intensificar por tier.

# FASE 2 — TIERS + MERGE (3 naves iguais → sobe 1 tier)
- Tiers: T1 = nv 1-10, T2 = 11-20, T3 = 21-30, T4 = 31-40, T5 = 41-50. Nv 50 = MESTRE (badge dourado).
- **Regra**: upgrade normal trava no teto do tier (10/20/30/40). No teto, o botão de upgrade vira **FUNDIR**: consome a torre selecionada + 2 outras torres DO MESMO id e DO MESMO tier (em qualquer célula) → sobra 1 torre no tier seguinte, nível `(tier*10)+1`, na célula da torre selecionada. As 2 consumidas somem SEM reembolso.
- Custo em PEÇAS (recurso novo, Fase 5): T1→T2 = 20⚙, T2→T3 = 40⚙, T3→T4 = 80⚙, T4→T5 = 160⚙.
- Stats por tier (multiplicativo sobre stats base + skills existentes): T2 dmg ×2.2 / rate ×1.15, T3 ×4.8 / ×1.3, T4 ×10 / ×1.5, T5 ×22 / ×1.7; alcance +10% por tier. Tabela nova `D.TIER_STATS` em data.js; integrar em `getTowerStats`.
- UI: badge de tier (T1..T5) no `#tower-panel` e mini-estrelas no card da loja? Não — só painel + pips existentes. Botão FUNDIR mostra `2/3` (candidatos disponíveis) e desabilita com `< 2` candidatos ou peças insuficientes. Tooltip lista as células das torres candidatas.
- Save: tier é derivado do level — saves antigos (nv>10) continuam funcionando. Novos campos com default em `D.Save` (peças=0, enemyHpLevel=0).

# FASE 3 — VARIAÇÕES DE TIRO POR TIER
Em data.js, cada torre ganha `shotPattern(tier)` (ou tabela `SHOT_PATTERNS[id][tier]`) consumida por `fireTower`:
- cannon: 1 projétil → 2 → 3 (leque) → 4 → 5 (leque largo).
- gatling: rajada 2 → 3 → 4 → 5 → 6 tracantes.
- laser: feixe simples → feixe largo (width) → +1 prisma → +2 prismas → feixe varredor (3 alvos).
- missile: 1 ogiva → 2 → salva 3 → salva 4 → MIRV 5 (cada uma subdivide).
- cryo: pulso único → anel duplo → triplo → anel+congelamento visual → nevasca (anel grande).
- tesla: cadeia 4 → 6 → 8 → 10 → 12 com raios pixelados mais grossos.
- sniper: tiro → tiro+tracer → carga (flash antes) → 2 alvos → execução em massa (3 alvos).
- venom: bolha → bolha grande → 2 bolhas → nuvem (área) → maré tóxica.
- amp: anel visual do buff cresce por tier (sem mudar tiro).
- rail: 1 lança → 2 lanças paralelas → 3 → lança perfura total → lança estelar (linha no mapa todo).
- Muzzle flash e som escalam com tier (`SND.shoot(kind, tier)` ok se assinatura permitir; senão manter).

# FASE 4 — SUPER AUTOMÁTICO (1 por tipo de nave, dispara SOZINHO)
- Cada tipo de torre tem 1 super com carga alimentada pelas KILLS daquele tipo (pontos de carga = `res` do inimigo morto). Limiar por tier: `30 - tier*3` (T5 = 15).
- Cheia → dispara AUTOMÁTICO (sem botão), com banner `ev(S,{t:'banner'})` + som + FX dramático, e zera. Lista:
  - cannon **Barragem Orbital**: 20 obuses na maior concentração de inimigos.
  - gatling **Tornado de Chumbo**: 360° por 3s acertando tudo em alcance dobrado.
  - laser **Prisma Solar**: feixe varre a rota inteira por 2.5s.
  - missile **Enxame MIRV**: 16 mísseis nos alvos mais caros.
  - cryo **Era Glacial**: congela TODOS os inimigos 3s.
  - tesla **Tempestade Final**: 12 relâmpagos em cadeia global.
  - sniper **Sentença**: executa os 3 inimigos de menor HP na tela.
  - venom **Maré Nanopraga**: envenena todos os inimigos em tela 8s.
  - amp **Sobrecarga Total**: todas as torres +100% dano por 6s (visual: anel dourado).
  - rail **Lança Estelar**: 3 linhas perfurantes cruzam o mapa.
- Implementar como eventos no stepSim com fila de supers (não travar o loop). Carga visível: anel de progresso fino ao redor da torre + % no painel.
- Exports p/ teste: `window.DO.getSuperCharge(S,t)`, `window.DO.forceSuperCharge(S,t)`.

# FASE 5 — FÁBRICAS + PEÇAS + LABORATÓRIO HIVEMIND
- **Peças (⚙)**: recurso novo ao lado dos créditos no `#topbar` (`<span id="hud-parts">`). Ganha-se: bônus de fim de onda (+2⚙ por onda) e das fábricas. Gasta-se: merges (Fase 2) e laboratório.
- **Fábrica**: nova entrada `FACTORY_DATA = { id:'factory', name:'Fábrica Orbital', cost:120, ... }` em data.js; card PRÓPRIO na `#shopbar` (visual distinto, borda verde). Ocupa MESMO slot de torre (`S.occupied`) — implementar como torre com `defRef.kind='factory'` dentro de `S.towers` e PULAR tudo que for combate (alvo, tiro, buff). Produz POR ONDA COMPLETA: +10⚙ e +18cr (×nível da fábrica). Upgradável até lvl 5 (custo 90cr×1.8^lvl + 15⚙×lvl; +8⚙/+14cr por nível). Venda 70%. Painel da fábrica mostra produção e próximo nível.
- **Laboratório Hivemind** (dificuldade opcional): botão no topbar `🧬 HP ×1.00 (+15⚙)` — paga peças para aumentar PERMANENTEMENTE (na run) o HP dos inimigos: +12% HP e +8% ouro por nível, custo 15⚙ ×1.5^lvl. Multiplicador aplica em `spawnEnemy` (junto com hpMul existente de onda/dificuldade). Estado em `S.enemyHpLevel` (por run, não persiste).
- Fábrica paga no `onWaveCleared` com float text `+10⚙ +18cr`.

# FASE 6 — LÓGICA TÁTICA POR NAVE (desbloqueio por tier)
Em data.js, tabela `TIER_LOGIC[id] = {2: {...}, 3: {...}, 4: {...}, 5: {...}}` — 1 lógica nova por tier, acumulativa, coerente com specs A/B existentes. Autorar as 40 entradas (10 torres × T2-T5). Exemplos de direção:
- cannon: T2 concussão (splash reduz 20% vel 1.5s), T3 perfura 4 de armadura, T4 ricochete em 1 alvo próximo, T5 "Dente de Ferro" (+1% dmg por kill desta nave, cap +50%).
- cryo: T2 chance de congelar 15%, T3 inimigos congelados +25% dano recebido, T4 aura de frio passiva, T5 congelamento afeta até bosses (50%).
- venom: T2 corrói 1 de armadura/stack, T3 toxina espalha ao morrer (já existe spec — virar base), T4 dano tóxico % da vida, T5 morte envenenada explode nuvem.
- (autorar as 7 restantes no mesmo nível de qualidade; documentar cada uma no tooltip da loja e do painel)
- Tooltips (`buildShopDom` tipHtml + painel): seção nova "LÓGICA DE TIER" listando o que está ativo e o que vem nos próximos tiers.

# FASE 7 — TESTES E GATES
1. Corrigir `playwright-test.js` e `smoke-v3.js`: path do jogo → `index.html`.
2. Manter TODOS os checks existentes passando.
3. Novos checks (usar `window.DO` headless como o arquivo já faz):
   - texturas pixel existem: `tur_cannon_t1`, `tur_laser_t5` (via `__game.textures.exists`), `en_drone`, `px_factory`.
   - MERGE: placeTower 3 cannons, forçar level 10 nos 3 (API), dar peças, chamar `DO.mergeTowers` → 1 torre nv 11, outras 2 removidas.
   - FÁBRICA: placeTower factory, completar onda via `DO.onWaveCleared` → `S.parts` aumentou.
   - LABORATÓRIO: `DO.upgradeEnemyHP` → próximo `spawnEnemy` tem hp ×1.12.
   - SUPER: `DO.forceSuperCharge` → evento de super disparou (flag/contador exposto).
   - TIRO: cannon tier1 dispara 1 projétil; tier2 dispara 2+ (contar `S.projectiles` criados num fire).
4. Exports novos em `window.DO`: `mergeTowers`, `upgradeEnemyHP`, `getSuperCharge`, `forceSuperCharge`, `getTier(t)`.
5. Gates finais (todos verdes):
   - `node --check assets/pixelart.js && node --check assets/data.js && node --check assets/scenes.js`
   - `node playwright-test.js` (todos PASS)
   - `npm run smoke` (se o smoke-v3 for stub de canvas, ajustá-lo pro index.html e rodar)
6. Sincronizar cópias: `cp index.html public/ && cp assets/*.js public/assets/` (manter espelho do deploy igual).

## Ordem de execução e prioridade
Fases 1→2→3→4→5→6→7. Se precisar cortar escopo por qualquer motivo, cortar NA ORDEM REVERSA (Fase 6 é a primeira cortável; Fases 1-2-5-7 são intocáveis). Rodar os gates da Fase 7 ao final de cada bloco grande (1-2, 3-4, 5-6).

## Não-goals
- Não mexer nas cenas NaveScene/Shmup/Arena/MetalSlug além do necessário para chaves de textura compartilhadas (prefixo `px_` evita colisão).
- Sem dependências novas, sem build step novo, sem mudar `vite.config.mjs`.
