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
  const views = [['library','작품','Collection'],['dashboard','활동','Activity'],['notes','제작 기록','Projects'],['profile','프로필','Profile']];
  const initialRoute = location.hash.slice(1).split('/');
  let currentView = initialRoute[0] === 'playroom' ? 'dashboard' : views.some(v=>v[0]===initialRoute[0]) ? initialRoute[0] : 'library';
  let selected = initialRoute[0] === 'library' && projects.some(p=>p.id===initialRoute[1]) ? initialRoute[1] : 'p0-0';
  let exploring = initialRoute[0] === 'library' && projects.some(p=>p.id===initialRoute[1]);
  let filter = 'all';
  let readerId = projects.some(p=>p.id===initialRoute[1]) ? initialRoute[1] : 'p1-0';
  let renderedDocument = '';
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
    if (!project.image) return;
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
    if (selected !== id) {
      selected = id; renderFeatured(); playTone();
      if (exploring && currentView==='library') history.replaceState(null,'',`#library/${id}`);
    }
    const button = $(`[data-select="${id}"]`);
    if (focus && button) {
      button.focus({preventScroll:true});
      const rail = $('#featured-strip');
      const left = button.offsetLeft - rail.offsetLeft;
      rail.scrollTo({left:Math.max(0,left - 8), behavior:reducedMotion.matches ? 'instant' : 'smooth'});
    }
  }
  const selectedIds = ['p0-0', 'p1-0', 'p1-1', 'p0-1', 'p0-2', 'p0-3'];
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
    if (id === 'library' && navigate) { exploring=false;renderFeatured(); }
    currentView = id;
    document.body.dataset.view = id;
    document.body.classList.toggle('is-exploring',id === 'library' && exploring);
    $('.scene').classList.toggle('scene-interior',id !== 'library');
    clearTimeout(hoverTimer);
    document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== `view-${id}`; });
    renderNavigation();
    if (id === 'notes') renderNotes();
    if (navigate) {
      playTone(true);
      history.pushState(null,'',id === 'notes' ? `#notes/${readerId}` : `#${id}`);
      window.scrollTo({top:0,behavior:'instant'});
      $('#main').focus({preventScroll:true});
    }
  }
  function renderFeatured() {
    const p = projects.find(p => p.id === selected);
    const e = editorial[selected] || {title:p.name,kind:category(p),subtitle:[p.summary.ko || p.details[0]?.ko || '',p.summary.en || p.details[0]?.en || '']};
    updateBackground(p);
    document.body.classList.toggle('is-exploring',currentView === 'library' && exploring);
    const externalLinks=p.links.filter(link=>!link.href.endsWith('.html'));
    $('#featured').innerHTML = `<div class="featured-content"><p class="feature-label">${escape(e.kind)}</p><h2>${escape(e.title)}</h2><p class="featured-description">${escape(t(...e.subtitle))}</p><div class="featured-tags">${p.tags.map(tagMarkup).join('')}</div><div class="featured-actions"><button class="primary-button" ${exploring?'data-close-explore':`data-detail="${p.id}"`} aria-expanded="${exploring}" aria-controls="home-info">${exploring?t('설명 닫기','Close details'):t('작품 살펴보기','Explore project')} <span aria-hidden="true">${exploring?'−':'+'}</span></button>${!exploring&&p.links.find(l=>l.href.includes('itch.io'))?`<a class="secondary-button" href="${escape(p.links.find(l=>l.href.includes('itch.io')).href)}" target="_blank" rel="noopener noreferrer">${t('itch.io에서 플레이 ↗','Play on itch.io ↗')}</a>`:''}</div></div><section id="home-info" class="home-info" aria-labelledby="home-info-title" tabindex="-1" ${exploring?'':'hidden'}><div class="home-info-heading"><p class="eyebrow">${escape(category(p))}</p><button class="close-button" data-close-explore aria-label="${t('설명 닫기','Close details')}">×</button></div><h3 id="home-info-title">${t('이 작품에서 만든 것','What I built')}</h3>${p.period?`<p class="home-info-period">${escape(localized(p.period))}</p>`:''}${p.details.length?`<ul>${p.details.map(item=>`<li>${escape(localized(item))}</li>`).join('')}</ul>`:`<p class="home-info-summary">${escape(localized(p.summary))}</p>`}<div class="home-info-links">${externalLinks.map(link=>`<a href="${escape(link.href)}"${externalAttributes(link.href)}>${escape(localized(link.label))} ↗</a>`).join('')}${p.links.some(link=>link.href.endsWith('.html'))?`<button data-archive="${p.id}">${t('제작 기록에서 자세히 읽기','Read the architecture notes')} ↗</button>`:''}</div></section>`;
    $('#selected-name').textContent=p.name;
    $('#console-status').textContent=t(`${p.name} 선택됨`,`${p.name} selected`);
    document.querySelectorAll('.cover-button').forEach(button => {
      const active=button.dataset.select===selected;
      button.setAttribute('aria-pressed', String(active));
      button.tabIndex=active || (!selectedIds.includes(selected) && button.dataset.select===selectedIds[0])?0:-1;
    });
  }
  function renderStrip() {
    $('#featured-strip').innerHTML = selectedIds.map((id,i)=>{
      const p=projects.find(p=>p.id===id);
      return `<button class="cover-button" data-select="${id}" aria-pressed="${id===selected}" tabindex="${id===selected?0:-1}" aria-label="${escape(p.name)} — ${p.startedAt.slice(0,7)} — ${t('선택','Select')}" title="${escape(p.name)} · ${p.startedAt.slice(0,7)}"><span class="cover-image">${projectImage(p)}</span></button>`;
    }).join('');
  }
  function tagMarkup(tag) {
    return `<span${tag==='Game Jam'?' class="tag-jam"':''}>${escape(tag)}</span>`;
  }
  function card(p) {
    return `<button class="project-card" data-detail="${p.id}">${projectImage(p)}<span class="project-card-body"><strong>${escape(p.name)}</strong><small>${p.tags.length?p.tags.slice(0,2).map(tagMarkup).join(' · '):escape(category(p))}</small></span></button>`;
  }
  function renderGrid() {
    const query = $('#search').value.toLowerCase().trim();
    const visible = projects.filter(p => (filter==='all'||p.category===filter) && `${p.name} ${p.tags.join(' ')} ${category(p)}`.toLowerCase().includes(query));
    $('#project-grid').innerHTML = visible.length ? visible.map(p=>card(p)).join('') : `<p class="empty-state">${t('일치하는 프로젝트가 없습니다. 다른 검색어를 입력해 보세요.','No projects found. Try another search.')}</p>`;
    $('#result-count').textContent = t(`${visible.length}개의 프로젝트`,`${visible.length} projects`);
    $('#filters').innerHTML = [['all','전체','All'],['core','실무 · 협업','Professional'],['ax','개인 제작','Solo projects'],['study','연구 · 프로토타입','Research']].map(([id,ko,en])=>`<button data-filter="${id}" aria-pressed="${filter===id}">${t(ko,en)}</button>`).join('');
  }
  function openDetail(id) {
    if (!projects.some(p=>p.id===id)) return;
    clearTimeout(hoverTimer);
    if ($('#full-library').open) $('#full-library').close();
    selected=id;exploring=true;setView('library',false);renderFeatured();
    history.pushState(null,'',`#library/${id}`);playTone(true);
    window.scrollTo({top:0,behavior:'instant'});
    $('#home-info').focus({preventScroll:true});
  }
  function closeDetail() {
    exploring=false;renderFeatured();history.pushState(null,'','#library');
    $('#featured [data-detail]').focus({preventScroll:true});
  }
  function openArchive(id) {
    if (!projects.some(p=>p.id===id)) return;
    clearTimeout(hoverTimer);
    if ($('#full-library').open) $('#full-library').close();
    readerId=id;setView('notes');
  }
  function renderNotes() {
    $('#reader-projects').innerHTML=projects.map(p=>`<button data-reader="${p.id}" ${readerId===p.id?'aria-current="page"':''}><span>${escape(p.name)}</span><small>${category(p)}</small></button>`).join('');
    $('#reader-select').innerHTML=projects.map(p=>`<option value="${p.id}" ${readerId===p.id?'selected':''}>${escape(p.name)}</option>`).join('');
    if (currentView!=='notes') return;
    const p=projects.find(p=>p.id===readerId), key=`${readerId}:${lang}`;
    if (renderedDocument===key) return;
    renderedDocument=key;
    const link=p.links.find(l=>l.href.endsWith('.html'));
    const permalink=$('#document-permalink');permalink.hidden=!link;
    if(link) {
      permalink.href=link.href;
      permalink.textContent=t('문서 단독으로 열기 ↗','Open document separately ↗');
      const frame=document.createElement('iframe');
      frame.className='reader-frame';frame.title=`${p.name} — ${t('아키텍처 문서','Architecture (Korean)')}`;
      frame.src=`${link.href}?embedded=1`;
      frame.dataset.path=link.href;
      frame.style.height='900px';
      $('#reader-content').replaceChildren(frame);
    } else {
      $('#reader-content').innerHTML=`${p.image?`<img class="detail-image" src="${escape(p.image)}" alt="${escape(p.name)}">`:''}<article class="detail-body"><p class="eyebrow">${category(p)}</p><h2 id="detail-title">${escape(p.name)}</h2><div class="detail-tags">${p.tags.map(tagMarkup).join('')}</div><h3>${t('프로젝트와 내가 만든 부분','The project & my contribution')}</h3>${p.details.length?`<ul>${p.details.map(d=>`<li>${escape(localized(d))}</li>`).join('')}</ul>`:`<p>${escape(localized(p.summary))}</p>`}<div class="detail-links">${p.links.map(l=>`<a href="${escape(l.href)}"${externalAttributes(l.href)}>${escape(localized(l.label))} ↗</a>`).join('')}</div></article>`;
    }
  }
  window.addEventListener('message',event=>{
    const frame=$('.reader-frame');
    if (!frame || event.source!==frame.contentWindow || event.data?.path!==frame.dataset.path) return;
    if (event.data.type==='portfolio:document-size' && Number.isFinite(event.data.height)) {
      frame.style.height=`${Math.max(300,Math.min(60000,event.data.height))}px`;
    }
    if (event.data.type==='portfolio:document-section' && Number.isFinite(event.data.top)) {
      window.scrollTo({top:Math.max(0,frame.getBoundingClientRect().top+scrollY+event.data.top-24),behavior:reducedMotion.matches?'instant':'smooth'});
    }
    if (event.data.type==='portfolio:home') setView('library');
  });
  function renderExperience() {
    const entries=[
      ['2026.01 — '+t('현재','Present'),'SUPER SEED','Game Programmer',[
        ['SUPER POP','SUPER POP','Unity 모바일 게임 개발 셋업부터 Android·iOS 출시 및 라이브 서비스까지 담당했습니다.','Handled Unity mobile game development from project setup through Android / iOS release and live operations.']
      ]],
      ['2023.04 — 2023.11','MetaZ','Game Programmer',[
        ['Mega Road','Mega Road','로비·장비·출석·퀘스트·상점·가챠 UI와 인게임 스킬 선택·통계 화면을 개발하고, 서버 응답 데이터 연동 및 AppLovin 광고 흐름을 구현했습니다.','Developed lobby, equipment, attendance, quest, shop and gacha UI, in-game skill selection and statistics screens, server response integration, and AppLovin ad flows.']
      ]],
      ['2022.06 — 2023.01','TubaN','Technical Director',[
        ['Larva Pendant','Larva Pendant','넷플릭스 오리지널용 UE5 애니메이션 제작을 위한 파이프라인 자동화와 에디터 도구·플러그인을 개발했습니다.','Developed pipeline automation, editor tools and plugins for UE5 animation production for a Netflix original.'],
        ['Larva AR','Larva AR','자사 IP를 활용한 VR/AR 모바일 애플리케이션을 개발했습니다.',"Developed VR / AR mobile applications using the company's IP."]
      ]],
      ['2019.05 — 2020.06','JIH','Director',[
        ['White Paradise','White Paradise','리슨 서버 기반 UE4 협동 생존 게임의 상호작용 시스템과 게임플레이를 개발했습니다.','Developed interaction systems and gameplay for a UE4 cooperative survival game using a listen server.']
      ]]
    ];
    $('#experience').innerHTML=entries.map(([date,name,role,projects])=>`<article class="timeline-row"><time>${date}</time><div><h3>${name}<span>${role}</span></h3>${projects.map(([koName,enName,ko,en])=>`<section class="career-project"><h4>${t(koName,enName)}</h4><p>${t(ko,en)}</p></section>`).join('')}</div></article>`).join('');
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
    window.portfolioDashboard.render(lang);
  }
  document.addEventListener('click',event=>{
    const view=event.target.closest('button[data-view]'); if(view)setView(view.dataset.view);
    const cover=event.target.closest('[data-select]');if(cover)selectProject(cover.dataset.select);
    const detail=event.target.closest('[data-detail]');if(detail)openDetail(detail.dataset.detail);
    const reader=event.target.closest('[data-reader]');if(reader)openArchive(reader.dataset.reader);
    const archive=event.target.closest('[data-archive]');if(archive)openArchive(archive.dataset.archive);
    if(event.target.closest('[data-close-explore]'))closeDetail();
    const filterButton=event.target.closest('[data-filter]');if(filterButton){filter=filterButton.dataset.filter;renderGrid();$(`[data-filter="${filter}"]`).focus({preventScroll:true});}
    const close=event.target.closest('[data-close]');if(close)$(`#${close.dataset.close}`).close();
  });
  document.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]')) return;
    if(event.key==='Escape' && currentView==='library' && exploring){event.preventDefault();closeDetail();return;}
    if(event.key==='Escape' && currentView!=='library'){event.preventDefault();setView('library');return;}
    if(event.target.closest('#home-info'))return;
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
  $('#reader-select').addEventListener('change',event=>openArchive(event.target.value));
  $('#toggle-library').addEventListener('click',()=>{clearTimeout(hoverTimer);playTone(true);$('#full-library').showModal();});
  $('#language').addEventListener('click',()=>{lang=lang==='ko'?'en':'ko';try{localStorage.setItem('portfolio-language',lang);}catch{}const url=new URL(location.href);url.searchParams.set('lang',lang);history.replaceState(null,'',url);renderLanguage();});
  function restoreRoute() {
    const [route,projectId]=location.hash.slice(1).split('/');
    const known=projects.some(p=>p.id===projectId);
    if(route==='notes' && known)readerId=projectId;
    if(route==='library' || !views.some(v=>v[0]===route)) {exploring=route==='library' && known;if(exploring)selected=projectId;renderFeatured();}
    setView(route==='playroom'?'dashboard':views.some(v=>v[0]===route)?route:'library',false);
  }
  window.addEventListener('popstate',restoreRoute);
  window.addEventListener('hashchange',restoreRoute);
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}));
  function updateClock(){const now=new Date();$('#clock').textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});$('#clock').dateTime=now.toISOString();}
  updateClock();setInterval(updateClock,30000);
  renderLanguage();setView(currentView,false);
})();
