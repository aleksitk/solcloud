import { useEffect, useState } from "react";
import { devnetNote, readNodes } from "./requestTask.js";

function explorerAddress(address) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export default function NodeList() {
  const [nodes, setNodes] = useState(null);
  const [note, setNote] = useState("Reading the nodes…");

  useEffect(() => {
    let stop = false;
    let running = false;

    async function load() {
      if (running) return;
      running = true;
      try {
        const next = await readNodes();
        if (stop) return;
        setNodes(next);
        setNote(next.length ? "" : "No nodes are staked on devnet.");
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

  return (
    <>
      <div className="card-head">
        <h2>Nodes</h2>
        <span>{nodes ? `${nodes.length} staked` : ""}</span>
      </div>
      {!nodes || nodes.length === 0 ? (
        <p className="empty">{note}</p>
      ) : (
        <div className="table" style={{ "--cols": "minmax(0, 1fr) 84px 92px" }}>
          {nodes.map((node) => (
            <a key={node.address} className="table-row" href={explorerAddress(node.address)} target="_blank" rel="noreferrer">
              <span className="mono">{node.id}</span>
              <span className="state">
                <i className={`dot ${node.tone}`} />
                {node.status}
              </span>
              <span className="mono">{node.stakeText} SOL</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
