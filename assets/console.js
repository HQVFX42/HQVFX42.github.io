(() => {
  'use strict';
  const projects = window.PORTFOLIO_PROJECTS;
  const $ = (selector) => document.querySelector(selector);
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const requested = new URLSearchParams(location.search).get('lang');
  let lang = ['ko', 'en'].includes(requested) ? requested : read('portfolio-language') === 'en' ? 'en' : 'ko';
  const t = (ko, en) => lang === 'en' ? en : ko;
  const localized = (value) => typeof value === 'string' ? value : value[lang];
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const views = [['library','작품','Collection'],['playroom','플레이룸','Playroom'],['notes','기록','Notes'],['profile','프로필','Profile']];
  let currentView = views.some(v => `#${v[0]}` === location.hash) ? location.hash.slice(1) : 'library';
  let selected = 'p1-0';
  let filter = 'all';
  let detailId = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let backgroundVersion = 0, backgroundId = null, hoverTimer = 0;
  let soundEnabled = false, audioContext = null;
  function playTone(activate = false) {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(activate ? 640 : 420, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(activate ? 960 : 570, audioContext.currentTime + .09);
      gain.gain.setValueAtTime(.025, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .13);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + .14);
    } catch { soundEnabled = false; updateSoundButton(); }
  }
  function updateSoundButton() {
    $('#sound-toggle').setAttribute('aria-pressed',String(soundEnabled));
    $('#sound-toggle').setAttribute('aria-label',soundEnabled ? t('UI 효과음 끄기','Turn UI sound off') : t('UI 효과음 켜기','Turn UI sound on'));
  }
  async function updateBackground(project) {
    if (backgroundId === project.id) return;
    backgroundId = project.id;
    const version = ++backgroundVersion;
    const preload = new Image(); preload.src = project.image;
    try { await preload.decode(); } catch { return; }
    if (version !== backgroundVersion) return;
    const layers = [...document.querySelectorAll('.scene-image')];
    const next = layers.find(layer => !layer.classList.contains('active'));
    next.src = project.image;
    layers.forEach(layer => layer.classList.toggle('active', layer === next));
  }
  function selectProject(id, focus = false) {
    if (selected !== id) { selected = id; renderFeatured(); playTone(); }
    const button = $(`[data-select="${id}"]`);
    if (focus) {
      button.focus({preventScroll:true});
      const rail = $('#featured-strip');
      const left = button.offsetLeft - rail.offsetLeft;
      rail.scrollTo({left:Math.max(0,left - 8), behavior:reducedMotion.matches ? 'instant' : 'smooth'});
    }
  }
  const selectedIds = ['p1-0', 'p0-0', 'p0-2', 'p0-1', 'p1-1', 'p0-3'];
  const editorial = {
    'p1-0': {title:'Whale\nGetaway', color:'#0c2942', subtitle:['작은 고래와 함께, 푸른 바다를 되찾는 모험.','A little whale. A big adventure to reclaim the blue.'],kind:'SOLO GAME · PIXEL ADVENTURE'},
    'p0-0': {title:'SUPER\nPOP!', color:'#173b40', subtitle:['가볍게 시작해, 계속 즐기고 싶은 모바일 퍼즐.','A casual mobile puzzle, made for one more round.'],kind:'MOBILE GAME · UNITY'},
    'p0-2': {title:'Behind\nthe animation.',color:'#34273c',subtitle:['Larva — 애니메이션을 만드는 사람들을 위한 UE5 제작 도구.','Larva — UE5 tools for the people behind the animation.'],kind:'LARVA · TOOLS & PIPELINE'},
    'p0-1': {title:'Mega Road',color:'#272535',subtitle:['게임과 유저를 잇는 UI, 그리고 그 안의 구조.','Connecting players and gameplay through UI and architecture.'],kind:'MOBILE GAME · CLIENT DEVELOPMENT'},
    'p1-1': {title:'HamsThor',color:'#33243c',subtitle:['돌리고, 당기고, 날아오르는 작은 햄스터의 도전.','Spin, winch, and launch. A little hamster’s big leap.'],kind:'SOLO GAME · PHYSICS'},
    'p0-3': {title:'White\nParadise',color:'#223332',subtitle:['함께 살아남는 세계. 언리얼로 만든 협동 생존 게임.','A world to survive together. A cooperative Unreal game.'],kind:'UNREAL ENGINE · CO-OP SURVIVAL'}
  };
  function category(project) {
    return {core:t('실무 · 협업','Professional'),ax:t('개인 제작 · AI 활용','Solo · AI-assisted'),study:t('연구 · 프로토타입','Research · Prototype')}[project.category];
  }
  function externalAttributes(href) { return href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''; }
  function projectImage(p, className = '') {
    return p.image ? `<img class="${className}" src="${escape(p.image)}" alt="${escape(p.name)}" loading="lazy">` : `<div class="project-placeholder" aria-hidden="true">${escape(p.tags[0] || '</>')}</div>`;
  }
  function renderNavigation() {
    $('#main-nav').innerHTML = views.map(([id,ko,en]) => `<button class="nav-button" data-view="${id}" ${id===currentView?'aria-current="page"':''}>${t(ko,en)}</button>`).join('');
  }
  function setView(id, navigate = true) {
    if (!views.some(v => v[0] === id)) return;
    currentView = id;
    document.body.dataset.view = id;
    $('.scene').classList.toggle('scene-interior',id !== 'library');
    clearTimeout(hoverTimer);
    document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== `view-${id}`; });
    renderNavigation();
    if (navigate) {
      playTone(true);
      history.pushState(null,'',`#${id}`);
      window.scrollTo({top:0,behavior:'instant'});
      $('#main').focus({preventScroll:true});
    }
  }
  function renderFeatured() {
    const p = projects.find(p => p.id === selected);
    const e = editorial[selected];
    updateBackground(p);
    $('#featured').innerHTML = `<div class="featured-content"><p class="feature-label">${e.kind}</p><h2>${escape(e.title)}</h2><p class="featured-description">${t(...e.subtitle)}</p><div class="featured-tags">${p.tags.slice(0,3).map(tag=>`<span>${escape(tag)}</span>`).join('')}</div><div class="featured-actions"><button class="primary-button" data-detail="${p.id}">${t('작품 살펴보기','Explore project')} <span aria-hidden="true">↗</span></button>${p.links.find(l=>l.href.includes('itch.io'))?`<a class="secondary-button" href="${escape(p.links.find(l=>l.href.includes('itch.io')).href)}" target="_blank" rel="noopener noreferrer">${t('itch.io에서 플레이 ↗','Play on itch.io ↗')}</a>`:''}</div></div>`;
    $('#selected-name').textContent=p.name;
    $('#console-status').textContent=t(`${p.name} 선택됨`,`${p.name} selected`);
    document.querySelectorAll('.cover-button').forEach(button => {
      const active=button.dataset.select===selected;
      button.setAttribute('aria-pressed', String(active)); button.tabIndex=active?0:-1;
    });
  }
  function renderStrip() {
    $('#featured-strip').innerHTML = selectedIds.map((id,i)=>{
      const p=projects.find(p=>p.id===id);
      return `<button class="cover-button" data-select="${id}" aria-pressed="${id===selected}" tabindex="${id===selected?0:-1}" aria-label="${escape(p.name)} — ${t('선택','Select')}"><span class="cover-image">${projectImage(p)}</span></button>`;
    }).join('');
  }
  function card(p, play = false) {
    const itch = p.links.find(l=>l.href.includes('itch.io'));
    const opening = play ? `<a class="project-card" href="${escape(itch.href)}" target="_blank" rel="noopener noreferrer">` : `<button class="project-card" data-detail="${p.id}">`;
    return `${opening}${projectImage(p)}<span class="project-card-body"><strong>${escape(p.name)}${play?' ↗':''}</strong><small>${play?t('itch.io에서 플레이 · 새 탭','Play on itch.io · New tab'):escape(p.tags.slice(0,2).join(' · ') || category(p))}</small></span>${play?'</a>':'</button>'}`;
  }
  function renderGrid() {
    const query = $('#search').value.toLowerCase().trim();
    const visible = projects.filter(p => (filter==='all'||p.category===filter) && `${p.name} ${p.tags.join(' ')} ${category(p)}`.toLowerCase().includes(query));
    $('#project-grid').innerHTML = visible.length ? visible.map(p=>card(p)).join('') : `<p class="empty-state">${t('일치하는 프로젝트가 없습니다. 다른 검색어를 입력해 보세요.','No projects found. Try another search.')}</p>`;
    $('#result-count').textContent = t(`${visible.length}개의 프로젝트`,`${visible.length} projects`);
    $('#filters').innerHTML = [['all','전체','All'],['core','실무 · 협업','Professional'],['ax','개인 제작','Solo projects'],['study','연구 · 프로토타입','Research']].map(([id,ko,en])=>`<button data-filter="${id}" aria-pressed="${filter===id}">${t(ko,en)}</button>`).join('');
  }
  function renderDetail() {
    const p=projects.find(p=>p.id===detailId);
    if(!p) return;
    $('#project-detail').innerHTML=`${p.image?`<img class="detail-image" src="${escape(p.image)}" alt="${escape(p.name)}">`:''}<div class="detail-body"><p class="eyebrow">${category(p)}</p><h2 id="detail-title">${escape(p.name)}</h2><div class="detail-tags">${p.tags.map(tag=>`<span>${escape(tag)}</span>`).join('')}</div><h3>${t('프로젝트와 내가 만든 부분','The project & my contribution')}</h3>${p.details.length?`<ul>${p.details.map(d=>`<li>${escape(localized(d))}</li>`).join('')}</ul>`:`<p>${escape(localized(p.summary))}</p>`}<div class="detail-links">${p.links.map(l=>`<a href="${escape(l.href)}"${externalAttributes(l.href)}>${escape(localized(l.label))} ↗</a>`).join('')}</div></div>`;
  }
  function openDetail(id) {
    clearTimeout(hoverTimer); playTone(true);
    detailId=id;renderDetail();$('#project-dialog').showModal();$('#project-dialog').scrollTop=0;
  }
  function renderNotes() {
    $('#notes-list').innerHTML=projects.filter(p=>p.links.some(l=>l.href.endsWith('.html'))).map((p,i)=>{
      const link=p.links.find(l=>l.href.endsWith('.html'));
      return `<a class="note-link" href="${escape(link.href)}"><span class="note-number">${String(i+1).padStart(2,'0')}</span><span><strong>${escape(p.name)}</strong><small>${escape(p.tags.slice(0,3).join(' / '))} · ${t('아키텍처 문서','Architecture · Korean')}</small></span><span class="note-arrow">↗</span></a>`;
    }).join('');
  }
  function renderExperience() {
    const entries=[
      ['2026.01 — '+t('현재','Present'),'SUPER SEED','Game Programmer','Unity 모바일 게임의 프로젝트 셋업부터 출시 및 라이브 서비스까지 담당했습니다.','Unity mobile games, from project setup through release and live operations.'],
      ['2023.04 — 2023.11','MetaZ','Game Programmer','클라이언트–서버 통신 기반의 인게임·아웃게임 UI와 모바일 게임 개발에 기여했습니다.','Mobile game development and in-game / out-of-game UI integrated with client-server communication.'],
      ['2022.06 — 2023.01','TubaN','Technical Director','UE5 애니메이션 제작 파이프라인과 자동화 에디터 도구·플러그인을 개발했습니다.','UE5 animation pipelines, editor automation tools, and plugins.'],
      ['2019.05 — 2020.06','JIH','Director','UE4 멀티플레이어 생존 게임의 상호작용 시스템과 게임플레이를 개발했습니다.','Interaction systems and gameplay for a UE4 multiplayer survival game.']
    ];
    $('#experience').innerHTML=entries.map(([date,name,role,ko,en])=>`<article class="timeline-row"><time>${date}</time><div><h3>${name}<span>${role}</span></h3><p>${t(ko,en)}</p></div></article>`).join('');
  }
  function renderLibraryToggle() {
    $('#toggle-library').setAttribute('aria-label',t('전체 18개 프로젝트 라이브러리 열기','Open library of all 18 projects'));
  }
  function renderLanguage() {
    document.documentElement.lang=lang;
    document.title=t('INHO PLAY — 장인호 · Game & Content Creator','INHO PLAY — Jang Inho · Game & Content Creator');
    document.querySelectorAll('[data-ko][data-en]').forEach(el=>{el.textContent=el.dataset[lang];});
    $('#language').textContent=lang==='ko'?'EN':'KR';
    $('#language').setAttribute('aria-label',t('Switch to English','한국어로 전환'));
    $('#search').placeholder=t('프로젝트 검색','Search projects');
    updateSoundButton();
    document.querySelectorAll('a[href^="resume.html"]').forEach(a=>a.href=`resume.html?lang=${lang}`);
    renderNavigation();renderStrip();renderFeatured();renderGrid();renderNotes();renderExperience();renderLibraryToggle();
    $('#play-projects').innerHTML=projects.filter(p=>p.links.some(l=>l.href.includes('itch.io'))).map(p=>card(p,true)).join('');
    if(detailId)renderDetail();
    window.orbitGame.setLanguage(lang);
  }
  document.addEventListener('click',event=>{
    const view=event.target.closest('[data-view]'); if(view)setView(view.dataset.view);
    const cover=event.target.closest('[data-select]');if(cover)selectProject(cover.dataset.select);
    const detail=event.target.closest('[data-detail]');if(detail)openDetail(detail.dataset.detail);
    const filterButton=event.target.closest('[data-filter]');if(filterButton){filter=filterButton.dataset.filter;renderGrid();$(`[data-filter="${filter}"]`).focus({preventScroll:true});}
    const close=event.target.closest('[data-close]');if(close)$(`#${close.dataset.close}`).close();
  });
  document.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]')) return;
    if(event.key==='Escape' && currentView!=='library'){event.preventDefault();setView('library');return;}
    if(currentView!=='library'||event.altKey||event.metaKey||event.ctrlKey)return;
    const button=event.target.closest('[data-select]');
    if(!button && event.target.closest('button,a,input,textarea'))return;
    if(event.key==='Enter'){event.preventDefault();openDetail(button?.dataset.select || selected);return;}
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();let next=selectedIds.indexOf(button?.dataset.select || selected);
    next=event.key==='Home'?0:event.key==='End'?selectedIds.length-1:(next+(event.key==='ArrowRight'?1:-1)+selectedIds.length)%selectedIds.length;
    selectProject(selectedIds[next],true);
  });
  $('#featured-strip').addEventListener('focusin',event=>{const button=event.target.closest('[data-select]');if(button)selectProject(button.dataset.select);});
  $('#featured-strip').addEventListener('pointerover',event=>{
    if(event.pointerType!=='mouse')return;
    const button=event.target.closest('[data-select]');if(!button||button.contains(event.relatedTarget))return;
    clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>selectProject(button.dataset.select),170);
  });
  $('#featured-strip').addEventListener('pointerout',event=>{const button=event.target.closest('[data-select]');if(button&&!button.contains(event.relatedTarget))clearTimeout(hoverTimer);});
  $('#featured-strip').addEventListener('dblclick',event=>{const button=event.target.closest('[data-select]');if(button)openDetail(button.dataset.select);});
  let pointerFrame=0;
  document.addEventListener('pointermove',event=>{
    if(event.pointerType!=='mouse'||reducedMotion.matches||currentView!=='library'||document.querySelector('dialog[open]'))return;
    cancelAnimationFrame(pointerFrame);
    pointerFrame=requestAnimationFrame(()=>{
      document.documentElement.style.setProperty('--motion-x',`${(event.clientX/innerWidth-.5)*-16}px`);
      document.documentElement.style.setProperty('--motion-y',`${(event.clientY/innerHeight-.5)*-10}px`);
    });
  });
  $('#sound-toggle').addEventListener('click',()=>{soundEnabled=!soundEnabled;updateSoundButton();if(soundEnabled)playTone(true);});
  $('#fullscreen').hidden=!document.fullscreenEnabled;
  $('#fullscreen').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch{$('#console-status').textContent=t('이 브라우저에서는 전체 화면을 사용할 수 없습니다.','Fullscreen is unavailable in this browser.');}
  });
  document.addEventListener('fullscreenchange',()=>$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?t('전체 화면 나가기','Exit fullscreen'):t('전체 화면','Enter fullscreen')));
  $('#search').addEventListener('input',renderGrid);
  $('#toggle-library').addEventListener('click',()=>{clearTimeout(hoverTimer);playTone(true);$('#full-library').showModal();});
  $('#language').addEventListener('click',()=>{lang=lang==='ko'?'en':'ko';try{localStorage.setItem('portfolio-language',lang);}catch{}const url=new URL(location.href);url.searchParams.set('lang',lang);history.replaceState(null,'',url);renderLanguage();});
  window.addEventListener('popstate',()=>setView(views.some(v=>`#${v[0]}`===location.hash)?location.hash.slice(1):'library',false));
  window.addEventListener('hashchange',()=>setView(views.some(v=>`#${v[0]}`===location.hash)?location.hash.slice(1):'library',false));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}));
  function updateClock(){const now=new Date();$('#clock').textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});$('#clock').dateTime=now.toISOString();}
  updateClock();setInterval(updateClock,30000);
  renderLanguage();setView(currentView,false);
})();
