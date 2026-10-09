import { useEffect, useState } from "react";
import { devnetNote, readSettledRounds } from "./requestTask.js";

function explorerAddress(address) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

const COLS = "56px minmax(150px, 1.4fr) minmax(90px, 1fr) minmax(90px, 1fr) 70px";

export default function RoundHistory({ limit }) {
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
        if (!stop) setNote(devnetNote(err));
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

  const shown = rounds && limit ? rounds.slice(0, limit) : rounds;

  return (
    <>
      <div className="card-head">
        <h2>Settled rounds</h2>
        <span>{rounds ? `${rounds.length} settled` : ""}</span>
      </div>
      {!rounds || rounds.length === 0 ? (
        <p className="empty">{note}</p>
      ) : (
        <div className="table-wrap">
          <div className="table" style={{ "--cols": COLS, "--min": "560px" }}>
            <div className="table-head">
              <span>Round</span>
              <span>Status</span>
              <span>Agreement</span>
              <span>Reward</span>
              <span />
            </div>
            {shown.map((round) => (
              <a key={round.id} className="table-row" href={explorerAddress(round.address)} target="_blank" rel="noreferrer">
                <span className="mono">{round.id}</span>
                <span className="state">
                  <i className={`dot ${round.tone}`} />
                  {round.status}
                  <small>{round.title}</small>
                </span>
                <span className="mono">
                  {round.agreement} <span className="muted">· need {round.threshold}</span>
                </span>
                <span className={`mono amount ${round.tone}`}>{round.effect}</span>
                <span className="go">Explorer ↗</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
