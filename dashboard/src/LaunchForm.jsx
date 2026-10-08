import { useState } from "react";
import {
  WASM_HASH,
  buildRequestTask,
  explorerTx,
  nextTaskId,
  sendSigned,
  solToLamports,
} from "./requestTask.js";
import RoundStatus from "./RoundStatus.jsx";
import { useWallet } from "./wallet.jsx";

const SIZES = [3, 5, 7, 9, 11];
const STAKED_NODES = 3;

function thresholdOf(size) {
  return Math.floor(size / 2) + 1;
}

function shortError(err) {
  const message = err?.message || "The wallet did not sign.";
  return message.length > 280 ? `${message.slice(0, 280)}…` : message;
}

export default function LaunchForm({ onOpenFunction }) {
  const wallet = useWallet();
  const [size, setSize] = useState(3);
  const [reward, setReward] = useState("0.05");
  const [seed, setSeed] = useState("1");
  const [maze, setMaze] = useState("512");
  const [review, setReview] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const threshold = thresholdOf(size);
  const rewardNum = Number(reward);
  const seedNum = Number(seed);
  const mazeNum = Number(maze);
  const needsMoreNodes = size > STAKED_NODES;
  const valid =
    rewardNum > 0 &&
    Number.isInteger(seedNum) &&
    seedNum >= 0 &&
    Number.isInteger(mazeNum) &&
    mazeNum > 0 &&
    !needsMoreNodes;

  function clearReview() {
    setReview(null);
    setPhase("idle");
    setResult(null);
    setError("");
  }

  function onSubmit(event) {
    event.preventDefault();
    if (!valid || phase === "signing") return;
    setResult(null);
    setError("");
    setPhase("idle");
    setReview({ size, threshold, reward: rewardNum, seed: seedNum, maze: mazeNum });
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
        The maze program is already registered. Pick the committee, the reward, and the input.
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
            {needsMoreNodes ? " Only 3 nodes are staked on devnet." : ""}
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
          Labyrinth · {WASM_HASH.slice(0, 12)}…{WASM_HASH.slice(-8)}
        </button>

        <button className="submit" type="submit" disabled={!valid || phase === "preparing" || phase === "signing" || phase === "sending"}>
          Review request
        </button>
      </form>

      {review && (
        <div className="review">
          <p>
            Escrow <b>{review.reward} SOL</b>. Maze seed {review.seed}, size {review.maze}.
          </p>
          <p>
            Majority is <b>{review.threshold} of {review.size}</b>. The wallet signs this on Devnet.
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
