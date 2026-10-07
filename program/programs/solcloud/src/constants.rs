use anchor_lang::prelude::*;

/// Minimum committee size a requester may choose.
pub const MIN_COMMITTEE_SIZE: u8 = 3;
/// Maximum committee size a requester may choose.
pub const MAX_COMMITTEE_SIZE: u8 = 11;

/// Max byte length of a task input (kept small — travels in the transaction).
pub const MAX_INPUT_LEN: usize = 64;
/// Max byte length of a revealed output.
pub const MAX_OUTPUT_LEN: usize = 64;

/// How long (seconds) nodes have to submit commits after a task is created.
pub const COMMIT_WINDOW_SECS: i64 = 60;
/// How long (seconds) nodes have to reveal after the commit window closes.
pub const REVEAL_WINDOW_SECS: i64 = 60;

/// PDA seed prefixes.
pub const CONFIG_SEED: &[u8] = b"config";
pub const NODE_SEED: &[u8] = b"node";
pub const TASK_SEED: &[u8] = b"task";
pub const COMMIT_SEED: &[u8] = b"commit";
pub const RESULT_SEED: &[u8] = b"result";

/// Majority threshold for an N-node committee: `floor(N / 2) + 1`.
/// e.g. N=3 -> 2, N=5 -> 3, N=11 -> 6.
#[inline]
pub fn consensus_threshold(committee_size: u8) -> u8 {
    committee_size / 2 + 1
}
