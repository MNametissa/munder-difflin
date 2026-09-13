import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { PixelButton } from './PixelButton';

/** Billing panel — read-only display of the Ark/ByteDance subscription status:
 *  plan, credits remaining/total (progress bar), free credits, rate limits,
 *  reset date. Auto-refreshes every 5 min. Falls back to "unavailable" when no
 *  Ark credentials are found or the API is unreachable. */

interface BillingStatus {
  plan?: string;
  creditsRemaining?: number;
  creditsTotal?: number;
  freeCreditsAvailable?: number;
  freeCreditsClaimed?: number;
  resetAt?: number;
  rateLimitTier?: string;
  fetchedAt: number;
  raw?: string;
}

const headStyle: CSSProperties = {
  fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px',
  color: 'var(--cth-ink-500)', textTransform: 'uppercase', marginBottom: 6
};

function fmtDate(ms: number): string {
  try { return new Date(ms).toLocaleString(); } catch { return '—'; }
}

export function BillingPanel() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const s = await window.cth.getBillingStatus(force);
      setStatus(s ?? null);
    } catch { setStatus(null); }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load(false);
    const id = setInterval(() => void load(false), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const creditsPct = status?.creditsTotal && status.creditsRemaining != null
    ? Math.max(0, Math.min(100, (status.creditsRemaining / status.creditsTotal) * 100))
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={headStyle}>Ark / ByteDance Subscription</div>
        <PixelButton variant="secondary" size="sm" onClick={() => void load(true)} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </PixelButton>
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>Loading…</div>}

      {!loading && !status && (
        <div style={{ padding: 12, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', fontSize: 12, color: 'var(--cth-ink-500)' }}>
          Subscription data unavailable. Ensure an Ark token (<code>ark-…</code>) and
          ByteDance base URL are configured in one of your Claude profiles' settings.
        </div>
      )}

      {status && (
        <>
          {/* Plan */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>Plan</span>
            <span style={{ fontSize: 14, color: 'var(--cth-ink-900)', fontWeight: 500 }}>{status.plan ?? 'Unknown'}</span>
          </div>

          {/* Credits */}
          {creditsPct != null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>Credits</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 14, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', inset: 0, width: `${creditsPct}%`,
                    background: creditsPct > 25 ? 'var(--cth-mint)' : 'var(--cth-orange, #d97706)'
                  }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--cth-ink-900)', whiteSpace: 'nowrap' }}>
                  {status.creditsRemaining} / {status.creditsTotal}
                </span>
              </div>
            </div>
          )}

          {/* Free credits */}
          {(status.freeCreditsAvailable != null || status.freeCreditsClaimed != null) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>Free credits</span>
              <div style={{ display: 'flex', gap: 16 }}>
                {status.freeCreditsAvailable != null && (
                  <span style={{ fontSize: 12, color: 'var(--cth-ink-900)' }}>
                    Available: <strong>{status.freeCreditsAvailable}</strong>
                  </span>
                )}
                {status.freeCreditsClaimed != null && (
                  <span style={{ fontSize: 12, color: 'var(--cth-ink-900)' }}>
                    Claimed: <strong>{status.freeCreditsClaimed}</strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Rate limits */}
          {status.rateLimitTier && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>Rate limit tier</span>
              <span style={{ fontSize: 12, color: 'var(--cth-ink-900)' }}>{status.rateLimitTier}</span>
            </div>
          )}

          {/* Reset date */}
          {status.resetAt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>Period resets</span>
              <span style={{ fontSize: 12, color: 'var(--cth-ink-900)' }}>{fmtDate(status.resetAt)}</span>
            </div>
          )}

          {/* Fetched at */}
          <div style={{ fontSize: 10, color: 'var(--cth-ink-500)' }}>
            Fetched: {fmtDate(status.fetchedAt)}
          </div>
        </>
      )}
    </div>
  );
}
