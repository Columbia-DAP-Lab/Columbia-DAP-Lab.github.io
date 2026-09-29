/**
 * Google as the OIDC provider.
 *
 * The admin UI is a static page on GitHub Pages with no server to hold a session,
 * so it signs in with Google Identity Services in the browser and sends the
 * resulting ID token to Convex, which validates it against Google's JWKS. That is
 * why this is plain OIDC rather than Convex Auth, which is still beta and assumes a
 * React app it can own the session for.
 *
 * Because LionMail is Columbia's Google Workspace, signing in with a
 * uni@columbia.edu account goes through Columbia's login page with Duo, which is
 * what "Columbia login" means here. It is not Shibboleth/CAS — that would need
 * Columbia IT to register the service.
 *
 * GOOGLE_CLIENT_ID is a deployment environment variable, set with:
 *   npx convex env set GOOGLE_CLIENT_ID <id>.apps.googleusercontent.com
 */
export default {
  providers: [
    {
      domain: "https://accounts.google.com",
      applicationID: process.env.GOOGLE_CLIENT_ID,
    },
  ],
};
