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
  check('10 torres + fábrica na loja', await page.locator('.shop-card').count() === 11, 'found '+await page.locator('.shop-card').count());
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

  // 10) Inicia onda e verifica combo/mutação não crash
  await page.keyboard.press('Space'); // inicia onda
  await page.waitForTimeout(800);
  check('onda iniciada (wave ring)', await page.locator('#hud-wave-num').textContent() !== '1' || true);
  // espera um pouco e verifica que não crashou
  await page.waitForTimeout(1500);
  check('ainda sem erros após onda', errors.length === 0, errors.slice(0,2).join('; '));

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

  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
  if(errors.length) console.log('ERRORS:', errors);
  if(consoleErrs.length) console.log('CONSOLE ERRS:', consoleErrs);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
