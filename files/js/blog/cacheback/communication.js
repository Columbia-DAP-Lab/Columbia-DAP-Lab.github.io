(()=>{
/* ===================== configuration ===================== */
const C = {
  gray:'#d9d9d9', purple:'#c5b3e0', blue:'#6c8ebf', teal:'#a9d7c9',
  red:'#e53935', overflow:'#ef9a9a', overflowBg:'#fdecea',
  text:'#555', purpleText:'#6a4fb8', blueText:'#3f669f', tealText:'#3d8f78', green:'#2e8b57', arrow:'#c4c4c4'
};
const P = 19, W = 14, H = 64;          // column pitch, column width, column height (= layers)
const N = 10, LAT = 2;                  // positions per sender, latent steps per sender
const SEL = [[2, 7], [3, 6]];           // selected positions per sender
const SX = 130, SY = [118, 250];        // sender KV origin
const RX = 620, RY = 118, SEG = 10;     // receiver KV row (LatentMAS/KVComm)
const STX = 400, STY = 250;             // staging row (colored entries only)
const CY = 382, TY = 382;               // CacheBack row y, token-ID row y
const LIMIT_SLOT = 16;                  // context limit falls before this receiver slot
const GROUP_GAP = 10;                   // gap between purple and blue groups in staging

const T = { s0:0, s1:4.0, s2:1.6, s3:7.0, s4:11.0, s5:13.4, s6:17.0, s7:20.0, end:23.5 };
const STAGES = [
  { t:T.s0, name:'Sender KVs',    cap:'Each sender agent holds a <b>KV cache</b> — one column per position, spanning all layers.' },
  { t:T.s1, name:'Select',        cap:'Positions relevant to the receiver\'s query <b>q</b> are <span style="color:#6a4fb8"><b>selected</b></span>.' },
  { t:T.s2, name:'Latent steps',  cap:'Latent steps feed continuous representations back into the model instead of words. Each sender appends <span style="color:#3f669f"><b>latent steps</b></span>, appending new KV entries.' },
  { t:T.s3, name:'Concatenate',   cap:'<b>LatentMAS / KVComm</b>: transfer <i>all</i> positions and concatenate them into the receiver\'s KV, followed by the receiver prompt.' },
  { t:T.s4, name:'Overflow',      cap:'The concatenated cache plus the receiver prompt <span style="color:#e53935"><b>exceeds the context limit</b></span>.' },
  { t:T.s5, name:'Pick & sort',   cap:'<b>CacheBack</b>: keep the selected source positions and current sender’s latent steps, and organize them.' },
  { t:T.s6, name:'CacheBack',     cap:'The receiver prefills the message to build its own cache, <span style="color:#2e8b57"><b>well within the context limit</b></span>.' },
  { t:T.s7, name:'Token IDs',     cap:'Optional encoding: selected source positions can be sent as <span style="color:#6a4fb8"><b>token IDs</b></span>; latent steps must be sent as <span style="color:#3f669f"><b>continuous vectors</b></span>. The receiver prefills both to build its own state.' },
].sort((a,b)=>a.t-b.t);

/* ===================== tiny timeline engine ===================== */
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('communication-svg');
function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
const ease = {
  lin: t => t,
  io:  t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  back:t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3*Math.pow(t - 1, 3) + c1*Math.pow(t - 1, 2); },
};
const COLOR_PROPS = new Set(['fill', 'stroke']);
const ATTR = { w:'width', h:'height' };
const hex = h => [0, 2, 4].map(i => parseInt(h.replace('#', '').substr(i, 2), 16));
const norm = (k, v) => COLOR_PROPS.has(k) ? hex(v) : v;
const mix = (a, b, p) => Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * p) : a + (b - a) * p;
const actors = [];
class Actor {
  constructor(node, init) {
    this.node = node; this.init = {}; this.tracks = {}; this.last = {};
    for (const k in init) this.init[k] = norm(k, init[k]);
    actors.push(this);
  }
  to(t0, dur, props, e = 'io') {
    for (const k in props) if (!(k in this.init)) this.init[k] = +this.node.getAttribute(ATTR[k] || k);
    for (const k in props) (this.tracks[k] ||= []).push({ t0, t1: t0 + dur, v: norm(k, props[k]), e: ease[e] });
    return this;
  }
  at(t, props) { return this.to(t, 0, props, 'lin'); }
  eval(t) {
    for (const k in this.init) {
      let v = this.init[k];
      for (const s of (this.tracks[k] || [])) {
        if (t >= s.t1) { v = s.v; continue; }
        if (t > s.t0) v = mix(v, s.v, s.e((t - s.t0) / (s.t1 - s.t0)));
        break;
      }
      const out = COLOR_PROPS.has(k) ? `rgb(${v.map(Math.round).join(',')})` : (+v.toFixed(2));
      if (this.last[k] !== out) { this.node.setAttribute(ATTR[k] || k, out); this.last[k] = out; }
    }
  }
  finalize() { for (const k in this.tracks) this.tracks[k].sort((a, b) => a.t0 - b.t0); }
}

