'use strict';
/* Defesa da Terra — TILES: grade 44px pixelada por tema, mesma base navy
   Cada tema usa TOKENS.PALETTE mas só varia detalhe, não base.
   Gera texturas de tile 44x44 para fundos de mapa TD + miniaturas.
   Chaves: tile_<theme>_<variant>  (ex: tile_neptune-frontier_a) */
(function(){
  const CELL = 44;
  const THEMES = {
    'neptune-frontier': { bg:'#051425', accent:'#38bdf8', accent2:'#67e8f9', speck:'#0a2a4a' },
    'saturn-rings':     { bg:'#1a1408', accent:'#fbbf24', accent2:'#f59e0b', speck:'#3a2a0a' },
    'jupiter-orbit':    { bg:'#1a0f08', accent:'#fb923c', accent2:'#f97316', speck:'#3a1a08' },
    'asteroid-belt':    { bg:'#0f0a14', accent:'#94a3b8', accent2:'#64748b', speck:'#1e1a2a' },
    'earth-orbit':      { bg:'#051425', accent:'#22d3ee', accent2:'#38bdf8', speck:'#0a2a3a' },
    'solar-system':     { bg:'#020617', accent:'#a78bfa', accent2:'#fbbf24', speck:'#1e1b4b' }
  };

  function hexToNum(hex){ return parseInt(hex.slice(1),16); }

  function drawTile(g, theme, variant){
    const t = THEMES[theme] || THEMES['neptune-frontier'];
    // base navy com variação de cor por tema — bem menos monocromático
    g.fillStyle(hexToNum('#050914'),1); g.fillRect(0,0,CELL,CELL);
    g.fillStyle(hexToNum(t.bg),1); g.fillRect(0,0,CELL,CELL);
    // overlay com accent2 para dar tom quente/frio por tema
    g.fillStyle(hexToNum(t.accent2),0.09); g.fillRect(0,0,CELL,CELL);
    // segundo overlay com speck para profundidade
    g.fillStyle(hexToNum(t.speck),0.07); g.fillRect(0,0,CELL,CELL);
    // borda 1px com accent .16
    g.lineStyle(1, hexToNum(t.accent), 0.16); g.strokeRect(0,0,CELL,CELL);
    // speck pixelado vibrante (10 specks 2x2 com 6 cores por tema)
    let seed = theme.charCodeAt(0)*100 + variant.charCodeAt(0)*13;
    function rnd(){ seed=(seed*9301+49297)%233280; return seed/233280; }
    const speckCols = [t.speck, t.accent, t.accent2, '#fbbf24', '#f43f5e', '#34d399', '#a78bfa'];
    for(let i=0;i<10;i++){
      const x=Math.floor(rnd()*(CELL-3)), y=Math.floor(rnd()*(CELL-3));
      const c = speckCols[i % speckCols.length];
      g.fillStyle(hexToNum(c), 0.24 + rnd()*0.14);
      g.fillRect(x,y,2,2);
      if(i%2===0){ g.fillStyle(hexToNum(c),0.12); g.fillRect(x+2,y,1,1); }
      if(i%4===0){ g.fillStyle(0xffffff,0.14); g.fillRect(x,y+2,1,1); }
    }
    // detalhe central 3x3 com accent + brilho
    g.fillStyle(hexToNum(t.accent),0.13);
    g.fillRect(CELL/2-1, CELL/2-1, 3,3);
    g.fillStyle(0xffffff,0.08); g.fillRect(CELL/2-1, CELL/2-1, 1,1);
    // estrelas fixas
    g.fillStyle(0xffffff,0.22); g.fillRect(8,8,1,1); g.fillRect(CELL-8, 12,1,1); g.fillRect(14, CELL-10,1,1);
  }
  function drawPathTile(g, theme){
    const t = THEMES[theme] || THEMES['neptune-frontier'];
    // path tile pixel art: corredor 44px (largura original) — não mais largo, só mais comprido via rotas
    g.fillStyle(hexToNum('#162649'),1); g.fillRect(0,0,CELL,CELL);
    g.fillStyle(hexToNum('#1e3a5f'),1); g.fillRect(2,2,CELL-4,CELL-4);
    g.fillStyle(hexToNum('#1a2a4a'),0.85); g.fillRect(4,4,CELL-8,CELL-8);
    g.lineStyle(1, hexToNum(t.accent), 0.42); g.strokeRect(0,0,CELL,CELL);
    g.lineStyle(1, hexToNum('#fbbf24'), 0.08); g.strokeRect(1,1,CELL-2,CELL-2);
    g.fillStyle(hexToNum(t.accent), 0.14); g.fillRect(CELL/2-2, CELL/2-2, 4,4);
    g.fillStyle(hexToNum(t.accent), 0.28); g.fillRect(CELL/2-1, CELL/2-1, 2,2);
    g.fillStyle(hexToNum(t.accent2), 0.16); g.fillRect(4,4,2,2); g.fillRect(CELL-6,4,2,2); g.fillRect(4,CELL-6,2,2); g.fillRect(CELL-6,CELL-6,2,2);
  }

  function buildAll(scene){
    if(!scene || !scene.make) return;
    for(const theme in THEMES){
      for(const v of ['a','b']){
        const key='tile_'+theme+'_'+v;
        if(scene.textures.exists(key)) continue;
        const g=scene.make.graphics({x:0,y:0,add:false});
        drawTile(g, theme, v);
        g.generateTexture(key, CELL, CELL);
        g.destroy();
      }
      // path tile pixel art para cada tema — força regen se já existir (nova versão mais clara)
      const pathKey='tile_path_'+theme;
      if(scene.textures.exists(pathKey)){
        try{ scene.textures.remove(pathKey); }catch(e){ try{ scene.textures.get(pathKey).destroy(); }catch(e2){} }
      }
      {
        const g=scene.make.graphics({x:0,y:0,add:false});
        drawPathTile(g, theme);
        g.generateTexture(pathKey, CELL, CELL);
        g.destroy();
      }
      // bg tile genérico para board (usa variant a) — força regen também
      const bgKey='tile_bg_'+theme;
      if(scene.textures.exists(bgKey)){
        try{ scene.textures.remove(bgKey); }catch(e){ try{ scene.textures.get(bgKey).destroy(); }catch(e2){} }
      }
      {
        const g=scene.make.graphics({x:0,y:0,add:false});
        drawTile(g, theme, 'a');
        g.generateTexture(bgKey, CELL, CELL);
        g.destroy();
      }
      // miniatura 44*3 para preview cards (pixel art)
      const keyMini='tile_'+theme+'_mini';
      if(scene.textures.exists(keyMini)) continue;
      const g2=scene.make.graphics({x:0,y:0,add:false});
      // fundo navy -> bg com pixel grid
      g2.fillStyle(hexToNum(THEMES[theme].bg),1); g2.fillRect(0,0,132,88);
      g2.fillStyle(hexToNum('#050914'),0.55); g2.fillRect(0,0,132,88);
      // grid pixel 1px a cada 22px (metade da célula)
      g2.lineStyle(1, hexToNum(THEMES[theme].accent),0.15);
      for(let x=0;x<132;x+=22) g2.moveTo(x,0), g2.lineTo(x,88);
      for(let y=0;y<88;y+=22) g2.moveTo(0,y), g2.lineTo(132,y);
      g2.strokePath();
      // path preview: desenha 3 blocos centrais como exemplo
      g2.fillStyle(hexToNum('#0d1526'),0.9); g2.fillRect(10,38,44,12); g2.fillRect(54,38,44,12); g2.fillRect(76,26,12,24);
      g2.lineStyle(1, hexToNum(THEMES[theme].accent),0.35); g2.strokeRect(10,38,44,12); g2.strokeRect(54,38,44,12);
      g2.generateTexture(keyMini,132,88);
      g2.destroy();
    }
  }

  // Background helpers para DOM/CSS
  function cssForTheme(theme){
    const t=THEMES[theme]||THEMES['neptune-frontier'];
    return {
      bg: 'radial-gradient(900px 500px at 50% 0%, '+t.bg+' 0%, #050914 65%, #030712 100%)',
      accent: t.accent,
      speck: t.speck
    };
  }

  window.TILES = { THEMES, buildAll, cssForTheme, CELL };
})();
