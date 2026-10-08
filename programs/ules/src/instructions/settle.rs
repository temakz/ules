use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{burn, Burn, Token2022},
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{constants::*, error::UlesError, events::Settled, state::*};

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, has_one = mint, has_one = settlement_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(mut, has_one = bond)]
    pub action: Box<Account<'info, Action>>,
    #[account(
        mut,
        seeds = [HOLDER_SEED, bond.key().as_ref(), holder.wallet.as_ref()],
        bump = holder.bump,
    )]
    pub holder: Box<Account<'info, Holder>>,
    /// CHECK: the registered wallet, only used as the owner of its token accounts
    #[account(address = holder.wallet)]
    pub wallet: UncheckedAccount<'info>,
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = wallet,
        associated_token::token_program = token_program,
    )]
    pub holder_bonds: Box<InterfaceAccount<'info, TokenAccount>>,
    pub settlement_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = settlement_mint,
        associated_token::authority = action,
        associated_token::token_program = settlement_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = settlement_mint,
        associated_token::authority = wallet,
        associated_token::token_program = settlement_token_program,
    )]
    pub holder_settlement: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [RECEIPT_SEED, action.key().as_ref(), holder.key().as_ref()],
        bump,
    )]
    pub receipt: Box<Account<'info, Receipt>>,
    pub token_program: Program<'info, Token2022>,
    pub settlement_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_settle(ctx: Context<Settle>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let accounts = ctx.accounts;
    let action = &accounts.action;
    require!(
        action.status == ActionStatus::Funded,
        UlesError::InvalidStatus
    );
    require!(now >= action.record_ts, UlesError::RecordDateNotReached);
    require!(now <= action.pay_end_ts, UlesError::PaymentWindowClosed);

    let balance = accounts.holder_bonds.amount;
    let qty = accounts.holder.snap(action.id).unwrap_or(balance);
    require!(qty > 0, UlesError::NothingToSettle);
    let amount = action.entitlement(qty)?;

    let bond_key = accounts.bond.key();
    let id_bytes = action.id.to_le_bytes();
    let action_seeds: &[&[u8]] = &[ACTION_SEED, bond_key.as_ref(), &id_bytes, &[action.bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            accounts.settlement_token_program.key(),
            TransferChecked {
                from: accounts.vault.to_account_info(),
                mint: accounts.settlement_mint.to_account_info(),
                to: accounts.holder_settlement.to_account_info(),
                authority: action.to_account_info(),
            },
            &[action_seeds],
        ),
        amount,
        accounts.settlement_mint.decimals,
    )?;

    if action.kind == ActionKind::Redemption {
        // The burn bypasses the transfer hook, so take the snapshots it would
        // have taken. Otherwise an unpaid coupon would later read a zero balance.
        accounts
            .holder
            .snapshot_fixed(&accounts.bond, now, balance)?;

        let mint_key = accounts.bond.mint;
        let bond_seeds: &[&[u8]] = &[BOND_SEED, mint_key.as_ref(), &[accounts.bond.bump]];
        burn(
            CpiContext::new_with_signer(
                accounts.token_program.key(),
                Burn {
                    mint: accounts.mint.to_account_info(),
                    from: accounts.holder_bonds.to_account_info(),
                    authority: accounts.bond.to_account_info(),
                },
                &[bond_seeds],
            ),
            qty,
        )?;
        accounts.bond.supply = accounts
            .bond
            .supply
            .checked_sub(qty)
            .ok_or(UlesError::MathOverflow)?;
    }

    let action = &mut accounts.action;
    action.paid = action
        .paid
        .checked_add(amount)
        .ok_or(UlesError::MathOverflow)?;
    action.settled_qty = action
        .settled_qty
        .checked_add(qty)
        .ok_or(UlesError::MathOverflow)?;
    action.receipts += 1;

    accounts.receipt.set_inner(Receipt {
        action: action.key(),
        wallet: accounts.holder.wallet,
        qty,
        amount,
        ts: now,
    });
    emit!(Settled {
        bond: bond_key,
        action_id: action.id,
        wallet: accounts.holder.wallet,
        qty,
        amount,
    });
    Ok(())
}
