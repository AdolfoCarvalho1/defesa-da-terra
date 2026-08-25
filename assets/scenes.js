/* Defesa Orbital v3 — Lógica de jogo (headless) + Cenas Phaser 3 */
'use strict';
(function () {
  const D = window.DO3;
  const CELL = D.CELL_SIZE, COLS = D.COLS, ROWS = D.ROWS;
  const BW = D.BOARD_W, BH = D.BOARD_H;
  const SND = (typeof window !== 'undefined' && window.AudioSys) ||
    { ensure(){}, unlock(){}, setMuted(){}, musicTick(){}, tone(){}, noiseHit(){}, shoot(){}, gatlingTick(){},
      laserStart(){}, laserStop(){}, laserStopAll(){}, explosion(){}, ui(){}, uiBack(){}, buy(){}, upgrade(){},
      error(){}, coin(){}, lifeLost(){}, leak(){}, waveStart(){}, bossAlert(){}, superFire(){}, victory(){},
      defeat(){}, achievement(){}, star(){}, build(){}, sell(){} };

  /* ================= NÚCLEO DE LÓGICA (sem Phaser — testável headless) ================= */

  function uid() { return ++STATE_SEQ; }
  let STATE_SEQ = 0;

  D.Save.load();

  function techLvl(id) { return D.Save.techLevel(id); }

  function createState(mapIdx, diffKey, endless) {
    const map = D.MAPS_DATA[mapIdx];
    const diff = D.DIFFICULTIES[diffKey] || D.DIFFICULTIES.normal;
    const routes = map.routes.map(wp => D.wpToPixels(wp));
    const lengths = routes.map(D.getPathLength);
    const airPts = [
      { x: -24, y: routes[0][0].y },
      { x: BW + 24, y: routes[0][routes[0].length - 1].y }
    ];
    const livesMax = Math.max(1, Math.round((20 + techLvl('base_hp') * 5) * diff.livesMul));
    const cdMul = 1 - techLvl('super_cd') * 0.12;
    const S = {
      id: uid(), mapIdx, map, diff, endless,
      routes, routeLengths: lengths,
      blocked: D.getPathBlockedCells(map.routes),
      airPts, airLen: Math.hypot(airPts[1].x - airPts[0].x, airPts[1].y - airPts[0].y),
      time: 0, state: 'idle', wave: 0, waveQueue: [], waveStartTime: 0,
      credits: Math.round(350 * diff.goldMul) + techLvl('start_gold') * 60,
      creditsEarned: 0, livesMax, lives: livesMax,
      enemies: [], towers: [], projectiles: [], vortices: [],
      occupied: {}, spawnCounter: 0,
      powers: {
        ion: { key: 'ion', cd: 0, maxCd: D.SUPERS.ion.maxCd * cdMul },
        emp: { key: 'emp', cd: 0, maxCd: D.SUPERS.emp.maxCd * cdMul },
        vortex: { key: 'vortex', cd: 0, maxCd: D.SUPERS.vortex.maxCd * cdMul },
        overdrive: { key: 'overdrive', cd: 0, maxCd: D.SUPERS.overdrive.maxCd * cdMul, dur: 0 }
      },
      kills: 0, leakCounts: {}, leakedFlying: false, leaks: 0,
      parts: 0, // v3 PIXEL FASE 5: recurso PEÇAS ⚙
      enemyHpLevel: 0, // v3 PIXEL FASE 5: laboratório Hivemind (por run)
      endlessHpMul: 1, autoWaveTimer: 0, autoNext: false,
      activeBoss: null, hitStop: 0, result: null, chrono: 0,
      combo: 0, comboTimer: 0, comboMax: 0,
      mutBuffs: {}, mutChoices: null, pendingMut: false, mutHistory: [],
      overdriveDmg: 0,
      events: []
    };
    return S;
  }
  function startNewGame(mapIdx, diffKey, endless) { return createState(mapIdx, diffKey, endless); }

  function ev(S, e) { S.events.push(e); }

  function hpMultiplier(S) {
    // v3 PIXEL FASE 5: laboratório Hivemind soma +12% HP por nível na run
    return (1 + S.mapIdx * 0.25 + S.wave * 0.12) * S.diff.hpMul * S.endlessHpMul * (1 + (S.enemyHpLevel || 0) * D.HIVEMIND.hpAdd);
  }

  function spawnEnemy(S, type) {
    let def = D.ENEMIES_DATA[type];
    if (!def) return null;
    // ULTRA: escolhe variação procedural da mesma família (hp/spd/shield/style)
    // Se type é variante, usa direto; se é base, sorteia entre variantes da família
    if(!def.variantOf){
      // coleta variantes da família
      const fam = [];
      for(const k in D.ENEMIES_DATA){ const v=D.ENEMIES_DATA[k]; if(v.variantOf===type || k===type) fam.push(v); }
      if(fam.length>1){
        // peso: waves altas pegam variantes mais fortes
        const tier = Math.min(fam.length-1, Math.floor(S.wave/3 + (S.endless? S.wave/9 : 0) + Math.random()*2));
        // ordena por hp
        fam.sort((a,b)=>a.hp-b.hp);
        const pick = fam[Math.min(fam.length-1, tier + Math.floor(Math.random()*2))];
        if(pick && Math.random()<0.72) def = pick;
      }
    }
    const mul = hpMultiplier(S);
    const routeIdx = S.spawnCounter++ % S.routes.length;
    const flying = !!def.flying;
    const totalLen = flying ? S.airLen : S.routeLengths[routeIdx];
    const e = {
      eid: uid(), type, type_key: type, defRef: def,
      label: def.label, col: def.col, r: def.r, shape: def.shape,
      hp: def.hp * mul, maxHp: def.hp * mul,
      shield: (def.shield || 0) * mul, maxShield: (def.shield || 0) * mul,
      dist: 0, totalLen, progress: 0, routeIdx, flying,
      x: -30, y: flying ? S.airPts[0].y : S.routes[routeIdx][0].y,
      dirAngle: 0, speed: def.spd, armor: def.armor || 0,
      slowTimer: 0, slowFactor: 1, stunTimer: 0, cryoVuln: 0,
      poisonTimer: 0, poisonDps: 0, poisonBy: null,
      burnTimer: 0, burnDps: 0, markedTimer: 0,
      healCooldown: 0, stealthPhase: 0, raged: false,
      flash: 0, dead: false, leaked: false
    };
    S.enemies.push(e);
    if (def.isBoss) {
      S.activeBoss = e;
      ev(S, { t: 'bossSpawn', name: def.label });
      SND.bossAlert();
    } else {
      ev(S, { t: 'spawnFx', x: e.x, y: e.y, flying });
    }
    return e;
  }

  function canHitAir(tower) {
    const def = tower.defRef || tower.def;
    // FIX: naves vs naves — todas as torres de combate acertam voadores (sem sentido ter nave que não acerta nave)
    if (def.kind === 'factory') return false;
    if (def.kind === 'buff') return false; // amp é suporte, não atira
    return true;
  }

  function getTowerStats(S, t) {
    const def = t.defRef || t.def;
    const lvl = t.level;
    // 50-level balanced scaling (linear + mild expo, não explode em 1.32^49)
    let dmg = def.dmg * (1 + (lvl - 1) * 0.22) * Math.pow(1.038, lvl - 1);
    let rng = def.rng + (lvl - 1) * 3.2;
    let rate = def.rate === 0 ? 0 : def.rate * (1 + (lvl - 1) * 0.018) * Math.pow(1.012, lvl - 1);

    dmg *= 1 + techLvl('global_dmg') * 0.05 + ((S.mutBuffs && S.mutBuffs.dmg) || 0);
    rng *= 1 + techLvl('global_rng') * 0.06 + ((S.mutBuffs && S.mutBuffs.rng) || 0);
    rate *= 1 + ((S.mutBuffs && S.mutBuffs.rate) || 0);

    const spec = t.specBranch === 'A' ? def.specA : (t.specBranch === 'B' ? def.specB : null);
    if (spec) {
      if (spec.dmgMul) dmg *= spec.dmgMul;
      if (spec.rngAdd) rng += spec.rngAdd;
      if (spec.rateMul) rate *= spec.rateMul;
    }

    // SKILLS por nave: aplica efeito acumulado a cada 4 níveis
    let skillPierce = 0, skillCrit = 0, skillShield = 0, skillMulti = 0;
    const skills = def.skills || [];
    for (const sk of skills) {
      if (t.level < sk.lvl || !sk.eff) continue;
      const ef = sk.eff;
      if (ef.dmgMul) dmg *= ef.dmgMul;
      if (ef.dmgMul2) dmg *= ef.dmgMul2;
      if (ef.rateMul) rate *= ef.rateMul;
      if (ef.rateMul2) rate *= ef.rateMul2;
      if (ef.rateMul3) rate *= ef.rateMul3;
      if (ef.rngMul) rng *= ef.rngMul;
      if (ef.rngMul2) rng *= ef.rngMul2;
      if (ef.pierce) skillPierce += ef.pierce;
      if (ef.crit) skillCrit += ef.crit;
      if (ef.shield) skillShield += ef.shield;
      if (ef.multi) skillMulti += ef.multi;
      if (ef.splash && def.splash) var _sp = ef.splash; // leve splash add
    }

    let buffDmg = 0, buffRng = 0, buffRate = 0;
    let ampCritAdd = 0;
    const tTier = D.getTier(t.level);
    for (const other of S.towers) {
      const od = other.defRef || other.def;
      if (od.id !== 'amp' || other === t) continue;
      // v3 PIXEL FASE 6: amp T2 anel 20% maior
      const odTier = D.getTier(other.level);
      const odRng = (od.rng + (other.level - 1) * 10) * ((D.TIER_LOGIC.amp[odTier] && D.TIER_LOGIC.amp[odTier].eff.ringMul) || 1);
      if (Math.hypot(other.x - t.x, other.y - t.y) <= odRng) {
        buffDmg = Math.max(buffDmg, other.specBranch === 'A' ? 0.45 : 0.25 + (other.level - 1) * 0.04);
        buffRng = Math.max(buffRng, other.specBranch === 'B' ? 0.40 : 0);
        buffRate = Math.max(buffRate, other.specBranch === 'A' ? 0.25 : 0);
        // v3 PIXEL FASE 6: amp T3/T4/T5 extras
        if (odTier >= 3) buffRate += D.TIER_LOGIC.amp[3].eff.rateAdd;
        if (odTier >= 4) buffDmg += D.TIER_LOGIC.amp[4].eff.dmgAdd;
        if (odTier >= 5) ampCritAdd = Math.max(ampCritAdd, D.TIER_LOGIC.amp[5].eff.critAdd);
      }
    }
    dmg *= 1 + buffDmg; rng *= 1 + buffRng; rate *= 1 + buffRate;
    skillCrit += ampCritAdd;
    // v3 PIXEL FASE 6: lógica por tier da própria torre
    const tl = D.TIER_LOGIC[def.id] && D.TIER_LOGIC[def.id][tTier] ? D.TIER_LOGIC[def.id][tTier].eff : null;
    if (tl) {
      if (tl.pierce) skillPierce += tl.pierce;               // gatling T4
      if (tl.critAdd) skillCrit += tl.critAdd;               // sniper T4 / amp T5 vizinhas
      if (tl.comboRate && S.combo) rate *= 1 + Math.min(tl.comboRate, S.combo * 0.01); // gatling T5
      if (def.kind === 'beam') {
        // laser T4 fásico: metade do dano ignora escudo (aplicado no tick abaixo via flag)
        if (tl.shieldPhase) t._shieldPhase = tl.shieldPhase; else t._shieldPhase = null;
      }
    } else if (def.kind === 'beam') t._shieldPhase = null;
    if (S.powers && S.powers.overdrive && S.powers.overdrive.dur > 0) { rate *= D.SUPERS.overdrive.rateMul; if(S.mutBuffs && S.mutBuffs.odDmg) dmg *= 1 + S.mutBuffs.odDmg; }

    // aplica skills de pierce/crit/multi no retorno
    const baseSplash = (def.splash || (spec && spec.splash) || 0);
    return {
      dmg, rng, rate,
      splash: baseSplash,
      canHitAir: canHitAir(t),
      pierceBonus: skillPierce,
      critBonus: skillCrit,
      shieldBonus: skillShield,
      multiBonus: skillMulti
    };
  }

  function computeDps(t) {
    const def = t.defRef || t.def;
    const fake = Object.assign({}, t);
    const st = getTowerStats({ towers: [] }, fake);
    if (def.kind === 'beam') return st.dmg;
    if (def.kind === 'slow' || def.kind === 'dot' || def.kind === 'buff') return st.dmg * st.rate;
    return st.dmg * st.rate;
  }

  function findBestTarget(S, tower, stats) {
    let best = null;
    for (const e of S.enemies) {
      if (e.dead || e.leaked) continue;
      if (e.type === 'phase' && e.stealthPhase > 1.8) continue;
      if (e.flying && !stats.canHitAir) continue;
      const d = Math.hypot(e.x - tower.x, e.y - tower.y);
      if (d <= stats.rng) {
        if (!best) { best = e; best._d = d; continue; }
        switch (tower.targetMode) {
          case 'STRONGEST': if (e.hp + e.shield > best.hp + best.shield) best = e; break;
          case 'WEAKEST': if (e.hp + e.shield < best.hp + best.shield) best = e; break;
          case 'CLOSEST': if (d < best._d) { best = e; best._d = d; } break;
          case 'FASTEST': if (e.speed > best.speed) best = e; break;
          default: if (e.progress > best.progress) best = e;
        }
        if (best === e) best._d = d;
      }
    }
    if (best) delete best._d;
    return best;
  }

  function damageEnemy(S, e, amount, opt) {
    opt = opt || {};
    if (e.dead || e.leaked) return;
    if(!opt.crit && !opt.pure && S.mutBuffs && S.mutBuffs.crit && Math.random() < S.mutBuffs.crit){
      opt = Object.assign({}, opt, { crit: true });
      amount *= 2.2;
    }
    let finalDmg = amount;
    // v3 PIXEL FASE 6: cannon T3 perfura armadura; cryo T3: lentos recebem +25%
    const shooterTier = opt.src ? D.getTier(opt.src.level) : 0;
    const shooterLogic = (opt.src && D.TIER_LOGIC[opt.src.defRef.id]) ? D.TIER_LOGIC[opt.src.defRef.id][shooterTier] : null;
    if (!opt.pure && e.armor > 0) {
      const ap = (shooterLogic && shooterLogic.eff && shooterLogic.eff.armorPierce) || 0;
      finalDmg = Math.max(1, finalDmg - Math.max(0, e.armor - ap));
    }
    if (opt.src && shooterLogic && shooterLogic.eff.vsArmor) finalDmg *= shooterLogic.eff.vsArmor; // rail T2 vs blindados
    if (opt.sb && e.shield > 0) finalDmg *= 4;
    if (!opt.pure && e.cryoVuln > 0) finalDmg *= 1.4;
    else if (!opt.pure && e.slowTimer > 0) { // v3 PIXEL FASE 6: cryo T3 quebra total
      const src = opt.src;
      if (src && D.TIER_LOGIC.cryo[D.getTier(src.level)] && D.TIER_LOGIC.cryo[D.getTier(src.level)].eff.chillVuln && src.defRef.id === 'cryo') finalDmg *= 1.25;
    }
    if (e.markedTimer > 0) finalDmg *= 1.35;
    e.flash = 0.08;
    if (e.shield > 0) {
      e.shield -= finalDmg;
      if (e.shield < 0) { e.hp += e.shield; e.shield = 0; }
      ev(S, { t: 'float', x: e.x, y: e.y - 10, txt: String(Math.round(finalDmg)), col: '#38bdf8', size: 9 });
    } else {
      e.hp -= finalDmg;
      if (finalDmg >= 3) {
        ev(S, { t: 'float', x: e.x, y: e.y - 10, txt: (opt.crit ? '\u00bb' : '') + Math.round(finalDmg), col: opt.crit ? '#fbbf24' : '#dbe7ff', size: opt.crit ? 13 : 10, crit: !!opt.crit });
      }
    }
    if (e.hp <= 0) killEnemy(S, e);
  }

  function killEnemy(S, e) {
    if (e.dead) return;
    e.dead = true;
    S.kills++;
    // v3 PIXEL FASE 4: carga do super automático por tipo de nave (= res do inimigo)
    const killerKind = e.poisonBy && !e.poisonBy.defRef.kind ? e.poisonBy.defRef.id : null;
    let charged = false;
    for (const t of S.towers) {
      if (t.defRef.kind === 'factory') continue;
      // credita na torre do próprio tipo OU na que matou por veneno
      if (t.defRef.id === e.type_key || (killerKind && t.defRef.id === killerKind)) { t.superCharge = (t.superCharge || 0) + (e.defRef.res || 1); charged = true; }
      else if (!charged && t.superCharge !== undefined) continue;
    }
    if (charged) ev(S, { t: 'float', x: e.x, y: e.y - 30, txt: '+carga', col: '#fde047', size: 9 });
    S.combo = Math.min(D.COMBO.maxStacks, (S.combo||0)+1);
    S.comboTimer = D.COMBO.window;
    S.comboMax = Math.max(S.comboMax||0, S.combo);
    const comboBonus = 1 + (S.combo * D.COMBO.goldPerStack);
    const mutGold = 1 + ((S.mutBuffs && S.mutBuffs.gold) || 0);
    // v3 PIXEL FASE 5: laboratório Hivemind dá +8% ouro por nível
    const hiveGold = 1 + (S.enemyHpLevel || 0) * D.HIVEMIND.goldAdd;
    const goldVal = Math.round(e.defRef.gold * (1 + techLvl('salvage') * 0.15) * mutGold * comboBonus * hiveGold);
    S.credits += goldVal;
    S.creditsEarned += goldVal;
    if(S.combo >= 5) ev(S, { t:'combo', n:S.combo, mult: comboBonus });
    if(S.combo>=10 && S.combo%5===0) ev(S, { t:'float', x:e.x, y:e.y-28, txt:'COMBO x'+S.combo+'! +' + Math.round((comboBonus-1)*100)+'%', col:'#fbbf24', size:14 });
    if(e.defRef.isBoss) S.chrono = 0.18;
    else if(e.defRef.r >= 12) S.chrono = 0.04;

    if (S.kills === 1) unlockAchievement('first_blood');
    else if (S.kills === 100) unlockAchievement('kills_100');
    else if (S.kills === 500) unlockAchievement('kills_500');
    if (S.credits >= 2000) unlockAchievement('rich');
    if (e.defRef.isBoss) unlockAchievement('boss_slayer');

    ev(S, { t: 'float', x: e.x, y: e.y - 18, txt: '+' + goldVal, col: '#fbbf24', size: 12 });
    ev(S, { t: 'boom', x: e.x, y: e.y, r: e.defRef.r * 2.5, col: e.defRef.col, big: !!e.defRef.isBoss, flying: e.flying });
    SND.explosion(e.defRef.isBoss ? 2 : 0.6 + e.defRef.r / 20);

    if (e.defRef.onDeathStun) {
      for (const t of S.towers) {
        if (Math.hypot(t.x - e.x, t.y - e.y) < 85) t.cooldown = Math.max(t.cooldown, 2.0);
      }
      ev(S, { t: 'ring', x: e.x, y: e.y, maxR: 60, col: '#f43f5e' });
    }

    if (e.defRef.splits) {
      for (let i = 0; i < 2; i++) {
        const mini = spawnEnemyAt(S, 'mini', e.dist + (i === 0 ? 8 : -8), e.routeIdx, e.x, e.y, e.dirAngle, e.flying);
        if (mini) S.enemies.push(mini);
      }
    }

    if (e.defRef.plagueCheck && e.poisonTimer > 0 && e.poisonBy) {
      for (const o of S.enemies) {
        if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 70) {
          o.poisonTimer = 3.5; o.poisonDps = e.poisonDps; o.poisonBy = e.poisonBy;
          ev(S, { t: 'ring', x: e.x, y: e.y, maxR: 70, col: '#a3e635' });
          break;
        }
      }
    }

    if (e.defRef.isBoss) {
      S.activeBoss = null;
      S.hitStop = 0.06;
      ev(S, { t: 'bossDeath', x: e.x, y: e.y, name: e.label });
      ev(S, { t: 'shake', mag: 16 });
      ev(S, { t: 'banner', txt: 'NAVE-MÃE DESTRUÍDA!', col: '#fbbf24', strong: true });
    }
  }

  function spawnEnemyAt(S, type, dist, routeIdx, x, y, angle, flying) {
    const def = D.ENEMIES_DATA[type];
    if (!def) return null;
    return {
      eid: uid(), type, type_key: type, defRef: def,
      label: def.label, col: def.col, r: def.r, shape: def.shape,
      hp: 18, maxHp: 18, shield: 0, maxShield: 0,
      dist: Math.max(0, dist), totalLen: flying ? S.airLen : S.routeLengths[routeIdx],
      progress: 0, routeIdx, flying: !!flying,
      x, y, dirAngle: angle, speed: def.spd, armor: 0,
      slowTimer: 0, slowFactor: 1, stunTimer: 0, cryoVuln: 0,
      poisonTimer: 0, poisonDps: 0, poisonBy: null,
      burnTimer: 0, burnDps: 0, markedTimer: 0,
      healCooldown: 0, stealthPhase: 0, raged: false,
      flash: 0, dead: false, leaked: false
    };
  }

  /* ---- Disparo de torre por tipo ---- */
  // v3 PIXEL FASE 3: helper único de projétil bullet (usado por cannon/gatling em qualquer tier)
  function spawnBullet(S, t, def, target, stats, spread, speed) {
    const isFlak = t.specBranch === 'B' && def.specB && def.specB.multi;
    let dmg = stats.dmg;
    if (def.id === 'gatling' && t.specBranch === 'A') dmg *= 1 + Math.min(2.5, t.rampTime * 0.8);
    if (isFlak) dmg = stats.dmg * 0.6;
    let isCritS = false;
    if (stats.critBonus && Math.random() < stats.critBonus) { isCritS = true; dmg *= 1.5; }
    S.projectiles.push({
      kind: 'bullet', x: t.x, y: t.y, targetId: target.eid,
      vx: Math.cos(t.aimAngle + spread) * speed, vy: Math.sin(t.aimAngle + spread) * speed,
      dmg, col: def.color, life: 1.2,
      pierce: ((t.specBranch === 'B' && def.specB && def.specB.pierce) || 1) + (stats.pierceBonus || 0),
      stun: (t.specBranch === 'B' && def.specB && def.specB.stun) || 0,
      crit: isCritS, hitIds: {}, tower: t, src: t
    });
  }
  function fireTower(S, t, target, stats) {
    const def = t.defRef || t.def;
    t.aimAngle = Math.atan2(target.y - t.y, target.x - t.x);
    t.recoil = 1.0;
    t.flash = 0.08;
    ev(S, { t: 'muzzle', x: t.x, y: t.y, angle: t.aimAngle, col: def.color, kind: def.kind });

    if (def.kind === 'bullet') {
      SND.shoot('bullet', t.specBranch);
      const tier = D.getTier(t.level);
      const isFlak = t.specBranch === 'B' && def.specB && def.specB.multi;
      const pat = D.SHOT_PATTERNS[def.id] || null;
      let count = isFlak ? def.specB.multi : 1;
      if (stats.multiBonus) count += stats.multiBonus;
      // v3 PIXEL FASE 3: cannon leque por tier / gatling rajada por tier
      if (pat && !isFlak && def.id === 'cannon') count = Math.max(count, pat.multi[tier - 1]);
      if (pat && !isFlak && def.id === 'gatling') count = Math.max(count, pat.burst[tier - 1]);
      for (let i = 0; i < count; i++) {
        const spread = isFlak ? (i - (count - 1) / 2) * 0.18 : (count > 1 ? (i - (count - 1) / 2) * 0.12 : 0);
        spawnBullet(S, t, def, target, stats, spread, 380);
      }
      SND.gatlingTick();
    } else if (def.kind === 'splash') {
      SND.shoot('splash');
      const tier = D.getTier(t.level);
      const spec = t.specBranch === 'A' ? def.specA : (t.specBranch === 'B' ? def.specB : null);
      const burn = !!(spec && spec.burn) || !!(D.TIER_LOGIC[def.id] && D.TIER_LOGIC[def.id][tier] && D.TIER_LOGIC[def.id][tier].eff.burn && tier >= 2);
      const pat = D.SHOT_PATTERNS.missile;
      const mirv = pat.mirv[tier - 1];
      const salvoN = Math.max((spec && spec.salvos) || 0, pat.salvo[tier - 1]);
      const mkMissile = (tgt, delay, isSub) => S.projectiles.push({
        kind: 'missile', x: t.x, y: t.y, targetId: tgt.eid, speed: 300,
        dmg: stats.dmg * ((spec && spec.dmgMul) || 1), splash: stats.splash,
        hitAir: stats.canHitAir || tier >= 4,
        burn, col: def.color, life: 2.2, delay, tower: t,
        mirv: isSub ? 0 : (mirv ? 3 : ((spec && spec.salvos && t.specBranch === 'B') || 0)), // T5 MIRV / spec B frag
        tier
      });
      for (let i = 0; i < Math.max(1, salvoN); i++) mkMissile(target, i * 0.12, false);
    } else if (def.kind === 'slow') {
      SND.shoot('slow');
      const tier = D.getTier(t.level);
      const spec = t.specBranch === 'A' ? def.specA : null;
      const slowVal = t.specBranch === 'A' ? (def.specA.slowVal || 0.75) : 0.5;
      const pulses = D.SHOT_PATTERNS.cryo.pulses[tier - 1] || 1; // v3 PIXEL FASE 3: anéis por tier
      for (let ring = 0; ring < pulses; ring++) {
        ev(S, { t: 'ring', x: t.x, y: t.y, maxR: stats.rng * (0.6 + 0.4 * ((ring + 1) / pulses)), col: '#38bdf8' });
      }
      for (const e of S.enemies) {
        if (e.dead || Math.hypot(e.x - t.x, e.y - t.y) > stats.rng) continue;
        if (!e.defRef.slowImmune) {
          e.slowTimer = 2.2; e.slowFactor = Math.min(slowVal, e.slowFactor || 1) * (pulses >= 4 ? 0.7 : 1);
          if (spec && spec.physDebuff) e.cryoVuln = 2.2;
          // T2 cryo logic: chance de congelar
          const cl = D.TIER_LOGIC.cryo && D.TIER_LOGIC.cryo[tier];
          if (cl && cl.eff.freezeChance && tier >= 2 && Math.random() < cl.eff.freezeChance) e.stunTimer = Math.max(e.stunTimer, cl.eff.freezeDur || 0.8);
        }
        damageEnemy(S, e, stats.dmg * 0.5 * pulses);
      }
      if (tier >= 5) ev(S, { t: 'banner', txt: 'NEVASCA!', col: '#38bdf8' });
    } else if (def.kind === 'chain') {
      SND.shoot('chain');
      const tier = D.getTier(t.level);
      const spec = t.specBranch === 'A' ? def.specA : (t.specBranch === 'B' ? def.specB : null);
      // v3 PIXEL FASE 3: cadeia cresce por tier
      const maxChains = Math.max(D.SHOT_PATTERNS.tesla.chain[tier - 1], def.chain + ((spec && spec.chainAdd) || 0)) + ((S.mutBuffs && S.mutBuffs.chain)||0)*2;
      const sb = !!(spec && spec.shieldBuster);
      const stunCh = (spec && spec.stunChance) || 0;
      let current = target;
      const hitList = [current];
      const pts = [{ x: t.x, y: t.y }, { x: current.x, y: current.y }];
      for (let c = 0; c < maxChains; c++) {
        damageEnemy(S, current, stats.dmg * Math.pow(0.78, c), { sb, src: t });
        if (stunCh && Math.random() < stunCh && !current.dead) current.stunTimer = Math.max(current.stunTimer, 0.4);
        let next = null, nextDist = 100;
        for (const other of S.enemies) {
          if (hitList.indexOf(other) < 0 && !other.dead && !other.leaked) {
            const d = Math.hypot(other.x - current.x, other.y - current.y);
            if (d < nextDist) { nextDist = d; next = other; }
          }
        }
        if (!next) break;
        hitList.push(next); pts.push({ x: next.x, y: next.y });
        current = next;
      }
      ev(S, { t: 'chain', pts });
    } else if (def.kind === 'snipe') {
      SND.shoot('snipe');
      const tier = D.getTier(t.level);
      const spec = t.specBranch === 'A' ? def.specA : (t.specBranch === 'B' ? def.specB : null);
      const critCh = (spec && spec.critChance) || 0.25;
      const critMul = (spec && spec.critMul) || 2.2;
      // v3 PIXEL FASE 3: alvos por tier (T4=2, T5=3) + tracer por tier
      const nTargets = D.SHOT_PATTERNS.sniper.targets[tier - 1] || 1;
      const targets = [target];
      for (const e of S.enemies) {
        if (targets.length >= nTargets) break;
        if (e !== target && !e.dead && !targets.includes(e)) targets.push(e);
      }
      for (const tgt of targets) {
        const isCrit = Math.random() < critCh;
        if (spec && spec.exec && (tgt.hp / tgt.maxHp) < spec.exec) {
          damageEnemy(S, tgt, tgt.hp + tgt.shield + 99999, { pure: true, crit: true, src: t });
        } else {
          damageEnemy(S, tgt, isCrit ? stats.dmg * critMul : stats.dmg, { crit: isCrit, src: t });
        }
        if (spec && spec.spotter && !tgt.dead) tgt.markedTimer = 4.0;
        ev(S, { t: 'tracer', x1: t.x, y1: t.y, x2: tgt.x, y2: tgt.y, col: def.color, w: D.SHOT_PATTERNS.sniper.tracer[tier - 1] ? 2.5 + tier * 0.5 : 2 });
      }
    } else if (def.kind === 'dot') {
      SND.shoot('dot');
      const spec = t.specBranch === 'A' ? def.specA : (t.specBranch === 'B' ? def.specB : null);
      for (const e of S.enemies) {
        if (e.dead || Math.hypot(e.x - t.x, e.y - t.y) > stats.rng) continue;
        e.poisonTimer = 3.5; e.poisonDps = stats.dmg; e.poisonBy = t;
        if (spec && spec.armorStrip) e.armor = 0;
      }
      ev(S, { t: 'ring', x: t.x, y: t.y, maxR: stats.rng, col: '#a3e635' });
    } else if (def.kind === 'pierce') {
      SND.shoot('pierce');
      const tier = D.getTier(t.level);
      const spec = t.specBranch === 'A' ? def.specA : null;
      // v3 PIXEL FASE 3: lanças por tier; T4 perfura total; T5 lança estelar (linha no mapa todo)
      const pat = D.SHOT_PATTERNS.rail;
      const starLine = pat.star[tier - 1] || (D.TIER_LOGIC.rail && D.TIER_LOGIC.rail[5].eff.starLine && tier >= 5);
      const fullPierce = pat.full[tier - 1];
      const beamLen = starLine ? BW * 1.5 : ((fullPierce || (spec && spec.fullPierce)) ? BW : stats.rng + 30);
      const angles = [];
      const beamsN = pat.full[tier-1] || pat.star[tier-1] ? 1 : pat.beams[tier - 1];
      for (let b = 0; b < beamsN; b++) angles.push(t.aimAngle + (b - (beamsN - 1) / 2) * 0.22);
      for (const ang of angles) {
        const dx = Math.cos(ang), dy = Math.sin(ang);
        for (const e of S.enemies) {
          const ox = e.x - t.x, oy = e.y - t.y;
          const proj = ox * dx + oy * dy;
          if (proj > 0 && proj <= beamLen && Math.abs(ox * (-dy) + oy * dx) < (starLine ? 26 : 18)) {
            damageEnemy(S, e, stats.dmg, { pure: true });
            // T3 rail logic: atordoa
            const rl = D.TIER_LOGIC.rail && D.TIER_LOGIC.rail[tier];
            if (rl && rl.eff.stunDur) e.stunTimer = Math.max(e.stunTimer, rl.eff.stunDur);
          }
        }
        ev(S, { t: 'tracer', x1: t.x, y1: t.y, x2: t.x + dx * beamLen, y2: t.y + dy * beamLen, col: '#ffffff', w: 4 + tier * 0.6 });
      }
      ev(S, { t: 'shake', mag: 3 + tier });
    }
  }

  /* ---- Supers orbitais ---- */
  function applySuper(S, key, x, y) {
    const p = S.powers[key];
    const meta = D.SUPERS[key];
    if (!p || p.cd > 0) return false;
    p.cd = p.maxCd;
    SND.superFire();
    ev(S, { t: 'banner', txt: meta.name.toUpperCase() + ' ATIVADA!', col: meta.color });
    if (key === 'ion') {
      ev(S, { t: 'ionBeam', x, y, r: meta.radius, life: 1.6 });
      ev(S, { t: 'shake', mag: 14 });
      S.chrono = 0.14;
      try{ SND.superIon(); }catch(e){ SND.superFire(); }
      for (const e of S.enemies) {
        if (!e.dead && Math.hypot(e.x - x, e.y - y) <= meta.radius) { damageEnemy(S, e, meta.dmg, { pure: true, crit: true }); if(!e.dead){ e.burnTimer=3.5; e.burnDps= meta.dmg*0.08; } }
      }
      ev(S, { t:'ring', x, y, maxR: meta.radius*1.4, col:'#38bdf8' });
      ev(S, { t:'ring', x, y, maxR: meta.radius*0.7, col:'#ffffff' });
    } else if (key === 'emp') {
      ev(S, { t: 'emp' });
      ev(S, { t: 'shake', mag: 10 });
      S.chrono=0.10;
      try{ SND.superEmp(); }catch(e){ SND.superFire(); }
      for (const e of S.enemies) {
        e.slowTimer = 5.0; e.slowFactor = 0.03; e.stunTimer = Math.max(e.stunTimer, 1.2);
        if (e.shield > 0) e.shield = Math.max(0, e.shield - e.maxShield * 0.72);
      }
    } else if (key === 'vortex') {
      S.vortices.push({ x, y, r: meta.radius, dps: meta.dps * (1 + (S.combo||0)*0.02), life: meta.dur + ((S.mutBuffs && S.mutBuffs.odDur)||0), tot: meta.dur + ((S.mutBuffs && S.mutBuffs.odDur)||0) });
      ev(S, { t: 'vortexStart', x, y, r: meta.radius, dur: meta.dur });
      try{ SND.superVortex(); }catch(e){ SND.superFire(); }
      S.chrono=0.08;
    } else if (key === 'overdrive') {
      p.dur = meta.dur + ((S.mutBuffs && S.mutBuffs.odDur)||0);
      ev(S, { t: 'overdrive' });
      try{ SND.overdriveOn(); }catch(e){ SND.superFire(); }
      ev(S, { t:'ring', x: BW/2, y:BH/2, maxR: BW*0.6, col:'#fb923c' });
    }
    return true;
  }

  /* ---- v3 PIXEL FASE 4: SUPER AUTOMÁTICO por tipo de nave (carga = abates daquele tipo) ---- */
  function getSuperCharge(S, t) {
    const tier = D.getTier(t.level);
    const need = D.superThreshold(tier);
    const charge = (t.superCharge || 0);
    return { charge, need, pct: Math.min(1, charge / need), ready: charge >= need, tier };
  }
  function forceSuperCharge(S, t, amount) {
    if (!t || !S.towers.includes(t)) return null;
    t.superCharge = (t.superCharge || 0) + (amount == null ? 9999 : amount);
    S._superTestArmed = true; // flag p/ teste: próxima checagem dispara
    return fireAutoSuperIfReady(S, t);
  }
  function fireAutoSuperIfReady(S, t) {
    if (!t || t.defRef.kind === 'factory' || S.state === 'victory' || S.state === 'defeat') return false;
    const sc = getSuperCharge(S, t);
    if (!sc.ready) return false;
    t.superCharge = 0;
    fireAutoSuper(S, t.defRef.id, t);
    return true;
  }
  function fireAutoSuper(S, kind, tower) {
    const meta = D.SUPERS_AUTO[kind];
    if (!meta) return false;
    SND.superFire();
    ev(S, { t: 'banner', txt: '★ ' + meta.name.toUpperCase() + ' — SUPER DE ' + defName(tower).toUpperCase() + '!', col: meta.col || '#fbbf24', strong: true });
    S.autoSupersFired = (S.autoSupersFired || 0) + 1; // contador exposto p/ teste
    ev(S, { t: 'autoSuperFx', x: tower.x, y: tower.y, col: meta.col || '#fbbf24' });
    const alive = () => S.enemies.filter(e => !e.dead && !e.leaked);
    switch (kind) {
      case 'cannon': { // Barragem Orbital: 20 obuses na maior concentração
        let bx = BW / 2, by = BH / 2, bestN = -1;
        for (const e of alive()) {
          let n = 0;
          for (const o of alive()) if (Math.hypot(o.x - e.x, o.y - e.y) < 90) n++;
          if (n > bestN) { bestN = n; bx = e.x; by = e.y; }
        }
        for (let i = 0; i < 20; i++) {
          const ox = bx + (Math.random() - 0.5) * 120, oy = by + (Math.random() - 0.5) * 120;
          let hit = 0;
          for (const e of alive()) if (Math.hypot(e.x - ox, e.y - oy) < 46) { damageEnemy(S, e, tower.damageDealt >= 0 ? 60 + tower.level * 8 : 60); hit++; }
          ev(S, { t: 'boom', x: ox, y: oy, r: 40, col: '#e2e8f0', big: false });
        }
        break;
      }
      case 'gatling': { // Tornado de Chumbo: 360° por 3s em alcance dobrado
        const rng2 = tower.rng !== undefined ? tower.rng : 200; // headless fallback
        let hits = 0;
        // aplicação instantânea em área dobrada (equivalente ao tornado)
        const st = getTowerStats(S, tower);
        for (const e of alive()) {
          if (Math.hypot(e.x - tower.x, e.y - tower.y) <= st.rng * 2) {
            damageEnemy(S, e, st.dmg * 6); hits++;
            if (hits % 4 === 0) ev(S, { t: 'tracer', x1: tower.x, y1: tower.y, x2: e.x, y2: e.y, col: '#fbbf24', w: 2 });
          }
        }
        break;
      }
      case 'laser': { // Prisma Solar: varre a rota inteira por 2.5s → dano em todos na rota principal
        const st = getTowerStats(S, tower);
        for (let d = 0; d < S.routeLengths[0]; d += 14) {
          const p = D.getPosAtDist(S.routes[0], d);
          ev(S, { t: 'spark', x: p.x, y: p.y, col: '#f43f5e' });
        }
        for (const e of alive()) damageEnemy(S, e, st.dmg * 8, { pure: true });
        break;
      }
      case 'missile': { // Enxame MIRV: 16 mísseis nos alvos mais caros
        const sorted = alive().sort((a, b) => (b.defRef.gold) - (a.defRef.gold));
        for (let i = 0; i < 16; i++) {
          const tgt = sorted[i % Math.max(1, sorted.length)];
          if (!tgt) break;
          S.projectiles.push({ kind: 'missile', x: tower.x, y: tower.y, targetId: tgt.eid, speed: 340, dmg: 80 + tower.level * 6, splash: 70, hitAir: true, burn: true, col: '#fb923c', life: 2.5, delay: i * 0.07, tower, mirv: 0 });
        }
        break;
      }
      case 'cryo': { // Era Glacial: congela TODOS 3s
        for (const e of alive()) { if (!e.defRef.slowImmune || e.defRef.isBoss) { e.stunTimer = Math.max(e.stunTimer, 3); } e.slowTimer = 3; e.slowFactor = 0.05; }
        ev(S, { t: 'emp' });
        break;
      }
      case 'tesla': { // Tempestade Final: 12 relâmpagos em cadeia global
        const st = getTowerStats(S, tower);
        for (let i = 0; i < 12; i++) {
          const pool = alive();
          if (!pool.length) break;
          const start = pool[Math.floor(Math.random() * pool.length)];
          let cur = start; const pts = [{ x: start.x, y: start.y }]; const hit = new Set();
          for (let c = 0; c < 4; c++) {
            damageEnemy(S, cur, st.dmg * 2, { pure: true }); hit.add(cur.eid);
            let next = null, nd = 130;
            for (const o of alive()) { if (!hit.has(o.eid)) { const dd = Math.hypot(o.x - cur.x, o.y - cur.y); if (dd < nd) { nd = dd; next = o; } } }
            if (!next) break;
            pts.push({ x: next.x, y: next.y }); cur = next;
          }
          ev(S, { t: 'chain', pts });
        }
        break;
      }
      case 'sniper': { // Sentença: executa os 3 de menor HP
        const weak = alive().sort((a, b) => (a.hp + a.shield) - (b.hp + b.shield)).slice(0, 3);
        for (const e of weak) {
          damageEnemy(S, e, e.hp + e.shield + 99999, { pure: true, crit: true });
          ev(S, { t: 'tracer', x1: tower.x, y1: tower.y, x2: e.x, y2: e.y, col: '#67e8f9', w: 4 });
        }
        break;
      }
      case 'venom': { // Maré Nanopraga: envenena todos 8s
        const st = getTowerStats(S, tower);
        for (const e of alive()) { e.poisonTimer = 8; e.poisonDps = Math.max(st.dmg, 10); e.poisonBy = tower; }
        ev(S, { t: 'ring', x: BW / 2, y: BH / 2, maxR: BW, col: '#a3e635' });
        break;
      }
      case 'amp': { // Sobrecarga Total: +100% dano global 6s (anel dourado)
        S.overdriveBuff = Math.max(S.overdriveBuff || 0, 6);
        ev(S, { t: 'ring', x: BW / 2, y: BH / 2, maxR: BW * 0.7, col: '#fde047' });
        ev(S, { t: 'overdrive' });
        break;
      }
      case 'rail': { // Lança Estelar: 3 linhas perfurantes cruzam o mapa
        const st = getTowerStats(S, tower);
        for (let l = 0; l < 3; l++) {
          const ang = Math.PI * 2 * l / 3 + 0.4;
          const dx = Math.cos(ang), dy = Math.sin(ang);
          for (const e of alive()) {
            const proj = (e.x - BW / 2) * dx + (e.y - BH / 2) * dy;
            if (Math.abs(-(e.x - BW/2) * dy + (e.y - BH/2) * dx) < 30) damageEnemy(S, e, st.dmg * 5, { pure: true });
          }
          ev(S, { t: 'tracer', x1: BW / 2 - dx * BW, y1: BH / 2 - dy * BH, x2: BW / 2 + dx * BW, y2: BH / 2 + dy * BH, col: '#ffffff', w: 6 });
        }
        ev(S, { t: 'shake', mag: 12 });
        break;
      }
    }
    return true;
  }

  function placeTower(S, c, r, towerId) {
    if (towerId === 'factory') return placeFactory(S, c, r); // v3 PIXEL FASE 5
    const def = D.TOWERS_DATA.find(t => t.id === towerId);
    if (!def) return null;
    const key = c + ',' + r;
    if (S.occupied[key] || S.blocked[key]) { SND.error(); return null; }
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    if (S.credits < def.cost) { SND.error(); return null; }
    S.credits -= def.cost;
    const t = {
      tid: uid(), defRef: def, c, r,
      x: c * CELL + CELL / 2, y: r * CELL + CELL / 2,
      level: 1, spent: def.cost, kills: 0, damageDealt: 0,
      angle: -Math.PI / 2, aimAngle: -Math.PI / 2,
      cooldown: 0, recoil: 0, flash: 0, rampTime: 0, lastTargetEid: null,
      targetMode: 'FIRST', specBranch: null, beamTarget: null
    };
    S.towers.push(t);
    S.occupied[key] = t;
    SND.build();
    ev(S, { t: 'buildFx', x: t.x, y: t.y, col: def.color });
    return t;
  }

  function upgradeCost(t) { const base=t.defRef.cost; return Math.round(base * (0.72 + t.level * 0.42 * Math.pow(1.03, t.level/12))); }
  function sellValue(t) { return Math.round(t.spent * 0.7); }

  function upgradeTower(S, t) {
    if (!t || t.level >= D.TOWER_MAX_LVL || t.defRef.kind === 'factory') { SND.error(); return false; }
    // v3 PIXEL FASE 2: upgrade trava no teto do tier — precisa FUNDIR
    if (t.level >= tierCap(t)) {
      SND.error();
      ev(S, { t: 'float', x: t.x, y: t.y - 16, txt: 'FUNDA 2 IGUAIS PRA SUBIR DE TIER', col: '#fbbf24', size: 10 });
      return false;
    }
    const cost = upgradeCost(t);
    if (S.credits < cost) { SND.error(); return false; }
    S.credits -= cost;
    t.spent += cost;
    t.level++;
    SND.upgrade();
    ev(S, { t: 'lvlFx', x: t.x, y: t.y, col: t.defRef.color });
    if (t.level >= D.TOWER_MAX_LVL) unlockAchievement('max_tower');
    return true;
  }

  function sellTower(S, t) {
    if (!t) return false;
    const val = sellValue(t);
    S.credits += val;
    const i = S.towers.indexOf(t);
    if (i >= 0) S.towers.splice(i, 1);
    delete S.occupied[t.c + ',' + t.r];
    SND.sell();
    ev(S, { t: 'sellFx', x: t.x, y: t.y, val });
    return true;
  }

  function setSpec(S, t, branch) {
    if (!t || t.level < 4 || t.specBranch) return false;
    if (branch !== 'A' && branch !== 'B') return false;
    t.specBranch = branch;
    SND.upgrade();
    ev(S, { t: 'lvlFx', x: t.x, y: t.y, col: t.defRef.color });
    return true;
  }

  function cycleTargetMode(t) {
    const i = D.TARGET_MODES.indexOf(t.targetMode);
    t.targetMode = D.TARGET_MODES[(i + 1) % D.TARGET_MODES.length];
    SND.ui();
    return t.targetMode;
  }

  /* ---- v3 PIXEL FASE 2: tiers travam upgrade no teto; FUNDIR 3 iguais → sobe 1 tier ---- */
  function tierCap(t) { return Math.min(5, D.getTier(t.level)) * 10; }
  function mergeCandidates(S, t) {
    const tier = D.getTier(t.level);
    return S.towers.filter(o => o !== t && o.defRef.kind !== 'factory' && (o.defRef.id === t.defRef.id) && D.getTier(o.level) === tier);
  }
  function canMerge(S, t) {
    if (!t || t.defRef.kind === 'factory' || t.level >= D.TOWER_MAX_LVL) return false;
    return mergeCandidates(S, t).length >= 2;
  }
  function mergeTowers(S, t) {
    if (!canMerge(S, t)) { SND.error(); return null; }
    const tier = D.getTier(t.level);
    const partsCost = D.MERGE_PARTS[tier] || 0;
    if ((S.parts || 0) < partsCost) { SND.error(); ev(S, { t: 'float', x: t.x, y: t.y - 16, txt: 'PEÇAS INSUFICIENTES', col: '#f43f5e', size: 11 }); return null; }
    const others = mergeCandidates(S, t).slice(0, 2);
    if (others.length < 2) { SND.error(); return null; }
    S.parts -= partsCost;
    for (const o of others) sellTowerRaw(S, o); // consumidas SEM reembolso
    t.level = tier * 10 + 1;
    SND.upgrade();
    ev(S, { t: 'banner', txt: defName(t) + ' FUNDIRAM → TIER ' + (tier + 1) + '!', col: '#fbbf24', strong: true });
    ev(S, { t: 'ring', x: t.x, y: t.y, maxR: CELL * 3, col: '#fbbf24' });
    ev(S, { t: 'lvlFx', x: t.x, y: t.y, col: '#fbbf24' });
    unlockAchievement('max_tower');
    return t;
  }
  function defName(t) { const d = t.defRef || t.def; return d ? d.name : ''; }
  function sellTowerRaw(S, t) {
    const i = S.towers.indexOf(t);
    if (i >= 0) S.towers.splice(i, 1);
    delete S.occupied[t.c + ',' + t.r];
    ev(S, { t: 'boom', x: t.x, y: t.y, r: 20, col: '#8fa3c4', big: false });
  }

  /* ---- v3 PIXEL FASE 5: FÁBRICA + LABORATÓRIO HIVEMIND ---- */
  function placeFactory(S, c, r) {
    const fd = D.FACTORY_DATA;
    const key = c + ',' + r;
    if (S.occupied[key] || S.blocked[key]) { SND.error(); return null; }
    if (c < 0 || c >= COLS || r >= ROWS || r < 0) return null;
    if (S.credits < fd.cost) { SND.error(); return null; }
    S.credits -= fd.cost;
    const t = {
      tid: uid(), defRef: fd, c, r,
      x: c * CELL + CELL / 2, y: r * CELL + CELL / 2,
      level: 1, spent: fd.cost, kills: 0, damageDealt: 0,
      angle: -Math.PI / 2, aimAngle: -Math.PI / 2,
      cooldown: 0, recoil: 0, flash: 0, rampTime: 0, lastTargetEid: null,
      targetMode: 'FIRST', specBranch: null, beamTarget: null
    };
    S.towers.push(t);
    S.occupied[key] = t;
    SND.build();
    ev(S, { t: 'buildFx', x: t.x, y: t.y, col: fd.color });
    return t;
  }
  function upgradeFactory(S, t) {
    if (!t || t.defRef.kind !== 'factory' || t.level >= D.FACTORY_DATA.maxLevel) { SND.error(); return false; }
    const cc = D.FACTORY_DATA.upgradeCreditCost(t.level), pc = D.FACTORY_DATA.upgradePartsCost(t.level);
    if (S.credits < cc || (S.parts || 0) < pc) { SND.error(); return false; }
    S.credits -= cc; S.parts -= pc;
    t.spent += cc; t.level++;
    SND.upgrade();
    ev(S, { t: 'lvlFx', x: t.x, y: t.y, col: D.FACTORY_DATA.color });
    return true;
  }
  function upgradeEnemyHP(S) { // laboratório Hivemind: paga peças → inimigos +12% HP / +8% ouro por nível
    const cost = D.HIVEMIND.cost(S.enemyHpLevel || 0);
    if ((S.parts || 0) < cost) { SND.error(); return false; }
    S.parts -= cost;
    S.enemyHpLevel = (S.enemyHpLevel || 0) + 1;
    ev(S, { t: 'banner', txt: '🧬 HIVEMIND NÍVEL ' + S.enemyHpLevel + ' — INIMIGOS +12% HP', col: '#a78bfa' });
    return true;
  }

  /* ---- Fluxo de ondas ---- */
  function startNextWave(S) {
    if (S.state !== 'idle') return false;
    const total = S.endless ? Infinity : S.map.waves.length;
    if (S.wave >= total) return false;
    S.wave++;
    S.state = 'combat';
    S.waveStartTime = S.time;
    let str;
    if (S.endless && S.wave > S.map.waves.length) {
      str = D.makeEndlessWave(S.wave);
      S.endlessHpMul = Math.pow(1.09, S.wave - S.map.waves.length);
    } else {
      str = S.map.waves[S.wave - 1];
      S.endlessHpMul = 1;
    }
    S.waveQueue = D.parseWaveString(str);
    S.autoWaveTimer = 0;
    if (str.indexOf('B') >= 0) {
      ev(S, { t: 'banner', txt: 'ALERTA MÁXIMO: NAVE-MÃE DETECTADA!', col: '#f43f5e', strong: true });
      SND.bossAlert();
    } else {
      ev(S, { t: 'banner', txt: 'ONDA ' + S.wave, col: '#38bdf8' });
    }
    SND.waveStart();
    return true;
  }

  function waveSummary(str) {
    const counts = [];
    const map = {};
    D.parseWaveString(str).forEach(item => {
      if (!map[item.type]) { map[item.type] = { type: item.type, count: 0 }; counts.push(map[item.type]); }
      map[item.type].count++;
    });
    return counts;
  }

  function peekNextWave(S) {
    const n = S.wave + 1;
    if (!S.endless && n > S.map.waves.length) return null;
    const str = (S.endless && n > S.map.waves.length) ? D.makeEndlessWave(n) : S.map.waves[n - 1];
    return waveSummary(str);
  }

  function onWaveCleared(S) {
    // v3 PIXEL FASE 5: peças por onda + produção das fábricas
    S.parts = (S.parts || 0) + 2;
    let factoryParts = 0, factoryCredits = 0;
    for (const t of S.towers) {
      if (t.defRef.kind !== 'factory') continue;
      const p = D.FACTORY_DATA.partsPerWave(t.level), cr = D.FACTORY_DATA.creditsPerWave(t.level);
      S.parts += p; factoryParts += p;
      S.credits += cr; S.creditsEarned += cr; factoryCredits += cr;
      ev(S, { t: 'float', x: t.x, y: t.y - 20, txt: '+' + p + '⚙ +' + cr + 'cr', col: '#34d399', size: 12 });
    }
    if (factoryParts > 0) ev(S, { t: 'banner', txt: 'FÁBRICA: +' + factoryParts + '⚙ +' + factoryCredits + ' CRÉDITOS', col: '#34d399' });
    const bonus = Math.round((60 + S.wave * 15) * (S.endless ? 1.5 : 1) * (1 + (S.combo||0)*0.02));
    S.credits += bonus;
    S.creditsEarned += bonus;
    ev(S, { t: 'float', x: BW / 2, y: BH / 2, txt: '+' + bonus + ' ONDA COMPLETA!', col: '#fbbf24', size: 18 });
    if(S.combo >= 8) ev(S, { t:'float', x:BW/2, y:BH/2-28, txt:'COMBO x'+S.combo+' BÔNUS!', col:'#34d399', size:14 });
    SND.waveClear ? SND.waveClear() : SND.coin();
    // Final de campanha tem prioridade sobre mutação (senão trava na 12/12)
    if (!S.endless && S.wave >= S.map.waves.length) { finalizeEnd(S, 'victory'); return; }
    if (S.endless) {
      const best = D.Save.data.bestEndless[S.mapIdx] || 0;
      if (S.wave > best) { D.Save.data.bestEndless[S.mapIdx] = S.wave; D.Save.save(); }
      if (S.wave >= 30) unlockAchievement('endless_30');
      // mutação a cada 3 ondas também no endless, mas antes do idle
      if(S.wave % 3 === 0){
        const choices = D.getMutationChoices(S.wave*17 + S.mapIdx*31 + S.kills, 3);
        S.pendingMut = true;
        S.mutChoices = choices;
        S.state = 'mutate';
        S.autoWaveTimer = 0;
        ev(S, { t:'mutation', wave:S.wave, choices: choices });
        try{ SND.mutation(); }catch(e){}
        return;
      }
      S.state = 'idle';
      S.autoWaveTimer = 6.0;
      ev(S, { t: 'banner', txt: 'ONDA ' + S.wave + ' SUPERADA ∞', col: '#38bdf8' });
      return;
    }
    if(S.wave % 3 === 0){
      const choices = D.getMutationChoices(S.wave*17 + S.mapIdx*31 + S.kills, 3);
      S.pendingMut = true;
      S.mutChoices = choices;
      S.state = 'mutate';
      S.autoWaveTimer = 0;
      ev(S, { t:'mutation', wave:S.wave, choices: choices });
      try{ SND.mutation(); }catch(e){}
      return;
    }

    if (S.endless) {
      const best = D.Save.data.bestEndless[S.mapIdx] || 0;
      if (S.wave > best) { D.Save.data.bestEndless[S.mapIdx] = S.wave; D.Save.save(); }
      if (S.wave >= 30) unlockAchievement('endless_30');
      S.state = 'idle';
      S.autoWaveTimer = 6.0;
      ev(S, { t: 'banner', txt: 'ONDA ' + S.wave + ' SUPERADA \u221E', col: '#38bdf8' });
      return;
    }
    if (S.wave >= S.map.waves.length) { finalizeEnd(S, 'victory'); return; }
    S.state = 'idle';
    S.autoWaveTimer = 6.0;
  }

  function applyMutation(S, mutId){
    if(!S.pendingMut || !S.mutChoices) return false;
    const mut = S.mutChoices.find(m=> m.id===mutId) || D.MUTATIONS.find(m=>m.id===mutId);
    if(!mut) return false;
    try{ mut.apply(S); }catch(e){}
    S.mutHistory.push(mut.id);
    S.pendingMut = false;
    S.mutChoices = null;
    S.state = 'idle';
    S.autoWaveTimer = 6.0;
    ev(S, { t:'mutPicked', name:mut.name, col:mut.color, icon:mut.icon });
    ev(S, { t:'banner', txt: mut.icon+' '+mut.name.toUpperCase()+' ATIVADO!', col: mut.color });
    try{ SND.mutPick(); }catch(e){}
    return true;
  }
  function skipMutation(S){
    if(!S.pendingMut) return false;
    S.pendingMut=false; S.mutChoices=null; S.state='idle'; S.autoWaveTimer=6.0;
    ev(S, { t:'banner', txt:'MUTAÇÃO IGNORADA', col:'#8fa3c4' });
    return true;
  }
  function unlockAchievement(id) { return D.Save.unlock(id); }

  function finalizeEnd(S, outcome) {
    S.state = outcome;
    if (outcome === 'victory') {
      SND.victory();
      const stars = S.lives >= Math.ceil(S.livesMax * 0.9) ? 3 : (S.lives >= Math.ceil(S.livesMax * 0.5) ? 2 : 1);
      const cur = D.Save.data.mapStars[S.mapIdx] || 0;
      if (stars > cur) D.Save.data.mapStars[S.mapIdx] = stars;
      const crystals = Math.round((15 + stars * 10 + S.mapIdx * 10) * S.diff.crystalBonus);
      D.Save.data.crystals += crystals;
      if (S.mapIdx + 1 > D.Save.data.unlockedMap && D.Save.data.unlockedMap < D.MAPS_DATA.length) {
        D.Save.data.unlockedMap = S.mapIdx + 2;
      }
      if (S.mapIdx === 0) unlockAchievement('map1_clear');
      if (D.MAPS_DATA.every((_, i) => (D.Save.data.mapStars[i] || 0) > 0)) unlockAchievement('all_maps');
      if (S.leaks === 0 && S.map.waves.length >= 10) unlockAchievement('no_leak_10');
      if (S.diff.key === 'veteran') unlockAchievement('hard_win');
      if (S.diff.key === 'insane') unlockAchievement('insane_win');
      D.Save.save();
      S.result = { outcome, stars, crystals, kills: S.kills, credits: S.creditsEarned };
    } else {
      SND.defeat();
      const crystals = Math.max(5, Math.floor(S.wave * 2));
      D.Save.data.crystals += crystals;
      let topLeak = null, topN = 0;
      for (const k in S.leakCounts) if (S.leakCounts[k] > topN) { topN = S.leakCounts[k]; topLeak = k; }
      const diag = topLeak
        ? (S.leakedFlying
          ? 'Voadores romperam a linha! Precisa de mais defesa anti-aérea (Laser/Tesla/Sniper).'
          : 'Principal invasor que vazou: ' + topLeak + ' (x' + topN + '). Reforce a rota dele.')
        : 'O portal planetário foi invadido.';
      D.Save.save();
      S.result = { outcome, crystals, kills: S.kills, credits: S.creditsEarned, diag };
    }
    ev(S, { t: 'gameEnd', outcome: S.state });
  }

  /* ---- Simulação principal (dt em segundos) ---- */
  function stepSim(S, dt) {
    if (S.state === 'victory' || S.state === 'defeat') return;
    if (S.hitStop > 0) { S.hitStop -= dt; return; }
    if (S.chrono > 0) { S.chrono -= dt; dt *= 0.22; }
    if(S.combo > 0){
      S.comboTimer -= dt;
      if(S.comboTimer <= 0){ const old=S.combo; S.combo=0; S.comboTimer=0; ev(S,{t:'comboBreak', prev:old}); }
    }
    // Auto-resolve mutation for headless / smoke tests (if UI not handling)
    if(S.pendingMut && S.mutChoices){
      S._mutAuto = (S._mutAuto||0) + dt;
      if(S._mutAuto > 0.26){
        applyMutation(S, S.mutChoices[0].id);
        S._mutAuto = 0;
      }
    } else {
      S._mutAuto = 0;
    }
    S.time += dt;

    for (const k in S.powers) {
      const p = S.powers[k];
      if (p.cd > 0) p.cd = Math.max(0, p.cd - dt);
      if (p.dur > 0) p.dur = Math.max(0, p.dur - dt);
    }

    // Spawner
    while (S.waveQueue.length > 0 && S.waveQueue[0].at <= (S.time - S.waveStartTime)) {
      spawnEnemy(S, S.waveQueue.shift().type);
    }

    // Inimigos
    for (let i = S.enemies.length - 1; i >= 0; i--) {
      const e = S.enemies[i];
      if (e.dead) { S.enemies.splice(i, 1); continue; }

      if (e.poisonTimer > 0) {
        e.poisonTimer -= dt;
        damageEnemy(S, e, e.poisonDps * dt, { pure: true });
        if (e.dead) continue;
      }
      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        damageEnemy(S, e, e.burnDps * dt, { pure: true });
        if (e.dead) continue;
      }
      if (e.slowTimer > 0) { e.slowTimer -= dt; if (e.slowTimer <= 0) e.slowFactor = 1; }
      if (e.stunTimer > 0) e.stunTimer -= dt;
      if (e.cryoVuln > 0) e.cryoVuln -= dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.markedTimer > 0) e.markedTimer -= dt;

      if (e.defRef.heals) {
        e.healCooldown -= dt;
        if (e.healCooldown <= 0) {
          e.healCooldown = 0.6;
          for (const o of S.enemies) {
            if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 90 && o.hp < o.maxHp) {
              o.hp = Math.min(o.maxHp, o.hp + 6);
              ev(S, { t: 'healFx', x: o.x, y: o.y });
            }
          }
        }
      }
      if (e.defRef.stealth) e.stealthPhase = S.time % 2.5;

      if (e.defRef.isBoss && !e.raged && e.hp < e.maxHp * 0.5) {
        e.raged = true;
        ev(S, { t: 'banner', txt: 'FASE DE FÚRIA: ' + e.label.toUpperCase(), col: '#f43f5e', strong: true });
        ev(S, { t: 'rage', eid: e.eid });
      }

      const rageMul = e.raged ? 1.3 : 1;
      const curSpeed = e.speed * e.slowFactor * rageMul * (e.stunTimer > 0 ? 0 : 1);
      e.dist += curSpeed * dt;

      if (e.dist >= e.totalLen) {
        e.leaked = true; e.dead = true;
        const dmg = e.defRef.dmg || 1;
        S.lives -= dmg;
        S.leaks++;
        S.leakCounts[e.label] = (S.leakCounts[e.label] || 0) + 1;
        if (e.flying) S.leakedFlying = true;
        ev(S, { t: 'leak', x: BW - 30, y: e.y, dmg, flying: e.flying });
        SND.leak();
        ev(S, { t: 'float', x: BW - 40, y: e.y, txt: '-' + dmg, col: '#f43f5e', size: 16 });
        if (e.defRef.isBoss) S.activeBoss = null;
        if (S.lives <= 0) { finalizeEnd(S, 'defeat'); return; }
        continue;
      }

      const pts = e.flying ? S.airPts : S.routes[e.routeIdx];
      const pos = D.getPosAtDist(pts, e.dist);
      const nxt = D.getPosAtDist(pts, Math.min(e.dist + 4, e.totalLen));
      e.x = pos.x; e.y = pos.y;
      e.dirAngle = Math.atan2(nxt.y - pos.y, nxt.x - pos.x);
      e.progress = e.dist / e.totalLen;
    }

    // Torres
    for (const t of S.towers) {
      const def = t.defRef || t.def;
      if (t.flash > 0) t.flash -= dt;
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 6);

      // v3 PIXEL FASE 4: fila de supers automáticos — dispara sozinho quando cheio
      if (def.kind !== 'factory' && def.kind !== 'buff') fireAutoSuperIfReady(S, t);
      // v3 PIXEL FASE 5: fábrica não combate — pula alvo/tiro/buff
      if (def.kind === 'factory') continue;
      const stats = getTowerStats(S, t);
      let da = t.aimAngle - t.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      t.angle += da * Math.min(1, dt * 12);

      if (def.kind === 'buff') continue;

      if (def.kind === 'beam') {
        const tgt = findBestTarget(S, t, stats);
        const prevId = t.beamTarget ? t.beamTarget.eid : null;
        t.beamTarget = (tgt && !tgt.dead) ? tgt : null;
        // v3 PIXEL FASE 3: laser por tier — largura do feixe + alvos varridos
        const lp = D.SHOT_PATTERNS.laser;
        const beamTier = D.getTier(t.level);
        const beamW = lp.width[beamTier - 1] || 1;
        let sweepN = (lp.sweep[beamTier - 1] || 0);
        if (t.specBranch === 'B' && def.specB && def.specB.prism) sweepN += def.specB.prism; // spec B vira base
        if (D.TIER_LOGIC.laser && D.TIER_LOGIC.laser[beamTier] && D.TIER_LOGIC.laser[beamTier].eff.sweepAdd && beamTier >= 3) sweepN += 0; // já na tabela
        if (t.beamTarget) {
          t.aimAngle = Math.atan2(t.beamTarget.y - t.y, t.beamTarget.x - t.x);
          SND.laserStart('L' + t.tid);
          let dmgRate = stats.dmg;
          if (t.specBranch === 'A') { t.rampTime += dt; dmgRate *= 1 + Math.min(3.0, t.rampTime * 0.8); }
          damageEnemy(S, t.beamTarget, dmgRate * dt, { pure: true });
          if (sweepN > 0) {
            // feixe varredor: atinge N alvos extras próximos do alvo principal
            let count = 0;
            for (const other of S.enemies) {
              if (other !== t.beamTarget && !other.dead && Math.hypot(other.x - t.beamTarget.x, other.y - t.beamTarget.y) < 80 + beamW * 20) {
                damageEnemy(S, other, dmgRate * 0.45 * dt, { pure: true });
                if (++count >= sweepN) break;
              }
            }
          }
        } else {
          if (prevId !== null) SND.laserStop('L' + t.tid);
          t.rampTime = 0;
        }
        continue;
      }

      t.cooldown -= dt;
      if (t.cooldown <= 0) {
        const target = findBestTarget(S, t, stats);
        if (target) {
          if (def.id === 'gatling' && t.specBranch === 'A') {
            if (t.lastTargetEid === target.eid) t.rampTime += 1 / stats.rate;
            else { t.rampTime = 0; t.lastTargetEid = target.eid; }
          } else t.rampTime = 0;
          fireTower(S, t, target, stats);
          t.cooldown = stats.rate > 0 ? 1 / stats.rate : 0.5;
        }
      }
      // AUTO-MOVIMENTO PREDITIVO: antecipa inimigos 1.4s à frente
      if((t.moveCd||0) <= 0 && S.state!=='victory' && S.state!=='defeat' && Math.random() < 0.008){
        const statsTmp = getTowerStats(S, t);
        const best = findBestTarget(S, t, statsTmp);
        let future = null;
        if(best && !best.dead){
          const predDist = best.dist + best.speed * 1.4 * (best.slowFactor||1);
          const pts = best.flying ? S.airPts : S.routes[best.routeIdx];
          const total = best.flying ? S.airLen : S.routeLengths[best.routeIdx];
          future = D.getPosAtDist(pts, Math.min(total, predDist));
        }
        const cells=[];
        const range = t.moveRange||3;
        for(let dc=-range;dc<=range;dc++) for(let dr=-range;dr<=range;dr++){
          const dist=Math.abs(dc)+Math.abs(dr);
          if(dist===0||dist>range) continue;
          const nc=t.c+dc, nr=t.r+dr;
          if(nc<0||nc>=COLS||nr<0||nr>=ROWS) continue;
          const key=nc+','+nr;
          if(S.blocked[key] || S.occupied[key]) continue;
          let score = Math.random()*0.3;
          const cx = nc*CELL+CELL/2, cy = nr*CELL+CELL/2;
          if(future){
            const dFuture = Math.hypot(future.x - cx, future.y - cy);
            const inRangeFuture = dFuture <= statsTmp.rng;
            score += inRangeFuture ? 1.2 : 0;
            score += (1 - Math.min(1, dFuture/500)) * 0.8;
            const curD = Math.hypot(best.x - t.x, best.y - t.y);
            const curIn = curD <= statsTmp.rng;
            if(!curIn && inRangeFuture) score += 1.5;
          } else if(S.enemies.length){
            let bestD=999;
            for(const e of S.enemies) if(!e.dead) bestD=Math.min(bestD, Math.hypot(e.x - cx, e.y - cy));
            score += (1 - Math.min(1, bestD/600))*0.6;
          } else {
            const dCenter = Math.hypot(cx - BW/2, cy - BH/2);
            score += (1 - dCenter/700)*0.3;
          }
          cells.push({c:nc,r:nr,score});
        }
        if(cells.length){
          cells.sort((a,b)=>b.score-a.score);
          const pick=cells[0];
          // move sem custo, só cooldown
          const oldKey=t.c+','+t.r;
          delete S.occupied[oldKey];
          t.c=pick.c; t.r=pick.r;
          t.x=pick.c*CELL+CELL/2; t.y=pick.r*CELL+CELL/2;
          S.occupied[pick.c+','+pick.r]=t;
          t.moveCd = 2.2 + Math.random()*1.2;
          ev(S,{t:'ring', x:t.x, y:t.y, maxR: CELL*1.2, col:def.color});
        }
      }
    }

    // Projéteis
    for (let i = S.projectiles.length - 1; i >= 0; i--) {
      const pr = S.projectiles[i];
      if (pr.delay > 0) { pr.delay -= dt; continue; }
      pr.life -= dt;
      if (pr.kind === 'bullet') {
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        for (const e of S.enemies) {
          if (!e.dead && !pr.hitIds[e.eid] && Math.hypot(e.x - pr.x, e.y - pr.y) < e.r + 4) {
            pr.hitIds[e.eid] = true;
            damageEnemy(S, e, pr.dmg, { src: pr.src || pr.tower });
            // v3 PIXEL FASE 6: cannon T2 concussão — reduz 20% da velocidade 1.5s
            if (!e.dead) {
              const st2 = pr.src || pr.tower;
              if (st2 && st2.defRef.id === 'cannon' && D.TIER_LOGIC.cannon[D.getTier(st2.level)] && D.TIER_LOGIC.cannon[D.getTier(st2.level)].eff.concuss) {
                e.slowTimer = Math.max(e.slowTimer, 1.5); e.slowFactor = Math.min(e.slowFactor || 1, 0.8);
              }
              if (pr.stun) e.stunTimer = Math.max(e.stunTimer, pr.stun);
              // v3 PIXEL FASE 6: gatling T2 incendiária
              const gl = st2 && st2.defRef.id === 'gatling' ? D.TIER_LOGIC.gatling[D.getTier(st2.level)] : null;
              if (gl && gl.eff.burn) { e.burnTimer = Math.max(e.burnTimer, gl.eff.burn); e.burnDps = pr.dmg * 0.3; }
            }
            ev(S, { t: 'impact', x: pr.x, y: pr.y, col: pr.col });
            pr.pierce--;
            if (pr.pierce <= 0) { pr.life = 0; break; }
          }
        }
      } else if (pr.kind === 'missile') {
        const tgt = pr.targetId != null ? findProjTarget(S, pr.targetId) : null;
        if (tgt && !tgt.dead) {
          const ang = Math.atan2(tgt.y - pr.y, tgt.x - pr.x);
          pr.vx = Math.cos(ang) * pr.speed; pr.vy = Math.sin(ang) * pr.speed;
          pr.ang = ang;
        }
        pr.x += (pr.vx || 0) * dt; pr.y += (pr.vy || 0) * dt;
        if (Math.random() < dt * 30) ev(S, { t: 'smoke', x: pr.x, y: pr.y });
        if (tgt && !tgt.dead && Math.hypot(tgt.x - pr.x, tgt.y - pr.y) < tgt.r + 6) {
          detonateMissile(S, pr, pr.x, pr.y);
        }
      }
      if (pr.life <= 0) S.projectiles.splice(i, 1);
    }

    // Vórtices
    for (let i = S.vortices.length - 1; i >= 0; i--) {
      const v = S.vortices[i];
      v.life -= dt;
      if (v.life <= 0) { S.vortices.splice(i, 1); continue; }
      for (const e of S.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(v.x - e.x, v.y - e.y);
        if (d <= v.r && d > 4) {
          const pull = (1 - d / v.r) * 80 * dt;
          e.x += (v.x - e.x) / d * pull;
          e.y += (v.y - e.y) / d * pull;
          damageEnemy(S, e, v.dps * dt, { pure: true });
        }
      }
    }

    // Fim de onda
    if (S.state === 'combat' && S.waveQueue.length === 0 && S.enemies.length === 0) onWaveCleared(S);

    // Auto-próxima onda
    if (S.state === 'idle' && S.autoNext && S.autoWaveTimer > 0) {
      S.autoWaveTimer -= dt;
      if (S.autoWaveTimer <= 0) startNextWave(S);
    }
  }

  function findProjTarget(S, eid) {
    for (const e of S.enemies) if (e.eid === eid) return e;
    return null;
  }

  function detonateMissile(S, pr, x, y) {
    const mutSplash = 1 + ((S.mutBuffs && S.mutBuffs.splash)||0);
    const effSplash = pr.splash * mutSplash;
    ev(S, { t: 'boom', x, y, r: effSplash, col: '#fb923c', big: false });
    ev(S, { t: 'shake', mag: 4 });
    SND.explosion(1.1);
    for (const e of S.enemies) {
      if (e.dead || (e.flying && !pr.hitAir)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= effSplash) {
        damageEnemy(S, e, pr.dmg * (1 - (d / effSplash) * 0.5) * (1 + ((S.mutBuffs && S.mutBuffs.splash)||0)*0.3), { src: pr.src || pr.tower });
        if (pr.burn && !e.dead) { e.burnTimer = 3; e.burnDps = pr.dmg * 0.25; }
      }
    }
    // v3 PIXEL FASE 3: MIRV — ogiva se subdivide em submunições no impacto
    if (pr.mirv > 0) {
      for (let m = 0; m < pr.mirv; m++) {
        S.projectiles.push({
          kind: 'missile', x, y, targetId: null, speed: 260,
          vx: Math.cos(Math.PI * 2 * m / pr.mirv + Math.random()) * 260,
          vy: Math.sin(Math.PI * 2 * m / pr.mirv + Math.random()) * 260,
          dmg: pr.dmg * 0.5, splash: effSplash * 0.6, hitAir: true, burn: false,
          col: '#fb923c', life: 1.1, delay: 0, tower: pr.tower, mirv: 0, ang: 0
        });
      }
    }
    pr.life = 0;
  }

  /* ================= APRESENTAÇÃO (Phaser 3) ================= */

  function drawEnemyShape(g, shape, col, r) {
    const R = Math.max(6, r);
    // Textura é quadrada (size×size) e o Phaser ancora no CENTRO dela:
    // todo desenho precisa partir do meio (C,C), não de (0,0).
    const C = g.width ? g.width / 2 : R * 1.5 + 4;
    g.save(); g.translateCanvas(C, C);
    const body = Phaser.Display.Color.HexStringToColor(col).color;
    const dark = 0x0a1226;
    const glass = 0xbfe3ff;
    // Sombra no chão
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(R * 0.4, R * 1.15, R * 1.6, R * 0.55);

    switch (shape) {
      case 'tri': {
        // Caça leve: fuselagem afilada + cabine + 2 motores
        g.fillStyle(body, 1);
        g.lineStyle(1.5, 0xffffff, 0.6);
        g.beginPath();
        g.moveTo(0, -R * 1.25);            // bico
        g.lineTo(R * 0.45, -R * 0.2);
        g.lineTo(R * 0.95, R * 0.85);       // ponta da asa direita
        g.lineTo(R * 0.35, R * 0.65);
        g.lineTo(-R * 0.35, R * 0.65);
        g.lineTo(-R * 0.95, R * 0.85);      // ponta da asa esquerda
        g.lineTo(-R * 0.45, -R * 0.2);
        g.closePath();
        g.fillPath(); g.strokePath();
        // Cabine de vidro
        g.fillStyle(glass, 0.95);
        g.fillCircle(0, -R * 0.35, Math.max(2, R * 0.22));
        // Motores
        g.fillStyle(dark, 1);
        g.fillRect(-R * 0.4, R * 0.6, R * 0.22, R * 0.35);
        g.fillRect(R * 0.18, R * 0.6, R * 0.22, R * 0.35);
        break;
      }
      case 'dart': {
        // Interceptador rápido: fuselagem fina em agulha + canards
        g.fillStyle(body, 1);
        g.lineStyle(1.5, 0xffffff, 0.6);
        g.beginPath();
        g.moveTo(-R * 1.15, 0);             // nariz (aponta pra ESQUERDA = direção de voo)
        g.lineTo(-R * 0.2, -R * 0.28);
        g.lineTo(R * 0.75, -R * 0.85);      // aleta superior
        g.lineTo(R * 0.9, -R * 0.15);
        g.lineTo(R * 0.9, R * 0.15);
        g.lineTo(R * 0.75, R * 0.85);       // aleta inferior
        g.lineTo(-R * 0.2, R * 0.28);
        g.closePath();
        g.fillPath(); g.strokePath();
        g.fillStyle(glass, 0.9);
        g.fillCircle(-R * 0.45, 0, Math.max(1.8, R * 0.16));
        break;
      }
      case 'square': {
        // Cruzador blindado: casco pesado retangular com torres laterais
        g.fillStyle(body, 1);
        g.lineStyle(1.5, 0xffffff, 0.55);
        g.fillRect(-R * 0.85, -R * 0.7, R * 1.7, R * 1.4);
        g.strokeRect(-R * 0.85, -R * 0.7, R * 1.7, R * 1.4);
        // Placas de blindagem
        g.fillStyle(0x0a1226, 0.8);
        g.fillRect(-R * 0.85, -R * 0.7, R * 1.7, R * 0.28);
        g.fillRect(-R * 0.85, R * 0.42, R * 1.7, R * 0.28);
        // Torres de canhão
        g.fillStyle(0xe8eefc, 0.9);
        g.fillCircle(-R * 0.45, 0, R * 0.18);
        g.fillCircle(R * 0.45, 0, R * 0.18);
        // Ponte central
        g.fillStyle(glass, 0.8);
        g.fillRect(-R * 0.18, -R * 0.12, R * 0.36, R * 0.24);
        break;
      }
      case 'dot': {
        // Parasita: esfera com núcleo pulsante e garras
        g.fillStyle(body, 1);
        g.fillCircle(0, 0, R * 0.8);
        g.lineStyle(1.5, 0xffffff, 0.55);
        g.strokeCircle(0, 0, R * 0.8);
        g.fillStyle(dark, 1);
        g.fillCircle(0, 0, R * 0.38);
        g.fillStyle(glass, 1);
        g.fillCircle(0, 0, R * 0.16);
        // Garras orbitais
        g.lineStyle(1.5, body, 0.9);
        for (let a = 0; a < 6; a++) {
          const ang = a * Math.PI / 3;
          g.beginPath();
          g.moveTo(Math.cos(ang) * R * 0.8, Math.sin(ang) * R * 0.8);
          g.lineTo(Math.cos(ang) * R * 1.05, Math.sin(ang) * R * 1.05);
          g.strokePath();
        }
        break;
      }
      case 'cross': {
        // Nave-mãe médica: cruz de cura + hélice traseira
        g.fillStyle(body, 1);
        g.lineStyle(1.5, 0xffffff, 0.6);
        g.beginPath();
        g.moveTo(0, -R * 1.05); g.lineTo(R * 0.3, -R * 0.5); g.lineTo(R * 0.3, -R * 0.15);
        g.lineTo(R * 1.05, -R * 0.15); g.lineTo(R * 1.05, R * 0.15); g.lineTo(R * 0.3, R * 0.15);
        g.lineTo(R * 0.3, R * 0.5); g.lineTo(0, R * 1.05);
        g.lineTo(-R * 0.3, R * 0.5); g.lineTo(-R * 0.3, R * 0.15);
        g.lineTo(-R * 1.05, R * 0.15); g.lineTo(-R * 1.05, -R * 0.15); g.lineTo(-R * 0.3, -R * 0.15);
        g.lineTo(-R * 0.3, -R * 0.5);
        g.closePath();
        g.fillPath(); g.strokePath();
        // Cruz branca central (identidade médica)
        g.fillStyle(0xffffff, 0.95);
        g.fillRect(-R * 0.09, -R * 0.32, R * 0.18, R * 0.64);
        g.fillRect(-R * 0.32, -R * 0.09, R * 0.64, R * 0.18);
        break;
      }
      case 'ring': {
        // Espectral: anel com núcleo flutuante e 3 pods
        g.fillStyle(body, 1);
        g.fillCircle(0, 0, R);
        g.fillStyle(dark, 1);
        g.fillCircle(0, 0, R * 0.58);
        g.lineStyle(2, 0xffffff, 0.55);
        g.strokeCircle(0, 0, R * 0.82);
        // Pods de camuflagem
        g.fillStyle(glass, 0.9);
        for (let a = 0; a < 3; a++) {
          const ang = -Math.PI / 2 + a * 2 * Math.PI / 3;
          g.fillCircle(Math.cos(ang) * R * 0.68, Math.sin(ang) * R * 0.68, R * 0.14);
        }
        // Núcleo piscante
        g.fillStyle(body, 0.95);
        g.fillCircle(0, 0, R * 0.24);
        break;
      }
      case 'diamond': {
        // Bombardeiro PEM: losango pesado com baia de bombas
        g.fillStyle(body, 1);
        g.lineStyle(1.5, 0xffffff, 0.6);
        g.beginPath();
        g.moveTo(0, -R * 1.1); g.lineTo(R * 0.78, 0); g.lineTo(0, R * 1.1); g.lineTo(-R * 0.78, 0);
        g.closePath();
        g.fillPath(); g.strokePath();
        g.lineStyle(1.5, dark, 0.9);
        g.beginPath(); g.moveTo(0, -R * 0.55); g.lineTo(0, R * 0.55); g.strokePath();
        g.beginPath(); g.moveTo(-R * 0.42, 0); g.lineTo(R * 0.42, 0); g.strokePath();
        g.fillStyle(glass, 0.9);
        g.fillCircle(0, -R * 0.5, Math.max(2, R * 0.17));
        break;
      }
      case 'shield': {
        // Vanguarda: proa blindada em cunha + gerador de escudo
        g.fillStyle(body, 1);
        g.lineStyle(1.5, 0xffffff, 0.6);
        g.beginPath();
        g.moveTo(0, -R * 1.15); g.lineTo(R * 0.85, -R * 0.5); g.lineTo(R * 0.85, R * 0.35);
        g.lineTo(0, R * 1.05); g.lineTo(-R * 0.85, R * 0.35); g.lineTo(-R * 0.85, -R * 0.5);
        g.closePath();
        g.fillPath(); g.strokePath();
        // Arco de escudo frontal
        g.lineStyle(2.5, 0x60a5fa, 0.85);
        g.beginPath(); g.arc(0, -R * 0.15, R * 0.95, Math.PI * 1.15, Math.PI * 1.85, false); g.strokePath();
        // Gerador central
        g.fillStyle(glass, 0.9);
        g.fillCircle(0, 0, R * 0.2);
        break;
      }
      case 'split': {
        // Divisor quântico: duas cápsulas ligadas por energia
        g.fillStyle(body, 1);
        g.lineStyle(1.5, 0xffffff, 0.6);
        g.beginPath();
        g.arc(0, -R * 0.45, R * 0.52, Math.PI, 0, false);
        g.arc(0, R * 0.45, R * 0.52, 0, Math.PI, false);
        g.closePath();
        g.fillPath(); g.strokePath();
        // Ligação energética
        g.lineStyle(2, glass, 0.9);
        g.beginPath(); g.moveTo(-R * 0.3, -R * 0.1); g.lineTo(-R * 0.3, R * 0.1);
        g.moveTo(R * 0.3, -R * 0.1); g.lineTo(R * 0.3, R * 0.1);
        g.strokePath();
        // Dois núcleos (as metades futuras)
        g.fillStyle(glass, 1);
        g.fillCircle(0, -R * 0.45, R * 0.14);
        g.fillCircle(0, R * 0.45, R * 0.14);
        break;
      }
      case 'jugg': {
        // Leviatã: couraçado massivo com proa em cunha e 3 funis
        g.fillStyle(body, 1);
        g.lineStyle(2, 0xffffff, 0.55);
        g.beginPath();
        g.moveTo(-R * 1.35, 0);
        g.lineTo(-R * 0.7, -R * 0.72); g.lineTo(R * 0.85, -R * 0.72);
        g.lineTo(R * 1.15, -R * 0.3); g.lineTo(R * 1.15, R * 0.3);
        g.lineTo(R * 0.85, R * 0.72); g.lineTo(-R * 0.7, R * 0.72);
        g.closePath();
        g.fillPath(); g.strokePath();
        // Convés blindado
        g.fillStyle(0x0a1226, 0.75);
        g.fillRect(-R * 0.55, -R * 0.5, R * 1.35, R * 0.22);
        g.fillRect(-R * 0.55, R * 0.28, R * 1.35, R * 0.22);
        // Funis/motores
        g.fillStyle(0xe8eefc, 0.85);
        g.fillCircle(R * 0.92, -R * 0.4, R * 0.13);
        g.fillCircle(R * 0.92, 0, R * 0.13);
        g.fillCircle(R * 0.92, R * 0.4, R * 0.13);
        // Ponte
        g.fillStyle(glass, 0.85);
        g.fillRect(-R * 0.3, -R * 0.16, R * 0.5, R * 0.32);
        break;
      }
      case 'boss': {
        // Dreadnought: fortaleza circular com anel de armas e núcleo exposto
        g.fillStyle(body, 1);
        g.fillCircle(0, 0, R);
        // Asas de ataque
        g.fillTriangle(-R * 1.5, -R * 0.5, -R * 0.7, 0, -R * 1.5, R * 0.5);
        g.fillTriangle(R * 1.5, -R * 0.5, R * 0.7, 0, R * 1.5, R * 0.5);
        // Anel de blindagem segmentado
        g.lineStyle(3, 0xffffff, 0.65);
        for (let a = 0; a < 8; a++) {
          g.beginPath();
          g.arc(0, 0, R, a * Math.PI / 4 + 0.08, (a + 1) * Math.PI / 4 - 0.08, false);
          g.strokePath();
        }
        // Poço do núcleo
        g.fillStyle(dark, 1);
        g.fillCircle(0, 0, R * 0.48);
        g.fillStyle(glass, 0.95);
        g.fillCircle(0, 0, R * 0.26);
        g.fillStyle(body, 1);
        g.fillCircle(0, 0, R * 0.13);
        break;
      }
      default: {
        // Nave genérica: fuselagem oval com cabine
        g.fillStyle(body, 1);
        g.lineStyle(1.5, 0xffffff, 0.6);
        g.fillEllipse(0, 0, R * 1.1, R * 1.9);
        g.lineStyle(1.5, 0xffffff, 0.55);
        g.strokeEllipse(0, 0, R * 1.1, R * 1.9);
        g.fillStyle(glass, 0.9);
        g.fillCircle(0, -R * 0.3, Math.max(2, R * 0.2));
      }
    }
    g.restore();
    return g;
  }

  function paintEnemyShape2d(c2, shape, colHex, r) {
    const R = Math.max(5, r);
    c2.fillStyle = colHex; c2.strokeStyle = '#e8eefc'; c2.lineWidth = 2;
    c2.beginPath();
    switch (shape) {
      case 'tri': c2.moveTo(0, -R); c2.lineTo(R * 0.85, R * 0.7); c2.lineTo(-R * 0.85, R * 0.7); c2.closePath(); break;
      case 'dart': c2.moveTo(-R, -R * 0.5); c2.lineTo(R * 1.1, 0); c2.lineTo(-R, R * 0.5); c2.lineTo(-R * 0.45, 0); c2.closePath(); break;
      case 'square': c2.rect(-R * 0.8, -R * 0.8, R * 1.6, R * 1.6); break;
      case 'dot': c2.arc(0, 0, R * 0.8, 0, Math.PI * 2); break;
      case 'cross': c2.rect(-R * 0.22, -R, R * 0.44, R * 2); c2.rect(-R, -R * 0.22, R * 2, R * 0.44); break;
      case 'ring': c2.arc(0, 0, R, 0, Math.PI * 2); break;
      case 'diamond': c2.moveTo(0, -R); c2.lineTo(R * 0.75, 0); c2.lineTo(0, R); c2.lineTo(-R * 0.75, 0); c2.closePath(); break;
      case 'shield': c2.moveTo(0, -R); c2.lineTo(R * 0.8, -R * 0.45); c2.lineTo(R * 0.8, R * 0.3); c2.lineTo(0, R); c2.lineTo(-R * 0.8, R * 0.3); c2.lineTo(-R * 0.8, -R * 0.45); c2.closePath(); break;
      case 'split': c2.arc(0, -R * 0.42, R * 0.52, Math.PI, 0, false); c2.arc(0, R * 0.42, R * 0.52, 0, Math.PI, false); c2.closePath(); break;
      case 'jugg': c2.rect(-R, -R * 0.72, R * 2, R * 1.44); break;
      case 'boss': c2.arc(0, 0, R, 0, Math.PI * 2); break;
      default: c2.arc(0, 0, R * 0.8, 0, Math.PI * 2);
    }
    c2.fill(); c2.stroke();
  }

  function makeTextures(scene) {
    const mk = (key, size, drawFn) => {
      if (scene.textures.exists(key)) return;
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      drawFn(g);
      g.generateTexture(key, size, size);
      g.destroy();
    };
    mk('dot', 10, g => { g.fillStyle(0xffffff, 1); g.fillCircle(5, 5, 4); });
    mk('soft', 32, g => {
      [15, 11, 7].forEach((r, i) => { g.fillStyle(0xffffff, 0.16 + i * 0.12); g.fillCircle(16, 16, r); });
    });
    mk('ring', 40, g => { g.lineStyle(3, 0xffffff, 1); g.strokeCircle(20, 20, 17); });
    mk('px', 2, g => { g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 2, 2); });
    mk('chev', 22, g => {
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(4, 3, 18, 11, 4, 19);
      g.fillRect(4, 8, 8, 6);
    });
    mk('tbase', 44, g => {
      g.fillStyle(0x101a30, 1);
      g.fillPoints([{ x: 8, y: 2 }, { x: 36, y: 2 }, { x: 42, y: 8 }, { x: 42, y: 36 }, { x: 36, y: 42 }, { x: 8, y: 42 }, { x: 2, y: 36 }, { x: 2, y: 8 }], true);
      g.lineStyle(2, 0x38bdf8, 0.45); g.strokePoints([{ x: 8, y: 2 }, { x: 36, y: 2 }, { x: 42, y: 8 }, { x: 42, y: 36 }, { x: 36, y: 42 }, { x: 8, y: 42 }, { x: 2, y: 36 }, { x: 2, y: 8 }], true);
      g.fillStyle(0x050914, 1); g.fillCircle(22, 22, 13);
      g.lineStyle(1, 0x8fa3c4, 0.4); g.strokeCircle(22, 22, 13);
    });
    D.TOWERS_DATA.forEach(def => {
      const col = Phaser.Display.Color.HexStringToColor(def.color).color;
      for (let lvl = 1; lvl <= D.TOWER_MAX_LVL; lvl++) {
        if (lvl > 1) continue; // v3 PIXEL: só o legado nv1 fica; tiers vêm do PXART (tur_<id>_t<tier>)
        mk('tur_' + def.id + '_1', 62 + Math.min(lvl, 14) * 2, g => {
          const S2 = 31 + Math.min(lvl, 14) * 1.0;
          const scale = 0.92 + Math.min(lvl, 30) * 0.016;
          g.save(); g.translateCanvas(S2, S2); g.scaleCanvas(scale, scale);
          // nave base: sombra + casco + cockpit + motores
          g.fillStyle(0x000000, 0.28); g.fillEllipse(2, 10, 26, 10);
          g.fillStyle(col, 1); g.lineStyle(1.2, 0xffffff, 0.55);
          // ===== NAVES: cada uma com silhueta única de nave =====
          g.lineStyle(1.2, 0xffffff, 0.5);
          if(def.id==='cannon'){ // Corveta Gauss - casco robusto + 2 canhões frontais
            g.fillStyle(col,1);
            g.beginPath(); g.moveTo(0,-18); g.lineTo(10,-4); g.lineTo(8,12); g.lineTo(-8,12); g.lineTo(-10,-4); g.closePath(); g.fillPath(); g.strokePath();
            g.fillStyle(0x0a1226,1); g.fillRect(-6, -2, 12, 8);
            g.fillStyle(0xbfe3ff,0.95); g.fillCircle(0,-6,4);
            g.fillStyle(col,1); g.fillRect(-7, -14, 3, 10); g.fillRect(4, -14, 3, 10);
            // motores
            g.fillStyle(0xfb923c,1); g.fillTriangle(-6,12, -3,18, -9,18); g.fillTriangle(6,12, 3,18, 9,18);
            if(lvl>=10){ g.fillStyle(0xffffff,0.25); g.strokeCircle(0,0,14); }
            if(lvl>=25){ g.fillStyle(0xfbbf24,0.9); g.fillCircle(0,14,2); }
          } else if(def.id==='gatling'){ // Caça Vulcan - caça leve veloz
            g.fillStyle(col,1);
            g.beginPath(); g.moveTo(0,-20); g.lineTo(6,-6); g.lineTo(14,4); g.lineTo(6,12); g.lineTo(-6,12); g.lineTo(-14,4); g.lineTo(-6,-6); g.closePath(); g.fillPath(); g.strokePath();
            g.fillStyle(0x0a1226,1); g.fillEllipse(0,-2,10,7);
            g.fillStyle(0xbfe3ff,1); g.fillEllipse(0,-5,6,4);
            // asas
            g.fillStyle(col,1); g.fillTriangle(-6,-6, -16,2, -6,4); g.fillTriangle(6,-6, 16,2, 6,4);
            g.fillStyle(0xfb923c,1); g.fillRect(-4,12,3,6); g.fillRect(1,12,3,6);
            if(lvl>=15) { g.fillStyle(0xffffff,0.35); g.fillCircle(0,0,12); }
          } else if(def.id==='laser'){ // Destróier de Fótons - nave triangular com cristal
            g.fillStyle(col,1);
            g.beginPath(); g.moveTo(0,-20); g.lineTo(11,10); g.lineTo(0,14); g.lineTo(-11,10); g.closePath(); g.fillPath(); g.strokePath();
            g.fillStyle(0xf43f5e,0.95); g.fillCircle(0,2,5);
            g.lineStyle(1,0xffffff,0.6); g.strokeCircle(0,2,5);
            g.fillStyle(0x0a1226,1); g.fillTriangle(0,-14, -4,-8, 4,-8);
            if(lvl>=10) g.lineStyle(1.5,col,0.5), g.strokeCircle(0,2,10);
          } else if(def.id==='missile'){ // Bombardeiro MIRV - nave pesada com baías
            g.fillStyle(col,1);
            g.beginPath(); g.moveTo(-10,-12); g.lineTo(10,-12); g.lineTo(12,8); g.lineTo(0,14); g.lineTo(-12,8); g.closePath(); g.fillPath(); g.strokePath();
            g.fillStyle(0x0a1226,1); g.fillRect(-8,-8,16,6);
            g.fillStyle(0xbfe3ff,0.9); g.fillRect(-4,-6,8,3);
            g.fillStyle(col,1); g.fillCircle(-6,6,3); g.fillCircle(0,6,3); g.fillCircle(6,6,3);
            if(lvl>=12) { g.fillStyle(0xfb923c,1); g.fillRect(-5,14,3,5); g.fillRect(2,14,3,5); }
          } else if(def.id==='cryo'){ // Fragata Glacial - nave com anéis de gelo
            g.fillStyle(col,1);
            g.beginPath(); g.moveTo(0,-16); g.lineTo(9,0); g.lineTo(7,12); g.lineTo(-7,12); g.lineTo(-9,0); g.closePath(); g.fillPath(); g.strokePath();
            g.lineStyle(2,0x38bdf8,0.85); g.strokeCircle(0,0,11);
            g.fillStyle(0xbfe3ff,0.95); g.fillCircle(0,0,4);
            g.fillStyle(0x0a1226,1); g.fillRect(-2,12,4,5);
            if(lvl>=10) { g.fillStyle(0x38bdf8,0.25); g.fillCircle(0,0,16); }
          } else if(def.id==='tesla'){ // Cruzador Tempestade - nave com bobinas
            g.fillStyle(col,1);
            g.beginPath(); g.moveTo(0,-18); g.lineTo(8,-8); g.lineTo(8,10); g.lineTo(0,14); g.lineTo(-8,10); g.lineTo(-8,-8); g.closePath(); g.fillPath(); g.strokePath();
            g.fillStyle(0xffffff,0.95); g.fillCircle(-4,0,2); g.fillCircle(4,0,2);
            g.fillStyle(0xfde047,1); g.fillRect(-2,-14,4,6);
            g.lineStyle(1.5,0xfde047,0.7); g.strokeCircle(0,0,9);
            if(lvl>=15) g.fillStyle(0x34d399,0.3), g.fillCircle(0,0,13);
          } else if(def.id==='sniper'){ // Espectro Sniper - nave furtiva fina
            g.fillStyle(col,1);
            g.beginPath(); g.moveTo(0,-22); g.lineTo(4,-8); g.lineTo(4,8); g.lineTo(0,14); g.lineTo(-4,8); g.lineTo(-4,-8); g.closePath(); g.fillPath(); g.strokePath();
            g.fillStyle(0x0a1226,1); g.fillRect(-2,-12,4,14);
            g.fillStyle(0x67e8f9,0.95); g.fillCircle(0,-4,2.5);
            g.lineStyle(1,0x67e8f9,0.6); g.strokeRect(-6,-10,12,4);
          } else if(def.id==='venom'){ // Infectador - nave orgânica com esporos
            g.fillStyle(col,1);
            g.fillEllipse(0,0,16,12);
            g.lineStyle(1,0xffffff,0.4); g.strokeEllipse(0,0,16,12);
            g.fillStyle(0x0a1226,1); g.fillCircle(0,0,5);
            g.fillStyle(col,1);
            for(let a=0;a<6;a++){ const ang=a*Math.PI/3; g.fillCircle(Math.cos(ang)*9, Math.sin(ang)*6, 2); }
            g.fillStyle(0xa3e635,0.9); g.fillCircle(0,0,2.5);
          } else if(def.id==='amp'){ // Porta-Naves - nave grande com hangar
            g.fillStyle(col,1);
            g.beginPath(); g.moveTo(-12,-10); g.lineTo(12,-10); g.lineTo(10,10); g.lineTo(-10,10); g.closePath(); g.fillPath(); g.strokePath();
            g.fillStyle(0x0a1226,0.9); g.fillRect(-10,-6,20,8);
            g.fillStyle(col,1); g.fillTriangle(0,-18, -6,-10, 6,-10);
            g.fillStyle(0x38bdf8,0.8); g.fillRect(-8,0,16,2);
            if(lvl>=10) g.strokeCircle(0,0,13);
          } else if(def.id==='rail'){ // Encouraçado Railgun - nave couraçada com trilho
            g.fillStyle(0xd1d5db,1);
            g.fillRect(-10,-14,20,20);
            g.lineStyle(1,0xffffff,0.5); g.strokeRect(-10,-14,20,20);
            g.fillStyle(0x0a1226,1); g.fillRect(-8,-12,16,4);
            g.fillStyle(col,1); g.fillRect(-2,-20,4,22);
            g.fillStyle(0xffffff,1); g.fillRect(-3, -18, 6, 2);
            if(lvl>=15) { g.fillStyle(0x38bdf8,0.4); g.fillRect(-10,6,20,4); }
          } else {
            g.fillStyle(col,1); g.fillCircle(0,0,9); g.strokeCircle(0,0,9);
          }
          // nível: anel dourado a cada 10 níveis
          if(lvl>=10) { g.lineStyle(1.2,0xfbbf24,0.85); g.strokeCircle(0,0,16+Math.floor(lvl/10)*2); }
          if(lvl>=25) { g.lineStyle(1,0xffffff,0.35); g.strokeCircle(0,0,19+Math.floor(lvl/10)*2); }
          if(lvl>=50) { g.fillStyle(0xfbbf24,0.9); g.fillCircle(0,-16,3); }

          g.restore();
        });
      }
    });
    Object.keys(D.ENEMIES_DATA).forEach(type => {
      const def = D.ENEMIES_DATA[type];
      const pad = Math.ceil(def.r * 3) + 8;
      mk('en_' + type, pad, g => { drawEnemyShape(g, def.shape, def.col, def.r); });
    });
  }

  class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }
    create() {
      makeTextures(this);
      this.scene.start('Menu');
    }
  }

  /* ---- DOM dos menus ---- */
  const MenuDOM = {
    built: false, scene: null,
    sel: { mapIdx: 0, diffKey: 'normal', endless: false },

    el(id) { return document.getElementById(id); },
    show() { const m = this.el('screen-menu'); if (m) m.classList.remove('hidden'); this.refresh(); },
    hide() { const m = this.el('screen-menu'); if (m) m.classList.add('hidden'); },

    build(scene) {
      this.scene = scene;
      if (this.built) { this.refresh(); return; }
      this.built = true;
      const grid = this.el('maps-grid');
      grid.innerHTML = '';
      D.MAPS_DATA.forEach((m, i) => {
        const locked = i + 1 > D.Save.data.unlockedMap;
        const card = document.createElement('div');
        card.className = 'map-card chamf' + (locked ? ' locked' : '');
        card.dataset.idx = i;
        card.dataset.theme = m.theme;
        // tema define --tc via CSS [data-theme] e preview via paintPreview unificado
        if(m.theme && window.TILES && window.TILES.THEMES[m.theme]) card.style.setProperty('--tc', window.TILES.THEMES[m.theme].accent);
        const stars = D.Save.data.mapStars[i] || 0;
        const cv = document.createElement('canvas');
        cv.width = 168; cv.height = 104;
        this.paintPreview(cv, m);
        const info = document.createElement('div');
        info.className = 'mc-info';
        info.innerHTML = '<div class="mc-name">' + m.name + '</div><div class="mc-sub">' + m.sub + '</div>' +
          '<div class="m-stars">' + (locked ? '<span class="lock">BLOQUEADO</span>' : '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars)) +
          (D.Save.data.bestEndless[i] ? ' <span class="best">\u221E' + D.Save.data.bestEndless[i] + '</span>' : '') + '</div>';
        card.appendChild(cv); card.appendChild(info);
        card.addEventListener('click', () => {
          if (locked) { SND.error(); return; }
          SND.ui();
          this.sel.mapIdx = i;
          this.refresh();
        });
        grid.appendChild(card);
      });
      // 5 CAMPANHAS NAVINHA x 5 FASES = 25 fases (total 30 com TD)
      const shmupGrid = this.el('shmup-grid');
      const campaigns = (D.NAVE_CAMPAIGNS||D.NAVE_STYLES||[]);
      if(shmupGrid && campaigns.length){
        shmupGrid.innerHTML='';
        campaigns.forEach((camp,i)=>{
          const phases = camp.phases||[camp];
          const prog = (D.Save.data.naveProgress && D.Save.data.naveProgress[camp.id]) || 1;
          const starsArr = (D.Save.data.naveStars && D.Save.data.naveStars[camp.id]) || [0,0,0,0,0];
          const c=document.createElement('div');
          c.className='map-card chamf';
          c.style.borderColor=camp.accent;
          const dots = phases.map((ph,idx)=>{
            const s=starsArr[idx]||0;
            if(idx < prog) return s? '★'.repeat(s)+'☆'.repeat(3-s) : '●';
            return '○';
          }).join(' ');
          const totalStars = starsArr.reduce((a,b)=>a+b,0);
          c.innerHTML=`<canvas width=168 height=80 style="background:${camp.bg};border:1px solid ${camp.accent}22"></canvas><div class=mc-info><div class=mc-name style="color:${camp.accent}">★ ${camp.name.toUpperCase()}</div><div class=mc-sub>${camp.desc}</div><div class=m-stars style="color:${camp.accent}">${dots} • ${phases.length} FASES • ${totalStars}★</div><div class=m-stars style="color:${camp.accent};font-size:10px">▶ CAMPANHA ${prog}/5</div></div>`;
          const cv=c.querySelector('canvas');
          if(cv){
            const ctx2=cv.getContext('2d');
            ctx2.fillStyle=camp.bg; ctx2.fillRect(0,0,cv.width,cv.height);
            ctx2.fillStyle=camp.accent; ctx2.globalAlpha=0.35;
            for(let k=0;k<14;k++) ctx2.fillRect(Math.random()*cv.width, Math.random()*cv.height, 2,2);
            ctx2.globalAlpha=1; ctx2.fillStyle='#fff'; ctx2.font='8px Orbitron'; ctx2.fillText('NAV '+(i+1)+' • '+phases.length+'F',6,14);
            // mini preview fases
            ctx2.fillStyle=camp.accent; ctx2.globalAlpha=0.9;
            for(let p=0;p<5;p++){ const x=10+p*30, y=48; ctx2.fillRect(x,y,22,10); ctx2.fillStyle='#fff'; ctx2.font='7px Orbitron'; ctx2.fillText(String(p+1),x+7,y+8); ctx2.fillStyle=camp.accent; }
          }
          c.addEventListener('click', ()=>{ SND.ui(); MenuDOM.showNaveCampaign(i); });
          shmupGrid.appendChild(c);
        });
      }
      const drow = this.el('diff-row');
      drow.innerHTML = '';
      Object.keys(D.DIFFICULTIES).forEach(k => {
        const d = D.DIFFICULTIES[k];
        const b = document.createElement('button');
        b.className = 'pill chamf';
        b.dataset.diff = k;
        b.style.setProperty('--pc', d.col);
        b.textContent = d.name;
        b.addEventListener('click', () => { SND.ui(); this.sel.diffKey = k; this.refresh(); });
        drow.appendChild(b);
      });
      this.el('opt-endless').addEventListener('change', e => { SND.ui(); this.sel.endless = e.target.checked; this.refresh(); });
      this.el('btn-lab').addEventListener('click', () => { window.__LAST = 'btn-lab'; SND.ui(); this.openLab(); });
      this.el('btn-codex').addEventListener('click', () => { window.__LAST = 'btn-codex'; SND.ui(); this.openCodex(); });
      this.el('btn-ach').addEventListener('click', () => { window.__LAST = 'btn-ach'; SND.ui(); this.openAch(); });
      this.el('btn-start').addEventListener('click', () => { window.__LAST = 'btn-start'; this.start(); });
      ['modal-lab', 'modal-codex', 'modal-ach'].forEach(id => {
        const close = this.el(id).querySelector('.modal-close');
        if (close) close.addEventListener('click', () => { SND.uiBack(); this.el(id).classList.add('hidden'); });
      });
    },

    paintPreview(cv, map) {
      const c2 = cv.getContext('2d');
      const sx = cv.width / BW, sy = cv.height / BH;
      // MAPA NOVO PIXEL ART: fundo em tiles 44px + path em blocos 44x44 (mesma identidade das torres/inimigos)
      const themeInfo = (window.TILES && window.TILES.THEMES[map.theme]) ? window.TILES.THEMES[map.theme] : { bg:'#0a1128', accent:'#38bdf8' };
      c2.fillStyle = themeInfo.bg || '#0a1128'; c2.fillRect(0, 0, cv.width, cv.height);
      c2.fillStyle = '#050914'; c2.globalAlpha = 0.35; c2.fillRect(0,0,cv.width,cv.height); c2.globalAlpha = 1;
      // grid pixel 1px a cada célula
      c2.strokeStyle = 'rgba(56,189,248,0.08)'; c2.lineWidth = 1;
      for(let c=0;c<=COLS;c++){ const x=c*CELL*sx; c2.beginPath(); c2.moveTo(x,0); c2.lineTo(x,cv.height); c2.stroke(); }
      for(let r=0;r<=ROWS;r++){ const y=r*CELL*sy; c2.beginPath(); c2.moveTo(0,y); c2.lineTo(cv.width,y); c2.stroke(); }
      // path em blocos pixel art: cada célula bloqueada desenhada como tile #0d1526 com borda accent
      try{
        const blocked = D.getPathBlockedCells(map.routes);
        const accent = themeInfo.accent || '#38bdf8';
        for(const k in blocked){
          const parts=k.split(','); const c=parseInt(parts[0],10), r=parseInt(parts[1],10);
          if(c<0||c>=COLS||r<0||r>=ROWS) continue;
          const x=c*CELL*sx, y=r*CELL*sy, w=CELL*sx, h=CELL*sy;
          c2.fillStyle = '#0d1526'; c2.fillRect(x+0.5,y+0.5,w-1,h-1);
          c2.strokeStyle = accent; c2.globalAlpha = 0.22; c2.lineWidth = 1; c2.strokeRect(x+0.5,y+0.5,w-1,h-1); c2.globalAlpha = 1;
          // detalhe central 2x2 pixels
          c2.fillStyle = accent; c2.globalAlpha = 0.18; c2.fillRect(x+w/2-1, y+h/2-1, 2,2); c2.globalAlpha = 1;
        }
      }catch(e){
        // fallback vetorial antigo se blocked falhar
        const baseAccent = themeInfo.accent || '#38bdf8';
        map.routes.forEach((wps, ri) => {
          c2.strokeStyle = baseAccent; c2.lineWidth = 2; c2.globalAlpha = 0.7;
          c2.beginPath();
          wps.forEach((w, i) => {
            const x = w[0] * CELL * sx + CELL * sx / 2, y = w[1] * CELL * sy + CELL * sy / 2;
            if (i === 0) c2.moveTo(Math.max(-4, x), y); else c2.lineTo(x, y);
          });
          c2.stroke();
        });
        c2.globalAlpha = 1;
      }
    },

    refresh() {
      [...this.el('maps-grid').children].forEach((card, i) => {
        card.classList.toggle('sel', i === this.sel.mapIdx);
      });
      [...this.el('diff-row').children].forEach(b => {
        b.classList.toggle('sel', b.dataset.diff === this.sel.diffKey);
      });
      this.el('crystals-top').textContent = D.Save.data.crystals;
      const canEndless = (D.Save.data.mapStars[this.sel.mapIdx] || 0) > 0 || (D.Save.data.bestEndless[this.sel.mapIdx] || 0) >= S_ENDLESS_UNLOCK_WAVES;
      this.el('opt-endless-wrap').classList.toggle('disabled', !canEndless);
      if (!canEndless) { this.el('opt-endless').checked = false; this.sel.endless = false; }
    },
    showNaveCampaign(campaignIdx){
      const camps = D.NAVE_CAMPAIGNS||D.NAVE_STYLES||[];
      const camp = camps[campaignIdx]; if(!camp) return;
      const phases = camp.phases||[camp];
      const prog = (D.Save.data.naveProgress && D.Save.data.naveProgress[camp.id]) || 1;
      const starsArr = (D.Save.data.naveStars && D.Save.data.naveStars[camp.id]) || [0,0,0,0,0];
      let selectedShip = localStorage.getItem('nave_last_ship') || D.TOWERS_DATA[0].id;
      const modal=document.createElement('div');
      modal.style.cssText='position:fixed;inset:0;z-index:99;background:rgba(3,7,18,0.90);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
      const box=document.createElement('div');
      box.style.cssText='background:linear-gradient(180deg,#0d1a33,#0a1328);border:1px solid '+camp.accent+';border-top:3px solid '+camp.accent+';padding:18px;max-width:780px;width:92%;max-height:88vh;overflow:auto';
      const render = ()=>{
        let html=`<h2 style="font-family:Orbitron;color:${camp.accent};margin-bottom:6px">★ ${camp.name.toUpperCase()} — 5 FASES</h2><p style="color:#8fa3c4;font-size:12px;margin-bottom:10px">${camp.desc} • Cristais: <b style="color:#fbbf24">${D.Save.data.crystals}</b></p>`;
        html+=`<div style="margin-bottom:12px;padding:8px;background:rgba(0,0,0,0.25);border:1px solid ${camp.accent}33"><div style="font-family:Orbitron;color:${camp.accent};font-size:11px;margin-bottom:6px">ESCOLHA SUA NAVE (1 das 10) — mesmo sistema TD, skill a cada 4 níveis</div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">`;
        D.TOWERS_DATA.forEach(td=>{
          const lvl = (D.Save.data.shipLevels && D.Save.data.shipLevels[td.id]) || 1;
          const sel = td.id===selectedShip ? 'outline:2px solid '+camp.accent+';background:rgba(56,189,248,0.12)' : 'opacity:0.92';
          const cost = 12 + lvl*8;
          const nextSkill = td.skills ? td.skills.find(s=>s.lvl===lvl+1) : null;
          html+=`<button data-ship="${td.id}" style="text-align:left;padding:6px;background:#111e3a;border:1px solid ${td.color};color:#e8eefc;${sel}"><div style="font-size:11px;font-weight:700;color:${td.color}">${td.icon} ${td.name}</div><div style="font-size:10px;color:#8fa3c4">NV ${lvl}/50</div><div style="font-size:9px;color:#fbbf24">${nextSkill? '→ NV'+nextSkill.lvl+' '+nextSkill.name : 'MAX'}</div></button>`;
        });
        html+=`</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">`;
        const selLvl = (D.Save.data.shipLevels[selectedShip]||1);
        const upCost = 12 + selLvl*8;
        const canUp = D.Save.data.crystals >= upCost && selLvl < 50;
        html+=`<button id="btnUpShip" style="padding:5px 10px;background:${canUp?'#1e3a5f':'#334155'};color:${canUp?'#38bdf8':'#64748b'};border:1px solid #38bdf8;font-size:11px" ${canUp?'':'disabled'}>⬆ MELHORAR ${selectedShip.toUpperCase()} NV${selLvl}→${selLvl+1} (${upCost} cristais)</button><span style="font-size:10px;color:#8fa3c4;align-self:center">Auto-tiro + dano escala com nível/skills</span></div></div>`;
        html+=`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">`;
        phases.forEach((ph, idx)=>{
          const unlocked = idx < prog;
          const stars = starsArr[idx]||0;
          const starsTxt = stars? '★'.repeat(stars)+'☆'.repeat(3-stars) : (unlocked?'● Disponível':'○ Bloqueado');
          const bg = unlocked? '#0f172a' : '#0a0f1a';
          const border = unlocked? camp.accent : '#334155';
          const op = unlocked? '1' : '0.45';
          html+=`<button data-phase="${idx}" style="text-align:left;padding:10px;background:${bg};border:1px solid ${border};color:#e8eefc;opacity:${op}" ${unlocked?'':'disabled'}><div style="font-size:11px;font-weight:700;color:${camp.accent}">FASE ${ph.n}: ${ph.name}</div><div style="font-size:10px;color:#8fa3c4">${ph.desc}</div><div style="font-size:10px;color:#fbbf24;margin-top:4px">${ph.target} alvos • ${ph.duration}s • ${ph.speed.toFixed(1)}x</div><div style="font-size:11px;color:${camp.accent};margin-top:4px">${starsTxt}</div><div style="font-size:9px;color:${camp.accent};margin-top:2px">${unlocked?'▶ JOGAR': 'Complete anterior'}</div></button>`;
        });
        html+=`</div><button id="closeNaveCamp" style="margin-top:12px;padding:6px 14px;background:#1e293b;color:#e8eefc;border:1px solid #475569">✕ FECHAR</button>`;
        return html;
      };
      box.innerHTML=render();
      modal.appendChild(box); document.body.appendChild(modal);
      const bind = ()=>{
        box.querySelectorAll('[data-ship]').forEach(b=> b.addEventListener('click', ()=>{
          selectedShip=b.getAttribute('data-ship');
          localStorage.setItem('nave_last_ship', selectedShip);
          SND.ui(); box.innerHTML=render(); bind();
        }));
        const upBtn=box.querySelector('#btnUpShip');
        if(upBtn) upBtn.addEventListener('click', ()=>{
          const lvl=(D.Save.data.shipLevels[selectedShip]||1);
          const cost=12+lvl*8;
          if(D.Save.data.crystals>=cost && lvl<50){
            D.Save.data.crystals-=cost;
            D.Save.data.shipLevels[selectedShip]=lvl+1;
            D.Save.save(); SND.buy();
            box.innerHTML=render(); bind();
            MenuDOM.refresh();
          } else SND.error();
        });
        box.querySelectorAll('[data-phase]').forEach(b=> b.addEventListener('click', ()=>{
          const idx=parseInt(b.getAttribute('data-phase'));
          document.body.removeChild(modal);
          const sc = MenuDOM.scene || window.__game.scene.getScene('Menu');
          const payload={ campaignIdx, phaseIdx: idx, stageIdx: idx, shipId: selectedShip, diffKey: MenuDOM.sel.diffKey };
          try{
            if(sc && sc.cameras && sc.cameras.main && sc.cameras.main.fadeOut){
              sc.cameras.main.fadeOut(180);
              sc.time.delayedCall(200, ()=> { try{ sc.scene.start('Nave', payload);}catch(e){ window.__game.scene.start('Nave', payload);} });
            } else if(sc && sc.scene) sc.scene.start('Nave', payload);
            else window.__game.scene.start('Nave', payload);
          }catch(e){ try{ window.__game.scene.start('Nave', payload);}catch(_){} }
        }));
        box.querySelector('#closeNaveCamp').addEventListener('click', ()=> document.body.removeChild(modal));
        modal.addEventListener('click', (e)=>{ if(e.target===modal) document.body.removeChild(modal); });
      };
      bind();
    },

    start() {
      const sel = this.sel;
      const unlockedOk = sel.mapIdx + 1 <= D.Save.data.unlockedMap;
      if (!unlockedOk) { SND.error(); return; }
      D.Save.data.lastDiff = sel.diffKey;
      D.Save.save();
      SND.buy();
      this.hide();
      const sc = this.scene || (window.__game && window.__game.scene.getScene('Menu'));
      const payload = { mapIdx: sel.mapIdx, diffKey: sel.diffKey, endless: sel.endless };
      try{
        if(sc && sc.cameras && sc.cameras.main && sc.cameras.main.fadeOut){
          sc.cameras.main.fadeOut(240);
          sc.time.delayedCall(260, () => { try{ sc.scene.start('Game', payload); } catch(e){ window.__game.scene.start('Game', payload); }});
        } else if(sc && sc.scene){
          sc.scene.start('Game', payload);
        } else {
          window.__game.scene.start('Game', payload);
        }
      }catch(e){ console.error('[Menu start]', e); try{ window.__game.scene.start('Game', payload);}catch(_){} }
    },

    openLab() {
      const wrap = this.el('lab-grid');
      wrap.innerHTML = '';
      this.el('lab-crystals').textContent = D.Save.data.crystals;
      D.TECH_UPGRADES.forEach(t => {
        const lvl = techLvl(t.id);
        const maxed = lvl >= t.max;
        const cost = Math.round(t.cost * Math.pow(1.5, lvl));
        const card = document.createElement('div');
        card.className = 'tech-card chamf';
        card.innerHTML = '<div class="tc-head">' + t.name + '</div><div class="tc-desc">' + t.desc + '</div>' +
          '<div class="tc-pips">' + Array.from({ length: t.max }, (_, i) => '<i class="' + (i < lvl ? 'on' : '') + '"></i>').join('') + '</div>';
        const btn = document.createElement('button');
        btn.className = 'btn small';
        btn.textContent = maxed ? 'MÁXIMO' : 'MELHORAR \u2022 ' + cost;
        btn.disabled = maxed || D.Save.data.crystals < cost;
        btn.addEventListener('click', () => {
          if (D.Save.data.crystals < cost) return;
          D.Save.data.crystals -= cost;
          D.Save.data.tech[t.id] = lvl + 1;
          D.Save.save();
          SND.upgrade();
          this.openLab(); this.refresh();
        });
        card.appendChild(btn);
        wrap.appendChild(card);
      });
      this.el('modal-lab').classList.remove('hidden');
    },

    openCodex() {
      const wrap = this.el('codex-grid');
      wrap.innerHTML = '';
      Object.keys(D.ENEMIES_DATA).forEach(type => {
        const def = D.ENEMIES_DATA[type];
        const card = document.createElement('div');
        card.className = 'codex-card chamf' + (def.isBoss ? ' boss' : '');
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
        const c2 = cv.getContext('2d');
        // IDENTIDADE UNIFICADA: usa sprite pixel 'en_<type>' (mesma arte do jogo) em vez de vetorial
        let drew = false;
        try {
          const scene = this.scene || (window.__game && window.__game.scene && window.__game.scene.getScene('Menu')) || null;
          if (scene && scene.textures && scene.textures.exists('en_' + type)) {
            const tex = scene.textures.get('en_' + type);
            const src = tex.getSourceImage();
            if (src && src.width) {
              c2.imageSmoothingEnabled = false;
              const scale = Math.min(56 / src.width, 56 / src.height);
              const w = src.width * scale, h = src.height * scale;
              c2.drawImage(src, 32 - w / 2, 32 - h / 2, w, h);
              drew = true;
            }
          }
          if (!drew && window.PXART && window.PXART.ENEMY_ART) {
            const artMap = window.PXART.ENEMY_ART;
            let art = artMap[type];
            if (!art) {
              const baseT = (def.variantOf || type.split('_')[0]);
              art = artMap[baseT] || artMap.drone;
            }
            if (art) {
              const pal = window.PXART.enemyPalette ? window.PXART.enemyPalette(def.col) : { K: '#000000', W: '#ffffff', G: '#bfe3ff', M: '#8b95a8', C: def.col, D: def.col, L: def.col, E: def.col, R: '#f43f5e', Y: '#fbbf24', P: '#a78bfa', N: '#34d399', B: '#60a5fa', O: '#f97316' };
              const PX = (window.TOKENS && window.TOKENS.PIXEL && window.TOKENS.PIXEL.PX) || 3;
              let maxW = 0; for (const r of art) maxW = Math.max(maxW, r.length);
              const pxW = maxW * PX, pxH = art.length * PX;
              const offX = Math.floor((64 - pxW) / 2), offY = Math.floor((64 - pxH) / 2);
              for (let y = 0; y < art.length; y++) {
                const row = art[y];
                for (let x = 0; x < row.length; x++) {
                  const ch = row[x];
                  if (ch === ' ' || ch === '.') continue;
                  const c = pal[ch];
                  if (!c) continue;
                  c2.fillStyle = c;
                  c2.fillRect(offX + x * PX, offY + y * PX, PX, PX);
                }
              }
              drew = true;
            }
          }
        } catch (e) {}
        if (!drew) { c2.save(); c2.translate(32, 32); paintEnemyShape2d(c2, def.shape, def.col, def.r * 1.4); c2.restore(); }
        const traits = [];
        if (def.flying) traits.push('VOADOR \u26a0 anti-aéreo necessário');
        if (def.stealth) traits.push('Camuflagem cíclica');
        if (def.shield) traits.push('Escudo ' + def.shield);
        if (def.armor) traits.push('Armadura ' + def.armor);
        if (def.heals) traits.push('Cura aliados');
        if (def.onDeathStun) traits.push('PEM ao morrer');
        if (def.splits) traits.push('Divide-se ao morrer');
        if (def.slowImmune) traits.push('Imune a lentidão');
        if (def.isBoss) traits.push('CHEFE \u2014 barra dedicada');
        card.appendChild(cv);
        card.insertAdjacentHTML('beforeend',
          '<div class="cc-name" style="color:' + def.col + '">' + def.label + '</div>' +
          '<div class="cc-stats">HP ' + def.hp + ' • VEL ' + def.spd + ' • OURO ' + def.gold + (def.dmg > 1 ? ' • DANO ' + def.dmg : '') + '</div>' +
          '<div class="cc-traits">' + traits.join('<br>') + '</div>');
        wrap.appendChild(card);
      });
      this.el('modal-codex').classList.remove('hidden');
    },

    openAch() {
      const wrap = this.el('ach-grid');
      wrap.innerHTML = '';
      D.ACHIEVEMENTS.forEach(a => {
        const got = D.Save.data.achievements.indexOf(a.id) >= 0;
        const card = document.createElement('div');
        card.className = 'ach-card chamf' + (got ? ' got' : '');
        card.innerHTML = '<div class="ac-icon">' + a.icon + '</div><div class="ac-name">' + a.name + '</div><div class="ac-desc">' + a.desc + '</div>';
        wrap.appendChild(card);
      });
      this.el('modal-ach').classList.remove('hidden');
    }
  };
  const S_ENDLESS_UNLOCK_WAVES = 12;

  class MenuScene extends Phaser.Scene {
    constructor() { super('Menu'); }
    create() {
      this.cameras.main.fadeIn(300);
      SND.unlock();
      SND.musicTick('menu');
      makeTextures(this);
      if (!this.textures.exists('stars1')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        for (let i = 0; i < 90; i++) {
          g.fillStyle(0xffffff, 0.25 + Math.random() * 0.75);
          g.fillCircle(Math.random() * 512, Math.random() * 320, Math.random() < 0.85 ? 1 : 2);
        }
        g.generateTexture('stars1', 512, 320); g.destroy();
      }
      this.starsA = this.add.tileSprite(BW / 2, BH / 2, BW, BH, 'stars1').setAlpha(0.7);
      this.starsB = this.add.tileSprite(BW / 2, BH / 2, BW, BH, 'stars1').setAlpha(0.35).setScale(1.6);
      [ '#38bdf8', '#f43f5e', '#34d399' ].forEach((c, i) => {
        const img = this.add.image(140 + i * 330, 120 + (i % 2) * 330, 'soft')
          .setTint(Phaser.Display.Color.HexStringToColor(c).color)
          .setScale(9 - i).setAlpha(0.10);
        this.tweens.add({ targets: img, alpha: 0.16, scale: (9 - i) * 1.15, duration: 5200 + i * 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      });
      MenuDOM.build(this);
      MenuDOM.show();
      this.input.once('pointerdown', () => SND.unlock());
    }
    update(_, dms) {
      this.starsA.tilePositionX += dms * 0.018;
      this.starsB.tilePositionX -= dms * 0.008;
    }
    shutdown() { MenuDOM.hide(); SND.laserStopAll(); }
  }

  /* ---- GameScene ---- */
  const THEME_BG = {
    'space-station': { base: 0x0a1128, accent: '#38bdf8' },
    'asteroid-field': { base: 0x0b1220, accent: '#94a3b8' },
    'solar-furnace': { base: 0x14090c, accent: '#fb923c' },
    'ion-nebula': { base: 0x081420, accent: '#22d3ee' },
    'singularity': { base: 0x07040e, accent: '#f43f5e' },
    // Sistema Solar temático — 8 planetas + luas
    'mercury': { base: 0x1a1208, accent: '#f59e0b' },
    'venus': { base: 0x1a0f08, accent: '#fbbf24' },
    'mars': { base: 0x1a0a08, accent: '#f43f5e' },
    'luna': { base: 0x0f1420, accent: '#94a3b8' },
    'europa': { base: 0x0a1a2a, accent: '#38bdf8' },
    'titan': { base: 0x140f1a, accent: '#f59e0b' },
    'uranus': { base: 0x0a1a2a, accent: '#22d3ee' },
    'triton': { base: 0x0a0f1e, accent: '#38bdf8' },
    'solar-system': { base: 0x020617, accent: '#a78bfa' }
  };

  class GameScene extends Phaser.Scene {
    constructor() { super('Game'); }

    create(data) {
      SND.unlock();
      D.Save.load();
      SND.setMuted(!!D.Save.data.muted);
      const mapIdx = (data && data.mapIdx) || 0;
      const diffKey = (data && data.diffKey) || 'normal';
      const endless = !!(data && data.endless);
      this.params = { mapIdx, diffKey, endless };
      this.S = startNewGame(mapIdx, diffKey, endless);
      this.paused = false;
      this.speedIdx = 0;
      this.speeds = [1, 2, 4];
      this.armed = null;
      this.placingId = null;
      this.selected = null;
      this.zaps = []; this.tracers = []; this.spawners = [];
      this.enemyViews = {}; this.towerViews = {};
      this.pointerWorld = { x: 0, y: 0 };
      this.hoverCell = { c: -1, r: -1 };
      this._lastCredits = -1; this._lastLives = -1;
      this._lastWave = -1; this._waveTotal = 1;

      const scr = document.getElementById('topbar');
      if (scr) scr.classList.remove('off');
      const shop = document.getElementById('shopbar');
      if (shop) shop.classList.remove('off');
      hideOverlay('modal-end'); hideOverlay('pause-overlay');

      this.cameras.main.fadeIn(320);
      this.buildStatic();
      this.buildFxLayers();
      this.buildShopDom();
      this.buildSupersDom();
      this.bindInput();

      SND.musicTick('combat', 0);
      this.toastTimer = this.time.addEvent({ delay: 700, loop: true, callback: () => this.pollToasts() });
      this.events.once('shutdown', () => this.cleanup());
    }

    cleanup() {
      SND.laserStopAll();
      const scr = document.getElementById('topbar');
      if (scr) scr.classList.add('off');
      const shop = document.getElementById('shopbar');
      if (shop) shop.classList.add('off');
      hideOverlay('modal-end'); hideOverlay('pause-overlay'); hideTip();
      ['banner'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
    }

    /* ---------- construção estática ---------- */
    buildStatic() {
      const theme = THEME_BG[this.S.map.theme] || THEME_BG['space-station'];
      // FUNDO base navy
      this.add.rectangle(BW / 2, BH / 2, BW, BH, theme.base);
      // MAPA NOVO PIXEL ART: fundo em tiles 44x44 por tema (mesma identidade das torres/inimigos)
      const mapTheme = this.S.map.theme;
      const bgTileKey = 'tile_bg_' + mapTheme;
      const bgTileAlt = 'tile_' + mapTheme + '_a';
      const bgKey = (this.textures.exists(bgTileKey) ? bgTileKey : (this.textures.exists(bgTileAlt) ? bgTileAlt : null));
      if(bgKey){
        this.bgTile = this.add.tileSprite(BW/2, BH/2, BW, BH, bgKey).setDepth(0).setAlpha(0.95);
        // pixel crisp: desativa suavização
        if(this.bgTile.setTileScale) this.bgTile.setTileScale(1);
      }
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xffffff, 1);
      for (let i = 0; i < 70; i++) g.fillCircle(Math.random() * BW, Math.random() * BH, Math.random() < 0.9 ? 1 : 2);
      g.generateTexture('bgstars', BW, BH); g.destroy();
      this.add.image(BW / 2, BH / 2, 'bgstars').setAlpha(0.35).setDepth(1);

      // GRID pixel art: linhas 1px a cada 44px com alpha .06 (snap inteiro)
      this.gridGfx = this.add.graphics().setDepth(2);
      this.gridGfx.lineStyle(1, 0x38bdf8, 0.06);
      for (let c = 0; c <= COLS; c++) { this.gridGfx.lineBetween(c * CELL, 0, c * CELL, BH); }
      for (let r = 0; r <= ROWS; r++) { this.gridGfx.lineBetween(0, r * CELL, BW, r * CELL); }

      // ROTA PIXEL ART: blocos 44x44 por célula bloqueada (mesmo material das torres) — DEPTH BAIXO (atrás dos inimigos)
      this.pathTiles = [];
      const pathKey = 'tile_path_' + mapTheme;
      const hasPathTile = this.textures.exists(pathKey);
      if(hasPathTile){
        for(const k in this.S.blocked){
          const parts = k.split(','); const c = parseInt(parts[0],10), r = parseInt(parts[1],10);
          if(c<0||c>=COLS||r<0||r>=ROWS) continue;
          const t = this.add.image(c*CELL + CELL/2, r*CELL + CELL/2, pathKey).setDepth(2).setAlpha(0.92);
          this.pathTiles.push(t);
        }
      }
      // Mantém routeGfx vetorial como overlay sutil para bordas (agora mais fino, pixel snap) — também atrás dos inimigos
      this.routeGfx = this.add.graphics().setDepth(3);
      const accent = Phaser.Display.Color.HexStringToColor(theme.accent).color;
      this.S.routes.forEach(pts => {
        this.routeGfx.lineStyle(1.5, accent, 0.22);
        this.drawPath(this.routeGfx, pts);
      });
      this.dashGfx = this.add.graphics().setDepth(4);
      this.dashOffset = 0;

      // Portal base (saída)
      const exitPts = this.S.routes[0];
      const last = exitPts[exitPts.length - 1];
      this.portalPos = { x: last.x, y: last.y };
      this.portalCore = this.add.image(last.x, last.y, 'soft').setTint(0x38bdf8).setScale(3.4).setAlpha(0.9);
      this.portalRing = this.add.image(last.x, last.y, 'ring').setTint(0x38bdf8).setScale(2.2);
      this.tweens.add({ targets: this.portalRing, angle: 360, duration: 9000, repeat: -1 });
      this.tweens.add({ targets: this.portalCore, alpha: 0.45, scale: 3.0, duration: 1100, yoyo: true, repeat: -1 });

      // Marcadores de entrada
      this.spawnMarkers = [];
      this.S.routes.forEach(pts => {
        const first = pts[0];
        const m1 = this.add.image(Math.max(10, first.x), first.y, 'chev').setTint(accent).setAlpha(0.8);
        const m2 = this.add.image(Math.max(10, first.x) + 16, first.y, 'chev').setTint(accent).setAlpha(0.45);
        this.spawnMarkers.push(m1, m2);
      });

      this.uiGfx = this.add.graphics().setDepth(60);
    }

    drawPath(g, pts) {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
    }

    buildFxLayers() {
      this.fxUnder = this.add.container(0, 0).setDepth(20);
      this.projLayer = this.add.container(0, 0).setDepth(40);
      this.fxOver = this.add.container(0, 0).setDepth(50);
      this.beamGfx = this.scene ? this.add.graphics().setDepth(45) : null;
      this.vortexGfx = this.add.graphics().setDepth(21);
      this.floatLayer = this.add.container(0, 0).setDepth(70);
      this.pools = {};
      this.floatPool = [];
      this.activeFloats = [];
    }

    getImg(key) {
      if (!this.pools[key]) this.pools[key] = [];
      const arr = this.pools[key];
      for (const img of arr) if (!img.active) { img.setActive(true).setVisible(true); return img; }
      const img = this.add.image(0, 0, key);
      img.setActive(true);
      arr.push(img);
      return img;
    }

    spark(x, y, colHex, n, spd, life, key) {
      const col = typeof colHex === 'string' ? Phaser.Display.Color.HexStringToColor(colHex).color : colHex;
      for (let i = 0; i < n; i++) {
        const p = this.getImg(key || 'dot');
        p.setTexture(key || 'dot').setTint(col);
        p.x = x; p.y = y;
        const a = Math.random() * Math.PI * 2;
        const v = spd * (0.4 + Math.random() * 0.8);
        p.setData && p.setData('vx', Math.cos(a) * v);
        p.setData && p.setData('vy', Math.sin(a) * v);
        p.setData && p.setData('life', life * (0.6 + Math.random() * 0.7));
        p.setData && p.setData('tot', p.getData('life'));
        p.setScale(0.6 + Math.random() * 0.7);
        p.setAlpha(1);
        if (!p._inLayer) { this.fxOver.add(p); p._inLayer = true; }
      }
    }

    boomFx(x, y, r, col, big) {
      const flash = this.getImg('soft');
      flash.setTexture('soft').setTint(0xffffff).setPosition(x, y).setScale(r / 12).setAlpha(0.95);
      flash.setData && flash.setData('life', 0.14), flash.setData && flash.setData('tot', 0.14);
      flash.setData && flash.setData('vx', 0), flash.setData && flash.setData('vy', 0);
      if (!flash._inLayer) { this.fxOver.add(flash); flash._inLayer = true; }
      this.spark(x, y, '#ffffff', big ? 14 : 7, r * 4.5, 0.5);
      this.spark(x, y, col, big ? 20 : 9, r * 3.2, 0.65);
      this.spark(x, y, '#64748b', big ? 8 : 4, r * 2.0, 0.9);
      const ring = this.getImg('ring');
      ring.setTexture('ring').setTint(0xffffff).setPosition(x, y).setScale(0.3).setAlpha(0.9);
      ring.setData && ring.setData('life', 0.32), ring.setData && ring.setData('tot', 0.32);
      ring.setData && ring.setData('vx', 0), ring.setData && ring.setData('vy', 0);
      ring.setData && ring.setData('grow', r / 17);
      if (!ring._inLayer) { this.fxOver.add(ring); ring._inLayer = true; }
      this.cameras.main.shake(big ? 260 : 130, (big ? 0.010 : 0.004));
    }

    floatTxt(x, y, txt, col, size) {
      if (this.activeFloats.length > 46) {
        const old = this.activeFloats.shift();
        if (old && old.txt) { old.txt.setVisible(false); this.floatPool.push(old.txt); }
      }
      let t = this.floatPool.pop();
      if (!t) t = this.add.text(0, 0, '', { fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold' });
      t.setVisible(true).setText(txt).setColor(col || '#fff').setFontSize(size || 11).setPosition(x, y).setAlpha(1).setScale(1);
      this.floatLayer.add(t);
      const item = { txt: t, life: 0.9 };
      this.activeFloats.push(item);
      return item;
    }

    /* ---------- DOM: loja / supers / painel ---------- */
    el(id) { return document.getElementById(id); }

    buildShopDom() {
      const bar = this.el('shopbar');
      bar.innerHTML = '';
      D.TOWERS_DATA.forEach(def => {
        const card = document.createElement('div');
        card.className = 'shop-card chamf';
        card.style.setProperty('--tc', def.color);
        card.dataset.id = def.id;
        const st = { dmg: def.dmg, rng: def.rng, rate: def.rate || def.dmg / 2 };
        card.innerHTML =
          '<div class="sc-icon" style="color:' + def.color + '">' + def.icon + '</div>' +
          '<div class="sc-body"><div class="sc-name">' + def.name + '</div>' +
          '<div class="sc-cost">$' + def.cost + '</div></div>';
        const dps = def.kind === 'beam' ? '~' + def.dmg + '/s' : (def.rate ? '~' + Math.round(def.dmg * def.rate) + ' DPS' : 'suporte');
        // v3 PIXEL FASE 6: secao LOGICA DE TIER no tooltip da loja
        let tierTip = '';
        const tl = D.TIER_LOGIC[def.id] || {};
        [2, 3, 4, 5].forEach(tr => {
          if (tl[tr]) tierTip += '<span style="color:' + (tr >= 4 ? '#fbbf24' : '#8fa3c4') + '">T' + tr + ':</span> ' + tl[tr].name + ' — ' + tl[tr].desc + '<br>';
        });
        const superTip = D.SUPERS_AUTO[def.id] ? '<br><b style="color:#fde047">★ SUPER AUTO:</b> ' + D.SUPERS_AUTO[def.id].name + ' — ' + D.SUPERS_AUTO[def.id].desc + '<br>' : '';
        const tipHtml =
          '<b style="color:' + def.color + '">' + def.name + '</b><br>' +
          '<span class="tt-muted">' + def.desc + '</span><br>' +
          'DANO ' + def.dmg + (def.kind === 'beam' ? '/s' : '') + ' • ALCANCE ' + def.rng +
          (def.rate ? ' • CADÊNCIA ' + def.rate + '/s' : '') + '<br>' +
          '<b>' + dps + '</b>' + (def.splash ? ' • ÁREA ' + def.splash : '') + '<br>' +
          '<span class="tt-good">Nv4\u25B8A:</span> ' + def.specA.name + ' \u2014 ' + def.specA.desc + '<br>' +
          '<span class="tt-good">Nv4\u25B8B:</span> ' + def.specB.name + ' \u2014 ' + def.specB.desc + '<br>' +
          '<div style="margin-top:4px;padding-top:3px;border-top:1px solid #334155"><b style="color:#38bdf8">LÓGICA DE TIER</b><br>' + tierTip + '</div>' +
          superTip;
        this.bindTip(card, tipHtml);
        card.addEventListener('click', () => {
          SND.ui();
          if (this.S.credits < def.cost) { SND.error(); return; }
          this.placingId = (this.placingId === def.id) ? null : def.id;
          this.selected = null;
          this.refreshShopSel();
        });
        bar.appendChild(card);
      });
      // v3 PIXEL FASE 5: card PRÓPRIO da Fábrica (borda verde, recurso peças)
      (() => {
        const fd = D.FACTORY_DATA;
        const card = document.createElement('div');
        card.className = 'shop-card chamf';
        card.style.setProperty('--tc', fd.color);
        card.style.borderColor = '#34d399';
        card.dataset.id = 'factory';
        card.innerHTML =
          '<div class="sc-icon" style="color:' + fd.color + '">⚙</div>' +
          '<div class="sc-body"><div class="sc-name" style="color:#34d399">' + fd.name + '</div>' +
          '<div class="sc-cost">$' + fd.cost + '</div></div>';
        this.bindTip(card,
          '<b style="color:#34d399">' + fd.name + '</b><br>' +
          '<span class="tt-muted">' + fd.desc + '</span><br>' +
          'POR ONDA COMPLETA: <b>+10⚙ +$18</b> × nível<br>' +
          'NÃO combate • Upgrades com créditos + peças • Venda 70%');
        card.addEventListener('click', () => {
          SND.ui();
          if (this.S.credits < fd.cost) { SND.error(); return; }
          this.placingId = (this.placingId === 'factory') ? null : 'factory';
          this.selected = null;
          this.refreshShopSel();
        });
        bar.appendChild(card);
      })();
    }

    refreshShopSel() {
      [...this.el('shopbar').children].forEach(c => {
        c.classList.toggle('sel', c.dataset.id === this.placingId);
      });
    }

    buildSupersDom() {
      const box = this.el('supers');
      box.innerHTML = '';
      Object.keys(D.SUPERS).forEach(k => {
        const meta = D.SUPERS[k];
        const b = document.createElement('button');
        b.className = 'super-btn chamf';
        b.id = 'super-' + k;
        b.style.setProperty('--sc', meta.color);
        b.innerHTML =
          '<span class="sb-hot">' + meta.hot + '</span>' +
          '<span class="sb-name">' + meta.name.split(' ')[0].toUpperCase() + '</span>' +
          '<span class="sb-cd"></span>';
        this.bindTip(b, '<b style="color:' + meta.color + '">' + meta.name + ' [' + meta.hot + ']</b><br><span class="tt-muted">' + meta.desc + '</span><br>Recarga: ' + meta.maxCd + 's');
        b.addEventListener('click', () => this.triggerSuper(k));
        box.appendChild(b);
      });
    }

    triggerSuper(k) {
      const meta = D.SUPERS[k];
      const p = this.S.powers[k];
      if (!p || p.cd > 0) { SND.error(); return; }
      if (meta.targeted) {
        this.armed = (this.armed === k) ? null : k;
        SND.ui();
      } else {
        applySuper(this.S, k, 0, 0);
        SND.ui();
      }
    }

    /* ---------- painel da torre selecionada ---------- */
    showTowerPanel(t) {
      const panel = this.el('tower-panel');
      panel.classList.remove('hidden');
      const def = t.defRef;
      // v3 PIXEL FASE 5: painel próprio da fábrica
      if (def.kind === 'factory') return this.showFactoryPanel(t);
      const stats = getTowerStats(this.S, t);
      // v3 PIXEL FASE 2/6: badge de tier no painel
      const tierBadge = '<span style="font-family:JetBrains Mono;font-size:10px;font-weight:800;color:' +
        (D.getTier(t.level) >= 5 ? '#fbbf24' : '#38bdf8') + ';margin-left:6px">T' + D.getTier(t.level) + (t.level >= D.TOWER_MAX_LVL ? ' MESTRE ★' : '') + '</span>';
      this.el('tp-icon').textContent = def.icon;
      this.el('tp-icon').style.color = def.color;
      this.el('tp-name').textContent = def.name;
      // ULTRA: mostra nível 1-50 como número + barra + tier dots
      const pct = Math.round(t.level / D.TOWER_MAX_LVL * 100);
      this.el('tp-level').innerHTML = '<span style="font-family:JetBrains Mono;font-size:10px;font-weight:800;color:var(--gold);margin-right:6px">NV '+t.level+'/'+D.TOWER_MAX_LVL+'</span><span style="font-size:9px;color:var(--muted)">'+pct+'%</span>' + tierBadge;
      this.el('tp-stats').innerHTML =
        '<div><span>DANO</span><b>' + Math.round(stats.dmg) + (def.kind === 'beam' ? '/s' : '') + '</b></div>' +
        '<div><span>ALCANCE</span><b>' + Math.round(stats.rng) + '</b></div>' +
        '<div><span>CADÊNCIA</span><b>' + (stats.rate ? stats.rate.toFixed(2) + '/s' : '\u2014') + '</b></div>' +
        '<div><span>DPS</span><b>' + Math.round(computeDps(t)) + '</b></div>';
      this.el('tp-target').textContent = '\u25C8 ' + t.targetMode;
      const specBox = this.el('tp-specs');
      specBox.innerHTML = '';
      if (t.specBranch) {
        const sp = t.specBranch === 'A' ? def.specA : def.specB;
        specBox.innerHTML = '<div class="spec-chosen"><b>NV4\u25B8' + t.specBranch + ':</b> ' + sp.name + ' \u2014 ' + sp.desc + '</div>';
      } else if (t.level >= 4) {
        ['A', 'B'].forEach(br => {
          const sp = br === 'A' ? def.specA : def.specB;
          const btn = document.createElement('button');
          btn.className = 'btn small spec-btn';
          btn.innerHTML = '<b>\u25B8' + br + ' ' + sp.name + '</b><br><span>' + sp.desc + '</span>';
          btn.addEventListener('click', () => { setSpec(this.S, t, br); this.showTowerPanel(t); });
          specBox.appendChild(btn);
        });
      } else {
        specBox.innerHTML = '<div class="spec-chosen tt-muted">Especializações desbloqueiam no nível 4.</div>';
      }
      const up = this.el('tp-upgrade');
      const tier = D.getTier(t.level);
      const isFactory = def.kind === 'factory';
      if (!isFactory && t.level >= tierCap(t)) {
        // v3 PIXEL FASE 2: botão vira FUNDIR no teto do tier
        const cands = mergeCandidates(this.S, t);
        const partsCost = D.MERGE_PARTS[tier] || 0;
        const ok = cands.length >= 2 && (this.S.parts || 0) >= partsCost;
        up.textContent = 'FUNDIR (2/3: ' + cands.length + ') • ' + partsCost + '⚙';
        up.disabled = !ok;
        up.title = 'Consome esta torre + 2 iguais do mesmo tier → T' + (tier + 1) + ' nv ' + (tier * 10 + 1);
      } else if (isFactory) {
        const pc = D.FACTORY_DATA.upgradePartsCost(t.level), cc = D.FACTORY_DATA.upgradeCreditCost(t.level);
        if (t.level >= D.FACTORY_DATA.maxLevel) { up.textContent = 'FÁBRICA NO MÁXIMO • NV5'; up.disabled = true; }
        else { up.textContent = 'MELHORAR • $' + cc + ' + ' + pc + '⚙'; up.disabled = this.S.credits < cc || (this.S.parts || 0) < pc; }
      } else if (t.level >= D.TOWER_MAX_LVL) { up.textContent = 'NÍVEL MÁXIMO • 50'; up.disabled = true; }
      else {
        const cost = upgradeCost(t);
        up.textContent = 'MELHORAR • $' + cost;
        up.disabled = this.S.credits < cost;
      }
      this.el('tp-sell').textContent = 'VENDER \u2022 $' + sellValue(t);
      // v3 PIXEL FASE 6: seção LÓGICA DE TIER (ativa + próximas) e carga do super
      (() => {
        const tier = D.getTier(t.level);
        const tl = D.TIER_LOGIC[def.id] || {};
        const box = document.createElement('div');
        box.style.cssText = 'margin-top:6px;padding:6px 8px;background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.16);font-size:11px;line-height:1.45';
        let html = '<div style="color:#38bdf8;font-weight:700;margin-bottom:3px">⬢ LÓGICA DE TIER</div>';
        [2, 3, 4, 5].forEach(tr => {
          if (!tl[tr]) return;
          const on = tr <= tier;
          html += '<div style="color:' + (on ? '#34d399' : '#8fa3c4') + '">' + (on ? '✔' : '○') + ' <b>T' + tr + '</b> — ' + tl[tr].name + ': ' + tl[tr].desc + '</div>';
        });
        const sa = D.SUPERS_AUTO[def.id];
        if (sa) {
          const sc = getSuperCharge(this.S, t);
          html += '<div style="color:#fde047;margin-top:3px">★ SUPER AUTO: ' + sa.name + ' (' + Math.round(sc.pct * 100) + '%)</div>';
        }
        box.innerHTML = html;
        const specBox2 = this.el('tp-specs');
        const old = specBox2.querySelector('.tierlogic-info');
        if (old) old.remove();
        box.className = 'tierlogic-info';
        specBox2.appendChild(box);
      })();
    }

    hideTowerPanel() {
      const panel = this.el('tower-panel');
      if (panel) panel.classList.add('hidden');
    }

    /* v3 PIXEL FASE 5: painel da fábrica (produção + próximo nível) */
    showFactoryPanel(t) {
      const el = this.el.bind(this);
      const fd = D.FACTORY_DATA;
      el('tp-icon').textContent = '⚙';
      el('tp-icon').style.color = fd.color;
      el('tp-name').textContent = fd.name;
      const pct = Math.round(t.level / fd.maxLevel * 100);
      el('tp-level').innerHTML = '<span style="font-family:JetBrains Mono;font-size:10px;font-weight:800;color:#34d399;margin-right:6px">FÁBRICA NV ' + t.level + '/' + fd.maxLevel + '</span><span style="font-size:9px;color:var(--muted)">' + pct + '%</span>';
      const p = fd.partsPerWave(t.level), cr = fd.creditsPerWave(t.level);
      const np = fd.partsPerWave(t.level + 1), ncr = fd.creditsPerWave(t.level + 1);
      el('tp-stats').innerHTML =
        '<div><span>PRODUZ/ONDA</span><b style="color:#34d399">+' + p + '⚙ +$' + cr + '</b></div>' +
        '<div><span>PRÓX. NÍVEL</span><b style="color:var(--muted)">+' + np + '⚙ +$' + ncr + '</b></div>' +
        '<div><span>VENDA</span><b>$' + sellValue(t) + '</b></div>' +
        '<div><span>MODO</span><b style="color:var(--muted)">industrial</b></div>';
      el('tp-target').textContent = '◇ SEM ALVO';
      const specBox = el('tp-specs');
      specBox.innerHTML = '<div class="spec-chosen tt-muted">Prédio industrial: paga a conta com peças ⚙ para FUNDIR torres e ligar o laboratório Hivemind.</div>';
      const up = el('tp-upgrade');
      if (t.level >= fd.maxLevel) { up.textContent = 'FÁBRICA NO MÁXIMO • NV5'; up.disabled = true; }
      else {
        const cc = fd.upgradeCreditCost(t.level), pc2 = fd.upgradePartsCost(t.level);
        up.textContent = 'MELHORAR • $' + cc + ' + ' + pc2 + '⚙';
        up.disabled = this.S.credits < cc || (this.S.parts || 0) < pc2;
      }
      el('tp-sell').textContent = 'VENDER • $' + sellValue(t);
    }

    bindTip(el, html) {
      el.addEventListener('mouseenter', () => showTip(html));
      el.addEventListener('mousemove', e => moveTip(e));
      el.addEventListener('mouseleave', hideTip);
    }

    /* ---------- input ---------- */
    bindInput() {
      this.input.on('pointermove', p => {
        const wp = p.position ? { x: p.worldX, y: p.worldY } : { x: p.x, y: p.y };
        this.pointerWorld = wp;
        this.hoverCell.c = Math.floor(wp.x / CELL);
        this.hoverCell.r = Math.floor(wp.y / CELL);
      });
      this.input.on('pointerdown', p => {
        SND.unlock();
        if (this.paused) return;
        const wx = p.worldX != null ? p.worldX : p.x;
        const wy = p.worldY != null ? p.worldY : p.y;
        if (this.armed) {
          applySuper(this.S, this.armed, wx, wy);
          this.armed = null;
          return;
        }
        if (p.event && p.event.target !== this.game.canvas) return;
        const c = Math.floor(wx / CELL), r = Math.floor(wy / CELL);
        if (this.placingId) {
          const t = placeTower(this.S, c, r, this.placingId);
          if (t) { this.placingId = null; this.refreshShopSel(); this.hideTowerPanel(); }
          return;
        }
        const key = c + ',' + r;
        if (this.S.occupied[key]) {
          this.selected = this.S.occupied[key];
          this.showTowerPanel(this.selected);
          SND.ui();
        } else {
          this.selected = null;
          this.hideTowerPanel();
        }
      });

      const kb = this.input.keyboard;
      kb.on('keydown-Q', () => this.triggerSuper('ion'));
      kb.on('keydown-W', () => this.triggerSuper('emp'));
      kb.on('keydown-E', () => this.triggerSuper('vortex'));
      kb.on('keydown-R', () => this.triggerSuper('overdrive'));
      kb.on('keydown-P', () => this.togglePause());
      kb.on('keydown-ESC', () => { if (this.placingId) { this.placingId = null; this.refreshShopSel(); } else this.togglePause(); });
      kb.on('keydown-SPACE', () => {
        if (this.paused) { this.togglePause(); return; }
        if (this.S.state === 'idle') startNextWave(this.S);
      });
      kb.on('keydown-F', () => this.cycleSpeed());
      // M handled globally

      this.el('btn-speed').addEventListener('click', () => this.cycleSpeed());
      this.el('btn-auto').addEventListener('click', () => {
        this.S.autoNext = !this.S.autoNext;
        D.Save.data.autoNext = this.S.autoNext; D.Save.save();
        SND.ui();
      });
      this.el('btn-pause').addEventListener('click', () => this.togglePause());
      // mobile — próxima onda sem teclado
      const nextMob = this.el('btn-nextwave-mobile');
      if(nextMob) nextMob.addEventListener('click', () => { if(this.S.state === 'idle') { SND.ui(); startNextWave(this.S); } else { SND.error(); } });
      // mute handled globally (HTML) to avoid double toggle
      this.el('btn-home').addEventListener('click', () => { SND.uiBack(); this.goMenu(); });
      // v3 PIXEL FASE 5: botão laboratório Hivemind no topbar
      const hiveBtn = this.el('btn-hivemind');
      if (hiveBtn) hiveBtn.addEventListener('click', () => { upgradeEnemyHP(this.S); });
      this.el('btn-resume').addEventListener('click', () => this.togglePause());
      this.el('btn-quit').addEventListener('click', () => { this.paused = false; this.goMenu(); });
      this.el('tp-upgrade').addEventListener('click', () => {
        if (!this.selected) return;
        const t = this.selected;
        if (t.defRef.kind === 'factory') { upgradeFactory(this.S, t); }
        else if (t.level >= tierCap(t)) { mergeTowers(this.S, t); } // v3 PIXEL FASE 2
        else { upgradeTower(this.S, t); }
        this.showTowerPanel(this.selected);
      });
      this.el('tp-sell').addEventListener('click', () => { if (this.selected) { sellTower(this.S, this.selected); this.selected = null; this.hideTowerPanel(); } });
      this.el('tp-target').addEventListener('click', () => { if (this.selected) { cycleTargetMode(this.selected); this.showTowerPanel(this.selected); } });
      this.el('tp-close').addEventListener('click', () => { this.selected = null; this.hideTowerPanel(); });
      // BUG 2 FIX: tap/click on tower-panel background (not on a button) closes panel
      var tpEl = this.el('tower-panel');
      if (tpEl) {
        tpEl.addEventListener('pointerdown', function(e) {
          // only close if tapped directly on panel bg or non-interactive child, NOT on a button
          if (e.target.closest('button') || e.target.closest('.spec-btn')) return;
          // defer so existing button click handlers still fire
          var self2 = this;
          setTimeout(function() {
            var sc = window.__game && window.__game.scene.getScene('Game');
            if (sc) { sc.selected = null; sc.hideTowerPanel(); }
          }, 60);
        });
      }
      ['modal-end'].forEach(id => {
        const b = this.el('btn-retry');
        if (b) b.addEventListener('click', () => { SND.ui(); this.restartSame(); });
        const n = this.el('btn-next');
        if (n) n.addEventListener('click', () => { SND.ui(); this.goNext(); });
        const m = this.el('btn-menu');
        if (m) m.addEventListener('click', () => { SND.uiBack(); this.goMenu(); });
      });
    }

    toggleMute() {
      const muted = !SND.muted;
      SND.setMuted(muted);
      D.Save.data.muted = muted; D.Save.save();
      SND.ui();
    }

    cycleSpeed() {
      this.speedIdx = (this.speedIdx + 1) % this.speeds.length;
      SND.ui();
    }

    togglePause() {
      if (this.S.state === 'victory' || this.S.state === 'defeat') return;
      this.paused = !this.paused;
      const ov = this.el('pause-overlay');
      if (ov) ov.classList.toggle('hidden', !this.paused);
      SND.musicTick(this.paused ? 'paused' : 'combat', this.S.wave, !!this.S.activeBoss);
      SND.uiBack();
    }

    goMenu() {
      this.hideEndModal();
      this.cameras.main.fadeOut(240);
      this.time.delayedCall(260, () => {
        this.scene.stop('Game');
        this.scene.start('Menu');
      });
    }

    restartSame() {
      this.hideEndModal();
      this.cameras.main.fadeOut(200);
      this.time.delayedCall(220, () => this.scene.restart(this.params));
    }

    goNext() {
      if (!this.S.result || this.S.result.outcome !== 'victory') return;
      const next = this.S.mapIdx + 1;
      if (next >= D.MAPS_DATA.length) { this.goMenu(); return; }
      this.hideEndModal();
      this.cameras.main.fadeOut(200);
      this.time.delayedCall(220, () => this.scene.restart({ mapIdx: next, diffKey: 'normal', endless: false }));
    }

    hideEndModal() { hideOverlay('modal-end'); }

    /* ---------- loop ---------- */
    update(_, dms) {
      const dt = Math.min(0.05, dms / 1000);
      const ended = this.S.state === 'victory' || this.S.state === 'defeat';
      if (!this.paused && !ended) {
        const steps = this.speeds[this.speedIdx];
        for (let i = 0; i < steps; i++) {
          if (this.S.state === 'victory' || this.S.state === 'defeat') break;
          stepSim(this.S, dt);
        }
        SND.musicTick('combat', this.S.wave, !!this.S.activeBoss);
      }
      this.dashOffset += dms * 0.06;
      this.consumeEvents();
      this.updateParticles(dt * (this.paused ? 0 : 1));
      this.drawDynamic();
      this.syncEnemies();
      this.syncTowers();
      this.syncProjectiles();
      this.syncHud();
      this.syncBossBar();
      // v3 PIXEL FASE 2: painel só fica aberto se a torre ainda existir (evita painel fantasma sobre os supers)
      if (this.selected && !this.S.towers.includes(this.selected)) { this.selected = null; this.hideTowerPanel(); }
      this.pollFloats(dt);
    }

    /* v3 PIXEL FASES 2-6: helpers de teste headless */
    get testPanelOpen() { const p = this.el('tower-panel'); return !!p && !p.classList.contains('hidden'); }

    consumeEvents() {
      for (const e of this.S.events) this.handleEvent(e);
      this.S.events.length = 0;
    }

    handleEvent(e) {
      switch (e.t) {
        case 'boom': this.boomFx(e.x, e.y, e.r, e.col, e.big); break;
        case 'ring': {
          const ring = this.getImg('ring');
          ring.setTexture('ring').setTint(Phaser.Display.Color.HexStringToColor(e.col).color)
            .setPosition(e.x, e.y).setScale(0.25).setAlpha(0.8);
          ring.setData('life', 0.35); ring.setData('tot', 0.35);
          ring.setData('vx', 0); ring.setData('vy', 0); ring.setData('grow', e.maxR / 17);
          if (!ring._inLayer) { this.fxOver.add(ring); ring._inLayer = true; }
          break;
        }
        case 'tracer':
          this.tracers.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, col: e.col, w: e.w, life: 0.14, tot: 0.14 });
          break;
        case 'chain':
          this.zaps.push({ pts: e.pts, life: 0.16, tot: 0.16 });
          break;
        case 'float': this.floatTxt(e.x, e.y, e.txt, e.col, e.size); break;
        case 'banner': this.showBanner(e.txt, e.col, e.strong); break;
        case 'shake': this.cameras.main.shake(Math.min(400, 60 + e.mag * 12), Math.min(0.02, e.mag / 900)); break;
        case 'leak': {
          const edge = this.el('edge-flash');
          if (edge) { edge.classList.remove('on'); void edge.offsetWidth; edge.classList.add('on'); }
          this.cameras.main.shake(200, 0.009);
          this.spark(this.portalPos.x, e.y, '#f43f5e', 10, 160, 0.5);
          break;
        }
        case 'bossSpawn': {
          this.showBanner('\u26A0 ' + e.name.toUpperCase() + ' DETECTADO!', '#f43f5e', true);
          const cam = this.cameras.main;
          cam.setZoom(1.09);
          this.tweens.add({ targets: cam, zoom: 1, duration: 420, ease: 'Cubic.easeOut' });
          break;
        }
        case 'bossDeath': {
          const flash = this.add.rectangle(BW / 2, BH / 2, BW, BH, 0xffffff, 0.5).setDepth(80);
          this.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
          this.boomFx(e.x, e.y, 60, '#fbbf24', true);
          break;
        }
        case 'ionBeam': {
          this.ionFx = { x: e.x, y: e.y, r: e.r, life: e.life, tot: e.life };
          this.boomFx(e.x, e.y, e.r, '#38bdf8', true);
          break;
        }
        case 'emp': {
          const rect = this.add.rectangle(BW / 2, BH / 2, BW, BH, 0x38bdf8, 0.28).setDepth(79);
          this.tweens.add({ targets: rect, alpha: 0, duration: 380, onComplete: () => rect.destroy() });
          const ring = this.getImg('ring');
          ring.setTexture('ring').setTint(0x38bdf8).setPosition(BW / 2, BH / 2).setScale(2).setAlpha(1);
          ring.setData('life', 0.6); ring.setData('tot', 0.6);
          ring.setData('vx', 0); ring.setData('vy', 0); ring.setData('grow', BW / 15);
          if (!ring._inLayer) { this.fxOver.add(ring); ring._inLayer = true; }
          break;
        }
        case 'vortexStart': break;
        case 'overdrive': {
          const rect = this.add.rectangle(BW / 2, BH / 2, BW, BH, 0xfb923c, 0.16).setDepth(78);
          this.tweens.add({ targets: rect, alpha: 0, duration: 500, onComplete: () => rect.destroy() });
          break;
        }
        case 'buildFx': this.spark(e.x, e.y, e.col, 10, 120, 0.4); break;
        case 'autoSuperFx': { // v3 PIXEL FASE 4: FX dramático do super automático (decai mesmo pausado)
          const ring = this.getImg('ring');
          ring.setTexture('ring').setTint(Phaser.Display.Color.HexStringToColor(e.col).color)
            .setPosition(e.x, e.y).setScale(0.3).setAlpha(0.95);
          ring.setData('life', 0.7); ring.setData('tot', 0.7);
          ring.setData('vx', 0); ring.setData('vy', 0); ring.setData('grow', 9);
          if (!ring._inLayer) { this.fxOver.add(ring); ring._inLayer = true; }
          this.spark(e.x, e.y, e.col, 18, 220, 0.6);
          break;
        }
        case 'lvlFx': {
          this.spark(e.x, e.y, '#fbbf24', 12, 140, 0.5);
          this.floatTxt(e.x, e.y - 20, 'N\u00CDVEL UP!', '#fbbf24', 13);
          break;
        }
        case 'sellFx': this.floatTxt(e.x, e.y - 14, '+$' + e.val, '#fbbf24', 12); break;
        case 'spawnFx': {
          const x0 = e.flying ? this.S.airPts[0].x : this.S.routes[e.flying === false ? 0 : 0][0].x;
          const y0 = e.y || this.S.routes[0][0].y;
          this.spark(Math.max(14, x0), y0, '#38bdf8', 6, 110, 0.45);
          break;
        }
        case 'muzzle': {
          const m = this.getImg('soft');
          m.setTexture('soft').setTint(0xffffff).setPosition(e.x + Math.cos(e.angle) * 18, e.y + Math.sin(e.angle) * 18).setScale(0.7).setAlpha(0.85);
          m.setData('life', 0.06); m.setData('tot', 0.06);
          m.setData('vx', 0); m.setData('vy', 0);
          if (!m._inLayer) { this.fxOver.add(m); m._inLayer = true; }
          break;
        }
        case 'impact': this.spark(e.x, e.y, e.col, 3, 70, 0.25); break;
        case 'smoke': {
          const s = this.getImg('dot');
          s.setTexture('dot').setTint(0x94a3b8).setPosition(e.x, e.y).setScale(0.5).setAlpha(0.5);
          s.setData('life', 0.5); s.setData('tot', 0.5);
          s.setData('vx', (Math.random() - 0.5) * 20); s.setData('vy', -18);
          if (!s._inLayer) { this.fxOver.add(s); s._inLayer = true; }
          break;
        }
        case 'spark': this.spark(e.x, e.y, e.col, 2, 90, 0.22); break;
        case 'healFx': this.floatTxt(e.x, e.y - 8, '+', '#34d399', 11); break;
        case 'rage': break;
        case 'gameEnd': this.time.delayedCall(600, () => this.showEndModal()); break;
      }
    }

    updateParticles(dt) {
      if (dt <= 0) return;
      for (const key in this.pools) {
        for (const img of this.pools[key]) {
          if (!img.active) continue;
          let life = img.getData('life');
          if (life == null) continue;
          life -= dt;
          img.setData('life', life);
          if (life <= 0) { img.setActive(false).setVisible(false).setAlpha(1).setScale(1); continue; }
          const vx = img.getData('vx') || 0, vy = img.getData('vy') || 0;
          img.x += vx * dt; img.y += vy * dt;
          const tot = img.getData('tot') || 1;
          img.setAlpha(Math.min(1, life / tot * 1.6));
          const grow = img.getData('grow');
          if (grow != null) {
            const base = img.getData('baseScale') || (img.setData('baseScale', img.scaleX), img.scaleX);
            img.setScale(base + grow * (1 - life / tot));
            img.setAlpha(life / tot);
          } else if (!img.getData('vx')) {
            img.setScale(img.scaleX * (1 - dt * 1.2));
          }
        }
      }
    }

    pollFloats(dt) {
      for (let i = this.activeFloats.length - 1; i >= 0; i--) {
        const f = this.activeFloats[i];
        f.life -= dt;
        f.txt.y -= 30 * dt;
        f.txt.alpha = Math.max(0, f.life / 0.9);
        if (f.life <= 0) {
          f.txt.setVisible(false);
          this.activeFloats.splice(i, 1);
          this.floatPool.push(f.txt);
        }
      }
    }

    drawDynamic() {
      const g = this.beamGfx;
      g.clear();
      // lasers contínuos
      for (const t of this.S.towers) {
        const def = t.defRef;
        if (def.kind !== 'beam' || !t.beamTarget || t.beamTarget.dead) continue;
        const col = Phaser.Display.Color.HexStringToColor(def.color).color;
        g.lineStyle(5, col, 0.45);
        g.lineBetween(t.x, t.y, t.beamTarget.x, t.beamTarget.y);
        g.lineStyle(1.8, 0xffffff, 0.95);
        g.lineBetween(t.x, t.y, t.beamTarget.x, t.beamTarget.y);
        g.fillStyle(col, 0.8);
        g.fillCircle(t.beamTarget.x, t.beamTarget.y, 3 + Math.random() * 2);
      }
      // zaps tesla
      for (let i = this.zaps.length - 1; i >= 0; i--) {
        const z = this.zaps[i];
        z.life -= 0.016;
        if (z.life <= 0) { this.zaps.splice(i, 1); continue; }
        const a = z.life / z.tot;
        g.lineStyle(4 * a, 0x34d399, 0.5 * a);
        this.jagged(g, z.pts);
        g.lineStyle(1.5, 0xffffff, 0.9 * a);
        this.jagged(g, z.pts);
      }
      // tracers sniper/rail
      for (let i = this.tracers.length - 1; i >= 0; i--) {
        const tr = this.tracers[i];
        tr.life -= 0.016;
        if (tr.life <= 0) { this.tracers.splice(i, 1); continue; }
        const col = Phaser.Display.Color.HexStringToColor(tr.col).color;
        const a = tr.life / tr.tot;
        g.lineStyle(tr.w * a, col, 0.9 * a);
        g.lineBetween(tr.x1, tr.y1, tr.x2, tr.y2);
      }
      // feixe de íons
      if (this.ionFx) {
        this.ionFx.life -= 0.016;
        if (this.ionFx.life <= 0) this.ionFx = null;
        else {
          const f = this.ionFx.life / this.ionFx.tot;
          g.fillStyle(0x38bdf8, 0.35 * f);
          g.fillRect(this.ionFx.x - 16 * f, 0, 32 * f, this.ionFx.y);
          g.fillStyle(0xffffff, 0.75 * f);
          g.fillRect(this.ionFx.x - 5 * f, 0, 10 * f, this.ionFx.y);
        }
      }
      // vórtices
      const vg = this.vortexGfx;
      vg.clear();
      for (const v of this.S.vortices) {
        const rot = this.S.time * 2;
        vg.lineStyle(2, 0x22d3ee, 0.55);
        for (let k = 0; k < 3; k++) {
          vg.beginPath();
          vg.arc(v.x, v.y, v.r * (0.4 + k * 0.28), rot + k * 2.1, rot + k * 2.1 + 2.4);
          vg.strokePath();
        }
        vg.fillStyle(0x22d3ee, 0.08);
        vg.fillCircle(v.x, v.y, v.r * (v.life / v.tot));
      }
      // linhas tracejadas das rotas
      const dg = this.dashGfx;
      dg.clear();
      dg.lineStyle(2, 0x38bdf8, 0.20);
      dg.translateCanvas(0, 0);
      this.S.routes.forEach(pts => {
        dg.beginPath();
        let carry = this.dashOffset % 26;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
          const len = Math.hypot(dx, dy);
          const ux = dx / len, uy = dy / len;
          let d = -carry;
          while (d < len) {
            const s = Math.max(0, d), e2 = Math.min(len, d + 13);
            if (e2 > s) dg.lineBetween(pts[i - 1].x + ux * s, pts[i - 1].y + uy * s, pts[i - 1].x + ux * e2, pts[i - 1].y + uy * e2);
            d += 26;
          }
          carry = len - (Math.floor((len + carry) / 26)) * 26 + carry;
          carry = ((carry % 26) + 26) % 26;
        }
        dg.strokePath();
      });

      // círculos de alcance / fantasma de posicionamento
      const ui = this.uiGfx;
      ui.clear();
      if (this.selected) {
        const st = getTowerStats(this.S, this.selected);
        ui.lineStyle(1.6, 0x38bdf8, 0.65);
        ui.strokeCircle(this.selected.x, this.selected.y, st.rng);
        ui.fillStyle(0x38bdf8, 0.05);
        ui.fillCircle(this.selected.x, this.selected.y, st.rng);
        ui.lineStyle(1.4, 0xfbbf24, 0.9);
        ui.strokeRect(this.selected.c * CELL + 2, this.selected.r * CELL + 2, CELL - 4, CELL - 4);
      }
      if (this.placingId) {
        const def = D.TOWERS_DATA.find(d => d.id === this.placingId) || (this.placingId === 'factory' ? Object.assign({ rng: 70 }, D.FACTORY_DATA) : null); // v3 PIXEL FASE 5
        if (!def) { this.placingId = null; return; }
        const c = this.hoverCell.c, r = this.hoverCell.r;
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
          const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
          const okCell = !this.S.blocked[c + ',' + r] && !this.S.occupied[c + ',' + r] && this.S.credits >= def.cost;
          const colr = okCell ? 0x34d399 : 0xf43f5e;
          ui.lineStyle(1.6, colr, 0.95);
          ui.strokeRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4);
          ui.lineStyle(1.4, colr, 0.55);
          ui.strokeCircle(cx, cy, def.rng);
          if (!okCell) { ui.fillStyle(0xf43f5e, 0.08); ui.fillCircle(cx, cy, CELL / 2); }
        }
      }
      if (this.armed) {
        const meta = D.SUPERS[this.armed];
        ui.lineStyle(1.8, Phaser.Display.Color.HexStringToColor(meta.color).color, 0.8);
        ui.strokeCircle(this.pointerWorld.x, this.pointerWorld.y, meta.radius);
        ui.fillStyle(Phaser.Display.Color.HexStringToColor(meta.color).color, 0.06);
        ui.fillCircle(this.pointerWorld.x, this.pointerWorld.y, meta.radius);
      }
      // v3 PIXEL FASE 4: anel fino de progresso do super automático ao redor de cada torre
      for (const t of this.S.towers) {
        if (t.defRef.kind === 'factory') continue;
        const sc = getSuperCharge(this.S, t);
        if (sc.pct <= 0 || sc.pct >= 1) continue;
        const col = Phaser.Display.Color.HexStringToColor((D.SUPERS_AUTO[t.defRef.id] || {}).col || '#fbbf24').color;
        ui.lineStyle(2, col, 0.55);
        ui.beginPath();
        ui.arc(t.x, t.y, CELL * 0.52, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sc.pct);
        ui.strokePath();
      }
    }

    jagged(g, pts) {
      g.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        g.moveTo(a.x, a.y);
        const segs = 4;
        for (let s = 1; s < segs; s++) {
          const tt = s / segs;
          const jx = (Math.random() - 0.5) * 10, jy = (Math.random() - 0.5) * 10;
          g.lineTo(a.x + (b.x - a.x) * tt + jx, a.y + (b.y - a.y) * tt + jy);
        }
        g.lineTo(b.x, b.y);
      }
      g.strokePath();
    }

    /* ---------- sincronização de sprites ---------- */
    syncEnemies() {
      const seen = {};
      for (const e of this.S.enemies) {
        if (e.dead) continue;
        seen[e.eid] = true;
        let v = this.enemyViews[e.eid];
        if (!v) {
          const root = this.add.container(e.x, e.y).setDepth(10);
          const body = this.add.image(0, 0, 'en_' + e.type);
          const hpBg = this.add.image(0, e.r + 6, 'px').setTint(0x000000).setAlpha(0.6).setDisplaySize(e.r * 2.4, 4);
          const hpFg = this.add.image(0, e.r + 6, 'px').setDisplaySize(e.r * 2.4, 4);
          const shFg = this.add.image(0, e.r + 2, 'px').setTint(0x60a5fa).setDisplaySize(e.r * 2.4, 2.4);
          const aura = this.add.image(0, 0, 'soft').setTint(0xf43f5e).setScale(e.r / 6).setVisible(false).setAlpha(0.5);
          root.add([aura, body, hpBg, hpFg, shFg]);
          v = { root, body, hpBg, hpFg, shFg, aura, lastLevelHp: -1 };
          this.enemyViews[e.eid] = v;
        }
        v.root.setPosition(e.x, e.y - (e.flying ? 6 + Math.sin(this.S.time * 5 + e.eid) * 3 : 0));
        v.root.setAlpha(e.type === 'phase' ? (e.stealthPhase > 1.8 ? 0.22 : 0.85) : 1);
        v.body.rotation = (e.dirAngle || 0) + Math.PI / 2;
        if (e.flash > 0) v.body.setTintFill(0xffffff); else v.body.clearTint();
        v.aura.setVisible(!!e.raged);
        const hpPct = Math.max(0, e.hp / e.maxHp);
        v.hpFg.setDisplaySize(e.r * 2.4 * hpPct, 4);
        v.hpFg.setTint(hpPct > 0.5 ? 0x34d399 : (hpPct > 0.25 ? 0xfbbf24 : 0xf43f5e));
        v.hpBg.setVisible(hpPct < 1);
        v.hpFg.setVisible(hpPct < 1);
        const shPct = e.maxShield > 0 ? Math.max(0, e.shield / e.maxShield) : 0;
        v.shFg.setDisplaySize(e.r * 2.4 * shPct, 2.4);
        v.shFg.setVisible(shPct > 0);
        void v.lastLevelHp;
      }
      for (const eid in this.enemyViews) {
        if (!seen[eid]) {
          this.enemyViews[eid].root.destroy();
          delete this.enemyViews[eid];
        }
      }
    }

    syncTowers() {
      for (const t of this.S.towers) {
        let v = this.towerViews[t.tid];
        const tkey = t.defRef.kind === 'factory'
          ? 'px_factory_l' + Math.min(5, t.level)
          : 'tur_' + t.defRef.id + '_t' + D.getTier(t.level); // v3 PIXEL: tier/factory texture
        if (!v || v.lastTexKey !== tkey) {
          if (v && v.lastTexKey !== tkey && this.textures.exists(tkey)) { v.tur.setTexture(tkey); v.lastTexKey = tkey; }
        }
        if (!v) {
          const base = this.add.image(t.x, t.y, 'tbase').setVisible(false).setAlpha(0); // borda removida
          const tur = this.add.image(t.x, t.y, this.textures.exists(tkey) ? tkey : ('tur_' + t.defRef.id + '_1'));
          const pips = this.add.container(t.x, t.y + 15);
          base.setDepth(30); tur.setDepth(31); pips.setDepth(32);
          v = { base, tur, pips, lastLevel: t.level };
          v.lastTexKey = this.textures.exists(tkey) ? tkey : null; // v3 PIXEL
          v.tur.baseScale = [1, 1, 1.08, 1.18, 1.30, 1.45][D.getTier(t.level)] || 1;
          this.towerViews[t.tid] = v;
          this.buildPips(v, t);
        }
        v.base.setPosition(t.x, t.y);
        v.tur.setPosition(t.x, t.y);
        v.pips.setPosition(t.x, t.y+15);
        if(v.ultraGlow) v.ultraGlow.setPosition(t.x, t.y);
        if(v.odFlame) v.odFlame.setPosition(t.x, t.y);
        v.tur.rotation = (t.angle || 0) + Math.PI / 2;
        v.tur.setScale(1 + (t.recoil || 0) * 0.12);
        if (t.flash > 0) v.tur.setTintFill(0xffffff); else v.tur.clearTint();
        if (t.level !== v.lastLevel) {
          // v3 PIXEL: troca textura por TIER (escala visual 1.0/1.08/1.18/1.30/1.45)
          const tk = 'tur_' + t.defRef.id + '_t' + D.getTier(t.level);
          if (this.textures.exists(tk)) { v.tur.setTexture(tk); v.lastTexKey = tk; }
          const tierScale = [1, 1, 1.08, 1.18, 1.30, 1.45][D.getTier(t.level)] || 1;
          v.tur.baseScale = tierScale;
          v.lastLevel = t.level; this.buildPips(v, t);
        }
        v.tur.setScale((v.tur.baseScale || 1) * (1 + (t.recoil || 0) * 0.12));
      }
      // FIX: remove visual remanescente de naves consumidas no merge/venda (estava deixando fantasma)
      for (const tid in this.towerViews) {
        const stillExists = this.S.towers.some(t => String(t.tid) === String(tid));
        if (!stillExists) {
          const v = this.towerViews[tid];
          try{ if(v.base) v.base.destroy(); }catch(e){}
          try{ if(v.tur) v.tur.destroy(); }catch(e){}
          try{ if(v.pips) v.pips.destroy(true); }catch(e){}
          try{ if(v.ultraGlow) v.ultraGlow.destroy(); }catch(e){}
          try{ if(v.odFlame) v.odFlame.destroy(); }catch(e){}
          try{ if(v.aura) v.aura.destroy(); }catch(e){}
          delete this.towerViews[tid];
        }
      }
    }

    buildPips(v, t) {
      v.pips.removeAll(true);
      // ULTRA: mostra até 5 tiers visuais + número, não 50 dots
      const tiers = Math.min(5, Math.ceil(t.level/10));
      for (let i = 0; i < tiers; i++) {
        const dot = this.add.image((i - (tiers - 1) / 2) * 8, 0, 'dot')
          .setTint(t.level>=D.TOWER_MAX_LVL ? 0xf43f5e : i>=3 ? 0x38bdf8 : 0xfbbf24).setScale(0.38 + i*0.06);
        v.pips.add(dot);
      }
      // número de nível acima dos pips
      const txt = this.add.text(0, -10, String(t.level), { fontFamily:'JetBrains Mono', fontSize:'9px', color:'#fbbf24' }).setOrigin(0.5);
      v.pips.add(txt);
    }

    syncProjectiles() {
      const seen = {};
      for (const pr of this.S.projectiles) {
        if (pr.delay > 0) continue;
        seen[pr] = true;
        if (!pr._img) {
          const isMissile = pr.kind === 'missile';
          pr._img = this.add.image(pr.x, pr.y, isMissile ? 'dot' : 'dot')
            .setTint(isMissile ? 0xfb923c : Phaser.Display.Color.HexStringToColor(pr.col).color)
            .setScale(isMissile ? 0.62 : 0.42).setDepth(40);
        }
        pr._img.setPosition(pr.x, pr.y);
        if (pr.kind === 'missile' && pr.vx) pr._img.rotation = Math.atan2(pr.vy, pr.vx) + Math.PI / 2;
      }
      for (const pr of this.S.projectiles) {
        if (pr.life <= 0 && pr._img) { pr._img.destroy(); pr._img = null; }
      }
    }

    /* ---------- HUD DOM ---------- */
    syncHud() {
      const S = this.S;
      const el = id => document.getElementById(id);
      if (S.credits !== this._lastCredits) {
        const up = this._lastCredits >= 0 && S.credits > this._lastCredits;
        this._lastCredits = S.credits;
        const c = el('hud-credits');
        c.textContent = '$' + S.credits;
        if (up) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
      }
      if (S.lives !== this._lastLives) {
        const down = this._lastLives >= 0 && S.lives < this._lastLives;
        this._lastLives = S.lives;
        const l = el('hud-lives');
        l.textContent = '\u25C8 ' + S.lives;
        if (down) { l.classList.remove('blink'); void l.offsetWidth; l.classList.add('blink'); }
      }
      // v3 PIXEL FASE 5: HUD de peças ⚙
      if ((S.parts || 0) !== (this._lastParts || -1)) {
        this._lastParts = S.parts || 0;
        const pEl = el('hud-parts');
        if (pEl) pEl.textContent = String(this._lastParts);
      }
      // v3 PIXEL FASE 5: botão laboratório Hivemind
      const hiveBtn = el('btn-hivemind');
      if (hiveBtn) {
        const cost = D.HIVEMIND.cost(S.enemyHpLevel || 0);
        hiveBtn.textContent = '🧬 HP ×' + (1 + (S.enemyHpLevel || 0) * D.HIVEMIND.hpAdd).toFixed(2) + ' (+' + cost + '⚙)';
        hiveBtn.disabled = (S.parts || 0) < cost;
      }
      el('hud-wave-num').textContent = String(Math.max(1, S.wave));
      const num2 = el('hud-wave-num2');
      if (num2) num2.textContent = String(Math.max(1, S.wave));
      el('hud-wave-total').textContent = '/ ' + (S.endless ? '\u221E' : S.map.waves.length);
      if (S.state === 'combat') {
        if (this._lastWave !== S.wave) { this._lastWave = S.wave; this._waveTotal = Math.max(1, S.waveQueue.length); }
        const pct = Math.round(100 * (1 - S.waveQueue.length / this._waveTotal));
        el('wave-ring').style.background = 'conic-gradient(#38bdf8 ' + pct + '%, rgba(56,189,248,0.15) 0)';
        el('countdown-chip').textContent = '';
      } else {
        el('wave-ring').style.background = 'conic-gradient(#fbbf24 100%, rgba(56,189,248,0.15) 0)';
        const moreWaves = S.endless || S.wave < S.map.waves.length;
        el('countdown-chip').textContent = moreWaves
          ? (S.autoNext ? 'PR\u00D3XIMA ONDA EM ' + Math.ceil(S.autoWaveTimer) + 's [AUTO]' : 'ESPA\u00C7O inicia a onda ' + (S.wave + 1))
          : '';
        // mobile sem teclado: atualiza botão Próxima Onda
        const nextMob2 = el('btn-nextwave-mobile');
        if(nextMob2){
          const canNext2 = S.state === 'idle' && moreWaves;
          nextMob2.disabled = !canNext2;
          nextMob2.style.opacity = canNext2 ? '1' : '0.45';
          nextMob2.textContent = S.state === 'combat' ? 'COMBATE' : '▶ ONDA ' + (S.wave+1);
        }
      }
      this.syncNextPreview();
      // mobile — estado do botão próxima onda também em combat
      const nextMob = el('btn-nextwave-mobile');
      if(nextMob && S.state === 'combat'){
        nextMob.disabled = true; nextMob.style.opacity='0.35'; nextMob.textContent='COMBATE';
      } else if(nextMob && S.state === 'idle'){
        const moreWavesC = S.endless || S.wave < S.map.waves.length;
        nextMob.disabled = !moreWavesC; nextMob.style.opacity = moreWavesC ? '1' : '0.45';
        if(moreWavesC) nextMob.textContent = '▶ ONDA ' + (S.wave+1);
      }
      el('btn-speed').textContent = '\u00D7' + this.speeds[this.speedIdx];
      el('btn-auto').classList.toggle('active', !!S.autoNext);
      el('btn-mute').classList.toggle('active', !!SND.muted);
      el('btn-mute').textContent = SND.muted ? '\u2716\ud83d\udd08' : '\ud83d\udd08';
      Object.keys(D.SUPERS).forEach(k => {
        const btn = el('super-' + k);
        if (!btn) return;
        const p = S.powers[k];
        const cdEl = btn.querySelector('.sb-cd');
        if (p.cd > 0) {
          btn.classList.add('cd');
          cdEl.textContent = Math.ceil(p.cd);
          btn.style.setProperty('--cdpct', Math.round(100 * p.cd / p.maxCd) + '%');
        } else {
          btn.classList.remove('cd');
          cdEl.textContent = '';
        }
        btn.classList.toggle('armed', this.armed === k);
      });
      if (this.selected && this.S.towers.indexOf(this.selected) < 0) { this.selected = null; this.hideTowerPanel(); }
      if (this.selected) {
        this._panelAcc = (this._panelAcc || 0) + 1;
        if (this._panelAcc % 12 === 0) this.showTowerPanel(this.selected);
      }
    }

    syncNextPreview() {
      const peek = peekNextWave(this.S);
      const key = peek ? peek.map(p => p.type + p.count).join('|') : '';
      if (key === (this._prevPreviewKey || '')) return;
      this._prevPreviewKey = key;
      const box = document.getElementById('next-preview');
      box.innerHTML = '';
      if (!peek) return;
      peek.forEach(p => {
        const def = D.ENEMIES_DATA[p.type];
        if (!def) return;
        const chip = document.createElement('span');
        chip.className = 'np-chip';
        chip.innerHTML = '<i style="background:' + def.col + '"></i>' + (def.isBoss ? '\u26A0' : '') + p.count;
        box.appendChild(chip);
      });
    }

    syncBossBar() {
      const bar = document.getElementById('boss-bar');
      const b = this.S.activeBoss;
      if (!b || b.dead) { bar.classList.remove('show'); return; }
      bar.classList.add('show');
      document.getElementById('boss-name').textContent = '\u26A0 ' + b.label.toUpperCase() + (b.raged ? ' \u2014 F\u00daRIA!' : '');
      document.getElementById('boss-fill').style.width = Math.max(0, b.hp / b.maxHp * 100) + '%';
      const sh = b.maxShield > 0 ? Math.max(0, b.shield / b.maxShield * 100) : 0;
      document.getElementById('boss-shield-fill').style.width = sh + '%';
    }

    showBanner(txt, col, strong) {
      const b = document.getElementById('banner');
      b.textContent = txt;
      b.style.color = col || '#e8eefc';
      b.style.borderColor = col || '#38bdf8';
      b.classList.toggle('strong', !!strong);
      b.classList.remove('show');
      void b.offsetWidth;
      b.classList.add('show');
      if (this._bannerTimer) this._bannerTimer.remove();
      this._bannerTimer = this.time.delayedCall(strong ? 2200 : 1500, () => b.classList.remove('show'));
    }

    pollToasts() {
      const notes = D.Save.drainNotifications();
      for (const n of notes) {
        const ach = D.ACHIEVEMENTS.find(a => a.id === n.id);
        if (!ach) continue;
        SND.achievement();
        const toast = document.createElement('div');
        toast.className = 'toast chamf';
        toast.innerHTML = '<span class="t-icon">' + ach.icon + '</span><span><b>CONQUISTA:</b> ' + ach.name + '</span>';
        document.getElementById('toasts').appendChild(toast);
        setTimeout(() => toast.classList.add('out'), 2800);
        setTimeout(() => toast.remove(), 3300);
      }
    }

    showEndModal() {
      const res = this.S.result;
      if (!res) return;
      const victory = res.outcome === 'victory';
      const el = id => document.getElementById(id);
      el('end-title').textContent = victory ? 'SETOR LIBERADO COM SUCESSO!' : 'FALHA DA DEFESA ORBITAL';
      el('end-title').style.color = victory ? '#34d399' : '#f43f5e';
      el('end-sub').textContent = 'SETOR ' + (this.S.mapIdx + 1) + ': ' + this.S.map.name + ' \u2022 ' + this.S.diff.name +
        (this.S.endless ? ' \u2022 MODO INFINITO \u2014 ONDA ' + this.S.wave : '');
      el('end-kills').textContent = res.kills;
      el('end-credits').textContent = '$' + res.credits;
      el('end-crystals').textContent = '+' + res.crystals + ' \u27E8\u27E8';
      el('end-diag').textContent = res.diag || '';
      el('end-diag').style.display = res.diag ? 'block' : 'none';
      const starsBox = el('end-stars');
      starsBox.innerHTML = '';
      const starEls = [];
      for (let i = 0; i < 3; i++) {
        const s = document.createElement('span');
        s.className = 'end-star';
        s.textContent = '\u2606';
        starsBox.appendChild(s);
        starEls.push(s);
        if (victory && i < res.stars) {
          this.time.delayedCall(400 + i * 420, () => {
            s.textContent = '\u2605';
            s.classList.add('on');
            SND.star(i);
          });
        }
      }
      if (!victory) starsBox.innerHTML = '<span class="end-star off">\u2606\u2606\u2606</span>';
      el('btn-next').style.display = (victory && this.S.mapIdx + 1 < D.MAPS_DATA.length) ? '' : 'none';
      // NOVO: animação de escolha pós-vitória — próxima fase ou infinito no mesmo mundo
      if(victory){
        const goActions = document.querySelector('#modal-end .go-actions');
        if(goActions && !document.getElementById('btn-infinite')){
          const btnInf = document.createElement('button');
          btnInf.id='btn-infinite';
          btnInf.className='btn chamf';
          btnInf.style.borderColor='#38bdf8';
          btnInf.style.color='#38bdf8';
          btnInf.textContent='♾ CONTINUAR NO MUNDO (INFINITO)';
          btnInf.title='Recomeça o mesmo setor no modo infinito — ondas sem fim';
          goActions.appendChild(btnInf);
          btnInf.addEventListener('click', ()=>{
            SND.ui();
            this.hideEndModal();
            this.cameras.main.fadeOut(200);
            this.time.delayedCall(220, ()=> this.scene.restart({ mapIdx: this.S.mapIdx, diffKey: this.S.diffKey||'normal', endless: true }));
          });
          // animação de entrada nos botões
          [...goActions.children].forEach((b,i)=>{
            b.style.opacity='0'; b.style.transform='translateY(12px)';
            this.tweens.add({ targets: b, opacity:1, y:0, duration:400, delay: 600 + i*120, ease:'Back.out(1.4)' });
          });
          // brilho sutil no modal
          const box = document.querySelector('#modal-end .modal-box');
          if(box){ box.style.boxShadow='0 0 40px rgba(56,189,248,.25), 0 20px 60px rgba(0,0,0,.7)'; box.animate([{ boxShadow:'0 0 20px rgba(56,189,248,.15)'},{ boxShadow:'0 0 40px rgba(56,189,248,.30)'}], {duration:1200, iterations:2, direction:'alternate'}); }
        }
      }
      showOverlay('modal-end');
    }
  }

  /* ---- helpers DOM ---- */
  function showTip(html) {
    const tip = document.getElementById('tooltip');
    if (!tip) return;
    tip.innerHTML = html;
    tip.classList.remove('hidden');
  }
  function moveTip(e) {
    const tip = document.getElementById('tooltip');
    if (!tip || tip.classList.contains('hidden')) return;
    const x = Math.min(window.innerWidth - 280, e.clientX + 16);
    const y = Math.min(window.innerHeight - 120, e.clientY + 14);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() {
    const tip = document.getElementById('tooltip');
    if (tip) tip.classList.add('hidden');
  }
  function showOverlay(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
  function hideOverlay(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }

  /* ================= ULTRA VISUAL PATCH ================= */
  (() => {
    const ULTRA_THEMES = {
      'space-station': { base: 0x0a1430, accent: '#38bdf8', nebula: ['#0a1a3a','#050a1a'] },
      'asteroid-field': { base: 0x17101e, accent: '#fbbf24', nebula: ['#1a1200','#0f0a1a'] },
      'solar-furnace': { base: 0x1a0a08, accent: '#fb423c', nebula: ['#2a0a08','#1a0505'] },
      'ion-nebula': { base: 0x08101e, accent: '#22d3ee', nebula: ['#0a1a2a','#050a1e'] },
      'singularity': { base: 0x0a0514, accent: '#a78bfa', nebula: ['#150a28','#070113'] }
    };
    Object.assign(THEME_BG, ULTRA_THEMES);
  })();
  const _origMakeTextures = makeTextures;
  makeTextures = function(scene){
    _origMakeTextures(scene);
    // IDENTIDADE UNIFICADA: pixel-art (torres tier, inimigos) + tiles por tema
    if (window.PXART) window.PXART.buildAll(scene);
    if (window.TILES) try{ window.TILES.buildAll(scene); }catch(e){}
    const mk = (key, size, drawFn) => {
      if (scene.textures.exists(key)) return;
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      drawFn(g);
      g.generateTexture(key, size, size);
      g.destroy();
    };
    mk('glow', 64, g=>{ for(let i=3;i>=0;i--){ g.fillStyle(0xffffff, 0.07+ i*0.08); g.fillCircle(32,32, 28 - i*6); } });
    mk('flare', 48, g=>{ g.fillStyle(0xffffff,1); g.fillCircle(24,24,3); for(let r=8;r<24;r+=4){ g.fillStyle(0xffffff, 0.15 - r*0.005); g.fillCircle(24,24,r); } g.fillStyle(0xffffff,0.9); g.fillRect(0,23,48,2); g.fillRect(23,0,2,48); });
    mk('trail', 16, g=>{ g.fillStyle(0xffffff,1); g.fillCircle(8,8,5); g.fillStyle(0xffffff,0.4); g.fillCircle(8,8,8); });
    mk('shock', 80, g=>{ g.lineStyle(2,0xffffff,1); g.strokeCircle(40,40,36); g.lineStyle(1,0xffffff,0.5); g.strokeCircle(40,40,30); });
  };
  const _origBuildStatic = GameScene.prototype.buildStatic;
  GameScene.prototype.buildStatic = function(){
    _origBuildStatic.call(this);
    const theme = THEME_BG[this.S.map.theme] || THEME_BG['space-station'];
    const neb = this.add.graphics().setDepth(1).setAlpha(0.35);
    const c1 = Phaser.Display.Color.HexStringToColor(theme.nebula ? theme.nebula[0] : '#0a1a3a').color;
    const c2 = Phaser.Display.Color.HexStringToColor(theme.nebula ? theme.nebula[1] : '#050a1a').color;
    neb.fillStyle(c1, 0.12); neb.fillCircle(BW*0.25, BH*0.35, 280);
    neb.fillStyle(c2, 0.10); neb.fillCircle(BW*0.75, BH*0.70, 340);
    neb.fillStyle(Phaser.Display.Color.HexStringToColor(theme.accent).color, 0.04); neb.fillCircle(BW*0.5, BH*0.5, 520);
    this.nebulaGfx = neb;
    this.dustA = this.add.tileSprite(BW/2, BH/2, BW, BH, 'soft').setTint(Phaser.Display.Color.HexStringToColor(theme.accent).color).setAlpha(0.018).setScale(6).setDepth(2);
    this.dustB = this.add.tileSprite(BW/2, BH/2, BW, BH, 'soft').setTint(0xffffff).setAlpha(0.012).setScale(8).setDepth(2);
    if(this.gridGfx) this.gridGfx.setAlpha(0.35);
    this.routeParticles = [];
    for(let i=0;i<18;i++){
      const pr = this.add.image(Math.random()*BW, Math.random()*BH, 'dot').setTint(Phaser.Display.Color.HexStringToColor(theme.accent).color).setScale(0.28).setAlpha(0.55).setDepth(6);
      pr.setData('spd', 0.4 + Math.random()*0.9); pr.setData('routeIdx', Math.floor(Math.random()*this.S.routes.length)); pr.setData('t', Math.random());
      this.routeParticles.push(pr);
    }
    if(this.portalCore){
      this.portalCore.setScale(4.2).setAlpha(0.95);
      this.add.image(this.portalPos.x, this.portalPos.y, 'glow').setTint(0x38bdf8).setScale(3.8).setAlpha(0.18).setDepth(4);
      this.portalRing2 = this.add.image(this.portalPos.x, this.portalPos.y, 'ring').setTint(0x22d3ee).setScale(1.6).setAlpha(0.55).setDepth(4);
      this.tweens.add({ targets:this.portalRing2, angle:-360, duration:6000, repeat:-1 });
      this.tweens.add({ targets:this.portalCore, scale:4.6, duration:900, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
    }
  };
  const _origDrawDynamic = GameScene.prototype.drawDynamic;
  GameScene.prototype.drawDynamic = function(){
    _origDrawDynamic.call(this);
    if(this.dustA) this.dustA.tilePositionX += 0.18;
    if(this.dustB) this.dustB.tilePositionX -= 0.11;
    if(this.routeParticles){
      for(const pr of this.routeParticles){
        let t = pr.getData('t') + 0.0018 * pr.getData('spd');
        if(t>1) t-=1; pr.setData('t', t);
        const rid = pr.getData('routeIdx') % this.S.routes.length;
        const pts = this.S.routes[rid]; const total = this.S.routeLengths[rid];
        const pos = D.getPosAtDist(pts, t*total);
        pr.setPosition(pos.x, pos.y);
        pr.setAlpha(0.45 + Math.sin(this.S.time*3 + t*10)*0.25);
      }
    }
    if(this.S.chrono > 0){ this.cameras.main.setZoom(1 + this.S.chrono*0.12); } else { this.cameras.main.setZoom(1); }
  };
  const _origSyncEnemies = GameScene.prototype.syncEnemies;
  GameScene.prototype.syncEnemies = function(){
    _origSyncEnemies.call(this);
    for(const eid in this.enemyViews){
      const v = this.enemyViews[eid];
      const e = this.S.enemies.find(en=> String(en.eid)===eid);
      if(!e) continue;
      if(e.flying && !v.exhaust){
        v.exhaust = this.add.image(0,0,'soft').setTint(0x38bdf8).setScale(0.55).setAlpha(0.45).setDepth(35);
        v.root.addAt(v.exhaust, 0);
      }
      if(v.exhaust){ v.exhaust.setVisible(!!e.flying && !e.dead); if(e.flying) v.exhaust.setPosition(-Math.cos(e.dirAngle)* (e.r*0.9), -Math.sin(e.dirAngle)*(e.r*0.9)); }
      if(e.poisonTimer>0 && !v.poisonAura){
        v.poisonAura = this.add.image(0,0,'glow').setTint(0xa3e635).setScale(e.r/14).setAlpha(0.22).setDepth(36);
        v.root.add(v.poisonAura);
      }
      if(v.poisonAura) v.poisonAura.setVisible(e.poisonTimer>0);
      if(e.burnTimer>0 && !v.burnAura){
        v.burnAura = this.add.image(0,0,'glow').setTint(0xfb923c).setScale(e.r/14).setAlpha(0.28).setDepth(36);
        v.root.add(v.burnAura);
      }
      if(v.burnAura) v.burnAura.setVisible(e.burnTimer>0);
      if(e.maxShield>0 && !v.shieldBubble){
        v.shieldBubble = this.add.image(0,0,'ring').setTint(0x60a5fa).setScale(e.r/14).setAlpha(0.85).setDepth(37);
        v.root.add(v.shieldBubble);
      }
      if(v.shieldBubble) { const hasShield = e.shield>0; v.shieldBubble.setVisible(hasShield); if(hasShield) v.shieldBubble.setScale(e.r/14 + Math.sin(this.S.time*4)*0.06); }
      if(e.cryoVuln>0) v.body.setTint(0xbfdbfe);
    }
  };
  const _origSyncTowers = GameScene.prototype.syncTowers;
  GameScene.prototype.syncTowers = function(){
    _origSyncTowers.call(this);
    for(const tid in this.towerViews){
      const v = this.towerViews[tid];
      const t = this.S.towers.find(tt=> String(tt.tid)===tid);
      if(!t) continue;
      if(t.level>=4 && !v.ultraGlow){
        v.ultraGlow = this.add.image(v.base.x, v.base.y, 'glow').setTint(Phaser.Display.Color.HexStringToColor(t.defRef.color).color).setScale(1.7 + Math.min(t.level,30)*0.04).setAlpha(0.16).setDepth(29);
      }
      if(v.ultraGlow) {
        v.ultraGlow.setPosition(v.base.x, v.base.y);
        v.ultraGlow.setAlpha(0.12 + Math.sin(this.S.time*2 + t.tid)*0.06 + t.level*0.02);
        v.ultraGlow.setScale(1.7 + Math.min(t.level,30)*0.035 + Math.sin(this.S.time*1.2)*0.06);
      }
      if(this.S.powers && this.S.powers.overdrive && this.S.powers.overdrive.dur>0){
        if(!v.odFlame){ v.odFlame = this.add.image(v.tur.x, v.tur.y, 'soft').setTint(0xfb923c).setScale(0.9).setAlpha(0.0).setDepth(32); }
        v.odFlame.setPosition(v.tur.x, v.tur.y); v.odFlame.setAlpha(0.35 + Math.random()*0.2); v.odFlame.setScale(0.8 + Math.random()*0.4);
      } else if(v.odFlame){ v.odFlame.setAlpha(0); }
    }
  };
  const _origSyncProjectiles = GameScene.prototype.syncProjectiles;
  GameScene.prototype.syncProjectiles = function(){
    for(const pr of this.S.projectiles){
      if(pr.delay>0) continue;
      if(pr.kind==='missile' && !pr._trail){ pr._trail = []; }
      if(pr.kind==='missile' && pr._trail){ pr._trail.push({x:pr.x, y:pr.y, life:0.22}); if(pr._trail.length>6) pr._trail.shift(); }
      if(pr.kind==='bullet' && !pr._btrail){ pr._btrail = []; }
      if(pr.kind==='bullet' && pr._btrail){ pr._btrail.push({x:pr.x, y:pr.y, life:0.10}); if(pr._btrail.length>3) pr._btrail.shift(); }
    }
    _origSyncProjectiles.call(this);
    if(this.beamGfx){
      for(const pr of this.S.projectiles){
        if(pr._trail){
          for(let i=0;i<pr._trail.length;i++){
            const pt = pr._trail[i]; pt.life -= 0.016;
            const a = Math.max(0, pt.life/0.22);
            this.beamGfx.fillStyle(0xfb923c, a*0.5); this.beamGfx.fillCircle(pt.x, pt.y, 4*(a));
          }
          pr._trail = pr._trail.filter(p=>p.life>0);
        }
        if(pr._btrail){ for(const pt of pr._btrail){ pt.life -= 0.016; } pr._btrail = pr._btrail.filter(p=>p.life>0); }
        if(pr._img){ if(pr.kind==='missile') pr._img.setScale(0.62 + Math.sin(this.S.time*12)*0.06); }
      }
    }
  };
  const _origHandleEvent = GameScene.prototype.handleEvent;
  GameScene.prototype.handleEvent = function(e){
    if(e.t==='combo'){
      const bar = document.getElementById('combo-wrap');
      const cnt = document.getElementById('combo-count');
      const fill = document.getElementById('combo-fill');
      const mult = document.getElementById('combo-mult');
      if(bar && cnt){
        bar.classList.add('show');
        cnt.textContent = '×'+e.n;
        cnt.style.transform = 'scale(1.18)'; setTimeout(()=> cnt.style.transform='scale(1)', 120);
        if(fill) fill.style.width = Math.min(100, (e.n/D.COMBO.maxStacks)*100)+'%';
        if(mult) mult.textContent = '+'+Math.round((e.mult-1)*100)+'% BÔNUS OURO';
        try{ SND.combo(e.n); }catch(_){}
        const kf = document.getElementById('killfeed');
        if(kf && e.n>=5 && e.n%3===0){
          const el=document.createElement('div'); el.className='kf-item';
          el.textContent = 'COMBO ×'+e.n + '  +' + Math.round((e.mult-1)*100)+'%';
          el.style.borderColor = e.n>=15 ? '#fbbf24' : e.n>=10 ? '#fb923c' : '#38bdf8';
          kf.appendChild(el); setTimeout(()=> el.remove(), 2300); if(kf.children.length>5) kf.firstChild.remove();
        }
        if(this._comboHide) clearTimeout(this._comboHide);
        this._comboHide = setTimeout(()=> bar.classList.remove('show'), 2200);
      }
      return;
    }
    if(e.t==='comboBreak'){
      const bar=document.getElementById('combo-wrap');
      if(bar) bar.classList.remove('show');
      try{ SND.comboBreak(); }catch(_){}
      const cnt=document.getElementById('combo-count');
      if(cnt) cnt.textContent='×0';
      return;
    }
    if(e.t==='mutation'){ this.showMutation(e.choices, e.wave); return; }
    if(e.t==='mutPicked'){
      const kf=document.getElementById('killfeed');
      if(kf){ const el=document.createElement('div'); el.className='kf-item'; el.textContent = e.icon+' '+e.name; el.style.borderColor = e.col; el.style.color = e.col; kf.appendChild(el); setTimeout(()=> el.remove(), 2800); }
      return;
    }
    if(e.t==='bossDeath'){
      const flare = this.add.image(e.x, e.y, 'flare').setTint(0xffffff).setScale(1.2).setAlpha(0.9).setDepth(85);
      this.tweens.add({ targets:flare, alpha:0, scale:2.8, duration:420, ease:'Cubic.easeOut', onComplete:()=> flare.destroy() });
      try{ SND.bossDeath(); }catch(_){}
    }
    return _origHandleEvent.call(this, e);
  };
  GameScene.prototype.showMutation = function(choices, wave){
    const modal = document.getElementById('modal-mut');
    const grid = document.getElementById('mut-grid');
    const wEl = document.getElementById('mut-wave');
    if(!modal || !grid) { applyMutation(this.S, choices[0].id); return; }
    if(wEl) wEl.textContent = String(wave);
    grid.innerHTML='';
    choices.forEach(mut=>{
      const card=document.createElement('div');
      card.className='mut-card chamf';
      card.style.setProperty('--mc', mut.color);
      card.innerHTML = '<div style="font-size:22px">'+mut.icon+'</div><h3>'+mut.name+'</h3><p>'+mut.desc+'</p><span class="mut-tag">'+mut.tag+'</span>';
      card.addEventListener('click', ()=>{ if(applyMutation(this.S, mut.id)){ modal.classList.add('hidden'); this.paused=false; }});
      grid.appendChild(card);
    });
    const skip=document.getElementById('mut-skip');
    if(skip){
      const nSkip = skip.cloneNode(true);
      skip.parentNode.replaceChild(nSkip, skip);
      nSkip.addEventListener('click', ()=>{ skipMutation(this.S); modal.classList.add('hidden'); this.paused=false; });
    }
    modal.classList.remove('hidden');
    this.paused = true;
  };
  const _origConsumeEvents = GameScene.prototype.consumeEvents;
  GameScene.prototype.consumeEvents = function(){
    for(const e of this.S.events) this.handleEvent(e);
    this.S.events.length=0;
  };
  const _origUpdate = GameScene.prototype.update;
  GameScene.prototype.update = function(_, dms){
    if(this.S && this.S.pendingMut){
      this.dashOffset += dms*0.06;
      this.updateParticles(dms/1000 *0.3);
      this.drawDynamic();
      this.syncHud();
      return;
    }
    return _origUpdate.call(this, _, dms);
  };
  const _origSyncHud = GameScene.prototype.syncHud;
  GameScene.prototype.syncHud = function(){
    _origSyncHud.call(this);
    const S=this.S; const el=id=>document.getElementById(id);
    const ring=el('wave-ring');
    if(ring){
      if(S.state==='combat'){
        const pct = Math.round(100 * (1 - S.waveQueue.length / Math.max(1, this._waveTotal||1)));
        ring.style.setProperty('--wpct', pct+'%');
        ring.style.background = 'conic-gradient(#38bdf8 '+pct+'%, rgba(56,189,248,0.12) 0)';
      } else if(S.state==='mutate'){
        ring.style.background='conic-gradient(#a78bfa 100%, rgba(56,189,248,0.12) 0)';
        const cc=el('countdown-chip'); if(cc) cc.textContent='⬢ ESCOLHA UMA MUTAÇÃO';
      }
    }
    const fill=document.getElementById('combo-fill');
    if(S.combo>0 && fill){
      const pct = Math.max(0, S.comboTimer / D.COMBO.window *100);
      fill.style.width = pct+'%';
      fill.style.background = S.combo>=15 ? 'linear-gradient(90deg, #fbbf24, #f43f5e)' : S.combo>=10 ? 'linear-gradient(90deg, #fbbf24, #fb923c)' : 'linear-gradient(90deg, #38bdf8, #34d399)';
      const bar=document.getElementById('combo-wrap'); if(bar) bar.classList.add('show');
    } else if(fill && S.combo===0){ fill.style.width='0%'; }
  };
  const _origBoomFx = GameScene.prototype.boomFx;
  GameScene.prototype.boomFx = function(x,y,r,col,big){
    _origBoomFx.call(this,x,y,r,col,big);
    const shock = this.getImg('shock');
    shock.setTexture('shock').setTint(Phaser.Display.Color.HexStringToColor(col).color).setPosition(x,y).setScale(0.2).setAlpha(0.7);
    shock.setData('life', 0.42); shock.setData('tot',0.42); shock.setData('vx',0); shock.setData('vy',0); shock.setData('grow', (r/18));
    if(!shock._inLayer){ this.fxOver.add(shock); shock._inLayer=true; }
    if(big){
      const flare=this.add.image(x,y,'flare').setTint(0xffffff).setScale(0.8).setAlpha(0.75).setDepth(75);
      this.tweens.add({ targets:flare, alpha:0, scale:1.8, duration:260, onComplete:()=> flare.destroy() });
      this.cameras.main.flash(120, 255,255,255, false);
    }
  };
  const _origMenuCreate = MenuScene.prototype.create;
  MenuScene.prototype.create = function(){
    _origMenuCreate.call(this);
    for(let i=0;i<4;i++){
      const s = this.add.image(Math.random()*BW, Math.random()*BH*0.6, 'soft').setTint(0xffffff).setScale(0.18).setAlpha(0);
      const delay = i*1200 + Math.random()*2000;
      this.time.delayedCall(delay, ()=>{
        const doShoot = ()=>{
          s.setPosition(Math.random()*BW*0.3, Math.random()*BH*0.4); s.setAlpha(0);
          this.tweens.add({ targets:s, x: s.x+ 340, y: s.y+ 170, alpha:0.9, duration:650 + Math.random()*400, ease:'Cubic.easeIn',
            onComplete:()=>{ s.setAlpha(0); this.time.delayedCall(1500+Math.random()*3000, doShoot); } });
        };
        s.setPosition(Math.random()*BW*0.3, Math.random()*BH*0.4);
        this.tweens.add({ targets:s, x: s.x+ 320, y: s.y+ 160, alpha:0.85, duration:600, ease:'Cubic.easeIn', onComplete: doShoot });
      });
    }
    const planet = this.add.image(BW/2, 86, 'soft').setTint(0x38bdf8).setScale(9).setAlpha(0.07).setDepth(-1);
    this.tweens.add({ targets:planet, scale:9.6, duration:3200, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
  };

  /* ================= TEMA: NAVES MÓVEIS + TERRA + SISTEMA SOLAR + SHMUP ================= */
  // Helper headless: moveTower
  function moveTower(S, t, nc, nr){
    if(!t || !S) return false;
    const dist = Math.abs(nc - t.c) + Math.abs(nr - t.r);
    const range = t.moveRange || t.defRef.mobility || 3;
    if(dist === 0 || dist > range) { SND.error(); return false; }
    const key = nc+','+nr;
    if(S.blocked[key] || S.occupied[key]) { SND.error(); return false; }
    if(nc<0||nc>=COLS||nr<0||nr>=ROWS) return false;
    if((t.moveCd||0) > 0) { SND.error(); ev(S, {t:'float', x:t.x, y:t.y-14, txt:'RECARREGANDO '+t.moveCd.toFixed(1)+'s', col:'#fbbf24', size:11}); return false; }
    // custo leve de movimento
    if(S.credits < 8){ SND.error(); return false; }
    S.credits -= 8;
    delete S.occupied[t.c+','+t.r];
    t.c = nc; t.r = nr;
    t.x = nc*CELL + CELL/2; t.y = nr*CELL + CELL/2;
    S.occupied[key] = t;
    t.moveCd = t.moveMaxCd || 3.0;
    t.recoil = 0.6;
    SND.build();
    ev(S, {t:'ring', x:t.x, y:t.y, maxR: CELL*1.8, col:'#38bdf8'});
    ev(S, {t:'float', x:t.x, y:t.y-18, txt:'→ MOVIDA', col:'#38bdf8', size:11});
    return true;
  }
  // export (adiado)
  // Patch stepSim to decrement moveCd
  const _origStepSim2 = stepSim;
  stepSim = function(S, dt){
    const res = _origStepSim2(S, dt);
    // decrement move cooldowns (stepSim already did time, but we need extra)
    if(S.towers) for(const t of S.towers){ if(t.moveCd>0) t.moveCd=Math.max(0,t.moveCd-dt); }
    return res;
  };
  // stepSim patch adiado

  // Extend THEME_BG with solar system
  Object.assign(THEME_BG, {
    'neptune-frontier': { base: 0x051425, accent: '#38bdf8', nebula: ['#0a1a3a','#051425'] },
    'saturn-rings': { base: 0x1a1408, accent: '#fbbf24', nebula: ['#2a1a08','#1a1408'] },
    'jupiter-orbit': { base: 0x1a0f08, accent: '#fb923c', nebula: ['#2a1408','#1a0f08'] },
    'asteroid-belt': { base: 0x0f0a14, accent: '#94a3b8', nebula: ['#1a0f1a','#0f0a14'] },
    'earth-orbit': { base: 0x051425, accent: '#22d3ee', nebula: ['#0a1a3a','#051425'] }
  });

  // Make earth texture — MAIOR E MAIS BONITO (pixel art detalhado, menos monocromático)
  const _origMakeTextures2 = makeTextures;
  makeTextures = function(scene){
    _origMakeTextures2(scene);
    if(scene.textures.exists('earth')) try{ scene.textures.remove('earth'); }catch(e){}
    const g = scene.make.graphics({x:0,y:0,add:false});
    // Terra pixel art 96x96: oceano azul profundo + continentes verdes + deserto + gelo + nuvens + brilho atmosférico
    g.fillStyle(0x0f1a3a,1); g.fillCircle(48,48,42);
    g.fillStyle(0x1e40af,1); g.fillCircle(48,48,40);
    g.fillStyle(0x1e3a8a,0.6); g.fillCircle(48,48,38);
    // continentes principais
    g.fillStyle(0x22c55e,0.98);
    g.fillCircle(36,40,14); g.fillCircle(60,52,11); g.fillCircle(42,62,8); g.fillCircle(64,34,7); g.fillCircle(50,70,6);
    // montanhas/deserto
    g.fillStyle(0xa3a04a,0.85); g.fillCircle(40,38,5); g.fillCircle(58,60,4);
    // gelo polar
    g.fillStyle(0xffffff,0.92); g.fillCircle(48,16,10); g.fillCircle(48,80,7);
    // nuvens brancas pixeladas
    g.fillStyle(0xffffff,0.22); g.fillCircle(30,30,16); g.fillCircle(66,42,12); g.fillCircle(38,58,10);
    g.fillStyle(0xffffff,0.14); g.fillCircle(52,26,8); g.fillCircle(60,68,6);
    // atmosfera cyan + borda
    g.lineStyle(3,0x38bdf8,0.95); g.strokeCircle(48,48,42);
    g.lineStyle(2,0x22d3ee,0.55); g.strokeCircle(48,48,45);
    g.lineStyle(1,0xffffff,0.22); g.strokeCircle(48,48,38);
    // brilho specular
    g.fillStyle(0xffffff,0.18); g.fillCircle(32,32,18);
    g.generateTexture('earth',96,96); g.destroy();
    const h = scene.make.graphics({x:0,y:0,add:false});
    h.fillStyle(0xffffff,1); h.fillCircle(4,4,3);
    h.generateTexture('star2',8,8); h.destroy();
  };

  // Patch GameScene buildStatic to use Earth
  const _origBuildStatic2 = GameScene.prototype.buildStatic;
  GameScene.prototype.buildStatic = function(){
    _origBuildStatic2.call(this);
    // substitui portal por Terra
    if(this.portalCore){ this.portalCore.destroy(); this.portalRing.destroy(); if(this.portalRing2) this.portalRing2.destroy(); }
    const p = this.portalPos;
    // Terra GIGANTE E MAIS BONITA — escala 2.8x, glow duplo e anéis com pixel art
    this.earth = this.add.image(p.x, p.y, 'earth').setScale(2.65).setDepth(5);
    this.earthGlow = this.add.image(p.x, p.y, 'glow').setTint(0x22d3ee).setScale(6.0).setAlpha(0.24).setDepth(4);
    this.earthRing = this.add.image(p.x, p.y, 'ring').setTint(0x38bdf8).setScale(4.2).setAlpha(0.60).setDepth(6);
    this.earthRing2 = this.add.image(p.x, p.y, 'ring').setTint(0x60a5fa).setScale(5.0).setAlpha(0.26).setDepth(5);
    // anel extra dourado para contraste
    this.earthRing3 = this.add.image(p.x, p.y, 'ring').setTint(0xfbbf24).setScale(2.9).setAlpha(0.18).setDepth(6);
    this.tweens.add({targets:this.earthRing, angle:360, duration:14000, repeat:-1});
    this.tweens.add({targets:this.earthRing2, angle:-360, duration:22000, repeat:-1});
    this.tweens.add({targets:this.earthRing3, angle:360, duration:18000, repeat:-1});
    this.tweens.add({targets:this.earth, angle:2, duration:3000, yoyo:true, repeat:-1, ease:'Sine.easeInOut'});
    this.tweens.add({targets:this.earthGlow, alpha:0.28, scale:6.4, duration:1600, yoyo:true, repeat:-1});
    this.tweens.add({targets:this.earth, scale:2.75, duration:2200, yoyo:true, repeat:-1, ease:'Sine.easeInOut'});
    // Texto TERRA maior e mais visível
    this.add.text(p.x, p.y+62, 'T E R R A', {fontFamily:'Orbitron', fontSize:'13px', color:'#38bdf8', fontStyle:'bold'}).setOrigin(0.5).setDepth(7).setAlpha(0.95).setShadow(0,0,'#38bdf8',12,true,true);
    // Atualiza portalPos refs
    this.portalCore = this.earth; this.portalRing = this.earthRing;
  };

  // Patch GameScene to support movimento
  GameScene.prototype.getMoveCells = function(t){
    const res=[];
    const range = t.moveRange || t.defRef.mobility || 3;
    for(let dc=-range; dc<=range; dc++) for(let dr=-range; dr<=range; dr++){
      if(Math.abs(dc)+Math.abs(dr)===0 || Math.abs(dc)+Math.abs(dr)>range) continue;
      const nc=t.c+dc, nr=t.r+dr;
      if(nc<0||nc>=COLS||nr<0||nr>=ROWS) continue;
      const key=nc+','+nr;
      if(this.S.blocked[key] || this.S.occupied[key]) continue;
      res.push({c:nc,r:nr,x:nc*CELL+CELL/2,y:nr*CELL+CELL/2});
    }
    return res;
  };
  const _origDrawDynamic2 = GameScene.prototype.drawDynamic;
  GameScene.prototype.drawDynamic = function(){
    _origDrawDynamic2.call(this);
    // highlight de movimento quando nave selecionada
    if(this.selected && this.selected.moveCd!==undefined){
      const cells = this.getMoveCells(this.selected);
      const g=this.uiGfx;
      // desenha alcance de movimento em verde/azul
      for(const cell of cells){
        const alpha = this.selected.moveCd>0 ? 0.08 : 0.18;
        const col = this.selected.moveCd>0 ? 0xf43f5e : 0x34d399;
        g.fillStyle(col, alpha);
        g.fillRect(cell.c*CELL+2, cell.r*CELL+2, CELL-4, CELL-4);
        g.lineStyle(1.2, col, this.selected.moveCd>0 ? 0.3 : 0.9);
        g.strokeRect(cell.c*CELL+2, cell.r*CELL+2, CELL-4, CELL-4);
      }
      // cooldown no painel?
    }
  };
  const _origBindInput2 = GameScene.prototype.bindInput;
  GameScene.prototype.bindInput = function(){
    // chama original mas vamos interceptar pointerdown para movimento
    const origHandler = this.input._events ? null : null; // placeholder
    _origBindInput2.call(this);
    // sobrescreve o listener de pointerdown para adicionar movimento
    this.input.off('pointerdown');
    this.input.on('pointerdown', p=>{
      SND.unlock();
      if(this.paused) return;
      const wx = p.worldX!=null? p.worldX: p.x;
      const wy = p.worldY!=null? p.worldY: p.y;
      if(this.armed){ applySuper(this.S, this.armed, wx, wy); this.armed=null; return; }
      if(p.event && p.event.target !== this.game.canvas) return;
      const c=Math.floor(wx/CELL), r=Math.floor(wy/CELL);
      // se tem nave selecionada e clicou em célula de movimento válida, move
      if(this.selected){
        const moveCells = this.getMoveCells(this.selected);
        const target = moveCells.find(cell=> cell.c===c && cell.r===r);
        if(target){
          if(moveTower(this.S, this.selected, c, r)){
            this.showTowerPanel(this.selected);
            this.syncTowers();
            return;
          }
        }
      }
      if(this.placingId){
        const t=placeTower(this.S,c,r,this.placingId);
        if(t){ this.placingId=null; this.refreshShopSel(); this.hideTowerPanel(); }
        return;
      }
      const key=c+','+r;
      if(this.S.occupied[key]){
        this.selected=this.S.occupied[key];
        this.showTowerPanel(this.selected);
        SND.ui();
      } else {
        this.selected=null;
        this.hideTowerPanel();
      }
    });
  };
  // Patch showTowerPanel para mostrar mobilidade e cooldown
  const _origShowPanel = GameScene.prototype.showTowerPanel;
  GameScene.prototype.showTowerPanel = function(t){
    _origShowPanel.call(this,t);
    if(t.defRef && t.defRef.kind === 'factory') return; // v3 PIXEL FASE 5: painel da fábrica não recebe extras
    const specBox=this.el('tp-specs');
    // adiciona info de mobilidade após specs
    const mob = t.moveRange || t.defRef.mobility || 3;
    const cd = t.moveCd||0;
    const extra = document.createElement('div');
    extra.style.cssText='margin-top:6px;padding:6px 8px;background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.18);font-size:11px;line-height:1.3';
    extra.innerHTML = `⭢ <b style="color:#34d399">NAVE MÓVEL</b> • Alcance <b>${mob} casas</b> • ${cd>0? '<span style="color:#f43f5e">Recarga '+cd.toFixed(1)+'s</span>' : '<span style="color:#34d399">Pronta pra mover</span>'}<br><span style="color:var(--muted)">Clique numa casa verde ao redor para mover (custo 8 créditos)</span>`;
    // evita duplicar
    const old = specBox.querySelector('.mob-info');
    if(old) old.remove();
    extra.className='mob-info';
    specBox.appendChild(extra);
    // SKILLS: mostra as desbloqueadas (lvl 4,8,12...)
    const def = t.defRef || t.def;
    if(def && def.skills && def.skills.length){
      const skBox = document.createElement('div');
      skBox.style.cssText='margin-top:6px;padding:6px 8px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.16);font-size:11px;line-height:1.5';
      const unlocked = def.skills.filter(s=>t.level>=s.lvl);
      const next = def.skills.find(s=>t.level<s.lvl);
      skBox.innerHTML = '<div style="color:var(--gold,#fbbf24);font-weight:700;margin-bottom:3px">✦ SKILLS DA NAVE</div>' +
        (unlocked.length ? unlocked.map(s=>`<div style="color:#fbbf24">✔ <b>NV${s.lvl}</b> — ${s.name}</div>`).join('') : '<div style="color:var(--muted,#8fa3c4)">Nenhuma skill desbloqueada ainda</div>') +
        (next ? `<div style="color:var(--muted,#8fa3c4);margin-top:2px">Próxima: <b style="color:#e8eefc">NV${next.lvl}</b> — ${next.name}</div>` : '<div style="color:#34d399;margin-top:2px">Todas as skills desbloqueadas!</div>');
      const oldSk = specBox.querySelector('.skills-info');
      if(oldSk) oldSk.remove();
      skBox.className='skills-info';
      specBox.appendChild(skBox);
    }
  };

  /* ================= TASK 6: NaveScene polimórfica 5 modos ================= */
  // Fallback NAVE_STYLES caso data.js ainda não tenha migrado (usa SHMUP_STAGES)
  const NAVE_IDS = ['asteroids','horizontal','vertical','arena','tunnel'];
  function resolveNaveStage(stageIdx){
    // uso explícito de D.NAVE_STYLES[stageIdx] exigido pela spec
    const fromNAVE = D.NAVE_STYLES ? D.NAVE_STYLES[stageIdx] : null;
    if(fromNAVE) return fromNAVE;
    if(D.SHMUP_STAGES && D.SHMUP_STAGES[stageIdx]) return D.SHMUP_STAGES[stageIdx];
    if(D.METAL_STAGES && D.METAL_STAGES[stageIdx]) return D.METAL_STAGES[stageIdx];
    return {id: NAVE_IDS[stageIdx]||'vertical', name:'Patrulha', bg:'#020617', accent:'#38bdf8', enemyPool:['drone','swarm'], duration:22, target:22, speed:1.0};
  }

  class NaveScene extends Phaser.Scene {
    constructor(key){ super(key || 'Nave'); }
    create(data){
      // Suporte a campanhas 5x5 (novo) e stageIdx legado
      const camps = D.NAVE_CAMPAIGNS||null;
      const hasCampaign = data && data.campaignIdx!=null && camps;
      if(hasCampaign){
        this.campaignIdx = Math.max(0, Math.min(camps.length-1, data.campaignIdx|0));
        this.phaseIdx = Math.max(0, Math.min(4, data.phaseIdx!=null? data.phaseIdx|0 : 0));
        const camp = camps[this.campaignIdx];
        const phase = camp.phases ? camp.phases[this.phaseIdx] : camp;
        this.campaign = camp;
        this.stage = Object.assign({}, camp, phase, { name: camp.name+' — Fase '+phase.n+': '+phase.name, accent: camp.accent, bg: camp.bg });
        this.styleId = camp.styleId || camp.id;
        this.stageIdx = this.phaseIdx;
        this.campaignId = camp.id;
      } else {
        const rawIdx = data && data.stageIdx!=null ? data.stageIdx : (data && data.styleIdx!=null ? data.styleIdx : (data && data.nextMapIdx!=null ? data.nextMapIdx : 0));
        this.stageIdx = Math.max(0, Math.min(4, rawIdx|0));
        const cfgFromNAVE = D.NAVE_STYLES ? D.NAVE_STYLES[this.stageIdx] : null;
        const cfgFallback = resolveNaveStage(this.stageIdx);
        this.stage = cfgFromNAVE || cfgFallback;
        const _nv = D.NAVE_STYLES ? D.NAVE_STYLES[this.stageIdx] : this.stage;
        const ids = ['asteroids','horizontal','vertical','arena','tunnel'];
        this.styleId = (data && data.styleId) ? String(data.styleId).toLowerCase() : (this.stage && this.stage.id ? String(this.stage.id).toLowerCase() : ids[this.stageIdx]);
        if(ids.indexOf(this.styleId)===-1) this.styleId = ids[this.stageIdx] || 'vertical';
        this.campaignIdx = this.stageIdx; this.phaseIdx=0; this.campaign=null; this.campaignId=this.styleId;
      }
      this.nextMap = data && data.nextMapIdx!=null ? data.nextMapIdx : this.stageIdx;
      this.diffKey = data && data.diffKey || 'normal';
      // nave escolhida (1 das 10) — mesma do TD
      this.shipId = (data && data.shipId) || localStorage.getItem('nave_last_ship') || (D.TOWERS_DATA[0].id);
      this.shipDef = D.TOWERS_DATA.find(t=>t.id===this.shipId) || D.TOWERS_DATA[0];
      this.shipLevel = (D.Save.data.shipLevels && D.Save.data.shipLevels[this.shipId]) || 1;
      // calcula stats da nave (dano/escala com nível e skills)
      this.shipDmgMul = 1 + (this.shipLevel-1)*0.18;
      if(this.shipDef.skills){ for(const sk of this.shipDef.skills){ if(this.shipLevel>=sk.lvl && sk.eff && sk.eff.dmgMul) this.shipDmgMul*=sk.eff.dmgMul; } }
      this.score=0; this.timeLeft=this.stage.duration||22; this.enemies=[]; this.bullets=[]; this.eBullets=[]; this.boss=null; this.bossHp=0;
      this._finished=false;
      const bgCol = this.stage.bg || '#020617';
      this.cameras.main.setBackgroundColor(bgCol);
      // FIX DOM: esconde HUD do TD que ficava por cima da briefing (causava trava)
      try{ document.getElementById('topbar')?.classList.add('off'); }catch(e){}
      try{ document.getElementById('shopbar')?.classList.add('off'); }catch(e){}
      try{ document.getElementById('screen-menu')?.classList.add('hidden'); }catch(e){}
      try{ document.getElementById('board-shell')?.classList.remove('hidden'); }catch(e){}
      // garante que inputs anteriores não bloqueiem
      this._cdRunning=false; this.phaseActive=false;
      // ===== OBJETIVO DA FASE (kill / survive / boss) =====
      this.objKind = (this.stage && this.stage.obj) ? this.stage.obj : (this.stage && this.stage.boss ? 'boss' : 'kill');
      if(this.objKind==='boss') this.objKind='boss';
      this.bossKilled=false;
      // ===== POLISH: vinheta + scanlines + borda glow (estilo TD) =====
      if(!this.textures.exists('vig')){
        const cv=this.textures.createCanvas('vig', BW, BH);
        const ctx=cv.getContext();
        const g=ctx.createRadialGradient(BW/2,BH/2, Math.min(BW,BH)*0.42, BW/2,BH/2, Math.max(BW,BH)*0.72);
        g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(2,4,10,0.5)');
        ctx.fillStyle=g; ctx.fillRect(0,0,BW,BH);
        cv.refresh();
      }
      if(!this.textures.exists('scan')){
        const cv=this.textures.createCanvas('scan', 4, 4);
        const ctx=cv.getContext();
        ctx.fillStyle='rgba(255,255,255,0.028)'; ctx.fillRect(0,0,4,1);
        cv.refresh();
      }
      this.add.image(BW/2,BH/2,'vig').setDepth(17);
      this.add.tileSprite(BW/2,BH/2,BW,BH,'scan').setDepth(17).setAlpha(0.9);
      const accCol=Phaser.Display.Color.HexStringToColor(this.stage.accent||'#38bdf8').color;
      this.borderGlow=this.add.rectangle(BW/2,BH/2,BW-6,BH-6).setStrokeStyle(2,accCol,0.20).setDepth(18);
      this.tweens.add({targets:this.borderGlow, alpha:0.45, duration:1800, yoyo:true, repeat:-1, ease:'Sine.easeInOut'});
      // ===== HUD PAINÉIS (estilo TD) =====
      const panel=(x,y,w,h)=>{ const g=this.add.graphics().setDepth(19); g.fillStyle(0x0d1526,0.88); g.fillPoints([{x:x+6,y},{x:x+w-6,y},{x:x+w,y:y+6},{x:x+w,y:y+h-6},{x:x+w-6,y:y+h},{x:x+6,y:y+h},{x,y:y+h-6},{x,x:y+6}],true); g.lineStyle(1,accCol,0.35); g.strokePoints([{x:x+6,y},{x:x+w-6,y},{x:x+w,y:y+6},{x:x+w,y:y+h-6},{x:x+w-6,y:y+h},{x:x+6,y:y+h},{x,y:y+h-6},{x,x:y+6}],true); return g; };
      panel(10,6,236,34);
      const objLabel=this.objKind==='survive'? 'SOBREVIVA' : this.objKind==='boss'? 'CHEFE' : 'ABATES';
      this.add.text(20,11,objLabel,{fontFamily:'Orbitron',fontSize:'8px',color:'#8fa3c4'}).setDepth(20);
      this.scoreTxt=this.add.text(20,19,'',{fontFamily:'Orbitron',fontSize:'14px',color:'#fbbf24',fontStyle:'bold'}).setDepth(20);
      // timer central
      panel(BW/2-140,6,280,26);
      this.timerBarBg=this.add.rectangle(BW/2,19,264,12,0x000000,0.55).setDepth(20);
      this.timerBar=this.add.rectangle(BW/2-132,19,264,12,this.objKind==='survive'?0x34d399:accCol).setOrigin(0,0.5).setDepth(21);
      this.timeTxt=this.add.text(BW/2,19,'',{fontFamily:'Orbitron',fontSize:'10px',color:'#e8eefc'}).setOrigin(0.5).setDepth(22);
      // título fase centro-topo sob timer
      const campName = this.campaign ? this.campaign.name : '';
      const faseTxt = this.campaign ? `FASE ${this.phaseIdx+1}/5` : `NAV ${this.stageIdx+1}`;
      this.add.text(BW/2,38,`${campName.toUpperCase()} ${faseTxt}`.trim(),{fontFamily:'Orbitron',fontSize:'9px',color:this.shipDef.color||'#e8eefc'}).setOrigin(0.5,0).setDepth(20);
      // painel direito status
      panel(BW-206,6,196,34);
      this.livesTxt = this.add.text(BW-196,10,'',{fontFamily:'Orbitron', fontSize:'13px', color:'#f43f5e'}).setDepth(20);
      this.bombsTxt = this.add.text(BW-130,10,'',{fontFamily:'Orbitron', fontSize:'11px', color:'#fb923c'}).setDepth(20);
      this.tierTxt = this.add.text(BW-196,27,'',{fontFamily:'Orbitron', fontSize:'10px', color:'#38bdf8'}).setDepth(20);
      this.updateHudExtras();
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D,SPACE,SHIFT');
      this.input.keyboard.on('keydown-SPACE', ()=> this.shoot());
      this.input.on('pointerdown', ()=> this.shoot());
      // switch por styleId - exigido spec
      switch(this.styleId){
        case 'asteroids': this.createAsteroids(); break;
        case 'horizontal': this.createHorizontal(); break;
        case 'vertical': this.createVertical(); break;
        case 'arena': this.createArena(); break;
        case 'tunnel': this.createTunnel(); break;
        default: this.createVertical(); break;
      }
      SND.musicTick('combat', 8, true);
      this.spawnTimer=0; this.bulletTimer=0;
      this.autoFireTimer=0;
      const af={asteroids:0.22, horizontal:0.16, vertical:0.14, arena:0.15, tunnel:0.17};
      const baseDelay = af[this.styleId]||0.16;
      const lvlScale = Math.max(0.62, 1 - (this.shipLevel-1)*0.012);
      this.baseAutoFireDelay = baseDelay * lvlScale;
      this.autoFireDelay = this.baseAutoFireDelay;
      this.chargeHeld=0; this.isCharging=false;
      // ===== SISTEMAS COMPARTILHADOS (vidas, combo, tier, bombas, drops) =====
      this.lives = 3 + (this.shipLevel>=20?1:0);
      this.iframes = 1.2; // graça inicial
      this.combo=0; this.comboT=0;
      this.weaponTier=1; this.rapidT=0;
      this.bombs = 2 + (this.shipLevel>=30?1:0);
      this.powerups=[]; this.killsSinceDrop=0;
      this.kills=0;
      this.elapsed=0; this.waveIdx=0;
      // HUD extra
      this.livesTxt = this.add.text(BW-12, 26, '', {fontFamily:'Orbitron', fontSize:'13px', color:'#f43f5e'}).setOrigin(1,0).setDepth(20);
      this.bombsTxt = this.add.text(BW-12, 44, '', {fontFamily:'Orbitron', fontSize:'11px', color:'#fb923c'}).setOrigin(1,0).setDepth(20);
      this.tierTxt = this.add.text(12, 26, '', {fontFamily:'Orbitron', fontSize:'11px', color:'#38bdf8'}).setDepth(20);
      this.updateHudExtras();
      // bomba: teclas X / B / Q
      this.input.keyboard.on('keydown-X', ()=> this.useBomb());
      this.input.keyboard.on('keydown-B', ()=> this.useBomb());
      this.input.keyboard.on('keydown-Q', ()=> this.useBomb());
      // plano de ondas + banner de anúncio
      this.buildWaves();
      // ===== BRIEFING DE MISSÃO (padrão TD) =====
      this.phaseActive=false;
      this.time.delayedCall(60, ()=> this.showBriefing());
    }
    objDesc(){
      if(this.objKind==='survive') return {t:'SOBREVIVA', d:`Aguarde ${Math.round(this.stage.duration||22)}s sob ataque sem perder todas as vidas`, val:''};
      if(this.objKind==='boss') return {t:'CHEFE', d:'Localize e destrua o chefe da fase', val:''};
      return {t:'ABATER', d:`Destrua ${this.stage.target||22} inimigos antes do tempo acabar`, val:'0/'+(this.stage.target||22)};
    }
    showBriefing(){
      const acc=this.stage.accent||'#38bdf8';
      const accCol=Phaser.Display.Color.HexStringToColor(acc).color;
      const od=this.objDesc();
      this.briefC=this.add.container(0,0).setDepth(30);
      const dim=this.add.rectangle(BW/2,BH/2,BW,BH,0x020617,0.86);
      const g=this.add.graphics();
      const bx=BW/2-260, by=70, bw2=520, bh2=330;
      g.fillStyle(0x0d1526,0.97); g.fillPoints([{x:bx+14,y:by},{x:bx+bw2-14,y:by},{x:bx+bw2,y:by+14},{x:bx+bw2,y:by+bh2-14},{x:bx+bw2-14,y:by+bh2},{x:bx+14,y:by+bh2},{x:bx,y:by+bh2-14},{x:bx,y:by+14}],true);
      g.lineStyle(2,accCol,0.8); g.strokePoints([{x:bx+14,y:by},{x:bx+bw2-14,y:by},{x:bx+bw2,y:by+14},{x:bx+bw2,y:by+bh2-14},{x:bx+bw2-14,y:by+bh2},{x:bx+14,y:by+bh2},{x:bx,y:by+bh2-14},{x:bx,y:by+14}],true);
      this.briefC.add([dim,g]);
      const campName=this.campaign? this.campaign.name : 'PATRULHA';
      const title=this.add.text(BW/2, by+34, campName.toUpperCase(), {fontFamily:'Orbitron',fontSize:'21px',color:acc,fontStyle:'bold'}).setOrigin(0.5).setShadow(0,0,acc,16,true,true);
      const fase=this.add.text(BW/2, by+62, `FASE ${this.phaseIdx+1} de 5 — ${this.stage.name||''}`.toUpperCase(), {fontFamily:'Orbitron',fontSize:'11px',color:'#e8eefc'}).setOrigin(0.5);
      this.briefC.add([title,fase]);
      // OBJETIVO box
      const og=this.add.graphics();
      og.fillStyle(accCol,0.10); og.fillRect(bx+30,by+92,bw2-60,64);
      og.lineStyle(1,accCol,0.55); og.strokeRect(bx+30,by+92,bw2-60,64);
      this.briefC.add(og);
      const oTag=this.add.text(bx+42,by+100,'◆ OBJETIVO',{fontFamily:'Orbitron',fontSize:'9px',color:'#8fa3c4'}).setDepth(31);
      const oTxt=this.add.text(BW/2,by+122,od.t,{fontFamily:'Orbitron',fontSize:'19px',color:'#fbbf24',fontStyle:'bold'}).setOrigin(0.5);
      const oDesc=this.add.text(BW/2,by+143,od.d,{fontFamily:'Rajdhani',fontSize:'12px',color:'#cbd5e1'}).setOrigin(0.5);
      this.briefC.add([oTag,oTxt,oDesc]);
      // nave escolhida
      const sIcon=this.add.text(BW/2,by+186,`${this.shipDef.icon}`, {fontFamily:'Orbitron',fontSize:'20px',color:this.shipDef.color}).setOrigin(0.5);
      const ship=this.add.text(BW/2,by+212,`${this.shipDef.name} • NV ${this.shipLevel}/50`,{fontFamily:'Orbitron',fontSize:'13px',color:this.shipDef.color}).setOrigin(0.5);
      const kindTxt={bullet:'Canhão balístico',beam:'Feixe contínuo',splash:'Mísseis teleguiados',slow:'Pulso criogênico',chain:'Raio em cadeia',snipe:'Tiro de precisão',dot:'Veneno corrosivo',buff:'Amplificador',pierce:'Railgun perfurante'}[this.shipDef.kind]||this.shipDef.kind;
      const skils=this.shipDef.skills? this.shipDef.skills.filter(s=>this.shipLevel>=s.lvl).length : 0;
      const shipSub=this.add.text(BW/2,by+230,`${kindTxt} • ${skils} skill${skils===1?'':'s'} ativa${skils===1?'':'s'}`,{fontFamily:'Rajdhani',fontSize:'11px',color:'#8fa3c4'}).setOrigin(0.5);
      this.briefC.add([sIcon,ship,shipSub]);
      // dica por estilo
      const hints={asteroids:'SETAS/WASD movem • nave aponta a direção • X = bomba',horizontal:'W/S sobe/desce • A/D avança • segure ESPAÇO = tiro carregado',vertical:'Setas/WASD ou mouse • X = bomba • pegue Ⓟ para evoluir a arma',arena:'WASD move • mouse mira • X = bomba quando cercado',tunnel:'← → trocam de lane • cuidado com flippers dourados'};
      const hint=this.add.text(BW/2,by+262,hints[this.styleId]||'',{fontFamily:'JetBrains Mono',fontSize:'9px',color:'#64748b'}).setOrigin(0.5);
      this.briefC.add(hint);
      // CTA piscando
      const cta=this.add.text(BW/2,by+bh2-36,'▶ TOQUE OU ENTER PARA DECOLAR ◀',{fontFamily:'Orbitron',fontSize:'13px',color:acc,fontStyle:'bold'}).setOrigin(0.5);
      this.tweens.add({targets:cta,alpha:0.25,duration:600,yoyo:true,repeat:-1});
      this.briefC.add(cta);
      SND.musicTick('menu');
      // FIX TRAVA: briefing agora responde a Phaser + DOM (ENTER, SPACE, clique, toque) e dim interativo
      const go=()=>{ if(this.phaseActive || this._cdRunning) return;
        this._cdRunning=true;
        try{
          this.input.off('pointerdown',go);
          this.input.keyboard.off('keydown-ENTER',go);
          this.input.keyboard.off('keydown-SPACE',go);
          this.input.keyboard.off('keydown',go);
        }catch(_){}
        try{ if(this._domGo) document.removeEventListener('keydown', this._domGo); }catch(e){}
        try{ document.removeEventListener('pointerdown', go); }catch(e){}
        try{ dim.off('pointerdown',go); }catch(e){}
        this.startCountdown();
      };
      // Phaser input (canvas)
      try{
        this.input.on('pointerdown',go);
        this.input.keyboard.on('keydown-ENTER',go);
        this.input.keyboard.on('keydown-SPACE',go);
        this.input.keyboard.on('keydown',go);
      }catch(e){}
      // DOM fallback (garante ENTER/SPACE mesmo se Phaser não capturar)
      try{
        const domGo = (ev)=>{ if(ev && ev.key && !['Enter',' ','Space'].includes(ev.key) && ev.type==='keydown' && ev.key.length!==1) return; go(); };
        document.addEventListener('keydown', domGo, {once:false});
        document.addEventListener('pointerdown', go, {once:false});
        // guarda para remover depois
        this._domGo = domGo;
      }catch(e){}
      // torna o dim clicável (cobre toda a tela) — fallback se Phaser input falhar
      try{ dim.setInteractive(); dim.on('pointerdown', go); }catch(e){}
      // também clique no canvas DOM direto
      try{
        const canvas = document.querySelector('#game-canvas canvas');
        if(canvas) canvas.addEventListener('pointerdown', go, {once:false});
      }catch(e){}
      // auto-fallback: se em 30s não decolar, permite decolar via timeout (evita trava permanente)
      this.time.delayedCall(30000, ()=>{ if(!this.phaseActive && !this._cdRunning && this.briefC) { console.warn('[Nave] fallback auto-go'); go(); } });
    }
    startCountdown(){
      if(this.briefC){ this.briefC.destroy(); this.briefC=null; }
      let n=3;
      const cd=this.add.text(BW/2,BH*0.42,'3',{fontFamily:'Orbitron',fontSize:'64px',color:'#fbbf24',fontStyle:'bold'}).setOrigin(0.5).setDepth(30).setScale(1.4);
      cd.setShadow(0,0,'#fbbf24',24,true,true);
      SND.shoot('chain');
      const tick=()=>{
        n--;
        if(n>0){ cd.setText(String(n)); cd.setScale(1.4); this.tweens.add({targets:cd,scale:1,duration:260}); SND.ui(); this.time.delayedCall(520,tick); }
        else { cd.setText('GO!'); cd.setColor('#34d399'); cd.setShadow(0,0,'#34d399',28,true,true); this.tweens.add({targets:cd,scale:1.7,alpha:0,duration:380,onComplete:()=>cd.destroy()}); this.beginPhase(); }
      };
      this.time.delayedCall(520,tick);
    }
    beginPhase(){
      this.phaseActive=true;
      SND.musicTick('combat', 8, true);
    }
    updateHudExtras(){
      if(this.livesTxt) this.livesTxt.setText('♥'.repeat(Math.max(0,this.lives))+'·'.repeat(Math.max(0,5-this.lives)));
      if(this.bombsTxt) this.bombsTxt.setText('✸ BOMBA ×'+this.bombs);
      if(this.tierTxt) this.tierTxt.setText('PWR '+this.weaponTier+'/4'+(this.rapidT>0? ' ⚡RAPID':''));
    }
    comboMult(){ return Math.min(4, 1+Math.floor(this.combo/8)); }
    addScore(n){
      const pts=Math.round(n*this.comboMult());
      this.score+=pts;
      return pts;
    }
    fxExplode(x,y,col,n){
      n=n||8;
      for(let k=0;k<n;k++){
        const p=this.add.image(x,y,'dot').setTint(col).setScale(0.3+Math.random()*0.5).setDepth(9);
        const a=Math.random()*Math.PI*2, d=20+Math.random()*46;
        this.tweens.add({targets:p, x:x+Math.cos(a)*d, y:y+Math.sin(a)*d, alpha:0, scale:0.05, duration:260+Math.random()*180, onComplete:()=>p.destroy()});
      }
      const fl=this.add.image(x,y,'soft').setTint(col).setScale(0.7).setAlpha(0.85).setDepth(9);
      this.tweens.add({targets:fl, scale:1.6, alpha:0, duration:200, onComplete:()=>fl.destroy()});
    }
    popup(x,y,txt,col){
      const t=this.add.text(x,y,txt,{fontFamily:'Orbitron', fontSize:'10px', color:col||'#fbbf24'}).setOrigin(0.5).setDepth(21);
      this.tweens.add({targets:t, y:y-26, alpha:0, duration:650, onComplete:()=>t.destroy()});
    }
    announce(txt,col){
      if(this._ann) this._ann.destroy();
      this._ann=this.add.text(BW/2, BH*0.32, txt, {fontFamily:'Orbitron', fontSize:'22px', color:col||'#e8eefc', fontStyle:'bold'}).setOrigin(0.5).setDepth(22).setAlpha(0);
      this._ann.setShadow(0,0,col||'#38bdf8',14,true,true);
      this.tweens.add({targets:this._ann, alpha:1, scale:1.08, duration:220, yoyo:true, hold:520, onComplete:()=>{ if(this._ann){this._ann.destroy(); this._ann=null;} }});
    }
    spawnPowerup(x,y){
      const roll=Math.random();
      let type='P';
      if(this.lives<5 && roll<0.18) type='S';
      else if(roll<0.42) type='B';
      else if(roll<0.60 && this.weaponTier<4) type='P';
      else type='R';
      const cols={P:0xfbbf24,S:0x34d399,B:0xfb923c,R:0x22d3ee};
      const img=this.add.image(x,y,'ring').setTint(cols[type]).setScale(0.55).setDepth(10);
      const core=this.add.text(x,y,type,{fontFamily:'Orbitron',fontSize:'11px',color:'#fff'}).setOrigin(0.5).setDepth(11);
      this.powerups.push({img, core, x,y, vy:64, type, t:0});
    }
    updatePowerups(dt){
      for(let i=this.powerups.length-1;i>=0;i--){
        const u=this.powerups[i];
        u.t+=dt; u.y+=u.vy*dt; u.img.setPosition(u.x,u.y); u.core.setPosition(u.x,u.y);
        u.img.setScale(0.45+Math.sin(u.t*6)*0.12);
        if(u.y>BH+24){ u.img.destroy(); u.core.destroy(); this.powerups.splice(i,1); continue; }
        if(Math.hypot(u.x-this.playerBody.x, u.y-this.playerBody.y)<28){
          SND.buy();
          if(u.type==='P'){ this.weaponTier=Math.min(4,this.weaponTier+1); this.popup(u.x,u.y,'POWER UP!','#fbbf24'); }
          else if(u.type==='S'){ this.lives=Math.min(5,this.lives+1); this.popup(u.x,u.y,'+1 VIDA','#34d399'); }
          else if(u.type==='B'){ this.bombs++; this.popup(u.x,u.y,'+1 BOMBA','#fb923c'); }
          else { this.rapidT=8; this.popup(u.x,u.y,'TIRO RÁPIDO!','#22d3ee'); }
          this.updateHudExtras();
          u.img.destroy(); u.core.destroy(); this.powerups.splice(i,1);
        }
      }
    }
    useBomb(){
      if(!this.bombs || this.bombs<=0 || this.timeLeft<=0 || this._finished) { SND.error(); return; }
      this.bombs--; this.updateHudExtras();
      SND.explosion(2); SND.victory();
      this.cameras.main.flash(160,255,255,255,false);
      this.cameras.main.shake(240,0.010);
      const ring=this.add.circle(this.playerBody.x, this.playerBody.y, 10, 0xffffff, 0.65).setDepth(15);
      this.tweens.add({targets:ring, scale:34, alpha:0, duration:480, onComplete:()=>ring.destroy()});
      for(let i=this.eBullets.length-1;i>=0;i--){ const b=this.eBullets[i]; const s=this.add.image(b.x,b.y,'dot').setTint(0xffffff).setScale(0.5).setDepth(9); this.tweens.add({targets:s,alpha:0,scale:0.05,duration:260,onComplete:()=>s.destroy()}); b.img.destroy(); this.eBullets.splice(i,1); }
      for(let i=this.enemies.length-1;i>=0;i--){
        const e=this.enemies[i];
        if(e.isBoss){ e.hp-=10; e.img.setTint(0xffaaaa); this.time.delayedCall(120,()=>{ if(e.img&&e.img.active&&e.def&&e.def.col) e.img.setTint(Phaser.Display.Color.HexStringToColor(e.def.col).color); }); this.updateBossBar(e); if(e.hp<=0) this.bossDie(e); continue; }
        this.fxExplode(e.x,e.y,Phaser.Display.Color.HexStringToColor((e.def&&e.def.col)||'#94a3b8').color,6);
        e.img.destroy(); if(e.shadow) e.shadow.destroy(); this.enemies.splice(i,1); this.kills++; this.score+=5;
      }
      this.announce('✸ BOMBA!', '#fb923c');
    }
    hurtPlayer(){
      if(this.iframes>0 || this._finished || this.timeLeft<=0 || this.lives<=0) return;
      this.lives--; this.iframes=1.7;
      this.combo=0;
      SND.leak();
      this.cameras.main.flash(110,244,63,94,false);
      this.cameras.main.shake(140,0.008);
      this.popup(this.playerBody.x, this.playerBody.y-24, '-1 ♥', '#f43f5e');
      this.updateHudExtras();
      if(this.lives<=0){
        this.announce('NAVE DESTRUÍDA', '#f43f5e');
        this.fxExplode(this.playerBody.x,this.playerBody.y,0xf43f5e,22);
        if(this.player) this.player.setVisible(false);
        this._dead=true;
        this.time.delayedCall(700, ()=>{ this.finish(); });
      }
    }
    buildWaves(){
      const dur=(this.stage.duration||24)*0.92;
      const isBossPhase=!!(this.stage&&this.stage.boss);
      const times=[dur*0.14, dur*0.34, dur*0.54, dur*0.72];
      this.waves=times.map(t=>({t, done:false}));
      this.finalWaveT=dur*0.86;
      if(isBossPhase) this.waves.push({t:this.finalWaveT, boss:true, done:false});
      else this.waves.push({t:this.finalWaveT, mega:true, done:false});
    }
    processWaves(dt){
      this.elapsed+=dt;
      while(this.waveIdx<this.waves.length && this.elapsed>=this.waves[this.waveIdx].t){
        const w=this.waves[this.waveIdx];
        w.done=true;
        if(w.boss){
          this.announce('⚠ CHEFE ⚠', '#f43f5e');
          this.spawnStyleBoss();
        } else {
          this.announce('ONDA '+(this.waveIdx+1), this.stage.accent||'#38bdf8');
          try{ this['wave_'+this.styleId](this.waveIdx); }catch(e){}
        }
        this.waveIdx++;
      }
    }
    updateCentral(dt){
      // i-frames piscando
      if(this.iframes>0){ this.iframes-=dt; if(this.player) this.player.setAlpha((Math.floor(this.iframes*14)%2)?0.25:0.85); if(this.iframes<=0 && this.player) this.player.setAlpha(1); }
      // combo timer
      if(this.comboT>0){ this.comboT-=dt; if(this.comboT<=0) this.combo=0; }
      // rapid fire
      if(this.rapidT>0){ this.rapidT-=dt; if(this.rapidT<=0) this.updateHudExtras(); else if(Math.floor(this.rapidT*2)!==Math.floor((this.rapidT+dt)*2)) this.updateHudExtras(); }
      // delay efetivo
      this.autoFireDelay = this.baseAutoFireDelay * (this.rapidT>0?0.55:1);
      // atiradores centrais (saucer, torres etc.)
      for(const e of this.enemies){
        if(!e.shootEvery || !e.img || !e.img.active) continue;
        e.shootT=(e.shootT==null? e.shootEvery : e.shootT)-dt;
        if(e.shootT<=0){
          e.shootT=e.shootEvery;
          const ang=Math.atan2(this.playerBody.y-e.y, this.playerBody.x-e.x);
          const eb=this.add.image(e.x,e.y,'dot').setTint(0xef4444).setScale(0.62).setDepth(9);
          this.eBullets.push({img:eb,x:e.x,y:e.y,vx:Math.cos(ang)*230,vy:Math.sin(ang)*230,life:3});
          SND.shoot('chain');
        }
      }
      // balas inimigas genéricas (estilos sem loop próprio: arena/tunnel)
      if(this.styleId==='arena'||this.styleId==='tunnel'){
        for(let i=this.eBullets.length-1;i>=0;i--){
          const b=this.eBullets[i];
          b.life=(b.life||3)-dt; b.x+=b.vx*dt; b.y+=b.vy*dt; b.img.setPosition(b.x,b.y);
          if(b.life<=0||b.x<-24||b.x>BW+24||b.y<-24||b.y>BH+24){ b.img.destroy(); this.eBullets.splice(i,1); continue; }
          if(Math.hypot(b.x-this.playerBody.x,b.y-this.playerBody.y)<17){ b.img.destroy(); this.eBullets.splice(i,1); this.hurtPlayer(); }
        }
      }
      // power-ups + HUD combo
      this.updatePowerups(dt);
      // RASTRO DE MOTOR (polish TD)
      if(this.player && this.playerBody && Math.random()<0.55){
        const px=this.playerBody.x, py=(this.styleId==='tunnel'? this.player.y : (this.playerBody.y||0));
        const trail=this.add.image(px+(Math.random()-0.5)*6, py+18, 'soft').setTint(this._shipCol()).setScale(0.32).setAlpha(0.4).setDepth(8);
        this.tweens.add({targets:trail, y:trail.y+10, alpha:0, scale:0.05, duration:300, onComplete:()=>trail.destroy()});
      }
      const mult=this.comboMult();
      if(this.scoreTxt) this.scoreTxt.setText('ABATES '+this.kills+'/'+(this.stage.target||22)+(mult>1? '  ×'+mult : '  '+this.score+'pts'));
    }
    initBossBar(label){
      this.bossBarBg=this.add.rectangle(BW/2,50,260,10,0x000000,0.65).setDepth(20);
      this.bossBar=this.add.rectangle(BW/2-130,50,260,10,0xf43f5e).setOrigin(0,0.5).setDepth(21);
      if(label) this.add.text(BW/2,36,label,{fontFamily:'Orbitron',fontSize:'9px',color:'#f43f5e'}).setOrigin(0.5).setDepth(20);
    }
    updateBossBar(e){
      if(this.bossBar) this.bossBar.width=260*Math.max(0,e.hp/e.maxHp);
    }
    bossDie(e){
      this.bossKilled=true;
      this.fxExplode(e.x,e.y,0xfbbf24,26);
      for(let k=0;k<10;k++){ const p=this.add.image(e.x+(Math.random()-0.5)*70,e.y+(Math.random()-0.5)*40,'dot').setTint(0xf43f5e).setScale(0.8); this.tweens.add({targets:p,alpha:0,scale:0.1,duration:500,delay:k*40,onComplete:()=>p.destroy()}); }
      SND.explosion(2.4);
      this.cameras.main.shake(300,0.012);
      this.kills=(this.kills||0)+1;
      const pts=this.addScore(e.pts||15);
      this.popup(e.x,e.y,'+'+pts+' BOSS!','#fbbf24');
      if(e.img) e.img.destroy(); if(e.shadow) e.shadow.destroy();
      const idx=this.enemies.indexOf(e); if(idx>=0) this.enemies.splice(idx,1);
      if(this.bossBarBg) this.bossBarBg.destroy(); if(this.bossBar) this.bossBar.destroy();
      this.boss=null;
      this.announce('CHEFE DESTRUÍDO!', '#34d399');
    }
    _handleBossHit(b,e){
      e.hp--;
      this.updateBossBar(e);
      e.img.setTint(0xffaaaa);
      this.time.delayedCall(70,()=>{ if(e.img&&e.img.active&&e.def&&e.def.col) e.img.setTint(Phaser.Display.Color.HexStringToColor(e.def.col).color); });
      this.cameras.main.shake(40,0.003);
      if(e.hp<=0){ this.bossDie(e); return true; }
      return false;
    }

    // ===== ASTEROIDS: polígonos 3 tamanhos + saucer atirador =====
    createAsteroids(){
      const g=this.add.graphics().setDepth(0);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(this.stage.bg||'#020617').color,1); g.fillRect(0,0,BW,BH);
      for(let i=0;i<70;i++){ const x=Math.random()*BW, y=Math.random()*BH; g.fillStyle(0xffffff, Math.random()*0.8); g.fillCircle(x,y, Math.random()<0.9?1:1.8); }
      // texturas procedurais de asteroide (irregulares, estilo vetorial)
      const sizes=[['astL',34],['astM',22],['astS',12]];
      for(const [key,R] of sizes){
        if(this.textures.exists(key)) continue;
        const gg=this.make.graphics({x:0,y:0,add:false});
        const pts=[]; const n=8+Math.floor(Math.random()*4);
        for(let i=0;i<n;i++){ const a=i/n*Math.PI*2; const rr=R*(0.72+Math.random()*0.38); pts.push({x:R+Math.cos(a)*rr, y:R+Math.sin(a)*rr}); }
        gg.fillStyle(0x3d4a63,1); gg.fillPoints(pts,true);
        gg.lineStyle(2,0xa8b6d4,0.95); gg.strokePoints(pts,true);
        // crateras
        gg.fillStyle(0x2a3550,1);
        for(let c=0;c<3;c++){ gg.fillCircle(R*0.5+(Math.random()-0.5)*R, R*0.5+(Math.random()-0.5)*R, R*0.14); }
        gg.generateTexture(key,R*2,R*2); gg.destroy();
      }
      const tex='tur_'+this.shipDef.id+'_'+Math.min(30,this.shipLevel);
      this.player = this.add.image(BW/2, BH/2, tex);
      if(!this.textures.exists(tex)) this.player.setTexture('dot');
      this.player.setScale(1.05 + Math.min(0.25, this.shipLevel*0.012)).setDepth(10).setTint(Phaser.Display.Color.HexStringToColor(this.shipDef.color).color);
      this.playerShadow = this.add.ellipse(this.player.x, this.player.y+16, 28,10,0x000000,0.25).setDepth(9);
      this.playerBody = {x:BW/2, y:BH/2, vx:0, vy:0, w:32, h:32, angle: -Math.PI/2};
      this.player.setRotation(this.playerBody.angle + Math.PI/2);
      // alguns asteroides iniciais
      for(let k=0;k<3;k++) this.spawnAsteroid('L');
    }
    spawnAsteroid(sizeClass, x, y){
      let radius, pts, texKey;
      if(sizeClass==='L'){ radius=32; pts=20; texKey='astL'; }
      else if(sizeClass==='M'){ radius=21; pts=50; texKey='astM'; }
      else { radius=12; pts=100; texKey='astS'; }
      let px=x, py=y;
      if(px==null){
        let tries=0;
        do{
          const edge=Math.floor(Math.random()*4);
          if(edge===0){ px=Math.random()*BW; py=-30; }
          else if(edge===1){ px=BW+30; py=Math.random()*BH; }
          else if(edge===2){ px=Math.random()*BW; py=BH+30; }
          else { px=-30; py=Math.random()*BH; }
          tries++;
        } while(Math.hypot(px-this.playerBody.x, py-this.playerBody.y)<110 && tries<6);
      }
      const ang=(y==null)? Math.atan2(BH/2-py, BW/2-px)+(Math.random()-0.5)*0.9 : Math.random()*Math.PI*2;
      const spd=(sizeClass==='S'? 120 : sizeClass==='M'? 88 : 62)*(0.85+Math.random()*0.4)*(this.stage.speed||1);
      const img=this.add.image(px,py,texKey).setDepth(8);
      img.setRotation(Math.random()*Math.PI*2);
      this.enemies.push({img, x:px, y:py, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, hp:1, def:{r:radius,col:'#94a3b8'}, astSize:sizeClass, pts, spin:(Math.random()-0.5)*1.4});
    }
    spawnSaucer(){
      const fromLeft=Math.random()<0.5;
      const x=fromLeft? -26 : BW+26;
      const y=60+Math.random()*(BH-160);
      const img=this.add.image(x,y,'en_wasp').setScale(1.15).setDepth(8);
      if(!this.textures.exists('en_wasp')) img.setTexture('dot');
      img.setTint(0xf43f5e);
      this.enemies.push({img, x,y, vx:(fromLeft?1:-1)*(105+this.waveIdx*18), vy:0, hp:2, def:{r:16,col:'#f43f5e'}, saucer:true, pts:200, shootEvery:1.7, wobble:Math.random()*6});
    }
    updateAsteroids(dt){
      // CONTROLES CORRIGIDOS: setas/WASD movem direto e nave aponta para direção (8-way)
      let dx=0, dy=0;
      if(this.cursors.left.isDown || this.wasd.A.isDown) dx-=1;
      if(this.cursors.right.isDown || this.wasd.D.isDown) dx+=1;
      if(this.cursors.up.isDown || this.wasd.W.isDown) dy-=1;
      if(this.cursors.down.isDown || this.wasd.S.isDown) dy+=1;
      // normaliza diagonal
      if(dx!==0 && dy!==0){ dx*=0.7071; dy*=0.7071; }
      if(dx!==0 || dy!==0){
        const ang=Math.atan2(dy, dx);
        this.playerBody.angle = ang;
        this.player.setRotation(ang + Math.PI/2);
        // thrust na direção das setas (sentido corrigido)
        this.playerBody.vx += Math.cos(ang) * 520 * dt;
        this.playerBody.vy += Math.sin(ang) * 520 * dt;
        // feedback visual quando corre
        if(Math.random()<0.18){
          const tail=this.add.image(this.playerBody.x - Math.cos(ang)*14, this.playerBody.y - Math.sin(ang)*14, 'dot').setTint(0x38bdf8).setScale(0.45).setAlpha(0.7).setDepth(9);
          this.tweens.add({targets:tail, alpha:0, scale:0.1, duration:220, onComplete:()=>tail.destroy()});
        }
      }
      // drift com amortecimento
      this.playerBody.vx *= 0.985; this.playerBody.vy *= 0.985;
      // clamp velocidade
      const sp=Math.hypot(this.playerBody.vx, this.playerBody.vy);
      if(sp>380){ this.playerBody.vx*=380/sp; this.playerBody.vy*=380/sp; }
      this.playerBody.x += this.playerBody.vx * dt;
      this.playerBody.y += this.playerBody.vy * dt;
      // wrap em BOARD_W/H
      if(this.playerBody.x < -20) this.playerBody.x = BW+20;
      if(this.playerBody.x > BW+20) this.playerBody.x = -20;
      if(this.playerBody.y < -20) this.playerBody.y = BH+20;
      if(this.playerBody.y > BH+20) this.playerBody.y = -20;
      this.player.setPosition(this.playerBody.x, this.playerBody.y);
      this.playerShadow.setPosition(this.playerBody.x, this.playerBody.y+16);
      // TIRO AUTOMÁTICO na direção da nave
      this.autoFireTimer=(this.autoFireTimer||0)+dt;
      if(this.autoFireTimer>=this.autoFireDelay){ this.autoFireTimer=0; this.shoot(); }
      this.handleAsteroidsSpawn(dt);
      this.handleAsteroidsBullets(dt);
      this.handleAsteroidsEnemies(dt);
    }
    handleAsteroidsSpawn(dt){
      this.spawnTimer+=dt;
      const rate = Math.max(0.55, 1.15 - (this.stage.speed||1)*0.12);
      if(this.spawnTimer>rate){
        this.spawnTimer=0;
        // distribuição clássica: mais L no início, S depois
        const roll=Math.random();
        const sizeClass = this.waveIdx<=1 ? (roll<0.7?'L':'M') : (roll<0.35?'L':roll<0.75?'M':'S');
        this.spawnAsteroid(sizeClass);
      }
      // saucer periódico (a partir da onda 2)
      this.saucerT=(this.saucerT==null? 6+Math.random()*4 : this.saucerT)-dt;
      if(this.saucerT<=0){
        if(this.waveIdx>=1 && !this.enemies.some(e=>e.saucer)) this.spawnSaucer();
        this.saucerT=8+Math.random()*5;
      }
    }
    handleAsteroidsBullets(dt){
      for(let i=this.bullets.length-1;i>=0;i--){
        const b=this.bullets[i];
        // homing para mísseis
        if(b.homing && this.enemies.length){
          let nearest=null, nd=1e9;
          for(const e of this.enemies){ const d=Math.hypot(e.x-b.x, e.y-b.y); if(d<160 && d<nd){ nd=d; nearest=e; } }
          if(nearest){ const ang=Math.atan2(nearest.y-b.y, nearest.x-b.x); const curAng=Math.atan2(b.vy,b.vx); let diff=ang-curAng; while(diff>Math.PI) diff-=2*Math.PI; while(diff<-Math.PI) diff+=2*Math.PI; const turn=3.8*dt; const na=curAng + Math.max(-turn, Math.min(turn, diff)); const spd=Math.hypot(b.vx,b.vy); b.vx=Math.cos(na)*spd; b.vy=Math.sin(na)*spd; if(b.img) b.img.setRotation(na+Math.PI/2); }
        }
        b.x+=b.vx*dt; b.y+=b.vy*dt; b.img.setPosition(b.x,b.y);
        if(b.img && b.img.rotation!=null && b.homing) b.img.setRotation(Math.atan2(b.vy,b.vx)+Math.PI/2);
        if(b.x<-10) b.x=BW+10; if(b.x>BW+10) b.x=-10;
        if(b.y<-10) b.y=BH+10; if(b.y>BH+10) b.y=-10;
        b.life-=dt; if(b.life<=0){ b.img.destroy(); this.bullets.splice(i,1); }
      }
      for(let i=this.eBullets.length-1;i>=0;i--){
        const b=this.eBullets[i];
        b.x+=b.vx*dt; b.y+=b.vy*dt; b.img.setPosition(b.x,b.y);
        if(b.x<-10) b.x=BW+10; if(b.x>BW+10) b.x=-10; // wrap
        if(b.y<-10) b.y=BH+10; if(b.y>BH+10) b.y=-10; // wrap
        b.life-=dt; if(b.life<=0){ b.img.destroy(); this.eBullets.splice(i,1); continue; }
        if(Math.hypot(b.x-this.playerBody.x,b.y-this.playerBody.y)<18){ b.img.destroy(); this.eBullets.splice(i,1); this.hurtPlayer(); }
      }
    }
    handleAsteroidsEnemies(dt){
      for(let i=this.enemies.length-1;i>=0;i--){
        const e=this.enemies[i];
        if(e.slowed && e.slowed>0){ e.slowed-=dt; if(e.slowed<=0){ e.slowed=0; if(e.img) e.img.setTint(Phaser.Display.Color.HexStringToColor(e.def.col).color); } }
        if(e.dot && e.dotDur && e.dotDur>0){ e.dotDur-=dt; e.dotTick=(e.dotTick||0)+dt; if(e.dotTick>0.45){ e.dotTick=0; this.damageEnemyNave(e,i); continue; } }
        const slowMul = e.slowed? (1-(e.slowVal||0.55)) : 1;
        e.x+=e.vx*slowMul*dt; e.y+=e.vy*slowMul*dt;
        if(e.saucer){ e.wobble+=dt*2.2; e.y+= Math.sin(e.wobble)*26*dt; }
        // wrap asteroids
        if(e.x<-30) e.x=BW+30; if(e.x>BW+30) e.x=-30;
        if(e.y<-30) e.y=BH+30; if(e.y>BH+30) e.y=-30;
        e.img.setPosition(e.x,e.y); if(e.shadow) e.shadow.setPosition(e.x,e.y+10);
        if(!e.saucer) e.img.rotation+=(e.spin||0.6)*dt*slowMul;
        if(Math.hypot(e.x-this.playerBody.x, e.y-this.playerBody.y)< (e.def.r+14)){
          if(e.hp>1 && !e.saucer){ e.hp--; const a=Math.atan2(this.playerBody.y-e.y,this.playerBody.x-e.x); e.vx=-Math.cos(a)*130; e.vy=-Math.sin(a)*130; this.hurtPlayer(); continue; }
          this.hurtPlayer();
          this.fxExplode(e.x,e.y,Phaser.Display.Color.HexStringToColor(e.def.col).color,8);
          e.img.destroy(); if(e.shadow) e.shadow.destroy(); this.enemies.splice(i,1);
          continue;
        }
        for(let j=this.bullets.length-1;j>=0;j--){
          const b=this.bullets[j];
          if(Math.hypot(e.x-b.x, e.y-b.y)< e.def.r+9){
            const shouldRemoveBullet = this._handleShipHit(b,e,this.enemies);
            if(shouldRemoveBullet){ b.img.destroy(); this.bullets.splice(j,1); }
            this.damageEnemyNave(e,i,true);
            break;
          }
        }
      }
    }
    damageEnemyNave(e, idx, fromBullet){
      // hp-- e morte com split (asteroids) / pontos / drops
      e.hp=(e.hp||1)-1;
      if(e.hp>0){
        e.img.setTint(0xffffff); this.time.delayedCall(60,()=>{ if(e.img&&e.img.active) e.img.setTint(Phaser.Display.Color.HexStringToColor((e.def&&e.def.col)||'#fff').color); });
        return false;
      }
      // split clássico L→2M→2S
      if(e.astSize && e.astSize!=='S'){
        for(let k=0;k<2;k++){
          const child = e.astSize==='L' ? 'M' : 'S';
          const ang=Math.random()*Math.PI*2;
          this.spawnAsteroid(child, e.x+Math.cos(ang)*12, e.y+Math.sin(ang)*12);
          const c=this.enemies[this.enemies.length-1];
          const ca=Math.atan2(BH/2-e.y+(Math.random()-0.5)*200, BW/2-e.x+(Math.random()-0.5)*200);
          c.vx=Math.cos(ang)*95*(this.stage.speed||1); c.vy=Math.sin(ang)*95*(this.stage.speed||1);
        }
      }
      const col=Phaser.Display.Color.HexStringToColor((e.def&&e.def.col)||'#94a3b8').color;
      this.fxExplode(e.x,e.y,col, e.astSize==='L'?12:7);
      const pts=this.addScore(e.pts||1);
      this.kills=(this.kills||0)+1;
      if(pts>=50||e.saucer) this.popup(e.x,e.y,'+'+pts,'#fbbf24');
      this.combo++; this.comboT=2.6;
      SND.explosion(e.astSize==='L'?1.1:0.6);
      this.killsSinceDrop++;
      if(Math.random()<0.05 || this.killsSinceDrop>=11){ this.killsSinceDrop=0; this.spawnPowerup(e.x,e.y); }
      e.img.destroy(); if(e.shadow) e.shadow.destroy();
      const i=this.enemies.indexOf(e);
      if(i>=0) this.enemies.splice(i,1);
      return true;
    }
    spawnTunnelEnemy(){
      const lane=Math.floor(Math.random()*3);
      const ex=this.laneX[lane], ey=-18;
      const pool=this.stage.enemyPool||['phase','wasp','bomber'];
      const t=pool[Math.floor(Math.random()*pool.length)];
      const def=D.ENEMIES_DATA[t]||D.ENEMIES_DATA['phase'];
      const img=this.add.image(ex, ey, 'en_'+t).setScale(0.78).setDepth(8);
      if(!this.textures.exists('en_'+t)) img.setTexture('dot');
      img.setTint(Phaser.Display.Color.HexStringToColor(def.col).color);
      const sh=this.add.ellipse(ex, ey+12, 14,5,0x000000,0.18).setDepth(7);
      // flipper a partir da fase 2 (pula lanes como Tempest)
      const flipper = this.waveIdx>=2 && Math.random()<0.35;
      if(flipper) img.setTint(0xfbbf24);
      this.enemies.push({img, shadow:sh, x:ex, y:ey, lane, vy:(140+Math.random()*45)*(this.stage.speed||1)+(lane===this.currentLane?16:0), hp:flipper?2:1, def, flipper, pts:flipper?30:12});
    }
    wave_tunnel(w){
      // fila de flippers em lanes alternadas
      for(let k=0;k<3+w;k++){
        this.time.delayedCall(k*220, ()=>{ if(!this._finished){ this.spawnTunnelEnemy(); const e=this.enemies[this.enemies.length-1]; if(e&&e.vy) e.vy*=1.25; } });
      }
    }
    wave_asteroids(w){
      for(let k=0;k<4+w;k++) this.spawnAsteroid('L');
      if(w>=2) this.spawnSaucer();
    }
    // ===== BOSS GENÉRICO por estilo =====
    spawnStyleBoss(){
      if(this.boss) return;
      const tex=this.textures.exists('en_boss1')?'en_boss1':(this.textures.exists('en_colossus')?'en_colossus':'soft');
      const accent=Phaser.Display.Color.HexStringToColor(this.stage.accent||'#f43f5e').color;
      const hp=36+this.campaignIdx*14+(this.shipLevel>=25?6:0);
      const img=this.add.image(BW/2,-60,tex).setScale(2.3).setDepth(9).setTint(accent);
      const shadow=this.add.ellipse(BW/2,40,60,16,0x000000,0.3).setDepth(8);
      const e={isBoss:true,img,shadow,x:BW/2,y:-60,hp,maxHp:hp,def:{r:52,col:this.stage.accent},pts:20,bt:0,mt:0,phase:1};
      this.boss=e;
      this.enemies.push(e);
      this.initBossBar(this.stage.name? 'CHEFE — '+this.stage.name.toUpperCase():'CHEFE');
      this.updateBossBar(e);
    }
    bossMoveCommon(e,dt){
      if(e.y<(e.homeY||120)) e.y+=70*dt;
      if(e.shadow){ e.shadow.setPosition(e.x,e.y+46); }
    }
    bossFireRadial(e,n,spd){
      n=n||10;
      const base=Math.random()*Math.PI*2;
      for(let a=0;a<n;a++){ const ang=base+a/n*Math.PI*2; const eb=this.add.image(e.x,e.y,'dot').setTint(0xef4444).setScale(0.6).setDepth(9); this.eBullets.push({img:eb,x:e.x,y:e.y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life:4}); }
      SND.shoot('splash');
    }
    bossFireAimed(e,n){
      const ang=Math.atan2(this.playerBody.y-e.y,this.playerBody.x-e.x);
      n=n||3;
      for(let k=-(n-1)/2;k<=(n-1)/2;k++){
        const eb=this.add.image(e.x,e.y,'dot').setTint(0xf43f5e).setScale(0.66).setDepth(9);
        this.eBullets.push({img:eb,x:e.x,y:e.y,vx:Math.cos(ang+k*0.22)*260,vy:Math.sin(ang+k*0.22)*260,life:4});
      }
      SND.shoot('chain');
    }
    bossUpd_asteroids(e,dt){
      this.bossMoveCommon(e,dt); e.homeY=e.homeY||130;
      e.x=BW/2+Math.sin(this.elapsed*0.55)*(BW*0.30);
      e.img.setPosition(e.x,e.y);
      e.img.rotation+=dt*0.7;
      e.bt=(e.bt||0)-dt;
      if(e.bt<=0 && e.y>100){ e.bt=e.hp<e.maxHp/2?1.15:1.6; this.bossFireRadial(e,12,150); }
    }
    bossUpd_horizontal(e,dt){
      this.bossMoveCommon(e,dt); e.homeY=140;
      e.x=Math.min(BW-110, e.x+40*dt); 
      e.y=e.homeY + Math.sin(this.elapsed*0.9)*90;
      e.img.setPosition(e.x,e.y);
      e.bt=(e.bt||0)-dt;
      if(e.bt<=0 && e.x>BW*0.5){ e.bt=e.hp<e.maxHp/2?1.0:1.35; this.bossFireAimed(e, e.hp<e.maxHp/2?5:3); }
      e.mt=(e.mt||0)-dt;
      if(e.mt<=0 && e.x>BW*0.5){ e.mt=3.2; // spawna minions
        for(let k=0;k<2;k++) this.spawnHorizontalEnemy('runner', e.y-40+k*80);
      }
    }
    bossUpd_arena(e,dt){
      this.bossMoveCommon(e,dt); e.homeY=130;
      // persegue devagar
      const ang=Math.atan2(this.playerBody.y-e.y,this.playerBody.x-e.x);
      e.x+=Math.cos(ang)*46*dt; e.y+=Math.sin(ang)*46*dt;
      e.x=Phaser.Math.Clamp(e.x,80,BW-80); e.y=Phaser.Math.Clamp(e.y,80,BH-120);
      e.img.setPosition(e.x,e.y);
      e.bt=(e.bt||0)-dt;
      if(e.bt<=0){ e.bt=e.hp<e.maxHp/2?1.5:2.1; this.bossFireRadial(e,10,170); }
      e.mt=(e.mt||0)-dt;
      if(e.mt<=0){ // dash telegrafado
        e.mt=3.4;
        const da=Math.atan2(this.playerBody.y-e.y,this.playerBody.x-e.x);
        this.tweens.add({targets:e.img, alpha:0.5, duration:180, yoyo:true});
        this.time.delayedCall(300,()=>{ if(!e.img||!e.img.active) return; this.tweens.add({targets:{},duration:1}); e.vx=Math.cos(da)*430; e.vy=Math.sin(da)*430; });
      }
      if(e.vx||e.vy){
        e.x+=e.vx*dt; e.y+=e.vy*dt;
        e.vx*=0.92; e.vy*=0.92;
        e.x=Phaser.Math.Clamp(e.x,60,BW-60); e.y=Phaser.Math.Clamp(e.y,60,BH-100);
        if(Math.hypot(e.vx,e.vy)<24){ e.vx=0; e.vy=0; }
        e.img.setPosition(e.x,e.y);
      }
    }
    bossUpd_tunnel(e,dt){
      this.bossMoveCommon(e,dt); e.homeY=BH*0.30;
      e.laneT=(e.laneT==null?2:e.laneT)-dt;
      if(e.laneT<=0){ e.laneT=2.1; e.lane=Math.floor(Math.random()*3); this.tweens.add({targets:e.img, x:this.laneX[e.lane], duration:340, ease:'Cubic.easeInOut'}); }
      e.x=e.img.x;
      e.img.setPosition(e.x,e.y);
      e.bt=(e.bt||0)-dt;
      if(e.bt<=0 && e.y>BH*0.2){ // feixe de lane
        e.bt=e.hp<e.maxHp/2?1.3:1.8;
        const lx=e.img.x;
        for(let k=0;k<5;k++){
          this.time.delayedCall(k*90, ()=>{ if(!this._finished&&e.img&&e.img.active){ const eb=this.add.image(lx,e.y+34,'dot').setTint(0xa78bfa).setScale(0.75).setDepth(9); this.eBullets.push({img:eb,x:lx,y:e.y+34,vx:(this.playerBody.x-lx)*0.35,vy:330,life:3}); } });
        }
        SND.shoot('pierce');
      }
    }

    // ===== HORIZONTAL: tilePositionX+charge Pod amp =====
    createHorizontal(){
      const bgCol = this.stage.bg||'#0a0f1a';
      this.cameras.main.setBackgroundColor(bgCol);
      // fundo parallax 3 camadas
      if(!this.textures.exists('hbg')){
        const g=this.make.graphics({x:0,y:0,add:false});
        g.fillStyle(Phaser.Display.Color.HexStringToColor(bgCol).color,1); g.fillRect(0,0,256,256);
        g.fillStyle(0xffffff,0.07); for(let i=0;i<28;i++) g.fillRect(Math.random()*256, Math.random()*256, 1,1);
        g.fillStyle(0xffffff,0.14); for(let i=0;i<10;i++) g.fillCircle(Math.random()*256, Math.random()*256, 1.2);
        g.generateTexture('hbg',256,256); g.destroy();
      }
      if(!this.textures.exists('hbg2')){
        const g=this.make.graphics({x:0,y:0,add:false});
        g.fillStyle(0xffffff,0.04); for(let i=0;i<6;i++) g.fillCircle(Math.random()*256, Math.random()*256, 18);
        g.generateTexture('hbg2',256,256); g.destroy();
      }
      this.bgTile = this.add.tileSprite(BW/2, BH/2, BW, BH, 'hbg').setDepth(0).setAlpha(0.95);
      this.bgTile2 = this.add.tileSprite(BW/2, BH/2, BW, BH, 'hbg2').setTint(Phaser.Display.Color.HexStringToColor(this.stage.accent||'#fbbf24').color).setAlpha(0.07).setScale(2.2).setDepth(1);
      this.bgTile3 = this.add.tileSprite(BW/2, BH/2, BW, BH, 'soft').setTint(0xffffff).setAlpha(0.035).setScale(3.5).setDepth(1);
      const texH='tur_'+this.shipDef.id+'_'+Math.min(30,this.shipLevel);
      this.player = this.add.image(90, BH/2, texH);
      if(!this.textures.exists(texH)) this.player.setTexture('dot');
      this.player.setScale(1.05 + Math.min(0.22, this.shipLevel*0.01)).setDepth(10).setTint(Phaser.Display.Color.HexStringToColor(this.shipDef.color).color);
      this.player.setRotation(Math.PI/2);
      this.playerBody = {x:90, y:BH/2, w:28, h:22};
      this.playerShadow = this.add.ellipse(this.player.x, this.player.y+16, 24,8,0x000000,0.22).setDepth(9);
      // Pod amp que orbita (mecânica charge amp) - mais visível
      this.pod = this.add.image(this.playerBody.x+18, this.playerBody.y-10, 'soft').setTint(0xfbbf24).setScale(0.55).setAlpha(0.9).setDepth(10);
      this.podOrbit=0;
      // charge bar
      this.charge = 0; // 0..1
      this.chargeTxt = this.add.text(12, BH-18, 'CHARGE 0%', {fontFamily:'Orbitron', fontSize:'10px', color:'#fbbf24'}).setDepth(20);
    }
    updateHorizontal(dt){
      // scroll parallax 3 camadas
      if(this.bgTile) this.bgTile.tilePositionX += dt * 160 * (this.stage.speed||1);
      if(this.bgTile2) this.bgTile2.tilePositionX += dt * 90 * (this.stage.speed||1);
      if(this.bgTile3) this.bgTile3.tilePositionX += dt * 35 * (this.stage.speed||1);
      // charge hold: segurar espaço
      const spaceDown = this.wasd.SPACE.isDown || this.input.activePointer.isDown;
      if(spaceDown){
        this.charge = Math.min(1, this.charge + dt*0.9);
        this.isCharging=true;
      } else {
        if(this.isCharging && this.charge>0.15){
          this.fireHorizontalCharge(this.charge);
        }
        this.charge = Math.max(0, this.charge - dt*1.8);
        this.isCharging=false;
      }
      if(this.chargeTxt) this.chargeTxt.setText('CHARGE '+Math.round(this.charge*100)+'%'+ (this.charge>=0.95?' PRONTO':''));
      // pod amp orbita
      this.podOrbit+=dt*3.2;
      if(this.pod) this.pod.setPosition(this.playerBody.x + Math.cos(this.podOrbit)*18, this.playerBody.y + Math.sin(this.podOrbit)*14);
      // player move vertical + leve horizontal (80..200)
      let dy=0, dx=0;
      if(this.cursors.up.isDown || this.wasd.W.isDown) dy=-1;
      if(this.cursors.down.isDown || this.wasd.S.isDown) dy=1;
      if(this.cursors.left.isDown || this.wasd.A.isDown) dx=-1;
      if(this.cursors.right.isDown || this.wasd.D.isDown) dx=1;
      if(this.input.activePointer.isDown){
        const my=this.input.activePointer.worldY, mx=this.input.activePointer.worldX;
        dy = Math.sign(my - this.playerBody.y) * 0.9;
        dx = Math.sign(mx - this.playerBody.x) * 0.6;
      }
      this.playerBody.y = Phaser.Math.Clamp(this.playerBody.y + dy*320*dt, 32, BH-32);
      this.playerBody.x = Phaser.Math.Clamp(this.playerBody.x + dx*220*dt, 64, 210);
      this.player.setPosition(this.playerBody.x, this.playerBody.y);
      this.playerShadow.setPosition(this.playerBody.x, this.playerBody.y+14);
      // nave aponta para direita com inclinação (se corre pra esquerda aponta levemente esquerda)
      this.player.setRotation(Math.PI/2 + dy*0.35 + dx* -0.28);
      // TIRO AUTOMÁTICO horizontal
      this.autoFireTimer=(this.autoFireTimer||0)+dt;
      if(this.autoFireTimer>=this.autoFireDelay){
        this.autoFireTimer=0;
        if(!this.isCharging || this.charge<0.85) this.shoot();
      }
      this.handleHorizontalSpawn(dt);
      this.handleHorizontalBullets(dt);
    }
    fireHorizontalCharge(pow){
      SND.shoot('bullet');
      const dmgScale = 1 + pow*2.2;
      // tira normal + Pod amp amplifica
      const b=this.add.image(this.playerBody.x+18, this.playerBody.y, 'dot').setTint(0xffffff).setScale(0.55+pow*0.6).setDepth(9);
      this.bullets.push({img:b, x:this.playerBody.x+18, y:this.playerBody.y, vx:560, vy:0, life:1.2, dmg:dmgScale});
      if(this.pod){
        const pb=this.add.image(this.pod.x, this.pod.y, 'dot').setTint(0xfbbf24).setScale(0.5+pow*0.4).setDepth(9);
        this.bullets.push({img:pb, x:this.pod.x, y:this.pod.y, vx:560, vy: Math.sin(this.podOrbit)*20, life:1.2, dmg:dmgScale*0.7});
      }
      this.tweens.add({targets:this.player, scale:1.18, duration:70, yoyo:true});
    }
    spawnHorizontalEnemy(type, y){
      const def=D.ENEMIES_DATA[type]||D.ENEMIES_DATA['runner'];
      const yy = y!=null? y : 50+Math.random()*(BH-100);
      const x=BW+30;
      const img=this.add.image(x,yy,'en_'+type).setScale(0.92).setDepth(8);
      if(!this.textures.exists('en_'+type)) img.setTexture('dot');
      img.setTint(Phaser.Display.Color.HexStringToColor(def.col).color);
      const sh=this.add.ellipse(x,yy+10,16,6,0x000000,0.18).setDepth(7);
      const isSine=(type==='wasp'||type==='runner') && Math.random()<0.7;
      this.enemies.push({img, shadow:sh, x, y:yy, baseY:yy, vx:-(95+Math.random()*85)*(this.stage.speed||1), vy:0, hp:(type==='tank'?3:1), def, sine:isSine, amp:26+Math.random()*24, freq:1.8+Math.random()*1.4, t:0, pts:type==='tank'?30:(isSine?20:10)});
    }
    handleHorizontalSpawn(dt){
      this.spawnTimer+=dt;
      const rate = Math.max(0.55, 1.05 - (this.stage.speed||1)*0.11);
      if(this.spawnTimer>rate){
        this.spawnTimer=0;
        const pool=this.stage.enemyPool||['tank','runner','wasp'];
        const t=pool[Math.floor(Math.random()*pool.length)];
        this.spawnHorizontalEnemy(t);
      }
    }
    handleHorizontalBullets(dt){
      for(let i=this.bullets.length-1;i>=0;i--){
        const b=this.bullets[i];
        if(b.homing && this.enemies.length){
          let ne=null, nd=1e9; for(const e of this.enemies){ if(e.isBoss) continue; const d=Math.hypot(e.x-b.x,e.y-b.y); if(d<180 && d<nd){ nd=d; ne=e; } }
          if(ne){ const ang=Math.atan2(ne.y-b.y, ne.x-b.x); const ca=Math.atan2(b.vy,b.vx); let diff=ang-ca; while(diff>Math.PI) diff-=2*Math.PI; while(diff<-Math.PI) diff+=2*Math.PI; const turn=4.2*dt; const na=ca+Math.max(-turn,Math.min(turn,diff)); const sp=Math.hypot(b.vx,b.vy); b.vx=Math.cos(na)*sp; b.vy=Math.sin(na)*sp; }
        }
        b.x+=b.vx*dt; b.y+=b.vy*dt; b.img.setPosition(b.x,b.y);
        if(b.x>BW+30){ b.img.destroy(); this.bullets.splice(i,1); continue; }
        for(let j=this.enemies.length-1;j>=0;j--){
          const e=this.enemies[j];
          if(Math.hypot(e.x-b.x, e.y-b.y)< e.def.r+9){
            const rm=this._handleShipHit(b,e,this.enemies);
            if(rm){ b.img.destroy(); this.bullets.splice(i,1); }
            if(!e.isBoss) this.damageEnemyNave(e,j);
            break;
          }
        }
      }
      for(let i=this.enemies.length-1;i>=0;i--){
        const e=this.enemies[i];
        if(e.isBoss) continue;
        if(e.slowed && e.slowed>0){ e.slowed-=dt; if(e.slowed<=0) e.slowed=0; }
        if(e.dot && e.dotDur>0){ e.dotDur-=dt; e.dotTick=(e.dotTick||0)+dt; if(e.dotTick>0.5){ e.dotTick=0; this.damageEnemyNave(e,i); continue; } }
        const sm = e.slowed? 0.45 : 1;
        e.t=(e.t||0)+dt;
        if(e.sine){ e.x+=e.vx*sm*dt; e.y=e.baseY + Math.sin(e.t*e.freq)*e.amp; }
        else { e.x+=e.vx*sm*dt; e.y+=e.vy*sm*dt; }
        e.img.setPosition(e.x,e.y); e.shadow.setPosition(e.x,e.y+10);
        if(e.x<-40){ e.img.destroy(); e.shadow.destroy(); this.enemies.splice(i,1); continue; }
        if(Math.hypot(e.x-this.playerBody.x, e.y-this.playerBody.y)< 24){ this.fxExplode(e.x,e.y,0xf43f5e,6); e.img.destroy(); e.shadow.destroy(); this.enemies.splice(i,1); this.hurtPlayer(); }
      }
    }
    wave_horizontal(w){
      // esquadrão em formação V
      const n=4+w;
      const cy=90+Math.random()*(BH-220);
      for(let k=0;k<n;k++){
        const off=(k-(n-1)/2);
        this.time.delayedCall(k*130, ()=>{ if(!this._finished) this.spawnHorizontalEnemy('runner', cy+Math.abs(off)*34); });
      }
      // par de mergulhadores
      if(w>=1) for(let k=0;k<2;k++) this.time.delayedCall(600+k*260, ()=>{ if(!this._finished){ const e=this.spawnHorizontalEnemy('wasp', 80+k*(BH-160)); } });
    }

    // ===== VERTICAL: já existe (boss + bullet hell) =====
    createVertical(){
      // Céu com degradê e nuvens (igual referência)
      const bg=this.add.graphics().setDepth(0);
      bg.fillGradientStyle(0x87CEEB, 0x87CEEB, 0xE0F6FF, 0xE0F6FF,1); bg.fillRect(0,0,BW,BH);
      this.clouds1 = this.add.tileSprite(BW/2, 60, BW,120,'soft').setTint(0xffffff).setAlpha(0.85).setDepth(1).setScale(1.8);
      this.clouds2 = this.add.tileSprite(BW/2,140,BW,80,'soft').setTint(0xffffff).setAlpha(0.55).setDepth(1).setScale(2.4);
      this.clouds3 = this.add.tileSprite(BW/2,BH/2,BW,BH,'soft').setTint(0xffffff).setAlpha(0.12).setDepth(1).setScale(3);
      const mtn=this.add.graphics().setDepth(2).setAlpha(0.35);
      mtn.fillStyle(0x1e3a5f,1); mtn.beginPath(); mtn.moveTo(0,BH-120); for(let x=0;x<BW;x+=40) mtn.lineTo(x, BH-140 - Math.sin(x*0.02)*30 - Math.random()*20); mtn.lineTo(BW,BH); mtn.lineTo(0,BH); mtn.fillPath();
      const texV='tur_'+this.shipDef.id+'_'+Math.min(30,this.shipLevel);
      this.player=this.add.image(BW/2, BH-50, texV);
      if(!this.textures.exists(texV)) this.player.setTexture('dot');
      this.player.setScale(1.12 + Math.min(0.22, this.shipLevel*0.01)).setDepth(10).setTint(Phaser.Display.Color.HexStringToColor(this.shipDef.color).color);
      this.playerShadow=this.add.ellipse(this.player.x,this.player.y+16,28,10,0x000000,0.25).setDepth(9);
      this.playerBody={x:BW/2, y:BH-50, w:32,h:32};
      if(this.stage && this.stage.boss) this.spawnBossVertical();
      else { this.boss=null; this.bossHp=0; }
    }
    spawnBossVertical(){
      if(this.boss) return;
      const hpBase = this.stage && this.stage.boss ? 24 : 18;
      const boss=this.add.image(BW/2,90,'en_boss1');
      if(!this.textures.exists('en_boss1')) boss.setTexture('soft');
      boss.setScale(1.9).setDepth(8).setTint(0x1e3a8a);
      // detalhe boss: núcleo pulsante + canhões
      const core=this.add.circle(BW/2,90,14,0x38bdf8,0.9).setDepth(9);
      this.tweens.add({targets:core, scale:1.18, duration:420, yoyo:true, repeat:-1});
      this.bossCore=core;
      this.boss=boss; this.bossHp= hpBase + (this.stageIdx||0)*6 + (this.campaignIdx||0)*2;
      this.boss.setData('hp',this.bossHp);
      this.bossCannons=[];
      for(let i=0;i<6;i++){ const cx=BW/2-60+i*24; const c=this.add.rectangle(cx,110,8,22,0x334155).setDepth(9); this.bossCannons.push(c); }
      this.bossBarBg=this.add.rectangle(BW/2,32,220,10,0x000000,0.6).setDepth(20);
      this.bossBar=this.add.rectangle(BW/2-110,32,220,10,0xef4444).setOrigin(0,0.5).setDepth(21);
      this.bossBar.setData('max',220);
    }
    updateVertical(dt){
      // parallax nuvens
      if(this.clouds1) this.clouds1.tilePositionY -= dt*22;
      if(this.clouds2) this.clouds2.tilePositionY -= dt*38;
      if(this.clouds3) this.clouds3.tilePositionY -= dt*14;
      if(this.boss){
        this.boss.x = BW/2 + Math.sin(this.time.now*0.0010)*58;
        if(this.bossCore) this.bossCore.setPosition(this.boss.x,90);
        this.bossCannons.forEach((c,i)=> c.setPosition(this.boss.x -60 + i*24, 110 + Math.sin(this.time.now*0.002 + i)*5));
        this.bossBarBg.setPosition(this.boss.x,32); this.bossBar.setPosition(this.boss.x-110,32);
        this.bulletTimer+=dt;
        // padrão alternado: chuva + circular + mirado
        const interval = this.stage && this.stage.boss ? 0.28 : 0.32;
        if(this.bulletTimer>interval){
          this.bulletTimer=0;
          this.bossPattern = (this.bossPattern||0)+1;
          if(this.bossPattern%3===0){
            // chuva densa
            for(let i=0;i<5+(this.campaignIdx||0);i++){
              const sx=this.boss.x -42 + Math.random()*84;
              const eB=this.add.image(sx,130,'dot').setTint(0xfb923c).setScale(0.68).setDepth(8);
              this.eBullets.push({img:eB, x:sx, y:130, vy:210+Math.random()*70, vx:(Math.random()-0.5)*70});
            }
          } else if(this.bossPattern%3===1){
            // circular 12 vias
            for(let a=0;a<12;a++){ const ang=a*Math.PI/6 + this.bossPattern*0.18; const eB=this.add.image(this.boss.x,130,'dot').setTint(0xef4444).setScale(0.52).setDepth(8); this.eBullets.push({img:eB, x:this.boss.x, y:130, vy:Math.cos(ang)*165, vx:Math.sin(ang)*165}); }
          } else {
            // mirado no player
            const ang=Math.atan2(this.playerBody.y-130, this.playerBody.x-this.boss.x);
            for(let k=-1;k<=1;k++){
              const eB=this.add.image(this.boss.x,130,'dot').setTint(0xf43f5e).setScale(0.62).setDepth(8);
              this.eBullets.push({img:eB, x:this.boss.x, y:130, vy:Math.sin(ang+k*0.22)*240, vx:Math.cos(ang+k*0.22)*240});
            }
          }
        }
      }
      let dx=0,dy=0;
      if(this.cursors.left.isDown || this.wasd.A.isDown) dx=-1;
      if(this.cursors.right.isDown || this.wasd.D.isDown) dx=1;
      if(this.cursors.up.isDown || this.wasd.W.isDown) dy=-1;
      if(this.cursors.down.isDown || this.wasd.S.isDown) dy=1;
      if(this.input.activePointer.isDown){ const mx=this.input.activePointer.worldX; dx=Math.sign(mx-this.playerBody.x)*0.95; }
      this.playerBody.x=Phaser.Math.Clamp(this.playerBody.x+dx*340*dt,24,BW-24);
      this.playerBody.y=Phaser.Math.Clamp(this.playerBody.y+dy*300*dt,80,BH-32);
      this.player.setPosition(this.playerBody.x,this.playerBody.y);
      this.playerShadow.setPosition(this.playerBody.x,this.playerBody.y+18);
      // nave aponta onde corre: inclina quando vai para esquerda/direita
      this.player.setRotation(dx*0.55);
      // TIRO AUTOMÁTICO vertical (sempre atira para cima)
      this.autoFireTimer=(this.autoFireTimer||0)+dt;
      if(this.autoFireTimer>=this.autoFireDelay){ this.autoFireTimer=0; this.shoot(); }
      this.spawnTimer+=dt;
      const rate=Math.max(0.5, 0.95 - (this.stage.speed||1)*0.10);
      if(this.spawnTimer>rate){ this.spawnTimer=0; this.spawnEnemyVertical(); if(Math.random()<0.4) this.spawnEnemyVertical(); }
      for(let i=this.bullets.length-1;i>=0;i--){
        const b=this.bullets[i];
        if(b.homing && (this.boss || this.enemies.length)){
          let ne=null, nd=1e9;
          const pool = this.boss? [{x:this.boss.x,y:110}] : this.enemies.filter(x=>!x.isBoss);
          for(const e of pool){ const d=Math.hypot(e.x-b.x,e.y-b.y); if(d<200 && d<nd){ nd=d; ne=e; } }
          if(ne){ const ang=Math.atan2(ne.y-b.y, ne.x-b.x); const ca=Math.atan2(b.vy,b.vx); let diff=ang-ca; while(diff>Math.PI) diff-=2*Math.PI; while(diff<-Math.PI) diff+=2*Math.PI; const turn=5.0*dt; const na=ca+Math.max(-turn,Math.min(turn,diff)); const sp=Math.hypot(b.vx,b.vy)||620; b.vx=Math.cos(na)*sp; b.vy=Math.sin(na)*sp; }
        }
        b.y+=b.vy*dt; b.x+= (b.vx||0)*dt; b.img.setPosition(b.x,b.y);
        if(b.y<-12){ b.img.destroy(); this.bullets.splice(i,1); continue; }
        if(this.boss && Math.hypot(b.x-this.boss.x,b.y-110)<48){
          const rm=this._handleShipHit(b,{x:this.boss.x,y:110, def:{r:48, col:'#1e3a8a'}}, this.enemies);
          if(rm){ b.img.destroy(); this.bullets.splice(i,1); }
          this.bossHp--; if(this.bossBar) this.bossBar.width=220*Math.max(0,this.bossHp/(24+(this.campaignIdx||0)*2+ (this.stageIdx||0)*6));
          if(this.bossCore) this.bossCore.setFillStyle(0xffaaaa,0.9);
          this.boss.setTint(0xffaaaa); this.time.delayedCall(80,()=> { if(this.boss) this.boss.setTint(0x1e3a8a); if(this.bossCore) this.bossCore.setFillStyle(0x38bdf8,0.9); });
          this.cameras.main.shake(40,0.003);
          if(this.bossHp<=0){
            this.bossKilled=true;
            this.fxExplode(this.boss.x,110,0xfbbf24,26);
            SND.explosion(2.2); this.cameras.main.shake(280,0.010);
            const pts=this.addScore(15); this.popup(this.boss.x,90,'+'+pts+' BOSS!','#fbbf24');
            if(this.bossCore) this.bossCore.destroy(); this.boss.destroy(); this.boss=null; if(this.bossBar) this.bossBar.destroy(); if(this.bossBarBg) this.bossBarBg.destroy(); (this.bossCannons||[]).forEach(c=>c.destroy());
            this.announce('CHEFE DESTRUÍDO!', '#34d399');
          }
          continue;
        }
        // inimigos normais
        let hit=false;
        for(let j=this.enemies.length-1;j>=0;j--){
          const e=this.enemies[j];
          if(Math.hypot(e.x-b.x,e.y-b.y)< e.def.r+7){
            const rm=this._handleShipHit(b,e,this.enemies);
            if(rm){ b.img.destroy(); this.bullets.splice(j,1); }
            this.damageEnemyNave(e,j);
            hit=true; break;
          }
        }
        if(hit) continue;
      }
      for(let i=this.enemies.length-1;i>=0;i--){
        const e=this.enemies[i];
        if(e.slowed && e.slowed>0){ e.slowed-=dt; if(e.slowed<=0){ e.slowed=0; e.img.setTint(Phaser.Display.Color.HexStringToColor(e.def.col).color); } else e.img.setTint(0x38bdf8); }
        if(e.dot && e.dotDur>0){ e.dotDur-=dt; e.dotTick=(e.dotTick||0)+dt; if(e.dotTick>0.5){ e.dotTick=0; this.damageEnemyNave(e,i); continue; } }
        const sm = e.slowed? 0.42 : 1;
        e.t=(e.t||0)+dt;
        // swoop: entra em curva depois cai
        let vx=e.vx||0;
        if(e.swoop){ e.y+=(60+e.vy*sm)*dt; e.x=e.baseX+Math.sin(e.t*3)*70; }
        else e.y+=e.vy*sm*dt;
        e.x+=vx*sm*dt*0;
        e.img.setPosition(e.x,e.y); if(e.shadow) e.shadow.setPosition(e.x,e.y+12); e.img.rotation+=dt*1.4*sm;
        if(e.y>BH+40){ e.img.destroy(); if(e.shadow) e.shadow.destroy(); this.enemies.splice(i,1); continue; }
        if(e.y>BH-60 && Math.hypot(e.x-this.playerBody.x, e.y-this.playerBody.y)<28){ this.fxExplode(e.x,e.y,0xf43f5e,6); e.img.destroy(); if(e.shadow) e.shadow.destroy(); this.enemies.splice(i,1); this.hurtPlayer(); }
      }
      for(let i=this.eBullets.length-1;i>=0;i--){
        const b=this.eBullets[i];
        b.y+=b.vy*dt; b.x+=b.vx*dt; b.img.setPosition(b.x,b.y);
        if(b.y>BH+20||b.x<-20||b.x>BW+20){ b.img.destroy(); this.eBullets.splice(i,1); continue; }
        if(Math.hypot(b.x-this.playerBody.x,b.y-this.playerBody.y)<18){ b.img.destroy(); this.eBullets.splice(i,1); this.hurtPlayer(); }
      }
    }
    spawnEnemyVertical(){
      const pool=this.stage.enemyPool||['drone','runner','swarm','wasp'];
      const t=pool[Math.floor(Math.random()*pool.length)];
      const def=D.ENEMIES_DATA[t];
      const x=40+Math.random()*(BW-80), y=-20;
      const img=this.add.image(x,y,'en_'+t).setScale(0.9).setDepth(8);
      img.setTint(Phaser.Display.Color.HexStringToColor(def.col).color);
      const sh=this.add.ellipse(x,y+12,16,6,0x000000,0.2).setDepth(7);
      const pts=t==='shielded'?30:(t==='bomber'?20:10);
      this.enemies.push({img, shadow:sh, x,y, baseX:x, vy:(85+Math.random()*85)*(this.stage.speed||1) + Math.min(120,this.score*0.5), hp:1, def, pts});
    }
    spawnVerticalSquadron(){
      const n=5;
      const bx=100+Math.random()*(BW-220);
      for(let k=0;k<n;k++){
        this.time.delayedCall(k*160, ()=>{
          if(this._finished) return;
          const def=D.ENEMIES_DATA['drone'];
          const x=bx+k*26, y=-24;
          const img=this.add.image(x,y,'en_drone').setScale(0.9).setDepth(8);
          if(!this.textures.exists('en_drone')) img.setTexture('dot');
          img.setTint(Phaser.Display.Color.HexStringToColor(def.col).color);
          const sh=this.add.ellipse(x,y+12,16,6,0x000000,0.2).setDepth(7);
          this.enemies.push({img, shadow:sh, x, y, baseX:x, vy:150*(this.stage.speed||1), hp:1, def, pts:20, swoop:true});
        });
      }
    }
    wave_vertical(w){
      this.spawnVerticalSquadron();
      if(w>=2){ // segunda esquadrilha espelhada
        this.time.delayedCall(900, ()=>{ if(!this._finished) this.spawnVerticalSquadron(); });
      }
    }

    // ===== ARENA: twin-stick sem física, com obstáculos =====
    createArena(){
      const bg=this.add.graphics().setDepth(0);
      bg.fillStyle(Phaser.Display.Color.HexStringToColor(this.stage.bg||'#0f172a').color,1); bg.fillRect(0,0,BW,BH);
      bg.lineStyle(2, Phaser.Display.Color.HexStringToColor(this.stage.accent||'#34d399').color, 0.35); bg.strokeRect(4,4,BW-8,BH-8);
      // 4 pilares como obstáculos
      this.pillars=[];
      const pillPos=[[BW*0.22,BH*0.32],[BW*0.78,BH*0.32],[BW*0.22,BH*0.72],[BW*0.78,BH*0.72]];
      pillPos.forEach(([px,py])=>{
        const r=this.add.rectangle(px,py,36,36,0x0f172a).setDepth(2).setStrokeStyle(1,0x34d399,0.45);
        this.add.rectangle(px,py,24,24,0x1e293b).setDepth(2);
        this.pillars.push({x:px,y:py,w:36,h:36});
      });
      // bordas visuais
      this.add.rectangle(BW/2,6,BW-8,12,0x0f172a).setDepth(1).setStrokeStyle(1,0x34d399,0.6);
      this.add.rectangle(BW/2,BH-6,BW-8,12,0x0f172a).setDepth(1).setStrokeStyle(1,0x34d399,0.6);
      const texA='tur_'+this.shipDef.id+'_'+Math.min(30,this.shipLevel);
      this.player=this.add.image(BW/2,BH/2,texA);
      if(!this.textures.exists(texA)) this.player.setTexture('dot');
      this.player.setScale(1.15 + Math.min(0.25, this.shipLevel*0.012)).setDepth(10).setTint(Phaser.Display.Color.HexStringToColor(this.shipDef.color).color);
      this.playerBody={x:BW/2, y:BH/2, w:28,h:28};
      this.playerShadow=this.add.ellipse(this.player.x,this.player.y+16,22,8,0x000000,0.2).setDepth(9);
      // mira mouse
      this.aimLine=this.add.graphics().setDepth(11);
      this.input.on('pointermove', p=>{ this.mouseX=p.worldX; this.mouseY=p.worldY; });
      this.mouseX=BW/2; this.mouseY=BH/2;
    }
    updateArena(dt){
      const W=BW, H=BH;
      let dx=0,dy=0;
      if(this.cursors.left.isDown || this.wasd.A.isDown) dx=-1;
      if(this.cursors.right.isDown || this.wasd.D.isDown) dx=1;
      if(this.cursors.up.isDown || this.wasd.W.isDown) dy=-1;
      if(this.cursors.down.isDown || this.wasd.S.isDown) dy=1;
      if(dx!==0 && dy!==0){ dx*=0.7071; dy*=0.7071; }
      // WASD move arena fechada
      let nx = Phaser.Math.Clamp(this.playerBody.x + dx*265*dt, 22, W-22);
      let ny = Phaser.Math.Clamp(this.playerBody.y + dy*265*dt, 22, H-22);
      // colisão com pilares
      for(const pill of (this.pillars||[])){
        if(Math.abs(nx-pill.x) < (pill.w/2+14) && Math.abs(ny-pill.y) < (pill.h/2+14)){
          // empurra para fora
          const ang=Math.atan2(ny-pill.y, nx-pill.x);
          nx = pill.x + Math.cos(ang)*(pill.w/2+15);
          ny = pill.y + Math.sin(ang)*(pill.h/2+15);
        }
      }
      this.playerBody.x=nx; this.playerBody.y=ny;
      // mouse mira 360°
      const ang=Math.atan2(this.mouseY - this.playerBody.y, this.mouseX - this.playerBody.x);
      this.player.setRotation(ang + Math.PI/2);
      this.player.setPosition(this.playerBody.x, this.playerBody.y);
      this.playerShadow.setPosition(this.playerBody.x, this.playerBody.y+14);
      // linha de mira
      this.aimLine.clear(); this.aimLine.lineStyle(1.5, 0x34d399, 0.55);
      this.aimLine.lineBetween(this.playerBody.x, this.playerBody.y, this.mouseX, this.mouseY);
      this.aimLine.fillStyle(0x34d399,0.9); this.aimLine.fillCircle(this.mouseX, this.mouseY, 4);
      // TIRO AUTOMÁTICO arena (360° para mira)
      this.autoFireTimer=(this.autoFireTimer||0)+dt;
      if(this.autoFireTimer>=this.autoFireDelay){ this.autoFireTimer=0; this.shoot(); }
      // spawn arena - vetorial sem física
      this.spawnTimer+=dt;
      const rate = Math.max(0.28, 0.52 - (this.stage.speed||1)*0.06);
      if(this.spawnTimer>rate){
        this.spawnTimer=0;
        const pool=this.stage.enemyPool||['swarm','splitter','phase'];
        const t=pool[Math.floor(Math.random()*pool.length)];
        const def=D.ENEMIES_DATA[t]||D.ENEMIES_DATA['swarm'];
        const edge=Math.floor(Math.random()*4);
        let x=edge===0? -22 : edge===1? W+22 : Math.random()*W;
        let y=edge===2? -22 : edge===3? H+22 : Math.random()*H;
        if(edge<2) y=Math.random()*H;
        const img=this.add.image(x,y,'en_'+t).setScale(0.92).setDepth(8);
        if(!this.textures.exists('en_'+t)) img.setTexture('dot');
        img.setTint(Phaser.Display.Color.HexStringToColor(def.col).color);
        const sh=this.add.ellipse(x,y+10,16,6,0x000000,0.18).setDepth(7);
        const spd = t==='swarm'? 92 : t==='phase'? 105 : t==='splitter'? 68 : 75;
        this.enemies.push({img, shadow:sh, x,y, hp:1, def, spd: spd*(this.stage.speed||1), t:0});
      }
      // move enemies vetorial
      for(let i=this.enemies.length-1;i>=0;i--){
        const e=this.enemies[i];
        if(e.isBoss){ e.img.setPosition(e.x,e.y); if(e.shadow) e.shadow.setPosition(e.x,e.y+46); }
        else {
          if(e.slowed && e.slowed>0){ e.slowed-=dt; if(e.slowed<=0){ e.slowed=0; if(e.img) e.img.setTint(Phaser.Display.Color.HexStringToColor(e.def.col).color); } else e.img.setTint(0x38bdf8); }
          if(e.dot && e.dotDur>0){ e.dotDur-=dt; e.dotTick=(e.dotTick||0)+dt; if(e.dotTick>0.5){ e.dotTick=0; this.damageEnemyNave(e,i); continue; } }
          e.t=(e.t||0)+dt;
          const angE=Math.atan2(this.playerBody.y - e.y, this.playerBody.x - e.x);
          let spd=e.spd * (e.slowed? 0.38 : 1);
          if(e.dasher){
            // dasher: persegue, pausa, telegrafa, avança
            e.dt2=(e.dt2||0)+dt;
            const cyc=e.dt2%2.6;
            if(cyc<1.4){ e.x+=Math.cos(angE)*spd*dt; e.y+=Math.sin(angE)*spd*dt; e.img.setAlpha(1); }
            else if(cyc<2.0){ e.img.setAlpha(0.5+Math.sin(e.dt2*20)*0.3); } // telegraph
            else { e.x+=e.dx*spd*3.2*dt; e.y+=e.dy*spd*3.2*dt; e.img.setAlpha(1); if(!e.locked){ e.locked=true; e.dx=Math.cos(angE); e.dy=Math.sin(angE);} }
            if(cyc<0.05) e.locked=false;
          } else if(e.orbiter){
            e.ot=(e.ot||Math.random()*6)+dt*2.1;
            e.x+=Math.cos(angE)*spd*0.7*dt + Math.cos(e.ot)*60*dt;
            e.y+=Math.sin(angE)*spd*0.7*dt + Math.sin(e.ot)*60*dt;
          } else {
            e.x+=Math.cos(angE)*spd*dt; e.y+=Math.sin(angE)*spd*dt;
          }
          // desvia de pilares
          for(const pill of (this.pillars||[])){
            if(Math.abs(e.x-pill.x) < (pill.w/2+10) && Math.abs(e.y-pill.y) < (pill.h/2+10)){
              const a=Math.atan2(e.y-pill.y, e.x-pill.x);
              e.x = pill.x + Math.cos(a)*(pill.w/2+12);
              e.y = pill.y + Math.sin(a)*(pill.h/2+12);
            }
          }
        }
        e.img.setPosition(e.x,e.y); if(e.shadow) e.shadow.setPosition(e.x,e.y+10);
        if(Math.hypot(e.x-this.playerBody.x, e.y-this.playerBody.y)< 23){
          this.fxExplode(e.x,e.y,0xf43f5e,6);
          e.img.destroy(); if(e.shadow) e.shadow.destroy(); this.enemies.splice(i,1);
          this.hurtPlayer(); continue;
        }
        for(let j=this.bullets.length-1;j>=0;j--){
          const b=this.bullets[j];
          if(Math.hypot(e.x-b.x, e.y-b.y)< e.def.r+9){
            const rm=this._handleShipHit(b,e,this.enemies);
            if(rm){ b.img.destroy(); this.bullets.splice(j,1); }
            if(!e.isBoss) this.damageEnemyNave(e,j);
            break;
          }
        }
      }
      // balas arena (homing)
      for(let i=this.bullets.length-1;i>=0;i--){
        const b=this.bullets[i];
        if(b.homing && this.enemies.length){
          let ne=null, nd=1e9; for(const e of this.enemies){ if(e.isBoss) continue; const d=Math.hypot(e.x-b.x,e.y-b.y); if(d<170 && d<nd){ nd=d; ne=e; } }
          if(ne){ const ang=Math.atan2(ne.y-b.y, ne.x-b.x); const ca=Math.atan2(b.vy,b.vx); let diff=ang-ca; while(diff>Math.PI) diff-=2*Math.PI; while(diff<-Math.PI) diff+=2*Math.PI; const turn=4.0*dt; const na=ca+Math.max(-turn,Math.min(turn,diff)); const sp=Math.hypot(b.vx,b.vy); b.vx=Math.cos(na)*sp; b.vy=Math.sin(na)*sp; }
        }
        b.x+=b.vx*dt; b.y+=b.vy*dt; b.img.setPosition(b.x,b.y);
        if(b.x<-22||b.x>W+22||b.y<-22||b.y>H+22){ b.img.destroy(); this.bullets.splice(i,1); }
      }
    }
    wave_arena(w){
      // anel de inimigos convergindo das bordas
      const n=6+w*2;
      for(let k=0;k<n;k++){
        const ang=k/n*Math.PI*2;
        const x=BW/2+Math.cos(ang)*(BW*0.56), y=BH/2+Math.sin(ang)*(BH*0.62);
        const pool=this.stage.enemyPool||['swarm','drone'];
        const t=pool[Math.floor(Math.random()*pool.length)];
        const def=D.ENEMIES_DATA[t]||D.ENEMIES_DATA['swarm'];
        const img=this.add.image(x,y,'en_'+t).setScale(0.92).setDepth(8);
        if(!this.textures.exists('en_'+t)) img.setTexture('dot');
        img.setTint(Phaser.Display.Color.HexStringToColor(def.col).color);
        const sh=this.add.ellipse(x,y+10,16,6,0x000000,0.18).setDepth(7);
        this.enemies.push({img, shadow:sh, x,y, hp:1, def, spd:80*(this.stage.speed||1), t:0, pts:15});
      }
      if(w>=2){ // dasher especial
        const def=D.ENEMIES_DATA['wasp']||D.ENEMIES_DATA['swarm'];
        const img=this.add.image(BW+24,BH/2,'en_wasp').setScale(1.05).setDepth(8).setTint(0xf43f5e);
        this.enemies.push({img,x:BW+24,y:BH/2,hp:2,def:{r:16,col:'#f43f5e'},spd:95*(this.stage.speed||1),dasher:true,pts:40});
      }
      if(w>=3){
        const def=D.ENEMIES_DATA['phase']||D.ENEMIES_DATA['swarm'];
        const img=this.add.image(BW/2,-24,'en_phase').setScale(1.0).setDepth(8).setTint(0x22d3ee);
        this.enemies.push({img,x:BW/2,y:-24,hp:2,def:{r:15,col:'#22d3ee'},spd:88*(this.stage.speed||1),orbiter:true,pts:35});
      }
    }

    // ===== TUNEL: pseudo-3D com perspectiva real e speed lines =====
    createTunnel(){
      const bgCol=this.stage.bg||'#050914';
      this.cameras.main.setBackgroundColor(bgCol);
      this.tunnelGfx=this.add.graphics().setDepth(0);
      this.lanes = [-1,0,1];
      this.laneX = [BW*0.28, BW*0.5, BW*0.72];
      this.currentLane=1;
      this.tunnelDepth=0;
      this.rings=[];
      for(let i=0;i<10;i++) this.rings.push({z: i*0.10});
      // estrelas de velocidade radial
      this.speedStars=[];
      for(let i=0;i<28;i++) this.speedStars.push({x:Math.random()*BW, y:Math.random()*BH, s:0.6+Math.random()*1.2});
      const texT='tur_'+this.shipDef.id+'_'+Math.min(30,this.shipLevel);
      this.player=this.add.image(this.laneX[this.currentLane], BH-74, texT);
      if(!this.textures.exists(texT)) this.player.setTexture('dot');
      this.player.setScale(1.15 + Math.min(0.22, this.shipLevel*0.01)).setDepth(11).setTint(Phaser.Display.Color.HexStringToColor(this.shipDef.color).color);
      this.playerBody={x:this.laneX[this.currentLane], y:BH-74, lane:this.currentLane};
      this.playerShadow=this.add.ellipse(this.player.x,this.player.y+16,24,8,0x000000,0.24).setDepth(10);
      this.tunnelSpawnTimer=0;
      this.input.keyboard.on('keydown-LEFT', ()=> this.shiftLane(-1));
      this.input.keyboard.on('keydown-RIGHT', ()=> this.shiftLane(1));
      this.input.keyboard.on('keydown-A', ()=> this.shiftLane(-1));
      this.input.keyboard.on('keydown-D', ()=> this.shiftLane(1));
      this.input.on('pointerdown', p=>{ if(p.worldX < BW*0.33) this.shiftLane(-1); else if(p.worldX>BW*0.66) this.shiftLane(1); else this.shoot(); });
    }
    shiftLane(dir){
      const nl=Phaser.Math.Clamp(this.currentLane+dir,0,2);
      if(nl===this.currentLane) return;
      this.currentLane=nl; this.playerBody.lane=nl;
      this.tweens.add({targets:this.player, x:this.laneX[nl], duration:120, ease:'Cubic.easeOut'});
      // inclina na direção do movimento (se corre pra esquerda aponta esquerda)
      this.tweens.add({targets:this.player, rotation: dir*0.55, duration:90, yoyo:true, onComplete:()=> this.player.setRotation(0)});
      SND.ui();
    }
    updateTunnel(dt){
      this.tunnelDepth += dt * 1.7 * (this.stage.speed||1);
      const g=this.tunnelGfx; g.clear();
      const cx=BW/2, cy=BH*0.38;
      // speed stars radial
      g.fillStyle(0xffffff,0.55);
      for(const s of (this.speedStars||[])){
        s.y += dt*420*(this.stage.speed||1)*s.s;
        if(s.y>BH) { s.y=-10; s.x=Math.random()*BW; }
        g.fillCircle(s.x, s.y, 1.2*s.s);
        // rastro
        g.fillStyle(0xffffff,0.18); g.fillRect(s.x-0.5, s.y-8, 1, 8); g.fillStyle(0xffffff,0.55);
      }
      for(let i=0;i<this.rings.length;i++){
        const ring=this.rings[i];
        let z = (ring.z + this.tunnelDepth) % 1;
        if(z<0) z+=1;
        const scale = 0.10 + z*0.90;
        const rx = 38 + scale* 360;
        const ry = 24 + scale* 240;
        const alpha = 0.14 + (1-z)*0.48;
        g.lineStyle(2, Phaser.Display.Color.HexStringToColor(this.stage.accent||'#a78bfa').color, alpha);
        g.strokeEllipse(cx, cy, rx*2, ry*2);
        // lanes em perspectiva real (convergem para o centro)
        g.lineStyle(1, 0xa78bfa, 0.10 + (1-z)*0.08);
        for(let l=0;l<3;l++){
          const laneOff = (this.laneX[l]-BW/2) * scale;
          const lx = cx + laneOff;
          const lxPrev = cx + (this.laneX[l]-BW/2) * Math.max(0.08, scale-0.10);
          g.lineBetween(lx, cy - ry*0.92, lxPrev, cy - (ry-18)*0.92);
          // luzes laterais do túnel
          if(i%2===0){
            g.fillStyle(0xa78bfa, alpha*0.7); g.fillCircle(lx, cy - ry*0.92, 1.8);
          }
        }
      }
      // spawn timer dedicado (mais confiável que z>0.92 random)
      this.tunnelSpawnTimer=(this.tunnelSpawnTimer||0)+dt;
      const sRate = Math.max(0.62, 1.0 - (this.stage.speed||1)*0.10);
      if(this.tunnelSpawnTimer> sRate){
        this.tunnelSpawnTimer=0;
        this.spawnTunnelEnemy();
      }
      // player lanes interp
      this.playerBody.x = this.laneX[this.currentLane];
      // não precisa setPosition pois tween já faz, mas garante
      this.playerShadow.setPosition(this.player.x, this.player.y+16);
      // TIRO AUTOMÁTICO túnel (sempre para frente)
      this.autoFireTimer=(this.autoFireTimer||0)+dt;
      if(this.autoFireTimer>=this.autoFireDelay){ this.autoFireTimer=0; this.shoot(); }
      // inimigos descem nas lanes
      for(let i=this.enemies.length-1;i>=0;i--){
        const e=this.enemies[i];
        if(e.slowed && e.slowed>0){ e.slowed-=dt; if(e.slowed<=0) e.slowed=0; }
        if(e.dot && e.dotDur>0){ e.dotDur-=dt; e.dotTick=(e.dotTick||0)+dt; if(e.dotTick>0.5){ e.dotTick=0; this.damageEnemyNave(e,i); continue; } }
        const sm = e.slowed? 0.42 : 1;
        // flipper: pula de lane periodicamente (Tempest!)
        if(e.flipper){
          e.flipT=(e.flipT==null? 0.9+Math.random()*0.8 : e.flipT)-dt;
          if(e.flipT<=0 && e.y<BH*0.72){
            e.flipT=0.9+Math.random()*0.9;
            e.lane=Phaser.Math.Wrap(e.lane+(Math.random()<0.5?-1:1),0,3);
            this.tweens.add({targets:e.img, x:this.laneX[e.lane], duration:160, ease:'Sine.easeInOut'});
            SND.ui();
          }
          e.x=e.img.x;
        }
        e.y += e.vy * sm * dt;
        e.img.setPosition(e.x, e.y);
        if(e.shadow) e.shadow.setPosition(e.x, e.y+12);
        e.img.setScale(0.78 + (e.y/BH)*0.42);
        if(e.y>BH+30){ e.img.destroy(); if(e.shadow) e.shadow.destroy(); this.enemies.splice(i,1); continue; }
        if(e.lane===this.currentLane && Math.abs(e.y - this.playerBody.y) < 30){
          this.fxExplode(e.x,e.y,0xf43f5e,7);
          e.img.destroy(); if(e.shadow) e.shadow.destroy(); this.enemies.splice(i,1);
          this.hurtPlayer(); continue;
        }
        for(let j=this.bullets.length-1;j>=0;j--){
          const b=this.bullets[j];
          if(Math.abs(b.x - e.x) < 22 && Math.hypot(e.x-b.x, e.y-b.y) < e.def.r+14){
            const rm=this._handleShipHit(b,e,this.enemies);
            if(rm){ b.img.destroy(); this.bullets.splice(j,1); }
            if(!e.isBoss) this.damageEnemyNave(e,i);
            break;
          }
        }
      }
      for(let i=this.bullets.length-1;i>=0;i--){
        const b=this.bullets[i];
        if(b.homing && this.enemies.length){
          let ne=null, nd=1e9; for(const e of this.enemies){ const d=Math.hypot(e.x-b.x,e.y-b.y); if(d<190 && d<nd){ nd=d; ne=e; } }
          if(ne){ const ang=Math.atan2(ne.y-b.y, ne.x-b.x); const ca=Math.atan2(b.vy,b.vx); let diff=ang-ca; while(diff>Math.PI) diff-=2*Math.PI; while(diff<-Math.PI) diff+=2*Math.PI; const turn=5.5*dt; const na=ca+Math.max(-turn,Math.min(turn,diff)); const sp=Math.hypot(b.vx,b.vy)||620; b.vx=Math.cos(na)*sp; b.vy=Math.sin(na)*sp; }
        }
        b.y+=b.vy*dt; b.x+= (b.vx||0)*dt; b.img.setPosition(b.x,b.y);
        if(b.y<-20){ b.img.destroy(); this.bullets.splice(i,1); }
      }
    }

    _shipCol(){ return Phaser.Display.Color.HexStringToColor(this.shipDef.color).color; }
    _shipDmg(){ return (this.shipDef.dmg||16) * (this.shipDmgMul||1) * 0.18; }
    _createShipBullet(bx,by,vx,vy){
      const def=this.shipDef; const col=this._shipCol(); const kind=def.kind||'bullet';
      const lvl=this.shipLevel||1;
      // skills que afetam tiro
      let pierce= (lvl>=16 && def.skills && def.skills.some(s=>s.lvl===16 && s.eff && s.eff.pierce)) ? 2 : 1;
      if(def.id==='rail') pierce= 99;
      if(def.id==='sniper') pierce= 3;
      if(def.id==='laser') pierce= 3;
      if(def.id==='gatling' && lvl>=16) pierce=2;
      // escala base por nave
      let scale=0.72, life=1.35, tint=col;
      let bullet={x:bx,y:by,vx,vy, life, dmg: this._shipDmg(), kind, pierce, shipId:def.id, hits:0};
      let img;
      if(kind==='beam'){ // laser
        img=this.add.rectangle(bx,by,5,14, col).setDepth(9);
        this.tweens.add({targets:img, alpha:0.85, duration:80, yoyo:true, repeat:1});
        scale=0.95; bullet.life=0.55; bullet.pierce=4;
        // raio visual
        const beam=this.add.rectangle(bx,by,3,22, col).setAlpha(0.55).setDepth(8);
        this.tweens.add({targets:beam, alpha:0, scaleY:0.2, duration:140, onComplete:()=>beam.destroy()});
      } else if(kind==='splash'){ // missile
        img=this.add.image(bx,by,'dot').setTint(col).setScale(0.92).setDepth(9);
        bullet.splash= def.splash||65; bullet.homing=true; bullet.life=1.6; scale=0.92;
        // rastro fumaça
        const sm=this.add.image(bx,by,'soft').setTint(0x475569).setScale(0.45).setAlpha(0.45).setDepth(8);
        this.tweens.add({targets:sm, alpha:0, scale:0.15, duration:260, onComplete:()=>sm.destroy()});
      } else if(kind==='slow'){ // cryo
        img=this.add.image(bx,by,'dot').setTint(0x38bdf8).setScale(0.78).setDepth(9);
        bullet.slow=0.55; bullet.slowDur=1.8; tint=0x38bdf8;
        const ring=this.add.circle(bx,by,4,0x38bdf8,0.35).setDepth(8);
        this.tweens.add({targets:ring, scale:2.2, alpha:0, duration:320, onComplete:()=>ring.destroy()});
      } else if(kind==='chain'){ // tesla
        img=this.add.image(bx,by,'dot').setTint(col).setScale(0.88).setDepth(9);
        bullet.chain= def.chain||4; if(lvl>=16) bullet.chain+=1;
        bullet.life=1.2;
        const zap=this.add.graphics().setDepth(8);
        zap.lineStyle(2, col, 0.85); zap.lineBetween(bx,by, bx+vx*0.04, by+vy*0.04);
        this.time.delayedCall(80, ()=> zap.destroy());
      } else if(kind==='snipe'){ // sniper
        img=this.add.rectangle(bx,by,3,10, col).setDepth(9);
        bullet.pierce=4; bullet.life=1.1; scale=0.9;
      } else if(kind==='dot'){ // venom
        img=this.add.image(bx,by,'dot').setTint(0xa3e635).setScale(0.82).setDepth(9);
        bullet.dot=3.5; bullet.dotDur=2.2; bullet.life=1.4;
      } else if(kind==='buff'){ // amp
        img=this.add.image(bx,by,'soft').setTint(0xfde047).setScale(0.75).setDepth(9);
        bullet.splash=32; bullet.buff=true; bullet.life=1.3; scale=0.85;
      } else if(kind==='pierce'){ // rail
        img=this.add.rectangle(bx,by,4,16, 0xffffff).setDepth(9);
        img.setStrokeStyle(1, col, 0.9);
        bullet.pierce=99; bullet.life=0.9; scale=1.0;
        const trail=this.add.rectangle(bx,by,2,20, col).setAlpha(0.35).setDepth(8);
        this.tweens.add({targets:trail, alpha:0, scaleX:0.2, duration:180, onComplete:()=>trail.destroy()});
      } else { // bullet padrão (cannon, gatling)
        img=this.add.image(bx,by,'dot').setTint(col).setScale(0.72 + Math.min(0.35, lvl*0.02)).setDepth(9);
        if(def.id==='gatling' && lvl>=28) bullet.multi=1;
      }
      if(!img) img=this.add.image(bx,by,'dot').setTint(col).setScale(scale).setDepth(9);
      if(img.setTint) try{ img.setTint(tint);}catch(_){}
      bullet.img=img;
      // MUZZLE FLASH
      const mf=this.add.image(bx,by,'soft').setTint(col).setScale(0.5).setAlpha(0.85).setDepth(10);
      this.tweens.add({targets:mf, scale:0.9, alpha:0, duration:90, onComplete:()=>mf.destroy()});
      const sndMap={beam:'pierce', splash:'splash', slow:'slow', chain:'chain', snipe:'snipe', dot:'dot', buff:'bullet', pierce:'pierce', bullet:'bullet'};
      try{ SND.shoot(sndMap[kind]||'bullet'); }catch(_){}
      return bullet;
    }
    _handleShipHit(bullet, enemy, enemies){
      // BOSS: decrementa HP, não mata
      if(enemy.isBoss){
        bullet.hits=(bullet.hits||0)+1;
        const maxPierce=bullet.pierce||1;
        const dead=this._handleBossHit(bullet, enemy);
        return dead || bullet.hits>=maxPierce;
      }
      // splash (missile)
      if(bullet.splash){
        const rad= bullet.splash;
        const ex=this.add.circle(enemy.x, enemy.y, 8, this._shipCol(), 0.85).setDepth(9);
        this.tweens.add({targets:ex, scale: rad/8, alpha:0, duration:260, onComplete:()=>ex.destroy()});
        SND.explosion(0.9);
        for(let j=enemies.length-1;j>=0;j--){
          const other=enemies[j];
          if(other===enemy || other.isBoss) continue;
          if(Math.hypot(other.x-enemy.x, other.y-enemy.y) < rad){
            this.fxExplode(other.x,other.y,Phaser.Display.Color.HexStringToColor((other.def&&other.def.col)||'#94a3b8').color,5);
            other.img.destroy(); if(other.shadow) other.shadow.destroy();
            // remove from array
            const idx=enemies.indexOf(other);
            if(idx>=0) enemies.splice(idx,1);
            this.kills++; this.score+=5;
          }
        }
      }
      // chain (tesla) - salta para até chain próximos
      if(bullet.chain && bullet.chain>1){
        let chainLeft=bullet.chain-1;
        let cur=enemy;
        const hitSet=new Set([cur]);
        while(chainLeft>0){
          let nearest=null, nd=1e9;
          for(const other of enemies){
            if(hitSet.has(other)) continue;
            const d=Math.hypot(other.x-cur.x, other.y-cur.y);
            if(d<85 && d<nd){ nd=d; nearest=other; }
          }
          if(!nearest) break;
          hitSet.add(nearest);
          const zap=this.add.graphics().setDepth(9);
          zap.lineStyle(2, this._shipCol(), 0.9); zap.lineBetween(cur.x,cur.y, nearest.x, nearest.y);
          this.time.delayedCall(90, ()=> zap.destroy());
          nearest.img.setTint(0xffffff); this.time.delayedCall(80, ()=> { if(nearest.img && nearest.img.active) nearest.img.setTint(Phaser.Display.Color.HexStringToColor(nearest.def.col).color); });
          // aplica dano: marca para remover
          this.time.delayedCall(40, ()=>{
            const idx=enemies.indexOf(nearest);
            if(idx>=0){ nearest.img.destroy(); if(nearest.shadow) nearest.shadow.destroy(); enemies.splice(idx,1); this.kills++; this.score+=5; SND.explosion(0.5); }
          });
          cur=nearest; chainLeft--;
        }
      }
      // slow (cryo)
      if(bullet.slow){
        enemy.slowed = bullet.slowDur||1.8;
        enemy.slowVal = bullet.slow||0.55;
        enemy.img.setTint(0x38bdf8);
        this.time.delayedCall((bullet.slowDur||1.8)*1000, ()=>{ if(enemy.img && enemy.img.active) enemy.img.setTint(Phaser.Display.Color.HexStringToColor(enemy.def.col).color); });
      }
      // dot (venom)
      if(bullet.dot){
        enemy.dot = bullet.dot; enemy.dotDur = bullet.dotDur||2.2; enemy.dotTick=0;
        enemy.img.setTint(0xa3e635);
      }
      // pierce: se ainda tem pierce, não destrói bala
      bullet.hits = (bullet.hits||0)+1;
      const maxPierce = bullet.pierce||1;
      return bullet.hits >= maxPierce;
    }
    shoot(){
      if(!this.phaseActive || this.timeLeft<=0 || this._finished) return;
      const def=this.shipDef;
      const getDir=()=>{
        if(this.styleId==='asteroids'){
          const ang=this.playerBody.angle; return {bx:this.playerBody.x, by:this.playerBody.y-14, vx:Math.cos(ang)*520, vy:Math.sin(ang)*520};
        } else if(this.styleId==='horizontal'){
          if(this.isCharging && this.charge>0.18) return null;
          return {bx:this.playerBody.x+18, by:this.playerBody.y, vx:560, vy:0};
        } else if(this.styleId==='arena'){
          const ang=Math.atan2(this.mouseY - this.playerBody.y, this.mouseX - this.playerBody.x);
          return {bx:this.playerBody.x, by:this.playerBody.y, vx:Math.cos(ang)*520, vy:Math.sin(ang)*520};
        } else if(this.styleId==='tunnel'){
          return {bx:this.laneX[this.currentLane], by:this.playerBody.y-18, vx:0, vy:-620};
        } else {
          return {bx:this.playerBody.x, by:this.playerBody.y-18, vx:0, vy:-620};
        }
      };
      const dir=getDir(); if(!dir) return;
      // cria projétil padrão da nave
      const b=this._createShipBullet(dir.bx, dir.by, dir.vx, dir.vy);
      this.bullets.push(b);
      // WEAPON TIER (power-ups): 2=paralelo, 3=spread 3, 4=paralelos+spread
      const spd=Math.hypot(dir.vx,dir.vy)||1;
      const px=-dir.vy/spd, py=dir.vx/spd; // perpendicular
      if(this.weaponTier>=2){
        const b2=this._createShipBullet(dir.bx+px*11, dir.by+py*11, dir.vx, dir.vy);
        this.bullets.push(b2);
      }
      if(this.weaponTier>=3){
        for(const a of [-0.17,0.17]){
          const vx2=dir.vx*Math.cos(a)-dir.vy*Math.sin(a), vy2=dir.vx*Math.sin(a)+dir.vy*Math.cos(a);
          const b3=this._createShipBullet(dir.bx, dir.by, vx2, vy2);
          b3.life=(b3.life||1)*0.85; this.bullets.push(b3);
        }
      }
      if(this.weaponTier>=4 && def.id!=='laser' && def.id!=='gatling'){
        const b4=this._createShipBullet(dir.bx-px*11, dir.by-py*11, dir.vx, dir.vy);
        this.bullets.push(b4);
      }
      this.tweens.add({targets:this.player, scale:1.18, duration:60, yoyo:true});
      // gatling rajada extra
      if(def.id==='gatling' && this.shipLevel>=12){
        const b2=this._createShipBullet(dir.bx, dir.by+6, dir.vx, dir.vy);
        b2.life=1.0; this.bullets.push(b2);
      }
      // laser prisma (se tiver skill)
      if(def.id==='laser' && this.shipLevel>=16){
        for(let a of [-0.18,0.18]){
          const vx2 = dir.vx*Math.cos(a) - dir.vy*Math.sin(a);
          const vy2 = dir.vx*Math.sin(a) + dir.vy*Math.cos(a);
          const pb=this._createShipBullet(dir.bx, dir.by, vx2*0.92, vy2*0.92);
          pb.life=0.45; this.bullets.push(pb);
        }
      }
    }

    update(_, delta){
      const dt=delta/1000;
      if(!this.phaseActive || this.timeLeft<=0 || this._finished) return;
      this.timeLeft-=dt;
      // ondas + sistemas compartilhados
      this.processWaves(dt);
      // switch(this.styleId) em update - exigido spec
      switch(this.styleId){
        case 'asteroids': this.updateAsteroids(dt); break;
        case 'horizontal': this.updateHorizontal(dt); break;
        case 'vertical': this.updateVertical(dt); break;
        case 'arena': this.updateArena(dt); break;
        case 'tunnel': this.updateTunnel(dt); break;
        default: this.updateVertical(dt); break;
      }
      if(this.boss && this['bossUpd_'+this.styleId]) this['bossUpd_'+this.styleId](this.boss, dt);
      this.updateCentral(dt);
      // HUD objetivo
      const target=this.stage.target||22;
      const mult=this.comboMult();
      if(this.objKind==='survive'){
        this.scoreTxt.setText(Math.ceil(Math.max(0,this.timeLeft))+'s restantes');
        this.scoreTxt.setColor('#34d399');
        this.timerBar.setFillStyle(0x34d399);
      } else if(this.objKind==='boss'){
        this.scoreTxt.setText(this.bossKilled? '✔ CHEFE DESTRUÍDO' : '⚠ CHEFE ATIVO');
        this.scoreTxt.setColor(this.bossKilled? '#34d399':'#f43f5e');
      } else {
        this.scoreTxt.setText(this.kills+'/'+target+(mult>1?'  ×'+mult:'')+'  '+this.score+'pts');
      }
      // timer bar
      const dur=this.stage.duration||22;
      const pct=Phaser.Math.Clamp(this.timeLeft/dur,0,1);
      this.timerBar.width=264*pct;
      this.timerBar.x=BW/2-132;
      this.timerBar.setFillStyle(pct<0.25?0xf43f5e:(this.objKind==='survive'?0x34d399:this._shipCol()));
      this.timeTxt.setText(Math.ceil(Math.max(0,this.timeLeft))+'s');
      // fim de fase por objetivo
      let timeUp = this.timeLeft<=0;
      if(this.objKind==='kill' && this.kills>=target) this.finish();
      else if(this.objKind==='boss' && this.bossKilled) this.finish();
      else if(timeUp) this.finish();
    }
    finish(){
      if(this._finished) return;
      this._finished=true;
      const target=this.stage.target||22;
      // resultado por objetivo
      let ok=false, stars=0;
      if(this.objKind==='survive'){
        ok=!this._dead;
        stars=ok? Math.min(3,this.lives) : (this.kills>=target*0.5?1:0);
      } else if(this.objKind==='boss'){
        ok=this.bossKilled && !this._dead;
        stars=ok? Math.min(3,this.lives) : 0;
      } else {
        ok=this.kills>=target && !this._dead;
        stars=ok? 3 : this.kills>= target*0.70? 2 : this.kills>= target*0.45? 1 : 0;
      }
      const bonus = (stars===3? 140 : stars===2? 90 : stars===1? 50 : 20) + Math.floor(this.score/40);
      D.Save.data.crystals += bonus;
      // campanha 5x5: salva estrelas e progresso
      const isCampaign = !!this.campaign;
      if(isCampaign){
        const cid=this.campaignId;
        if(!D.Save.data.naveStars) D.Save.data.naveStars={};
        if(!D.Save.data.naveProgress) D.Save.data.naveProgress={};
        if(!D.Save.data.naveStars[cid]) D.Save.data.naveStars[cid]=[0,0,0,0,0];
        if(stars > (D.Save.data.naveStars[cid][this.phaseIdx]||0)) D.Save.data.naveStars[cid][this.phaseIdx]=stars;
        const prog = D.Save.data.naveProgress[cid]||1;
        if(ok && this.phaseIdx+1 >= prog && this.phaseIdx < 4){
          D.Save.data.naveProgress[cid]= this.phaseIdx+2;
        }
        if(ok && this.phaseIdx===4){
          D.Save.data.naveProgress[cid]=5;
        }
      }
      D.Save.save(); SND.victory();
      this.add.rectangle(BW/2,BH/2,BW,BH,0x020617,0.80).setDepth(19);
      const objResult = this.objKind==='survive'? (ok?'SOBREVIVEU!':'NAO RESISTIU')
        : this.objKind==='boss'? (ok?'CHEFE DESTRUÍDO!':'CHEFE ESCAPOU')
        : (ok? 'VITÓRIA ESPACIAL!' : 'MISSÃO INCOMPLETA');
      this.add.text(BW/2, BH/2-36, objResult, {fontFamily:'Orbitron', fontSize:'20px', color:ok?'#34d399':'#fbbf24'}).setOrigin(0.5).setDepth(20);
      const starsTxt = '★'.repeat(stars)+'☆'.repeat(3-stars);
      this.add.text(BW/2, BH/2-10, `${starsTxt}  +${bonus} cristais • ${this.kills}/${target} abates • ${this.score} pts • ${this.shipDef.name} NV${this.shipLevel}`, {fontFamily:'Rajdhani', fontSize:'12px', color:'#e8eefc'}).setOrigin(0.5).setDepth(20);
      if(isCampaign){
        const isLastPhase = this.phaseIdx>=4;
        const hasNext = !isLastPhase && !this._dead && this.kills>= target*0.45;
        const y0=BH/2+22;
        if(hasNext){
          const nextPhase=this.phaseIdx+1;
          const btnNext=this.add.text(BW/2-90, y0, '▶ PRÓXIMA FASE', {fontFamily:'Orbitron', fontSize:'12px', color:'#020617', backgroundColor:this.stage.accent||'#38bdf8', padding:{left:14,right:14,top:8,bottom:8}}).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
          btnNext.on('pointerdown', ()=>{
            this.scene.start('Nave', {campaignIdx:this.campaignIdx, phaseIdx:nextPhase, shipId:this.shipId, diffKey:this.diffKey});
          });
          const btnUp=this.add.text(BW/2+90, y0, '⬆ MELHORAR NAVE', {fontFamily:'Orbitron', fontSize:'11px', color:'#fbbf24', backgroundColor:'#1e293b', padding:{left:10,right:10,top:8,bottom:8}}).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
          btnUp.on('pointerdown', ()=>{
            const lvl=(D.Save.data.shipLevels[this.shipId]||1);
            const cost=12+lvl*8;
            if(D.Save.data.crystals>=cost && lvl<50){
              D.Save.data.crystals-=cost; D.Save.data.shipLevels[this.shipId]=lvl+1; D.Save.save();
              this.scene.start('Nave', {campaignIdx:this.campaignIdx, phaseIdx:nextPhase, shipId:this.shipId, diffKey:this.diffKey});
            } else { SND.error(); this.add.text(BW/2, y0+28, lvl>=50?'NÍVEL MÁXIMO':'CRISTAIS INSUFICIENTES ('+cost+')', {fontFamily:'Rajdhani', fontSize:'10px', color:'#f43f5e'}).setOrigin(0.5).setDepth(20); }
          });
          const btnMenu=this.add.text(BW/2, y0+38, '▣ MENU', {fontFamily:'Orbitron', fontSize:'11px', color:'#8fa3c4', backgroundColor:'#0f172a', padding:{left:12,right:12,top:7,bottom:7}}).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
          btnMenu.on('pointerdown', ()=> this.scene.start('Menu'));
          this.time.delayedCall(6000, ()=>{ if(this.scene.isActive()) this.scene.start('Nave', {campaignIdx:this.campaignIdx, phaseIdx:nextPhase, shipId:this.shipId, diffKey:this.diffKey}); });
        } else {
          const label = isLastPhase && ok ? '🏆 CAMPANHA COMPLETA! ★ MENU' : (ok? '✔ FASE COMPLETA — MENU' : '✕ TENTAR NOVAMENTE');
          const btn=this.add.text(BW/2, BH/2+32, label, {fontFamily:'Orbitron', fontSize:'12px', color:'#020617', backgroundColor: ok? (this.stage.accent||'#38bdf8') : '#475569', padding:{left:14,right:14,top:8,bottom:8}}).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
          const targetPhase = isLastPhase? null : this.phaseIdx;
          btn.on('pointerdown', ()=>{
            if(isLastPhase) this.scene.start('Menu');
            else if(ok) this.scene.start('Menu');
            else this.scene.start('Nave', {campaignIdx:this.campaignIdx, phaseIdx:this.phaseIdx, shipId:this.shipId, diffKey:this.diffKey});
          });
          if(!isLastPhase) this.time.delayedCall(5000, ()=>{ if(this.scene.isActive()) this.scene.start('Menu'); });
        }
      } else {
        const isFinal = this.nextMap >= D.MAPS_DATA.length;
        const label = isFinal ? '▶ VOLTAR À BASE' : '▶ PRÓXIMO PLANETA';
        const btn=this.add.text(BW/2, BH/2+32, label, {fontFamily:'Orbitron', fontSize:'13px', color:'#020617', backgroundColor:this.stage.accent||'#38bdf8', padding:{left:16,right:16,top:9,bottom:9}}).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
        btn.on('pointerdown', ()=>{ if(isFinal) this.scene.start('Menu'); else this.scene.start('Game',{mapIdx:this.nextMap, diffKey:this.diffKey, endless:false}); });
        this.time.delayedCall(4000, ()=>{ if(this.scene.isActive()){ if(isFinal) this.scene.start('Menu'); else this.scene.start('Game',{mapIdx:this.nextMap, diffKey:this.diffKey, endless:false}); }});
      }
    }
  }

  // 5 subclasses leves (polimorfia via herança) - exigido spec OU switch
  class AsteroidsScene extends NaveScene { constructor(){ super('Asteroids'); } create(d){ if(d && !d.styleId) d.styleId='asteroids'; return super.create(d); } }
  class HorizontalScene extends NaveScene { constructor(){ super('Horizontal'); } create(d){ if(d && !d.styleId) d.styleId='horizontal'; return super.create(d); } }
  class VerticalScene extends NaveScene { constructor(){ super('Vertical'); } create(d){ if(d && !d.styleId) d.styleId='vertical'; return super.create(d); } }
  class ArenaScene extends NaveScene { constructor(){ super('Arena'); } create(d){ if(d && !d.styleId) d.styleId='arena'; return super.create(d); } }
  class TunnelScene extends NaveScene { constructor(){ super('Tunnel'); } create(d){ if(d && !d.styleId) d.styleId='tunnel'; return super.create(d); } }
  // alias compatibilidade: ShmupScene vira VerticalScene
  class ShmupScene extends NaveScene { constructor(){ super('Shmup'); } create(d){ if(d && !d.styleId){ const ids=['asteroids','horizontal','vertical','arena','tunnel']; const idx=Math.max(0,Math.min(4,(d.stageIdx!=null?d.stageIdx:2))); d.styleId=ids[idx]; } return super.create(d); } }


  class MetalSlugScene extends Phaser.Scene {
    constructor(){ super('MetalSlug'); }
    create(data){
      const stageIdx = data.stageIdx!=null ? data.stageIdx : (data.nextMapIdx||0);
      this.stageIdx = Math.max(0, Math.min(4, stageIdx));
      this.stage = (D.METAL_STAGES && D.METAL_STAGES[this.stageIdx]) || {name:'Trincheira', bg:'#0f172a', accent:'#38bdf8', enemyPool:['swarm','drone'], duration:35, target:24, gravity:950};
      this.nextMap = data.nextMapIdx || 0;
      this.diffKey = data.diffKey || 'normal';
      this.pilotId = data.pilotId || (D.PILOTS ? D.PILOTS[0].id : 'cannon');
      this.pilot = (D.PILOTS||[]).find(p=>p.id===this.pilotId) || {name:'Recruta', color:'#38bdf8', ability:'dash', icon:'★'};
      this.score=0; this.timeLeft=this.stage.duration||35; this.enemies=[]; this.bullets=[];
      // Fundo selva como referência Metal Slug (templo, árvores, céu)
      this.cameras.main.setBackgroundColor(this.stage.bg||'#1a3a1a');
      const jungle = this.add.graphics().setDepth(0);
      jungle.fillStyle(0x0f2a1a,1); jungle.fillRect(0,0,BW,BH);
      jungle.fillStyle(0x1a4a1a,1);
      jungle.beginPath(); jungle.moveTo(0,120); for(let x=0;x<BW;x+=30) jungle.lineTo(x, 80 + Math.sin(x*0.015)*18 + Math.random()*10); jungle.lineTo(BW,0); jungle.lineTo(0,0); jungle.fillPath();
      jungle.fillStyle(0x3d2e1a,1); jungle.fillRect(BW/2-90, 50, 180, 70);
      jungle.fillStyle(0x5a3d1a,1); jungle.fillTriangle(BW/2-100,50, BW/2+100,50, BW/2,10);
      jungle.fillStyle(0x2d1a0a,1); jungle.fillRect(BW/2-14, 80, 28, 40);
      for(let i=0;i<5;i++){ jungle.fillStyle(0x3d2817,1); jungle.fillRect(30+i*170, BH-180, 14, 100); jungle.fillStyle(0x1a5a1a,1); jungle.fillCircle(37+i*170, BH-190, 34); }
      // Chão e plataformas
      this.platforms = this.physics.add.staticGroup();
      const ground = this.add.rectangle(BW/2, BH-14, BW, 28, 0x2d1a0a);
      this.platforms.add(ground);
      const plats = [
        {x:180, y:BH-110, w:160, h:14},{x:520, y:BH-160, w:180, h:14},{x:760, y:BH-100, w:140, h:14},
        {x:360, y:BH-210, w:120, h:14},{x:640, y:BH-240, w:100, h:14}
      ];
      plats.forEach(p=>{
        const r=this.add.rectangle(p.x, p.y, p.w, p.h, 0x5a3d1a);
        this.platforms.add(r);
        this.add.rectangle(p.x, p.y-3, p.w, 3, 0x8b5a2b).setDepth(1);
      });
      // Player soldado detalhado (capacete, mochila)
      const col = Phaser.Display.Color.HexStringToColor(this.pilot.color).color;
      this.player = this.physics.add.sprite(80, BH-80, 'dot').setScale(1.4).setDepth(10).setTint(col);
      // Desenha soldado via graphics como fallback se textura não existir
      this.player.setTexture('dot');
      // Corpo
      this.player.body.setSize(18,28).setOffset(-2, -4);
      this.player.setTint(0xffffff);
      // Adiciona detalhes visuais como container
      this.playerContainer = this.add.container(this.player.x, this.player.y).setDepth(10);
      const body = this.add.rectangle(0, 0, 14, 18, col);
      const head = this.add.circle(0, -12, 6, 0xffdbac);
      const helm = this.add.ellipse(0, -14, 14, 10, 0x4a5568);
      const gun = this.add.rectangle(8, -2, 16, 4, 0x1a202c);
      this.playerContainer.add([body, head, helm, gun]);
      this.physics.add.existing(this.playerContainer);
      this.playerContainer.body.setSize(18,28);
      this.playerContainer.body.setCollideWorldBounds(true);
      // Usa container como player
      this.player.destroy();
      this.player = this.playerContainer;
      this.playerBody = this.player.body;
      this.physics.add.collider(this.player, this.platforms);
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,G');
      this.input.keyboard.on('keydown-SPACE', ()=> this.shoot());
      this.input.keyboard.on('keydown-G', ()=> this.grenade());
      this.input.on('pointerdown', (p)=> { if(p.button===0) this.shoot(); else this.grenade(); });
      this.scoreTxt = this.add.text(12,10, 'PONTOS 0/'+(this.stage.target||24), {fontFamily:'Orbitron', fontSize:'14px', color:'#fbbf24'}).setDepth(20);
      this.timeTxt = this.add.text(BW-12,10, Math.ceil(this.timeLeft)+'s', {fontFamily:'Orbitron', fontSize:'14px', color:'#38bdf8'}).setOrigin(1,0).setDepth(20);
      this.add.text(BW/2, 10, `${this.stage.name.toUpperCase()} — ${this.pilot.callsign}`, {fontFamily:'Orbitron', fontSize:'11px', color:this.stage.accent||'#e8eefc'}).setOrigin(0.5,0).setDepth(20);
      this.add.text(BW/2, 24, 'A/D move • W pula • ESPAÇO atira • G granada', {fontFamily:'Rajdhani', fontSize:'10px', color:'#e8eefc'}).setOrigin(0.5,0).setDepth(20);
      this.enemyGroup = this.physics.add.group();
      this.physics.add.collider(this.enemyGroup, this.platforms);
      this.physics.add.overlap(this.player, this.enemyGroup, (pl,en)=> this.hitPlayer(en), null, this);
      this.bulletGroup = this.physics.add.group();
      this.physics.add.overlap(this.bulletGroup, this.enemyGroup, (b,e)=> this.hitEnemy(b,e), null, this);
      this.spawnTimer=0;
    }
    shoot(){
      if(this.timeLeft<=0) return;
      const dir=this.player.flipX ? -1 : 1;
      const b=this.physics.add.image(this.player.x+dir*14, this.player.y-4, 'dot').setTint(0xfbbf24).setScale(0.75).setDepth(9);
      b.body.setAllowGravity(false); b.body.setVelocity(dir*520, 0);
      this.bulletGroup.add(b);
      this.time.delayedCall(700, ()=> b.active && b.destroy());
      SND.shoot('bullet');
      // Flash do capacete
      this.tweens.add({targets:this.player, scale:1.08, duration:60, yoyo:true});
    }
    grenade(){
      if(this.timeLeft<=0) return;
      const dir=this.player.flipX ? -1 : 1;
      const g=this.physics.add.image(this.player.x+dir*8, this.player.y, 'dot').setTint(0xfb923c).setScale(0.85).setDepth(9);
      g.body.setVelocity(dir*260, -380); g.body.setBounce(0.3);
      this.physics.add.collider(g, this.platforms);
      this.time.delayedCall(800, ()=>{
        if(!g.active) return;
        SND.explosion(1.1);
        this.cameras.main.shake(120,0.007);
        const ring=this.add.image(g.x,g.y,'ring').setTint(0xfb923c).setScale(0.3).setAlpha(0.9).setDepth(11);
        this.tweens.add({targets:ring, scale:1.8, alpha:0, duration:340, onComplete:()=>ring.destroy()});
        this.enemyGroup.children.entries.slice().forEach(en=>{
          if(Phaser.Math.Distance.Between(g.x,g.y,en.x,en.y)< 70) this.killEnemy(en);
        });
        g.destroy();
      });
    }
    spawnEnemy(){
      const pool=this.stage.enemyPool||['swarm','drone'];
      const t=pool[Math.floor(Math.random()*pool.length)];
      const def=D.ENEMIES_DATA[t]||D.ENEMIES_DATA['swarm'];
      const x=BW+20, y=BH-50 - Math.random()*140;
      const en=this.physics.add.image(x,y, 'dot').setTint(Phaser.Display.Color.HexStringToColor(def.col).color).setScale(0.95).setDepth(8);
      en.body.setAllowGravity(false); en.body.setVelocity(-(70+Math.random()*70 + this.score*1), 0);
      en.hp=1; en.def=def;
      this.enemyGroup.add(en);
      this.time.delayedCall(600, ()=>{ if(en.active) en.body.setAllowGravity(true); });
    }
    hitEnemy(b,e){ b.destroy(); this.killEnemy(e); }
    killEnemy(e){
      if(!e.active) return;
      const x=e.x, y=e.y;
      e.destroy();
      this.score++;
      SND.explosion(0.6);
      for(let k=0;k<6;k++){
        const s=this.add.image(x,y,'dot').setTint(0xfbbf24).setScale(0.45);
        this.tweens.add({targets:s, x:x+(Math.random()-0.5)*40, y:y+(Math.random()-0.5)*40, alpha:0, scale:0.1, duration:280, onComplete:()=>s.destroy()});
      }
      this.scoreTxt.setText('PONTOS '+this.score+'/'+(this.stage.target||24));
      if(this.score>=(this.stage.target||24)) this.finish(true);
    }
    hitPlayer(en){
      if(this._hitCd && this.time.now < this._hitCd) return;
      this._hitCd=this.time.now+800;
      en.destroy();
      this.cameras.main.shake(120,0.008);
      this.cameras.main.flash(80, 244,63,94,false);
      SND.leak();
      this.score=Math.max(0,this.score-1);
      this.scoreTxt.setText('PONTOS '+this.score+'/'+(this.stage.target||24));
    }
    update(_, delta){
      const dt=delta/1000;
      if(this.timeLeft<=0) return;
      this.timeLeft-=dt;
      this.timeTxt.setText(Math.ceil(Math.max(0,this.timeLeft))+'s');
      this.timeTxt.setColor(this.timeLeft<7?'#f43f5e':'#38bdf8');
      let vx=0;
      if(this.cursors.left.isDown || this.keys.A.isDown) vx=-200;
      if(this.cursors.right.isDown || this.keys.D.isDown) vx=200;
      this.player.body.setVelocityX(vx);
      if(vx!==0) this.player.flipX = vx<0;
      if((this.cursors.up.isDown || this.keys.W.isDown) && this.player.body.blocked.down){
        this.player.body.setVelocityY(-460);
      }
      this.spawnTimer=(this.spawnTimer||0)+dt;
      if(this.spawnTimer>0.6){
        this.spawnTimer=0;
        this.spawnEnemy();
        if(Math.random()<0.35) this.spawnEnemy();
      }
      if(this.timeLeft<=0) this.finish(false);
    }
    finish(victory){
      if(this._finished) return;
      this._finished=true;
      const ok = this.score >= (this.stage.target||24);
      const bonus = ok ? 120 : 20;
      D.Save.data.crystals += bonus;
      D.Save.save();
      SND.victory();
      this.physics.pause();
      this.add.rectangle(BW/2,BH/2,BW,BH,0x020617,0.78).setDepth(19);
      this.add.text(BW/2, BH/2-28, ok?'SETOR LIMPO!':'RECÚO', {fontFamily:'Orbitron', fontSize:'20px', color:ok?'#34d399':'#fbbf24'}).setOrigin(0.5).setDepth(20);
      this.add.text(BW/2, BH/2+4, `+${bonus} cristais`, {fontFamily:'Rajdhani', fontSize:'13px', color:'#e8eefc'}).setOrigin(0.5).setDepth(20);
      const label = this.nextMap >= D.MAPS_DATA.length ? '▶ VOLTAR À BASE' : '▶ EMBARCAR → NAVINHA';
      const btn=this.add.text(BW/2, BH/2+44, label, {fontFamily:'Orbitron', fontSize:'13px', color:'#020617', backgroundColor:this.stage.accent||'#38bdf8', padding:{left:16,right:16,top:9,bottom:9}}).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
      btn.on('pointerdown', ()=>{
        if(this.nextMap >= D.MAPS_DATA.length) this.scene.start('Menu');
        else this.scene.start('Shmup', {stageIdx:this.stageIdx, nextMapIdx:this.nextMap, diffKey:this.diffKey});
      });
      this.time.delayedCall(3500, ()=>{
        if(this.scene.isActive()){
          if(this.nextMap >= D.MAPS_DATA.length) this.scene.start('Menu');
          else this.scene.start('Shmup', {stageIdx:this.stageIdx, nextMapIdx:this.nextMap, diffKey:this.diffKey});
        }
      });
    }
  }
  // Patch Menu para mostrar pilotos e 5 estilos Nave
  const _origMenuCreateMS = MenuScene.prototype.create;
  MenuScene.prototype.create = function(){
    _origMenuCreateMS.call(this);
    // mostra galeria de pilotos no menu?
    const btnMS=document.getElementById('btn-shmup');
    if(btnMS){
      btnMS.textContent='★ 5 ESTILOS NAVINHA (90s/2000s)';
      const nb=btnMS.cloneNode(true); btnMS.parentNode.replaceChild(nb, btnMS);
      nb.addEventListener('click', ()=>{
        SND.ui();
        // abre seletor de campanhas 5x5 com escolha de nave
        const camps = D.NAVE_CAMPAIGNS||D.NAVE_STYLES||[];
        const modal=document.createElement('div');
        modal.style.cssText='position:fixed;inset:0;z-index:99;background:rgba(3,7,18,0.88);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
        const box=document.createElement('div');
        box.style.cssText='background:linear-gradient(180deg,#0d1a33,#0a1328);border:1px solid #38bdf8;border-top:3px solid #38bdf8;padding:18px;max-width:780px;width:92%;max-height:85vh;overflow:auto';
        let html='<h2 style="font-family:Orbitron;color:#38bdf8;margin-bottom:10px">★ 5 CAMPANHAS NAVINHA — 25 FASES</h2><p style="color:#8fa3c4;font-size:12px;margin-bottom:12px">Cada campanha tem 5 fases com começo-meio-fim e objetivos variados. Escolha a campanha para ver fases e escolher nave.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
        camps.forEach((camp,i)=>{
          const phases=camp.phases||[camp];
          const prog=(D.Save.data.naveProgress&&D.Save.data.naveProgress[camp.id])||1;
          const starsArr=(D.Save.data.naveStars&&D.Save.data.naveStars[camp.id])||[0,0,0,0,0];
          const dots=phases.map((ph,idx)=> idx<prog? (starsArr[idx]?'★'.repeat(starsArr[idx]): '●') : '○').join(' ');
          html+=`<button data-camp="${i}" style="text-align:left;padding:10px;background:#0f172a;border:1px solid ${camp.accent};color:#e8eefc"><b style="color:${camp.accent}">${camp.name.toUpperCase()}</b><br><span style="font-size:11px;color:#8fa3c4">${camp.desc}</span><br><span style="font-size:10px;color:${camp.accent}">${dots} • ${phases.length} FASES</span></button>`;
        });
        html+='</div><button id="closeInter" style="margin-top:12px;padding:6px 14px">✕ FECHAR</button>';
        box.innerHTML=html;
        modal.appendChild(box);
        document.body.appendChild(modal);
        box.querySelectorAll('[data-camp]').forEach(b=> b.addEventListener('click', ()=>{
          const idx=parseInt(b.getAttribute('data-camp'));
          document.body.removeChild(modal);
          MenuDOM.showNaveCampaign(idx);
        }));
        box.querySelector('#closeInter').addEventListener('click', ()=> document.body.removeChild(modal));
        modal.addEventListener('click', (e)=>{ if(e.target===modal) document.body.removeChild(modal); });
      });
    }
  };
  // TD e NAVINHA são campanhas separadas (30 fases: 5 TD + 25 NAV) — não interlúdio obrigatório
  const _origShowEndMS = GameScene.prototype.showEndModal;
  GameScene.prototype.showEndModal = function(){
    _origShowEndMS.call(this);
    if(this.S.result && this.S.result.outcome==='victory'){
      const modal = document.getElementById('modal-end');
      if(modal && !document.getElementById('btn-nave-camp')){
        const btnNext = document.getElementById('btn-next');
        if(btnNext && btnNext.parentNode){
          const btnNave = document.createElement('button');
          btnNave.id='btn-nave-camp';
          btnNave.textContent='★ AVENTURA NAVINHA (25 FASES)';
          btnNave.className=btnNext.className;
          btnNave.style.marginLeft='8px';
          btnNave.style.borderColor='#a78bfa';
          btnNave.style.color='#a78bfa';
          btnNext.parentNode.appendChild(btnNave);
          btnNave.addEventListener('click', ()=>{
            SND.ui();
            this.hideEndModal();
            const sc=this;
            // FIX TRAVA MINI-FASE: limpa DOM do TD e para a cena Game antes de ir ao Menu
            try{ if(sc.cleanup) sc.cleanup(); }catch(e){}
            try{ document.getElementById('topbar')?.classList.add('off'); }catch(e){}
            try{ document.getElementById('shopbar')?.classList.add('off'); }catch(e){}
            try{ document.getElementById('board-shell')?.classList.remove('hidden'); }catch(e){}
            if(sc.cameras && sc.cameras.main && sc.cameras.main.fadeOut){
              sc.cameras.main.fadeOut(200);
              sc.time.delayedCall(220, ()=> {
                try{ sc.scene.stop('Game'); }catch(e){}
                sc.scene.start('Menu');
                setTimeout(()=>{ const b=document.getElementById('btn-shmup'); if(b) b.click(); }, 500);
              });
            } else {
              try{ sc.scene.stop('Game'); }catch(e){}
              sc.scene.start('Menu');
            }
          });
        }
      }
    }
  };
  // Adiciona as cenas ao gameConfig + 5 estilos Nave
  const _origBootMS2 = boot;
  boot = function(){
    try{
      if(typeof gameConfig!=="undefined" && gameConfig.scene){
        [NaveScene, AsteroidsScene, HorizontalScene, VerticalScene, ArenaScene, TunnelScene, ShmupScene].forEach(cls=>{ if(gameConfig.scene.indexOf(cls)===-1) gameConfig.scene.push(cls); });
      }
    }catch(e){}
    return _origBootMS2();
  };

  /* ---- boot ---- */
  const gameConfig = {
    type: Phaser.AUTO,
    width: BW,
    height: BH,
    parent: 'game-canvas',
    backgroundColor: '#050914',
    physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, MenuScene, GameScene, NaveScene, AsteroidsScene, HorizontalScene, VerticalScene, ArenaScene, TunnelScene, ShmupScene]
  };

  let booted = false;
  function boot() {
    if (booted) return true;
    if (typeof Phaser === 'undefined' || !Phaser.Game || !Phaser.VERSION) return false;
    if (typeof document === 'undefined' || !document.getElementById('game-canvas')) return false;
    window.__game = new Phaser.Game(gameConfig);
    booted = true;
    return true;
  }
  boot();

  /* ---- API de teste (headless / smoke) ---- */
  window.DO = {
    D,
    startNewGame, startNextWave, onWaveCleared, stepSim,
    spawnEnemy, killEnemy, damageEnemy,
    getTowerStats, findBestTarget, canHitAir,
    placeTower, upgradeTower, sellTower, setSpec, cycleTargetMode,
    applySuper, unlockAchievement, applyMutation, skipMutation,
    peekNextWave, waveSummary, computeDps
  };
  // ULTRA: exporta moveTower e stepSim patchado
  window.DO.moveTower = moveTower;
  window.DO.stepSim = stepSim;
  // v3 PIXEL FASES 2-7: exports novos
  window.DO.mergeTowers = mergeTowers;
  window.DO.canMerge = canMerge;
  window.DO.mergeCandidates = mergeCandidates;
  window.DO.tierCap = tierCap;
  window.DO.getTier = D.getTier;
  window.DO.getSuperCharge = getSuperCharge;
  window.DO.forceSuperCharge = forceSuperCharge;
  window.DO.fireTower = fireTower;
  window.DO.upgradeEnemyHP = upgradeEnemyHP;
  window.DO.upgradeFactory = upgradeFactory;
  window.DO.hpMultiplier = hpMultiplier;
})();

