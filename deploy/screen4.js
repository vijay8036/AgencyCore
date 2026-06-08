/* ===== MERGED from screen4.js (rm_-prefixed, collision-free) ===== */
/* ===== SECTION 1: WINDOW (script3.js) ===== */
/* =================================================================
   Window Reveal — door is a 35-frame sequence (d_01 = fully CLOSED).
     p 0.00–0.45 : door swings open (frames 1→35), kept crisp (no zoom)
     p 0.45–1.00 : camera flies in, interior fills the screen, door fades
   The interior text fades up; the last bit holds the final layout.
   ================================================================= */
(function () {
  "use strict";
  var rm_FRAMES = 35, rm_PATH = "svg-door/door_", rm_EXT = ".svg";
  var rm_reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var rm_ok = typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined";
  if (rm_reduce || !rm_ok) return;

  var rm_root = document.documentElement;
  var rm_env = document.getElementById("rm_env");
  var rm_content = document.getElementById("rm_content");
  var rm_door = document.getElementById("rm_door");
  var rm_interior = document.getElementById("rm_interior");

  // ---- canvas door: each svg-door frame is rasterised ONCE to an offscreen
  //      canvas, then blitted to the visible canvas. No <img src> swap → no
  //      decode flash → NO FLICKER. ----
  var rm_dctx = rm_door.getContext("2d");
  var rm_CWPX = rm_door.width, rm_CHPX = rm_door.height;   // 2048 x 1152
  var rm_cache = [];
  function rm_drawFrame(rm_n) {
    if (!rm_cache[rm_n]) return;            // not ready yet → keep last frame (no flicker)
    rm_dctx.clearRect(0, 0, rm_CWPX, rm_CHPX);
    rm_dctx.drawImage(rm_cache[rm_n], 0, 0);
    rm_lastF = rm_n;
  }
  // MOBILE MEMORY GUARD: caching all 35 frames as 2048×1152 offscreen canvases
  // is ~315MB — it blows iOS Safari's per-tab cap and reloads the page. The door
  // reveal is DESKTOP-ONLY (≤1024 it never opens; the canvas is display:none),
  // so below 1025 we cache ONLY frame 1 (the closed door) and skip the rest.
  var rm_isDesktop = window.matchMedia("(min-width: 1025px)").matches;
  var rm_loadTo = rm_isDesktop ? rm_FRAMES : 1;
  for (var rm_i = 1; rm_i <= rm_loadTo; rm_i++) {
    (function (rm_n) {
      var rm_im = new Image();
      rm_im.onload = function () {
        var rm_oc = document.createElement("canvas");
        rm_oc.width = rm_CWPX; rm_oc.height = rm_CHPX;
        rm_oc.getContext("2d").drawImage(rm_im, 0, 0, rm_CWPX, rm_CHPX);
        rm_cache[rm_n] = rm_oc;
        if (rm_n === 1 && rm_lastF === -1) rm_drawFrame(1);   // show closed door asap
      };
      rm_im.src = rm_PATH + rm_n + rm_EXT;
    })(rm_i);
  }

  function rm_lerp(rm_a, rm_b, rm_t) { return rm_a + (rm_b - rm_a) * rm_t; }
  function rm_cl(rm_t) { return rm_t < 0 ? 0 : rm_t > 1 ? 1 : rm_t; }
  function rm_seg(rm_p, rm_a, rm_b) { return rm_cl((rm_p - rm_a) / (rm_b - rm_a)); }
  function rm_eio(rm_t) { return rm_t < 0.5 ? 4 * rm_t * rm_t * rm_t : 1 - Math.pow(-2 * rm_t + 2, 3) / 2; }

  var rm_Z1 = 3.5;            // camera zoom at which the interior fills the screen
  var rm_lastF = -1;

  function rm_render(rm_p) {
    rm_p = Math.min(1, rm_p / 0.92);   // hold the final screen for the last 8%

    // ---- camera: the door starts SMALL on the wall (Figma 122) and the
    //      camera flies IN toward the window. door + interior scale together
    //      so the interior always fills the window opening. ----
    var rm_camZ = rm_lerp(0.42, rm_Z1, rm_eio(rm_p));
    rm_door.style.transform = "translate(-50%,-50%) scale(" + rm_camZ.toFixed(4) + ")";
    rm_interior.style.transform = "translate(-50%,-50%) scale(" + rm_camZ.toFixed(4) + ")";
    rm_content.style.transform = "translate(-50%,-50%) scale(" + rm_lerp(0.5, 1, rm_eio(rm_p)).toFixed(4) + ")";   // content scales 0.5 → 1

    // ---- red wall + tree FILL the screen, then recede (scale up + fade) ----
    rm_env.style.transform = "scale(" + rm_lerp(1, 2.8, rm_eio(rm_seg(rm_p, 0.12, 0.7))).toFixed(3) + ")";
    rm_env.style.opacity = (1 - rm_seg(rm_p, 0.3, 0.6)).toFixed(3);

    // ---- door: swing open over the first ~45% (frames 1→35) ----
    var rm_df = Math.round(rm_lerp(1, rm_FRAMES, rm_seg(rm_p, 0.0, 0.45)));
    if (rm_df !== rm_lastF) rm_drawFrame(rm_df);   // blit from cache — instant, no flicker
    rm_door.style.opacity = (1 - rm_seg(rm_p, 0.5, 0.7)).toFixed(3);

    // ---- interior text fades up as the door opens ----
    rm_content.style.setProperty("--rm_el-op", Math.pow(rm_seg(rm_p, 0.15, 0.55), 1.2).toFixed(3));
  }

  gsap.registerPlugin(ScrollTrigger);
  rm_root.classList.remove("rm_no-js");

  // The window reveal is now the LAST panel of the horizontal track. Expose the
  // frame renderer so the SCREEN 3 block can drive it from the pan's progress
  // (desktop) or from a scroll-through trigger (mobile).
  window.__rm_pivotRender = rm_render;

  // debug: ?p=0.5 freezes a single window frame
  var rm_qp = new URLSearchParams(location.search).get("p");
  if (rm_qp !== null) {
    window.__rm_pivotRender = null;
    rm_render(parseFloat(rm_qp));
    return;
  }

  rm_render(0);
})();