/* ===================== scene ===================== */
const defs = el('defs', {}, svg);
const mk = el('marker', { id:'ah', viewBox:'0 0 10 10', refX:5, refY:5, markerWidth:3.2, markerHeight:3.2, orient:'auto-start-reverse' }, defs);
el('path', { d:'M0,0 L10,5 L0,10 z', fill:C.arrow }, mk);

const L = {};
for (const name of ['bg', 'main', 'clone', 'over', 'labels']) L[name] = el('g', {}, svg);

const rect = (init, parent = L.main, rx = 2) => new Actor(el('rect', { rx }, parent), init);
function txt(str, x, y, o = {}, parent = L.labels) {
  const n = el('text', { x, y, 'font-size':o.size || 14, 'font-weight':o.weight || 400,
                         fill:o.fill || C.text, 'text-anchor':o.anchor || 'start', ...(o.attrs || {}) }, parent);
  n.innerHTML = str;
  return new Actor(n, { opacity:o.opacity ?? 0, ...(o.init || {}) });
}
const group = (parent = L.labels, opacity = 0) => { const g = el('g', {}, parent); return [g, new Actor(g, { opacity })]; };

const colX = i => SX + i * P;
const slotX = g => RX + Math.floor(g / (N + LAT)) * ((N + LAT) * P + SEG) + (g % (N + LAT)) * P;
const limitX = slotX(LIMIT_SLOT) - (P - W) / 2;
const recvPromptX = RX + 2 * ((N + LAT) * P + SEG);
const PROMPT_W = 3 * P - (P - W);

/* --- axes --- */
{
  const [g, a] = group();
  el('line', { x1:SX, y1:76, x2:SX + 200, y2:76, stroke:C.arrow, 'stroke-width':5, 'marker-end':'url(#ah)' }, g);
  const t1 = el('text', { x:SX, y:62, 'font-size':16, fill:'#666' }, g); t1.textContent = 'positions';
  el('line', { x1:SX - 24, y1:SY[0], x2:SX - 24, y2:SY[0] + 110, stroke:C.arrow, 'stroke-width':5, 'marker-end':'url(#ah)' }, g);
  const t2 = el('text', { x:SX - 34, y:SY[0] + 14, 'font-size':16, fill:'#666', 'text-anchor':'end' }, g); t2.textContent = 'layers';
  a.to(0.1, .6, { opacity:1 });
}
const senderLabels = [0, 1].map(s => txt(`Sender ${s + 1} KV`, SX, SY[s] - 10, { size:15, weight:700 }).to(0.1 + s * .25, .5, { opacity:1 }));

