import { useEffect, useState } from "react";

const PHASES = ["Request", "Commit", "Reveal", "Settle"];
const FOOT = [
  ["The task goes out to the committee", "0.05 SOL locked"],
  ["Each node posts a hash of its answer", "answers hidden"],
  ["Answers open. One does not match", "4 of 5 agree"],
  ["The majority is paid. The odd one is slashed", "0.05 SOL paid"],
];

const CX = 230;
const CY = 168;
const RADIUS = 122;

// Five nodes on a ring around the task. The fourth one returns a different answer.
const PEERS = [0, 1, 2, 3, 4].map((index) => {
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return {
    id: index,
    x: CX + Math.cos(angle) * RADIUS,
    y: CY + Math.sin(angle) * RADIUS,
    agree: index !== 3,
    output: index !== 3 ? "42" : "17",
    labelY: Math.sin(angle) > 0.3 ? 40 : -34,
  };
});

export default function Committee() {
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [phase, setPhase] = useState(still ? 3 : 0);

  useEffect(() => {
    if (still) return undefined;
    // The settled state holds longer than the three before it.
    const timer = setTimeout(() => setPhase((now) => (now + 1) % 4), phase === 3 ? 3200 : 1700);
    return () => clearTimeout(timer);
  }, [phase, still]);

  return (
    <aside className="committee" aria-label="How a round is settled">
      <svg viewBox="0 0 460 336" role="img" aria-label="A task sent to five nodes. Four agree and are paid.">
        <circle className="orbit" cx={CX} cy={CY} r={RADIUS} />
        {PEERS.map((peer) => (
          <line
            key={`wire-${peer.id}`}
            className={phase === 3 && peer.agree ? "wire paid" : "wire"}
            x1={CX}
            y1={CY}
            x2={peer.x}
            y2={peer.y}
          />
        ))}

        {PEERS.map((peer) => {
          // Out to the node with the task, back to the centre with the reward.
          const home = phase === 3;
          const shown = phase === 0 || (phase === 3 && peer.agree);
          return (
            <circle
              key={`packet-${peer.id}`}
              className="packet"
              r="4"
              cx={CX}
              cy={CY}
              style={{
                transform: home ? "none" : `translate(${peer.x - CX}px, ${peer.y - CY}px)`,
                opacity: shown ? 1 : 0,
              }}
            />
          );
        })}

        {PEERS.map((peer) => {
          const state =
            phase === 1 ? "sealed" : phase >= 2 ? (peer.agree ? "agree" : phase === 3 ? "differ cut" : "differ") : "";
          return (
            <g key={peer.id} className={`peer ${state}`}>
              <circle cx={peer.x} cy={peer.y} r="23" />
              <circle className="ring" cx={peer.x} cy={peer.y} r="29" />
              <text x={peer.x} y={peer.y}>
                {phase === 0 ? "·" : phase === 1 ? "#" : peer.output}
              </text>
              <text className="tag" x={peer.x} y={peer.y + peer.labelY}>
                {phase === 3 ? (peer.agree ? "paid" : "slashed") : `node ${peer.id + 1}`}
              </text>
            </g>
          );
        })}

        <g className={phase === 3 ? "core done" : "core"}>
          <rect x={CX - 34} y={CY - 34} width="68" height="68" rx="16" />
          <text x={CX} y={CY}>
            {phase === 3 ? "= 42" : "f(x)"}
          </text>
        </g>
      </svg>

      <ol className="phases">
        {PHASES.map((name, index) => (
          <li key={name} className={index === phase ? "on" : index < phase ? "done" : ""}>
            {name}
          </li>
        ))}
      </ol>
      <div className="console-foot">
        <span>{FOOT[phase][0]}</span>
        <b>{FOOT[phase][1]}</b>
      </div>
    </aside>
  );
}