/* ===== SECTION 2: WHO SHOULD SUBSCRIBE — normal flowing section with
   on-scroll reveals (robust; no pin so it never conflicts with the
   window section's sticky scrub). Content rises in as you reach it. ===== */
(function () {
  "use strict";
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);

  function rm_init() {
    var rm_reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var rm_EASE = "power3.out";

    // wrap each .rm_line in an overflow-hidden mask for a clean wipe-up reveal
    document.querySelectorAll("#rm_who-page .rm_line").forEach(function (rm_line) {
      var rm_mask = document.createElement("span");
      rm_mask.className = "rm_line-mask";
      rm_line.parentNode.insertBefore(rm_mask, rm_line);
      rm_mask.appendChild(rm_line);
    });

    if (rm_reduce) return; // static, all visible

    var rm_reveal = function (rm_target, rm_vars, rm_trigger) {
      rm_vars = rm_vars || {};
      /* transform/opacity keys seed the FROM state; everything else (stagger,
         duration overrides, …) is tween config for the TO. */
      var rm_tweenProps = ["x","y","z","xPercent","yPercent","scale","scaleX","scaleY",
        "rotation","rotationX","rotationY","skewX","skewY","opacity","autoAlpha"];
      var rm_natural = { scale:1, scaleX:1, scaleY:1, opacity:1, autoAlpha:1 };  /* else 0 */
      var rm_from = { autoAlpha: 0, y: 60 };
      var rm_to   = { autoAlpha: 1, y: 0, duration: 0.9, ease: rm_EASE,
        // restart on every enter; reset to hidden when scrolled back out below,
        // so scrolling up then down replays the animation (not just once).
        scrollTrigger: { trigger: rm_trigger || rm_target, start: "top 85%",
          toggleActions: "restart none none reset" } };
      Object.keys(rm_vars).forEach(function (rm_k) {
        if (rm_tweenProps.indexOf(rm_k) !== -1) {       /* a FROM value (y:70, scale:0.97 …) */
          rm_from[rm_k] = rm_vars[rm_k];
          rm_to[rm_k]   = (rm_k in rm_natural) ? rm_natural[rm_k] : 0;   /* animate back to natural */
        } else {                                        /* tween config (stagger, duration …) */
          rm_to[rm_k] = rm_vars[rm_k];
        }
      });
      gsap.fromTo(rm_target, rm_from, rm_to);
    };

    rm_reveal(".rm_intro__heading .rm_line", { y: 70, stagger: 0.12 }, ".rm_intro__heading");
    rm_reveal([".rm_statement__lead", ".rm_statement__accent"], { stagger: 0.14 }, ".rm_intro__statement");

    /* PARALLAX — the intro heading + statement ("Who Should Subscribe?" /
       "This isn't for everyone." / "The Pivot Point is for:") drift UP as the
       intro scrolls past, a touch faster than the page. Applied to the wrapper
       so it never fights the per-element reveal tweens above. */
    gsap.to(".rm_intro__top", {
      yPercent: -28, ease: "none",
      scrollTrigger: { trigger: ".rm_who-stage__intro",
        start: "top bottom", end: "bottom top", scrub: 0.6 }   /* 0.6s catch-up = smoother drift */
    });
    /* smooth FADE-OUT as the intro scrolls off the top — instead of sitting at
       full opacity and cutting away, it gently dissolves while it drifts up, so
       the hand-off to the next content reads as one continuous transition. */
    gsap.to(".rm_intro__top", {
      opacity: 0, ease: "power1.in",
      scrollTrigger: { trigger: ".rm_who-stage__intro",
        start: "top top", end: "bottom top", scrub: 0.6 }
    });
    rm_reveal(".rm_audience__col", { y: 70, stagger: 0.16 }, ".rm_audience");
    rm_reveal(".rm_cta__heading .rm_line", { stagger: 0.12 }, ".rm_cta__heading");
    rm_reveal(".rm_signup", { y: 70, scale: 0.97 });
    rm_reveal(".rm_billboard", { y: 80 });
    rm_reveal(".rm_cta__scene", { y: 50 });

    // gentle continuous sway on the billboard once it's in view
    var rm_art = document.querySelector(".rm_billboard__art");
    if (rm_art) {
      gsap.to(rm_art, { rotation: 1, duration: 3.6, ease: "sine.inOut", yoyo: true,
        repeat: -1, transformOrigin: "bottom center",
        scrollTrigger: { trigger: ".rm_billboard", start: "top 80%" } });
    }

    // subtle pointer tilt on the billboard
    var rm_billboard = document.querySelector(".rm_billboard");
    if (rm_billboard && window.matchMedia("(hover: hover)").matches) {
      var rm_a = rm_billboard.querySelector(".rm_billboard__art");
      var rm_xTo = gsap.quickTo(rm_a, "rotationY", { duration: 0.6, ease: "power3" });
      var rm_yTo = gsap.quickTo(rm_a, "rotationX", { duration: 0.6, ease: "power3" });
      rm_billboard.addEventListener("mousemove", function (rm_e) {
        var rm_r = rm_billboard.getBoundingClientRect();
        rm_xTo(((rm_e.clientX - rm_r.left) / rm_r.width - 0.5) * 9);
        rm_yTo(-((rm_e.clientY - rm_r.top) / rm_r.height - 0.5) * 7);
      });
      rm_billboard.addEventListener("mouseleave", function () { rm_xTo(0); rm_yTo(0); });
    }

    var rm_form = document.querySelector(".rm_signup");
    if (rm_form) rm_form.addEventListener("submit", function (rm_e) {
      rm_e.preventDefault();
      gsap.fromTo(rm_form.querySelector(".rm_signup__btn"), { scale: 1 },
        { scale: 0.95, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.inOut" });
    });

    window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  }

  if (document.readyState !== "loading") rm_init();
  else document.addEventListener("DOMContentLoaded", rm_init);
})();

/* ===================== SCREEN 3 (screen3.js) ===================== */
gsap.registerPlugin(ScrollTrigger);

const rm_track = document.querySelector('.rm_htrack');
/* Measure the pan distance from the PANELS (each is exactly 100vw), not from
   rm_track.scrollWidth — the parallax skyline is width:max-content and overflows
   the track, which would otherwise inflate scrollWidth and add dead scroll.
   NB: the window-reveal section (#rm_track) now carries .rm_panel too, so it's the
   LAST panel and the pan distance already includes it. */
const rm_panels = gsap.utils.toArray('.rm_panel');
const rm_distance = ()=> Math.max(0, (rm_panels.length - 1) * window.innerWidth);

/* The dark ground band spans the CONTENT panels only — not the window panel
   (#rm_track), which has its own red wall + ground. Width = 100vw * (#panels
   excluding #rm_track); vw units keep it correct on resize. */
const rm_bandPanels = rm_panels.filter((rm_p)=> rm_p.id !== 'rm_track').length;
const rm_trackBand = document.querySelector('.rm_track-band');
if (rm_trackBand) rm_trackBand.style.width = (rm_bandPanels * 100) + 'vw';

/* window-reveal frame renderer (exposed by the window IIFE; null in debug/reduced) */
const rm_render = window.__rm_pivotRender;
/* extra scroll (after the pan) that drives the held door/zoom reveal (~260vh) */
const rm_winLen = ()=> Math.round(window.innerHeight * 2.6);

/* One scrubbed timeline per element, keyed to the element's CENTRE crossing
   the viewport (right→left on desktop, bottom→top on mobile). Opacity:
     100% → 60% viewport : 50% → 100%   (ease in)
      60% → 35% viewport : hold 100%
      35% →  0% viewport : 100% → 50%   (ease out)
   A single timeline is fully reversible, so forward & reverse scroll match.
   Durations are the viewport-percentage spans: .40 / .25 / .35 = 1.0 */
function rm_fadeElement(rm_el, rm_container, rm_inDur, rm_holdToEnd){
  const rm_st = { trigger: rm_el, scrub:true,
    start: rm_container ? 'center right'  : 'center bottom',
    end:   rm_container ? 'center left'   : 'center top' };
  if(rm_container) rm_st.containerAnimation = rm_container;
  /* Always START at 0.85 so the 0.85 → 1 fade-IN is visible as the element
     enters. The pass runs from the element's centre at the viewport's leading
     edge to its centre at the trailing edge, so it ramps to full over rm_inDur
     of the pass (default .50 = full by the half/centre point; heading panels
     pass .30 = full sooner). */
  const rm_FADE_FLOOR = .85;
  const rm_in = rm_inDur || .90;
  const rm_tl = gsap.timeline({ scrollTrigger:rm_st })
    .fromTo(rm_el, { opacity:rm_FADE_FLOOR }, { opacity:1, ease:'power2.out', duration:rm_in });
  if(rm_holdToEnd){
    /* heading panels: once it reaches 1 it STAYS 1 — it animated up from 0.85
       but never drops back down (no 0.85 once it's on screen). */
    rm_tl.to(rm_el, { opacity:1, duration:Math.max(0, 1 - rm_in) });
  } else {
    /* others: HOLD full through the middle, then ease back to the floor over
       the last 20% as the element leaves (the subtle depth effect). */
    const rm_out = .20, rm_hold = Math.max(0, 1 - rm_in - rm_out);
    rm_tl.to(rm_el, { opacity:1, duration:rm_hold })
         .to(rm_el, { opacity:rm_FADE_FLOOR, ease:'power1.in', duration:rm_out });
  }
}

const rm_mm = gsap.matchMedia();

rm_mm.add({
  isDesktop:'(min-width: 1025px) and (prefers-reduced-motion: no-preference)',
  isMobile :'(max-width: 1024px) and (prefers-reduced-motion: no-preference)'
}, (rm_ctx)=>{
  const rm_items = gsap.utils.toArray('.rm_rv');

  if(rm_ctx.conditions.isDesktop){
    /* -------- HORIZONTAL SMOOTH SCROLL (Figma node 1165:20) -------- */
    /* PARALLAX — the faint far skyline lives inside the track, so it already
       pans -distance with everything. A counter-translate of +SKY_PARALLAX*
       distance (a sibling tween in the timeline below) leaves a net slower
       travel, so the far buildings drift behind the foreground = depth. */
    /* ONE pinned, scrubbed timeline. Pin lasts distance + winLen so the window
       panel can be HELD on screen after the pan to drive its reveal:
         Phase 1 (P1): pan all panels left until the window panel's left edge
                       reaches the screen edge (it fills the viewport).
         Hold:         a short dwell once it lands (closed door held).
         Phase 2:      continued scroll runs the door-frame swap + camera zoom. */
    const rm_SKY_PARALLAX = 0.18;                  // 0 = locked, 1 = far skyline still
    const rm_d0 = rm_distance(), rm_w0 = rm_winLen();
    const rm_total = (rm_d0 + rm_w0) || 1;
    const rm_P1 = rm_d0 / rm_total, rm_P2 = rm_w0 / rm_total;     // timeline spans, proportional to px
    const rm_HOLD = rm_P2 * 0.12;                      // brief dwell when the panel lands
    const rm_winProxy = { p:0 };

    const rm_pan = gsap.timeline({
      defaults:{ ease:'none' },
      scrollTrigger:{ trigger:'.rm_hscroll', start:'top top',
        end:()=> '+=' + (rm_distance() + rm_winLen()), pin:true, scrub:1,
        anticipatePin:1, invalidateOnRefresh:true }
    });

    /* PHASE 1 — pan panels left; far skyline drifts slower (parallax) */
    rm_pan.to(rm_track, { x:()=> -rm_distance(), duration:rm_P1 }, 0)
       .fromTo('.rm_track-skyline', { x:0 },
               { x:()=> rm_SKY_PARALLAX * rm_distance(), duration:rm_P1 }, 0);

    /* TREE PARALLAX — the solid foreground trees are baked into the skyline
       (g translate(297…) / translate(1682…) in each tile). The skyline drifts
       slow (rm_SKY_PARALLAX); we push the trees the OTHER way so they travel a
       touch FASTER than the buildings behind them → they read as a nearer
       layer (depth). We hand each tree's baked translate to GSAP first (so its
       position is preserved) then drift its x within the Phase-1 timeline.
       (svg user-units ≈ px at this skyline scale, so the fraction is close.) */
    var rm_TREE_PARALLAX = 0.13;     // 0 = locked to skyline; higher = nearer/faster
    gsap.utils.toArray('.rm_track-skyline g[transform^="translate(297"], .rm_track-skyline g[transform^="translate(1682"]')
      .forEach(function(rm_t){
        var rm_m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(rm_t.getAttribute('transform') || '');
        var rm_bx = rm_m ? parseFloat(rm_m[1]) : 0, rm_by = rm_m ? parseFloat(rm_m[2]) : 0;
        gsap.set(rm_t, { x: rm_bx, y: rm_by });        // GSAP now owns the transform (no jump)
        rm_pan.to(rm_t, { x:()=> rm_bx - rm_TREE_PARALLAX * rm_distance(), duration:rm_P1 }, 0);
      });

    /* HOLD + PHASE 2 — door swings open + camera flies in (frame-changing) */
    if (rm_render){
      rm_pan.to(rm_winProxy, { p:1, duration: rm_P2 - rm_HOLD,
              onUpdate:()=> rm_render(rm_winProxy.p) }, rm_P1 + rm_HOLD);
    }

    /* every section element fades by its own horizontal position (Phase 1).
       The intro panel ("Welcome to The Pivot Point") and the "This newsletter
       is:" panel reach full FAST — within ~30% of their pass after entering —
       so their WIDE heading reads solid the whole time it's on-screen (a wide
       element is visible across a long range, so the slow .50 ramp left it
       looking permanently dim). Every other element ramps to full by the
       half/centre point (.50 default). */
    rm_items.forEach((rm_el)=>{
      const rm_solid = rm_el.closest('.rm_panel--intro, .rm_panel--is');
      /* heading panels: fast ramp (.30) and STAY full after reaching 1 — the
         text animates 0.85 → 1 on enter, then never drops back to 0.85. Others
         keep the full in/hold/out depth fade. */
      rm_fadeElement(rm_el, rm_pan, rm_solid ? .30 : .50, !!rm_solid);
    });
    return;
  }

  /* -------- MOBILE : vertical stack, same opacity behaviour -------- */
  rm_items.forEach((rm_el)=>{
    const rm_solid = rm_el.closest('.rm_panel--intro, .rm_panel--is');
    rm_fadeElement(rm_el, null, rm_solid ? .30 : .50, !!rm_solid);
  });
  /* DOOR OPEN — DISABLED below 1024. The door-open reveal (door swing + camera
     fly-in) is desktop-only; on mobile we do NOT scrub rm_render, so the door
     never opens. The panel still scrolls past with the normal element fades.
     (The window IIFE already paints the closed door frame on init.) */
});

/* keep ScrollTrigger correct after fonts load / window load */
document.fonts && document.fonts.ready.then(()=>ScrollTrigger.refresh());
window.addEventListener('load',()=>ScrollTrigger.refresh());
