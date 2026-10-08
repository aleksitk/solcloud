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
    <div className="my-requests">
      <div className="ledger-head">
        <h2>My requests</h2>
        <span>{rows ? `${rows.length} recorded` : "Recorded"}</span>
      </div>
      {!owner ? (
        <p className="hint">Connect a wallet to see the tasks it created.</p>
      ) : !rows ? (
        <p className="hint">{note}</p>
      ) : rows.length === 0 ? (
        <p className="hint">{note}</p>
      ) : (
        <>
          <div className="sheet">
            <div className="sheet-head">
              <span>Round</span>
              <span>Status</span>
              <span>Reward</span>
              <span />
            </div>
            {rows.map((row) => (
              <a
                key={row.address}
                className="sheet-row"
                href={explorerAddress(row.result || row.address)}
                target="_blank"
                rel="noreferrer"
              >
                <span className="mono">{row.id}</span>
                <span className="status">
                  <b>
                    <i className={row.tone} />
                    {row.status}
                  </b>
                </span>
                <span className="row-meta">
                  <span className="mono">{solLabel(row.reward)} SOL</span>
                  <span className="go">{row.result ? "Result" : "Task"}</span>
                </span>
              </a>
            ))}
          </div>
          {settledEmpty ? (
            <p className="hint">A settled round stores 0. The reward was paid or returned.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
