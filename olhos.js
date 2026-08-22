// Olhos do processo: screenshot + console errors do jogo real
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e.message).slice(0, 300)));
  await page.goto('file:///C:/Users/adolf/Desktop/hermes/defesa-orbital-3.html');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'v3-menu.png' });
  await page.click('#btn-start');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'v3-game.png' });
  console.log('ERRORS:' + JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
