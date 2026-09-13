import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { readConfig } from './config';
import { profileDir } from './profiles';

/** Billing/subscription status for the Ark/ByteDance provider. Read-only: the
 *  harness displays it, never mutates it. All network calls are best-effort —
 *  a failure yields null so the UI shows "unavailable" rather than an error.
 *
 *  The Ark billing API is not publicly documented. We probe several likely
 *  endpoints; when none respond we return null. As the API stabilises, the
 *  parsing in `parseBillingResponse` can be tightened without changing the
 *  surface (IPC + UI). */

export interface ArkBillingStatus {
  /** The plan name (e.g. "Coding Plan"). */
  plan?: string;
  /** Remaining credits in the current period. */
  creditsRemaining?: number;
  /** Total credits in the current period (for the progress bar denominator). */
  creditsTotal?: number;
  /** Free credits available to claim. */
  freeCreditsAvailable?: number;
  /** Free credits already claimed. */
  freeCreditsClaimed?: number;
  /** When the current period resets (epoch ms). */
  resetAt?: number;
  /** Rate limits as a human string (e.g. "20x default"). */
  rateLimitTier?: string;
  /** When this data was fetched. */
  fetchedAt: number;
  /** Raw response for debugging (truncated). */
  raw?: string;
}

const TTL_MS = 5 * 60 * 1000; // 5 min cache

function cachePath(): string {
  return join(app.getPath('userData'), 'ark-billing.json');
}

function readCache(): ArkBillingStatus | null {
  try {
    if (!existsSync(cachePath())) return null;
    const raw = JSON.parse(readFileSync(cachePath(), 'utf8'));
    if (raw && typeof raw.fetchedAt === 'number') return raw as ArkBillingStatus;
    return null;
  } catch { return null; }
}

function writeCache(data: ArkBillingStatus): void {
  try {
    mkdirSync(dirname(cachePath()), { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(data));
  } catch { /* cache is best-effort */ }
}

/** Resolve the Ark auth token + base URL from the active Claude profile's env.
 *  The profile's settings.json carries ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL
 *  (routed through Ark). Returns null when no Ark profile is found. */
function arkCredentials(): { token: string; baseUrl: string } | null {
  const cfg = readConfig();
  // The operator's default profile id carries the Ark creds when they set up
  // the modelPicker with Ark models. Probe the default profile first, then
  // every known profile until one has an ark- token.
  const defaultDir = profileDir(cfg.godProvider === 'claude' ? undefined : undefined);
  const dirs: string[] = [];
  if (defaultDir) dirs.push(defaultDir);
  // Fall back to scanning all profiles for an ark- token
  try {
    const home = require('node:os').homedir();
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    for (const entry of readdirSync(home)) {
      if (!entry.startsWith('.claude')) continue;
      const d = join(home, entry);
      try { if (statSync(d).isDirectory() && existsSync(join(d, 'settings.json'))) dirs.push(d); } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  for (const d of dirs) {
    try {
      const settings = JSON.parse(readFileSync(join(d, 'settings.json'), 'utf8'));
      const env = settings?.env ?? {};
      const token = env.ANTHROPIC_AUTH_TOKEN ?? '';
      const baseUrl = env.ANTHROPIC_BASE_URL ?? '';
      if (typeof token === 'string' && token.startsWith('ark-') && typeof baseUrl === 'string' && baseUrl.includes('bytepluses')) {
        return { token, baseUrl };
      }
    } catch { /* settings unreadable */ }
  }
  return null;
}

/** Probe candidate Ark billing endpoints. The API is undocumented, so we try
 *  several likely paths and parse whatever JSON comes back. */
async function fetchBilling(token: string, baseUrl: string): Promise<ArkBillingStatus | null> {
  // Strip the /api/coding suffix to get the base host, then probe common paths.
  const host = baseUrl.replace(/\/api\/.*$/, '');
  const candidates = [
    `${host}/api/v3/billing/subscription`,
    `${host}/api/v3/billing/credits`,
    `${host}/api/v3/credits`,
    `${baseUrl.replace(/\/$/, '')}/billing`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      const parsed = parseBillingResponse(text);
      if (parsed) return { ...parsed, fetchedAt: Date.now(), raw: text.slice(0, 500) };
    } catch { /* try next endpoint */ }
  }
  return null;
}

/** Best-effort parse of an Ark billing JSON response. The shape is unknown, so
 *  we look for common field names across Volcengine APIs. Returns null when
 *  nothing usable is found. */
function parseBillingResponse(text: string): Omit<ArkBillingStatus, 'fetchedAt' | 'raw'> | null {
  try {
    const d = JSON.parse(text);
    const out: Omit<ArkBillingStatus, 'fetchedAt' | 'raw'> = {};
    // Plan name: common keys
    const plan = d?.plan ?? d?.subscription_type ?? d?.tier ?? d?.package ?? d?.plan_name;
    if (typeof plan === 'string') out.plan = plan;
    // Credits remaining
    const remaining = d?.credits_remaining ?? d?.remaining_credits ?? d?.balance ?? d?.credits ?? d?.remaining;
    if (typeof remaining === 'number') out.creditsRemaining = remaining;
    // Credits total
    const total = d?.credits_total ?? d?.total_credits ?? d?.total ?? d?.quota;
    if (typeof total === 'number') out.creditsTotal = total;
    // Free credits
    const freeAvail = d?.free_credits_available ?? d?.free_credits ?? d?.bonus_credits;
    if (typeof freeAvail === 'number') out.freeCreditsAvailable = freeAvail;
    const freeClaimed = d?.free_credits_claimed ?? d?.claimed_credits ?? d?.used_bonus;
    if (typeof freeClaimed === 'number') out.freeCreditsClaimed = freeClaimed;
    // Reset
    const reset = d?.reset_at ?? d?.resets_at ?? d?.period_end ?? d?.expiry;
    if (typeof reset === 'number') out.resetAt = reset * (reset < 1e12 ? 1000 : 1);
    else if (typeof reset === 'string') { const t = Date.parse(reset); if (!isNaN(t)) out.resetAt = t; }
    // Rate limit tier
    const tier = d?.rate_limit_tier ?? d?.tier ?? d?.rate_limit;
    if (typeof tier === 'string') out.rateLimitTier = tier;
    // If nothing useful was extracted, return null
    if (Object.keys(out).length === 0) return null;
    return out;
  } catch { return null; }
}

/** Read the cached billing status, or fetch a fresh one when the cache is stale.
 *  Pass `force: true` to skip the cache (the "Refresh" button). Returns null
 *  when no Ark credentials are found or the API is unreachable. */
export async function getArkBilling(opts: { force?: boolean } = {}): Promise<ArkBillingStatus | null> {
  const cached = readCache();
  if (cached && !opts.force && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  const creds = arkCredentials();
  if (!creds) return cached ?? null;

  const fresh = await fetchBilling(creds.token, creds.baseUrl);
  if (fresh) {
    writeCache(fresh);
    return fresh;
  }
  // Network failed — return the stale cache if we have one
  return cached ?? null;
}
