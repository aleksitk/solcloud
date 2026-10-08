import { useEffect, useRef, useState } from "react";
import { isLabyrinth, latestRound } from "./requestTask.js";

const DIR_N = 1;
const DIR_E = 2;
const DIR_S = 4;
const DIR_W = 8;
const CELL = 8;
const WINDOW = 48;

let cached = null;
let pending = null;

function hexDump(hex) {
  const bytes = hex.match(/.{1,2}/g) || [];
  const lines = [];
  for (let index = 0; index < bytes.length; index += 16) {
    lines.push(bytes.slice(index, index + 16).join(" "));
  }
  return lines.join("\n");
}

function loadTrace() {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = latestRound()
    .then(
      (round) =>
        new Promise((resolve) => {
          if (!round) {
            resolve({ kind: "empty", trace: null, round: null, note: "" });
            return;
          }
          if (!isLabyrinth(round.wasmHash)) {
            resolve({ kind: "bytes", trace: null, round, note: "" });
            return;
          }
          if (!round.mazeSize) {
            resolve({ kind: "empty", trace: null, round: null, note: "" });
            return;
          }
          if (round.mazeSize > 512) {
            resolve({ kind: "maze", trace: null, round: null, note: "This grid is too large to draw here." });
            return;
          }
          const worker = new Worker(new URL("./mazeWorker.js", import.meta.url), { type: "module" });
          worker.onmessage = (event) => {
            worker.terminate();
            resolve({
              kind: "maze",
              round: null,
              note: "",
              trace: {
                id: round.id,
                seed: round.seed.toString(),
                size: round.mazeSize,
                length: event.data.length,
                hash: event.data.hash,
                path: event.data.path,
                walls: event.data.walls,
              },
            });
          };
          worker.onerror = () => {
            worker.terminate();
            resolve({ kind: "maze", trace: null, round: null, note: "The path could not be traced." });
          };
          worker.postMessage({ seed: round.seed.toString(), size: round.mazeSize });
        }),
    )
    .catch(() => ({ kind: "empty", trace: null, round: null, note: "" }))
    .then((next) => {
      cached = next;
      return next;
    });
  return pending;
}

