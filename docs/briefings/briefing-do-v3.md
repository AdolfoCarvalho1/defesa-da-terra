# BRIEFING — DEFESA ORBITAL V3 (Phaser 3) — FASE ÚNICA: JOGO COMPLETO

## CONTEXTO
Você está reconstruindo um tower defense espacial existente ("Defesa Orbital v2", arquivo `defesa-orbital-2.html`, vanilla JS + canvas puro, 3.7k linhas) como **v3 em Phaser 3**. O usuário rejeitou a v2 com nota 3/10: "HTML puro limita e tem cara de calculadora". Sua missão: mesma jogabilidade, MUITO mais impacto visual e de gameplay, usando o motor Phaser 3 de verdade.

## WORKDIR & ARQUIVOS
- Trabalhe em `C:/Users/adolf/Desktop/hermes/` (todas as paths abaixo são relativas a ele).
- **NÃO commite nada. NÃO crie repo git. Deixe tudo no working tree.**
- **NÃO fique dentro de /tmp nem crie arquivos _dbg. Tudo dentro do workdir.**
- Arquivos:
  - `phaser.min.js` — JÁ EXISTE no diretório (Phaser 3.87.0 baixado do CDN oficial). Use localmente via `<script src="phaser.min.js">`. NÃO baixe de novo, NÃO use CDN no HTML final (o jogo precisa rodar offline com duplo clique).
  - `defesa-orbital-2.html` — v2 atual, referência de design/lógica. LEIA para extrair: dados de torres/inimigos/mapas/ondas/tech tree, balanceamento, mecânicas (specs NV4/NV6, supers orbitais Q/W/E/R, modos de mira FIRST/STRONGEST/WEAKEST/CLOSEST/FASTEST, voadores com matriz anti-aérea, dificuldades RECRUTA/VETERANO/INSANE, modo infinito procedural makeEndlessWave, conquistas, diagnóstico de derrota). NÃO copie o código; reaproveite os DADOS e as REGRAS.
  - `defesa-orbital-3.html` — SEU ENTREGÁVEL. Um único arquivo HTML que carrega phaser.min.js local + seu jogo (pode ser tudo inline nesse arquivo, ou + assets/*.js se ficar grande demais; sem build step, abre com duplo clique).

## STACK OBRIGATÓRIA
- Phaser 3.87 (o arquivo local), Arcade Physics ou física própria simples (TD não precisa de física pesada — movimento por waypoint é permitido e recomendado).
- Web Audio API via sistema de som do Phaser (`this.sound`) OU AudioContext próprio — sons procedurais (tiros, explosões, UI, música ambiente sintetizada estilo sci-fi minimalista).
- Sem TypeScript, sem bundler, sem npm install. HTML + JS puro carregando o Phaser local.
- localStorage para save (chave `defesa_orbital_v3`).

## DESIGN SYSTEM (OBRIGATÓRIO — NÃO É NEGOCIÁVEL)
Tema: espaço profundo militar sci-fi. Paleta base: fundo #050914 / #0a1128, painéis #0d1526, texto principal #e8eefc, muted #8fa3c4, accent ciano #38bdf8, alerta vermelho #f43f5e, ouro #fbbf24, verde #34d399, laranja #fb923c. **PROIBIDO ROXO** (#a855f7, #c084fc etc. — nunca usar).
Tipografia: Google Fonts "Orbitron" (títulos/HUD números) + "Rajdhani" (corpo) — importe via `<link>` CDN (se offline, fallback sans-serif bold, tudo bem).
UI deve parecer HUD de nave de guerra: bordas chanfradas (clip-path), linhas de scan sutis, glow controlado nos elementos ativos, micro-animações em TODA interação (hover, compra, upgrade, dano, morte). NADA de retângulos cinza estáticos.

## GAMEPLAY — ESCOPO COMPLETO (PARIDADE COM V2 + MELHORIAS)
### Core loop
- Menu principal com seleção de mapa (5 setores), dificuldade (RECRUTA/VETERANO/INSANE), botão MODO INFINITO por mapa desbloqueado, laboratório de tech tree, codex/bestiário, tela de conquistas. Menu BONITO: cards com preview visual do mapa (mini-render das rotas), estrelas conquistadas, lock nos bloqueados.
- Grid TD 21x13 células (cell ~44px → 924x572; escale o canvas responsivamente mantendo aspect).
- 5 mapas com rotas múltiplas bifurcadas (copie MAPS_DATA da v2: rotas, temas, ondas).
- 12 ondas (mapa 1) até 24 (mapa 5); waves strings tipo "d12 r6 t2" (parser igual v2, inclui w=wasp e B1/B2/B3 bosses).
- Modo infinito: após última onda da campanha, ondas procedurais (makeEndlessWave da v2: budget 10+n*3, boss a cada 5, HP ×1.09^(n-campanha)). Recorde persistente por mapa.

### Torres (10, mesmas da v2: cannon/gatling/laser/missile/cryo/tesla/sniper/venom/amp/rail)
- Dados idênticos à v2 (custo/dmg/rng/rate/kind/specA/specB). Níveis 1-6. Specs escolhíveis no nível ≥4 (branch A ou B, exclusivas).
- Matriz anti-aérea da v2: beam/chain/snipe/slow/dot acertam voador sempre; cannon specB, missile specA, rail nv≥4 liberam ar; splash terrestre não atinge voador.
- Alvo selecionável por torre: 5 modos (ciclo por clique).
- Venda 70%, upgrade 75% do gasto.
- Visual: cada torre DEVE ter sprite vetorial desenhada em Graphics (base + canhão rotativo mirando o alvo, recoil animado, muzzle flash, nível visível — pips/marcadores). Upgrade muda o visual (mais canos, cores mais vivas, glow).

### Inimigos (14 tipos da v2 incluindo wasp voadora)
- hp/spd/gold/res/shape/label/dmg/armadura/shield/specials (heals, stealth, stun on death, splits→2 mini, slowImmune, flying, isBoss com barra de vida dedicada no topo).
- HP escala por mapa+onda+difficulty (fórmula v2). Bosses: entrada com banner de alerta + shake + música tensa.
- Visual: formas vetoriais distintas POR TIPO (não bolinhas genéricas), rotação na direção do movimento, flash branco ao dano, barras de hp/shield, voadores flutuando com sombra no chão, morte com explosão de partículas + destroços.

### Supers orbitais (Q/W/E/R): ion (mira ponto, raio pesado), emp (stun em área), vortex (puxa inimigos pro centro, dano over time), overdrive (+100% cadência global 8s). Cooldowns 24/30/35/40s (tech reduz 12%/lvl). Mira clicável com cursor customizado e preview do raio.

### Tech tree (6 upgrades permanentes da v2: start_gold/global_dmg/global_rng/super_cd/salvage/base_hp) pagos com cristais ganhos por partida (15+stars*10+mapIdx*10, ×bonus difficulty insane=3/veteran=2).

### Conquistas (12 da lista v2: first_blood/kills_100/kills_500/no_leak_10/max_tower/boss_slayer/rich/map1_clear/all_maps/endless_30/hard_win/insane_win) — toast ao desbloquear + modal com grid.

### Estrelas por mapa: 3★ lives≥90%, 2★ ≥50%, 1★ vitória. Desbloqueio sequencial de mapas.

### Diagnóstico de derrota na tela de game over (principal leaker + aviso anti-aéreo se foi voador).

## POLISH VISUAL E GAMEFEEL (ISSO É O QUE SUBIU A NOTA — CAPRICHE)
1. Partículas em TUDO: explosões (multi-camada: flash + fireball + debris + shockwave ring), trilhas de projéteis (trail), impactos, mortes, spawns (portal pulse), level up de torre.
2. Screen shake escalado por evento (leve no tiro pesado, médio na explosão, forte no boss death + hit stop de 60ms).
3. Câmera: zoom sutil pulsando com a batida da música ambiente? Se ficar bom. Zoom punch no boss spawn (obrigatório).
4. Projéteis com personalidade: míssil com trail de fumaça + chama, laser = feixe contínuo com core branco + glow colorido + impacto faísca contínua, tesla = lightning jagged entre alvos, railgun = linha instantânea que atravessa tudo com afterimage.
5. Inimigos entram pelo portal com warp-in effect; saem causando flash vermelho na borda + shake.
6. HUD vivo: créditos "pulam" quando ganham, vidas piscam vermelho ao perder, contador de onda com progresso circular, preview da próxima onda com ícones dos inimigos que vêm.
7. Tooltips ricos: hover na loja mostra stats completos + DPS calculado + descrição flavor curta.
8. Range circle ao posicionar/selecionar torre, célula highlight verde/válido vermelho/inválido.
9. Float texts de dano (crítico maior/amarelo), gold "+6" subindo e sumindo.
10. Transições de cena suaves (fade/slide) — NADA aparece cortado.
11. Pause real (P/Espaço no menu de pausa) com overlay blur.
12. Speed x1/x2/x4. Auto-start próxima onda toggle.
13. Boss: barra de vida top com nome, fases de rage (<50% HP: mais rápido + aura).
14. Game over/vitória: modal com stats (kills, créditos, estrelas animadas uma a uma com som), diagnóstico, botões retry/next/menu.

## ÁUDIO PROCEDURAL (sem assets externos)
- Tiros distintos por torre (canhão grave, gatling metralha, laser hum contínuo, tesla zap, sniper crack agudo + silêncio, missile whoosh+boom).
- Explosão com sub-bass + noise decay. UI clicks satisfatórios. Música: drone pad espacial + arpejo pentatônico menor sutil, intensifica com ondas boss. Volume master respeitável, botão mute.

## QUALIDADE & VERIFICAÇÃO (OBRIGATÓRIO ANTES DE RESPONDER)
1. `node --check` em cada JS extraído/embedido (extraia os blocos <script> pra validar sintaxe — pode fazer script node temporário NO WORKDIR e apagar depois).
2. Smoke test headless Node OBRIGATÓRIO (criar `smoke-v3.js` no workdir): stub window/document/canvas (ctx Proxy noop)/localStorage/AudioContext undefined, carregue defesa-orbital-3.html, extraia o script do jogo, rode com vm.runInContext, e teste MÍNIMO:
   - parseWaveString aceita todas as strings das 5 campanhas + makeEndlessWave n=13..60 (todo type existe em ENEMIES_DATA);
   - startNewGame(map,diff,endless) aplica difficulty e endless;
   - simular: startNextWave → matar todos (killEnemy) → onWaveCleared → repetir 16 iterações no modo infinito sem crash e sem victory prematura;
   - findBestTarget respeita matriz anti-aérea (cannon nv1 não mira runner voador; laser mira);
   - unlockAchievement grava 1x e ignora duplicata.
   Rode: `node smoke-v3.js` — TODOS os testes devem PASSAR antes de você terminar. Cole o output no relato final.
3. Div balanceado no HTML, sem console.error no boot (teste manual abrindo o arquivo — documente como verificou).
4. Performance: 60fps com 40 inimigos + 10 torres atirando (use object pools pra projéteis/partículas/texts; evite criar Graphics novos por frame — gere texturas uma vez em generateTexture ou use containers).

## RELATO FINAL (formato)
```
## RESUMO
<o que foi construído, arquitetura de cenas Phaser usada>
## VERIFICAÇÃO
node --check: OK | smoke-v3.js: X/X PASS (cole output) | boot sem console errors: <como validou>
## DECISÕES
<divergências do briefing e porquê, simplificações honestas>
## FILES
<lista de arquivos criados/modificados>
```
NÃO commitar. Relatar e parar.