/* --- stage 0/1/2: sender columns --- */
const senderCols = [[], []];
const scanStart = T.s1 + 0.3, scanDur = 1.8;
for (const s of [0, 1]) {
  for (let i = 0; i < N + LAT; i++) {
    const isLat = i >= N, y = SY[s];
    const a = rect({ x:colX(i), y:y + H/2, w:W, h:0, fill:isLat ? C.blue : C.gray, opacity:1 });
    if (!isLat) a.to(0.15 + s * .25 + i * .05, .45, { y, h:H }, 'out');
    if (SEL[s].includes(i)) {
      const ts = scanStart + scanDur * (i + 1) / (N + 1);
      a.to(ts, .25, { fill:C.purple }, 'lin')
       .to(ts, .15, { y:y - 4, h:H + 8 }, 'out').to(ts + .15, .25, { y, h:H });
    }
    senderCols[s].push(a);
  }
  // scan bar with query q
  const scan = rect({ x:colX(-1) - 3, y:SY[s] - 6, w:W + 6, h:H + 12, fill:'#7cc4b0', opacity:0 }, L.over, 4);
  scan.to(scanStart - .15, .15, { opacity:.5 }, 'lin')
      .to(scanStart, scanDur, { x:colX(N) - 3 }, 'lin')
      .to(scanStart + scanDur, .2, { opacity:0 }, 'lin');
  const q = txt('q', colX(-1) + W/2, SY[s] + H + 18, { size:15, weight:700, fill:C.tealText, anchor:'middle', attrs:{ 'font-style':'italic' } });
  q.to(scanStart - .15, .15, { opacity:1 }, 'lin')
   .to(scanStart, scanDur, { x:colX(N) + W/2 }, 'lin')
   .to(scanStart + scanDur, .2, { opacity:0 }, 'lin');

  // latent step generation: attend over existing cache, then append a blue column
  for (let k = 0; k < LAT; k++) {
    const tk = T.s2 + 0.3 + k * 1.3;
    const flash = rect({ x:SX - 4, y:SY[s] - 4, w:(N + k) * P - (P - W) + 8, h:H + 8, fill:C.blue, opacity:0 }, L.over, 5);
    flash.to(tk, .3, { opacity:.2 }, 'out').to(tk + .35, .35, { opacity:0 });
    senderCols[s][N + k].to(tk + .45, .5, { y:SY[s], h:H }, 'back');
  }
}
const typeOf = (s, i) => i >= N ? 'b' : SEL[s].includes(i) ? 'p' : 'g';
const fillOf = { p:C.purple, b:C.blue, g:C.gray };

/* --- stage 3: LatentMAS / KVComm concatenation --- */
const recvTitle = txt(`LatentMAS, KVComm <tspan font-weight="400" fill="#999">· all positions</tspan>`, RX, RY - 10, { size:15, weight:700 });
recvTitle.to(T.s3, .5, { opacity:1 });
const recv = [];
for (const s of [0, 1]) for (let i = 0; i < N + LAT; i++) {
  const g = s * (N + LAT) + i;
  const c = rect({ x:colX(i), y:SY[s], w:W, h:H, fill:fillOf[typeOf(s, i)], opacity:0 }, L.clone);
  const t0 = T.s3 + 0.4 + s * 1.1 + i * .06;
  c.at(t0, { opacity:1 }).to(t0, .9, { x:slotX(g), y:RY });
  recv.push(c);
}
const recvPrompt = rect({ x:recvPromptX + 60, y:RY, w:PROMPT_W, h:H, fill:C.teal, opacity:0 }, L.clone);
recvPrompt.to(T.s3 + 3.0, .7, { x:recvPromptX, opacity:1 }, 'out');

/* --- stage 4: context limit & overflow --- */
const overBg = rect({ x:limitX, y:RY - 6, w:recvPromptX + PROMPT_W + 8 - limitX, h:H + 12, fill:C.overflowBg, opacity:0 }, L.bg, 4);
overBg.to(T.s4 + .8, .4, { opacity:1 });
const limitLine = new Actor(el('line', { x1:limitX, x2:limitX, y1:92, stroke:C.red, 'stroke-width':2.5, 'stroke-dasharray':'8 6' }, L.labels), { y2:92, opacity:0 });
limitLine.at(T.s4 + .1, { opacity:1 }).to(T.s4 + .1, .7, { y2:478 }, 'io');
const limitText = txt('Context Limit', 0, 0, { size:17, fill:C.red, anchor:'middle', attrs:{ transform:`translate(${limitX + 16},${(RY + H + CY) / 2 + 6}) rotate(90)` } });
limitText.to(T.s4 + .6, .4, { opacity:1 });
recv.forEach((c, g) => { if (g >= LIMIT_SLOT) c.to(T.s4 + .9 + (g - LIMIT_SLOT) * .05, .3, { fill:C.overflow }, 'lin'); });
recvPrompt.to(T.s4 + .9 + (recv.length - LIMIT_SLOT) * .05, .3, { fill:C.overflow }, 'lin');
const overLabel = txt('✕ exceeds context', limitX + 10, RY - 10, { size:14, weight:700, fill:C.red });
overLabel.to(T.s4 + 1.4, .4, { opacity:1 });

