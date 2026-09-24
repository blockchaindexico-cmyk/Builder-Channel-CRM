/**
 * Content-Security-Policy builder (M01-18). Scripts are locked down with a per-request nonce and
 * `strict-dynamic`; styles allow inline styles because server-rendered `style` attributes (Radix, layout
 * variables) cannot carry nonces — inline styles are a far smaller risk than inline scripts.
 */
export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** Origins the browser talks to directly, e.g. the S3 endpoint for presigned uploads/downloads. */
  storageOrigins?: readonly string[];
  /** Adds `upgrade-insecure-requests` — only when the app is served over HTTPS. */
  upgradeInsecureRequests?: boolean;
}

export function buildContentSecurityPolicy({
  nonce,
  isDev,
  storageOrigins = [],
  upgradeInsecureRequests = false,
}: CspOptions): string {
  const storage = storageOrigins.join(" ");
  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": `'self' blob: data: ${storage}`.trim(),
    "media-src": `'self' blob: ${storage}`.trim(),
    "font-src": "'self' data:",
    "connect-src": `'self' ${storage}${isDev ? " ws: wss:" : ""}`.trim(),
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  };
  const policy = Object.entries(directives).map(([name, value]) => `${name} ${value}`);
  if (upgradeInsecureRequests) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** Origins of the object store that browsers access through presigned URLs. */
export function storageOriginsFromEnv(env: Readonly<Record<string, string | undefined>>): string[] {
  if (env.STORAGE_DRIVER === "memory") return [];
  const endpoint = env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT;
  if (endpoint) {
    try {
      return [new URL(endpoint).origin];
    } catch {
      return [];
    }
  }
  if (env.S3_BUCKET && env.S3_REGION) {
    return [`https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`];
  }
  return [];
}
