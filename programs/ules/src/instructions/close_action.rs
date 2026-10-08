use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::{constants::*, error::UlesError, events::ActionClosed, state::*};

#[derive(Accounts)]
pub struct CloseAction<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(mut, has_one = issuer, has_one = settlement_mint)]
    pub bond: Account<'info, Bond>,
    #[account(mut, has_one = bond)]
    pub action: Account<'info, Action>,
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = settlement_mint,
        associated_token::authority = action,
        associated_token::token_program = settlement_token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = issuer,
        token::token_program = settlement_token_program,
    )]
    pub issuer_settlement: InterfaceAccount<'info, TokenAccount>,
    pub settlement_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_close_action(ctx: Context<CloseAction>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let action = &ctx.accounts.action;
    require!(
        action.status == ActionStatus::Funded,
        UlesError::InvalidStatus
    );
    require!(
        now > action.pay_end_ts || action.settled_qty == action.supply_at_record,
        UlesError::CloseTooEarly
    );

    let bond_key = ctx.accounts.bond.key();
    let id_bytes = action.id.to_le_bytes();
    let action_seeds: &[&[u8]] = &[ACTION_SEED, bond_key.as_ref(), &id_bytes, &[action.bump]];
    let program = ctx.accounts.settlement_token_program.key();

    let returned = ctx.accounts.vault.amount;
    if returned > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                program,
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.settlement_mint.to_account_info(),
                    to: ctx.accounts.issuer_settlement.to_account_info(),
                    authority: action.to_account_info(),
                },
                &[action_seeds],
            ),
            returned,
            ctx.accounts.settlement_mint.decimals,
        )?;
    }
    close_account(CpiContext::new_with_signer(
        program,
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.issuer.to_account_info(),
            authority: action.to_account_info(),
        },
        &[action_seeds],
    ))?;

    let action_id = action.id;
    if let Some(slot) = ctx
        .accounts
        .bond
        .open_actions
        .iter_mut()
        .find(|a| a.id == action_id)
    {
        *slot = OpenAction::default();
    }

    let action = &mut ctx.accounts.action;
    action.status = ActionStatus::Closed;
    emit!(ActionClosed {
        bond: bond_key,
        action_id,
        paid: action.paid,
        returned,
    });
    Ok(())
}
