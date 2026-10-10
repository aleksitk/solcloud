import type { Keypair } from "@solana/web3.js";

export declare const DEVNET_RPC: string;

export interface TaskRequest {
  /** Module bytes, a path to a .wasm file, or the SHA-256 of a module already published. */
  wasm: Uint8Array | string;
  /** 1 to 64 bytes, as bytes or a hex string. */
  input: Uint8Array | string;
  /** SOL locked for the nodes. Default 0.05. */
  reward?: number;
  /** How many nodes run it. Default 3. */
  committee?: 3 | 5 | 7 | 9 | 11;
}

export interface SentTask {
  taskId: string;
  signature: string;
  wasmHash: string;
  /** Owners of the nodes the program drew. */
  committee: string[];
}

export interface TaskStatus {
  taskId: string;
  status: "committing" | "revealing" | "finalized" | "refunded" | "failed";
  /** True once the round is over. */
  settled: boolean;
  commits: number;
  reveals: number;
  committeeSize: number;
  /** Nodes that gave the winning answer. Null until settled. */
  agreed: number | null;
  /** Set only when status is "finalized". */
  output: Uint8Array | null;
  outputHex: string | null;
}

export interface WaitOptions {
  /** Default 12 minutes: both windows plus a margin. */
  timeoutMs?: number;
  /** Default 3000. */
  pollMs?: number;
}

export interface NodeInfo {
  owner: string;
  status: string;
  stake: number;
  completed: number;
  slashed: number;
}

export declare class SolCloud {
  constructor(options?: { keypair?: string | Uint8Array | number[] | Keypair; rpc?: string });
  /** The address that pays for tasks, or null when this client only reads. */
  readonly address: string | null;
  publish(wasm: Uint8Array | string): Promise<{ hash: string; account: string; transactions: number }>;
  request(task: TaskRequest): Promise<SentTask>;
  status(taskId: string | number | bigint): Promise<TaskStatus | null>;
  wait(taskId: string | number | bigint, options?: WaitOptions): Promise<TaskStatus>;
  run(task: TaskRequest & WaitOptions): Promise<SentTask & TaskStatus>;
  nodes(): Promise<NodeInfo[]>;
}
