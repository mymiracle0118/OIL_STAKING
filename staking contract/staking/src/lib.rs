use anchor_lang::{
    prelude::*,
    solana_program::{
            program::{invoke},
        },
};
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use metaplex_token_metadata::state::MAX_SYMBOL_LENGTH;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod staking{
    use super::*;

    pub fn init_pool(
        ctx : Context<InitPool>,
        _bump : u8,
        _reward_amount : u64,
        _period : u64,
        _pause_flag : bool,
        _collection_name : String,
        _collection_creator : Pubkey,
        ) -> ProgramResult {
        msg!("+ init_pool");
        let pool = &mut ctx.accounts.pool;
        pool.owner = ctx.accounts.owner.key();
        pool.rand = *ctx.accounts.rand.key;
        pool.reward_mint = ctx.accounts.reward_mint.key();
        pool.reward_account = ctx.accounts.reward_account.key();
        pool.reward_amount = _reward_amount;
        pool.period = _period;
        pool.pause_flag = _pause_flag;
        pool.withdrawable = true;
        pool.collection_name = _collection_name;
        pool.collection_creator = _collection_creator;
        pool.total_number = 0;
        pool.bump = _bump;
        Ok(())
    }

    pub fn set_pool(
        ctx : Context<SetPool>,
        _reward_amount : u64,
        _period : u64,
        _pause_flag : bool,
        _collection_name : String,
        _collection_creator : Pubkey,
        ) -> ProgramResult {
        msg!("+ set_pool");
        let pool = &mut ctx.accounts.pool;
        pool.reward_mint = ctx.accounts.reward_mint.key();
        pool.reward_account = ctx.accounts.reward_account.key();
        pool.reward_amount = _reward_amount;
        pool.period = _period;
        pool.pause_flag = _pause_flag;
        pool.collection_name = _collection_name;
        pool.collection_creator = _collection_creator;
        Ok(())
    }

    pub fn init_staking_data(
        ctx : Context<InitStakingData>,
        _bump : u8
        ) -> ProgramResult {
        msg!("+ init_staking_data");
        let pool = &ctx.accounts.pool;
        let staking_data = &mut ctx.accounts.staking_data;
        let metadata : metaplex_token_metadata::state::Metadata =  metaplex_token_metadata::state::Metadata::from_account_info(&ctx.accounts.metadata)?;
        if metadata.mint != ctx.accounts.nft_mint.key(){
            msg!("metadata is not matched");
            return Err(PoolError::InvalidMetadata.into());
        }
        if (&metadata.data.symbol).eq(&pool.collection_name){
            msg!("not match collection symbol");
            return Err(PoolError::InvalidMetadata.into());
        }
        staking_data.pool = ctx.accounts.pool.key();
        staking_data.nft_mint = ctx.accounts.nft_mint.key();
        Ok(())
    }

    pub fn stake(
        ctx : Context<Stake>,
        _amount : u64
        ) -> ProgramResult {
        msg!("+ stake");
        let pool = &mut ctx.accounts.pool;
        let staking_data = &mut ctx.accounts.staking_data;
        let clock = Clock::from_account_info(&ctx.accounts.clock)?;
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info().clone(),
            Transfer{
                from : ctx.accounts.nft_from.to_account_info().clone(),
                to : ctx.accounts.nft_to.to_account_info().clone(),
                authority : ctx.accounts.owner.to_account_info().clone()
            }
        );

        token::transfer(cpi_ctx, 1)?;

        if pool.pause_flag {
            sol_transfer_to_pool(
                SolTransferToPoolParams{
                    source : ctx.accounts.owner.clone(),
                    destination : ctx.accounts.pool.clone(),
                    system : ctx.accounts.system_program.to_account_info().clone(),
                    amount : _amount
                }
            )?;
        }

        staking_data.staker = ctx.accounts.owner.key();
        staking_data.stake_time = clock.unix_timestamp as u64;
        staking_data.claim_number = 0;
        staking_data.is_staked = true;
        Ok(())
    }

    pub fn unstake(
        ctx : Context<Unstake>,
        _amount : u64
        ) -> ProgramResult {
        msg!("+ unstake");
        let pool = &mut ctx.accounts.pool;
        let staking_data = &mut ctx.accounts.staking_data;
        let clock = Clock::from_account_info(&ctx.accounts.clock)?;
        let number = (clock.unix_timestamp as u64 - staking_data.stake_time) / pool.period;
        let amount = pool.reward_amount * (number-staking_data.claim_number);
        let pool_signer_seeds = &[pool.rand.as_ref(),&[pool.bump]];
        let signer = &[&pool_signer_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info().clone(),
            Transfer{
                from : ctx.accounts.nft_from.to_account_info().clone(),
                to : ctx.accounts.nft_to.to_account_info().clone(),
                authority : pool.to_account_info().clone()
            },
            signer
        );

        token::transfer(cpi_ctx, 1)?;

        let reward_cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info().clone(),
            Transfer{
                from : ctx.accounts.token_from.to_account_info().clone(),
                to : ctx.accounts.token_to.to_account_info().clone(),
                authority : pool.to_account_info().clone()
            },
            signer
        );

        token::transfer(reward_cpi_ctx, amount)?;

        if pool.pause_flag {
            sol_transfer_to_pool(
                SolTransferToPoolParams{
                    source : ctx.accounts.owner.clone(),
                    destination : ctx.accounts.pool.clone(),
                    system : ctx.accounts.system_program.to_account_info().clone(),
                    amount : _amount
                }
            )?;
        }

        staking_data.is_staked = false;

        Ok(())
    }

    pub fn set_pause(
        ctx : Context<Test>,
        _flag : bool
    ) -> ProgramResult {

        let pool = &mut ctx.accounts.pool;

        if pool.owner != *ctx.accounts.owner.key {
            msg!("Invalid Owner");
            return Err(PoolError::InvalidPoolOwner.into());
        }

        pool.pause_flag = _flag;

        Ok(())
    }

    pub fn claim(
        ctx : Context<Claim>,
        _amount : u64
        ) -> ProgramResult {
        msg!("+ claim");
        let pool = &mut ctx.accounts.pool;
        let staking_data = &mut ctx.accounts.staking_data;
        let clock = Clock::from_account_info(&ctx.accounts.clock)?;
        let number = (clock.unix_timestamp as u64 - staking_data.stake_time) / pool.period;
        let amount = pool.reward_amount * (number-staking_data.claim_number);
        let pool_signer_seeds = &[pool.rand.as_ref(),&[pool.bump]];
        let signer = &[&pool_signer_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info().clone(),
            Transfer{
                from : ctx.accounts.token_from.to_account_info().clone(),
                to : ctx.accounts.token_to.to_account_info().clone(),
                authority : pool.to_account_info().clone()
            },
            signer
        );

        token::transfer(cpi_ctx, amount)?;

        if pool.pause_flag && pool.owner == *ctx.accounts.owner.key {
            sol_transfer(
                &mut ctx.accounts.pool_address,
                &mut ctx.accounts.owner,
                _amount
            )?;
        }

        staking_data.claim_number = number;

        Ok(())
    }
}

