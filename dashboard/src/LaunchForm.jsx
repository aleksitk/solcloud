import { useEffect, useState } from "react";
import {
  activeNodes,
  buildRequestTask,
  explorerTx,
  nextTaskId,
  readNodes,
  sendSigned,
  solToLamports,
} from "./requestTask.js";
import RoundStatus from "./RoundStatus.jsx";
import { useFunctionChoice } from "./functionChoice.jsx";
import { useWallet } from "./wallet.jsx";

const SIZES = [3, 5, 7, 9, 11];

function thresholdOf(size) {
  return Math.floor(size / 2) + 1;
}

function shortError(err) {
  const message = err?.message || "The wallet did not sign.";
  return message.length > 280 ? `${message.slice(0, 280)}…` : message;
}

export default function LaunchForm({ onOpenFunction }) {
  const wallet = useWallet();
  const { choice } = useFunctionChoice();
  const [size, setSize] = useState(3);
  const [reward, setReward] = useState("0.05");
  const [seed, setSeed] = useState("1");
  const [maze, setMaze] = useState("512");
  const [review, setReview] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeCount, setActiveCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    readNodes()
      .then((nodes) => {
        if (!cancelled) setActiveCount(activeNodes(nodes).length);
      })
      .catch(() => {
        if (!cancelled) setActiveCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const threshold = thresholdOf(size);
  const rewardNum = Number(reward);
  const seedNum = Number(seed);
  const mazeNum = Number(maze);
  const needsMoreNodes = activeCount !== null && size > activeCount;
  const valid =
    rewardNum > 0 &&
    Number.isInteger(seedNum) &&
    seedNum >= 0 &&
    Number.isInteger(mazeNum) &&
    mazeNum > 0 &&
    activeCount !== null &&
    !needsMoreNodes;

  function clearReview() {
    setReview(null);
    setPhase("idle");
    setResult(null);
    setError("");
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!valid || phase === "reading" || phase === "signing") return;
    setResult(null);
    setError("");
    setPhase("reading");
    try {
      const nodes = activeNodes(await readNodes());
      const picked = nodes.slice(0, size);
      setActiveCount(nodes.length);
      if (picked.length < size) {
        setReview(null);
        setError(`Only ${picked.length} active nodes. Choose a smaller committee.`);
        setPhase("idle");
        return;
      }
      setReview({
        size,
        threshold,
        reward: rewardNum,
        seed: seedNum,
        maze: mazeNum,
        nodes: picked.map((node) => ({ id: node.id, owner: node.owner })),
      });
      setPhase("idle");
    } catch (err) {
      setReview(null);
      setError(shortError(err));
      setPhase("error");
    }
  }

  async function sign() {
    if (!review || !wallet.address || phase === "preparing" || phase === "signing" || phase === "sending") return;
    setPhase("preparing");
    setError("");
    try {
      const { id } = await nextTaskId();
      const built = await buildRequestTask({
        requester: wallet.address,
        taskId: id,
        rewardLamports: solToLamports(reward),
        seed: review.seed,
        mazeSize: review.maze,
        wasmHash: choice.hash,
        committeeSize: review.size,
        owners: review.nodes.map((node) => node.owner),
      });
      setPhase("signing");
      const signed = await wallet.signTransaction(built.tx);
      setPhase("sending");
      const signature = await sendSigned(signed, built.blockhash, built.lastValidBlockHeight);
      setResult({
        id: id.toString(),
        task: built.task.toBase58(),
        signature,
      });
      setPhase("done");
      wallet.refreshBalance();
    } catch (err) {
      setError(shortError(err));
      setPhase("error");
    }
  }

  return (
    <section className="shell launch">
      <p className="kicker">New task</p>
      <h1>Escrow a round.</h1>
      <p className="lede">
        Pick the committee, the reward, and the input. The hash below is the Wasm this task will name.
        The reward stays locked until the round settles.
      </p>

      <form className="launch-form" onSubmit={onSubmit}>
        <fieldset>
          <legend>Committee</legend>
          <div className="sizes">
            {SIZES.map((n) => (
              <button
                key={n}
                type="button"
                className={n === size ? "size on" : "size"}
                onClick={() => {
                  setSize(n);
                  clearReview();
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="hint">
            {threshold} of {size} must agree.
            {activeCount === null
              ? " Reading staked nodes…"
              : needsMoreNodes
                ? ` Only ${activeCount} ${activeCount === 1 ? "node is" : "nodes are"} active on devnet.`
                : ""}
          </p>
        </fieldset>

        <div className="fields">
          <label>
            Reward, SOL
            <input
              inputMode="decimal"
              value={reward}
              onChange={(event) => {
                setReward(event.target.value);
                clearReview();
              }}
            />
          </label>
          <label>
            Maze seed
            <input
              inputMode="numeric"
              value={seed}
              onChange={(event) => {
                setSeed(event.target.value);
                clearReview();
              }}
            />
          </label>
          <label>
            Maze size
            <input
              inputMode="numeric"
              value={maze}
              onChange={(event) => {
                setMaze(event.target.value);
                clearReview();
              }}
            />
          </label>
        </div>

        <button type="button" className="wasm wasm-link" onClick={onOpenFunction}>
          {choice.name} · {choice.hash.slice(0, 12)}…{choice.hash.slice(-8)}
        </button>

        <button className="submit" type="submit" disabled={!valid || phase === "reading" || phase === "preparing" || phase === "signing" || phase === "sending"}>
          {phase === "reading" ? "Reading nodes…" : "Review request"}
        </button>
      </form>

      {error && !review && <p className="form-error">{error}</p>}

      {review && (
        <div className="review">
          <p>
            Escrow <b>{review.reward} SOL</b>. Maze seed {review.seed}, size {review.maze}.
          </p>
          <p>
            Majority is <b>{review.threshold} of {review.size}</b>. Nodes {review.nodes.map((node) => node.id).join(", ")}.
          </p>
          <p>The wallet signs this on Devnet.</p>
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
                    : "Sign and escrow"}
            </button>
          ) : (
            <p>Connect a Devnet wallet to sign.</p>
          )}
          {result && (
            <>
              <p>
                Task {result.id} is on devnet.{" "}
                <a href={explorerTx(result.signature)} target="_blank" rel="noreferrer">
                  View the transaction
                </a>
              </p>
              <RoundStatus taskId={result.id} label="This round" compact />
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </section>
  );
}
