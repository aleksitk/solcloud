import { useEffect, useState } from "react";
import {
  averageCompletion,
  buildRegisterNode,
  explorerTx,
  devnetNote,
  findNode,
  readMinStake,
  readNodeHistory,
  sendSigned,
  solToLamports,
} from "./requestTask.js";
import EnvCheck from "./EnvCheck.jsx";
import LeaveNode from "./LeaveNode.jsx";
import NodeHistory from "./NodeHistory.jsx";
import { ListenerSetup } from "./Setup.jsx";
import { useWallet } from "./wallet.jsx";

function solLabel(lamports) {
  const whole = lamports / 1_000_000_000n;
  const frac = (lamports % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function shortError(err) {
  const message = err?.message || "The wallet did not sign.";
  return message.length > 280 ? `${message.slice(0, 280)}…` : message;
}

export default function StakeForm() {
  const wallet = useWallet();
  const [minStake, setMinStake] = useState(1_000_000_000n);
  const [stake, setStake] = useState("1");
  const [existing, setExisting] = useState(null);
  const [lookup, setLookup] = useState("idle");
  const [rounds, setRounds] = useState(null);
  const [roundsNote, setRoundsNote] = useState("");
  const [review, setReview] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("rounds");

  useEffect(() => {
    let live = true;
    readMinStake()
      .then((amount) => {
        if (live) setMinStake(amount);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    if (!wallet.address) {
      setExisting(null);
      setLookup("idle");
      return undefined;
    }
    setLookup("reading");
    findNode(wallet.address)
      .then((node) => {
        if (!live) return;
        setExisting(node);
        setLookup("ready");
      })
      .catch(() => {
        if (!live) return;
        setExisting(null);
        setLookup("ready");
      });
    return () => {
      live = false;
    };
  }, [wallet.address, result]);

  useEffect(() => {
    if (!existing || !wallet.address) {
      setRounds(null);
      setRoundsNote("");
      return undefined;
    }
    let live = true;
    setRounds(null);
    setRoundsNote("Reading this node's rounds…");
    readNodeHistory(wallet.address)
      .then((next) => {
        if (!live) return;
        setRounds(next);
        setRoundsNote(next.length ? "" : "This node has no rounds yet.");
      })
      .catch((err) => {
        if (!live) return;
        setRounds(null);
        setRoundsNote(devnetNote(err));
      });
    return () => {
      live = false;
    };
  }, [existing, wallet.address]);

  let lamports = 0n;
  try {
    lamports = solToLamports(stake);
  } catch {
    lamports = 0n;
  }
  const valid = lamports >= minStake && !existing;

  function onSubmit(event) {
    event.preventDefault();
    if (!valid || phase === "signing") return;
    setResult(null);
    setError("");
    setPhase("idle");
    setReview({ stake, lamports });
  }

  async function sign() {
    if (!review || !wallet.address || existing || phase === "preparing" || phase === "signing" || phase === "sending") {
      return;
    }
    setPhase("preparing");
    setError("");
    try {
      const built = await buildRegisterNode({
        owner: wallet.address,
        stakeLamports: review.lamports,
      });
      setPhase("signing");
      const signed = await wallet.signTransaction(built.tx);
      setPhase("sending");
      const signature = await sendSigned(signed, built.blockhash, built.lastValidBlockHeight);
      setResult({ address: built.node.toBase58(), signature });
      setPhase("done");
      wallet.refreshBalance();
    } catch (err) {
      setError(shortError(err));
      setPhase("error");
    }
  }

  const busy = phase === "preparing" || phase === "signing" || phase === "sending";

  if (lookup !== "ready") {
    return (
      <div className="card">
        <p className="hint" style={{ marginTop: 0 }}>
          Reading this wallet's node…
        </p>
      </div>
    );
  }

  if (existing) {
    return (
      <>
        <div className="node-bar">
          <span className="badge">
            <i className={`dot ${existing.tone}`} />
            {existing.status}
          </span>
          <a
            className="text-link"
            href={`https://explorer.solana.com/address/${existing.address}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            Node account ↗
          </a>
        </div>
        <dl className="tiles">
          <div>
            <dt>Stake</dt>
            <dd>{solLabel(existing.stake)} SOL</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{existing.completed.toString()}</dd>
          </div>
          <div>
            <dt>Slashed</dt>
            <dd>{existing.slashed.toString()}</dd>
          </div>
          <div>
            <dt>Success</dt>
            <dd className={existing.success.endsWith("%") ? undefined : "words"}>{existing.success}</dd>
          </div>
          <div>
            <dt>Average reveal</dt>
            <dd>{rounds ? averageCompletion(rounds) : "—"}</dd>
          </div>
        </dl>
        <div className="tabs" role="tablist">
          {[
            ["rounds", "Rounds"],
            ["listener", "Listener"],
            ["check", "Machine check"],
            ["leave", "Leave"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "on" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="tab-body" key={tab}>
          {tab === "rounds" ? (
            <NodeHistory rows={rounds} note={roundsNote} />
          ) : tab === "listener" ? (
            <div className="card">
              <ListenerSetup />
            </div>
          ) : tab === "check" ? (
            <EnvCheck />
          ) : (
            <LeaveNode onChange={() => setResult({ changed: Date.now() })} />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="work">
      <div>
        <form className="card" onSubmit={onSubmit}>
          <div className="field-title">
            <i>1</i>
            Stake
          </div>
          <label className="stake-field">
            Amount, SOL
            <input
              inputMode="decimal"
              value={stake}
              onChange={(event) => {
                setStake(event.target.value);
                setReview(null);
                setPhase("idle");
                setResult(null);
                setError("");
              }}
            />
          </label>
          <p className="hint">
            Minimum is {solLabel(minStake)} SOL. The stake stays in the node account. A wrong answer loses part of it.
          </p>
          <div className="row-actions" style={{ marginTop: 18 }}>
            <button className="btn" type="submit" disabled={!valid || busy}>
              Review stake
            </button>
          </div>
        </form>
        <div className="card">
          <div className="field-title">
            <i>2</i>
            Run the listener
          </div>
          <ListenerSetup />
        </div>
      </div>

      <aside className="card work-side">
        <div className="card-head">
          <h3>Summary</h3>
          <span>Devnet</span>
        </div>
        {!review ? (
          <p className="hint" style={{ marginTop: 0 }}>
            Review the stake to see what the wallet will sign.
          </p>
        ) : (
          <>
            <dl className="summary">
              <div>
                <dt>Lock</dt>
                <dd>{review.stake} SOL</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>
                  {wallet.address.slice(0, 4)}…{wallet.address.slice(-4)}
                </dd>
              </div>
            </dl>
            <button className="btn wide" type="button" disabled={busy} onClick={sign}>
              {phase === "preparing"
                ? "Preparing the transaction…"
                : phase === "signing"
                  ? "Waiting for the wallet…"
                  : phase === "sending"
                    ? "Confirming on devnet…"
                    : "Sign and stake"}
            </button>
            {error && <p className="form-error">{error}</p>}
          </>
        )}
      </aside>
    </div>
  );
}
