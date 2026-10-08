use anchor_lang::prelude::*;

use crate::{constants::*, error::UlesError, state::*};

#[derive(Accounts)]
pub struct AnnounceCoupon<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(mut, has_one = issuer)]
    pub bond: Account<'info, Bond>,
    #[account(
        init,
        payer = issuer,
        space = 8 + Action::INIT_SPACE,
        seeds = [ACTION_SEED, bond.key().as_ref(), &bond.next_action_id.to_le_bytes()],
        bump,
    )]
    pub action: Account<'info, Action>,
    pub system_program: Program<'info, System>,
}

pub fn handle_announce_coupon(ctx: Context<AnnounceCoupon>, record_ts: i64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(record_ts > now, UlesError::RecordDateInPast);

    let bond = &mut ctx.accounts.bond;
    let id = bond.next_action_id;
    let slot = bond
        .open_actions
        .iter_mut()
        .find(|a| a.id == 0)
        .ok_or(UlesError::TooManyOpenActions)?;
    *slot = OpenAction { id, record_ts };
    bond.next_action_id += 1;
    bond.issuance_closed = true;

    ctx.accounts.action.set_inner(Action {
        bond: bond.key(),
        id,
        kind: ActionKind::Coupon,
        record_ts,
        pay_end_ts: record_ts + PAY_WINDOW_SECS,
        principal_per_bond: 0,
        nominal_at_announce: bond.nominal,
        coupon_rate_bps: bond.coupon_rate_bps,
        coupons_per_year: bond.coupons_per_year,
        supply_at_record: bond.supply,
        funded: 0,
        paid: 0,
        receipts: 0,
        status: ActionStatus::Announced,
        bump: ctx.bumps.action,
    });
    Ok(())
}
