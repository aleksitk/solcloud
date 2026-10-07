use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod state;

use constants::*;
use error::SolCloudError;
use state::*;

declare_id!("D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ");

#[program]
pub mod solcloud {
    use super::*;

    /// One-time protocol setup: creates the global Config PDA.
    pub fn initialize(
        ctx: Context<Initialize>,
        min_stake: u64,
        reward_default: u64,
        slash_bps: u16,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.treasury = ctx.accounts.treasury.key();
        cfg.min_stake = min_stake;
        cfg.reward_default = reward_default;
        cfg.slash_bps = slash_bps;
        cfg.node_count = 0;
        cfg.task_count = 0;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// A node joins the registry by staking.
    pub fn register_node(ctx: Context<RegisterNode>, stake_amount: u64) -> Result<()> {
        require!(
            stake_amount >= ctx.accounts.config.min_stake,
            SolCloudError::StakeTooLow
        );

        // TODO(phase3): transfer `stake_amount` lamports from owner into a
        // program-owned stake vault so it can be slashed later.

        let node = &mut ctx.accounts.node;
        node.owner = ctx.accounts.owner.key();
        node.stake_amount = stake_amount;
        node.status = NodeStatus::Active;
        node.reputation = 0;
        node.tasks_completed = 0;
        node.bump = ctx.bumps.node;

        ctx.accounts.config.node_count = ctx
            .accounts
            .config
            .node_count
            .checked_add(1)
            .ok_or(SolCloudError::Overflow)?;
        Ok(())
    }

    /// A dApp requests an off-chain computation and escrows the reward.
    /// `committee_size` (N) must be odd and within [MIN, MAX].
    pub fn request_task(
        ctx: Context<RequestTask>,
        task_id: u64,
        wasm_hash: [u8; 32],
        input: Vec<u8>,
        reward: u64,
        committee_size: u8,
    ) -> Result<()> {
        require!(input.len() <= MAX_INPUT_LEN, SolCloudError::InputTooLarge);
        require!(
            (MIN_COMMITTEE_SIZE..=MAX_COMMITTEE_SIZE).contains(&committee_size),
            SolCloudError::InvalidCommitteeSize
        );
        require!(committee_size % 2 == 1, SolCloudError::CommitteeSizeNotOdd);
        require!(
            ctx.accounts.config.node_count >= committee_size as u64,
            SolCloudError::NotEnoughNodes
        );

        // TODO(phase3): escrow `reward` into a task vault; select `committee_size`
        // nodes deterministically from a recent slot hash + task_id seed.

        let clock = Clock::get()?;
        let task = &mut ctx.accounts.task;
        task.requester = ctx.accounts.requester.key();
        task.wasm_hash = wasm_hash;
        task.input = input;
        task.reward = reward;
        task.committee_size = committee_size;
        task.committee = Vec::new();
        task.status = TaskStatus::Requested;
        task.commit_count = 0;
        task.reveal_count = 0;
        task.created_at = clock.unix_timestamp;
        task.commit_deadline = clock.unix_timestamp + COMMIT_WINDOW_SECS;
        task.reveal_deadline = task.commit_deadline + REVEAL_WINDOW_SECS;
        task.task_id = task_id;
        task.bump = ctx.bumps.task;

        ctx.accounts.config.task_count = ctx
            .accounts
            .config
            .task_count
            .checked_add(1)
            .ok_or(SolCloudError::Overflow)?;
        Ok(())
    }

    /// A committee node submits `hash(output ‖ nonce)` without revealing yet.
    pub fn commit_result(
        ctx: Context<CommitResult>,
        _task_id: u64,
        hash_commitment: [u8; 32],
    ) -> Result<()> {
        // TODO(phase3): verify node is in task.committee, within commit window,
        // and has not already committed.

        let commit = &mut ctx.accounts.commit;
        commit.task = ctx.accounts.task.key();
        commit.node = ctx.accounts.owner.key();
        commit.hash_commitment = hash_commitment;
        commit.output_hash = [0u8; 32];
        commit.revealed = false;
        commit.submitted_at = Clock::get()?.unix_timestamp;
        commit.bump = ctx.bumps.commit;

        let task = &mut ctx.accounts.task;
        task.commit_count = task
            .commit_count
            .checked_add(1)
            .ok_or(SolCloudError::Overflow)?;
        Ok(())
    }

    /// A committee node reveals its output and nonce.
    pub fn reveal_result(
        ctx: Context<RevealResult>,
        _task_id: u64,
        output: Vec<u8>,
        _nonce: u64,
    ) -> Result<()> {
        require!(output.len() <= MAX_OUTPUT_LEN, SolCloudError::OutputTooLarge);

        // TODO(phase3): recompute hash(output ‖ nonce) and require it equals the
        // stored commitment; enforce reveal window; store output_hash for tally.

        let commit = &mut ctx.accounts.commit;
        commit.revealed = true;

        let task = &mut ctx.accounts.task;
        task.reveal_count = task
            .reveal_count
            .checked_add(1)
            .ok_or(SolCloudError::Overflow)?;
        Ok(())
    }

    /// Tally reveals, enforce M-of-N majority, pay correct nodes, slash the rest.
    pub fn finalize(ctx: Context<Finalize>, _task_id: u64) -> Result<()> {
        // TODO(phase3): group reveals by output_hash; if the top group has
        // >= consensus_threshold(committee_size) members, store the result and
        // distribute reward; otherwise mark Failed/Refunded. Slash mismatches.

        let task = &mut ctx.accounts.task;
        let result = &mut ctx.accounts.result;
        result.task = task.key();
        result.final_output = Vec::new();
        result.output_hash = [0u8; 32];
        result.status = ResultStatus::Finalized;
        result.agreed_count = 0;
        result.committee_size = task.committee_size;
        result.finalized_at = Clock::get()?.unix_timestamp;
        result.bump = ctx.bumps.result;

        task.status = TaskStatus::Finalized;
        Ok(())
    }
}

// ----------------------------- Accounts contexts -----------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: treasury is only stored as a destination pubkey in Config.
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterNode<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = owner,
        space = 8 + NodeAccount::INIT_SPACE,
        seeds = [NODE_SEED, owner.key().as_ref()],
        bump
    )]
    pub node: Account<'info, NodeAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct RequestTask<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = requester,
        space = 8 + TaskAccount::INIT_SPACE,
        seeds = [TASK_SEED, task_id.to_le_bytes().as_ref()],
        bump
    )]
    pub task: Account<'info, TaskAccount>,
    #[account(mut)]
    pub requester: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct CommitResult<'info> {
    #[account(mut, seeds = [TASK_SEED, task_id.to_le_bytes().as_ref()], bump = task.bump)]
    pub task: Account<'info, TaskAccount>,
    #[account(
        init,
        payer = owner,
        space = 8 + CommitAccount::INIT_SPACE,
        seeds = [COMMIT_SEED, task.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub commit: Account<'info, CommitAccount>,
    #[account(seeds = [NODE_SEED, owner.key().as_ref()], bump = node.bump)]
    pub node: Account<'info, NodeAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct RevealResult<'info> {
    #[account(mut, seeds = [TASK_SEED, task_id.to_le_bytes().as_ref()], bump = task.bump)]
    pub task: Account<'info, TaskAccount>,
    #[account(
        mut,
        seeds = [COMMIT_SEED, task.key().as_ref(), owner.key().as_ref()],
        bump = commit.bump
    )]
    pub commit: Account<'info, CommitAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct Finalize<'info> {
    #[account(mut, seeds = [TASK_SEED, task_id.to_le_bytes().as_ref()], bump = task.bump)]
    pub task: Account<'info, TaskAccount>,
    #[account(
        init,
        payer = payer,
        space = 8 + TaskResult::INIT_SPACE,
        seeds = [RESULT_SEED, task.key().as_ref()],
        bump
    )]
    pub result: Account<'info, TaskResult>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
