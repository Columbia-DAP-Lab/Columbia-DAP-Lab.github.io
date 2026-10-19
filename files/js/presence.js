// Live mode on the public site: the other visitors on this page, their cursors,
// their clicks as a pop, and a faint trail behind each cursor that fades like a
// wisp. A pill in the upper right turns it off (remembered in this browser).
//
// Backed by Convex (convex/presence.ts). Visitors are anonymous: each tab makes
// up a random id, and the server names and colors it from that. Positions are
// pixels from the page's horizontal center and from the top of the document, so
// a cursor lands on the same content in a wider or narrower window. Touch and
// narrow screens show the count only. Nothing here runs on the admin page.
(() => {
  const root = document.currentScript;
  const CONVEX_URL = root?.dataset.convexUrl;
  const BUNDLE = root?.dataset.convexBundle;
  const INTEGRITY = root?.dataset.convexIntegrity;
  if (!CONVEX_URL || !BUNDLE) return;

  const STORAGE_KEY = "daplab-live";
  const SEND_EVERY_MS = 120;
  const QUIET_MS = 15_000; // a cursor not heard from in this long is hidden
  const CLICK_FRESH_MS = 2500; // only clicks this recent pop
  const page = location.pathname;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canPoint = () => matchMedia("(pointer: fine)").matches && innerWidth >= 900;

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
    .live-cursor { position: absolute; left: 0; top: 0; transition: transform 140ms linear; will-change: transform; }
    .live-cursor svg { display: block; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.25)); }
    .live-name { position: absolute; left: 14px; top: 16px; padding: 2px 7px; border-radius: 999px; color: #fff;
      font: 600 11px/1.4 system-ui, sans-serif; white-space: nowrap; }
    .live-wisp { position: absolute; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%;
      filter: blur(1.5px); opacity: 0.22; animation: live-wisp 900ms ease-out forwards; }
    @keyframes live-wisp { to { opacity: 0; transform: translateY(-6px) scale(2.2); } }
    .live-pop { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; border: 2px solid;
      animation: live-pop 650ms ease-out forwards; }
    @keyframes live-pop { from { opacity: 0.9; transform: scale(0.6); } to { opacity: 0; transform: scale(4); } }
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
  const sizeLayer = () => (layer.style.height = `${document.documentElement.scrollHeight}px`);
  const center = () => document.documentElement.clientWidth / 2;
  const toPage = (x, y) => [center() + x, y];

  const arrow = (color) =>
    `<svg width="18" height="20" viewBox="0 0 18 20"><path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill="${color}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

  const shown = new Map(); // sessionId -> { node, x, y }
  const popped = new Set(); // click ids already shown
  let clockOffset = 0; // server time minus this browser's time

  const wisps = (from, to, color) => {
    if (reduceMotion) return;
    const steps = Math.min(4, Math.max(1, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 40)));
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const dot = document.createElement("div");
      dot.className = "live-wisp";
      dot.style.background = color;
      dot.style.left = `${from[0] + (to[0] - from[0]) * t + 2}px`;
      dot.style.top = `${from[1] + (to[1] - from[1]) * t + 2}px`;
      dot.style.animationDelay = `${Math.round(t * 120)}ms`;
      layer.append(dot);
      dot.addEventListener("animationend", () => dot.remove());
    }
  };

  const pop = (x, y, color) => {
    const ring = document.createElement("div");
    ring.className = "live-pop";
    ring.style.borderColor = color;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    if (reduceMotion) ring.style.animationDuration = "1ms";
    layer.append(ring);
    ring.addEventListener("animationend", () => ring.remove());
  };

  let latest = { cursors: [], clicks: [] };
  const render = () => {
    const now = Date.now() + clockOffset;
    const others = latest.cursors.filter((c) => c.sessionId !== sessionId && now - c.updatedAt < QUIET_MS);
    setLabel(others.length + 1);
    if (!canPoint()) {
      for (const { node } of shown.values()) node.remove();
      shown.clear();
      return;
    }
    sizeLayer();
    const seen = new Set();
    for (const c of others) {
      seen.add(c.sessionId);
      const [x, y] = toPage(c.x, c.y);
      let entry = shown.get(c.sessionId);
      if (!entry) {
        const node = document.createElement("div");
        node.className = "live-cursor";
        node.innerHTML = `${arrow(c.color)}<span class="live-name" style="background:${c.color}">${c.name}</span>`;
        layer.append(node);
        entry = { node, x, y };
        shown.set(c.sessionId, entry);
      } else if (entry.x !== x || entry.y !== y) {
        wisps([entry.x, entry.y], [x, y], c.color);
      }
      entry.x = x;
      entry.y = y;
      entry.node.style.transform = `translate(${x}px, ${y}px)`;
    }
    for (const [id, entry] of shown) {
      if (!seen.has(id)) {
        entry.node.remove();
        shown.delete(id);
      }
    }
    for (const click of latest.clicks) {
      if (popped.has(click.id)) continue;
      popped.add(click.id);
      if (click.sessionId === sessionId || now - click.at > CLICK_FRESH_MS) continue;
      const [x, y] = toPage(click.x, click.y);
      pop(x, y, click.color);
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
    const [x, y] = pending;
    pending = null;
    sending = true;
    lastSent = Date.now();
    try {
      const serverNow = await client.mutation(api.move, { page, sessionId, x, y });
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

  const onMove = (event) => {
    if (!canPoint()) return;
    pending = [event.pageX - center(), event.pageY];
    schedule();
  };
  const onDown = (event) => {
    if (!client || !canPoint()) return;
    client.mutation(api.click, { page, sessionId, x: event.pageX - center(), y: event.pageY }).catch(() => {});
  };
  const onHide = () => {
    if (client && document.visibilityState === "hidden") client.mutation(api.leave, { sessionId }).catch(() => {});
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
    addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    ticker = setInterval(render, 2000); // hide cursors that go quiet between updates
  };

  const stop = () => {
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerdown", onDown);
    removeEventListener("pagehide", onHide);
    document.removeEventListener("visibilitychange", onHide);
    clearInterval(ticker);
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
    for (const { node } of shown.values()) node.remove();
    shown.clear();
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
