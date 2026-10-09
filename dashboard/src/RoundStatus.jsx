import { useEffect, useState } from "react";
import { describeRound, devnetNote, latestRound, readRound } from "./requestTask.js";

const SETTLED = new Set(["Finalized", "Failed", "Refunded"]);

function explorerAddress(address) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export default function RoundStatus({ taskId, label = "Latest round", compact = false }) {
  const [round, setRound] = useState(null);
  const [note, setNote] = useState("Reading the round…");

  useEffect(() => {
    let stop = false;
    let timer = 0;
    let running = false;

    async function load() {
      if (running) return;
      running = true;
      try {
        const next = taskId ? await readRound(BigInt(taskId)) : await latestRound();
        if (stop) return;
        setRound(next);
        setNote(next ? "" : "No round has been opened yet.");
        if (next && SETTLED.has(next.status)) clearInterval(timer);
      } catch (err) {
        if (!stop) setNote(devnetNote(err));
      } finally {
        running = false;
      }
    }

    load();
    timer = setInterval(load, 20000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [taskId]);

  if (!round) {
    return <p className={compact ? "hint" : "empty"}>{note}</p>;
  }

  return (
    <section className={compact ? "round-card compact" : "round-card"} aria-live="polite">
      <div>
        <p className="kicker">{label}</p>
        <h2>
          <i className={`dot ${round.tone}`} />
          {round.status}
        </h2>
        <p>{describeRound(round)}</p>
        {!compact && (
          <div className="meters">
            {[
              ["Commits", round.commits],
              ["Reveals", round.reveals],
            ].map(([name, count]) => (
              <div key={name}>
                <span>
                  {name} {count}/{round.committee}
                </span>
                <i>
                  <b style={{ width: `${(count / round.committee) * 100}%` }} />
                </i>
              </div>
            ))}
          </div>
        )}
      </div>
      <a href={explorerAddress(round.address)} target="_blank" rel="noreferrer">
        Round {round.id} ↗
      </a>
    </section>
  );
}