function useMazeTrace() {
  const [state, setState] = useState(cached || { kind: "loading", trace: null, round: null, note: "" });

  useEffect(() => {
    let live = true;
    loadTrace().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);

  return state;
}

function drawWindow(canvas, walls, path, size, originX, originY) {
  const ctx = canvas.getContext("2d");
  const pixels = WINDOW * CELL;
  canvas.width = pixels;
  canvas.height = pixels;
  ctx.fillStyle = "#110818";
  ctx.fillRect(0, 0, pixels, pixels);

  ctx.strokeStyle = "rgba(244, 241, 234, 0.72)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = originY; y < originY + WINDOW; y += 1) {
    for (let x = originX; x < originX + WINDOW; x += 1) {
      const open = walls[y * size + x];
      const px = (x - originX) * CELL;
      const py = (y - originY) * CELL;
      if (!(open & DIR_N)) {
        ctx.moveTo(px, py + 0.5);
        ctx.lineTo(px + CELL, py + 0.5);
      }
      if (!(open & DIR_W)) {
        ctx.moveTo(px + 0.5, py);
        ctx.lineTo(px + 0.5, py + CELL);
      }
      if (!(open & DIR_S) && y + 1 >= originY + WINDOW) {
        ctx.moveTo(px, py + CELL - 0.5);
        ctx.lineTo(px + CELL, py + CELL - 0.5);
      }
      if (!(open & DIR_E) && x + 1 >= originX + WINDOW) {
        ctx.moveTo(px + CELL - 0.5, py);
        ctx.lineTo(px + CELL - 0.5, py + CELL);
      }
    }
  }
  ctx.stroke();

  ctx.strokeStyle = "#14f195";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  let drawing = false;
  for (let index = 0; index < path.length; index += 1) {
    const cell = path[index];
    const x = cell % size;
    const y = Math.floor(cell / size);
    const inside = x >= originX && x < originX + WINDOW && y >= originY && y < originY + WINDOW;
    if (!inside) {
      drawing = false;
      continue;
    }
    const px = (x - originX) * CELL + CELL / 2;
    const py = (y - originY) * CELL + CELL / 2;
    if (!drawing) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
    drawing = true;
  }
  ctx.stroke();

  if (originX === 0 && originY === 0) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(CELL / 2, CELL / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (originX + WINDOW === size && originY + WINDOW === size) {
    ctx.fillStyle = "#e07a5f";
    ctx.beginPath();
    ctx.arc(pixels - CELL / 2, pixels - CELL / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function MazeSummary({ onOpen }) {
  const { kind, trace, round, note } = useMazeTrace();

  if (kind === "loading" || kind === "empty") return null;

  if (kind === "bytes") {
    const bytes = round.output ? round.output.length / 2 : null;
    return (
      <section className="path-row">
        <div>
          <p className="kicker">Output</p>
          <h2>Round {round.id}</h2>
          <p>{bytes === null ? "Waiting for the result." : `${bytes} bytes`}</p>
        </div>
        {round.output ? (
          <button type="button" className="path-open" onClick={onOpen}>
            Show output
          </button>
        ) : null}
      </section>
    );
  }

  if (!trace && !note) return null;

  return (
    <section className="path-row">
      <div>
        <p className="kicker">Solved path</p>
        {trace ? (
          <>
            <h2>Round {trace.id}</h2>
            <p>
              {trace.length.toLocaleString("en-US")} steps · {trace.hash}
            </p>
          </>
        ) : (
          <p>{note}</p>
        )}
      </div>
      {trace ? (
        <button type="button" className="path-open" onClick={onOpen}>
          Open map
        </button>
      ) : null}
    </section>
  );
}

export function MazeView({ onClose }) {
  const { kind, trace, round, note } = useMazeTrace();
  const entranceRef = useRef(null);
  const exitRef = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!trace) return;
    const exitOrigin = trace.size - WINDOW;
    if (entranceRef.current) drawWindow(entranceRef.current, trace.walls, trace.path, trace.size, 0, 0);
    if (exitRef.current) drawWindow(exitRef.current, trace.walls, trace.path, trace.size, exitOrigin, exitOrigin);
  }, [trace]);

  const exitOrigin = trace ? trace.size - WINDOW : 0;

  if (kind === "bytes") {
    const count = round.output ? round.output.length / 2 : 0;
    return (
      <section className="shell map-view">
        <button type="button" className="map-back" onClick={onClose}>
          ← Rounds
        </button>
        <h1 ref={titleRef} tabIndex={-1}>
          Output
        </h1>
        <p className="map-round">Round {round.id}</p>
        {round.output ? (
          <>
            <p className="map-round">{count} bytes</p>
            <pre className="output-bytes">{hexDump(round.output)}</pre>
          </>
        ) : (
          <p className="map-round">Waiting for the result.</p>
        )}
      </section>
    );
  }

  return (
    <section className="shell map-view">
      <button type="button" className="map-back" onClick={onClose}>
        ← Rounds
      </button>
      <h1 ref={titleRef} tabIndex={-1}>
        Solved path
      </h1>
      {trace ? (
        <>
          <p className="map-round">Round {trace.id}</p>
          <ul className="map-facts">
            <li>
              <span>Seed</span>
              <strong>{trace.seed}</strong>
            </li>
            <li>
              <span>Size</span>
              <strong>{trace.size}</strong>
            </li>
            <li>
              <span>Steps</span>
              <strong>{trace.length.toLocaleString("en-US")}</strong>
            </li>
            <li>
              <span>Hash</span>
              <strong>{trace.hash}</strong>
            </li>
          </ul>
          <ul className="map-legend">
            <li>
              <i className="swatch start" />
              Entrance
            </li>
            <li>
              <i className="swatch end" />
              Exit
            </li>
            <li>
              <i className="swatch route" />
              Path
            </li>
          </ul>
          <div className="map-stage">
            <figure className="map-plate">
              <figcaption>
                <strong>Entrance</strong>
                <span>0, 0</span>
              </figcaption>
              <canvas ref={entranceRef} aria-label="Maze entrance" />
            </figure>
            <figure className="map-plate">
              <figcaption>
                <strong>Exit</strong>
                <span>
                  {exitOrigin}, {exitOrigin}
                </span>
              </figcaption>
              <canvas ref={exitRef} aria-label="Maze exit" />
            </figure>
          </div>
        </>
      ) : (
        <p className="map-round">{note || "Tracing the path…"}</p>
      )}
    </section>
  );
}
