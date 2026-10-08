use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount},
};

use crate::{constants::*, state::*};

#[derive(Accounts)]
pub struct RegisterHolder<'info> {
    #[account(mut)]
    pub registrar: Signer<'info>,
    #[account(has_one = registrar, has_one = mint)]
    pub bond: Account<'info, Bond>,
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: any wallet can be registered, the registrar vouches for it
    pub wallet: UncheckedAccount<'info>,
    #[account(
        init,
        payer = registrar,
        space = 8 + Holder::INIT_SPACE,
        seeds = [HOLDER_SEED, bond.key().as_ref(), wallet.key().as_ref()],
        bump,
    )]
    pub holder: Account<'info, Holder>,
    #[account(
        init,
        payer = registrar,
        associated_token::mint = mint,
        associated_token::authority = wallet,
        associated_token::token_program = token_program,
    )]
    pub holder_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_holder(ctx: Context<RegisterHolder>) -> Result<()> {
    ctx.accounts.holder.set_inner(Holder {
        bond: ctx.accounts.bond.key(),
        wallet: ctx.accounts.wallet.key(),
        snaps: Default::default(),
        bump: ctx.bumps.holder,
    });
    Ok(())
}
