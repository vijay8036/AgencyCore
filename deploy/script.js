gsap.registerPlugin(ScrollTrigger);


/* hide scroll hint after first move */
ScrollTrigger.create({ start:'top -5%',
  onEnter:()=>gsap.to('.scrollhint',{autoAlpha:0,duration:.4}),
  onLeaveBack:()=>gsap.to('.scrollhint',{autoAlpha:1,duration:.4}) });

/* hero scroll-cue → click the down-arrow badge to glide past the hero into the
   next scene (the question-zoom). Native smooth scroll; works at every width. */
(function heroCue(){
  const cue  = document.querySelector('.hero__cue');
  const next = document.querySelector('[data-scene="zoom"]');
  if(!cue || !next) return;
  cue.style.cursor = 'pointer';
  cue.setAttribute('role', 'button');
  cue.setAttribute('aria-label', 'Scroll to next section');
  cue.addEventListener('click', ()=> next.scrollIntoView({ behavior:'smooth', block:'start' }));
})();

/* ---- parson character frame swapper (frames live in parson-frames.js) ----
   Frames are drawn onto a <canvas> (clearRect + drawImage in ONE synchronous
   call = one atomic paint, the canvas is never blank between frames). Swapping
   an <img> src or an SVG's innerHTML, by contrast, lets Safari / tablets paint
   an empty beat while the new frame decodes → the flicker. Each frame's SVG is
   pre-decoded into an Image once; the draw is just a synchronous blit. This is
   the same flicker-free technique screen4.js uses for the door frames. */
const parsonCanvas = document.getElementById('parson-img');
const pctx = (parsonCanvas && parsonCanvas.getContext) ? parsonCanvas.getContext('2d') : null;
const PW = parsonCanvas ? parsonCanvas.width : 0, PH = parsonCanvas ? parsonCanvas.height : 0;
const PARSON = window.PARSON_INNERS || [];
const parsonFrames = [];     /* decoded Image per frame */
const parsonReady = [];      /* whether frame n has decoded */
let curParson = -1;
function pDrawParson(n){
  if(!pctx || !parsonReady[n]) return;     /* not decoded yet → keep current frame (no blank flash) */
  pctx.clearRect(0, 0, PW, PH);
  pctx.drawImage(parsonFrames[n], 0, 0, PW, PH);
}
PARSON.forEach((svg, n)=>{
  /* Safari only rasterises an SVG to <canvas> if it carries intrinsic width/height
     (a viewBox alone is not enough), so inject them from the artboard size. */
  const sized = svg.replace(/<svg\b/i, '<svg width="1510" height="910.5"');
  const im = new Image();
  im.onload = ()=>{ parsonReady[n] = true; if(n === curParson || (curParson < 0 && n === 0)) pDrawParson(n); };
  im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
  parsonFrames[n] = im;
});
function showParsonFrame(idx){
  if(!pctx || !PARSON.length) return;
  const i = Math.max(0, Math.min(PARSON.length - 1, idx | 0));
  if(i === curParson) return;
  curParson = i;
  pDrawParson(i);     /* synchronous blit — never paints an empty frame */
}
showParsonFrame(0);   /* first frame (also the reduced-motion state) */

/* responsive + reduced-motion aware */
const mm = gsap.matchMedia();

/* ---- SCREEN 1 · HERO — animations are DESKTOP ONLY (≥1025). Below 1024 the
   hero is static: no assemble-on-load, no scroll pin / "P" pivot. gsap.matchMedia
   reverts these (restores natural state, kills the pin) when the query stops
   matching, so it is correct on live resize too. ---- */
mm.add('(min-width: 1025px) and (prefers-reduced-motion: no-preference)', ()=>{
  /* (a) one-time assemble on load — not tied to scroll */
  gsap.timeline({ defaults:{ ease:'power3.out' } })
    .from('.hero__eyebrow',{ yPercent:120, opacity:0, duration:.5 })
    .from('.hero__title .w',{ yPercent:120, opacity:0, stagger:.12, duration:.7 }, '<.05')
    .from('.hero__bar',{ yPercent:100, duration:.8 }, '-=.3')
    .from('.hero__tag',{ y:40, opacity:0, duration:.5 }, '-=.45')
    .from('.hero__copy p',{ y:30, opacity:0, stagger:.15, duration:.5 }, '<')
    .from('.hero__cue-svg',{ scale:0, opacity:0, ease:'back.out(1.7)', transformOrigin:'85% 50%', duration:.6 }, '-=.3');

  /* (b) scroll-scrubbed pivot: ONLY the "P" of "Point" rotates about its own
     centre, in TWO phases:
       1) PINNED  — hero holds for +=80% while the P turns 0→7.5° (the first 50%)
       2) UNPINNED— at unpin the hero starts scrolling away; over the next
          viewport of scroll the P finishes 7.5°→15°, turning WITH the scroll.
     Phase 2 anchors its start to phase 1's actual end scroll position so the
     two stay perfectly continuous (no jump, no double-driving the rotation). */
  const pivotPin = gsap.timeline({ scrollTrigger:{ trigger:'[data-scene="hero"]',
      start:'top top', end:'+=80%', scrub:true, pin:true, anticipatePin:1,
      invalidateOnRefresh:true } })
    .to('.pivot-letter',{ rotation:7.5, ease:'none', duration:1 }, 0);

  gsap.timeline({ scrollTrigger:{ trigger:'[data-scene="hero"]',
      start:()=> pivotPin.scrollTrigger.end,
      end:()=> pivotPin.scrollTrigger.end + window.innerHeight,
      scrub:true, invalidateOnRefresh:true } })
    /* immediateRender:false → the 7.5° "from" is NOT applied at load (that was
       clobbering phase 1 and freezing the spin); phase 2 only takes over once
       its scroll range begins, picking up exactly where the pin left off. */
    .fromTo('.pivot-letter',{ rotation:7.5 },{ rotation:15, ease:'none', duration:1, immediateRender:false });
});

