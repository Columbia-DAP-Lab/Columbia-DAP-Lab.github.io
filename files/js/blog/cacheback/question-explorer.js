(()=>{
/* ---------- Figure 3: same documents, different question (recorded RCC demo trace) ---------- */
const trace=window.CACHEBACK_QUESTION_TRACE,qHost=document.querySelector('.cacheback-article #question-explorer');
if(trace&&qHost){
 const OUTCOMES=[
  {truth:'Harbour Hub, with a passport.',cb:{answer:'Harbour Hub, with a passport.',verdict:['right','Correct'],note:'Sent: “Reference J7 has moved to Harbour Hub” and “Harbour Hub requires a passport”.'},tx:{answer:'“The assigned desk… check the Friday operations notice.”',verdict:['wrong','No desk named']}},
  {truth:'No. Harbour Hub accepts only a passport.',cb:{answer:'No.',verdict:['right','Correct'],note:'This question also sends “A driving licence is not accepted at Harbour Hub”.'},tx:{answer:'Yes.',verdict:['wrong','Wrong']}},
 ];
 const inRanges=(t,rs)=>rs.some(([a,b])=>t>=a&&t<=b),count=rs=>rs.reduce((n,[a,b])=>n+b-a+1,0);
 const tabs=qHost.querySelector('.question-tabs'),docsHost=qHost.querySelector('.question-docs'),outcomeHost=qHost.querySelector('.question-outcome');
 trace.cases.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.dataset.q=i;b.setAttribute('aria-pressed',String(i===0));b.innerHTML=`<span>Question ${i+1}</span>${c.question}`;tabs.append(b)});
 const cards=trace.docs.map((d,s)=>{
  const card=document.createElement('article');card.className='question-doc';
  const excerptIdx=new Set(d.excerpt.map(([i])=>i));
  card.innerHTML=`<header><strong>Sender ${s+1}</strong><span class="doc-count"></span></header><h3>${d.label}</h3><div class="token-map" role="img" aria-label="${d.tokens} positions of ${d.label}; highlighted cells are selected for the message"></div><p class="excerpt-label">Excerpt</p><p class="question-excerpt"></p>`;
  const map=card.querySelector('.token-map'),cells=[];
  for(let t=0;t<d.tokens;t++){const i=document.createElement('i');if(excerptIdx.has(t))i.className='excerpt';map.append(i);cells.push(i)}
  const ex=card.querySelector('.question-excerpt'),toks=d.excerpt.map(([t,str])=>{const sp=document.createElement('span');sp.className='tok';sp.textContent=str;sp.dataset.t=t;ex.append(sp);return sp});
  ex.prepend('… ');ex.append(' …');docsHost.append(card);
  return {d,card,cells,toks,count:card.querySelector('.doc-count')};
 });
 let current=-1;
 function showQuestion(q){
  const prev=current;current=q;
  tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.q===q)));
  for(const {d,cells,toks,count:label} of cards){
   const rs=d.sel[q],old=prev<0?null:d.sel[prev];
   cells.forEach((c,t)=>c.classList.toggle('sel',inRanges(t,rs)));
   toks.forEach(sp=>{const t=+sp.dataset.t,on=inRanges(t,rs);sp.classList.toggle('sel',on);sp.classList.toggle('fresh',!!old&&on&&!inRanges(t,old))});
   label.textContent=`${count(rs)} of ${d.tokens} positions sent`;
  }
  const o=OUTCOMES[q],c=trace.cases[q];
  outcomeHost.innerHTML=`<div class="cb-answer"><div class="outcome-head">CacheBack · ${c.cachebackSeconds.toFixed(1)} s</div><div class="outcome-answer">${o.cb.answer}</div><span class="outcome-verdict verdict-${o.cb.verdict[0]}">${o.cb.verdict[1]}</span></div><div class="tx-answer"><div class="outcome-head">Text · ${c.textSeconds.toFixed(1)} s</div><div class="outcome-answer">${o.tx.answer}</div><span class="outcome-verdict verdict-${o.tx.verdict[0]}">${o.tx.verdict[1]}</span></div>`;
 }
 tabs.addEventListener('click',e=>{const b=e.target.closest('button');if(b)showQuestion(+b.dataset.q)});
 showQuestion(0);
}


})();
