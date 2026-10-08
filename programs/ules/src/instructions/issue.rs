use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{mint_to, MintTo, Token2022},
    token_interface::{Mint, TokenAccount},
};

use crate::{constants::*, error::UlesError, state::*};

#[derive(Accounts)]
pub struct Issue<'info> {
    pub issuer: Signer<'info>,
    #[account(mut, has_one = issuer, has_one = mint)]
    pub bond: Account<'info, Bond>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        seeds = [HOLDER_SEED, bond.key().as_ref(), holder.wallet.as_ref()],
        bump = holder.bump,
    )]
    pub holder: Account<'info, Holder>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = holder.wallet,
        associated_token::token_program = token_program,
    )]
    pub holder_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
}

pub fn handle_issue(ctx: Context<Issue>, qty: u64) -> Result<()> {
    require!(qty > 0, UlesError::ZeroAmount);
    let bond = &ctx.accounts.bond;
    require!(!bond.issuance_closed, UlesError::IssuanceClosed);

    let mint_key = bond.mint;
    let seeds: &[&[u8]] = &[BOND_SEED, mint_key.as_ref(), &[bond.bump]];
    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.holder_ata.to_account_info(),
                authority: bond.to_account_info(),
            },
            &[seeds],
        ),
        qty,
    )?;

    let bond = &mut ctx.accounts.bond;
    bond.supply = bond.supply.checked_add(qty).ok_or(UlesError::MathOverflow)?;
    Ok(())
}
