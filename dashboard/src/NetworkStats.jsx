import { useEffect, useState } from "react";
import { readNodes, readSettledRounds } from "./requestTask.js";

function sol(lamports) {
  const value = Number(lamports) / 1_000_000_000;
  return value.toFixed(value % 1 === 0 ? 0 : 1);
}

export default function NetworkStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all([readNodes(), readSettledRounds()])
      .then(([nodes, rounds]) => {
        if (!live) return;
        const paid = rounds.filter((round) => round.status === "Finalized").length;
        setStats({
          nodes: nodes.length,
          stake: sol(nodes.reduce((sum, node) => sum + node.stake, 0n)),
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
    <dl className="stats">
      <div>
        <dt>Nodes staked</dt>
        <dd>{stats ? stats.nodes : blank}</dd>
      </div>
      <div>
        <dt>Total staked</dt>
        <dd>
          {stats ? stats.stake : blank}
          <small>SOL</small>
        </dd>
      </div>
      <div>
        <dt>Rounds settled</dt>
        <dd>{stats ? stats.rounds : blank}</dd>
      </div>
      <div>
        <dt>Settled by majority</dt>
        <dd>
          {stats?.agreed == null ? blank : stats.agreed}
          <small>%</small>
        </dd>
      </div>
    </dl>
  );
}