mm.add({ reduce:'(prefers-reduced-motion: reduce)', motion:'(prefers-reduced-motion: no-preference)',
         desktop:'(min-width: 1025px)' }, (ctx)=>{
  const { motion, desktop } = ctx.conditions;
  if(!motion){ return; }  /* reduced motion -> CSS shows first question static */

  /* SCREEN 1 · HERO animations live in their own desktop-only matchMedia
     (see below) — they are removed ≤1024 so the hero is static there. */


  const gs = gsap.utils.toArray('.zoom__qg');   /* the SVG groups we scale */

  /* ---- SCREEN 2 : QUESTION ZOOM (Figma node 1156:505) ----
     Each question starts tiny, grows to a readable size, then keeps
     growing until it flies THROUGH the camera and fades out — while the
     next question is already growing in behind it.

     We scale the SVG <g> (svgOrigin = artboard centre 960,540). SVG text
     is vector, so it stays razor-sharp at any scale, and a transform is
     GPU-composited with NO reflow — crisp AND smooth, unlike font-size or
     a transform:scale on rasterised HTML text. */
  const STEP = 1;                                /* timeline units per question */

  gsap.set(gs, { scale:0.3, opacity:0, svgOrigin:'960 540' });

  const tl = gsap.timeline({
    scrollTrigger:{ trigger:'[data-scene="zoom"]', start:'top top',
      end:'+=' + (gs.length * 150) + '%', scrub:true, pin:true,
      anticipatePin:1, invalidateOnRefresh:true } });

  gs.forEach((g, i)=>{
    const start = i * STEP;
    const isLast = i === gs.length - 1;
    /* (a) fly IN: tiny → readable, fading in */
    tl.fromTo(g, { scale:0.3, opacity:0 },
                 { scale:1, opacity:1, svgOrigin:'960 540', ease:'none', duration:STEP*0.5 }, start);
    if(isLast){
      /* (b) LAST question zooms FAR past the camera. It is READABLE at its peak
             (scale ~1, cream on the still-dark stage), THEN as the bg washes to
             cream we fade it out in step — otherwise its cream text sits on the
             near-cream (mid-wash) bg as a faint ghost smudge before they match.
             Fading it makes the dissolve clean. */
      tl.to(g, { scale:60, svgOrigin:'960 540', ease:'power2.in', duration:STEP*0.75 }, start + STEP*0.5);
      tl.to(g, { opacity:0, ease:'power1.in', duration:STEP*0.4 }, start + STEP*0.65);
    } else {
      /* (b) fly THROUGH: readable → huge while fading out; next fades in over it */
      tl.to(g, { scale:26, opacity:0, svgOrigin:'960 540', ease:'power1.in', duration:STEP*0.65 }, start + STEP*0.5);
    }
  });

  /* As the LAST question flies through, the giant cream letters used to leave
     the dark stage showing through their gaps as harsh black blobs. Instead we
     WASH the stage from ink → cream across the back half of the fly-through, so
     those gaps turn cream (letters dissolve into cream) and it resolves cleanly
     into the cream intro screen. The eyebrow + grain fade out so nothing odd
     lingers on the cream. */
  const lastStart = (gs.length - 1) * STEP;
  tl.to('.zoom', { backgroundColor:'#FFFCEA', ease:'power1.inOut',
                   duration:STEP*0.6 }, lastStart + STEP*0.65);
  tl.to(['.zoom__eyebrow', '.zoom__noise'], { opacity:0, ease:'power1.out',
                   duration:STEP*0.4 }, lastStart + STEP*0.6);

  /* =========================================================
     SCREEN 2 · INTRO PANEL  (ported from old.html → GSAP)
     Phases (fractions of the pinned scroll):
       A .00–.05  title-main slides up + fades in
       B .05–.24  question marks pop in (4 groups, scale .6→1)
       C .22–.34  titles move up + shrink; sub + graphic enter
       E .36–.54  parson character frames cycle (frame-by-frame)
       –  .54–.66  graphic HOLDS (halved from .54–.78)
       F .66–.95  titles exit up, graphic exits down, ?s fade out
     ========================================================= */
  const QGROUPS = [['qm-9','qm-1'], ['qm-3','qm-2'], ['qm-5','qm-4'], ['qm-7','qm-6','qm-8']];
  const sel = ids => ids.map(id => '#' + id);

  gsap.set('#title-group', { yPercent:-50 });   /* centre via GSAP so y-drift composes cleanly */

  /* Desktop runs the full 700% (in → hold → exit). Below 1024 the exit is
     removed, so the timeline ends at the parson cycle (~.54) — a tighter pin
     plays that same in-sequence over less scroll and lets the coral .stage
     follow right after the intro instead of leaving ~2 viewports of dead cream. */
  const itl = gsap.timeline({
    scrollTrigger:{ trigger:'[data-scene="intro"]', start:'top top',
      end: desktop ? '+=700%' : '+=300%', scrub:true, pin:true,
      anticipatePin:1, invalidateOnRefresh:true } });

  /* A: title in */
  itl.fromTo('#title-main', { opacity:0, y:40 }, { opacity:1, y:0, ease:'power2.out', duration:.05 }, 0);

  /* B: question marks pop in, group by group */
  QGROUPS.forEach((group, gi)=>{
    const at = 0.05 + gi * ((0.24 - 0.05) / QGROUPS.length);
    itl.fromTo(sel(group), { opacity:0, scale:.6, transformOrigin:'50% 50%' },
                           { opacity:1, scale:1, ease:'back.out(1.5)', duration:.04 }, at);
  });

  /* B': the "answer" badge pops in just after the last ?s, with a small rise */
  itl.fromTo('#answer-graphic', { opacity:0, scale:.6, y:30, transformOrigin:'50% 50%' },
                                { opacity:1, scale:1, y:0, ease:'back.out(1.5)', duration:.05 }, .22);

  /* C: titles move up + shrink; sub + graphic slide in */
  itl.to('#title-group', { y:()=> -(window.innerHeight * 0.5 - 150), scale:.86, ease:'none', duration:.12 }, .22)
     .fromTo('#title-sub', { opacity:0, y:90 }, { opacity:1, y:0, ease:'power2.out', duration:.08 }, .27)
     .fromTo('#graphic-group', { opacity:0, y:()=> window.innerHeight * 0.4 },
                               { opacity:1, y:0, ease:'power2.out', duration:.10 }, .26);

  /* E: parson frames cycle (drive a proxy, swap innerHTML on update) */
  const fp = { f:0 };
  itl.to(fp, { f:(PARSON.length - 1) || 0, ease:'none', duration:.18,
               onUpdate:()=> showParsonFrame(fp.f) }, .36);

  /* F: exit — starts at .66 (was .78) so the post-play HOLD is halved
       (graphic now sits .54→.66 ≈ 0.12, was 0.54→.78 ≈ 0.24). The exit glides
       out over more scroll so the timeline still resolves at ~.95 — no added
       dead-scroll, play speed unchanged. */
  /* Exit is DESKTOP ONLY (≥1025). Below 1024 we skip it so the intro holds at
     its final readable state instead of fading/sliding out. matchMedia reverts
     and rebuilds this timeline when the 1024 boundary is crossed, so it's
     correct on live resize too. */
  if(desktop){
    itl.to('#title-group', { y:()=> -(window.innerHeight * 0.5 - 150) - window.innerHeight * 0.6,
                             opacity:0, ease:'none', duration:.29 }, .66)
       .to('#graphic-group', { y:()=> window.innerHeight * 0.5, opacity:0, ease:'none', duration:.29 }, .66)
       .to('.intro .qmark', { opacity:0, stagger:.01, ease:'none', duration:.27 }, .68)
       .to('#answer-graphic', { opacity:0, ease:'none', duration:.27 }, .68);
  }
});

