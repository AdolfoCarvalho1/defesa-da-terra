// Sonda 3: fluxo real do usuário — joga fase, volta ao menu, inicia outra campanha.
const { chromium } = require('@playwright/test');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const logs = [];
  page.on('pageerror', e => logs.push('[PAGEERROR] ' + e.message));
  const file = 'file:///' + path.resolve('defesa-orbital-3.html').replace(/\\/g,'/');
  await page.goto(file, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const startPhase = async (camp) => {
    await page.locator('#shmup-grid .map-card').nth(camp).click();
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('[data-phase="0"]').click());
    await page.waitForTimeout(2300);
    const st = await page.evaluate(() => {
      const n = window.__game.scene.getScene('Nave');
      return { _cdRunning: !!n._cdRunning, briefC: !!n.briefC, phaseActive: !!n.phaseActive };
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    const st2 = await page.evaluate(() => {
      const n = window.__game.scene.getScene('Nave');
      return { phaseActive: !!n.phaseActive, enemies: n.enemies ? n.enemies.length : -1 };
    });
    console.log(`camp ${camp}: pré=${JSON.stringify(st)} pós=${JSON.stringify(st2)}`);
    return st2;
  };

  // A) mesma página: camp 1 -> termina forçado -> volta menu -> camp 2
  console.log('--- A) fluxo real sem reload ---');
  await startPhase(1);
  // força fim da fase (zera tempo e vidas) e vê pra onde vai
  await page.evaluate(() => {
    const n = window.__game.scene.getScene('Nave');
    n.timeLeft = 0.3;
    try { n.lives = 0; n.hitPlayer && n.hitPlayer(true); } catch(e) {}
  });
  await page.waitForTimeout(6000);
  const where = await page.evaluate(() => {
    const g = window.__game;
    const active = g.scene.getScenes(true).map(s=>s.scene.key);
    const menuVisible = (() => { const m=document.getElementById('screen-menu'); return m && !m.classList.contains('hidden'); })();
    const modalEnd = !document.getElementById('modal-end').classList.contains('hidden');
    return { active, menuVisible, modalEnd };
  });
  console.log('após morte:', JSON.stringify(where));

  // se voltou/sobe menu, tenta camp 2 SEM reload
  const canContinue = where.menuVisible || where.modalEnd;
  if (canContinue) {
    // fecha modal-end se aberto (clica botão menu se houver)
    if (where.modalEnd) {
      await page.evaluate(() => {
        const b = document.querySelector('#modal-end #btn-menu') || document.querySelector('#modal-end .modal-close');
        if (b) b.click(); else document.getElementById('modal-end').classList.add('hidden');
      });
      await page.waitForTimeout(800);
    }
    const menuNow = await page.evaluate(() => { const m=document.getElementById('screen-menu'); return m && !m.classList.contains('hidden'); });
    console.log('menu visível agora?', menuNow);
    if (menuNow) await startPhase(2);
  }

  // B) sequência da sonda 1 que falhou (reload entre campanhas) x2 pra checar flakiness
  console.log('--- B) reload entre campanhas ---');
  for (let i = 0; i < 2; i++) {
    await page.goto(file, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await startPhase(3);
  }

  console.log('\nPAGEERRORS:', logs.length ? '' : 'nenhum');
  logs.slice(0,10).forEach(l => console.log(l));
  await browser.close();
})();
