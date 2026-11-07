(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const dialog = $('#game-dialog'), canvas = $('#game-canvas'), ctx = canvas.getContext('2d');
  const W=900,H=420,DURATION=30;
  let language='ko',state='ready',frame=0,last=0,elapsed=0,score=0,lives=3,spawn=0,invincible=0,player=.5,objects=[],keys=new Set(),dragging=false;
  let best=0;try{best=Number(localStorage.getItem('inho-orbit-best'))||0;}catch{}
  const t=(ko,en)=>language==='en'?en:ko;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function hud(){
    $('#game-score').textContent=`SCORE ${String(Math.floor(score)).padStart(4,'0')}`;
    $('#game-time').textContent=`${Math.max(0,DURATION-elapsed).toFixed(1)}s`;
    $('#game-lives').textContent='♥ '.repeat(lives)+'♡ '.repeat(3-lives);
    $('#game-best').textContent=t(`이 브라우저의 최고 점수 ${best} · 30초 생존 + 빛 수집`, `Best on this browser: ${best} · Survive 30 seconds + collect light`);
  }
  function overlay(){
    $('#game-overlay').hidden=state==='running';
    $('#game-message').textContent=state==='paused'?t('잠깐 쉬어가기','PAUSED'):state==='ended'?(lives?t('항해 성공!','SAFE LANDING!'):t('다시 도전해볼까요?','ONE MORE TRY?')):'ORBIT DASH';
    $('#game-instructions').textContent=t('← → 또는 A / D로 이동. 터치로 드래그해도 좋아요. 운석을 피하고 초록빛을 모아 30초 동안 살아남으세요.','Move with ← → or A / D, or drag on touch. Dodge rocks, collect green lights, and survive for 30 seconds.');
    $('#game-result').textContent=state==='ended'?t(`점수 ${Math.floor(score)} · 생존 ${elapsed.toFixed(1)}초`, `Score ${Math.floor(score)} · ${elapsed.toFixed(1)} seconds survived`):'';
    $('#game-start').textContent=state==='paused'?t('계속하기','Resume'):state==='ended'?t('다시 플레이','Play again'):t('플레이 시작','Start playing');
    $('#game-pause').textContent=state==='paused'?t('계속','Resume'):t('일시정지','Pause');
    $('#game-pause').disabled=!['running','paused'].includes(state);
    $('#game-help').textContent=t('← → 이동 · P 일시정지 · Esc 닫기','← → Move · P Pause · Esc Close');
    hud();
  }
  function draw(){
    ctx.fillStyle='#121322';ctx.fillRect(0,0,W,H);
    for(let i=0;i<60;i++){
      const x=(i*173+23)%W,y=((i*97)+(reduced?0:elapsed*12))%H;
      ctx.fillStyle=i%3?'#55536e':'#a49bbb';ctx.beginPath();ctx.arc(x,y,i%3?1:1.5,0,Math.PI*2);ctx.fill();
    }
    ctx.strokeStyle='#9183b212';ctx.beginPath();ctx.ellipse(710,60,210,110,-.4,0,Math.PI*2);ctx.stroke();
    for(const o of objects){
      ctx.save();ctx.translate(o.x*W,o.y);ctx.rotate(o.rotation+elapsed*.5);
      if(o.kind==='light'){
        ctx.fillStyle='#91e0c2';ctx.shadowColor='#91e0c2';ctx.shadowBlur=reduced?0:15;ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(8,0);ctx.lineTo(0,11);ctx.lineTo(-8,0);ctx.closePath();ctx.fill();
      }else{
        ctx.fillStyle='#71667e';ctx.strokeStyle='#a28caa';ctx.lineWidth=1.5;ctx.beginPath();
        for(let j=0;j<7;j++){const angle=j*Math.PI*2/7,r=o.radius*(j%2?.8:1);const x=Math.cos(angle)*r,y=Math.sin(angle)*r;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();
      }ctx.restore();
    }
    ctx.save();ctx.translate(player*W,H-45);
    if(invincible>0){ctx.strokeStyle='#ceb2ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle='#d7c3ff';ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(14,15);ctx.lineTo(0,9);ctx.lineTo(-14,15);ctx.closePath();ctx.fill();
    ctx.fillStyle='#91e0c2';ctx.beginPath();ctx.moveTo(-5,15);ctx.lineTo(0,23+(reduced?0:Math.sin(elapsed*25)*4));ctx.lineTo(5,15);ctx.fill();ctx.restore();
  }
  function finish(){
    state='ended';cancelAnimationFrame(frame);keys.clear();dragging=false;
    if(lives)score+=100;
    best=Math.max(best,Math.floor(score));try{localStorage.setItem('inho-orbit-best',String(best));}catch{}
    overlay();draw();$('#game-start').focus({preventScroll:true});
  }
  function tick(now){
    if(state!=='running')return;
    const dt=Math.min((now-last)/1000,.05);last=now;elapsed=Math.min(DURATION,elapsed+dt);score+=dt*10;invincible=Math.max(0,invincible-dt);
    if(keys.has('left'))player-=dt*.75;if(keys.has('right'))player+=dt*.75;player=Math.max(.025,Math.min(.975,player));
    spawn-=dt;
    if(spawn<=0){const light=Math.random()<.3;objects.push({x:.04+Math.random()*.92,y:-30,radius:12+Math.random()*9,kind:light?'light':'rock',speed:120+elapsed*3+Math.random()*60,rotation:Math.random()*6});spawn=.45+Math.random()*.3;}
    for(const o of objects){
      o.y+=dt*o.speed;
      const collision=Math.hypot((o.x-player)*W,o.y-(H-45))<o.radius+12;
      if(collision&&(o.kind==='light'||invincible<=0)){
        o.y=H+100;
        if(o.kind==='light')score+=50;else{lives--;invincible=1.2;}
      }
    }
    objects=objects.filter(o=>o.y<H+35);hud();draw();
    if(lives<=0||elapsed>=DURATION){finish();return;}
    frame=requestAnimationFrame(tick);
  }
  function resume(){state='running';last=performance.now();overlay();canvas.focus({preventScroll:true});frame=requestAnimationFrame(tick);}
  function start(){cancelAnimationFrame(frame);elapsed=0;score=0;lives=3;spawn=.6;invincible=0;player=.5;objects=[];keys.clear();resume();}
  function pause(){if(state!=='running')return;state='paused';cancelAnimationFrame(frame);keys.clear();dragging=false;overlay();}
  $('#launch-game').addEventListener('click',()=>{state='ready';elapsed=0;score=0;lives=3;player=.5;objects=[];invincible=0;dialog.showModal();overlay();draw();});
  $('#game-start').addEventListener('click',()=>state==='paused'?resume():start());
  $('#game-pause').addEventListener('click',()=>state==='paused'?resume():pause());
  dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);state='ready';keys.clear();dragging=false;});
  dialog.addEventListener('keydown',event=>{
    const key=event.key.toLowerCase();
    if(['arrowleft','arrowright','a','d'].includes(key)&&state==='running'){
      event.preventDefault();keys.add(['arrowleft','a'].includes(key)?'left':'right');
    }
    if(key==='p'&&!event.repeat){event.preventDefault();if(state==='running')pause();else if(state==='paused')resume();}
  });
  document.addEventListener('keyup',event=>{const key=event.key.toLowerCase();if(['arrowleft','a'].includes(key))keys.delete('left');if(['arrowright','d'].includes(key))keys.delete('right');});
  window.addEventListener('blur',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  function move(event){const rect=canvas.getBoundingClientRect();player=Math.max(.025,Math.min(.975,(event.clientX-rect.left)/rect.width));}
  canvas.addEventListener('pointerdown',event=>{if(state!=='running')return;dragging=true;canvas.setPointerCapture(event.pointerId);move(event);});
  canvas.addEventListener('pointermove',event=>{if(dragging&&state==='running')move(event);});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>canvas.addEventListener(type,()=>{dragging=false;}));
  for(const direction of ['left','right']){
    const button=$(`#move-${direction}`);
    button.addEventListener('pointerdown',event=>{if(state!=='running')return;event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(direction);});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,()=>keys.delete(direction)));
    button.addEventListener('click',event=>{if(event.detail===0&&state==='running')player=Math.max(.025,Math.min(.975,player+(direction==='left'?-.08:.08)));});
  }
  window.orbitGame={setLanguage(value){language=value;overlay();}};
  overlay();draw();
})();
