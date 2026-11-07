(() => {
  const content=document.querySelector('.doc-content');
  const embedded=document.documentElement.dataset.embedded==='true';
  const path=location.pathname.split('/').slice(-2).join('/');
  const sections=[...content.querySelectorAll('section > h2')];
  const toc=document.createElement('nav');toc.className='document-toc';toc.setAttribute('aria-label','문서 목차');
  sections.forEach((heading,index)=>{
    if(!heading.id)heading.id=`section-${index+1}`;
    const a=document.createElement('a');a.href=`#${heading.id}`;a.textContent=heading.textContent.trim();toc.append(a);
    a.addEventListener('click',event=>{
      if(!embedded)return;
      event.preventDefault();
      parent.postMessage({type:'portfolio:document-section',path,top:heading.getBoundingClientRect().top+scrollY},'*');
    });
  });
  const header=content.querySelector('header');header.after(toc);
  if(embedded){
    let frame=0,lastHeight=0;
    const report=()=>{
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        const height=Math.ceil(content.getBoundingClientRect().height)+24;
        if(height!==lastHeight){lastHeight=height;parent.postMessage({type:'portfolio:document-size',path,height},'*');}
      });
    };
    new ResizeObserver(report).observe(content);
    window.addEventListener('load',report);document.fonts.ready.then(report);report();
    document.addEventListener('keydown',event=>{if(event.key==='Escape')parent.postMessage({type:'portfolio:home',path},'*');});
  }
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting)toc.querySelectorAll('a').forEach(a=>a.setAttribute('aria-current',String(a.hash===`#${entry.target.id}`)));});
  },{rootMargin:'-10% 0px -65% 0px'});
  sections.forEach(section=>observer.observe(section));
})();
