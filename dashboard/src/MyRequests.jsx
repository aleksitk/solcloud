import { useEffect, useState } from "react";
import { devnetNote, readMyRequests } from "./requestTask.js";

function explorerAddress(address) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function solLabel(lamports) {
  const whole = lamports / 1_000_000_000n;
  const frac = (lamports % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export default function MyRequests({ owner, refreshKey }) {
  const [rows, setRows] = useState(null);
  const [note, setNote] = useState("Reading this wallet's tasks…");

  useEffect(() => {
    if (!owner) {
      setRows(null);
      setNote("");
      return undefined;
    }
    let stop = false;
    setRows(null);
    setNote("Reading this wallet's tasks…");

    async function load() {
      try {
        const next = await readMyRequests(owner);
        if (stop) return;
        setRows(next);
        setNote(next.length ? "" : "This wallet has no tasks yet.");
      } catch (err) {
        if (!stop) setNote(devnetNote(err));
      }
    }

    load();
    return () => {
      stop = true;
    };
  }, [owner, refreshKey]);

  const settledEmpty = rows?.some((row) => row.reward === 0n);

  return (
    <div className="card flush">
      <div className="card-head">
        <h2>My requests</h2>
        <span>{rows ? `${rows.length} recorded` : ""}</span>
      </div>
      {!rows || rows.length === 0 ? (
        <p className="empty">{note}</p>
      ) : (
        <>
          <div className="table-wrap">
            <div className="table" style={{ "--cols": "56px minmax(140px, 1.4fr) 1fr 70px", "--min": "440px" }}>
              <div className="table-head">
                <span>Round</span>
                <span>Status</span>
                <span>Escrow left</span>
                <span />
              </div>
              {rows.map((row) => (
                <a key={row.address} className="table-row" href={explorerAddress(row.result || row.address)} target="_blank" rel="noreferrer">
                  <span className="mono">{row.id}</span>
                  <span className="state">
                    <i className={`dot ${row.tone}`} />
                    {row.status}
                  </span>
                  <span className="mono">{solLabel(row.reward)} SOL</span>
                  <span className="go">{row.result ? "Result ↗" : "Task ↗"}</span>
                </a>
              ))}
            </div>
          </div>
          {settledEmpty ? <p className="empty">A settled round holds 0. Its reward was paid or returned.</p> : null}
        </>
      )}
    </div>
  );
}
