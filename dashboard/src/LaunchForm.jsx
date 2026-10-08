import { useEffect, useState } from "react";
import {
  activeNodes,
  buildRequestTask,
  committeeSeed,
  currentSlot,
  explorerTx,
  pickCommittee,
  nextTaskId,
  readActiveOwners,
  readNodes,
  selectCommittee,
  sendSigned,
  solToLamports,
} from "./requestTask.js";
import MyRequests from "./MyRequests.jsx";
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
  const [registry, setRegistry] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    Promise.all([readNodes(), readActiveOwners()])
      .then(([nodes, owners]) => {
        if (cancelled) return;
        if (owners) {
          setRegistry(owners.length);
          setActiveCount(owners.length);
        } else {
          setRegistry(null);
          setActiveCount(activeNodes(nodes).length);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRegistry(null);
          setActiveCount(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const drawsOnChain = typeof registry === "number";
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
      const owners = await readActiveOwners();
      if (owners) {
        setRegistry(owners.length);
        setActiveCount(owners.length);
        if (owners.length < size) {
          setReview(null);
          setError(`Only ${owners.length} nodes are in the on-chain registry. Choose a smaller committee.`);
          setPhase("idle");
          return;
        }
        const { id } = await nextTaskId();
        const slot = await currentSlot();
        const pickedOwners = await selectCommittee(owners, size, slot, id);
        const nodes = await readNodes();
        const byOwner = new Map(nodes.map((node) => [node.owner, node]));
        setReview({
          size,
          threshold,
          reward: rewardNum,
          seed: seedNum,
          maze: mazeNum,
          onChain: true,
          taskId: id.toString(),
          seedSlot: String(slot),
          nodes: pickedOwners.map((owner) => ({
            id: byOwner.get(owner)?.id || `${owner.slice(0, 4)}…${owner.slice(-4)}`,
            owner,
          })),
        });
        setPhase("idle");
        return;
      }

      setRegistry(null);
      const nodes = await readNodes();
      const active = activeNodes(nodes);
      const picked = pickCommittee(active, size, await committeeSeed());
      setActiveCount(active.length);
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
        onChain: false,
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
      let taskId;
      let owners = review.nodes.map((node) => node.owner);
      let seedSlot;
      if (review.onChain) {
        const slot = await currentSlot();
        const registryOwners = await readActiveOwners();
        if (!registryOwners || registryOwners.length < review.size) {
          throw new Error("The node registry changed. Review the request again.");
        }
        const picked = await selectCommittee(
          registryOwners,
          review.size,
          slot,
          BigInt(review.taskId)
        );
        const same =
          picked.length === owners.length &&
          picked.every((owner, index) => owner === owners[index]);
        if (!same) {
          const nodes = await readNodes();
          const byOwner = new Map(nodes.map((node) => [node.owner, node]));
          setReview({
            ...review,
            seedSlot: String(slot),
            nodes: picked.map((owner) => ({
              id: byOwner.get(owner)?.id || `${owner.slice(0, 4)}…${owner.slice(-4)}`,
              owner,
            })),
          });
          setError("The slot draw changed. Check the nodes, then sign.");
          setPhase("idle");
          return;
        }
        taskId = BigInt(review.taskId);
        seedSlot = slot;
        owners = picked;
      } else {
        const next = await nextTaskId();
        taskId = next.id;
      }
      const built = await buildRequestTask({
        requester: wallet.address,
        taskId,
        rewardLamports: solToLamports(reward),
        seed: review.seed,
        mazeSize: review.maze,
        wasmHash: choice.hash,
        committeeSize: review.size,
        owners,
        seedSlot,
      });
      setPhase("signing");
      const signed = await wallet.signTransaction(built.tx);
      setPhase("sending");
      const signature = await sendSigned(signed, built.blockhash, built.lastValidBlockHeight);
      setResult({
        id: taskId.toString(),
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
            {threshold} of {size} must agree.{" "}
            {drawsOnChain
              ? "The program draws the committee from registered nodes, using this slot and the task id. Sign within about two minutes."
              : "Active nodes, highest reputation first. A tie follows the latest block hash."}
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

      <MyRequests owner={wallet.address} refreshKey={result?.id || ""} />
    </section>
  );
}
