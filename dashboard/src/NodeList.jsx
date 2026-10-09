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

  if (!nodes) {
    return <p className="live-note ledger-follow">{note}</p>;
  }

  return (
    <div className="ledger-follow">
      <div className="ledger-head">
        <h2>Nodes</h2>
        <span>{nodes.length} staked</span>
      </div>
      <div className="sheet">
        <div className="sheet-head nodes-head">
          <span>Node</span>
          <span>Status</span>
          <span>Stake</span>
          <span />
        </div>
        {nodes.map((node) => (
          <a
            key={node.address}
            className="sheet-row nodes-row"
            href={explorerAddress(node.address)}
            target="_blank"
            rel="noreferrer"
          >
            <span className="mono">{node.id}</span>
            <span className="status">
              <b>
                <i className={node.tone} />
                {node.status}
              </b>
            </span>
            <span className={`mono amount ${node.reduced ? "bad" : "good"}`}>{node.stakeText} SOL</span>
            <span className="go">Explorer</span>
          </a>
        ))}
      </div>
    </div>
  );
}
