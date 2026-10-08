import { useEffect, useState } from "react";
import { readNodeBrowser } from "./requestTask.js";

const COLUMNS = [
  { key: "node", label: "Node" },
  { key: "success", label: "Success" },
  { key: "average", label: "Average" },
  { key: "speed", label: "Speed" },
  { key: "stake", label: "Stake" },
  { key: "sizes", label: "Sizes" },
];

function explorerAddress(address) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function missing(node, key) {
  if (key === "success") return node.successRank == null;
  if (key === "average") return node.averageSeconds == null;
  if (key === "speed") return node.speedRank == null;
  return false;
}

function compare(left, right, key) {
  if (key === "node") return left.id.localeCompare(right.id);
  if (key === "success") return (left.successRank ?? 0) - (right.successRank ?? 0);
  if (key === "average") return (left.averageSeconds ?? 0) - (right.averageSeconds ?? 0);
  if (key === "speed") return (left.speedRank ?? 0) - (right.speedRank ?? 0);
  if (key === "stake") {
    if (left.stake === right.stake) return 0;
    return left.stake > right.stake ? 1 : -1;
  }
  return left.sizes.length - right.sizes.length;
}

export default function NodeBrowser() {
  const [nodes, setNodes] = useState(null);
  const [note, setNote] = useState("Reading active nodes…");
  const [sort, setSort] = useState("node");
  const [dir, setDir] = useState("asc");

  useEffect(() => {
    let stop = false;
    setNodes(null);
    setNote("Reading active nodes…");
    readNodeBrowser()
      .then((next) => {
        if (stop) return;
        setNodes(next);
        setNote(next.length ? "" : "No active nodes are staked on devnet.");
      })
      .catch((err) => {
        if (!stop) setNote(err?.message || "Devnet is not responding.");
      });
    return () => {
      stop = true;
    };
  }, []);

  function toggle(key) {
    if (sort === key) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(key);
    setDir("asc");
  }

  const rows = nodes
    ? [...nodes].sort((left, right) => {
        const leftMissing = missing(left, sort);
        const rightMissing = missing(right, sort);
        if (leftMissing || rightMissing) {
          if (leftMissing && rightMissing) return left.id.localeCompare(right.id);
          return leftMissing ? 1 : -1;
        }
        const value = compare(left, right, sort);
        return dir === "asc" ? value : -value;
      })
    : [];

  return (
    <section className="shell launch browser">
      <p className="kicker">Network</p>
      <h1>Nodes.</h1>
      <p className="lede">
        Every active node. Success is completed tasks over completed plus slashed. Average is the mean reveal time on finalized rounds. Speed is the top, middle, or bottom third by that average. Sizes are the committees this node can be drawn into.
      </p>

      {!nodes ? (
        <p className="hint">{note}</p>
      ) : nodes.length === 0 ? (
        <p className="hint">{note}</p>
      ) : (
        <>
          <div className="sheet">
            <div className="sheet-head">
              {COLUMNS.map((column) => (
                <button
                  key={column.key}
                  type="button"
                  className={sort === column.key ? (dir === "desc" ? "on desc" : "on") : ""}
                  onClick={() => toggle(column.key)}
                >
                  {column.label}
                </button>
              ))}
              <span />
            </div>
            {rows.map((node) => (
              <a
                key={node.address}
                className="sheet-row"
                href={explorerAddress(node.address)}
                target="_blank"
                rel="noreferrer"
              >
                <span className="mono">{node.id}</span>
                <span className="row-meta">
                  <span className={node.success.endsWith("%") ? "mono" : "words"}>{node.success}</span>
                  <span className="mono">{node.average}</span>
                  <span className="mono">{node.speed}</span>
                  <span className="mono">{node.stakeText} SOL</span>
                  <span className="mono">{node.sizesText}</span>
                  <span className="go">Explorer</span>
                </span>
              </a>
            ))}
          </div>
          <p className="hint">
            A node joins a committee of 3, 5, 7, 9, or 11 when at least that many nodes are active. Speed has no fixed cutoff. A node with no reveal time is left out of the thirds, so that column stays blank on the rounds already on devnet.
          </p>
        </>
      )}
    </section>
  );
}
