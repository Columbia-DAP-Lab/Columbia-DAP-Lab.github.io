// Data figures. Numbers come from the paper (Tables 1 and 6) and the RCC demo trace; nothing here is simulated.
(()=>{
const NS='http://www.w3.org/2000/svg';
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const CB='#0f766e',TX='#995319',GRID='#e6e9ea';
function svgEl(tag,attrs={},parent){const n=document.createElementNS(NS,tag);for(const k in attrs)n.setAttribute(k,attrs[k]);if(parent)parent.appendChild(n);return n}
function svgText(parent,str,attrs){const t=svgEl('text',attrs,parent);t.textContent=str;return t}
function onceVisible(node,fn,threshold=.45){if(!('IntersectionObserver' in window)){fn();return}const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){io.disconnect();fn()}},{threshold});io.observe(node)}
function starPath(cx,cy,r){let d='';for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.45:r;d+=(i?'L':'M')+(cx+rr*Math.cos(a)).toFixed(2)+' '+(cy+rr*Math.sin(a)).toFixed(2)}return d+'Z'}
function debounce(fn,ms=120){let id;return()=>{clearTimeout(id);id=setTimeout(fn,ms)}}

/* ---------- Figure 1: same-size text → CacheBack, per model family (paper Table 1) ---------- */
const HERO=[
 {id:'qwen',name:'Qwen3-8B',ratio:'4×',text:[612,40.7],cb:[192,55.3]},
 {id:'ministral',name:'Ministral 3 14B',ratio:'32×',text:[1537,38.7],cb:[193,59.3]},
 {id:'gemma',name:'Gemma 4 12B',ratio:'4×',text:[603,52.0],cb:[201,59.3]},
 {id:'nemotron',name:'Nemotron Nano 2 12B',ratio:'8×',text:[131,38.7],cb:[102,50.0]},
];
const heroHost=document.getElementById('hero-chart');
if(heroHost){
 let played=reduceMotion,active=null;
 function renderHero(animate){
  const W=Math.max(300,Math.round(heroHost.clientWidth)),narrow=W<560;
  const H=Math.round(Math.min(380,Math.max(260,W*.56)));
  const m={l:44,r:narrow?10:18,t:16,b:44},x0=0,x1=1650,y0=34,y1=62;
  const sx=v=>m.l+(v-x0)/(x1-x0)*(W-m.l-m.r),sy=v=>H-m.b-(v-y0)/(y1-y0)*(H-m.t-m.b);
  heroHost.textContent='';
  const svg=svgEl('svg',{viewBox:`0 0 ${W} ${H}`,width:W,height:H,role:'img','aria-label':'For each of four model families, an arrow runs from same-size text communication to CacheBack: every arrow points up and to the left, meaning higher strict accuracy and lower median completion time on FanOutQA.'},heroHost);
  const defs=svgEl('defs',{},svg);
  const axis=svgEl('g',{class:'hero-axis'},svg);
  for(const v of [40,45,50,55,60]){svgEl('line',{x1:m.l,x2:W-m.r,y1:sy(v),y2:sy(v),stroke:GRID},axis);svgText(axis,v,{x:m.l-9,y:sy(v)+4,'text-anchor':'end'})}
  for(const v of [0,400,800,1200,1600]){svgText(axis,v,{x:sx(v),y:H-m.b+17,'text-anchor':'middle'})}
  svgEl('line',{x1:m.l,x2:W-m.r,y1:H-m.b,y2:H-m.b,stroke:'#c9d0d3'},axis);
  svgText(axis,'Median task-completion time (seconds)',{x:m.l+(W-m.l-m.r)/2,y:H-6,'text-anchor':'middle',class:'axis-title'});
  svgText(axis,'Strict accuracy (%)',{x:-(m.t+(H-m.t-m.b)/2),y:12,transform:'rotate(-90)','text-anchor':'middle',class:'axis-title'});
  const place={qwen:{dx:11,dy:4,a:'start'},ministral:{dx:-2,dy:22,a:'end'},gemma:{dx:9,dy:21,a:'start'},nemotron:narrow?{dx:-2,dy:22,a:'start'}:{dx:11,dy:4,a:'start'}};
  const labels=[],segments=[],marks=[];
  HERO.forEach((p,i)=>{
   const g=svgEl('g',{class:'hero-pair'+(active===p.id?' active':''),'data-id':p.id},svg);
   const [tx,ty]=[sx(p.text[0]),sy(p.text[1])],[cx,cy]=[sx(p.cb[0]),sy(p.cb[1])];
   const grad=svgEl('linearGradient',{id:'hg-'+p.id,gradientUnits:'userSpaceOnUse',x1:tx,y1:ty,x2:cx,y2:cy},defs);
   svgEl('stop',{offset:'0','stop-color':TX,'stop-opacity':.55},grad);svgEl('stop',{offset:'1','stop-color':CB},grad);
   const len=Math.hypot(cx-tx,cy-ty),ux=(cx-tx)/len,uy=(cy-ty)/len,end=[cx-ux*13,cy-uy*13];
   const trail=svgEl('path',{class:'trail',d:`M${tx} ${ty}L${end[0]} ${end[1]}`,stroke:`url(#hg-${p.id})`},g);
   const head=svgEl('path',{d:`M${end[0]-ux*8-uy*5} ${end[1]-uy*8+ux*5}L${end[0]} ${end[1]}L${end[0]-ux*8+uy*5} ${end[1]-uy*8-ux*5}`,fill:'none',stroke:CB,'stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round'},g);
   svgEl('circle',{cx:tx,cy:ty,r:7.5,fill:'#fff',stroke:TX,'stroke-width':2.4},g);
   const star=svgEl('path',{class:'hero-star',d:starPath(cx,cy,12),fill:CB,stroke:'#fff','stroke-width':1.2},g);
   labels.push({node:svgText(g,p.name,{class:'label'}),tx,ty,pref:place[p.id]});segments.push([tx,ty,end[0],end[1]]);marks.push([tx,ty,7],[cx,cy,12]);
   svgEl('title',{},g).textContent=`${p.name}: ${p.text[1]}% in ${p.text[0]} s with same-size text; ${p.cb[1]}% in ${p.cb[0]} s with CacheBack ${p.ratio}`;
   if(animate){
    const delay=180+i*260,L=trail.getTotalLength();
    trail.style.strokeDasharray=L;trail.style.strokeDashoffset=L;head.style.opacity=0;star.style.opacity=0;star.style.transform='scale(.2)';
    trail.getBoundingClientRect();
    trail.style.transition=`stroke-dashoffset 1s cubic-bezier(.45,0,.2,1) ${delay}ms`;trail.style.strokeDashoffset=0;
    head.style.transition=`opacity .2s ${delay+900}ms`;head.style.opacity=1;
    star.style.transition=`opacity .25s ${delay+950}ms, transform .45s cubic-bezier(.3,1.6,.5,1) ${delay+950}ms`;star.style.opacity=1;star.style.transform='scale(1)';
   }
  });
  // Place each label at the first candidate that clears every arrow, marker and earlier label.
  const hits=(r,[x1,y1,x2,y2])=>{let t0=0,t1=1;const dx=x2-x1,dy=y2-y1;for(const [p,q] of [[-dx,x1-r.x],[dx,r.x+r.width-x1],[-dy,y1-r.y],[dy,r.y+r.height-y1]]){if(p===0){if(q<0)return false}else{const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t}else{if(t<t0)return false;if(t<t1)t1=t}}}return true};
  const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
  const CANDIDATES=[{dx:11,dy:4,a:'start'},{dx:9,dy:21,a:'start'},{dx:9,dy:-13,a:'start'},{dx:-11,dy:4,a:'end'},{dx:-6,dy:21,a:'end'},{dx:-6,dy:-13,a:'end'},{dx:0,dy:24,a:'middle'}];
  const placed=[];
  for(const L of labels){
   let chosen=null;
   for(const c of [L.pref,...CANDIDATES]){
    L.node.setAttribute('x',L.tx+c.dx);L.node.setAttribute('y',L.ty+c.dy);L.node.setAttribute('text-anchor',c.a);
    const b=L.node.getBBox(),r={x:b.x-3,y:b.y-2,width:b.width+6,height:b.height+4};
    const inside=r.x>=m.l&&r.x+r.width<=W-2&&r.y>=0&&r.y+r.height<=H-m.b+2;
    const clear=inside&&!segments.some(sg=>hits(r,sg))&&!marks.some(([mx,my,mr])=>overlap(r,{x:mx-mr,y:my-mr,width:2*mr,height:2*mr}))&&!placed.some(pb=>overlap(r,pb));
    if(clear){chosen=r;break}
   }
   if(!chosen){const c=L.pref;L.node.setAttribute('x',L.tx+c.dx);L.node.setAttribute('y',L.ty+c.dy);L.node.setAttribute('text-anchor',c.a);const b=L.node.getBBox();chosen={x:b.x,y:b.y,width:b.width,height:b.height}}
   placed.push(chosen);
  }
  const top=HERO[2];svgText(svg,'CacheBack',{x:sx(top.cb[0])+16,y:sy(top.cb[1])-13,class:'hero-cb-note'});
 }
 function setActive(id){active=id;heroHost.toggleAttribute('data-active',!!id);heroHost.querySelectorAll('.hero-pair').forEach(g=>g.classList.toggle('active',g.dataset.id===id));document.querySelectorAll('.hero-table tbody tr').forEach(r=>r.classList.toggle('active',r.dataset.id===id))}
 renderHero(false);
 if(!played){heroHost.querySelectorAll('.hero-pair .trail,.hero-pair path:not(.trail),.hero-star').forEach(n=>n.style.opacity=0);onceVisible(heroHost,()=>{played=true;renderHero(true)},.35)}
 window.addEventListener('resize',debounce(()=>{if(played)renderHero(false)}));
 document.querySelectorAll('.hero-table tbody tr').forEach(r=>{r.tabIndex=0;r.addEventListener('mouseenter',()=>setActive(r.dataset.id));r.addEventListener('focus',()=>setActive(r.dataset.id));r.addEventListener('mouseleave',()=>setActive(null));r.addEventListener('blur',()=>setActive(null))});
 const replay=document.getElementById('hero-replay');if(replay)replay.addEventListener('click',()=>{played=true;renderHero(true)});
}

