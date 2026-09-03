  /* ================= SHMUP VERTICAL POLIDO - IGUAL REFERÊNCIA ================= */
  class ShmupScene2 extends Phaser.Scene {
    constructor(){ super('Shmup'); }
    create(data){
      const stageIdx = data.stageIdx!=null ? data.stageIdx : (data.nextMapIdx||0);
      this.stageIdx = Math.max(0, Math.min(4, stageIdx));
      this.stage = (D.SHMUP_STAGES && D.SHMUP_STAGES[this.stageIdx]) || {name:'Patrulha', bg:'#020617', accent:'#38bdf8', enemyPool:['drone','runner','swarm'], duration:22, target:22, speed:1.0};
      this.nextMap = data.nextMapIdx || 0;
      this.diffKey = data.diffKey || 'normal';
      this.score=0; this.timeLeft=this.stage.duration||22; this.enemies=[]; this.bullets=[]; this.eBullets=[]; this.boss=null; this.bossHp=0;
      // Fundo com nuvens como referência (céu com nuvens)
      this.cameras.main.setBackgroundColor('#87CEEB');
      // Céu com degradê
      const bg = this.add.graphics().setDepth(0);
      bg.fillGradientStyle(0x87CEEB, 0x87CEEB, 0xE0F6FF, 0xE0F6FF, 1);
      bg.fillRect(0,0,BW,BH);
      // Nuvens parallax
      this.clouds1 = this.add.tileSprite(BW/2, 60, BW, 120, 'soft').setTint(0xffffff).setAlpha(0.85).setDepth(1).setScale(1.8);
      this.clouds2 = this.add.tileSprite(BW/2, 140, BW, 80, 'soft').setTint(0xffffff).setAlpha(0.55).setDepth(1).setScale(2.4);
      this.clouds3 = this.add.tileSprite(BW/2, BH/2, BW, BH, 'soft').setTint(0xffffff).setAlpha(0.12).setDepth(1).setScale(3);
      // Montanhas distantes
      const mtn = this.add.graphics().setDepth(2).setAlpha(0.35);
      mtn.fillStyle(0x1e3a5f,1);
      mtn.beginPath(); mtn.moveTo(0,BH-120); for(let x=0;x<BW;x+=40) mtn.lineTo(x, BH-140 - Math.sin(x*0.02)*30 - Math.random()*20); mtn.lineTo(BW,BH); mtn.lineTo(0,BH); mtn.fillPath();
      SND.musicTick('combat', 8, true);
      // Player nave vermelha como referência (na parte inferior)
      this.player = this.add.image(BW/2, BH-50, 'tur_cannon_10');
      if(!this.textures.exists('tur_cannon_10')) this.player.setTexture('dot');
      this.player.setScale(1.15).setDepth(10).setTint(0xef4444);
      // Sombra da nave
      this.playerShadow = this.add.ellipse(this.player.x, this.player.y+16, 28, 10, 0x000000, 0.25).setDepth(9);
      this.playerBody = {x:BW/2, y:BH-50, w:32, h:32};
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D,SPACE');
      this.input.keyboard.on('keydown-SPACE', ()=> this.shoot());
      this.input.on('pointerdown', ()=> this.shoot());
      // HUD como na referência
      this.scoreTxt = this.add.text(12,8,'PONTOS 0/'+(this.stage.target||22), {fontFamily:'Orbitron', fontSize:'14px', color:'#fbbf24', fontStyle:'bold'}).setDepth(20);
      this.timeTxt = this.add.text(BW-12,8,Math.ceil(this.timeLeft)+'s', {fontFamily:'Orbitron', fontSize:'14px', color:'#38bdf8'}).setOrigin(1,0).setDepth(20);
      this.add.text(BW/2, 8, `NAV: ${this.stage.name.toUpperCase()}`, {fontFamily:'Orbitron', fontSize:'11px', color:this.stage.accent||'#e8eefc', fontStyle:'bold'}).setOrigin(0.5,0).setDepth(20);
      this.add.text(BW/2, 22, 'WASD/Setas move • ESPAÇO atira • Destrua '+ (this.stage.target||22) +' aliens', {fontFamily:'Rajdhani', fontSize:'10px', color:'#1e293b'}).setOrigin(0.5,0).setDepth(20);
      // Boss no topo como na referência (grande nave com muitos canhões)
      this.spawnBoss();
      this.spawnTimer=0;
      this.bulletTimer=0;
    }
    spawnBoss(){
      if(this.boss) return;
      const boss = this.add.image(BW/2, 90, 'en_boss1');
      if(!this.textures.exists('en_boss1')) boss.setTexture('soft');
      boss.setScale(1.8).setDepth(8).setTint(0x1e3a8a);
      // Detalhes do boss: muitos canhões
      this.boss = boss;
      this.bossHp = 18 + this.stageIdx*8;
      this.boss.setData('hp', this.bossHp);
      // Canhões visuais
      this.bossCannons = [];
      for(let i=0;i<6;i++){
        const cx = BW/2 -60 + i*24;
        const c = this.add.rectangle(cx, 110, 8, 22, 0x334155).setDepth(9);
        this.bossCannons.push(c);
      }
      // Barra de vida do boss
      this.bossBarBg = this.add.rectangle(BW/2, 32, 220, 10, 0x000000, 0.6).setDepth(20);
      this.bossBar = this.add.rectangle(BW/2 -110, 32, 220, 10, 0xef4444).setOrigin(0,0.5).setDepth(21);
      this.bossBar.setData('max', 220);
    }
    shoot(){
      if(this.timeLeft<=0) return;
      SND.shoot('bullet');
      const b = this.add.image(this.playerBody.x, this.playerBody.y-18, 'dot').setTint(0x38bdf8).setScale(0.85).setDepth(9);
      // Rastro
      const trail = this.add.image(b.x, b.y+8, 'soft').setTint(0x38bdf8).setScale(0.5).setAlpha(0.4).setDepth(8);
      this.tweens.add({targets:trail, alpha:0, scale:0.1, duration:220, onComplete:()=> trail.destroy()});
      this.bullets.push({img:b, x:this.playerBody.x, y:this.playerBody.y-18, vy:-620});
      this.tweens.add({targets:this.player, scale:1.22, duration:60, yoyo:true});
      // Tiro duplo se piloto for laser
      if(this.stageIdx===2){
        for(let d of [-12,12]){
          const b2=this.add.image(this.playerBody.x+d, this.playerBody.y-12, 'dot').setTint(0xf43f5e).setScale(0.7).setDepth(9);
          this.bullets.push({img:b2, x:this.playerBody.x+d, y:this.playerBody.y-12, vy:-620});
        }
      }
    }
    spawnEnemy(){
      const pool=this.stage.enemyPool||['drone','runner','swarm','wasp'];
      const t=pool[Math.floor(Math.random()*pool.length)];
      const def=D.ENEMIES_DATA[t];
      const x= 40+Math.random()*(BW-80);
      const y=-20;
      const img=this.add.image(x,y, 'en_'+t).setScale(0.9).setDepth(8);
      img.setTint(Phaser.Display.Color.HexStringToColor(def.col).color);
      // Sombra
      const sh=this.add.ellipse(x, y+12, 16, 6, 0x000000, 0.2).setDepth(7);
      this.enemies.push({img, shadow:sh, x,y, vy: 90+Math.random()*90 + this.score*1.8, hp:1, def});
    }
    update(_, delta){
      const dt=delta/1000;
      if(this.timeLeft<=0) return;
      this.timeLeft-=dt;
      // Parallax nuvens
      this.clouds1.tilePositionY -= dt*22;
      this.clouds2.tilePositionY -= dt*38;
      this.clouds3.tilePositionY -= dt*14;
      // Boss movimento suave
      if(this.boss){
        this.boss.x = BW/2 + Math.sin(this.time.now*0.0012)*42;
        this.bossCannons.forEach((c,i)=> c.setPosition(this.boss.x -60 + i*24, 110 + Math.sin(this.time.now*0.002 + i)*4));
        this.bossBarBg.setPosition(this.boss.x, 32);
        this.bossBar.setPosition(this.boss.x-110, 32);
        // Boss atira
        this.bulletTimer+=dt;
        if(this.bulletTimer>0.32){
          this.bulletTimer=0;
          for(let i=0;i<3+this.stageIdx;i++){
            const sx = this.boss.x -36 + Math.random()*72;
            const eB=this.add.image(sx, 130, 'dot').setTint(0xfb923c).setScale(0.7).setDepth(8);
            this.eBullets.push({img:eB, x:sx, y:130, vy: 220+Math.random()*80, vx:(Math.random()-0.5)*60});
          }
          if(this.stageIdx>=3){
            for(let a=0;a<8;a++){
              const ang=a*Math.PI/4;
              const eB=this.add.image(this.boss.x, 130, 'dot').setTint(0xef4444).setScale(0.55).setDepth(8);
              this.eBullets.push({img:eB, x:this.boss.x, y:130, vy: Math.cos(ang)*180, vx: Math.sin(ang)*180});
            }
          }
        }
      }
      // Player
      let dx=0, dy=0;
      if(this.cursors.left.isDown || this.wasd.A.isDown) dx=-1;
      if(this.cursors.right.isDown || this.wasd.D.isDown) dx=1;
      if(this.cursors.up.isDown || this.wasd.W.isDown) dy=-1;
      if(this.cursors.down.isDown || this.wasd.S.isDown) dy=1;
      if(this.input.activePointer.isDown){
        const mx=this.input.activePointer.worldX;
        dx = Math.sign(mx - this.playerBody.x) * 0.95;
      }
      this.playerBody.x = Phaser.Math.Clamp(this.playerBody.x + dx*340*dt, 24, BW-24);
      this.playerBody.y = Phaser.Math.Clamp(this.playerBody.y + dy*300*dt, 80, BH-32);
      this.player.setPosition(this.playerBody.x, this.playerBody.y);
      this.playerShadow.setPosition(this.playerBody.x, this.playerBody.y+18);
      // Spawn — +30% POR VEZ a cada 10 níveis (11-20 +30%, 21-30 +60%, etc)
      this.spawnTimer+=dt;
      const rate = 0.38 - this.stage.speed*0.05;
      if(this.spawnTimer>rate){
        this.spawnTimer=0;
        // nível global estimado: stageIdx*5 + score/8 (cada 10 abates ~ +1 nível) ou direto do stage
        const lvlEst = this.stageIdx*5 + Math.floor(this.score/6) + 1;
        const mult = 1 + Math.floor(Math.max(0,lvlEst-1)/10)*0.30;
        const extra = Math.floor(mult-1) + (Math.random() < (mult-1 - Math.floor(mult-1)) ? 1 : 0);
        const baseExtraChance = 0.4 + (mult-1)*0.5; // 40% base + bônus por tier
        this.spawnEnemy();
        if(Math.random()<baseExtraChance) this.spawnEnemy();
        for(let k=0;k<extra;k++) this.spawnEnemy();
        // em tiers altos, spawna pares simultâneos extras
        if(mult>=1.6 && Math.random()<0.5) { this.spawnEnemy(); this.spawnEnemy(); }
      }
      // Bullets player
      for(let i=this.bullets.length-1;i>=0;i--){
        const b=this.bullets[i];
        b.y+=b.vy*dt; b.img.setPosition(b.x,b.y);
        if(b.y<-12){ b.img.destroy(); this.bullets.splice(i,1); continue; }
        // colisão com boss
        if(this.boss && Math.hypot(b.x-this.boss.x, b.y-110)< 48){
          b.img.destroy(); this.bullets.splice(i,1);
          this.bossHp--;
          this.bossBar.width = 220 * Math.max(0, this.bossHp/(18+this.stageIdx*8));
          this.boss.setTint(0xffaaaa);
          this.time.delayedCall(80, ()=> this.boss && this.boss.setTint(0x1e3a8a));
          this.cameras.main.shake(60,0.004);
          if(this.bossHp<=0){
            // boss explode
            for(let k=0;k<16;k++){
              const p=this.add.image(this.boss.x, 110, 'dot').setTint(0xfbbf24).setScale(0.9);
              this.tweens.add({targets:p, x:this.boss.x+(Math.random()-0.5)*120, y:110+(Math.random()-0.5)*60, alpha:0, scale:0.1, duration:420, onComplete:()=>p.destroy()});
            }
            SND.explosion(2);
            this.boss.destroy(); this.boss=null;
            this.bossBar.destroy(); this.bossBarBg.destroy();
            this.bossCannons.forEach(c=>c.destroy());
            this.score+=6;
          }
          continue;
        }
      }
      // Enemies
      for(let i=this.enemies.length-1;i>=0;i--){
        const e=this.enemies[i];
        e.y+=e.vy*dt; e.img.setPosition(e.x,e.y); e.shadow.setPosition(e.x, e.y+12);
        e.img.rotation+=dt*1.4;
        if(e.y>BH+40){ e.img.destroy(); e.shadow.destroy(); this.enemies.splice(i,1); continue; }
        for(let j=this.bullets.length-1;j>=0;j--){
          const b=this.bullets[j];
          if(Math.hypot(e.x-b.x, e.y-b.y)< e.def.r+7){
            b.img.destroy(); this.bullets.splice(j,1);
            e.img.destroy(); e.shadow.destroy(); this.enemies.splice(i,1);
            this.score++;
            SND.explosion(0.7);
            break;
          }
        }
        if(e.y>BH-60 && Math.hypot(e.x-this.playerBody.x, e.y-this.playerBody.y)< 28){
          e.img.destroy(); e.shadow.destroy(); this.enemies.splice(i,1);
          this.cameras.main.shake(120,0.008);
          this.score=Math.max(0,this.score-1);
        }
      }
      // Balas inimigas
      for(let i=this.eBullets.length-1;i>=0;i--){
        const b=this.eBullets[i];
        b.y+=b.vy*dt; b.x+=b.vx*dt; b.img.setPosition(b.x,b.y);
        if(b.y>BH+20 || b.x<-20 || b.x>BW+20){ b.img.destroy(); this.eBullets.splice(i,1); continue; }
        if(Math.hypot(b.x-this.playerBody.x, b.y-this.playerBody.y)< 18){
          b.img.destroy(); this.eBullets.splice(i,1);
          this.cameras.main.flash(80, 244,63,94, false);
          this.score=Math.max(0,this.score-1);
        }
      }
      // HUD
      this.scoreTxt.setText('PONTOS '+this.score+'/'+(this.stage.target||22));
      this.timeTxt.setText(Math.ceil(Math.max(0,this.timeLeft))+'s');
      this.timeTxt.setColor(this.timeLeft<6? '#f43f5e' : '#38bdf8');
      if(this.timeLeft<=0 || this.score>= (this.stage.target||22)) this.finish();
    }
    finish(){
      if(this._finished) return;
      this._finished=true;
      const bonus = this.score>= (this.stage.target||22) ? 140 : this.score>=15? 80 : 20;
      D.Save.data.crystals += bonus;
      D.Save.save();
      SND.victory();
      this.add.rectangle(BW/2,BH/2,BW,BH,0x020617,0.78).setDepth(19);
      const ok=this.score>= (this.stage.target||22);
      this.add.text(BW/2, BH/2-26, ok? 'VITÓRIA ESPACIAL!': 'MISSÃO INCOMPLETA', {fontFamily:'Orbitron', fontSize:'20px', color:ok?'#34d399':'#fbbf24'}).setOrigin(0.5).setDepth(20);
      this.add.text(BW/2, BH/2+4, `+${bonus} cristais • ${this.score} abatidos`, {fontFamily:'Rajdhani', fontSize:'13px', color:'#e8eefc'}).setOrigin(0.5).setDepth(20);
      const isFinal = this.nextMap >= D.MAPS_DATA.length;
      const label = isFinal ? '▶ VOLTAR À BASE' : '▶ PRÓXIMO PLANETA';
      const btn=this.add.text(BW/2, BH/2+48, label, {fontFamily:'Orbitron', fontSize:'13px', color:'#020617', backgroundColor:'#38bdf8', padding:{left:16,right:16,top:9,bottom:9}}).setOrigin(0.5).setDepth(20).setInteractive({useHandCursor:true});
      btn.on('pointerdown', ()=>{
        if(isFinal) this.scene.start('Menu');
        else this.scene.start('Game', {mapIdx:this.nextMap, diffKey:this.diffKey, endless:false});
      });
      this.time.delayedCall(4000, ()=>{
        if(this.scene.isActive()){
          if(isFinal) this.scene.start('Menu');
          else this.scene.start('Game', {mapIdx:this.nextMap, diffKey:this.diffKey, endless:false});
        }
      });
    }
  }