struct SolTransferToPoolParams<'a> {
    /// CHECK:
    pub source: AccountInfo<'a>,
    /// CHECK:
    pub destination: ProgramAccount<'a, Pool>,
    /// CHECK:
    pub system: AccountInfo<'a>,
    /// CHECK:
    pub amount: u64,
}

fn sol_transfer_to_pool(params: SolTransferToPoolParams<'_>) -> ProgramResult {
    let SolTransferToPoolParams {
        source,
        destination,
        system,
        amount
    } = params;

    let result = invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            source.key,
            &destination.key(),
            amount,
        ),
        &[source, destination.to_account_info(), system],
    );

    result.map_err(|_| PoolError::SolTransferFailed.into())
}

fn sol_transfer(
    from_account: &AccountInfo,
    to_account: &AccountInfo,
    amount_of_lamports: u64,
) -> ProgramResult {
    // Does the from account have enough lamports to transfer?
    if **from_account.try_borrow_lamports()? < amount_of_lamports {
        return Err(PoolError::InsufficentFunds.into());
    }
    // Debit from_account and credit to_account
    **from_account.try_borrow_mut_lamports()? -= amount_of_lamports;
    **to_account.try_borrow_mut_lamports()? += amount_of_lamports;
    Ok(())
}

#[derive(Accounts)]
pub struct Stake<'info>{
    #[account(mut, signer)]
    owner : AccountInfo<'info>,

    #[account(mut)]
    pool : ProgramAccount<'info, Pool>,

    #[account(mut,
        constraint= staking_data.pool==pool.key() && 
        staking_data.is_staked==false)]
    staking_data : ProgramAccount<'info, StakingData>,

    #[account(mut,
        constraint= nft_from.mint==staking_data.nft_mint
            && nft_from.owner==owner.key()
            && nft_from.amount==1)]
    nft_from  : Account<'info, TokenAccount>,

    #[account(mut,
        constraint= nft_to.mint==staking_data.nft_mint
            && nft_to.owner==staking_data.pool)]
    nft_to : Account<'info, TokenAccount>,

    token_program : Program<'info, Token>,

    system_program : Program<'info, System>,

    clock : AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Unstake<'info>{
    #[account(mut, signer)]
    owner : AccountInfo<'info>,

    #[account(mut)]
    pool : ProgramAccount<'info, Pool>,

    #[account(mut,
        constraint= staking_data.pool==pool.key()
            && staking_data.is_staked==true
            && staking_data.staker==owner.key())]
    staking_data : ProgramAccount<'info, StakingData>,

    #[account(mut,
        constraint= nft_from.mint==staking_data.nft_mint
            && nft_from.owner==staking_data.pool)]
    nft_from : Box<Account<'info, TokenAccount>>,

    #[account(mut,
        constraint= nft_to.mint==staking_data.nft_mint)]
    nft_to :Box<Account<'info, TokenAccount>>,

    #[account(mut,
        constraint= token_from.owner==pool.key()
            && token_from.mint==pool.reward_mint)]
    token_from : Box<Account<'info, TokenAccount>>,

    #[account(mut,
        constraint= token_to.mint==pool.reward_mint)]
    token_to : Box<Account<'info, TokenAccount>>,

    token_program : Program<'info, Token>,

    system_program : Program<'info, System>,

    clock : AccountInfo<'info>
}

