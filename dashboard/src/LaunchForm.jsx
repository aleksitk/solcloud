import { useEffect, useState } from "react";
import {
  activeNodes,
  buildRequestTask,
  committeeSeed,
  currentSlot,
  MAX_SEED_SLOT_LAG,
  explorerTx,
  pickCommittee,
  nextTaskId,
  readActiveOwners,
  readNodes,
  selectCommittee,
  sendSigned,
  solToLamports,
  WASM_HASH,
} from "./requestTask.js";
import CodeEditor from "./FunctionView.jsx";
import RoundStatus from "./RoundStatus.jsx";
import { useFunctionChoice } from "./functionChoice.jsx";
import { useWallet } from "./wallet.jsx";

const SIZES = [3, 5, 7, 9, 11];

function thresholdOf(size) {
  return Math.floor(size / 2) + 1;
}

// Hex text to bytes, or null when it is not whole bytes within the 64-byte cap.
function hexBytes(text) {
  const clean = text.replace(/\s+/g, "");
  if (!/^([0-9a-f]{2})*$/i.test(clean) || clean.length > 128) return null;
  return Uint8Array.from(clean.match(/.{2}/g) || [], (pair) => parseInt(pair, 16));
}

function shortError(err) {
  const message = err?.message || "The wallet did not sign.";
  return message.length > 280 ? `${message.slice(0, 280)}…` : message;
}