/* =========================================================
   SCREEN 2 · NOTEBOOK  (canvas, ported from old.html)
   Ruled page draws in → copy types out → paper tears apart.
   Scrubbed by ScrollTrigger on the tall .notebook sentinel.
   Restyled to screen2 tokens: Lufga, cream #FFFCEA, coral #DE4B34.
   ========================================================= */
(function notebookSection(){
  'use strict';
  const cnv = document.getElementById('notebook-canvas');
  if(!cnv) return;
  const ctx = cnv.getContext('2d');
  const TEXT = 'Clients demand results yesterday.\nTrends shift in a heartbeat.\nDecisions feel rushed.';

  const P_LINES_END = 0.07;   /* lines finish drawing               */
  const P_TYPE_END  = 0.55;   /* typing finishes — slower write: spans 0.07→0.55 (was →0.30) */
  const P_HOLD_END  = 0.80;   /* fully-typed page HOLDS 0.55→0.80 (a long beat so the copy
                                 sits, fully read) BEFORE it tears; tear then spans 0.80→1.0 */
  let lastProg = 0;
  let DPR = 1, CW = 0, CH = 0;   /* device-pixel-ratio + logical (CSS px) size */

  /* size the backing store by devicePixelRatio so text/lines stay crisp on
     retina; we draw in logical px (CW×CH) via a DPR-scaled context.
     Only repaint on resize if visible — a load-time doPaint would force the
     fixed canvas to cover the earlier scenes. */
  function resize(){
    DPR = window.devicePixelRatio || 1;
    CW = window.innerWidth; CH = window.innerHeight;
    cnv.width  = Math.round(CW * DPR);
    cnv.height = Math.round(CH * DPR);
    cnv.style.width  = CW + 'px';
    cnv.style.height = CH + 'px';
    if(cnv.style.display !== 'none') doPaint(lastProg);
  }
  window.addEventListener('resize', resize);

  function geo(W,H){
    const VX = W * 0.082, LINE_COUNT = 9;
    const firstY = H * 0.14, lastY = H * 0.86;
    const step = (lastY - firstY) / (LINE_COUNT - 1);
    const ys = Array.from({length:LINE_COUNT}, (_,i)=> firstY + i*step);
    return { VX, ys, LINE_COUNT };
  }
  function drawBg(W,H){ ctx.fillStyle = '#FFFCEA'; ctx.fillRect(0,0,W,H); }   /* screen2 cream */

  function drawLines(W,H,lineFrac){
    const { VX, ys, LINE_COUNT } = geo(W,H);
    const slot = 1 / LINE_COUNT;
    ctx.strokeStyle = 'rgba(160,148,120,0.6)'; ctx.lineWidth = 1;
    for(let i=0;i<LINE_COUNT;i++){
      const t = Math.max(0, Math.min(1, (lineFrac - i*slot) / slot));
      if(t<=0) continue;
      ctx.beginPath(); ctx.moveTo(0, ys[i]); ctx.lineTo(t*W, ys[i]); ctx.stroke();
    }
    ctx.strokeStyle = '#DE4B34'; ctx.lineWidth = 2;   /* coral margin line */
    ctx.beginPath(); ctx.moveTo(VX,0); ctx.lineTo(VX, lineFrac*H); ctx.stroke();
  }

  function drawText(W,H,charFrac,showCursor){
    const { VX, ys } = geo(W,H);
    const step = ys[1] - ys[0];          /* ruled-line spacing */
    const tx = VX + 24;
    const fs = Math.min(step * 0.82, 96); /* fit the text within one rule */
    const START_LINE = 2;                 /* first typed line sits on the 3rd rule */
    ctx.font = '600 ' + fs + 'px "Lufga", sans-serif';   /* screen2 Lufga SemiBold */
    ctx.fillStyle = '#131313'; ctx.textBaseline = 'alphabetic';
    const lines = TEXT.split('\n');
    const n = Math.round(charFrac * TEXT.length);
    let consumed = 0, cursorX = tx, cursorY = ys[START_LINE];
    for(let l=0;l<lines.length;l++){
      const baseY = ys[START_LINE + l] - 6;   /* baseline rests ON the ruled line */
      if(n > consumed){
        const vis = lines[l].slice(0, Math.min(n - consumed, lines[l].length));
        ctx.fillText(vis, tx, baseY);
        const lineEnd = consumed + lines[l].length;
        if(n <= lineEnd){ cursorX = tx + ctx.measureText(vis).width + 2; cursorY = baseY; }
        if(l === lines.length-1 && n >= lineEnd){ cursorX = tx + ctx.measureText(lines[l]).width + 2; cursorY = baseY; }
      }
      consumed += lines[l].length + 1;
    }
    if(showCursor){
      ctx.strokeStyle = '#DE4B34'; ctx.lineWidth = 2;   /* coral caret */
      ctx.beginPath(); ctx.moveTo(cursorX, cursorY - fs*0.85); ctx.lineTo(cursorX, cursorY + fs*0.15); ctx.stroke();
    }
  }

  /* ── EXACT Figma crack geometry (node 1164:1123) ──
     RM_CRACK_UP is the single jagged tear line traced from the Figma mask,
     in 1920×1080 design space (x sorted left→right). The page splits along
     THIS line: the top-right half lifts up-right, the bottom-left half drops
     down-left, and the coral screen-3 S1 shows through the widening gap.
     The #EDE9CB "curl" (the paper-back the tear folds open to) is built as a
     perpendicular ribbon along the bottom half — matching the design. */
  var RM_CRACK_UP=[[0,173.9],[1.4,174.2],[7.1,165.9],[18.2,174.8],[33.4,173.5],[43.5,167],[53,165.1],[65.4,163.9],[74.2,158.5],[83.2,163.5],[86.4,166.7],[92.5,175.4],[105,174.7],[109.5,185.3],[120.7,185],[128.3,194.2],[144.5,195.1],[157.8,204.2],[164.2,197.8],[176.7,192.5],[188.4,191.5],[199.7,195.7],[208.6,202.8],[217.1,210.7],[227.3,216.1],[232.2,225.5],[244.2,224.3],[246.8,233.2],[253.2,232.6],[257.2,228.6],[265.4,232.8],[275.8,241.1],[290.3,236.9],[295,236.7],[306.8,238.2],[312.9,241.8],[320.7,241.6],[330.7,249.9],[341.9,256.4],[351.2,258.6],[356,268.3],[366.5,266],[375.2,270.4],[382.9,267.6],[390.1,260.9],[402.6,268],[407.6,278.2],[416.8,284.9],[426.1,292.2],[439.8,289.9],[450.1,297.3],[458,298.2],[464.6,296.6],[471.1,297.5],[480.9,297.4],[488.9,303.1],[498.6,311.3],[511.2,310.1],[523.9,312.9],[529.7,311.2],[537,319],[548.2,319.2],[556,326.1],[567,322.1],[576.3,329],[578.1,325.2],[587.1,324.9],[594.8,332.2],[608.1,340.7],[617.8,333.3],[630,332.7],[640.7,338.2],[651.7,335.2],[663.6,337.4],[673.2,346.3],[684.3,348],[691,356.8],[703,356.8],[714.9,354.7],[724.9,363.7],[735.6,361.7],[746.1,363.2],[753.7,369.2],[762.3,373.1],[766.9,370.1],[777.5,377.8],[786.1,382],[796.6,385.9],[804.2,380.6],[811.6,386.4],[819.2,388],[826.1,386.8],[836,386.1],[844.7,384.5],[853.2,385.3],[865.6,384.6],[874.9,390],[882.9,393.8],[889.9,401.2],[900.7,395.2],[911.5,399.1],[920.5,404.8],[930.6,405.4],[941.6,416.2],[944.4,417.5],[954.8,426],[966.1,424.4],[976.1,427.8],[984.8,434.3],[995.1,437.4],[1003.1,445.1],[1013.3,448.6],[1020,444.3],[1025.3,451.4],[1039,446.7],[1043.5,458.5],[1051,464.3],[1062.3,460.4],[1075.2,466.8],[1081.2,462.5],[1090.7,458.3],[1096.6,465.9],[1107.7,474.7],[1119.3,475.1],[1129.8,477.2],[1141,475.9],[1150.3,480.5],[1157.5,485.7],[1165.3,489.9],[1175.5,492.5],[1183.1,497.1],[1190,503.6],[1197.2,512.5],[1208.8,507.5],[1220.8,509.4],[1230.9,518],[1238.7,525.1],[1249.2,519.9],[1259.8,525.3],[1270.4,527.3],[1280.9,523],[1288.7,527.6],[1289.6,540.4],[1302.8,543.6],[1314.3,548.9],[1324.7,547],[1334.3,549.3],[1342.6,541],[1352.5,542.9],[1362.6,534.7],[1363.5,543.6],[1373.8,532.2],[1383.5,530],[1390.7,537.2],[1396.1,544.1],[1400.9,550.2],[1412.1,555],[1412.7,562.3],[1425.1,565.9],[1434.6,562.5],[1440.9,571.2],[1448.1,566.1],[1463,563.9],[1471.7,566.5],[1478.2,573.9],[1491.2,579.4],[1499.5,585.1],[1508,591.4],[1515.9,597.1],[1528.6,601.5],[1529,613.8],[1544.7,616.4],[1553.2,618.5],[1557,626.8],[1565.2,625.1],[1572.1,626.2],[1582.4,626.3],[1589.2,632.2],[1595.8,633.7],[1601.3,629],[1609.3,630.7],[1619.7,632.8],[1627.7,635.9],[1632.4,642.2],[1643.2,647.5],[1652.9,651.8],[1663.6,649.1],[1668.8,642.3],[1680.8,641.3],[1691.7,644.8],[1703.3,641.3],[1713.3,644.3],[1719.3,644.2],[1729,645.5],[1735.4,652.4],[1748.8,655.9],[1756.9,664.1],[1759.8,659.1],[1764.7,659.8],[1769.3,656.5],[1782.8,657.1],[1795.5,662.8],[1805.6,663.6],[1809.7,672.9],[1815.3,676.6],[1820.7,683.7],[1831.7,684.1],[1842.4,681.5],[1848.5,687],[1856.4,686.1],[1864.4,683.8],[1870.8,689.7],[1876.6,695.7],[1886.5,698.3],[1894.2,690.5],[1899.9,699.3],[1912,694.9],[1920,699.1]];

  /* crack line scaled to the live canvas, with deterministic high-frequency
     micro-serration added so the silhouette reads as torn paper FIBRE — the
     raw Figma line alone is too smooth and looks flat. Fixed seed → identical
     every frame (no shimmer); endpoints stay pinned to the page edges. */
  function getCrack(W,H){
    const sx=W/1920, sy=H/1080, k=Math.min(sx,sy);
    const base=RM_CRACK_UP.map(p=>({x:p[0]*sx, y:p[1]*sy}));
    let s=0x9E3779B1;
    const rnd=()=>{ s=(Math.imul(s,1664525)+1013904223)|0; return (s>>>0)/4294967296; };
    const n=base.length, out=new Array(n);
    for(let i=0;i<n;i++){
      const a=base[Math.max(0,i-1)], b=base[Math.min(n-1,i+1)];
      let nx=-(b.y-a.y), ny=(b.x-a.x); const L=Math.hypot(nx,ny)||1; nx/=L; ny/=L;
      let amp=(rnd()-0.5)*3.4;                 // fine fibre
      if(rnd()<0.12) amp+=(rnd()-0.5)*11;      // occasional torn spike
      out[i]={x:base[i].x+nx*amp*k, y:base[i].y+ny*amp*k};
    }
    out[0]=base[0]; out[n-1]=base[n-1];
    return out;
  }

  /* offset a jagged edge perpendicular into the page: dir=+1 = down (lower
     half), dir=-1 = up (upper half). width may be a number or a t→px fn. */
  function offEdge(line, dir, width){
    const n=line.length, out=new Array(n);
    for(let i=0;i<n;i++){
      const a=line[Math.max(0,i-1)], b=line[Math.min(n-1,i+1)];
      let nx=-(b.y-a.y), ny=(b.x-a.x); const L=Math.hypot(nx,ny)||1; nx/=L; ny/=L;
      if(ny<0){ nx=-nx; ny=-ny; }                 // normal points DOWN
      const w=(typeof width==='function'?width(i/(n-1)):width)*dir;
      out[i]={x:line[i].x+nx*w, y:line[i].y+ny*w};
    }
    return out;
  }

  function edgePath(line){
    const n=line.length;
    ctx.beginPath(); ctx.moveTo(line[0].x,line[0].y);
    for(let i=1;i<n;i++) ctx.lineTo(line[i].x,line[i].y);
  }
  function bandPath(top, bot){      // closed polygon between two parallel edges
    const n=top.length;
    ctx.beginPath(); ctx.moveTo(top[0].x,top[0].y);
    for(let i=1;i<n;i++) ctx.lineTo(top[i].x,top[i].y);
    for(let i=n-1;i>=0;i--) ctx.lineTo(bot[i].x,bot[i].y);
    ctx.closePath();
  }

  function doPaint(prog){
    lastProg = prog;
    const W = CW, H = CH;                    /* draw in logical px */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);  /* scale to device px → crisp */
    ctx.clearRect(0,0,W,H);
    if(prog>=1){ return; }   /* display is owned by the ScrollTrigger callbacks */

    if(prog < P_TYPE_END){
      cnv.style.opacity='1';
      drawBg(W,H);
      const lineFrac = Math.min(1, prog/P_LINES_END);
      drawLines(W,H,lineFrac);
      if(prog>=P_LINES_END){
        const charFrac = Math.min(1, (prog-P_LINES_END)/(P_TYPE_END-P_LINES_END));
        drawText(W,H,charFrac, true);   /* caret blinks while typing */
      }
      return;
    }

    /* HOLD — typing is done; the fully-typed page just SITS (no caret) for a
       beat so the copy reads as finished before the paper starts to tear. */
    if(prog < P_HOLD_END){
      cnv.style.opacity='1';
      drawBg(W,H); drawLines(W,H,1); drawText(W,H,1,false);
      return;
    }

    const tearFrac = Math.min(0.9999, (prog-P_HOLD_END)/(1-P_HOLD_END));
    /* no opacity fade: the canvas now paints the coral S1 itself, so it stays
       opaque and hands straight off to the real (identical) screen-3 S1 when
       onLeave hides it — fading here would flash the dark body behind. */
    cnv.style.opacity = '1';

    const line = getCrack(W,H);
    if(line.length<2){ drawBg(W,H); drawLines(W,H,1); drawText(W,H,1,false); return; }
    const n = line.length, k = Math.min(W/1920, H/1080);

    /* halves drift apart GRADUALLY — roughly perpendicular to the (shallow)
       Figma crack so the gap opens evenly. Rotation eases in over ~half the
       separation; displacement is tuned so each half is only just off-screen
       at sep=1, keeping the tear visible the whole way. */
    const sep = tearFrac, ROT_END = 0.45;
    const lowerAngle =  Math.min(1, sep/ROT_END) * 0.26;   /* bottom-left half */
    const upperAngle = -Math.min(1, sep/ROT_END) * 0.30;   /* top-right half   */
    const lowerX = -W*sep*0.70, lowerY = H*sep*1.28;
    const upperX =  W*sep*0.46, upperY = -H*sep*1.24;

    /* Each half's OUTER edges run far past the canvas (only the crack edge is
       exact), so the diagonal drift never uncovers a canvas corner — coral
       shows ONLY through the opening crack. MX/MY exceed the max drift, so the
       halves still fly fully off-screen by sep=1 and hand off to the coral S1. */
    const MX = W*1.6, MY = H*1.6;

    /* #EDE9CB folded paper-back, just inside the torn edge (two soft lobes,
       pinching to nothing at the ends — the curl the rip opens to). */
    const curlW = t => Math.max(2,(6 + 13*Math.abs(Math.sin(t*Math.PI*1.7)))
                                    *Math.min(1,t*8)*Math.min(1,(1-t)*8))*k;
    const curl  = offEdge(line, +1, curlW);

    /* ---- BOTTOM-LEFT half (everything below the crack) ---- */
    ctx.save(); ctx.translate(lowerX,lowerY); ctx.rotate(lowerAngle);
    ctx.beginPath(); ctx.moveTo(line[0].x,line[0].y);
    for(let i=1;i<n;i++) ctx.lineTo(line[i].x,line[i].y);
    ctx.lineTo(W+MX, line[n-1].y); ctx.lineTo(W+MX, H+MY);
    ctx.lineTo(-MX, H+MY); ctx.lineTo(-MX, line[0].y); ctx.closePath(); ctx.clip();
    ctx.fillStyle='#FFFCEA'; ctx.fillRect(-MX,-MY, W+2*MX, H+2*MY);   /* paper covers the extended half */
    drawLines(W,H,1); drawText(W,H,1,false);
    /* the folded paper-back */
    bandPath(line, curl); ctx.fillStyle='#EDE9CB'; ctx.fill();
    /* soft shadow hugging the edge → the rip has THICKNESS (kills the flatness) */
    ctx.save(); edgePath(line);
    ctx.shadowColor='rgba(20,10,4,0.34)'; ctx.shadowBlur=15*k; ctx.shadowOffsetY=8*k;
    ctx.strokeStyle='#FFFCEA'; ctx.lineWidth=4*k; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();
    ctx.restore();
    /* bright torn-fibre deckle on the very lip */
    edgePath(line); ctx.strokeStyle='rgba(255,254,247,0.95)'; ctx.lineWidth=1.7*k;
    ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();
    ctx.restore();

    /* ---- cast shadow of the lifted TOP flap onto the gap / lower page ---- */
    ctx.save(); ctx.translate(upperX,upperY); ctx.rotate(upperAngle);
    bandPath(line, offEdge(line, +1, 24*k)); ctx.fillStyle='rgba(22,9,4,0.18)'; ctx.fill();
    bandPath(line, offEdge(line, +1, 11*k)); ctx.fillStyle='rgba(22,9,4,0.22)'; ctx.fill();
    ctx.restore();

    /* ---- TOP-RIGHT half (everything above the crack) ---- */
    ctx.save(); ctx.translate(upperX,upperY); ctx.rotate(upperAngle);
    ctx.beginPath(); ctx.moveTo(line[0].x,line[0].y);
    for(let i=1;i<n;i++) ctx.lineTo(line[i].x,line[i].y);
    ctx.lineTo(W+MX, line[n-1].y); ctx.lineTo(W+MX, -MY);
    ctx.lineTo(-MX, -MY); ctx.lineTo(-MX, line[0].y); ctx.closePath(); ctx.clip();
    ctx.fillStyle='#FFFCEA'; ctx.fillRect(-MX,-MY, W+2*MX, H+2*MY);   /* paper covers the extended half */
    drawLines(W,H,1); drawText(W,H,1,false);
    /* shadow on the underside → the flap reads as a lifted layer */
    ctx.save(); edgePath(line);
    ctx.shadowColor='rgba(20,10,4,0.30)'; ctx.shadowBlur=13*k; ctx.shadowOffsetY=-7*k;
    ctx.strokeStyle='#FFFCEA'; ctx.lineWidth=4*k; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();
    ctx.restore();
    /* darker torn underside, then a bright fibre lip over it */
    edgePath(line); ctx.strokeStyle='rgba(19,12,6,0.18)'; ctx.lineWidth=2.4*k;
    ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();
    edgePath(line); ctx.strokeStyle='rgba(255,254,247,0.9)'; ctx.lineWidth=1.4*k; ctx.stroke();
    ctx.restore();
  }

  /* the notebook is no longer its own scrolled section — screen 3 drives the
     tear as its opening phase (the paper tears to reveal the pinned S1 behind).
     Expose the painter + sizer for screen3 to call. */
  window.__NB = { doPaint, resize };
  doPaint(0);   /* paint the full page once so it's ready behind the overlay */

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(()=>resize());
  resize();
})();



