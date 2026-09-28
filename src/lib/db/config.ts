/**
 * Where the data lives, decided from the environment alone (no database imports), so the request proxy can use it.
 *
 * Serverless hosts (Vercel, Lambda, Netlify) run every page and API route as a separate function with its own /tmp:
 * a SQLite file there would be private to one function, so an event created through the API would not exist for the
 * page that renders it. On those hosts a hosted database (Turso) is required.
 */
export function remoteDatabase(): { url: string; authToken?: string } | null {
  const e = process.env;
  const url = e.TURSO_DATABASE_URL || e.TURSO_URL || e.LIBSQL_URL || (e.DATABASE_URL && /^(libsql|https?|wss?):\/\//.test(e.DATABASE_URL) ? e.DATABASE_URL : "");
  if (!url) return null;
  return { url, authToken: e.TURSO_AUTH_TOKEN || e.LIBSQL_AUTH_TOKEN || e.DATABASE_AUTH_TOKEN || undefined };
}

export function onServerless(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

/** True when the app cannot run correctly yet: a serverless host with no hosted database connected. */
export function databaseMissing(): boolean {
  return onServerless() && !remoteDatabase() && !process.env.DATABASE_PATH;
}

export const DATABASE_SETUP_MESSAGE =
  "No database is connected. On this host every page and API route runs as its own serverless function, so the app needs a shared database: in Vercel, open the project → Storage → Create Database → Turso, connect it to this project, and redeploy.";
