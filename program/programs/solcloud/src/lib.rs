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
        cfg.active_nodes = Vec::new();
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
        node.tasks_slashed = 0;
        node.bump = ctx.bumps.node;

        ctx.accounts.config.node_count = ctx
            .accounts
            .config
            .node_count
            .checked_add(1)
            .ok_or(SolCloudError::Overflow)?;
        push_active_node(&mut ctx.accounts.config, ctx.accounts.owner.key())?;
        Ok(())
    }

    /// Grow the live config account so `active_nodes` can be read.
    ///
    /// The devnet config was created before that field. Call this once after the
    /// upgrade, before register, index, request, or finalize. New bytes are zero,
    /// which is an empty list.
    pub fn extend_registry(ctx: Context<ExtendRegistry>) -> Result<()> {
        let info = ctx.accounts.config.to_account_info();
        let target = 8 + Config::INIT_SPACE;
        let current = info.data_len();
        require!(current <= target, SolCloudError::Overflow);
        if current == target {
            return Ok(());
        }

        let authority = {
            let data = info.try_borrow_data()?;
            require!(data.len() >= 40, SolCloudError::InvalidTaskState);
            Pubkey::try_from(&data[8..40]).map_err(|_| error!(SolCloudError::InvalidTaskState))?
        };
        require!(
            ctx.accounts.authority.key() == authority,
            SolCloudError::BadAuthority
        );
        require!(info.owner == ctx.program_id, SolCloudError::InvalidCommitteeNode);
        let (pda, _) = Pubkey::find_program_address(&[CONFIG_SEED], ctx.program_id);
        require!(info.key() == pda, SolCloudError::InvalidCommitteeNode);

        let rent = Rent::get()?;
        let due = rent
            .minimum_balance(target)
            .saturating_sub(info.lamports());
        if due > 0 {
            transfer_from_signer(
                &ctx.accounts.system_program,
                &ctx.accounts.authority,
                &info,
                due,
            )?;
        }
        info.resize(target)?;
        let mut data = info.try_borrow_mut_data()?;
        for byte in data.iter_mut().skip(current) {
            *byte = 0;
        }
        Ok(())
    }

    /// Put an already-registered active node onto `config.active_nodes`.
    ///
    /// `register_node` does this for new nodes. The three nodes already on devnet
    /// need this once, signed by the config authority.
    pub fn index_node(ctx: Context<IndexNode>) -> Result<()> {
        let node = load_node(&ctx.accounts.node.to_account_info(), ctx.program_id)?;
        let owner = node.owner;
        require!(node.status == NodeStatus::Active, SolCloudError::NodeNotActive);
        let (pda, _) = Pubkey::find_program_address(
            &[NODE_SEED, owner.as_ref()],
            ctx.program_id,
        );
        require!(pda == ctx.accounts.node.key(), SolCloudError::InvalidCommitteeNode);
        push_active_node(&mut ctx.accounts.config, owner)
    }

    /// A dApp requests an off-chain computation and escrows the reward.
    ///
    /// The requester chooses N (odd, 3..=11) and a slot it just observed.
    /// The program draws N owners from `config.active_nodes` with
    /// `sha256(slot ‖ task_id)` and rejects any other remaining-accounts list.
    /// The landing slot itself is not the seed: a wallet signature cannot be
    /// built and landed inside one 400ms slot.
    pub fn request_task(
        ctx: Context<RequestTask>,
        task_id: u64,
        wasm_hash: [u8; 32],
        input: Vec<u8>,
        reward: u64,
        committee_size: u8,
        seed_slot: u64,
    ) -> Result<()> {
        require!(input.len() <= MAX_INPUT_LEN, SolCloudError::InputTooLarge);
        require!(
            (MIN_COMMITTEE_SIZE..=MAX_COMMITTEE_SIZE).contains(&committee_size),
            SolCloudError::InvalidCommitteeSize
        );
        require!(committee_size % 2 == 1, SolCloudError::CommitteeSizeNotOdd);
        let committee_len = committee_size as usize;
        require!(
            ctx.remaining_accounts.len() == committee_len,
            SolCloudError::NotEnoughNodes
        );
        require!(
            ctx.accounts.config.active_nodes.len() >= committee_len,
            SolCloudError::NotEnoughNodes
        );

        let clock = Clock::get()?;
        require!(seed_slot <= clock.slot, SolCloudError::SeedSlotInFuture);
        require!(
            clock.slot - seed_slot <= MAX_SEED_SLOT_LAG,
            SolCloudError::SeedSlotExpired
        );
        let seed = committee_seed(seed_slot, task_id);
        let committee = select_committee(&ctx.accounts.config.active_nodes, committee_len, &seed);

        for i in 0..committee_len {
            let expected = committee[i];
            let (pda, _) = Pubkey::find_program_address(
                &[NODE_SEED, expected.as_ref()],
                ctx.program_id,
            );
            require!(
                pda == ctx.remaining_accounts[i].key(),
                SolCloudError::CommitteeMismatch
            );
            let node = read_node(&ctx.remaining_accounts[i])?;
            require!(node.owner == expected, SolCloudError::InvalidCommitteeNode);
            require!(
                node.status == NodeStatus::Active,
                SolCloudError::NodeNotActive
            );
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
        let node = load_node(&ctx.accounts.node.to_account_info(), ctx.program_id)?;
        require!(node.owner == owner, SolCloudError::InvalidCommitteeNode);
        require!(node.status == NodeStatus::Active, SolCloudError::NodeNotActive);
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
        commit.revealed_at = 0;
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
        commit.revealed_at = clock.unix_timestamp;

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
                    let node_info = &ctx.remaining_accounts[pair * 3 + 2];
                    let (pda, _) = Pubkey::find_program_address(
                        &[NODE_SEED, commit.node.as_ref()],
                        ctx.program_id,
                    );
                    require!(pda == node_info.key(), SolCloudError::InvalidCommitteeNode);
                    note_task_completed(node_info)?;
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

    /// Return the escrowed reward when a window closed before the task could finish.
    ///
    /// Committing: allowed after `commit_deadline` if not every node committed.
    /// Revealing: allowed after `reveal_deadline` if not every node revealed.
    /// A full set of reveals must use `finalize` instead, even after the deadline.
    pub fn refund_expired(ctx: Context<RefundExpired>, _task_id: u64) -> Result<()> {
        let clock = Clock::get()?;
        let now = clock.unix_timestamp;
        let status = ctx.accounts.task.status;
        let commit_deadline = ctx.accounts.task.commit_deadline;
        let reveal_deadline = ctx.accounts.task.reveal_deadline;
        let reveal_count = ctx.accounts.task.reveal_count;
        let committee_size = ctx.accounts.task.committee_size;

        let expired = match status {
            TaskStatus::Committing => now > commit_deadline,
            TaskStatus::Revealing => now > reveal_deadline && reveal_count < committee_size,
            _ => false,
        };
        require!(expired, SolCloudError::WindowStillOpen);

        let reward = ctx.accounts.task.reward;
        {
            let task = &mut ctx.accounts.task;
            let result = &mut ctx.accounts.result;
            result.task = task.key();
            result.final_output = Vec::new();
            result.output_hash = [0u8; 32];
            result.status = ResultStatus::Refunded;
            result.agreed_count = reveal_count;
            result.committee_size = committee_size;
            result.finalized_at = now;
            result.bump = ctx.bumps.result;
            task.status = TaskStatus::Refunded;
            task.reward = 0;
        }

        move_lamports(
            &ctx.accounts.task.to_account_info(),
            &ctx.accounts.requester.to_account_info(),
            reward,
        )?;
        Ok(())
    }

    /// Reserve an account for a Wasm module. The bytes follow in `write_module`.
    pub fn create_module(ctx: Context<CreateModule>, wasm_hash: [u8; 32], size: u32) -> Result<()> {
        let module = &mut ctx.accounts.module;
        module.uploader = ctx.accounts.uploader.key();
        module.wasm_hash = wasm_hash;
        module.size = size;
        module.sealed = false;
        module.bump = ctx.bumps.module;
        module.data = Vec::new();
        Ok(())
    }

    /// Append the next bytes. The last chunk must make the whole module hash to
    /// `wasm_hash`, or the transaction fails and the module stays open.
    pub fn write_module(ctx: Context<WriteModule>, chunk: Vec<u8>) -> Result<()> {
        let module = &mut ctx.accounts.module;
        require!(!module.sealed, SolCloudError::ModuleSealed);
        require!(
            module.data.len() + chunk.len() <= module.size as usize,
            SolCloudError::ModuleOverflow
        );
        module.data.extend_from_slice(&chunk);
        if module.data.len() == module.size as usize {
            require!(
                sha256(&module.data) == module.wasm_hash,
                SolCloudError::ModuleHashMismatch
            );
            module.sealed = true;
        }
        Ok(())
    }

    /// Give up on an upload that never completed and take the rent back.
    /// A sealed module stays: tasks may already name it.
    pub fn close_module(ctx: Context<CloseModule>) -> Result<()> {
        require!(!ctx.accounts.module.sealed, SolCloudError::ModuleSealed);
        Ok(())
    }
}

fn load_node(acc: &AccountInfo, program_id: &Pubkey) -> Result<NodeAccount> {
    require!(acc.owner == program_id, SolCloudError::InvalidCommitteeNode);
    let node = read_node(acc)?;
    let (pda, _) = Pubkey::find_program_address(&[NODE_SEED, node.owner.as_ref()], program_id);
    require!(pda == acc.key(), SolCloudError::InvalidCommitteeNode);
    Ok(node)
}

fn read_node(acc: &AccountInfo) -> Result<NodeAccount> {
    let data = acc.try_borrow_data()?;
    // A node created before `tasks_slashed` is exactly `INIT_SPACE` bytes.
    // The missing counter is zero. `finalize` grows the account when it writes.
    if data.len() == NodeAccount::INIT_SPACE {
        let mut padded = data.to_vec();
        padded.extend_from_slice(&[0u8; 8]);
        let mut slice: &[u8] = &padded;
        return NodeAccount::try_deserialize(&mut slice)
            .map_err(|_| error!(SolCloudError::InvalidCommitteeNode));
    }
    let mut slice: &[u8] = &data;
    NodeAccount::try_deserialize(&mut slice).map_err(|_| error!(SolCloudError::InvalidCommitteeNode))
}

fn grow_node(acc: &AccountInfo) -> Result<()> {
    let target = 8 + NodeAccount::INIT_SPACE;
    let current = acc.data_len();
    if current >= target {
        return Ok(());
    }
    acc.resize(target)?;
    let mut data = acc.try_borrow_mut_data()?;
    for byte in data.iter_mut().skip(current) {
        *byte = 0;
    }
    Ok(())
}

fn note_task_completed(acc: &AccountInfo) -> Result<()> {
    grow_node(acc)?;
    let mut node = read_node(acc)?;
    node.tasks_completed = node
        .tasks_completed
        .checked_add(1)
        .ok_or(SolCloudError::Overflow)?;
    let mut data = acc.try_borrow_mut_data()?;
    node.try_serialize(&mut &mut data[..])?;
    Ok(())
}

fn reduce_stake(acc: &AccountInfo, slash_bps: u16) -> Result<u64> {
    grow_node(acc)?;
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
    node.tasks_slashed = node
        .tasks_slashed
        .checked_add(1)
        .ok_or(SolCloudError::Overflow)?;
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

/// `sha256(slot_le ‖ task_id_le)`. Public: the client runs this same mix.
fn committee_seed(slot: u64, task_id: u64) -> [u8; 32] {
    let mut input = [0u8; 16];
    input[..8].copy_from_slice(&slot.to_le_bytes());
    input[8..].copy_from_slice(&task_id.to_le_bytes());
    hash(&input).to_bytes()
}

/// Fisher-Yates shuffle of `nodes`, then the first `size` owners.
/// The same seed always returns the same order.
fn select_committee(nodes: &[Pubkey], size: usize, seed: &[u8; 32]) -> Vec<Pubkey> {
    let mut order = nodes.to_vec();
    let mut state = *seed;
    for i in (1..order.len()).rev() {
        state = hash(&state).to_bytes();
        let draw = u64::from_le_bytes(state[..8].try_into().unwrap());
        let j = (draw % (i as u64 + 1)) as usize;
        order.swap(i, j);
    }
    order.truncate(size);
    order
}

fn push_active_node(config: &mut Config, owner: Pubkey) -> Result<()> {
    if config.active_nodes.contains(&owner) {
        return Ok(());
    }
    require!(
        config.active_nodes.len() < MAX_ACTIVE_NODES,
        SolCloudError::RegistryFull
    );
    config.active_nodes.push(owner);
    Ok(())
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
pub struct ExtendRegistry<'info> {
    /// CHECK: the live account is still the old size, so it cannot be deserialized as Config yet.
    #[account(mut)]
    pub config: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct IndexNode<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: an existing node PDA. It may still be the pre-tasks_slashed size. The handler checks it.
    pub node: UncheckedAccount<'info>,
    #[account(address = config.authority)]
    pub authority: Signer<'info>,
}

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
    /// CHECK: the signer's node PDA. An older account has no tasks_slashed field and is read as zero.
    pub node: UncheckedAccount<'info>,
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

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct RefundExpired<'info> {
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
    /// CHECK: must be the original requester. Checked against `task.requester`.
    #[account(mut, address = task.requester)]
    pub requester: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(wasm_hash: [u8; 32], size: u32)]
pub struct CreateModule<'info> {
    #[account(
        init,
        payer = uploader,
        space = 8 + ModuleAccount::BASE_SPACE + size as usize,
        seeds = [MODULE_SEED, uploader.key().as_ref(), wasm_hash.as_ref()],
        bump,
        constraint = size > 0 && size as usize <= MAX_MODULE_LEN @ SolCloudError::BadModuleSize
    )]
    pub module: Account<'info, ModuleAccount>,
    #[account(mut)]
    pub uploader: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WriteModule<'info> {
    #[account(
        mut,
        seeds = [MODULE_SEED, uploader.key().as_ref(), module.wasm_hash.as_ref()],
        bump = module.bump,
        has_one = uploader
    )]
    pub module: Account<'info, ModuleAccount>,
    pub uploader: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseModule<'info> {
    #[account(
        mut,
        close = uploader,
        seeds = [MODULE_SEED, uploader.key().as_ref(), module.wasm_hash.as_ref()],
        bump = module.bump,
        has_one = uploader
    )]
    pub module: Account<'info, ModuleAccount>,
    #[account(mut)]
    pub uploader: Signer<'info>,
}

#[cfg(test)]
mod committee_tests {
    use super::*;

    fn key(byte: u8) -> Pubkey {
        Pubkey::new_from_array([byte; 32])
    }

    #[test]
    fn committee_draw_is_stable_and_inside_the_registry() {
        let nodes: Vec<Pubkey> = (1..=5).map(key).collect();
        let seed = committee_seed(100, 7);
        let picked = select_committee(&nodes, 3, &seed);
        assert_eq!(picked, select_committee(&nodes, 3, &seed));
        assert_eq!(picked.len(), 3);
        let mut seen = std::collections::BTreeSet::new();
        for owner in &picked {
            assert!(nodes.contains(owner));
            assert!(seen.insert(*owner));
        }
        // Locked so the dashboard shuffle can be checked against these bytes.
        let hex: String = picked
            .iter()
            .map(|owner| {
                owner
                    .to_bytes()
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>()
            })
            .collect::<Vec<_>>()
            .join(",");
        assert_eq!(
            hex,
            "\
0101010101010101010101010101010101010101010101010101010101010101,\
0303030303030303030303030303030303030303030303030303030303030303,\
0202020202020202020202020202020202020202020202020202020202020202"
        );
    }
}
