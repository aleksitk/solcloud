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
import NodeHistory from "./NodeHistory.jsx";
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

  return (
    <section className="shell launch">
      <p className="kicker">{existing ? "Operator" : "Join"}</p>
      <h1>{existing ? "My node." : "Stake a node."}</h1>
      <p className="lede">
        {existing
          ? "Stake, status, and the rounds this node won or lost. The chain writes these when a round settles."
          : `Lock at least ${solLabel(minStake)} SOL from this wallet. That wallet becomes a node on devnet. The stake stays in the node account.`}
      </p>

      <EnvCheck />

      {lookup === "reading" ? (
        <p className="hint">Reading this wallet's node…</p>
      ) : existing ? (
        <div className="mine">
          <div className="ledger-head">
            <h2>My node</h2>
            <span className="status">
              <b>
                <i className={existing.tone} />
                {existing.status}
              </b>
            </span>
          </div>
          <dl className="mine-stats">
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
              <dt>Average</dt>
              <dd>{rounds ? averageCompletion(rounds) : "—"}</dd>
            </div>
          </dl>
          <p className="hint">
            <a href={`https://explorer.solana.com/address/${existing.address}?cluster=devnet`} target="_blank" rel="noreferrer">
              View the node account
            </a>
          </p>
        </div>
      ) : (
        <form className="launch-form" onSubmit={onSubmit}>
          <label className="stake-field">
            Stake, SOL
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
          <p className="hint">Minimum is {solLabel(minStake)} SOL.</p>
          <button className="submit" type="submit" disabled={!valid || phase === "preparing" || phase === "signing" || phase === "sending"}>
            Review stake
          </button>
        </form>
      )}

      {existing ? <NodeHistory rows={rounds} note={roundsNote} /> : null}

      {review && !existing && (
        <div className="review">
          <p>
            Lock <b>{review.stake} SOL</b>. The wallet signs this on Devnet.
          </p>
          {wallet.address ? (
            <button
              className="submit"
              type="button"
              disabled={phase === "preparing" || phase === "signing" || phase === "sending"}
              onClick={sign}
            >
              {phase === "preparing"
                ? "Preparing the transaction…"
                : phase === "signing"
                  ? "Waiting for the wallet…"
                  : phase === "sending"
                    ? "Confirming on devnet…"
                    : "Sign and stake"}
            </button>
          ) : (
            <p>Connect a Devnet wallet to sign.</p>
          )}
          {result && (
            <p>
              The node is on devnet.{" "}
              <a href={explorerTx(result.signature)} target="_blank" rel="noreferrer">
                View the transaction
              </a>
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </section>
  );
}
