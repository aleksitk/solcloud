function explorerAddress(address) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export default function NodeHistory({ rows, note }) {
  return (
    <div className="card flush">
      <div className="card-head">
        <h2>Rounds</h2>
        <span>{rows ? `${rows.length} recorded` : ""}</span>
      </div>
      {!rows || rows.length === 0 ? (
        <p className="empty">{note}</p>
      ) : (
        <div className="table-wrap">
          <div className="table" style={{ "--cols": "56px minmax(140px, 1.4fr) 1fr 1fr 70px", "--min": "520px" }}>
            <div className="table-head">
              <span>Round</span>
              <span>Outcome</span>
              <span>Committee</span>
              <span>Reveal time</span>
              <span />
            </div>
            {rows.map((row) => (
              <a key={row.address} className="table-row" href={explorerAddress(row.address)} target="_blank" rel="noreferrer">
                <span className="mono">{row.id}</span>
                <span className="state">
                  <i className={`dot ${row.tone}`} />
                  {row.outcome}
                </span>
                <span className="mono">{row.committee}</span>
                <span className="mono">{row.time}</span>
                <span className="go">Explorer ↗</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
