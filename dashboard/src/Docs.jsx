import { STARTER } from "./starter.js";

const SECTIONS = [
  ["what", "What it is"],
  ["task", "Run a task"],
  ["node", "Run a node"],
  ["code", "Write the code"],
  ["round", "How a round settles"],
  ["money", "Rewards and stake"],
  ["limits", "Limits"],
];

function jump(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Docs({ go }) {
  return (
    <div className="shell">
      <header className="page-head">
        <p className="kicker">Docs</p>
        <h1>How SolCloud works.</h1>
        <p className="lede">What it does, and how to use it from this site or from a terminal.</p>
      </header>

      <div className="docs">
        <nav className="docs-nav" aria-label="Docs sections">
          {SECTIONS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => jump(id)}>
              {label}
            </button>
          ))}
        </nav>

        <div>
          <section className="doc" id="what">
            <h2>What it is</h2>
            <p>
              SolCloud runs a small program on several independent machines and takes the answer most of them agree
              on. A Solana program holds the reward, picks the machines, and pays them.
            </p>
            <p>
              No single machine is trusted. Each one locks in its answer before it can see anyone else's, so it
              cannot copy. Every machine has SOL at stake, and one that answers differently from the majority loses
              half of it.
            </p>
            <div className="roles">
              <div>
                <b>Requester</b>
                <span>Has code to run. Sends it with an input and a reward.</span>
              </div>
              <div>
                <b>Node operator</b>
                <span>Has a machine. Puts up SOL as a guarantee, runs the node program, and earns rewards.</span>
              </div>
            </div>
          </section>

          <section className="doc" id="task">
            <h2>Run a task</h2>
            <h3>From this site</h3>
            <ol>
              <li>Connect a wallet set to Devnet.</li>
              <li>
                Open{" "}
                <button type="button" className="text-link" onClick={() => go("compute")}>
                  Run a task
                </button>
                . Write the code, press Compile, then Publish. Publish stores the compiled program on Solana so
                every node can fetch it.
              </li>
              <li>Give the input, choose how many nodes run it, and set the reward.</li>
              <li>Press Review, then sign. The round settles on its own, usually in under a minute.</li>
            </ol>
            <h3>From your backend</h3>
            <p>
              You do not need this site, an account, or an API key. Any code that holds a Solana keypair with some
              SOL can send a task. The SDK does it in one call.
            </p>
            <pre className="code">npm install github:aleksitk/solcloud</pre>
            <pre className="code">{`import { SolCloud } from "solcloud";

const cloud = new SolCloud({ keypair: "./backend-key.json" });

const round = await cloud.run({
  wasm: "./my-function.wasm",
  input: "05000000",
  reward: 0.05,
  committee: 3,
});

if (round.status === "finalized") console.log(round.outputHex);`}</pre>
            <p>
              <code>run</code> stores the Wasm on chain the first time, creates the task, and waits for the round
              to settle. A round ends <code>finalized</code> with an output, or <code>refunded</code> with the
              reward back in the keypair. Use <code>request</code> and <code>wait</code> separately if you do not
              want to hold the call open.
            </p>
            <h3>From a terminal</h3>
            <p>
              The same request without the site. It needs Node.js 22 and a funded Devnet keypair file.
            </p>
            <pre className="code">{`git clone https://github.com/aleksitk/solcloud
cd solcloud/worker && npm install

node cli.mjs request ~/.config/solana/id.json \\
  --wasm my-function.wasm --input 05000000 \\
  --reward 0.05 --committee 3

node cli.mjs status 14`}</pre>
            <p>
              Given a file, <code>request</code> first stores it on chain. <code>--wasm</code> also takes the
              SHA-256 of a module that is already there. <code>--input</code> is hex bytes. Add{" "}
              <code>--dry-run</code> to check a request without sending it.
            </p>
          </section>

          <section className="doc" id="node">
            <h2>Run a node</h2>
            <h3>The quick way, on Windows</h3>
            <p>
              Download{" "}
              <a
                className="text-link"
                href="https://github.com/aleksitk/solcloud/releases/latest/download/solcloud-node.exe"
              >
                solcloud-node.exe
              </a>{" "}
              and run it. It makes a key, shows an address, waits for 1.06 devnet SOL, stakes, and starts answering
              tasks. Its key and logs live in the <code>.solcloud</code> folder in your home folder. The steps below
              do the same by hand, on any system.
            </p>
            <h3>1. Stake</h3>
            <p>
              On this site, open{" "}
              <button type="button" className="text-link" onClick={() => go("operate")}>
                Run a node
              </button>{" "}
              and stake from your wallet. Or from a terminal:
            </p>
            <pre className="code">node cli.mjs stake ~/.config/solana/node.json --sol 1</pre>
            <h3>2. Start the node program</h3>
            <p>
              The node program is called the listener. It has to run on your own machine, with the key that staked.
              A web page cannot start a program on your computer, so this step is always yours.
            </p>
            <pre className="code">node listener.mjs ~/.config/solana/node.json</pre>
            <p>From then on it finds its tasks, runs them, commits, reveals, and settles the round. Nothing else to do.</p>
            <h3>3. Keep it running</h3>
            <p>
              A node that is picked while its listener is off holds the round up until the window closes. To restart
              it automatically, use{" "}
              <code>./start-nodes.sh</code>, or install <code>solcloud-listener.service</code> with systemd on a
              server.
            </p>
            <h3>4. Leave</h3>
            <p>
              On the Run a node page, open Leave. The node drops out of the registry at once. After about 11
              minutes, once every round that picked it has settled, you can withdraw what is left of the stake.
              From a terminal: <code>node cli.mjs exit</code>, then <code>node cli.mjs withdraw</code>.
            </p>
          </section>

          <section className="doc" id="code">
            <h2>Write the code</h2>
            <p>
              A task's program is AssemblyScript compiled to WebAssembly. It exports two functions:{" "}
              <code>alloc</code> gives the node a place to write the input, and <code>run</code> returns where the
              output is and how long it is.
            </p>
            <pre className="code">{STARTER}</pre>
            <ul>
              <li>
                <b>Same answer everywhere.</b> Integers only. No floats, clock, or randomness.
              </li>
              <li>
                <b>Small in, small out.</b> Input and output are each capped at 64 bytes.
              </li>
              <li>
                <b>Bounded.</b> A node stops a program that runs past its time limit.
              </li>
              <li>
                <b>No outside world.</b> The program cannot read files or the network.
              </li>
              <li>
                <b>Stored on chain.</b> The compiled program lives in a Solana account. A node downloads it and
                checks its SHA-256 before it runs it.
              </li>
            </ul>
          </section>

          <section className="doc" id="round">
            <h2>How a round settles</h2>
            <ol>
              <li>
                <b>Request.</b> The reward moves into the task account. The program draws the committee from the
                staked nodes.
              </li>
              <li>
                <b>Commit.</b> Each node runs the program and posts a hash of its answer plus a secret number.
              </li>
              <li>
                <b>Reveal.</b> Once every node has committed, each one shows its answer. It must match its hash.
              </li>
              <li>
                <b>Settle.</b> The majority answer becomes the result. Those nodes share the reward. A node that
                differs loses half of its stake.
              </li>
            </ol>
            <p>
              Commits are due within five minutes of the request, and reveals five minutes after that. If a node
              never commits, the reward goes back to the requester and nobody is slashed: no answer was hidden.
            </p>
            <p>
              If a node commits and then never reveals, it is slashed like a wrong answer. Otherwise a node could
              hide a mistake by staying silent. The round still settles on the answers that did arrive, as long as
              they are a majority of the whole committee.
            </p>
          </section>

          <section className="doc" id="money">
            <h2>Rewards and stake</h2>
            <p>
              The stake is the node operator's guarantee. It is the operator's own SOL, locked in the node's account,
              and the program can take half of it when the node is wrong. That is what makes an honest answer the
              cheaper choice.
            </p>
            <ul>
              <li>
                <b>The requester pays the reward.</b> It is locked when the task is created and split equally
                among the nodes in the majority.
              </li>
              <li>
                <b>No majority, no charge.</b> If the answers do not reach a majority, the whole reward goes back
                to the requester.
              </li>
              <li>
                <b>A wrong answer costs half the stake.</b> So does committing and never revealing. The slashed
                SOL goes to the protocol treasury.
              </li>
              <li>
                <b>The stake comes back.</b> A node that leaves gets back whatever stake it has left, after an
                11 minute delay.
              </li>
            </ul>
            <h3>An example</h3>
            <p>
              A task offers 0.06 SOL to three nodes, each with 1 SOL staked. If all three agree, each earns 0.02
              SOL. If one differs, the other two earn 0.03 SOL each and the third loses 0.5 SOL. Being wrong once
              costs more than twenty correct answers pay.
            </p>
          </section>

          <section className="doc" id="limits">
            <h2>Limits</h2>
            <ul>
              <li>This runs on Solana Devnet. The SOL has no value.</li>
              <li>Security is an honest majority plus stake. It is not a cryptographic proof.</li>
              <li>One person can stake several nodes. Larger committees make that harder to exploit.</li>
              <li>
                The guarantee holds while the reward is small next to the stake. Nothing stops a task from offering
                more than the committee has at risk.
              </li>
              <li>Slashed SOL goes to a treasury that one key controls on devnet.</li>
              <li>A program is capped at 10,000 bytes of Wasm. It is stored in one Solana account.</li>
              <li>
                Compile works when this site is served from a developer machine. On the public site, build the
                .wasm yourself and use Upload .wasm.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
