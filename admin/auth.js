// Google sign-in for the admin page, handing the ID token to Convex.
//
// Google Identity Services runs in the browser and returns a signed ID token.
// Convex validates it against Google's keys (convex/auth.config.ts) and every
// function reads the email from that — nothing here is trusted on its own. There
// is no client secret and no session server: the token is the session.
//
// ID tokens last an hour and cannot be refreshed silently the way an OAuth access
// token can. When one expires we ask Google again with auto-select, which re-issues
// without a click for someone who has signed in here before; failing that, the page
// shows the sign-in button again.

const STORAGE_KEY = "daplab-admin-id-token";
const REFRESH_TIMEOUT_MS = 8000;

/** Seconds-since-epoch `exp` of a JWT, in milliseconds. */
const expiresAt = (token) => {
  const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(payload)).exp * 1000;
};

const fresh = (token) => token !== null && expiresAt(token) - Date.now() > 60_000;

const loadGoogle = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve(window.google.accounts.id);
    script.onerror = () => reject(new Error("Could not load Google sign-in."));
    document.head.append(script);
  });

/**
 * Wire Google sign-in to a Convex client.
 *
 * `onChange(signedIn)` fires whenever Convex accepts or drops the token — which,
 * unlike Google's callback, means the backend agrees the user is signed in.
 */
export async function initAuth({ client, googleClientId, button, onChange }) {
  const gis = await loadGoogle();
  let token = sessionStorage.getItem(STORAGE_KEY);
  let waiting = [];

  const store = (credential) => {
    token = credential;
    if (credential) sessionStorage.setItem(STORAGE_KEY, credential);
    else sessionStorage.removeItem(STORAGE_KEY);
    for (const resolve of waiting) resolve(credential);
    waiting = [];
  };

  /** Ask Google for a new token without a click; null if it will not give one. */
  const refresh = () =>
    new Promise((resolve) => {
      waiting.push(resolve);
      gis.prompt();
      setTimeout(() => resolve(null), REFRESH_TIMEOUT_MS);
    });

  const fetchToken = async ({ forceRefreshToken }) => {
    if (!forceRefreshToken && fresh(token)) return token;
    store(null);
    return await refresh();
  };

  // Once Convex has dropped a token it stops asking for one, so a later sign-in has
  // to hand it fetchToken again; while connected, a new token just resolves the
  // pending fetchToken.
  let connected = false;
  const connect = () => {
    connected = true;
    client.setAuth(fetchToken, (signedIn) => {
      connected = signedIn;
      onChange(signedIn);
    });
  };

  gis.initialize({
    client_id: googleClientId,
    auto_select: true,
    use_fedcm_for_prompt: true,
    callback: ({ credential }) => {
      store(credential);
      if (!connected) connect();
    },
  });
  gis.renderButton(button, { theme: "outline", size: "large", text: "signin_with" });

  if (fresh(token)) connect();
  else gis.prompt();

  return {
    signOut() {
      gis.disableAutoSelect();
      store(null);
      connected = false;
      client.clearAuth();
      onChange(false);
    },
  };
}
