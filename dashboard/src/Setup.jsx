const DOWNLOAD = "https://github.com/aleksitk/solcloud/releases/latest/download/solcloud-node.exe";

// The short way in: one file that makes its own key, stakes, and runs.
export function QuickStart() {
  return (
    <>
      <ol className="setup">
        <li>
          <strong>Download the node</strong>
          <p>One file for Windows. Nothing else to install.</p>
          <div className="row-actions" style={{ marginTop: 10 }}>
            <a className="btn small" href={DOWNLOAD}>
              Download for Windows
            </a>
          </div>
        </li>
        <li>
          <strong>Run it</strong>
          <p>
            It makes a key for the node and shows an address. Windows may warn about an unknown publisher: choose
            More info, then Run anyway.
          </p>
        </li>
        <li>
          <strong>Send it 1.06 devnet SOL</strong>
          <p>It stakes 1 SOL on its own and starts answering tasks. Leave the window open.</p>
        </li>
      </ol>
      <p className="hint">
        On macOS or Linux, run it from source: see <a href="#/docs">Docs</a>.
      </p>
    </>
  );
}

// From source, with a key file you already have.
export function ListenerSetup() {
  return (
    <>
      <p className="note" style={{ margin: "0 0 20px" }}>
        <b>The node program runs on your machine.</b> A web page cannot start a program on your computer, so you
        start it once in a terminal.
      </p>
      <ol className="setup">
        <li>
          <strong>Get it</strong>
          <p>Needs Node.js 22 or newer.</p>
          <pre className="code">{`git clone https://github.com/aleksitk/solcloud
cd solcloud/worker && npm install`}</pre>
        </li>
        <li>
          <strong>Start it</strong>
          <p>Point it at the key file of the wallet that staked.</p>
          <pre className="code">node listener.mjs ~/.config/solana/node.json</pre>
        </li>
        <li>
          <strong>Leave it running</strong>
          <p>It finds its tasks, answers them, and collects rewards. If it is off when your node is picked, that round stalls.</p>
        </li>
      </ol>
    </>
  );
}