/* --- stage 5: CacheBack — pick colored entries, then sort by type --- */
[...recv, recvPrompt, recvTitle, overBg, overLabel].forEach(a => a.to(T.s5, .5, { opacity:.3 }));
for (const s of [0, 1]) senderCols[s].forEach((a, i) => { if (typeOf(s, i) === 'g') a.to(T.s5 + .1, .5, { opacity:.3 }); });

const picks = [];
for (const s of [0, 1]) {
  SEL[s].forEach(i => picks.push({ s, i, type:'p' }));
  for (let k = 0; k < LAT; k++) picks.push({ s, i:N + k, type:'b' });
}
const purples = picks.filter(p => p.type === 'p'), blues = picks.filter(p => p.type === 'b');
const sortedX = p => p.type === 'p' ? STX + purples.indexOf(p) * P
                                    : STX + (purples.length + blues.indexOf(p)) * P + GROUP_GAP;
const sortT = T.s5 + 2.2;
picks.forEach((p, j) => {
  const c = rect({ x:colX(p.i), y:SY[p.s], w:W, h:H, fill:fillOf[p.type], opacity:0 }, L.clone);
  c.at(T.s5 + .3, { opacity:1 }).to(T.s5 + .3, .3, { y:SY[p.s] - 8 }, 'out');               // lift out
  c.to(T.s5 + .8 + j * .08, .8, { x:STX + j * P, y:STY });                                 // gather
  if (p.type === 'b') {                                                                     // sort: blues dodge down, slide, come back
    c.to(sortT, .3, { y:STY + 40 }).to(sortT + .85, .3, { y:STY });
  }
  c.to(sortT + .35, .45, { x:sortedX(p) });
  p.actor = c;
});
txt('selected + latent only', STX, STY - 10, { size:13, fill:'#888' }).to(T.s5 + .8, .5, { opacity:1 });

/* --- stage 6: write into CacheBack receiver cache --- */
txt('CacheBack: selected inputs → prefill', RX, CY - 10, { size:15, weight:700 }).to(T.s6, .5, { opacity:1 });
const perSender = SEL[0].length + LAT;
const cbX = (p) => {
  const m = p.type === 'p' ? SEL[p.s].indexOf(p.i) : SEL[p.s].length + (p.i - N);
  return RX + p.s * (perSender * P + SEG) + m * P;
};
const cbOrder = [...picks]; // per-sender: selected positions, then latent steps
cbOrder.forEach((p, j) => {
  const c = rect({ x:sortedX(p), y:STY, w:W, h:H, fill:fillOf[p.type], opacity:0 }, L.clone);
  const t0 = T.s6 + .3 + j * .07;
  c.at(t0, { opacity:1 }).to(t0, .9, { x:cbX(p), y:CY });
});
const cbPromptX = RX + 2 * (perSender * P + SEG);
rect({ x:cbPromptX + 40, y:CY, w:PROMPT_W, h:H, fill:C.teal, opacity:0 }, L.clone).to(T.s6 + 1.5, .7, { x:cbPromptX, opacity:1 }, 'out');
txt('✓ fits', cbPromptX + PROMPT_W + 14, CY + H / 2 + 5, { size:15, weight:700, fill:C.green }).to(T.s6 + 2.3, .4, { opacity:1 });

/* --- stage 7: purple entries compress to token IDs --- */
picks.forEach((p, j) => {
  const c = rect({ x:sortedX(p), y:STY, w:W, h:H, fill:fillOf[p.type], opacity:0 }, L.clone);
  const t0 = T.s7 + .3 + j * .08;
  c.at(t0, { opacity:1 });
  if (p.type === 'p') c.to(t0, .9, { y:TY + H / 2 - 4, h:8 });
  else c.to(t0, .9, { y:TY });
});
txt('Token IDs', STX + (purples.length * P - (P - W)) / 2, TY + H / 2 - 12, { size:14, weight:600, fill:C.purpleText, anchor:'middle' })
  .to(T.s7 + 1.6, .4, { opacity:1 });