/* ============================================================
   SCREEN 3 · CUT THROUGH THE NOISE — merged from screen3.js
   Wrapped in an IIFE so its locals (W, vw, cam, mm, seqFrame, …) don't
   collide with the pivot-point globals. registerPlugin / progress bar /
   scrollhint / refresh handlers are omitted (pivot-point already has them).
   ============================================================ */
(function screen3(){
/* ---------- camera ---------- */
const world = document.getElementById('world');
const fore  = document.getElementById('trackFore');
const W = ()=> window.innerWidth;
const vw = n => n/100 * W();

/* camera : a single value `p` (in vw, negative) drives all three tracks at
   their depth factor. Reading W() live means scrub + resize recompute for free. */
const cam = { p:0 };
function applyCam(){
  gsap.set(world, { x: vw(cam.p) * 1.0 });
  gsap.set(fore,  { x: vw(cam.p) * 1.2 });
}

/* ---------- frame sequences (play AFTER S2, scrubbed by scroll) ----------
   Two sets in the same #seqFrame <img>:
     • PUSH  — 93 frames img/File_1…93.svg   (walk in, push, stand, think)
     • KICK  — 47 frames kick-frames/Kick_1…47.svg (kicks the square → ball)
   Every frame is preloaded so swapping src on scroll is flicker-free. */
const SEQ_FRAMES  = 93;
const KICK_FRAMES = 47;
const seqURL  = i => `img/File_${i}.svg`;
const kickURL = i => `kick-frames/Kick_${i}.svg`;
const seqFrame = document.getElementById('seqFrame');
const preload = url => { const im = new Image(); im.src = url; };
for(let i=1;i<=SEQ_FRAMES;i++)  preload(seqURL(i));
for(let i=1;i<=KICK_FRAMES;i++) preload(kickURL(i));
let curFrameSrc = '';
function setFrame(src){ if(src === curFrameSrc) return; curFrameSrc = src; seqFrame.src = src; }
function showSeqFrame(i){ setFrame(seqURL(i)); }   // PUSH set
function showKickFrame(i){ setFrame(kickURL(i)); } // KICK set
showSeqFrame(1);   // first frame painted regardless of motion preference

const mm = gsap.matchMedia();
mm.add({ reduce:'(max-width: 1024px), (prefers-reduced-motion: reduce)', motion:'(min-width: 1025px) and (prefers-reduced-motion: no-preference)' }, (ctx)=>{
  if(!ctx.conditions.motion){ applyCam(); return; }   // ≤1024 / reduced-motion → CSS stacks S1/S2 as normal sections (no horizontal pan)

  cam.p = 0; applyCam();

  /* ONE pinned timeline (units 0..100) — the pan settles on "No jargon. No
     filler." and the SAME timeline then scrubs the push animation:
       0–55    pan A → B   (p: 0 → -130)   S1 → S2
       55–60   settle / read S2
       60–130  person frames 1→62 (push → stand → think) + square shoved right */
  const seqRig = document.getElementById('seqRig');
  const tl = gsap.timeline({
    defaults:{ ease:'none' },
    scrollTrigger:{ trigger:'[data-scene="cut"]', start:'top top',
      end:'+=1584%', scrub:true, pin:true, anticipatePin:1,
      invalidateOnRefresh:true, onUpdate:applyCam, onRefresh:applyCam } });

  /* OPENING — the notebook page tears apart to reveal screen-3's S1 held
     behind it (Figma 1189:4). screen 3 stays on S1 (cam.p = 0) for these first
     OFF units while we drive the notebook canvas paint 0→1, then it clears
     (transparent) and the pan begins. */
  const OFF = 56;   /* hold before the pan (notebook tear) — reduced from 96 so the section holds less */
  const NBP = { p:0 };
  tl.to(NBP, { p:1, ease:'none', duration:OFF,
    onUpdate(){ if(window.__NB) window.__NB.doPaint(NBP.p); } }, 0);

  /* CAMERA pan keyframe (camera holds at 0 through the tear, then pans, then
     holds at -130 for the push) */
  tl.to(cam, { p:-130, duration:55, ease:'power1.inOut' }, OFF);   /* pan duration (25 → 45 → 55) — slower #world horizontal scroll */

  const seqAnim = { f:1 };
  const paintFrame = ()=> showSeqFrame(Math.round(seqAnim.f));

  /* phase layout (timeline units) + a frame→unit helper so any frame-based
     trigger below stays correct if the split moves. */
  const P1_START = OFF + 60, P1_DUR = 38, P1_END_FRAME = 73, P2_DUR = 32;   /* push starts after the longer pan + settle */
  const f2u = f => f <= P1_END_FRAME
    ? P1_START + (f - 1) / (P1_END_FRAME - 1) * P1_DUR                          // PHASE 1
    : (P1_START + P1_DUR) + (f - P1_END_FRAME) / (SEQ_FRAMES - P1_END_FRAME) * P2_DUR; // PHASE 2

  /* PHASE 1 — frames 1→73 = the "moving" frames: they play WHILE the whole rig
     slides to centre, so the walk/push reads as travel. The pan settles with
     the .s2 container's left edge at screen 0, so the rig's offsetLeft (within
     .s2) is already its on-screen left; reading offsetLeft/offsetWidth keeps
     the centring correct for any layout values. */
  tl.to(seqAnim, { f:P1_END_FRAME, duration:P1_DUR, onUpdate:paintFrame }, P1_START);
  const seqSquare = document.getElementById('seqSquare');
  /* land the ball a little RIGHT of dead centre (not exact centre) */
  const rigToCentre = ()=> ( W()/2 + vw(8) ) -
    ( seqRig.offsetLeft + seqSquare.offsetLeft + seqSquare.offsetWidth/2 );
  tl.to(seqRig, { x: rigToCentre, duration:P1_DUR }, P1_START);

  /* PHASE 2 — the rig has STOPPED at centre; the remaining frames 73→93 play
     in place (stand / think). */
  tl.to(seqAnim, { f:SEQ_FRAMES, duration:P2_DUR, onUpdate:paintFrame }, P1_START + P1_DUR);

  /* the cream square steps to the right in scroll-scrubbed keyframes, then
     holds:  f62→63 = 6px,  63→65 = 11px,  65→66 = 18px,  66→68 = 20px.
     Each step is placed on the timeline by its frame via f2u(). */
  const sqKeys = [ [62,0], [63,6], [65,11], [66,18], [68,20] ];
  gsap.set(seqSquare, { x:0 });
  for (let i=1; i<sqKeys.length; i++){
    const [f0,x0] = sqKeys[i-1], [f1,x1] = sqKeys[i];
    tl.fromTo(seqSquare, { x:x0 }, { x:x1, ease:'none', duration: f2u(f1) - f2u(f0) }, f2u(f0));
  }

  /* once the whole frame sequence has finished (frame 93 at unit 130), the
     "Cause we believe" card FADES UP (opacity in + slight rise), scroll-scrubbed.
     Set in the motion branch only so reduced-motion still shows it statically. */
  const card = document.querySelector('.s2 .card');
  gsap.set(card, { autoAlpha:0, y:24 });
  tl.to(card, { autoAlpha:1, y:0, ease:'power2.out', duration:15 }, OFF+130);
  /* the cream square morphs square → round AT THE SAME TIME the card fades up */
  tl.fromTo(seqSquare, { borderRadius:'0%' }, { borderRadius:'50%', ease:'none', duration:15 }, OFF+130);

  /* ---- KICK (units 145→190) — once the card is in and the ball is round, the
     KICK frame set (Kick_1→47) plays on scroll. ---- */
  const kickAnim = { f:1 };
  tl.to(kickAnim, { f:KICK_FRAMES, duration:45,
    onUpdate(){ showKickFrame(Math.round(kickAnim.f)); } }, OFF+145);

  /* the kick CONNECTS around frame ~28 (leg fully extended into the ball) ≈
     unit OFF+170 — the ball reacts: rolls a SHORT way right and settles quickly
     (kept small so it never overlaps the flag), but KEEPS SPINNING steadily the
     whole way until the flag touches it (~OFF+266), then stops. The seam dot
     orbits the entire time so the spin reads right up to contact. */
  tl.to(seqSquare, { x:()=> 20 + vw(2), ease:'power2.out', duration:18 }, OFF+170);
  tl.to(seqSquare, { rotation:720, ease:'none', duration:96 }, OFF+170);   // OFF+170 → OFF+266 (flag contact)
  /* the seam dot only appears AT the kick — hidden on the pushed square, fades
     in right as contact is made so the spin reads from the first roll. */
  tl.to('#seqDot', { autoAlpha:1, duration:3 }, OFF+168);

  /* ---- TRANSITION (units 190→215) — the ball is the constant: the headline,
     card and person slide LEFT and fade out, the ball stays put, and a golf
     flag slides in from the right to rest beside it (Figma 1189:2). ---- */
  const s2head  = document.querySelector('.s2 .s2head');
  const seqFlag = document.getElementById('seqFlag');
  /* flag comes in from FAR right (vw(95) start) over a LONG scroll so it reads
     as travelling a long distance to reach the ball, then rests beside it. */
  /* pivot the flag about the BASE OF ITS POLE (≈22% across, bottom) so any
     rotation reads as the planted flag tipping, not spinning in mid-air. */
  gsap.set(seqFlag, { x:()=>vw(95), autoAlpha:0, transformOrigin:'22% 100%' });
  /* rest the flag so its POLE LEFT-EDGE lands exactly on the ball's right edge —
     computed from live geometry so they TOUCH at any viewport (a fixed vw left
     drifted apart on wide screens). Ball centre settles at W/2 + vw(10) + 20
     (rigToCentre target W/2+vw8, plus the roll x = 20+vw2); pole left ≈ 20.8%
     across the flag svg. */
  const POLE_LEFT_FRAC = 0.208;
  const flagRestX = () => {
    const ballRight = ( W()/2 + vw(10) + 20 ) + seqSquare.offsetWidth/2;
    const poleLeftNatural = seqFlag.offsetLeft + POLE_LEFT_FRAC * seqFlag.offsetWidth;
    return ballRight - poleLeftNatural;
  };
  tl.to([s2head, card], { x:()=>-vw(55), autoAlpha:0, ease:'power1.in',  duration:45 }, OFF+190);
  tl.to(seqFrame,       { x:()=>-vw(55), autoAlpha:0, ease:'power1.in',  duration:45 }, OFF+190);
  tl.to(seqFlag,        { x:flagRestX,   autoAlpha:1, ease:'power2.out', duration:75 }, OFF+191);

  /* CONTACT wobble — the instant the flag reaches the ball (end of its slide,
     ~OFF+266) it tips to 2° then settles back to 0°, like a tap on impact. */
  tl.to(seqFlag, { rotation:2, ease:'power2.out', duration:3 }, OFF+263);
  tl.to(seqFlag, { rotation:0, ease:'power2.inOut', duration:7 }, OFF+266);

  /* ---- REVEAL (units 270→330) — a circular MASK grows from the ball outward
     to cover the screen. The circle is a live PORTAL into the next section
     (.rm_root): while it grows, rm_root is lifted into a fixed full-viewport
     layer (so it shows at FULL VIEW behind the mask) and clipped to the circle.
     The instant the circle fills the screen — exactly when the cut pin releases
     and rm_root would naturally arrive at top:top — it is handed back to normal
     flow, so the horizontal pan continues with NO jump. The clip circle is
     anchored on the ball's live on-screen centre. ---- */
  const rmRoot = document.querySelector('.rm_root');
  const ballRect = ()=> seqSquare.getBoundingClientRect();
  let portalOn = false, portalSpacer = null;
  const enterPortal = ()=>{
    if(!rmRoot || portalOn) return;
    /* rm_root is about to be lifted into a fixed layer — that removes its big
       height from the document. Drop in a same-height spacer in its place so the
       scroll runway survives: without it the reveal can't finish scrolling AND
       there's nothing left to scroll into rm_root afterwards (page gets stuck,
       so the horizontal pan never starts). */
    portalSpacer = document.createElement('div');
    portalSpacer.setAttribute('aria-hidden','true');
    portalSpacer.style.height = rmRoot.offsetHeight + 'px';
    rmRoot.parentNode.insertBefore(portalSpacer, rmRoot);
    rmRoot.classList.add('rm_root--portal');
    portalOn = true;
  };
  const exitPortal = ()=>{
    if(!rmRoot || !portalOn) return;
    rmRoot.classList.remove('rm_root--portal');
    rmRoot.style.clipPath = '';
    if(portalSpacer){ portalSpacer.remove(); portalSpacer = null; }
    portalOn = false;
  };
  const portalFull = ()=>{ enterPortal(); rmRoot.style.clipPath = ''; };   // circle gone, full view
  function applyMask(){
    if(!rmRoot) return;
    if(maskState.r > 0.5){
      enterPortal();
      const r = ballRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
      rmRoot.style.clipPath = `circle(${maskState.r}px at ${cx}px ${cy}px)`;
    } else {
      exitPortal();   // scrubbed back before the reveal → rm_root returns below the fold
    }
  }
  const maxMaskR = ()=>{
    const r = ballRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
    const w = window.innerWidth, h = window.innerHeight;
    return Math.hypot(Math.max(cx, w-cx), Math.max(cy, h-cy)) * 1.06;   // reach farthest corner
  };
  /* grow from r:0 so reverse-scrolling out of this phase rewinds the tween
     cleanly to a 0-radius circle (portal closed) instead of leaving rm_root
     pinned over the earlier scenes. */
  const maskState = { r:0 };
  tl.fromTo(maskState, { r:0 }, { r:()=>maxMaskR(),
    ease:'power1.inOut', duration:60, onUpdate:applyMask,
    /* circle has filled the screen — DON'T release rm_root here. The cut pin's
       pinSpacing reserves a further ~100vh of scroll before rm_hscroll reaches
       top:top; if we un-fixed now, rm_root would snap down by that 100vh (the
       vertical jump). Instead hold rm_root fixed & full across that gap... */
    onComplete: portalFull,
    onReverseComplete: exitPortal }, OFF+270);

  /* ...and release it at the EXACT scroll where .rm_hscroll pins (same
     'top top' trigger as its own pin in screen4.js, so rm_root's fixed view and
     the pinned panel line up to the pixel → seamless hand-off into the
     horizontal pan, no jump). Scrolling back up re-arms the full-view portal. */
  ScrollTrigger.create({
    trigger:'.rm_hscroll', start:'top top',
    onEnter:     exitPortal,
    onLeaveBack: portalFull
  });
});

})();

/* keep ScrollTrigger correct after fonts load / window load */
document.fonts && document.fonts.ready.then(()=>ScrollTrigger.refresh());
window.addEventListener('load',()=>ScrollTrigger.refresh());

/* ---- Re-init on a real WIDTH resize ----------------------------------------
   The pinned + scrubbed timelines and the frame-by-frame canvases (notebook
   tear, door) don't survive a live resize — a ScrollTrigger.refresh() can't
   re-render a canvas frame, so a resized section can go blank. Re-initialise
   on an actual width change (debounced). HEIGHT-only changes are ignored so the
   mobile URL bar showing/hiding while scrolling never triggers a reload. */
(function(){
  let lastW = window.innerWidth, rt;
  window.addEventListener('resize', function(){
    if(window.innerWidth === lastW) return;          // height-only (mobile chrome) → ignore
    clearTimeout(rt);
    rt = setTimeout(function(){
      if(window.innerWidth !== lastW){ lastW = window.innerWidth; location.reload(); }
    }, 300);
  });
})();
