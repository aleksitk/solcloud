import { useEffect, useState } from "react";
import { readNodeHistory } from "./requestTask.js";

function explorerAddress(address) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export default function NodeHistory({ owner }) {
  const [rows, setRows] = useState(null);
  const [note, setNote] = useState("Reading this node's rounds…");

  useEffect(() => {
    let stop = false;
    setRows(null);
    setNote("Reading this node's rounds…");

    async function load() {
      try {
        const next = await readNodeHistory(owner);
        if (stop) return;
        setRows(next);
        setNote(next.length ? "" : "This node has no rounds yet.");
      } catch (err) {
        if (!stop) setNote(err?.message || "Devnet is not responding.");
      }
    }

    load();
    return () => {
      stop = true;
    };
  }, [owner]);

  return (
    <div className="mine-history">
      <div className="ledger-head">
        <h2>Rounds</h2>
        <span>{rows ? `${rows.length} recorded` : "Recorded"}</span>
      </div>
      {!rows ? (
        <p className="hint">{note}</p>
      ) : rows.length === 0 ? (
        <p className="hint">{note}</p>
      ) : (
        <div className="sheet">
          <div className="sheet-head">
            <span>Round</span>
            <span>Outcome</span>
            <span>Committee</span>
            <span>Time</span>
            <span />
          </div>
          {rows.map((row) => (
            <a
              key={row.address}
              className="sheet-row"
              href={explorerAddress(row.address)}
              target="_blank"
              rel="noreferrer"
            >
              <span className="mono">{row.id}</span>
              <span className="status">
                <b>
                  <i className={row.tone} />
                  {row.outcome}
                </b>
              </span>
              <span className="row-meta">
                <span className="mono">{row.committee}</span>
                <span className="mono">{row.time}</span>
                <span className="go">Explorer</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
