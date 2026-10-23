(()=>{
// Preserve v45's reading indicator without touching the lab navigation.
function progress(){
 const height=document.documentElement.scrollHeight-window.innerHeight;
 document.getElementById('cb-reading-progress').style.width=(height>0?window.scrollY/height*100:0)+'%';
}
window.addEventListener('scroll',progress,{passive:true});
window.addEventListener('resize',progress);
progress();
let benchmark='fanoutqa';
const notes={
 'fanoutqa-qwen':'At 4× compression, Qwen3-8B is more accurate and 3.2× faster than text senders using the same model.',
 'fanoutqa-nemotron':'At 8× compression, Nemotron is more accurate and 1.3× faster than text senders using the same model.',
 'longbench-qwen':'At 4× compression, Qwen3-8B is more accurate and 3.7× faster than text senders using the same model.',
 'longbench-nemotron':'At 8× compression, Nemotron is more accurate and 2.5× faster than text senders using the same model.'
};
function updatePlots(){for(const model of ['qwen','nemotron']){const key=benchmark+'-'+model,plot=document.getElementById('result-plot-'+model);plot.src=(window.PLOT_SRC&&window.PLOT_SRC[key])||'/files/images/blog/cacheback/'+key+'.svg';plot.alt=(benchmark==='fanoutqa'?'FanOutQA':'LongBench v2 Easy')+' '+(model==='qwen'?'Qwen3-8B':'Nemotron Nano 2 12B')+' accuracy and median latency curves for CacheBack and text communication.';document.getElementById('result-insight-'+model).textContent=notes[key]}}
document.querySelectorAll('[data-benchmark]').forEach(button=>button.addEventListener('click',()=>{benchmark=button.dataset.benchmark;document.querySelectorAll('[data-benchmark]').forEach(b=>{const selected=b===button;b.classList.toggle('selected-control',selected);b.setAttribute('aria-pressed',String(selected))});updatePlots()}));


const plotDialog=document.getElementById('plot-dialog');
document.querySelectorAll('[data-expand-model]').forEach(button=>button.addEventListener('click',()=>{const original=document.getElementById('result-plot-'+button.dataset.expandModel),expanded=document.getElementById('dialog-plot');expanded.src=original.src;expanded.alt=original.alt;plotDialog.showModal()}));
document.getElementById('close-plot').addEventListener('click',()=>plotDialog.close());
plotDialog.addEventListener('click',event=>{if(event.target===plotDialog)plotDialog.close()});
// Explicit scrolling also works when the chosen section is already in the URL.
document.querySelectorAll('.cacheback-article a[href^="#"]').forEach(link=>link.addEventListener('click',event=>{const target=document.getElementById(link.getAttribute('href').slice(1));if(!target)return;event.preventDefault();target.scrollIntoView({behavior:target.id==='article'||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});history.replaceState(null,'',link.getAttribute('href'))}));

// Figure 5: score = Q (mean attention) or Q·C², where C = mean(a²) / mean(a)². Position A's weights are adjustable.
const attentionButtons=[...document.querySelectorAll('[data-attention-mode]')];
const aCells=[...document.querySelectorAll('.attention-matrix tbody tr')].map(row=>row.querySelectorAll('td')[0]);
const aSliders=[...document.querySelectorAll('[data-attention-weight]')];
const B_WEIGHTS=[.12,.12,.12,.12],EXAMPLE=[.40,0,0,0],AXIS_MAX=2;
let corrected=false;
function stats(w){const q=w.reduce((x,y)=>x+y,0)/w.length,e=w.reduce((x,y)=>x+y*y,0)/w.length,c=q>0?e/(q*q):1;return {q,c,s:corrected?q*c*c:q}}
const f2=v=>v.toFixed(2),fc=v=>Number.isInteger(+v.toFixed(2))?v.toFixed(0):v.toFixed(2);
function renderAttention(){
 const wa=aSliders.length?aSliders.map(i=>+i.value):EXAMPLE,A=stats(wa),B=stats(B_WEIGHTS);
 aCells.forEach((cell,i)=>{const v=wa[i];cell.textContent=f2(v);cell.className=v===0?'attention-zero':v>=.25?'attention-strong':'attention-even'});
 aSliders.forEach(i=>i.setAttribute('aria-valuetext',f2(+i.value)));
 document.getElementById('attention-rule').textContent=corrected?'Score = Q · C²':'Score = Q';
 document.getElementById('attention-score-a').textContent=f2(A.s);
 document.getElementById('attention-score-b').textContent=f2(B.s);
 document.getElementById('attention-bar-a').style.width=Math.min(100,A.s/AXIS_MAX*100)+'%';
 document.getElementById('attention-bar-b').style.width=Math.min(100,B.s/AXIS_MAX*100)+'%';
 document.querySelector('[data-attention-position="a"] p').textContent=`Q = ${f2(A.q)} · C = ${fc(A.c)}`;
 document.querySelector('[data-attention-position="b"] p').textContent=`Q = ${f2(B.q)} · C = ${fc(B.c)}`;
 const tie=Math.abs(A.s-B.s)<.005,aWins=A.s>B.s;
 document.querySelector('[data-attention-position="a"]').classList.toggle('is-selected',!tie&&aWins);
 document.querySelector('[data-attention-position="b"]').classList.toggle('is-selected',!tie&&!aWins);
 document.getElementById('attention-winner').textContent=tie?'Tied scores':'Higher score: Position '+(aWins?'A':'B');
 document.getElementById('attention-explanation').textContent=corrected
  ?`C = ${fc(A.c)} ${A.c>1.005?'boosts':'leaves'} A’s score ${A.c>1.005?'to':'at'} ${f2(A.q)} × ${fc(A.c)}² = ${f2(A.s)}. B’s equal weights give C = 1, so its score stays ${f2(B.s)}.`
  :`Averaging over four query tokens gives A a score of Q = ${f2(A.q)}. B’s Q = ${f2(B.q)} is ${tie?'the same':aWins?'lower':'higher'}.`;
}
attentionButtons.forEach(button=>button.addEventListener('click',()=>{
 corrected=button.dataset.attentionMode==='cacheback';
 attentionButtons.forEach(b=>{const selected=b===button;b.classList.toggle('selected-control',selected);b.setAttribute('aria-pressed',String(selected))});
 renderAttention();
}));
aSliders.forEach(i=>i.addEventListener('input',renderAttention));
const attentionReset=document.getElementById('attention-reset');
if(attentionReset)attentionReset.addEventListener('click',()=>{aSliders.forEach((i,k)=>i.value=EXAMPLE[k]);renderAttention()});
if(aCells.length)renderAttention();

const copyBibtex=document.getElementById('copy-bibtex');
if(copyBibtex) copyBibtex.addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(document.getElementById('bibtex').textContent);copyBibtex.textContent='Copied'}
 catch{const range=document.createRange();range.selectNodeContents(document.getElementById('bibtex'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);copyBibtex.textContent='Selected · press ⌘C'}
 setTimeout(()=>{copyBibtex.textContent='Copy BibTeX'},2000);
});

