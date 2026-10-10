use anchor_lang::prelude::*;

/// Lifecycle of a node in the registry.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum NodeStatus {
    Active,
    Inactive,
    Slashed,
}

/// Lifecycle of a task.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TaskStatus {
    Requested,
    Committing,
    Revealing,
    Finalized,
    Failed,
    Refunded,
}

/// Final status recorded on a TaskResult.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ResultStatus {
    Finalized,
    Failed,
    Refunded,
}

/// Global protocol configuration (single PDA, seed = "config").
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub min_stake: u64,
    pub reward_default: u64,
    pub node_count: u64,
    pub task_count: u64,
    /// Slash fraction in basis points (e.g. 5000 = 50%).
    pub slash_bps: u16,
    pub bump: u8,
    /// Owners of nodes that joined after this field existed, plus any indexed earlier nodes.
    /// Appended at the end so an older config account can be extended with zeros.
    #[max_len(32)]
    pub active_nodes: Vec<Pubkey>,
}

/// A staked worker node (PDA, seed = "node" ++ owner).
#[account]
#[derive(InitSpace)]
pub struct NodeAccount {
    pub owner: Pubkey,
    pub stake_amount: u64,
    pub status: NodeStatus,
    pub reputation: i64,
    pub tasks_completed: u64,
    pub bump: u8,
    /// Rounds this node lost after a majority existed.
    /// Appended so an older 66-byte node account can be extended with zeros.
    pub tasks_slashed: u64,
}

/// A compute task (PDA, seed = "task" ++ task_id).
#[account]
#[derive(InitSpace)]
pub struct TaskAccount {
    pub requester: Pubkey,
    pub wasm_hash: [u8; 32],
    #[max_len(64)]
    pub input: Vec<u8>,
    pub reward: u64,
    /// Chosen committee size N (odd, 3..=11).
    pub committee_size: u8,
    /// Selected committee node owners (len == committee_size).
    #[max_len(11)]
    pub committee: Vec<Pubkey>,
    pub status: TaskStatus,
    pub commit_count: u8,
    pub reveal_count: u8,
    pub created_at: i64,
    pub commit_deadline: i64,
    pub reveal_deadline: i64,
    pub task_id: u64,
    pub bump: u8,
}

/// One node's commit+reveal record for a task
/// (PDA, seed = "commit" ++ task ++ node).
#[account]
#[derive(InitSpace)]
pub struct CommitAccount {
    pub task: Pubkey,
    pub node: Pubkey,
    pub hash_commitment: [u8; 32],
    pub output_hash: [u8; 32],
    #[max_len(64)]
    pub output: Vec<u8>,
    pub nonce: u64,
    pub revealed: bool,
    pub submitted_at: i64,
    pub bump: u8,
    /// Unix time of the reveal. Zero until then.
    /// Appended so an older commit account still deserializes: its spare tail reads as zero.
    pub revealed_at: i64,
}

/// A Wasm module stored on chain so any node can fetch it
/// (PDA, seed = "module" ++ uploader ++ wasm_hash).
#[account]
pub struct ModuleAccount {
    pub uploader: Pubkey,
    pub wasm_hash: [u8; 32],
    /// Full length of the module in bytes.
    pub size: u32,
    /// True once every byte is in and sha256(data) equals wasm_hash.
    pub sealed: bool,
    pub bump: u8,
    pub data: Vec<u8>,
}

impl ModuleAccount {
    /// Everything except the bytes: uploader, hash, size, sealed, bump, vec length.
    pub const BASE_SPACE: usize = 32 + 32 + 4 + 1 + 1 + 4;
}

/// A node's request to leave (PDA, seed = "exit" ++ owner).
/// Kept apart from NodeAccount so older node accounts need no new field.
#[account]
#[derive(InitSpace)]
pub struct ExitTicket {
    pub owner: Pubkey,
    /// Unix time from which the stake can be withdrawn.
    pub ready_at: i64,
    pub bump: u8,
}

/// The finalized, verified result of a task (PDA, seed = "result" ++ task).
#[account]
#[derive(InitSpace)]
pub struct TaskResult {
    pub task: Pubkey,
    #[max_len(64)]
    pub final_output: Vec<u8>,
    pub output_hash: [u8; 32],
    pub status: ResultStatus,
    pub agreed_count: u8,
    pub committee_size: u8,
    pub finalized_at: i64,
    pub bump: u8,
}
