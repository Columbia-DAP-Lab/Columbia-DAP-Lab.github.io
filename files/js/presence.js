// Live mode on the public site: the other visitors on this page, each a cursor
// with an emoji, a light trail behind it that fades after a moment, and a pop
// (a ring, and the cursor itself bouncing) where they click. While someone holds
// the button, their cursor shows pressed and a dashed line runs from where the
// drag began. With reduced motion there is no trail or bounce: a click briefly
// shows the pressed cursor and a still ring instead. A pill in the upper right turns it off (remembered in this browser).
//
// Backed by Convex (convex/presence.ts). Visitors are anonymous: each tab makes
// up a random id, and the server picks its emoji and color from that. Positions are
// pixels from the page's horizontal center and from the top of the document, so
// a cursor lands on the same content in a wider or narrower window. Every open
// page checks in every few seconds, so still readers, phones and narrow windows
// are counted; cursors are drawn in windows at least 600px wide, and a cursor
// gone still is dimmed. Nothing here runs on the admin page.
(() => {
  const root = document.currentScript;
  const CONVEX_URL = root?.dataset.convexUrl;
  const BUNDLE = root?.dataset.convexBundle;
  const INTEGRITY = root?.dataset.convexIntegrity;
  if (!CONVEX_URL || !BUNDLE) return;

  const STORAGE_KEY = "daplab-live";
  const SEND_EVERY_MS = 120;
  const HEARTBEAT_MS = 10_000; // an open page checks in this often, moving or not
  const PRESENT_MS = 30_000; // a visitor not heard from in this long has left
  const STILL_MS = 15_000; // a cursor that has not moved in this long is dimmed
  const CLICK_FRESH_MS = 2500; // only clicks this recent pop
  const page = location.pathname;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** This visitor has a mouse to share. */
  const canPoint = () => matchMedia("(pointer: fine)").matches;
  /** This window is wide enough to draw the others' cursors usefully. */
  const canDraw = () => innerWidth >= 600;

  const sessionId = (() => {
    const existing = sessionStorage.getItem("daplab-live-session");
    if (existing) return existing;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
    sessionStorage.setItem("daplab-live-session", id);
    return id;
  })();

  // ------------------------------------------------------------- the toggle

  const style = document.createElement("style");
  style.textContent = `
    .live-toggle { position: fixed; top: 76px; right: 16px; z-index: 1040; display: flex; align-items: center; gap: 0.45rem;
      padding: 0.3rem 0.65rem 0.3rem 0.55rem; border: 1px solid #e3e7ed; border-radius: 999px; background: rgba(255,255,255,0.92);
      box-shadow: 0 2px 10px rgba(25,33,45,0.08); font: 600 0.78rem/1 system-ui, sans-serif; color: #5a6575; cursor: pointer;
      backdrop-filter: blur(6px); }
    .live-toggle:hover { color: #19212d; }
    .live-toggle .live-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #b8c0cc; }
    .live-toggle[aria-pressed="true"] .live-dot { background: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.18); }
    .live-layer { position: absolute; left: 0; top: 0; width: 100%; pointer-events: none; z-index: 1030; overflow: hidden; }
    .live-trails { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
    .live-cursor { position: absolute; left: 0; top: 0; transition: transform 140ms linear; will-change: transform; }
    .live-body { transform-origin: 2px 2px; }
    .live-body svg { display: block; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.25)); }
    .live-emoji { position: absolute; left: 13px; top: 13px; font-size: 16px; line-height: 1; }
    .live-act { animation: live-act 520ms cubic-bezier(.3,1.6,.5,1); }
    @keyframes live-act {
      0% { transform: scale(1) rotate(0); } 25% { transform: scale(1.45) rotate(-14deg); }
      55% { transform: scale(0.92) rotate(10deg); } 80% { transform: scale(1.06) rotate(-4deg); } 100% { transform: scale(1) rotate(0); } }
    .live-pop { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; border: 2px solid;
      animation: live-pop 650ms ease-out forwards; }
    @keyframes live-pop { from { opacity: 0.9; transform: scale(0.6); } to { opacity: 0; transform: scale(4); } }
    .live-press-dot { display: none; }
    .live-pressed .live-press-dot { display: inline; }
    .live-pressed path { transform: scale(0.86); transform-origin: 1px 1px; }
    @media (prefers-reduced-motion: reduce) { .live-act { animation: none; } .live-cursor { transition: none; } }
    @media print { .live-toggle, .live-layer { display: none; } }
  `;
  document.head.append(style);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "live-toggle";
  toggle.title = "See who else is on this page";
  toggle.innerHTML = '<span class="live-dot" aria-hidden="true"></span><span class="live-label">Live</span>';
  const label = toggle.querySelector(".live-label");
  document.body.append(toggle);

  let on = localStorage.getItem(STORAGE_KEY) !== "off";
  const setLabel = (count) => {
    toggle.setAttribute("aria-pressed", String(on));
    label.textContent = on ? (count > 0 ? `Live · ${count} here` : "Live") : "Live off";
  };
  setLabel(0);

  // ---------------------------------------------------------------- drawing

  const layer = document.createElement("div");
  layer.className = "live-layer";
  layer.setAttribute("aria-hidden", "true");
  const SVG_NS = "http://www.w3.org/2000/svg";
  const trails = document.createElementNS(SVG_NS, "svg");
  trails.setAttribute("class", "live-trails");
  layer.append(trails);
  const sizeLayer = () => (layer.style.height = `${document.documentElement.scrollHeight}px`);
  const center = () => document.documentElement.clientWidth / 2;
  const toPage = (x, y) => [center() + x, y];

  // The arrow, and a dot at its tip shown while the button is held (.live-pressed).
  const arrow = (color) =>
    `<svg width="18" height="20" viewBox="-4 -4 22 24" style="margin:-4px 0 0 -4px">` +
    `<circle class="live-press-dot" cx="1" cy="1" r="5" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="1.5"/>` +
    `<path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill="${color}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

  const shown = new Map(); // sessionId -> { node, x, y }
  const popped = new Set(); // click ids already shown
  let clockOffset = 0; // server time minus this browser's time

  // A light trail: the last moments of each cursor's path, a thin line in its
  // color that thins and fades out over TRAIL_MS. Points are added when the
  // cursor arrives (after its 140 ms glide), so the line never runs ahead of it.
  const TRAIL_MS = 1100;
  const trailOf = new Map(); // sessionId -> { color, points: [{ x, y, t }], group }
  let drawing = false;
  const addTrailPoint = (id, x, y, color) => {
    if (reduceMotion) return;
    let trail = trailOf.get(id);
    if (!trail) {
      trail = { color, points: [], group: document.createElementNS(SVG_NS, "g") };
      trails.append(trail.group);
      trailOf.set(id, trail);
    }
    setTimeout(() => {
      trail.points.push({ x, y, t: performance.now() });
      if (!drawing) {
        drawing = true;
        requestAnimationFrame(drawTrails);
      }
    }, 140);
  };
  const drawTrails = () => {
    const now = performance.now();
    let any = false;
    for (const [id, trail] of trailOf) {
      trail.points = trail.points.filter((p) => now - p.t < TRAIL_MS);
      trail.group.replaceChildren();
      for (let i = 1; i < trail.points.length; i++) {
        const a = trail.points[i - 1];
        const b = trail.points[i];
        const life = 1 - (now - b.t) / TRAIL_MS; // 1 when fresh, 0 when gone
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", a.x + 2);
        line.setAttribute("y1", a.y + 2);
        line.setAttribute("x2", b.x + 2);
        line.setAttribute("y2", b.y + 2);
        line.setAttribute("stroke", trail.color);
        // Bolder while the button is held, so a drag reads as one.
        const boost = trail.pressed ? 1.7 : 1;
        line.setAttribute("stroke-width", ((0.8 + 2.2 * life) * boost).toFixed(2));
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("stroke-opacity", Math.min(0.75, 0.38 * life * boost).toFixed(3));
        trail.group.append(line);
      }
      if (trail.points.length > 0) any = true;
      else if (!shown.has(id)) {
        trail.group.remove();
        trailOf.delete(id);
      }
    }
    if (any) requestAnimationFrame(drawTrails);
    else drawing = false;
  };

  /** The cursor itself bounces when its visitor clicks. */
  const act = (id) => {
    const entry = shown.get(id);
    const body = entry?.node.querySelector(".live-body");
    if (!body) return;
    if (reduceMotion) {
      // No motion: show the pressed cursor for a moment instead.
      body.classList.add("live-pressed");
      clearTimeout(entry.flash);
      entry.flash = setTimeout(() => body.classList.toggle("live-pressed", Boolean(entry.pressed)), 450);
      return;
    }
    body.classList.remove("live-act");
    void body.offsetWidth; // restart the animation on a quick second click
    body.classList.add("live-act");
  };

  const pop = (x, y, color) => {
    const ring = document.createElement("div");
    ring.className = "live-pop";
    ring.style.borderColor = color;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    layer.append(ring);
    if (reduceMotion) {
      // A still ring for half a second, no animation.
      ring.style.animation = "none";
      ring.style.opacity = "0.7";
      ring.style.transform = "scale(2.2)";
      setTimeout(() => ring.remove(), 500);
    } else ring.addEventListener("animationend", () => ring.remove());
  };

  let latest = { cursors: [], clicks: [] };
  const render = () => {
    const now = Date.now() + clockOffset;
    const others = latest.cursors.filter((c) => c.sessionId !== sessionId && now - c.updatedAt < PRESENT_MS);
    setLabel(others.length + 1);
    if (!canDraw()) {
      for (const { node } of shown.values()) node.remove();
      shown.clear();
      return;
    }
    sizeLayer();
    const seen = new Set();
    for (const c of others) {
      if (c.x === undefined || c.y === undefined) continue; // here, but no mouse yet
      seen.add(c.sessionId);
      const [x, y] = toPage(c.x, c.y);
      let entry = shown.get(c.sessionId);
      if (!entry) {
        const node = document.createElement("div");
        node.className = "live-cursor";
        node.innerHTML = `<div class="live-body">${arrow(c.color)}<span class="live-emoji">${c.emoji}</span></div>`;
        layer.append(node);
        entry = { node, x, y };
        shown.set(c.sessionId, entry);
        addTrailPoint(c.sessionId, x, y, c.color);
      } else if (entry.x !== x || entry.y !== y) {
        addTrailPoint(c.sessionId, x, y, c.color);
      }
      entry.x = x;
      entry.y = y;
      entry.node.style.transform = `translate(${x}px, ${y}px)`;
      // A drag: the pressed cursor, and a dashed line from where it began.
      const pressed = c.pressed === true;
      if (pressed && !entry.pressed) entry.dragStart = [x, y];
      entry.pressed = pressed;
      entry.node.querySelector(".live-body").classList.toggle("live-pressed", pressed);
      const trail = trailOf.get(c.sessionId);
      if (trail) trail.pressed = pressed;
      if (pressed) {
        if (!entry.dragLine) {
          entry.dragLine = document.createElementNS(SVG_NS, "line");
          entry.dragLine.setAttribute("stroke", c.color);
          entry.dragLine.setAttribute("stroke-width", "1.5");
          entry.dragLine.setAttribute("stroke-dasharray", "4 4");
          entry.dragLine.setAttribute("stroke-opacity", "0.55");
          trails.append(entry.dragLine);
        }
        entry.dragLine.setAttribute("x1", entry.dragStart[0] + 1);
        entry.dragLine.setAttribute("y1", entry.dragStart[1] + 1);
        entry.dragLine.setAttribute("x2", x + 1);
        entry.dragLine.setAttribute("y2", y + 1);
      } else if (entry.dragLine) {
        entry.dragLine.remove();
        entry.dragLine = null;
      }
      entry.node.style.opacity = c.movedAt !== undefined && now - c.movedAt > STILL_MS ? "0.35" : "1";
    }
    for (const [id, entry] of shown) {
      if (!seen.has(id)) {
        entry.node.remove();
        entry.dragLine?.remove();
        shown.delete(id);
      }
    }
    for (const click of latest.clicks) {
      if (popped.has(click.id)) continue;
      popped.add(click.id);
      if (click.sessionId === sessionId || now - click.at > CLICK_FRESH_MS) continue;
      const [x, y] = toPage(click.x, click.y);
      pop(x, y, click.color);
      act(click.sessionId);
    }
  };

  // -------------------------------------------------------------- the wire

  let client = null;
  let api = null; // the presence functions, once the bundle is loaded
  let unsubscribe = null;
  let pending = null; // [x, y] not yet sent
  let sending = false;
  let lastSent = 0;
  let timer = null;
  let ticker = null;
  let heartbeatTimer = null;

  const loadBundle = () =>
    window.convex
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = BUNDLE;
          if (INTEGRITY) script.integrity = INTEGRITY;
          script.crossOrigin = "anonymous";
          script.onload = resolve;
          script.onerror = reject;
          document.head.append(script);
        });

  const flush = async () => {
    timer = null;
    if (!client || !pending || sending) return;
    const [x, y, held] = pending;
    pending = null;
    sending = true;
    lastSent = Date.now();
    try {
      const serverNow = await client.mutation(api.move, { page, sessionId, x, y, pressed: held });
      clockOffset = serverNow - Date.now();
    } catch {
      // A dropped update is fine; the next move sends again.
    } finally {
      sending = false;
      if (pending) schedule();
    }
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, Math.max(0, SEND_EVERY_MS - (Date.now() - lastSent)));
  };

  let held = false; // this visitor's button is down
  let lastAt = null; // where this visitor's mouse last was
  const onMove = (event) => {
    if (!canPoint()) return;
    lastAt = [event.pageX - center(), event.pageY];
    pending = [...lastAt, held];
    schedule();
  };
  const onDown = (event) => {
    if (!client || !canPoint() || event.button !== 0) return;
    held = true;
    lastAt = [event.pageX - center(), event.pageY];
    pending = [...lastAt, true];
    schedule();
    client.mutation(api.click, { page, sessionId, x: lastAt[0], y: lastAt[1] }).catch(() => {});
  };
  const onUp = () => {
    if (!held) return;
    held = false;
    if (client && lastAt) {
      pending = [...lastAt, false];
      schedule();
    }
  };
  /** Check in, with no position: counts this visitor even when the mouse is still. */
  const heartbeat = () => {
    if (!client || document.visibilityState !== "visible") return;
    client
      .mutation(api.move, { page, sessionId })
      .then((serverNow) => (clockOffset = serverNow - Date.now()))
      .catch(() => {});
  };
  const onHide = () => {
    if (!client) return;
    if (document.visibilityState === "hidden") client.mutation(api.leave, { sessionId }).catch(() => {});
    else heartbeat();
  };

  const start = async () => {
    try {
      await loadBundle();
    } catch {
      return; // no Convex today; the page works as usual
    }
    if (!on || client) return;
    api = window.convex.anyApi.presence;
    client = new window.convex.ConvexClient(CONVEX_URL);
    document.body.append(layer);
    unsubscribe = client.onUpdate(api.here, { page }, (result) => {
      latest = result;
      render();
    });
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown, { passive: true });
    addEventListener("pointerup", onUp, { passive: true });
    addEventListener("pointercancel", onUp, { passive: true });
    addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    heartbeat();
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
    ticker = setInterval(render, 2000); // dim and drop cursors that go quiet between updates
  };

  const stop = () => {
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerdown", onDown);
    removeEventListener("pointerup", onUp);
    removeEventListener("pointercancel", onUp);
    removeEventListener("pagehide", onHide);
    document.removeEventListener("visibilitychange", onHide);
    clearInterval(ticker);
    clearInterval(heartbeatTimer);
    clearTimeout(timer);
    timer = null;
    pending = null;
    unsubscribe?.();
    unsubscribe = null;
    if (client) {
      const closing = client;
      client = null;
      closing.mutation(api.leave, { sessionId }).catch(() => {}).finally(() => closing.close());
    }
    for (const { node, dragLine } of shown.values()) {
      node.remove();
      dragLine?.remove();
    }
    shown.clear();
    for (const trail of trailOf.values()) trail.group.remove();
    trailOf.clear();
    layer.remove();
    setLabel(0);
  };

  toggle.addEventListener("click", () => {
    on = !on;
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    if (on) start();
    else stop();
    setLabel(0);
  });

  // Out of the way of the page's own loading.
  if (on) (window.requestIdleCallback ?? ((f) => setTimeout(f, 1500)))(() => start());
})();
