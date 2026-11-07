(() => {
  if (window.self !== window.top) return;
  const toast = document.createElement('aside');
  toast.className = 'session-toast';
  toast.hidden = true;
  toast.setAttribute('role', 'status');
  const text = document.createElement('div');
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = '×';
  const badge = document.createElement('span'); badge.className = 'toast-avatar'; badge.textContent = 'in'; badge.setAttribute('aria-hidden','true');
  toast.append(badge, text, close); document.body.append(toast);
  function translate() {
    const en = document.documentElement.lang === 'en';
    text.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = en ? 'You’re connected to INHO PLAY.' : 'INHO PLAY에 접속했습니다.';
    const note = document.createElement('p');
    note.textContent = en ? 'Welcome. Explore the worlds I’ve made.' : '환영합니다. 제가 만든 세계를 둘러보세요.';
    text.append(title, note);
    close.setAttribute('aria-label', en ? 'Dismiss welcome message' : '접속 알림 닫기');
  }
  translate(); new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  close.addEventListener('click', () => { toast.hidden = true; });
  let welcomed = false;
  try { welcomed = sessionStorage.getItem('inho-welcomed') === 'yes'; sessionStorage.setItem('inho-welcomed','yes'); } catch {}
  if (!welcomed) {
    setTimeout(() => { toast.hidden = false; }, 600);
    setTimeout(() => { toast.hidden = true; }, 6500);
  }
})();