export default function LaunchForm({ onOpenRequests }) {
  const wallet = useWallet();
  const { compiled, published } = useFunctionChoice();
  const [mode, setMode] = useState("code");
  const [inputHex, setInputHex] = useState("05000000");
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
  const custom = mode === "code";
  const inputBytes = hexBytes(inputHex);
  const inputOk = custom
    ? Boolean(compiled) && published && inputBytes !== null
    : Number.isInteger(seedNum) && seedNum >= 0 && Number.isInteger(mazeNum) && mazeNum > 0;
  const valid = rewardNum > 0 && inputOk && activeCount !== null && !needsMoreNodes;

  // What the review freezes: the program and the input the wallet will sign for.
  function chosen() {
    if (custom) {
      return {
        fnName: "Your code",
        fnHash: compiled.hash,
        input: inputBytes,
        inputText: inputBytes.length ? `${inputBytes.length} bytes` : "empty",
      };
    }
    return {
      fnName: "Labyrinth example",
      fnHash: WASM_HASH,
      input: null,
      seed: seedNum,
      maze: mazeNum,
      inputText: `seed ${seedNum} · size ${mazeNum}`,
    };
  }

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
          ...chosen(),
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
        ...chosen(),
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
        // Keep the slot the review was drawn from, so the nodes shown are the nodes
        // signed for. The program accepts a slot for MAX_SEED_SLOT_LAG slots; draw
        // again only when the review has used up half of that.
        const now = await currentSlot();
        const reviewed = Number(review.seedSlot);
        const slot = now >= reviewed && now - reviewed <= MAX_SEED_SLOT_LAG / 2 ? reviewed : now;
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
          setError("The review is too old, so the nodes were drawn again. Check them, then sign.");
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
        input: review.input,
        wasmHash: review.fnHash,
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

  const busy = phase === "preparing" || phase === "signing" || phase === "sending";

  const flow = custom ? ["Compile", "Publish", "Review", "Sign"] : ["Choose", "Review", "Sign"];
  const before = custom ? (!compiled ? 0 : !published ? 1 : 2) : 1;
  const at = result ? flow.length : review ? flow.length - 1 : before;

  return (
    <div className="work">
      <ol className="flow" aria-label="Progress">
        {flow.map((name, index) => (
          <li key={name} className={index < at ? "done" : index === at ? "on" : ""}>
            <i>{index < at ? "✓" : index + 1}</i>
            {name}
          </li>
        ))}
      </ol>
      <form className="card" onSubmit={onSubmit}>
        <div className="field-group">
          <div className="field-title">
            <i>1</i>
            Code
          </div>
          <div className="seg">
            <button
              type="button"
              className={custom ? "on" : ""}
              onClick={() => {
                setMode("code");
                clearReview();
              }}
            >
              Write your own
            </button>
            <button
              type="button"
              className={custom ? "" : "on"}
              onClick={() => {
                setMode("example");
                clearReview();
              }}
            >
              Use the example
            </button>
          </div>
          {custom ? (
            <CodeEditor />
          ) : (
            <p className="note">
              <b>Labyrinth.</b> A built-in program every node can already run. It builds a maze from a seed and a size,
              solves it, and returns the path length. Good for a first round.
            </p>
          )}
        </div>

        <div className="field-group">
          <div className="field-title">
            <i>2</i>
            Input
          </div>
          {custom ? (
            <>
              <label className="field-wide">
                Bytes, as hex
                <input
                  value={inputHex}
                  spellCheck={false}
                  onChange={(event) => {
                    setInputHex(event.target.value);
                    clearReview();
                  }}
                />
              </label>
              <p className="hint">
                {inputBytes === null
                  ? "Use pairs of hex digits, up to 64 bytes."
                  : "Up to 64 bytes. 05000000 is the number 5 as a little-endian u32."}
              </p>
            </>
          ) : (
            <div className="fields two">
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
          )}
        </div>

        <div className="field-group">
          <div className="field-title">
            <i>3</i>
            Committee and reward
          </div>
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
            {size} nodes run it. {threshold} must agree.
            {activeCount === null
              ? " Reading staked nodes…"
              : needsMoreNodes
                ? ` Only ${activeCount} ${activeCount === 1 ? "node is" : "nodes are"} staked right now.`
                : ""}
          </p>
          <label className="field-wide" style={{ marginTop: 16, maxWidth: 220 }}>
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
        </div>

        <button className="btn" type="submit" disabled={!valid || phase === "reading" || busy}>
          {phase === "reading" ? "Reading nodes…" : "Review"}
        </button>
        {custom && !(compiled && published) && (
          <p className="hint">{compiled ? "Publish the code first." : "Compile the code first."}</p>
        )}
        {error && !review && <p className="form-error">{error}</p>}
      </form>

      <aside className="card work-side">
        <div className="card-head">
          <h3>Summary</h3>
          <span>Devnet</span>
        </div>
        {!review ? (
          <p className="hint" style={{ marginTop: 0 }}>
            Press Review to see the nodes and the amount your wallet will lock.
          </p>
        ) : (
          <>
            <dl className="summary">
              <div>
                <dt>Program</dt>
                <dd>
                  {review.fnName}
                  <span className="muted" style={{ display: "block" }}>
                    {review.fnHash.slice(0, 8)}…{review.fnHash.slice(-6)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Input</dt>
                <dd>{review.inputText}</dd>
              </div>
              <div>
                <dt>You lock</dt>
                <dd>{review.reward} SOL</dd>
              </div>
              <div>
                <dt>Must agree</dt>
                <dd>
                  {review.threshold} of {review.size}
                </dd>
              </div>
              <div>
                <dt>Nodes</dt>
                <dd>
                  {review.nodes.map((node) => (
                    <span key={node.owner} style={{ display: "block" }}>
                      {node.id}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
            {!result && (
              <button className="btn wide" type="button" disabled={busy} onClick={sign}>
                {phase === "preparing"
                  ? "Preparing…"
                  : phase === "signing"
                    ? "Waiting for the wallet…"
                    : phase === "sending"
                      ? "Confirming on devnet…"
                      : "Sign and send"}
              </button>
            )}
            {review.onChain && !result && <p className="hint">Sign within about a minute, or the nodes are drawn again.</p>}
            {result && (
              <>
                <p className="done-note">
                  Task {result.id} is on devnet.{" "}
                  <a href={explorerTx(result.signature)} target="_blank" rel="noreferrer">
                    View the transaction
                  </a>
                </p>
                <RoundStatus taskId={result.id} label="This round" compact />
                <p className="hint">
                  <button type="button" className="text-link" onClick={onOpenRequests}>
                    See all my requests
                  </button>
                </p>
              </>
            )}
            {error && <p className="form-error">{error}</p>}
          </>
        )}
      </aside>
    </div>
  );
}
