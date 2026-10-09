import { useEffect, useState } from "react";
import { devnetNote, readNodeBrowser } from "./requestTask.js";

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
        if (!stop) setNote(devnetNote(err));
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

  if (!nodes || nodes.length === 0) {
    return (
      <div className="card flush">
        <p className="empty">{note}</p>
      </div>
    );
  }

  return (
    <>
      <div className="card flush">
        <div className="table-wrap">
          <div className="table" style={{ "--cols": "minmax(110px, 1.2fr) 1fr 1fr 1fr 1fr 1.2fr 70px", "--min": "760px" }}>
            <div className="table-head">
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
              <a key={node.address} className="table-row" href={explorerAddress(node.address)} target="_blank" rel="noreferrer">
                <span className="mono">{node.id}</span>
                <span className={node.success.endsWith("%") ? "mono" : "muted"}>{node.success}</span>
                <span className="mono">{node.average}</span>
                <span>{node.speed}</span>
                <span className="mono">{node.stakeText} SOL</span>
                <span className="mono">{node.sizesText}</span>
                <span className="go">Explorer ↗</span>
              </a>
            ))}
          </div>
        </div>
      </div>
      <dl className="legend">
        <div>
          <dt>Success</dt>
          <dd>Completed tasks over completed plus slashed.</dd>
        </div>
        <div>
          <dt>Average</dt>
          <dd>Mean reveal time on finalized rounds.</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>Top, middle, or bottom third by that average.</dd>
        </div>
        <div>
          <dt>Sizes</dt>
          <dd>Committees this node can be drawn into today.</dd>
        </div>
      </dl>
    </>
  );
}
