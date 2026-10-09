use anchor_lang::prelude::*;

/// Minimum committee size a requester may choose.
pub const MIN_COMMITTEE_SIZE: u8 = 3;
/// Maximum committee size a requester may choose.
pub const MAX_COMMITTEE_SIZE: u8 = 11;
/// How many active node owners Config can remember. Demo cap.
pub const MAX_ACTIVE_NODES: usize = 32;
/// A wallet prompt cannot land in the same slot the transaction was built for.
/// The requester names a slot it just read. Older than this, the draw is rejected.
/// 300 slots is about two minutes.
pub const MAX_SEED_SLOT_LAG: u64 = 300;

/// Max byte length of a task input (kept small — travels in the transaction).
pub const MAX_INPUT_LEN: usize = 64;
/// Max byte length of a Wasm module stored on chain. One account, allocated in a single step.
pub const MAX_MODULE_LEN: usize = 10_000;
/// Max byte length of a revealed output.
pub const MAX_OUTPUT_LEN: usize = 64;

/// How long (seconds) nodes have to submit commits after a task is created.
/// Demo value: long enough to run the steps by hand. Production would be shorter.
pub const COMMIT_WINDOW_SECS: i64 = 86_400;
/// How long (seconds) nodes have to reveal after every commit is in.
pub const REVEAL_WINDOW_SECS: i64 = 86_400;

/// PDA seed prefixes.
pub const CONFIG_SEED: &[u8] = b"config";
pub const NODE_SEED: &[u8] = b"node";
pub const TASK_SEED: &[u8] = b"task";
pub const COMMIT_SEED: &[u8] = b"commit";
pub const RESULT_SEED: &[u8] = b"result";
pub const MODULE_SEED: &[u8] = b"module";

/// Majority threshold for an N-node committee: `floor(N / 2) + 1`.
/// e.g. N=3 -> 2, N=5 -> 3, N=11 -> 6.
#[inline]
pub fn consensus_threshold(committee_size: u8) -> u8 {
    committee_size / 2 + 1
}