txt('+prefill', STX + purples.length * P + GROUP_GAP + (blues.length * P - (P - W)) / 2, TY + H + 20, { size:14, weight:600, fill:C.purpleText, anchor:'middle' })
  .to(T.s7 + 2.0, .4, { opacity:1 });

/* --- legend (always visible) --- */
{
  const ly = 524, items = [
    { x:130, fill:C.purple, label:'Selected for receiver query q', color:C.purpleText },
    { x:385, fill:C.gray,   label:'Unselected positions', color:'#888' },
    { x:580, fill:C.blue,   label:'Latent steps', color:C.blueText },
    { x:730, fill:C.teal,   label:'Receiver prompt', color:C.tealText },
  ];
  for (const it of items) {
    el('rect', { x:it.x, y:ly - 13, width:16, height:16, rx:2, fill:it.fill }, svg);
    const t = el('text', { x:it.x + 24, y:ly, 'font-size':14, fill:it.color }, svg); t.textContent = it.label;
  }
  el('line', { x1:905, y1:ly - 5, x2:935, y2:ly - 5, stroke:C.red, 'stroke-width':2.5, 'stroke-dasharray':'6 4' }, svg);
  const t = el('text', { x:943, y:ly, 'font-size':14, fill:C.red }, svg); t.textContent = 'Context limit';
}
actors.forEach(a => a.finalize());

/* ===================== playback ===================== */
const button = document.getElementById('animation-play');
function playbackLabel(mode) {
  const icon=mode==='pause'?'<rect x="7" y="5" width="3" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="3" height="14" rx="1" fill="currentColor"/>':mode==='replay'?'<path d="M5 8a8 8 0 1 1-1 8M5 3v5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>':'<path d="M9 5.5v13l10-6.5z" fill="currentColor"/>';
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icon+'</svg><span>'+(mode==='pause'?'Pause':mode==='replay'?'Replay':'Play')+'</span>';
}

let t = 19.3, firstPlay = true, playing = false, lastTs = null, stageIdx = -1;
function render(time) {
  const scrub=document.getElementById('animation-timeline');
  if(scrub){scrub.value=time.toFixed(1);scrub.style.setProperty('--played',(time/T.end*100)+'%');scrub.setAttribute('aria-valuetext',time.toFixed(1)+' seconds of 23.5 seconds')}
  const label=document.getElementById('animation-time');
  if(label) label.textContent=time.toFixed(1)+' / 23.5 s';
  for (const a of actors) a.eval(time);
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) if (time >= STAGES[i].t) idx = i;
  if (idx !== stageIdx) {
    stageIdx = idx;
    document.getElementById('animation-caption').innerHTML = STAGES[idx].cap;
  }
}
function pause() {
  playing = false;
  playbackLabel(t >= T.end ? 'replay' : 'play');
  button.title = t >= T.end ? 'Replay animation' : 'Play animation';
  button.setAttribute('aria-label', button.title);
}
function frame(ts) {
  if (!playing) return;
  if (lastTs !== null) t = Math.min(T.end, t + (ts - lastTs) / 1000);
  lastTs = ts;
  render(t);
  if (t >= T.end) pause();
  else requestAnimationFrame(frame);
}
button.onclick = () => {
  if (playing) { pause(); return; }
  if (firstPlay || t >= T.end) t = 0;
  firstPlay = false;
  playing = true;
  lastTs = null;
  playbackLabel('pause');
  button.title = 'Pause animation';
  button.setAttribute('aria-label', button.title);
  requestAnimationFrame(frame);
};
render(t);

const scrub=document.getElementById('animation-timeline');
scrub.addEventListener('input',()=>{pause();firstPlay=false;t=Number(scrub.value);lastTs=null;render(t)});
document.getElementById('animation-restart').addEventListener('click',()=>{pause();t=T.end;button.click()});

// Play once when the figure scrolls into view, unless the reader prefers reduced motion or has already used the controls.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    io.disconnect();
    if (firstPlay && !playing) button.click();
  }, { threshold: .6 });
  io.observe(svg.closest('.animation-canvas'));
}

})();
