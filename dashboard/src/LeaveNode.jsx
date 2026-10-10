import { useEffect, useState } from "react";
import { buildRequestExit, buildWithdrawStake, devnetNote, explorerTx, readExit, sendSigned } from "./requestTask.js";
import { useWallet } from "./wallet.jsx";

function clock(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

// Two steps: leave the registry, then take the stake once the delay has passed.
export default function LeaveNode({ onChange }) {
  const wallet = useWallet();
  const [ticket, setTicket] = useState(undefined);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    readExit(wallet.address)
      .then((next) => {
        if (live) setTicket(next);
      })
      .catch((err) => {
        if (live) setError(devnetNote(err));
      });
    return () => {
      live = false;
    };
  }, [wallet.address, sent]);

  useEffect(() => {
    if (!ticket) return undefined;
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, [ticket]);

  async function send(build) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const built = await build({ owner: wallet.address });
      const signed = await wallet.signTransaction(built.tx);
      const signature = await sendSigned(signed, built.blockhash, built.lastValidBlockHeight);
      setSent(signature);
      wallet.refreshBalance();
      onChange();
    } catch (err) {
      setError(err?.message || "The wallet did not sign.");
    } finally {
      setBusy(false);
    }
  }

  const left = ticket ? Math.max(0, ticket.readyAt - now) : 0;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Leave the network</h3>
        <span>{ticket ? (left ? `ready in ${clock(left)}` : "ready") : ""}</span>
      </div>
      {ticket === undefined ? (
        <p className="hint" style={{ marginTop: 0 }}>
          Reading…
        </p>
      ) : !ticket ? (
        <>
          <ol className="setup">
            <li>
              <strong>Leave</strong>
              <p>The node drops out of the registry, so no new round can pick it.</p>
            </li>
            <li>
              <strong>Wait about 11 minutes</strong>
              <p>Rounds that already picked this node still count. Keep the listener running until they settle.</p>
            </li>
            <li>
              <strong>Withdraw</strong>
              <p>The node account closes and what is left of the stake returns to this wallet.</p>
            </li>
          </ol>
          <div className="row-actions" style={{ marginTop: 20 }}>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => send(buildRequestExit)}>
              {busy ? "Waiting for the wallet…" : "Leave the network"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            {left
              ? "This node is out of the registry. Keep the listener running until the delay ends."
              : "The delay has passed. The stake can go back to this wallet."}
          </p>
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn" disabled={busy || left > 0} onClick={() => send(buildWithdrawStake)}>
              {busy ? "Waiting for the wallet…" : left ? `Withdraw in ${clock(left)}` : "Withdraw stake"}
            </button>
          </div>
        </>
      )}
      {sent && (
        <p className="hint">
          <a href={explorerTx(sent)} target="_blank" rel="noreferrer">
            View the transaction
          </a>
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
