import { useEffect, useState } from "react";
import { readSettledRounds } from "./requestTask.js";

function explorerAddress(address) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export default function RoundHistory() {
  const [rounds, setRounds] = useState(null);
  const [note, setNote] = useState("Reading settled rounds…");

  useEffect(() => {
    let stop = false;
    let running = false;

    async function load() {
      if (running) return;
      running = true;
      try {
        const next = await readSettledRounds();
        if (stop) return;
        setRounds(next);
        setNote(next.length ? "" : "No round has settled yet.");
      } catch (err) {
        if (!stop) setNote(err?.message || "Devnet is not responding.");
      } finally {
        running = false;
      }
    }

    load();
    const timer = setInterval(load, 20000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      <div className="ledger-head">
        <h2>Settled rounds</h2>
        <span>{rounds ? `Devnet · ${rounds.length}` : "Devnet"}</span>
      </div>
      {!rounds ? (
        <p className="live-note">{note}</p>
      ) : (
        <div className="sheet">
          <div className="sheet-head">
            <span>Round</span>
            <span>Status</span>
            <span>Agreement</span>
            <span>Effect</span>
            <span />
          </div>
          {rounds.map((round) => (
            <a
              key={round.id}
              className="sheet-row"
              href={explorerAddress(round.address)}
              target="_blank"
              rel="noreferrer"
            >
              <span className="mono">{round.id}</span>
              <span className="status">
                <b>
                  <i className={round.tone} />
                  {round.status}
                </b>
                <em>{round.title}</em>
              </span>
              <span className="row-meta">
                <span className="mono agree">
                  <b>{round.agreement}</b>
                  <em>need {round.threshold}</em>
                </span>
                <span className={`mono amount ${round.tone}`}>{round.effect}</span>
                <span className="go">Explorer</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
