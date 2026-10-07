use anchor_lang::prelude::*;

#[error_code]
pub enum SolCloudError {
    #[msg("Stake amount is below the configured minimum.")]
    StakeTooLow,
    #[msg("Committee size must be between MIN_COMMITTEE_SIZE and MAX_COMMITTEE_SIZE.")]
    InvalidCommitteeSize,
    #[msg("Committee size must be an odd number (3, 5, 7, 9, 11).")]
    CommitteeSizeNotOdd,
    #[msg("Input exceeds the maximum allowed size.")]
    InputTooLarge,
    #[msg("Output exceeds the maximum allowed size.")]
    OutputTooLarge,
    #[msg("Not enough registered nodes for the requested committee size.")]
    NotEnoughNodes,
    #[msg("Node is not a member of this task's committee.")]
    NotInCommittee,
    #[msg("The commit window for this task has closed.")]
    CommitWindowClosed,
    #[msg("The reveal window for this task has closed.")]
    RevealWindowClosed,
    #[msg("Reveal does not match the previously submitted commitment.")]
    CommitmentMismatch,
    #[msg("This node has already acted for this task.")]
    AlreadyActed,
    #[msg("Task is not in the expected state for this instruction.")]
    InvalidTaskState,
    #[msg("No majority consensus was reached.")]
    NoConsensus,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("Node is not active.")]
    NodeNotActive,
    #[msg("Duplicate node in committee.")]
    DuplicateCommitteeNode,
    #[msg("Committee account is not a registered node.")]
    InvalidCommitteeNode,
    #[msg("Finalize accounts do not match the committee.")]
    BadFinalizeAccounts,
}