/* ---------- Figure 3: same documents, different question (recorded RCC demo trace) ---------- */
const trace=window.CACHEBACK_QUESTION_TRACE,qHost=document.getElementById('question-explorer');
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

/* ---------- Figure 6: compression explorer (Qwen3-8B, FanOutQA; paper Table 6 / Figure 5) ---------- */
const QWEN=[{r:2,acc:45.3,t:284,dominated:true},{r:4,acc:55.3,t:192},{r:8,acc:50.0,t:156},{r:16,acc:46.0,t:131},{r:32,acc:45.3,t:121},{r:64,acc:30.0,t:108},{r:128,acc:22.7,t:106}];
const TEXT_SAME={acc:40.7,t:612};
const cmp=document.getElementById('compression-explorer');
if(cmp){
 const range=cmp.querySelector('.compression-range'),out=cmp.querySelector('output'),strip=cmp.querySelector('.compression-strip'),chartHost=cmp.querySelector('#compression-chart');
 const N=512;
 // Deterministic, clustered illustrative scores: CacheBack ranks spans, so kept cells bunch together.
 let seed=7;const rand=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296};
 const score=new Float64Array(N);
 for(let i=0;i<N;i++)score[i]=rand()*.35;
 for(let k=0;k<26;k++){const c=Math.floor(rand()*N),w=2+rand()*7,h=.4+rand()*1.2;for(let i=Math.max(0,c-20);i<Math.min(N,c+20);i++)score[i]+=h*Math.exp(-((i-c)**2)/(2*w*w))}
 score[0]=99;
 const order=[...score.keys()].sort((a,b)=>score[b]-score[a]),rank=new Int32Array(N);order.forEach((cell,r)=>rank[cell]=r);
 const cells=[];for(let i=0;i<N;i++){const c=document.createElement('i');if(i===0)c.className='first';strip.append(c);cells.push(c)}
 // Mini chart
 const W=380,H=250,m={l:40,r:14,t:14,b:38};
 const sx=v=>m.l+v/650*(W-m.l-m.r),sy=v=>H-m.b-v/60*(H-m.t-m.b);
 const svg=svgEl('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Strict accuracy against median completion time for each CacheBack compression ratio, with same-size text for comparison.'},chartHost);
 for(const v of [0,20,40,60]){svgEl('line',{x1:m.l,x2:W-m.r,y1:sy(v),y2:sy(v),stroke:GRID},svg);svgText(svg,v,{x:m.l-7,y:sy(v)+3.5,'text-anchor':'end'})}
 for(const v of [0,200,400,600]){svgText(svg,v,{x:sx(v),y:H-m.b+15,'text-anchor':'middle'})}
 svgText(svg,'Median completion time (s)',{x:m.l+(W-m.l-m.r)/2,y:H-5,'text-anchor':'middle'});
 svgText(svg,'Strict accuracy (%)',{x:-(m.t+(H-m.t-m.b)/2),y:11,transform:'rotate(-90)','text-anchor':'middle'});
 const frontier=QWEN.filter(p=>!p.dominated).sort((a,b)=>a.t-b.t);
 svgEl('path',{d:frontier.map((p,i)=>(i?'L':'M')+sx(p.t)+' '+sy(p.acc)).join(''),fill:'none',stroke:'#9fd3cb','stroke-width':2},svg);
 const dots=QWEN.map(p=>svgEl('circle',{cx:sx(p.t),cy:sy(p.acc),r:3.5,fill:CB,'fill-opacity':p.dominated?.3:.45},svg));
 const tri=svgEl('path',{d:`M${sx(TEXT_SAME.t)} ${sy(TEXT_SAME.acc)-6}l5.5 9.5h-11z`,fill:TX},svg);
 svgText(svg,'8B text',{x:sx(TEXT_SAME.t),y:sy(TEXT_SAME.acc)-11,'text-anchor':'middle',class:'lbl',fill:TX,style:'fill:'+TX});
 const marker=svgEl('g',{class:'cmp-marker'},svg);
 svgEl('circle',{r:10,fill:CB,'fill-opacity':.15},marker);svgEl('circle',{r:5.5,fill:CB,stroke:'#fff','stroke-width':1.5},marker);
 const mlabel=svgText(marker,'',{x:0,y:-14,'text-anchor':'middle',class:'lbl',style:'fill:'+CB+';font-weight:600'});
 const ro={sent:cmp.querySelector('[data-readout=sent]'),acc:cmp.querySelector('[data-readout=acc]'),time:cmp.querySelector('[data-readout=time]')},note=cmp.querySelector('.compression-note');
 function update(){
  const p=QWEN[+range.value],keep=N/p.r;
  out.textContent=p.r+'×';range.setAttribute('aria-valuetext',`${p.r} times compression`);
  cells.forEach((c,i)=>c.classList.toggle('kept',rank[i]<keep));
  marker.style.transform=`translate(${sx(p.t)}px,${sy(p.acc)}px)`;mlabel.textContent=p.r+'×';
  dots.forEach((d,i)=>d.setAttribute('r',i===+range.value?0:3.5));
  const pct=100/p.r,tidy=v=>String(+v.toFixed(2));
  ro.sent.innerHTML=`<b>${tidy(pct)}%</b><span>of sender positions sent · ${tidy(100-pct)}% removed</span>`;
  ro.acc.innerHTML=`<b>${p.acc.toFixed(1)}%</b><span>strict accuracy · <em>same-size text ${TEXT_SAME.acc}%</em></span>`;
  ro.time.innerHTML=`<b>${p.t} s</b><span>median completion time · <em>text ${TEXT_SAME.t} s</em></span>`;
  note.textContent=p.dominated?'At 2×, the larger message costs time: 4× is both faster and more accurate.'
   :p.acc<TEXT_SAME.acc?`At ${p.r}×, accuracy falls below same-size text, though tasks still finish ${(TEXT_SAME.t/p.t).toFixed(1)}× faster.`
   :p.r===16?'The title’s 94%: still more accurate than same-size text, and 4.7× faster.'
   :p.r===4?'The headline Qwen setting: +14.7 points of strict accuracy, 3.2× faster.'
   :`More accurate than same-size text, and ${(TEXT_SAME.t/p.t).toFixed(1)}× faster.`;
 }
 range.addEventListener('input',update);update();
}

})();
