import { useEffect, useState } from "react";
import { readNodes, readSettledRounds } from "./requestTask.js";

// Count from zero to the value once, when it first arrives.
function Count({ value, digits = 0 }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / 900);
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return shown.toFixed(digits);
}

export default function NetworkStats({ onOpen }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all([readNodes(), readSettledRounds()])
      .then(([nodes, rounds]) => {
        if (!live) return;
        const paid = rounds.filter((round) => round.status === "Finalized").length;
        const stake = Number(nodes.reduce((sum, node) => sum + node.stake, 0n)) / 1_000_000_000;
        setStats({
          nodes: nodes.length,
          stake,
          stakeDigits: stake % 1 === 0 ? 0 : 1,
          rounds: rounds.length,
          agreed: rounds.length ? Math.round((paid / rounds.length) * 100) : null,
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const blank = "—";
  return (
    <div className="stats-band">
      <div className="stats-top">
        <span className="badge">
          <i className="dot live" />
          Live on devnet
        </span>
        <button type="button" className="text-link" onClick={onOpen}>
          Open the network →
        </button>
      </div>
      <dl className="stats">
        <div>
          <dt>Nodes staked</dt>
          <dd>{stats ? <Count value={stats.nodes} /> : blank}</dd>
        </div>
        <div>
          <dt>Total staked</dt>
          <dd>
            {stats ? <Count value={stats.stake} digits={stats.stakeDigits} /> : blank}
            <small>SOL</small>
          </dd>
        </div>
        <div>
          <dt>Rounds settled</dt>
          <dd>{stats ? <Count value={stats.rounds} /> : blank}</dd>
        </div>
        <div>
          <dt>Settled by majority</dt>
          <dd>
            {stats?.agreed == null ? blank : <Count value={stats.agreed} />}
            <small>%</small>
          </dd>
        </div>
      </dl>
    </div>
  );
}
