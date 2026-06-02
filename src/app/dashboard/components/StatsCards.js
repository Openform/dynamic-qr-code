'use client';

export default function StatsCards({ totalQRCodes = 0, totalScans = 0 }) {
  return (
    <div style={styles.row}>
      {/* Total QR Codes */}
      <div className="glass-card" style={styles.card}>
        <div style={styles.cardContent}>
          <div>
            <p style={styles.cardLabel}>Total QR Codes</p>
            <p className="gradient-text" style={styles.cardValue}>
              {totalQRCodes}
            </p>
          </div>
          <div style={styles.icon}>📊</div>
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
          <div style={styles.icon}>📱</div>
        </div>
      </div>
    </div>
  );
}

const styles = {
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
    fontSize: '2.4rem',
    opacity: 0.9,
  },
};
