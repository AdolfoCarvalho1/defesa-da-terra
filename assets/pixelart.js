/* Defesa Orbital v3 — FASE 1: Pixel Art por Código (window.PXART)
   Sprites ASCII + paleta, 1 px lógico = 3 px reais. Sem pixelArt global.
   Chaves novas (prevalecem sobre as antigas): tur_<id>_t<tier>, en_<tipo>, px_factory_l<n>, px_pr_<kind>. */
'use strict';
(function () {
  const TKN = (typeof window!=='undefined' && (window.TOKENS || (window.DO3 && window.DO3.TOKENS))) || null;
  const PX = (TKN && TKN.PIXEL && TKN.PIXEL.PX) || 3; // escala: 1 pixel lógico = 3px reais

  // helper de desenho: rows ASCII + palette por caractere
  function drawRows(g, rows, pal) {
    const h = rows.length;
    let w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === ' ' || ch === '.') continue;
        const c = pal[ch];
        if (!c) continue;
        // Phaser quer cor NUMÉRICA; string vira preto (bug dos sprites pretos)
        g.fillStyle(typeof c === 'number' ? c : parseInt(c.slice(1), 16), 1);
        g.fillRect(x * PX, y * PX, PX, PX);
      }
    }
    return { w: w * PX, h: h * PX };
  }
  function tint(hexStr, f) { // usa TOKENS.tint se existir, senão fallback
    if(TKN && TKN.tint) return TKN.tint(hexStr, f);
    const n = parseInt(hexStr.slice(1), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; gg += (255 - gg) * f; b += (255 - b) * f; }
    else { r *= 1 + f; gg *= 1 + f; b *= 1 + f; }
    const hx = v => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
    return '#' + hx(r) + hx(gg) + hx(b);
  }
  function getTOK(col){ return TKN ? TKN.PALETTE : null; }

  // ===== TORRES: silhuetas 13-17px, apontando pra CIMA (rotaciona no jogo) =====
  // IDENTIDADE UNIFICADA: K contorno preto obrigatório, W brilho, G vidro, M metal aço #8b95a8 (TOKENS.PIXEL.M)
  // C = col da família (1 acento), D/E/L derivados, Y gold camu uniform, O orange, N green p/ amp/tesla
  function towerPalette(col) {
    const PAL = getTOK();
    const steel = (PAL && PAL.steelDark) || '#8b95a8';
    return {
      K: (TKN && TKN.PIXEL && TKN.PIXEL.K) || '#000000',
      W: (TKN && TKN.PIXEL && TKN.PIXEL.W) || '#ffffff',
      G: (TKN && TKN.PIXEL && TKN.PIXEL.G) || '#bfe3ff',
      M: steel,
      D: tint(col, -0.55),
      C: col, L: tint(col, 0.35), E: tint(col, -0.25),
      Y: (PAL && PAL.gold) || '#fbbf24',
      O: (PAL && PAL.orange) || '#fb923c',
      N: (PAL && PAL.green) || '#34d399',
      R: (PAL && PAL.red) || '#f43f5e',
      V: (PAL && PAL.acid) || '#a3e635',
      B: (PAL && PAL.shieldBlue) || '#60a5fa',
      P: (PAL && PAL.purple) || '#a78bfa'
    };
  }
  const TOWER_ART = {
    cannon: [
      '       KK       ',
      '      KWWK      ',
      '   KKKKCCKKKK   ',
      '  KCCEECCCEECCK ',
      ' KKCCLLCCCCLLCKK',
      'KCCLGGCCCCCGLLCK',
      'KCEEGGCCCGGEEeck'.replace(/e/g,'E').replace(/c/g,'C'),
      'KCCCCKDDDKCCCCCK',
      ' KCCCDKKKDCCCK  ',
      '  KKKKDOODKKKK  ',
      '     KDYYODK    ',
      '      KOOKK     '
    ],
    gatling: [
      '     KWWWK      ',
      '    KWCCWK      ',
      ' KKKKCCCCKKKK   ',
      'KCCLEECCLEELCCK ',
      'KCCLLGCCLLGGLCKK',
      'KCCEEGCEEGEEECCK',
      'KCCCCKDDDCCCCCCY',
      'KCCCKDKKKDKCCYKY',
      ' KCCKDYYYDKCYKY ',
      '  KKKDOOODKCKYK ',
      '    KDYYYYDKKKK ',
      '     KOOOKK     '
    ],
    laser: [
      '      KWWK      ',
      '     KWRRWK     ',
      '  KKKKRCCRKKKK  ',
      ' KRCLEERRCELCRK ',
      'KRCLLGRREGRLLCRK',
      'KRCCEERRRREECCRK',
      'KRCCKRRWWWRRKCRK',
      ' KRKDRRWYWRRDKRK',
      '  KKDRRWYWRRDKK ',
      '   KKDRROORDKK  ',
      '     KDOOODK    ',
      '      KOKK      '
    ],
    missile: [
      '   KWK   KWK    ',
      '  KOOWK KOOWK   ',
      '  KOCWK KOCWK   ',
      ' KKKOCCKKOCCKKK ',
      'KOCCLECCEELCCCOX'.replace(/X/,'K'),
      'OCLLLGCCCGLLLLCK',
      'OCCEEGCCCCEEGCCK',
      'OCCCKDDDDDKCCCCK',
      'OCKKDKKKKKDKKKOK',
      ' OKKDYYYYYYDKKO ',
      '  KKOYYYYYYOKK  ',
      '    KOOOOOK     '
    ],
    cryo: [
      '      KGWK      ',
      '   KKGWGWGKK    ',
      '  KCCKCXCCKCCK  '.replace(/X/g,'G'),
      ' KCCLLCGGGCLLCK ',
      'KCCLGGCWGWCGGLCK',
      'KCGEEGGCGWGGEEXK'.replace(/X/,'G'),
      'KCGGKWGGGGWKGGCK',
      ' KCKDWGGGGWDKCK ',
      '  KKDGGGGGGDKK  ',
      '   KKDGOOGDKK   ',
      '    KDYOOYDK    ',
      '     KKOOKK     '
    ],
    tesla: [
      '      KYWK      ',
      '     KWYWYK     ',
      '  KKKKYCYKKKK   ',
      ' KCCLEYCYELCCkK '.replace(/k/,'C'),
      'KCCLLYCYCYLLCCKK',
      'KCCEYGCWCGYEECCK',
      'KCCYKWYWYWYKCCKK',
      'KCCKDYWYWYDKCCK ',
      ' KCKDYYWYYDKCK  ',
      '  KKDYYYYYYDKK  ',
      '   KKDOYOODKK   ',
      '     KKOOUU'.replace(/U/,'K')
    ],
    sniper: [
      '       KW       ',
      '      KWCK      ',
      '     KWCCWK     ',
      '  KKKCCLLCKKK   ',
      ' KCCLLLGCCLLCK  ',
      'KCCLLGGWGGCLLCKK',
      'KCCEEGWWWWGEECCK',
      'KCCKDEWWWWEDKCCK',
      ' KCKDDWWWWDDKCK ',
      '  KKDDGWWGDDKK  ',
      '    KDGOOGDK    ',
      '     KKOOUK'.replace(/U/,'O')+'K'
    ],
    venom: [
      '   KKKK KKKK    ',
      '  KLVVK KLvvK   '.replace(/v/g,'V'),
      ' KVLWVK KVLWVK  ',
      ' KKKVLKKKLVLKKK ',
      'KVLLLEEEEELLVVVK',
      'VCLLGGEEEGGCLLCK',
      'VCCEEGKKKGEECCVK',
      'VCCDKKGVVGKKDCCK',
      'OCKDDGGWWGGDDKCO',
      ' OOKDGWYYWGDHKK '.replace(/H/,'D'),
      '   KKDYYYYDKK   ',
      '    KKOOOOKK    '
    ],
    amp: [
      '     KWKWK      ',
      '    KYYYYYK     ',
      '  KKKYCWCYKKK   ',
      ' KCLEYCWYCCELCK ',
      'KCLLYCWWWYCLLXKK'.replace(/X/,'C'),
      'KCLEYGWWGWGYELCK',
      'KCEEGWWYWWGEECCK',
      'KCKDDWWYWWDDKCKK',
      ' KCKDWWYWWDKCK  ',
      '  KKDWWYWWDKK   ',
      '   KKOYYYOOK    ',
      '    KKOOUKK'.replace(/U/,'O')
    ],
    rail: [
      '      KWWK      ',
      '     KWCCWK     ',
      ' KKKKCCLLCKKKK  ',
      'KCMMLLCCCCLLMKCK'.replace(/KCK/,'KCK'),
      'KMMLLGCCCCGLLMKK',
      'KMCEEGCCCCEEXMCK'.replace(/X/,'E'),
      'KMCKDDCCCCCDDKKK'.replace('KKK','KMK'),
      'KMKDDCCMMCCDDKMK',
      ' KMDCCMMMCCDKMK ',
      '  KKDCMMMCDKKK  ',
      '    KDCMMCDK    ',
      '     KKOOUK'.replace(/U/,'O')+'K'
    ]
  };

  // ===== INIMIGOS: chunky aliens com olhos / naves com cockpit =====
  // IDENTIDADE UNIFICADA: inimigos usam 3 mães Hivemind (bioOrange/acid/shieldBlue) mas paleta fechada TOKENS
  function enemyPalette(defCol) {
    const PAL = getTOK();
    const steel = (PAL && PAL.steelDark) || (TKN && TKN.PIXEL && TKN.PIXEL.M) || '#8b95a8';
    return {
      K: (TKN && TKN.PIXEL && TKN.PIXEL.K) || '#000000',
      W: (TKN && TKN.PIXEL && TKN.PIXEL.W) || '#ffffff',
      G: (TKN && TKN.PIXEL && TKN.PIXEL.G) || '#bfe3ff',
      M: steel,
      D: tint(defCol, (TKN && TKN.PIXEL && TKN.PIXEL.DARK_FACTOR) || -0.55),
      C: defCol, L: tint(defCol, (TKN && TKN.PIXEL && TKN.PIXEL.LIGHT_FACTOR) || 0.35), E: tint(defCol, -0.25),
      R: (PAL && PAL.red) || '#f43f5e',
      Y: (PAL && PAL.gold) || '#fbbf24',
      P: (PAL && PAL.purple) || '#a78bfa',
      N: (PAL && PAL.green) || '#34d399',
      B: (PAL && PAL.shieldBlue) || '#60a5fa',
      O: (PAL && PAL.bioOrange) || '#f97316'
    };
  }
  const ENEMY_ART = {
    drone: [
      '   K     K   ',
      '  KWK   KWK  ',
      '  KCK K KCK  ',
      ' KKCKKKKKCKK ',
      'KCCLLCGCLLCKK',
      'KCGWGGCGGWGCK',
      'KCGKKGGGKKGGK',
      ' KCCKDDDKCCK ',
      '  KCKDKDKCK  ',
      '   KKKKKKK   '
    ],
    runner: [
      ' KK          ',
      'KWLK         ',
      'KCCLK        ',
      'KCGLLK       ',
      'KCGGCLKKKKK  ',
      'KCGLLCCCCLLK ',
      'KCCLKCCKCCLKK',
      'KKKKKKKKKKKKK',
      '   KYYKKYYK  '
    ],
    tank: [
      ' KKKKKKKKKKKK ',
      'KCMDMMMMMMMMK',
      'KCMMDDDDDDMMK',
      'KCMKWWKKWWKMMK',
      'KCCKGGKKGGKCMK',
      'KCCKGGKKGGKCMK',
      'KCMMKDKKKDKMMK',
      'KCMMDDDDDDMMMK',
      'KCMMEMMMMMECMK',
      ' KKMMKKKKMMKK ',
      '  KKKK  KKKK  '
    ],
    swarm: [
      ' K K  ',
      'KWKCK ',
      'KCCK  ',
      'KCGCK ',
      'KKCKK ',
      ' KKK  '
    ],
    healer: [
      '  KWKKWK  ',
      '  KNCCKN  ',
      ' KKNCCNKK ',
      'KNCLLGLLNK',
      'KNCGWGWGCNK',
      'KNCGKKKGCNK',
      ' KNCCCCKNK',
      '  KKNCNKK ',
      ' KNCKKCKNK',
      '  KKKKKK  '
    ],
    phase: [
      '   KKKKK   ',
      ' KK WGW KK ',
      'KWKGGGGGKWK',
      'KWGKPWPKGWK',
      'KWGKGGGKGWK',
      ' KWGGWGGWK ',
      '  KKGWGKK  ',
      '   KKKKK   '
    ],
    bomber: [
      '     KW      ',
      '    KWCK     ',
      '  KKWCCKKK   ',
      ' KCLRRLRCLCK ',
      'KCLRRWRRRRLCK',
      'KCRRKWRWKRRCX'.replace(/X/,'K'),
      'KCRRKRRRKRRCX'.replace(/X/,'K'),
      ' KCCKRRRRKCK ',
      '  KKKKRKKKK  ',
      '     KYYK    ',
      '      KK     '
    ],
    shielded: [
      '  KBBBBBBBK  ',
      ' KBWBBBBBBBK ',
      'KBCCBBBBBBCBK',
      'KBCKWWWWKCBBK',
      'KBCKGGGGKCBBK',
      'KBCKGGGGKCBXK'.replace(/X/,'B'),
      'KBCKKDDKKCBBK',
      'KBCCCDDCCCBBK',
      ' KBCDDDDDCBK ',
      '  KBBKKKBBK  ',
      '   KKK  KKK  '
    ],
    splitter: [
      ' KKK   KKK  ',
      'KWLGK KWGLK ',
      'KCGGLKKLGGBK',
      'KCGGKYYYKGBK',
      'KCGKYYYYYKGB',
      'KKKYYYYYYYKK',
      ' KYYKKKKKYYK',
      '  KKK   KKK '
    ],
    colossus: [
      '  KKKKKKKKKKKKK  ',
      ' KMDDDDDDDDDDDMK ',
      'KMMDKKKKKKKKKDDMK',
      'KMMDKMMMMMMMKDDMK',
      'KMDDKWGKKKWGKDDMK',
      'KMDDKWGKKKWGKDDMK',
      'KMDDDKKKKKKKDDDMK',
      'KMMDDDDDDDDDDDDMK',
      'KMEMMMMMMMMMMEMMK',
      'KMEMKKEMMMKEKMEMK',
      ' KMMKKKMMMKKKMMDK',
      '  KKKKKKKKKKKKKK '
    ],
    mini: [
      ' KK ',
      'KWCX'.replace(/X/,'K'),
      'KCGK',
      'KKKK'
    ],
    wasp: [
      'KK        KK',
      'KYYK      KYX'.replace(/X/,'Y')+'K',
      'KYYYKKKKKKYYK',
      'KYLGGCCCCKKYK',
      'KYYKCKKKCKYYK',
      'KKYYKYYYKYYKK',
      '  KKKYYYKKK  ',
      '    KKKKK    '
    ],
    boss1: [
      '    KKKKKKKKKKKKKK    ',
      '  KKWWWWKKKKKKWWWWKK  ',
      ' KKWRRWWKDDDDKWWRWWKK ',
      'KKWRRWWKDDDDDDKWWRWWKK',
      'KKRRWWKDDRDDRDDKWWRRKK',
      'KKRRWKDDRKGGKRDDKWRRKK',
      'KKRRKDDDRKGGKRDDDKRRKK',
      'KKRRKDDRKKGGKKRDDKRRKK',
      'KKRRKDDRKKKKKKRDDKRRKK',
      'KKRRWKDDDDDDDDDKWRRKK ',
      ' KKRWWKDDDDDDDKWWRKK  ',
      '  KKKWWKKKKKKKWWKKK   ',
      '    KKKKKKKKKKKKKK    '
    ],
    boss2: [
      '   KKKKKKKKKKKKKKKKK   ',
      ' KKWWWWWWKKKKKWWWWWWKK ',
      'KKWOOOWWWKDDDKWWWOOWKK ',
      'KOOOOWWKDDDDDDDKWWOOOXK'.replace(/X/,'O'),
      'KOOOWWKDDRRDDRDDKWWOOOK',
      'KOOWWKDDRRKGGKRRDDKWOOX'.replace(/X/,'K'),
      'KOOWKDDRRKGYGKRRDDKWOOK',
      'KOOWKDDRRKGYGKRRDDKWOXK'.replace(/X/,'K'),
      'KOOXKDDRKKKKKKRDDKXOOXK'.replace(/X/g,'O'),
      ' KOOXKWDDDDDDDDDWKXOOK '.replace(/X/g,'O'),
      '  KKOOWWKDDDDDKWWOOKK  ',
      '    KKKWWKKKKKWWKKK    ',
      '      KKKKKKKKKKK      '
    ],
    boss3: [
      '  KKKKKKKKKKKKKKKKKKKK  ',
      ' KWWWWWWWWKKKKKWWWWWWWWK',
      'KWCYYCWWWWKDDDKWWWWCYYCX'.replace(/X/,'K'),
      'KCYYCCWWKDDDDDDDKWWCCYYK',
      'KCYYWKDDRRRRRRRDDKWYYCKK',
      'KCWXKDDRGGGGGGGRDDKXWCKK'.replace(/X/g,'Y'),
      'KCWKDDRGGKKKKKGGXRDKWCKK'.replace(/XR/,'RD'),
      'KCWKDRGGKKWWWKKGGRDKWCKK',
      'KCWKDRGGKKWKWKKGGRDKWCKK',
      'KCWKDDRGGKKKKKGGXRDKWCKK'.replace(/XR/,'RD'),
      'KCCXKDDRGGGGGGGXRDXXCCKK'.replace(/X/g,'Y'),
      'KCCWKDDRRRRRRRRRDKWCCXK'.replace(/X/,'K'),
      ' KCKWWKDDDDDDDDDKWWKCK  ',
      '  KKWWKKKDDDDDKKKWWKKK  ',
      '    KKKKKKKKKKKKKKKK    '
    ]
  };

  // ===== FÁBRICA: prédio industrial com chaminé e luz verde =====
  function factoryArt(lvl) {
    const chimneys = [];
    for (let i = 0; i < lvl; i++) chimneys.push(i);
    const art = [];
    // chaminés no topo
    const topRow = new Array(19).fill('.');
    topRow[16] = 'K'; topRow[17] = 'N'; topRow[18] = 'K';
    art.push(topRow.join('').replace(/\./g, ' '));
    for (let r = 0; r < 2 + lvl; r++) {
      const row = new Array(19).fill('.');
      row[16] = 'K'; row[18] = 'K';
      art.push(row.join('').replace(/\./g, ' '));
    }
    // corpo
    art.push(' KKKKKKKKKKKKKKKKK ');
    art.push('KMMDDDDDDDDDDDDKNNK');
    art.push('KMDGGDDDDDDDDDDKENK');
    art.push('KMDGDGDDDDDDDDDKENK');
    art.push('KMDDDGDDDDDDDDDKDNK');
    art.push('KMDDDDDDDDDDDDDKDNK');
    art.push('KMDKKDDKKDDKKDDKDDK');
    art.push('KMDKWDDKWDDKWDDKDDK');
    art.push('KMDKKDDKKDDKKDDKDDK');
    art.push('KMMDDDDDDDDDDDDKDDK');
    art.push('KKKKKKKKKKKKKKKKKKK');
    return art;
  }

  // ===== PROJÉTEIS por kind =====
  const PROJ_ART = {
    bullet: [' K ', 'KWK', 'KWK', ' KO'],
    missile: ['.K..', 'KOOK', 'KOYK', '.KK.'].map(s => s.replace(/\./g, ' ')),
    beam: ['KWWK', 'KRWK'],
    slow: ['.KK.', 'KGWK', 'KWGK', '.KK.'].map(s => s.replace(/\./g, ' ')),
    chain: ['.K.K.', 'KWKWK', '.KYK.', 'KYWYK', '.KKK.'].map(s => s.replace(/\./g, ' ')),
    snipe: ['KW', 'KC', 'KO'],
    dot: ['.KK.', 'KLGK', 'KLWK', '.KK.'].map(s => s.replace(/\./g, ' ')),
    pierce: ['.KW.', 'KWCK', 'KWCK', '.KK.'].map(s => s.replace(/\./g, ' '))
  };

  // tier adds: pods extras nas asas + trim dourado + canos maiores + núcleo
  function applyTierArt(rows, tier, pal) {
    if (tier <= 1) return rows;
    const w = rows[0].length;
    const out = rows.slice();
    // pods de asa (colunas laterais) a partir do T2
    const podChar = tier >= 3 ? 'Y' : 'L';
    for (let y = 2; y < out.length - 2; y++) {
      const row = out[y].split('');
      if (row[0] === 'K' && !podPlaced(out, y)) {
        row[0] = podChar;
      }
      out[y] = row.join('');
    }
    // trim dourado no nariz (linha superior) T3+
    if (tier >= 3) {
      const top = out[0].split('');
      for (let x = 0; x < top.length; x++) {
        if (out[1] && out[1][x] === 'W' && top[x] !== ' ') top[x] = 'Y';
      }
      out[0] = top.join('');
    }
    // núcleo brilhante central T4+
    if (tier >= 4) {
      const cy = Math.floor(out.length / 2);
      const row = out[cy].split('');
      const cx = Math.floor(w / 2);
      if (row[cx] !== ' ') row[cx] = 'W';
      if (pal.W) { /* W já é branco puro */ }
      out[cy] = row.join('');
    }
    // aura dourada em volta T5
    if (tier >= 5) {
      out.unshift(new Array(w).fill(' ').join(''));
      out.push(new Array(w).fill(' ').join(''));
      const first = out[1].split('');
      for (let x = 0; x < first.length; x++) if (first[x] !== ' ') { first[x] = 'Y'; break; }
      out[1] = first.join('');
    }
    return out;
  }
  function podPlaced(rows, y) { return false; }

  function buildTowerTextures(scene) {
    for (const def of (window.DO3 ? window.DO3.TOWERS_DATA : [])) {
      const base = TOWER_ART[def.id];
      if (!base) continue;
      const pal = towerPalette(def.color);
      for (let tier = 1; tier <= 5; tier++) {
        const key = 'tur_' + def.id + '_t' + tier;
        if (scene.textures.exists(key)) continue;
        const rows = applyTierArt(base, tier, pal);
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const size = drawRows(g, rows, pal);
        g.generateTexture(key, Math.max(16, size.w), Math.max(16, size.h));
        g.destroy();
      }
      // legado: tur_<id>_1 continua existindo (algumas cenas usam)
      if (!scene.textures.exists('tur_' + def.id + '_1')) {
        const rows = applyTierArt(base, 1, pal);
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const size = drawRows(g, rows, pal);
        g.generateTexture('tur_' + def.id + '_1', Math.max(16, size.w), Math.max(16, size.h));
        g.destroy();
      }
    }
  }

  function buildEnemyTextures(scene) {
    const ED = window.DO3 ? window.DO3.ENEMIES_DATA : {};
    for (const type in ED) {
      const def = ED[type];
      const key = 'en_' + type;
      // IDENTIDADE UNIFICADA: força pixel art mesmo se já existir textura vetorial antiga (makeTextures criou 'en_' via drawEnemyShape)
      if(scene.textures.exists(key)){
        try{
          if(typeof scene.textures.remove === 'function') scene.textures.remove(key);
          else if(scene.textures.get(key) && typeof scene.textures.get(key).destroy === 'function') scene.textures.get(key).destroy();
        }catch(e){}
        // fallback: se ainda existe, tenta destroy direto
        try{ if(scene.textures.exists(key) && scene.textures.get(key)) scene.textures.get(key).destroy(); }catch(e){}
      }
      let art = ENEMY_ART[type];
      if (!art) {
        // variantes procedurais reutilizam o arte do tipo base
        const baseT = def.variantOf || type.split('_')[0];
        art = ENEMY_ART[baseT] || ENEMY_ART.drone;
      }
      const pal = enemyPalette(def.col);
      // centra arte dentro de textura quadrada para rotação estável (origin 0.5)
      let maxW = 0; for (const r of art) maxW = Math.max(maxW, r.length);
      const expW = maxW * PX, expH = art.length * PX;
      const dim = Math.ceil(Math.max(expW, expH));
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      const offX = (dim - expW) / 2, offY = (dim - expH) / 2;
      if (offX || offY) { g.save(); g.translateCanvas(offX, offY); }
      drawRows(g, art, pal);
      if (offX || offY) g.restore();
      g.generateTexture(key, dim, dim);
      g.destroy();
    }
  }

  function buildProjectiles(scene) {
    const PAL = getTOK();
    const projPal = {
      K: (TKN && TKN.PIXEL && TKN.PIXEL.K) || '#000000',
      W: (TKN && TKN.PIXEL && TKN.PIXEL.W) || '#ffffff',
      O: (PAL && PAL.bioOrange) || '#fb923c',
      Y: (PAL && PAL.gold) || '#fbbf24',
      R: (PAL && PAL.red) || '#f43f5e',
      G: (PAL && PAL.cyan) || '#bfe3ff',
      L: (PAL && PAL.acid) || '#a3e635',
      C: (PAL && PAL.cyan) || '#38bdf8',
      B: (PAL && PAL.shieldBlue) || '#60a5fa',
      N: (PAL && PAL.green) || '#34d399'
    };
    for (const kind in PROJ_ART) {
      const key = 'px_pr_' + kind;
      if (scene.textures.exists(key)) continue;
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      const size = drawRows(g, PROJ_ART[kind], projPal);
      g.generateTexture(key, size.w, size.h);
      g.destroy();
    }
  }

  function buildFactory(scene) {
    const PAL = getTOK();
    const factoryPal = {
      K: (TKN && TKN.PIXEL && TKN.PIXEL.K) || '#000000',
      W: (TKN && TKN.PIXEL && TKN.PIXEL.W) || '#ffffff',
      G: (PAL && PAL.cyan) || '#bfe3ff',
      D: '#334155', M: (TKN && TKN.PIXEL && TKN.PIXEL.M) || '#94a3b8',
      E: '#475569', N: (PAL && PAL.green) || '#34d399',
      Y: (PAL && PAL.gold) || '#fbbf24'
    };
    for (let lvl = 1; lvl <= 5; lvl++) {
      const key = 'px_factory_l' + lvl;
      if (scene.textures.exists(key)) continue;
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      const size = drawRows(g, factoryArt(lvl), factoryPal);
      g.generateTexture(key, size.w, size.h);
      g.destroy();
    }
  }

  function buildAll(scene) {
    try {
      buildTowerTextures(scene);
      buildEnemyTextures(scene);
      buildProjectiles(scene);
      buildFactory(scene);
    } catch (e) { console.error('[PXART]', e); }
  }

  window.PXART = { build: buildAll, buildAll, PX, ENEMY_ART, TOWER_ART, PROJ_ART, enemyPalette, towerPalette, drawRows, tint };
})();