// Figure 8: each added position costs text one more sequential decoding step; CacheBack selects it from existing state.
const marginalButton=document.getElementById('add-message-position');
if(marginalButton){
 const figure=marginalButton.closest('figure'),SVGNS='http://www.w3.org/2000/svg',MAX=4;
 const BASE=[1,4,7,10],EXTRA=[2,5,8,11],COLORS={text:'#e8e5df',selected:'#d4c6e8',added:'#f3d6a9'};
 const row=name=>figure.querySelector(`[data-row="${name}"]`);
 function chip(parent,x,y,w,label,fill,isNew){
  const g=document.createElementNS(SVGNS,'g');if(isNew)g.setAttribute('class','chip-new');
  const path=document.createElementNS(SVGNS,'path');
  path.setAttribute('d',`M${x} ${y} Q${x+w/2} ${y-2} ${x+w} ${y} L${x+w+1} ${y+36} Q${x+w/2-2} ${y+38} ${x-2} ${y+35} Z`);
  path.setAttribute('fill',fill);path.setAttribute('stroke',fill);path.setAttribute('stroke-width','1.3');
  const text=document.createElementNS(SVGNS,'text');text.setAttribute('x',x+w/2);text.setAttribute('y',y+23);text.setAttribute('text-anchor','middle');text.setAttribute('class','chip-text');text.textContent=label;
  g.append(path,text);parent.append(g);
 }
 function arrow(parent,x,isNew){const a=document.createElementNS(SVGNS,'path');a.setAttribute('d',`M${x} 136 q8 -2 12 0 l-5 -4 m5 4 l-5 4`);a.setAttribute('class','pencil-line'+(isNew?' chip-new':''));parent.append(a)}
 let added=0;
 function render(){
  const total=4+added;
  // Text sender: tokens decoded one after another, with arrows between them.
  const ts=row('text-sender');ts.textContent='';
  const pitch=Math.min(65,395/total),w=Math.min(42,pitch-20);
  for(let i=0;i<total;i++){const x=25+i*pitch,isNew=i===total-1&&added>0;if(i)arrow(ts,x-pitch+w+4,isNew);chip(ts,x,120,w,String(i+1),i>=4?COLORS.added:COLORS.text,isNew)}
  const tm=row('text-message');tm.textContent='';
  const mp=Math.min(55,395/total),mw=Math.min(42,mp-12);
  for(let i=0;i<total;i++)chip(tm,25+i*mp,248,mw,String(i+1),i>=4?COLORS.added:COLORS.text,i===total-1&&added>0);
  // CacheBack: newly selected positions light up in existing state; the message keeps their original order.
  const extra=EXTRA.slice(0,added),chosen=[...BASE,...extra].sort((x,y)=>x-y);
  figure.querySelectorAll('[data-pos]').forEach(g=>{const pos=+g.dataset.pos;g.querySelector('path').setAttribute('fill',extra.includes(pos)?COLORS.added:BASE.includes(pos)?'#b5a1d2':'#dbdee1')});
  const cm=row('cb-message');cm.textContent='';
  const cp=Math.min(55,395/chosen.length),cw=Math.min(42,cp-12);
  chosen.forEach((pos,i)=>chip(cm,25+i*cp,248,cw,String(pos),extra.includes(pos)?COLORS.added:COLORS.selected,pos===extra[extra.length-1]));
  figure.classList.toggle('has-extra',added>0);
  document.getElementById('text-extra-count').textContent='+'+added;
  document.getElementById('text-extra-label').textContent=added===1?'extra decoding step, in sequence':'extra decoding steps, in sequence';
  marginalButton.innerHTML=added>=MAX?'<span aria-hidden="true">↺</span> Reset':added?'<span aria-hidden="true">＋</span> Add another':'<span aria-hidden="true">＋</span> Add one position';
  const n=added,pl=n===1?'':'s';
  document.getElementById('marginal-status').textContent=n===0?'Start with four message positions.':`Text decoded ${n} more token${pl}, one after another. CacheBack selected ${n} more position${pl} it had already computed.`+(n>=MAX?' Reset to start again.':'');
 }
 marginalButton.addEventListener('click',()=>{added=added>=MAX?0:added+1;render()});
 render();
}

})();
