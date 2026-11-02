// A distinct cookie name keeps this portal's session separate from the customer website,
// because browsers share cookies across ports on the same host (e.g. localhost:3000 and :3001).
export const SESSION_COOKIE = process.env.NODE_ENV === "production" && process.env.NEXTAUTH_URL?.startsWith("https://")
  ? "__Secure-motive-portal.session-token"
  : "motive-portal.session-token";