(() => {
  const data = window.PORTFOLIO_ACTIVITY;
  const projects = window.PORTFOLIO_PROJECTS;
  let lang = 'ko', selectedDay = data.days.length - 1;
  const t = (ko,en) => lang === 'en' ? en : ko;
  function describe(index) {
    const day=data.days[index];
    document.getElementById('activity-day').textContent=t(`${day.date} · ${day.count}회 기여`,`${day.date} · ${day.count} contributions`);
    document.querySelectorAll('.activity-cell').forEach((cell,i)=>{cell.tabIndex=i===index?0:-1;cell.setAttribute('aria-pressed',String(i===index));});
  }
  function render(language) {
    lang=language;
    const documents=projects.filter(p=>p.links.some(l=>l.href.endsWith('.html'))).length;
    const games=projects.filter(p=>p.links.some(l=>l.href.includes('itch.io')));
    const recent=data.days.slice(-30).reduce((sum,d)=>sum+d.count,0);
    const stats=[[projects.length,t('기록된 프로젝트','Documented projects')],[documents,t('아키텍처 문서','Architecture documents')],[games.length,t('itch.io 공개 게임','Games on itch.io')],[recent,t('최근 30일 GitHub 기여','GitHub contributions · last 30 days')]];
    document.getElementById('dashboard-stats').innerHTML=stats.map(([value,label])=>`<div class="stat"><strong>${value.toLocaleString()}</strong><span>${label}</span></div>`).join('');
    document.getElementById('activity-summary').textContent=t(`${data.total.toLocaleString()}회 기여 · ${data.days.filter(d=>d.count>0).length}일의 개발 기록`,`${data.total.toLocaleString()} contributions · ${data.days.filter(d=>d.count>0).length} active days`);
    const grid=document.getElementById('activity-grid');
    grid.innerHTML=data.days.map((day,index)=>`<button type="button" class="activity-cell" data-index="${index}" data-level="${day.level}" tabindex="${index===selectedDay?0:-1}" aria-pressed="${index===selectedDay}" aria-label="${day.date}: ${day.count} ${t('회 기여','contributions')}" title="${day.date} · ${day.count}"></button>`).join('');
    let previous='';
    document.getElementById('heatmap-months').innerHTML=data.days.filter((_,i)=>i%7===0).map(day=>{const month=day.date.slice(0,7),label=month!==previous?new Date(day.date+'T12:00:00Z').toLocaleDateString(lang==='en'?'en-US':'ko-KR',{month:'short',timeZone:'UTC'}):'';previous=month;return `<span>${label}</span>`;}).join('');
    const source=document.getElementById('activity-source');source.replaceChildren();
    source.append(document.createTextNode(t(`공개 GitHub 캘린더 · ${data.days[0].date} — ${data.days.at(-1).date} · ${data.fetchedAt.slice(0,10)} UTC 수집. 기여에는 커밋 외 활동도 포함됩니다. `,`Public GitHub calendar · ${data.days[0].date} — ${data.days.at(-1).date} · Snapshot: ${data.fetchedAt.slice(0,10)} UTC. Contributions include more than commits. `)));
    const link=document.createElement('a');link.href=data.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent=t('원본 보기 ↗','View source ↗');source.append(link);
    const groups=[['core','실무 · 협업','Professional'],['ax','개인 제작 · AI 활용','Solo · AI-assisted'],['study','연구 · 프로토타입','Research · prototypes']];
    document.getElementById('project-breakdown').innerHTML=groups.map(([id,ko,en])=>{const count=projects.filter(p=>p.category===id).length;return `<div class="breakdown-row"><div><span>${t(ko,en)}</span><strong>${count}</strong></div><div class="breakdown-track"><span style="width:${count/projects.length*100}%"></span></div></div>`;}).join('');
    const gameList=document.getElementById('dashboard-games');gameList.replaceChildren();
    games.forEach(game=>{const a=document.createElement('a');a.href=game.links.find(l=>l.href.includes('itch.io')).href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=game.name+' ↗';gameList.append(a);});
    describe(selectedDay);
  }
  const grid=document.getElementById('activity-grid');
  grid.addEventListener('click',event=>{const cell=event.target.closest('[data-index]');if(cell){selectedDay=Number(cell.dataset.index);describe(selectedDay);}});
  grid.addEventListener('keydown',event=>{
    const shifts={ArrowLeft:-7,ArrowRight:7,ArrowUp:-1,ArrowDown:1};
    if(!(event.key in shifts)&&!['Home','End'].includes(event.key))return;
    event.preventDefault();
    selectedDay=event.key==='Home'?0:event.key==='End'?data.days.length-1:Math.max(0,Math.min(data.days.length-1,selectedDay+shifts[event.key]));
    describe(selectedDay);grid.children[selectedDay].focus();
  });
  window.portfolioDashboard={render};
})();
