use anchor_lang::prelude::*;
use anchor_lang::{AccountDeserialize, AccountSerialize};
use anchor_lang::solana_program::hash::hash;
use anchor_lang::system_program::{self, Transfer};

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

    /// A node joins the registry by staking. Stake lamports sit on the node PDA.
    pub fn register_node(ctx: Context<RegisterNode>, stake_amount: u64) -> Result<()> {
        require!(
            stake_amount >= ctx.accounts.config.min_stake,
            SolCloudError::StakeTooLow
        );

        transfer_from_signer(
            &ctx.accounts.system_program,
            &ctx.accounts.owner,
            &ctx.accounts.node.to_account_info(),
            stake_amount,
        )?;

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
    ///
    /// Pass exactly `committee_size` registered node accounts as remaining
    /// accounts. The requester chooses N (odd, 3..=11).
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
        let committee_len = ctx.remaining_accounts.len();
        require!(
            committee_len == committee_size as usize,
            SolCloudError::NotEnoughNodes
        );

        let mut committee: Vec<Pubkey> = Vec::new();
        for i in 0..committee_len {
            let node = read_node(&ctx.remaining_accounts[i])?;
            let (pda, _) = Pubkey::find_program_address(
                &[NODE_SEED, node.owner.as_ref()],
                ctx.program_id,
            );
            require!(
                pda == ctx.remaining_accounts[i].key(),
                SolCloudError::InvalidCommitteeNode
            );
            require!(
                node.status == NodeStatus::Active,
                SolCloudError::NodeNotActive
            );
            require!(
                !committee.contains(&node.owner),
                SolCloudError::DuplicateCommitteeNode
            );
            committee.push(node.owner);
        }

        transfer_from_signer(
            &ctx.accounts.system_program,
            &ctx.accounts.requester,
            &ctx.accounts.task.to_account_info(),
            reward,
        )?;

        let clock = Clock::get()?;
        let task = &mut ctx.accounts.task;
        task.requester = ctx.accounts.requester.key();
        task.wasm_hash = wasm_hash;
        task.input = input;
        task.reward = reward;
        task.committee_size = committee_size;
        task.committee = committee;
        task.status = TaskStatus::Committing;
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

    /// A committee node submits `sha256(output ‖ nonce_le)` without revealing yet.
    pub fn commit_result(
        ctx: Context<CommitResult>,
        _task_id: u64,
        hash_commitment: [u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let owner = ctx.accounts.owner.key();
        require!(
            ctx.accounts.node.status == NodeStatus::Active,
            SolCloudError::NodeNotActive
        );
        require!(
            ctx.accounts.task.committee.contains(&owner),
            SolCloudError::NotInCommittee
        );
        require!(
            ctx.accounts.task.status == TaskStatus::Committing,
            SolCloudError::InvalidTaskState
        );
        require!(
            clock.unix_timestamp <= ctx.accounts.task.commit_deadline,
            SolCloudError::CommitWindowClosed
        );

        let commit = &mut ctx.accounts.commit;
        commit.task = ctx.accounts.task.key();
        commit.node = owner;
        commit.hash_commitment = hash_commitment;
        commit.output_hash = [0u8; 32];
        commit.output = Vec::new();
        commit.nonce = 0;
        commit.revealed = false;
        commit.submitted_at = clock.unix_timestamp;
        commit.bump = ctx.bumps.commit;

        let task = &mut ctx.accounts.task;
        task.commit_count = task
            .commit_count
            .checked_add(1)
            .ok_or(SolCloudError::Overflow)?;
        if task.commit_count == task.committee_size {
            task.status = TaskStatus::Revealing;
        }
        Ok(())
    }

    /// A committee node reveals its output and nonce after every node has committed.
    pub fn reveal_result(
        ctx: Context<RevealResult>,
        _task_id: u64,
        output: Vec<u8>,
        nonce: u64,
    ) -> Result<()> {
        require!(output.len() <= MAX_OUTPUT_LEN, SolCloudError::OutputTooLarge);
        let clock = Clock::get()?;
        require!(
            ctx.accounts.task.status == TaskStatus::Revealing,
            SolCloudError::InvalidTaskState
        );
        require!(
            clock.unix_timestamp <= ctx.accounts.task.reveal_deadline,
            SolCloudError::RevealWindowClosed
        );
        require!(
            ctx.accounts.commit.node == ctx.accounts.owner.key(),
            SolCloudError::NotInCommittee
        );
        require!(!ctx.accounts.commit.revealed, SolCloudError::AlreadyActed);

        let digest = commitment_of(&output, nonce);
        require!(
            digest == ctx.accounts.commit.hash_commitment,
            SolCloudError::CommitmentMismatch
        );

        let commit = &mut ctx.accounts.commit;
        commit.output = output;
        commit.nonce = nonce;
        commit.output_hash = sha256(&commit.output);
        commit.revealed = true;

        let task = &mut ctx.accounts.task;
        task.reveal_count = task
            .reveal_count
            .checked_add(1)
            .ok_or(SolCloudError::Overflow)?;
        Ok(())
    }

    /// Tally reveals. Majority (`floor(N/2)+1`) wins and is paid. Otherwise refund.
    ///
    /// Remaining accounts are triples:
    /// `[commit_0, wallet_0, node_0, ...]`.
    /// `wallet` is the node owner and must match `commit.node`.
    /// `node` is that owner's node PDA. A minority reveal loses `slash_bps` of its stake.
    pub fn finalize(ctx: Context<Finalize>, _task_id: u64) -> Result<()> {
        let committee_size = ctx.accounts.task.committee_size;
        require!(
            ctx.accounts.task.reveal_count == committee_size,
            SolCloudError::InvalidTaskState
        );
        require!(
            ctx.accounts.task.status == TaskStatus::Revealing,
            SolCloudError::InvalidTaskState
        );
        require!(
            ctx.remaining_accounts.len() == committee_size as usize * 3,
            SolCloudError::BadFinalizeAccounts
        );

        let task_key = ctx.accounts.task.key();
        let mut best_hash = [0u8; 32];
        let mut best_output: Vec<u8> = Vec::new();
        let mut best_count: u8 = 0;
        let mut counts: Vec<([u8; 32], u8)> = Vec::new();

        for pair in 0..committee_size as usize {
            let commit = read_commit(&ctx.remaining_accounts[pair * 3])?;
            let wallet = ctx.remaining_accounts[pair * 3 + 1].key();
            require!(commit.task == task_key, SolCloudError::BadFinalizeAccounts);
            require!(commit.revealed, SolCloudError::InvalidTaskState);
            require!(commit.node == wallet, SolCloudError::BadFinalizeAccounts);
            require!(
                ctx.accounts.task.committee.contains(&commit.node),
                SolCloudError::NotInCommittee
            );

            if let Some((_, n)) = counts.iter_mut().find(|(h, _)| *h == commit.output_hash) {
                *n = n.checked_add(1).ok_or(SolCloudError::Overflow)?;
                if *n > best_count {
                    best_count = *n;
                    best_hash = commit.output_hash;
                    best_output = commit.output.clone();
                }
            } else {
                counts.push((commit.output_hash, 1));
                if best_count == 0 {
                    best_count = 1;
                    best_hash = commit.output_hash;
                    best_output = commit.output.clone();
                }
            }
        }

        let threshold = consensus_threshold(committee_size);
        let reward = ctx.accounts.task.reward;
        let agreed = best_count >= threshold;

        {
            let task = &mut ctx.accounts.task;
            let result = &mut ctx.accounts.result;
            result.task = task.key();
            result.committee_size = committee_size;
            result.finalized_at = Clock::get()?.unix_timestamp;
            result.bump = ctx.bumps.result;
            if agreed {
                result.final_output = best_output;
                result.output_hash = best_hash;
                result.status = ResultStatus::Finalized;
                result.agreed_count = best_count;
                task.status = TaskStatus::Finalized;
            } else {
                result.final_output = Vec::new();
                result.output_hash = [0u8; 32];
                result.status = ResultStatus::Refunded;
                result.agreed_count = best_count;
                task.status = TaskStatus::Refunded;
            }
            task.reward = 0;
        }

        if agreed {
            let winners = best_count as u64;
            let share = reward / winners;
            let mut paid = 0u64;
            for pair in 0..committee_size as usize {
                let commit = read_commit(&ctx.remaining_accounts[pair * 3])?;
                if commit.output_hash == best_hash {
                    move_lamports(
                        &ctx.accounts.task.to_account_info(),
                        &ctx.remaining_accounts[pair * 3 + 1],
                        share,
                    )?;
                    paid = paid.checked_add(share).ok_or(SolCloudError::Overflow)?;
                }
            }
            let dust = reward.checked_sub(paid).ok_or(SolCloudError::Overflow)?;
            move_lamports(
                &ctx.accounts.task.to_account_info(),
                &ctx.accounts.requester.to_account_info(),
                dust,
            )?;
        } else {
            move_lamports(
                &ctx.accounts.task.to_account_info(),
                &ctx.accounts.requester.to_account_info(),
                reward,
            )?;
        }

        // A majority loser loses slash_bps of its stake. The SOL goes to the treasury.
        if agreed {
            let slash_bps = ctx.accounts.config.slash_bps;
            for pair in 0..committee_size as usize {
                let commit = read_commit(&ctx.remaining_accounts[pair * 3])?;
                if commit.output_hash == best_hash {
                    continue;
                }
                let node_info = &ctx.remaining_accounts[pair * 3 + 2];
                let (pda, _) = Pubkey::find_program_address(
                    &[NODE_SEED, commit.node.as_ref()],
                    ctx.program_id,
                );
                require!(pda == node_info.key(), SolCloudError::InvalidCommitteeNode);
                let slashed = reduce_stake(node_info, slash_bps)?;
                move_lamports(
                    node_info,
                    &ctx.accounts.treasury.to_account_info(),
                    slashed,
                )?;
                msg!("slashed {} lamports from {}", slashed, commit.node);
            }
        }

        Ok(())
    }
}

fn read_node(acc: &AccountInfo) -> Result<NodeAccount> {
    let data = acc.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    NodeAccount::try_deserialize(&mut slice)
        .map_err(|_| error!(SolCloudError::InvalidCommitteeNode))
}

fn reduce_stake(acc: &AccountInfo, slash_bps: u16) -> Result<u64> {
    let mut node = read_node(acc)?;
    let slashed = node
        .stake_amount
        .checked_mul(slash_bps as u64)
        .ok_or(SolCloudError::Overflow)?
        / 10_000;
    node.stake_amount = node
        .stake_amount
        .checked_sub(slashed)
        .ok_or(SolCloudError::Overflow)?;
    if node.stake_amount == 0 {
        node.status = NodeStatus::Slashed;
    }
    let mut data = acc.try_borrow_mut_data()?;
    node.try_serialize(&mut &mut data[..])?;
    Ok(slashed)
}

fn read_commit(acc: &AccountInfo) -> Result<CommitAccount> {
    let data = acc.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    CommitAccount::try_deserialize(&mut slice).map_err(|_| error!(SolCloudError::BadFinalizeAccounts))
}

fn commitment_of(output: &[u8], nonce: u64) -> [u8; 32] {
    let mut data = Vec::with_capacity(output.len() + 8);
    data.extend_from_slice(output);
    data.extend_from_slice(&nonce.to_le_bytes());
    sha256(&data)
}

fn sha256(data: &[u8]) -> [u8; 32] {
    hash(data).to_bytes()
}

fn transfer_from_signer<'info>(
    system_program: &Program<'info, System>,
    from: &Signer<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    system_program::transfer(
        CpiContext::new(
            system_program.to_account_info(),
            Transfer {
                from: from.to_account_info(),
                to: to.clone(),
            },
        ),
        amount,
    )
}

/// Move lamports from a program-owned account to any destination.
fn move_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let mut from_lamports = from.try_borrow_mut_lamports()?;
    let mut to_lamports = to.try_borrow_mut_lamports()?;
    **from_lamports = from_lamports
        .checked_sub(amount)
        .ok_or(SolCloudError::Overflow)?;
    **to_lamports = to_lamports
        .checked_add(amount)
        .ok_or(SolCloudError::Overflow)?;
    Ok(())
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
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: treasury pubkey is the one stored in Config.
    #[account(mut, address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: must be the original requester. Checked against `task.requester`.
    #[account(mut, address = task.requester)]
    pub requester: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
