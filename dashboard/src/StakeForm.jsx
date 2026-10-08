import { useEffect, useState } from "react";
import {
  buildRegisterNode,
  explorerTx,
  findNode,
  readMinStake,
  sendSigned,
  solToLamports,
} from "./requestTask.js";
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
      return undefined;
    }
    findNode(wallet.address)
      .then((node) => {
        if (live) setExisting(node);
      })
      .catch(() => {
        if (live) setExisting(null);
      });
    return () => {
      live = false;
    };
  }, [wallet.address, result]);

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
      <p className="kicker">Join</p>
      <h1>Stake a node.</h1>
      <p className="lede">
        Lock at least {solLabel(minStake)} SOL from this wallet. That wallet becomes a node on devnet.
        The stake stays in the node account.
      </p>

      {existing ? (
        <div className="review">
          <p>This wallet is already a node. Stake {solLabel(existing.stake)} SOL.</p>
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