#[derive(Accounts)]
pub struct Claim<'info>{
    #[account(mut, signer)]
    owner : AccountInfo<'info>,

    #[account(mut)]
    pool : ProgramAccount<'info, Pool>,

    #[account(mut)]
    pool_address : AccountInfo<'info>,

    #[account(mut,
        constraint= staking_data.pool==pool.key() 
            && staking_data.is_staked==true
            && staking_data.staker==owner.key())]
    staking_data : ProgramAccount<'info, StakingData>,

    #[account(mut,
        constraint= token_from.owner==pool.key()
            && token_from.mint==pool.reward_mint)]
    token_from : Account<'info, TokenAccount>,

    #[account(mut,
        constraint= token_to.mint==pool.reward_mint)]
    token_to : Account<'info, TokenAccount>,

    token_program : Program<'info, Token>,

    clock : AccountInfo<'info>
}

#[derive(Accounts)]
#[instruction(_bump : u8)]
pub struct InitPool<'info>{
    #[account(mut)]
    owner : Signer<'info>,

    #[account(init,
        seeds=[(*rand.key).as_ref()],
        bump=_bump,
        payer=owner,
        space=8 + POOL_SIZE)]
    pool : ProgramAccount<'info, Pool>,

    rand : AccountInfo<'info>,

    reward_mint : Account<'info, Mint>,

    #[account(constraint=reward_account.owner==pool.key()
            && reward_account.mint==reward_mint.key())]
    reward_account : Account<'info, TokenAccount>,

    system_program : Program<'info, System>
}

#[derive(Accounts)]
pub struct SetPool<'info>{
    #[account(mut)]
    owner : Signer<'info>,

    #[account(mut, has_one=owner)]
    pool : ProgramAccount<'info, Pool>,

    reward_mint : Account<'info, Mint>,

    #[account(constraint=reward_account.owner==pool.key()
            && reward_account.mint==reward_mint.key())]
    reward_account : Account<'info, TokenAccount>,

    system_program : Program<'info, System>
}

#[derive(Accounts)]
pub struct Test<'info> {
    /// CHECK:
    #[account(mut, signer)]
    owner : AccountInfo<'info>,   

    /// CHECK:
    #[account(mut)]
    pool : ProgramAccount<'info,Pool>   
}

#[derive(Accounts)]
#[instruction(_bump : u8)]
pub struct InitStakingData<'info>{
    #[account(mut, signer)]
    owner : AccountInfo<'info>,

    pool : ProgramAccount<'info, Pool>,

    #[account(
        constraint= nft_mint.decimals==0
            && nft_mint.supply==1)]
    nft_mint : Account<'info, Mint>,

    metadata : AccountInfo<'info>,

    #[account(init,
        seeds=[nft_mint.key().as_ref(),pool.key().as_ref()],
        bump=_bump,
        payer=owner,
        space=8+STAKING_DATA)]
    staking_data : ProgramAccount<'info, StakingData>,

    system_program : Program<'info, System>
}

pub const POOL_SIZE : usize = 32+32+32+32+8+8+1+MAX_SYMBOL_LENGTH+32+8+1+1+30;
pub const STAKING_DATA : usize = 32+32+1+32+8+8+1;

#[account]
pub struct Pool{
    pub owner : Pubkey,
    pub rand : Pubkey,
    pub reward_mint : Pubkey,
    pub reward_account : Pubkey,
    pub reward_amount : u64,
    pub period : u64,
    pub pause_flag : bool,
    pub withdrawable : bool,
    pub collection_name : String,
    pub collection_creator : Pubkey,
    pub total_number : u64,
    pub bump : u8,
}

#[account]
pub struct StakingData{
    pub pool : Pubkey,
    pub nft_mint : Pubkey,
    pub is_staked : bool,
    pub staker : Pubkey,
    pub stake_time : u64,
    pub claim_number : u64,
}

#[error]
pub enum PoolError{
    #[msg("Invalid metadata")]
    InvalidMetadata,

    #[msg("Invalid Pool Owner")]
    InvalidPoolOwner,

    #[msg("Sol transfer failed")]
    SolTransferFailed,

    #[msg("Insufficent funds")]
    InsufficentFunds
}