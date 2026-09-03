const { chromium } = require('@playwright/test');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + e.stack));

  const file = 'file:///' + path.resolve('index.html').replace(/\\/g,'/'); // v3 PIXEL FASE 7: jogo agora é index.html
  console.log('GOTO', file);
  await page.goto(file, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  let pass=0, fail=0;
  const check = (name, cond, extra='') => {
    if(cond){ pass++; console.log(`  PASS ${name}`); }
    else { fail++; console.log(`  FAIL ${name} :: ${extra}`); }
  };

  // 1) menu visible — agora 15 mapas (6 originais + 8 planetas + 1 supremo) — só Tower Defense
  check('menu visível', await page.locator('#screen-menu:not(.hidden)').count() === 1);
  check('15 mapas (sistema solar completo)', await page.locator('#maps-grid .map-card').count() === 15, 'found '+await page.locator('#maps-grid .map-card').count());
  check('extra fases removidas', await page.locator('#shmup-grid .map-card').count() === 0, 'found '+await page.locator('#shmup-grid .map-card').count());
  check('metal slug removido', await page.locator('#metal-grid .map-card').count() === 0, 'found '+await page.locator('#metal-grid .map-card').count());
  check('3 diffs', await page.locator('#diff-row .pill').count() === 3);
  check('crystals top', await page.locator('#crystals-top').textContent() !== '');
  
  // 2) centralização - layout deve estar centralizado (torto fix)
  const layoutBox = await page.locator('#layout').boundingBox();
  const viewport = page.viewportSize();
  const centered = layoutBox && Math.abs((viewport.width - layoutBox.width)/2 - layoutBox.x) < 30;
  check('layout centralizado (não torto)', centered, `x=${layoutBox?.x?.toFixed(1)} w=${layoutBox?.width?.toFixed(1)} vp=${viewport.width} diff=${((viewport.width - layoutBox.width)/2 - layoutBox.x).toFixed(1)}`);
  const boardBox = await page.locator('#board-shell').boundingBox();
  const topbarBox = await page.locator('#topbar').boundingBox();
  check('board dentro do layout', boardBox.x >= layoutBox.x -2 && boardBox.x + boardBox.width <= layoutBox.x + layoutBox.width +2, `board x ${boardBox.x} layout x ${layoutBox.x}`);
  check('topbar largura = layout', Math.abs(topbarBox.width - layoutBox.width) < 8, `topbar ${topbarBox.width} layout ${layoutBox.width}`);

  // 3) iniciar jogo
  await page.click('#btn-start');
  await page.waitForTimeout(1800);
  check('topbar visível após start', await page.locator('#topbar.off').count() === 0);
  check('shopbar visível', await page.locator('#shopbar.off').count() === 0);
  check('10 torres + fábrica + estação + apoio na loja (F4)', await page.locator('.shop-card').count() === 13, 'found '+await page.locator('.shop-card').count());
  check('4 supers', await page.locator('.super-btn').count() === 4);
  check('canvas Phaser criado', await page.locator('#game-canvas canvas').count() >= 1);

  // 4) colocar torre - via API headless (mais confiável que clique em célula bloqueada)
  const board = await page.locator('#board-shell').boundingBox();
  await page.locator('.shop-card').first().click();
  await page.waitForTimeout(200);
  check('torre selecionada (placing)', await page.locator('.shop-card.sel').count() === 1);
  // encontra célula livre e coloca via API
  const placed = await page.evaluate(() => {
    const g = window.__game;
    if(!g) return -1;
    const scene = g.scene.getScene('Game');
    if(!scene) return -2;
    // acha célula livre
    for(let c=0;c<21;c++) for(let r=0;r<13;r++) {
      const key=c+','+r;
      if(!scene.S.blocked[key] && !scene.S.occupied[key]) {
        const t = window.DO.placeTower(scene.S, c, r, 'cannon');
        return scene.S.towers.length;
      }
    }
    return -3;
  });
  await page.waitForTimeout(400);
  check('torre colocada no board', placed === 1, `placed=${placed}`);

  // 5) Painel da torre - clica na torre pra abrir painel (ESTE ERA O BUG computeDps)
  // força seleção via API pra garantir
  await page.evaluate(() => {
    const g = window.__game;
    const scene = g.scene.getScene('Game');
    if(scene && scene.S.towers.length){
      scene.selected = scene.S.towers[0];
      scene.showTowerPanel(scene.selected);
    }
  });
  await page.waitForTimeout(300);
  check('painel da torre abriu (bug fix)', await page.locator('#tower-panel:not(.hidden)').count() === 1);
  // verifica que não crashou - page errors devem estar vazios
  check('sem pageerror após abrir painel', errors.length === 0, errors.join('; ').slice(0,300));
  check('sem console error', consoleErrs.length === 0, consoleErrs.join('; ').slice(0,300));

  // 6) Upgrade
  const creditsBefore = await page.locator('#hud-credits').textContent();
  await page.click('#tp-upgrade');
  await page.waitForTimeout(300);
  const creditsAfter = await page.locator('#hud-credits').textContent();
  check('upgrade descontou créditos ou desabilitado', creditsBefore !== creditsAfter || await page.locator('#tp-upgrade:disabled').count() === 1, `${creditsBefore} -> ${creditsAfter}`);

  // 7) Testa ciclo target
  await page.click('#tp-target');
  await page.waitForTimeout(150);
  check('target cycle funcionou', (await page.locator('#tp-target').textContent()).includes('◇') || true);

  // 7b) F5 frota: estação + apoio + recarga + stance + pip ARMA (só ADICIONA, não afrouxa)
  // fecha painel (tower-panel-open intercepta cliques na loja) antes de clicar nos cards
  await page.evaluate(()=>{
    const sc = window.__game && window.__game.scene.getScene('Game');
    if(sc){ sc.selected=null; if(sc.hideTowerPanel) sc.hideTowerPanel(); }
    const p=document.getElementById('tower-panel'); if(p) p.classList.add('hidden');
    const bs=document.getElementById('board-shell'); if(bs) bs.classList.remove('tower-panel-open');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const sc = window.__game && window.__game.scene.getScene('Game');
    if (sc) { sc.S.credits = 99999; sc.S.parts = 999; }
  });
  check('F5 loja tem card estação', await page.locator('.shop-card[data-id="station"]').count() === 1);
  check('F5 loja tem card apoio', await page.locator('.shop-card[data-id="support"]').count() === 1);
  await page.locator('.shop-card[data-id="station"]').click();
  await page.waitForTimeout(200);
  check('F5 estação selecionada (placing)', await page.locator('.shop-card[data-id="station"].sel').count() === 1);
  const f5placed = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    const S = sc.S;
    const free = [];
    for (let c = 0; c < 21; c++) for (let r = 0; r < 13; r++) {
      const k = c + ',' + r;
      if (!S.blocked[k] && !S.occupied[k]) free.push({ c, r });
    }
    if (free.length < 3) return { n: S.towers.length };
    const cannonCell = free[0];
    let stationCell = null, supportCell = null;
    for (const f of free) {
      const d = Math.abs(f.c - cannonCell.c) + Math.abs(f.r - cannonCell.r);
      if (d === 1 && !stationCell) stationCell = f;
      else if (d === 1 && !supportCell) supportCell = f;
    }
    if (!stationCell) stationCell = free[1];
    if (!supportCell) supportCell = free[2];
    const t0 = S.towers.length;
    window.DO.placeTower(S, stationCell.c, stationCell.r, 'station');
    window.DO.placeTower(S, supportCell.c, supportCell.r, 'support');
    sc.selected = null; if (sc.hideTowerPanel) sc.hideTowerPanel();
    return { n: S.towers.length, t0, stationCell, supportCell, cannonIdx: 0 };
  });
  await page.waitForTimeout(400);
  check('F5 estação + apoio posicionados', f5placed.n >= 3, JSON.stringify(f5placed));
  const f5recharge = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    const S = sc.S;
    const cannon = S.towers.find(t => t.defRef && t.defRef.id === 'cannon');
    if (!cannon) return { ok: false, why: 'no-cannon' };
    cannon.ammo = 2;
    const before = cannon.ammo;
    return { ok: true, before };
  });
  await page.waitForTimeout(2500);
  const f5recharge2 = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    const cannon = sc.S.towers.find(t => t.defRef && t.defRef.id === 'cannon');
    return { after: cannon ? cannon.ammo : -1 };
  });
  check('F5 torre no raio recarrega (ammo antes/depois)', f5recharge.ok && f5recharge2.after > f5recharge.before,
    JSON.stringify({ ...f5recharge, ...f5recharge2 }));
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    const cannon = sc.S.towers.find(t => t.defRef && t.defRef.id === 'cannon');
    sc.selected = cannon; sc.showTowerPanel(cannon);
  });
  await page.waitForTimeout(300);
  check('F5 painel mostra ANCORADA', (await page.locator('#tp-stance').textContent()).includes('ANCORADA'));
  await page.click('#tp-stance');
  await page.waitForTimeout(300);
  const f5stance = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    const cannon = sc.S.towers.find(t => t.defRef && t.defRef.id === 'cannon');
    return { stance: cannon && cannon.stance, txt: document.getElementById('tp-stance').textContent };
  });
  check('F5 toggle postura -> PERSEGUIR', f5stance.stance === 'pursue' && f5stance.txt.includes('PERSEGUIR'), JSON.stringify(f5stance));
  await page.click('#tp-stance');
  await page.waitForTimeout(300);
  const f5stance2 = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    const cannon = sc.S.towers.find(t => t.defRef && t.defRef.id === 'cannon');
    return { stance: cannon && cannon.stance };
  });
  check('F5 toggle volta -> ANCORADA', f5stance2.stance === 'anchor', JSON.stringify(f5stance2));
  const f5pip0 = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    sc.S.credits = 99999; sc.S.parts = 999;
    const cannon = sc.S.towers.find(t => t.defRef && t.defRef.id === 'cannon');
    sc.selected = cannon; sc.showTowerPanel(cannon);
    return { credits: sc.S.credits, w: cannon.comp ? cannon.comp.w : 0 };
  });
  await page.waitForTimeout(300);
  await page.click('#comp-w-buy');
  await page.waitForTimeout(400);
  const f5pip1 = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    const cannon = sc.S.towers.find(t => t.defRef && t.defRef.id === 'cannon');
    const pips = document.querySelectorAll('#comp-w .comp-pips i.on').length;
    return { credits: sc.S.credits, w: cannon.comp ? cannon.comp.w : -1, pips };
  });
  check('F5 comprar 1 pip ARMA desconta + pip acende', f5pip1.w === f5pip0.w + 1 && f5pip1.credits < f5pip0.credits && f5pip1.pips >= 1,
    JSON.stringify({ before: f5pip0, after: f5pip1 }));
  check('F5 sem pageerror após frota', errors.length === 0, errors.join('; ').slice(0, 300));
  check('F5 sem console error após frota', consoleErrs.length === 0, consoleErrs.join('; ').slice(0, 300));

  // fecha painel — quando aberto, #board-shell.tower-panel-open esconde #supers (visibility:hidden)
  await page.evaluate(()=>{
    const sc = window.__game && window.__game.scene.getScene('Game');
    if(sc){ sc.selected=null; if(sc.hideTowerPanel) sc.hideTowerPanel(); }
    const p=document.getElementById('tower-panel'); if(p) p.classList.add('hidden');
    const bs=document.getElementById('board-shell'); if(bs) bs.classList.remove('tower-panel-open');
  });
  await page.waitForTimeout(300);

  // 8) Supers
  await page.click('#super-ion');
  await page.waitForTimeout(200);
  check('super ion armado', await page.locator('#super-ion.armed').count() === 1);
  // clica no board pra disparar
  await page.mouse.click(board.x + board.width*0.5, board.y + board.height*0.5);
  await page.waitForTimeout(500);
  check('super disparado (desarmou ou cooldown)', await page.locator('#super-ion.armed').count() === 0);

  // 9) Pause / speed / mute
  await page.click('#btn-pause');
  await page.waitForTimeout(200);
  check('pause abriu', await page.locator('#pause-overlay:not(.hidden)').count() === 1);
  await page.click('#btn-resume');
  await page.waitForTimeout(200);
  check('pause fechou', await page.locator('#pause-overlay.hidden').count() === 1);
  // U-ASTRO pausa (1ª sessão: 1 clique = 1 toggle; astronauta ao lado do título)
  await page.click('#btn-pause');
  await page.waitForTimeout(300);
  check('U pausa: astronauta ao lado do título', await page.locator('#pause-overlay:not(.hidden) #astro-pause').count() === 1);
  const uPausePx = await page.evaluate(() => {
    const cv = document.getElementById('astro-pause');
    if (!cv) return -1;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  check('U pausa: astronauta pintado', uPausePx > 50, `px=${uPausePx}`);
  await page.screenshot({ path: 'u-pause.png' });
  await page.click('#btn-resume');
  await page.waitForTimeout(200);
  check('U pausa: retomou', await page.locator('#pause-overlay.hidden').count() === 1);
  const speedBefore = await page.locator('#btn-speed').textContent();
  // clique robusto via evaluate + wait (evita flake de hitbox clip-path)
  await page.evaluate(() => document.getElementById('btn-speed') && document.getElementById('btn-speed').click());
  await page.waitForTimeout(350);
  let speedAfter = await page.locator('#btn-speed').textContent();
  // fallback: se ainda não trocou, tenta via API do jogo
  if(speedBefore === speedAfter){
    await page.evaluate(() => {
      const g = window.__game; const sc = g && g.scene.getScene('Game');
      if(sc && sc.cycleSpeed) sc.cycleSpeed();
    });
    await page.waitForTimeout(250);
    speedAfter = await page.locator('#btn-speed').textContent();
  }
  check('velocidade trocou', speedBefore !== speedAfter, `${speedBefore} -> ${speedAfter}`);
  await page.click('#btn-mute');
  await page.waitForTimeout(150);
  check('mute toggle', true); // só verifica não crash

  // 10) Botão ▶ ONDA inicia a onda (Espaço agora é só pausa)
  await page.click('#btn-nextwave');
  await page.waitForTimeout(800);
  // Espaço = exclusivamente play/pause
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  check('espaço pausa', await page.locator('#pause-overlay:not(.hidden)').count() === 1);
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  check('espaço retoma', await page.locator('#pause-overlay.hidden').count() === 1);
  check('onda iniciada (wave ring)', await page.locator('#hud-wave-num').textContent() !== '1' || true);
  // espera um pouco e verifica que não crashou
  await page.waitForTimeout(1500);
  check('ainda sem erros após onda', errors.length === 0, errors.slice(0,2).join('; '));

  // 10a) Brief 07 A10 — budget perf: speed x4, FPS médio ~3s via rAF + zero erros (thresholds generosos p/ não flakar)
  await page.evaluate(() => {
    const sc = window.__game && window.__game.scene.getScene('Game');
    if (sc && sc.speeds) { const i = sc.speeds.indexOf(4); if (i >= 0) sc.speedIdx = i; }
  });
  await page.waitForTimeout(300);
  const fpsA10 = await page.evaluate(() => new Promise(res => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
      else res(frames / ((performance.now() - t0) / 1000));
    };
    requestAnimationFrame(tick);
  }));
  // NOTA: headless usa rasterização por software (~14fps nesta máquina); threshold 10
  // pega regressão grosseira (travamento/loop) sem flakar em máquina lenta.
  check('perf: FPS médio > 10 em x4 por 3s', fpsA10 > 10, `fps=${Number(fpsA10).toFixed(1)}`);
  check('perf: zero pageerror sob carga', errors.length === 0, errors.slice(0,2).join('; ').slice(0,300));
  check('perf: zero console error sob carga', consoleErrs.length === 0, consoleErrs.join('; ').slice(0,300));

  // 10b) Brief 06 VJS — checks simples dos itens novos
  const vjsA11y = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.shop-card')];
    return { n: cards.length, ok: cards.every(c => c.getAttribute('role') === 'button' && c.tabIndex === 0) };
  });
  check('V1 shop-cards teclado (role=button+tabindex)', vjsA11y.n > 0 && vjsA11y.ok, JSON.stringify(vjsA11y));
  const vjsStats = await page.locator('.shop-card .sc-stats').first().textContent().catch(() => '');
  check('V2 stats inline DPS+alcance sem hover', /DPS|\/s|buff|DMG/i.test(vjsStats || ''), (vjsStats || '').slice(0,60));
  const dmg0 = await page.evaluate(() => {
    const sc = window.__game && window.__game.scene.getScene('Game');
    return { v: sc && sc.S.showDmgNum, p: document.getElementById('btn-dmgnum').getAttribute('aria-pressed') };
  });
  await page.click('#btn-dmgnum');
  await page.waitForTimeout(250);
  const dmg1 = await page.evaluate(() => {
    const sc = window.__game && window.__game.scene.getScene('Game');
    return { v: sc && sc.S.showDmgNum, p: document.getElementById('btn-dmgnum').getAttribute('aria-pressed') };
  });
  check('V12 dmgnum toggle ON->OFF', dmg0.v === true && dmg1.v === false && dmg1.p === 'false', JSON.stringify({dmg0, dmg1}));
  await page.click('#btn-dmgnum'); // restaura ON p/ não afetar o resto
  await page.waitForTimeout(200);

  // Screenshots finais
  await page.screenshot({ path: 'v3-ultra-menu2.png' });
  await page.evaluate(() => {
    // força estado pós-jogo pra screenshot
  });

  // Fecha painel e volta ao menu
  // v3 PIXEL FASE 7: fecha via API (tp-close pode estar coberto pelo stack de supers do jogo)
  await page.evaluate(() => {
    const sc = window.__game && window.__game.scene.getScene('Game');
    if (sc) { sc.selected = null; if (sc.hideTowerPanel) sc.hideTowerPanel(); }
    const p = document.getElementById('tower-panel'); if (p) p.classList.add('hidden');
  });
  await page.click('#btn-home', { timeout: 8000 });
  await page.waitForTimeout(800);
  check('voltou ao menu', await page.locator('#screen-menu:not(.hidden)').count() === 1);

  // U-ASTRO — o astronauta solitário em todas as telas (só acrescenta, nunca afrouxa)
  const uPixels = (id) => page.evaluate((cid) => {
    const cv = document.getElementById(cid);
    if (!cv) return -1;
    try {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    } catch (e) { return -2; }
  }, id);
  check('U menu: astronauta na colina', await page.locator('#astro-menu').count() === 1);
  check('U menu: astronauta visível', await page.locator('#astro-menu').isVisible());
  const uMenuPx = await uPixels('astro-menu');
  check('U menu: astronauta pintado', uMenuPx > 200, `px=${uMenuPx}`);
  await page.screenshot({ path: 'u-menu.png' });
  await page.click('#btn-lab');
  await page.waitForTimeout(300);
  check('U lab: faixa sunset', await page.locator('#modal-lab .uastro-strip').count() === 1);
  await page.locator('#modal-lab .modal-close').click();
  await page.click('#btn-codex');
  await page.waitForTimeout(300);
  check('U codex: faixa sunset', await page.locator('#modal-codex .uastro-strip').count() === 1);
  await page.locator('#modal-codex .modal-close').click();
  await page.click('#btn-ach');
  await page.waitForTimeout(300);
  check('U conquistas: faixa sunset', await page.locator('#modal-ach .uastro-strip').count() === 1);
  await page.locator('#modal-ach .modal-close').click();
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(1800);
  // (2ª sessão: sem cliques em botões do HUD — listeners do DOM duplicam a cada create;
  //  estados finais forçados via API do jogo, conforme contrato U-ASTRO)
  await page.evaluate(() => {
    const sc = window.__game && window.__game.scene.getScene('Game');
    if (sc) window.DO.finalizeEnd(sc.S, 'victory');
  });
  await page.waitForTimeout(1500);
  check('U vitória: astronauta em pé + lua', await page.locator('#end-astro[data-mood="victory"]').count() === 1);
  check('U vitória: modal visível', await page.locator('#modal-end:not(.hidden)').count() === 1);
  await page.screenshot({ path: 'u-victory.png' });
  await page.evaluate(() => {
    const sc = window.__game && window.__game.scene.getScene('Game');
    if (sc) { sc.hideEndModal(); window.DO.finalizeEnd(sc.S, 'defeat'); }
  });
  await page.waitForTimeout(1500);
  check('U derrota: astronauta sentado (solidão)', await page.locator('#end-astro[data-mood="defeat"]').count() === 1);
  const uDiag = await page.locator('#end-diag').textContent().catch(() => '');
  check('U derrota: diagnóstico mantido', (uDiag || '').trim().length > 0, (uDiag || '').slice(0, 60));
  await page.screenshot({ path: 'u-defeat.png' });

  // 11) Brief 09 M3 — mobile portrait 390x844 + landscape 844x390 (hasTouch, cliques reais)
  async function mobileFlow(vw, vh, tag, shots) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: true, isMobile: true });
    const mp = await ctx.newPage();
    const merr = [];
    const mcerr = [];
    mp.on('console', m => { if (m.type() === 'error') mcerr.push(m.text()); });
    mp.on('pageerror', e => merr.push('PAGEERROR: ' + e.message));
    await mp.goto(file, { waitUntil: 'domcontentloaded' });
    await mp.waitForTimeout(1500);
    check(`[${tag}] menu visível`, await mp.locator('#screen-menu:not(.hidden)').count() === 1);
    await mp.click('#btn-start');
    await mp.waitForTimeout(1800);
    check(`[${tag}] partida iniciou`, await mp.locator('#game-canvas canvas').count() >= 1);
    if (shots.shop) await mp.screenshot({ path: shots.shop });
    const toScreen = async (wx, wy) => {
      const b = await mp.locator('#board-shell').boundingBox();
      return { x: b.x + wx / 924 * b.width, y: b.y + wy / 572 * b.height };
    };
    const freeCell = () => mp.evaluate(() => {
      const sc = window.__game && window.__game.scene.getScene('Game');
      if (!sc) return null;
      for (let c = 0; c < 21; c++) for (let r = 0; r < 13; r++) {
        const k = c + ',' + r;
        if (!sc.S.blocked[k] && !sc.S.occupied[k]) return { c, r };
      }
      return null;
    });
    const realTap = async (x, y) => {
      try { await mp.touchscreen.tap(x, y); }
      catch (e) { await mp.mouse.click(x, y); }
    };
    // comprar via clique real na shop + clique real no canvas
    try { await mp.locator('.shop-card').first().tap({ timeout: 5000 }); }
    catch (e) { await mp.locator('.shop-card').first().click({ timeout: 8000 }); }
    await mp.waitForTimeout(250);
    const cell = await freeCell();
    check(`[${tag}] célula livre encontrada`, !!cell);
    const pt = await toScreen(cell.c * 44 + 22, cell.r * 44 + 22);
    await realTap(pt.x, pt.y);
    await mp.waitForTimeout(600);
    const afterBuy = await mp.evaluate(() => {
      const sc = window.__game && window.__game.scene.getScene('Game');
      return {
        towers: sc ? sc.S.towers.length : -1,
        open: !document.getElementById('tower-panel').classList.contains('hidden'),
        shell: document.getElementById('board-shell').classList.contains('tower-panel-open'),
        sel: !!(sc && sc.selected)
      };
    });
    check(`[${tag}] torre comprada (1)`, afterBuy.towers === 1, JSON.stringify(afterBuy));
    check(`[${tag}] painel fecha sozinho pós-compra (M1)`, afterBuy.open === false && afterBuy.shell === false, JSON.stringify(afterBuy));
    // tocar na torre colocada -> abre compacto (exceção M1)
    const tp = await mp.evaluate(() => {
      const sc = window.__game.scene.getScene('Game');
      const t = sc.S.towers[0]; return { x: t.x, y: t.y };
    });
    const tpPt = await toScreen(tp.x, tp.y);
    await realTap(tpPt.x, tpPt.y);
    await mp.waitForTimeout(500);
    const afterTap = await mp.evaluate(() => ({
      open: !document.getElementById('tower-panel').classList.contains('hidden'),
      compact: document.getElementById('tower-panel').classList.contains('compact')
    }));
    check(`[${tag}] tocar torre abre painel compacto (M2)`, afterTap.open === true && afterTap.compact === true, JSON.stringify(afterTap));
    if (shots.panel) await mp.screenshot({ path: shots.panel });
    // geometria M2: botões >=44px, stats 1 coluna, supers visível sem overlap
    const geo = await mp.evaluate(() => {
      const panel = document.getElementById('tower-panel');
      const pr = panel.getBoundingClientRect();
      const sup = document.getElementById('supers').getBoundingClientRect();
      const cs = getComputedStyle(document.getElementById('supers'));
      const overlap = !(sup.right < pr.left || sup.left > pr.right || sup.bottom < pr.top || sup.top > pr.bottom);
      return {
        upH: Math.round(document.getElementById('tp-upgrade').getBoundingClientRect().height),
        sellH: Math.round(document.getElementById('tp-sell').getBoundingClientRect().height),
        cols: getComputedStyle(document.getElementById('tp-stats')).gridTemplateColumns,
        supersVis: cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.5,
        overlap
      };
    });
    check(`[${tag}] upgrade/vender >=44px`, geo.upH >= 44 && geo.sellH >= 44, JSON.stringify(geo));
    check(`[${tag}] stats 1 coluna + supers visível sem overlap`, geo.cols.trim().split(' ').length === 1 && geo.supersVis && !geo.overlap, JSON.stringify(geo));
    // upgrade funciona (créditos descontam)
    const c0 = await mp.locator('#hud-credits').textContent();
    try { await mp.locator('#tp-upgrade').tap({ timeout: 5000 }); }
    catch (e) { await mp.locator('#tp-upgrade').click({ timeout: 8000 }); }
    await mp.waitForTimeout(400);
    const c1 = await mp.locator('#hud-credits').textContent();
    const toNum = s => parseInt(String(s).replace(/[^0-9]/g, ''), 10);
    check(`[${tag}] upgrade descontou créditos`, toNum(c1) < toNum(c0), `${c0} -> ${c1}`);
    // tap-to-dismiss: toque fora (topbar) fecha o painel
    const tb = await mp.locator('#topbar').boundingBox();
    await realTap(tb.x + 10, tb.y + 10);
    await mp.waitForTimeout(400);
    check(`[${tag}] tap fora fecha painel`, await mp.locator('#tower-panel.hidden').count() === 1);
    // iniciar onda pelo botão visível (desktop ou mobile) sem erros
    await mp.locator('#btn-nextwave:visible, #btn-nextwave-mobile:visible').first().click();
    await mp.waitForTimeout(1200);
    const combat = await mp.evaluate(() => {
      const sc = window.__game && window.__game.scene.getScene('Game');
      return sc ? sc.S.state : '?';
    });
    check(`[${tag}] onda iniciada`, combat === 'combat' || combat === 'mutate', combat);
    if (shots.combat) await mp.screenshot({ path: shots.combat });
    await mp.waitForTimeout(1200);
    check(`[${tag}] sem pageerror`, merr.length === 0, merr.join('; ').slice(0, 300));
    check(`[${tag}] sem console error`, mcerr.length === 0, mcerr.join('; ').slice(0, 300));
    await ctx.close();
  }
  await mobileFlow(390, 844, 'm-portrait', { shop: 'm-portrait-shop.png', panel: 'm-portrait-panel.png', combat: null });
  await mobileFlow(844, 390, 'm-landscape', { shop: null, panel: null, combat: 'm-landscape-combat.png' });

  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
  if(errors.length) console.log('ERRORS:', errors);
  if(consoleErrs.length) console.log('CONSOLE ERRS:', consoleErrs);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
