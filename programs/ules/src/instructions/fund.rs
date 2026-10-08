use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{error::UlesError, events::ActionFunded, state::*};

#[derive(Accounts)]
pub struct Fund<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(has_one = issuer, has_one = settlement_mint)]
    pub bond: Account<'info, Bond>,
    #[account(mut, has_one = bond)]
    pub action: Account<'info, Action>,
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = issuer,
        token::token_program = settlement_token_program,
    )]
    pub issuer_settlement: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = issuer,
        associated_token::mint = settlement_mint,
        associated_token::authority = action,
        associated_token::token_program = settlement_token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub settlement_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_fund(ctx: Context<Fund>) -> Result<()> {
    let action = &ctx.accounts.action;
    require!(
        action.status == ActionStatus::Announced,
        UlesError::InvalidStatus
    );
    let total = action.total_due()?;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.settlement_token_program.key(),
            TransferChecked {
                from: ctx.accounts.issuer_settlement.to_account_info(),
                mint: ctx.accounts.settlement_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.issuer.to_account_info(),
            },
        ),
        total,
        ctx.accounts.settlement_mint.decimals,
    )?;

    let action = &mut ctx.accounts.action;
    action.funded = total;
    action.status = ActionStatus::Funded;
    emit!(ActionFunded {
        bond: action.bond,
        action_id: action.id,
        amount: total,
    });
    Ok(())
}
