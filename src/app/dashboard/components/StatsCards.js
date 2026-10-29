'use client';

import { PackageIcon, QrCodeIcon, ScanIcon } from '@/app/components/icons';

export default function StatsCards({ totalQRCodes = 0, totalScans = 0, plan = null }) {
  return (
    <div style={styles.row}>
      {/* Package & usage */}
      {plan && <PackageCard plan={plan} used={totalQRCodes} />}

      {/* Total QR Codes */}
      <div className="glass-card" style={styles.card}>
        <div style={styles.cardContent}>
          <div>
            <p style={styles.cardLabel}>Total QR Codes</p>
            <p className="gradient-text" style={styles.cardValue}>
              {totalQRCodes}
            </p>
          </div>
          <div style={styles.icon}>
            <QrCodeIcon size={26} strokeWidth={1.75} />
          </div>
        </div>
      </div>

      {/* Total Scans */}
      <div className="glass-card" style={styles.card}>
        <div style={styles.cardContent}>
          <div>
            <p style={styles.cardLabel}>Total Scans</p>
            <p className="gradient-text" style={styles.cardValue}>
              {totalScans}
            </p>
          </div>
          <div style={styles.icon}>
            <ScanIcon size={26} strokeWidth={1.75} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The account's package, e.g. "Starter · 3 of 5 codes used", with a bar. */
function PackageCard({ plan, used }) {
  const unlimited = plan.limit === null || plan.limit === undefined;
  const atLimit = !unlimited && used >= plan.limit;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / plan.limit) * 100));

  return (
    <div className="glass-card" style={styles.card} id="package-card">
      <div style={styles.cardContent}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={styles.cardLabel}>Package</p>
          <p className="gradient-text" style={styles.cardValue}>
            {plan.name}
          </p>
          <p style={{ ...styles.cardSub, color: atLimit ? 'var(--warning)' : styles.cardSub.color }}>
            {unlimited
              ? `${used} codes · unlimited`
              : `${used} of ${plan.limit} codes used`}
          </p>
          {!unlimited && (
            <div style={styles.bar} aria-hidden="true">
              <div
                style={{
                  ...styles.barFill,
                  width: `${pct}%`,
                  background: atLimit ? 'var(--warning)' : 'var(--gradient-primary)',
                }}
              />
            </div>
          )}
        </div>
        <div style={styles.icon}>
          <PackageIcon size={26} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

const styles = {
  cardSub: {
    fontSize: '0.82rem',
    color: 'var(--text-secondary)',
    marginTop: '4px',
  },
  bar: {
    marginTop: '10px',
    height: '4px',
    width: '100%',
    maxWidth: '180px',
    borderRadius: '9999px',
    background: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '9999px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
  },
  card: {
    padding: '24px 28px',
  },
  cardContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  cardLabel: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    fontWeight: 500,
  },
  cardValue: {
    fontSize: '2.2rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  icon: {
    flex: 'none',
    width: '52px',
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '14px',
    background: 'rgba(0, 212, 255, 0.08)',
    border: '1px solid rgba(0, 212, 255, 0.18)',
    color: 'var(--cyan)',
  },
};
