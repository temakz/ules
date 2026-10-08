use anchor_lang::prelude::*;

use crate::{constants::*, error::UlesError, events::ActionAnnounced, state::*};

#[derive(Accounts)]
pub struct Announce<'info> {
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

pub fn handle_announce_coupon(ctx: Context<Announce>, record_ts: i64) -> Result<()> {
    announce(ctx, ActionKind::Coupon, record_ts, 0)
}

pub fn handle_announce_partial_redemption(
    ctx: Context<Announce>,
    record_ts: i64,
    principal_per_bond: u64,
) -> Result<()> {
    let nominal = ctx.accounts.bond.nominal;
    require!(
        principal_per_bond > 0 && principal_per_bond < nominal,
        UlesError::InvalidPrincipal
    );
    announce(
        ctx,
        ActionKind::PartialRedemption,
        record_ts,
        principal_per_bond,
    )
}

pub fn handle_announce_redemption(ctx: Context<Announce>, record_ts: i64) -> Result<()> {
    let bond = &ctx.accounts.bond;
    require!(bond.halted_from_ts.is_none(), UlesError::AlreadyRedeeming);
    require!(
        bond.open_actions
            .iter()
            .all(|a| a.id == 0 || a.record_ts < record_ts),
        UlesError::AfterRedemption
    );
    announce(ctx, ActionKind::Redemption, record_ts, 0)
}

fn announce(
    ctx: Context<Announce>,
    kind: ActionKind,
    record_ts: i64,
    principal_per_bond: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(record_ts > now, UlesError::RecordDateInPast);

    let bond = &mut ctx.accounts.bond;
    if let Some(halted_from) = bond.halted_from_ts {
        require!(record_ts < halted_from, UlesError::AfterRedemption);
    }

    let id = bond.next_action_id;
    let slot = bond
        .open_actions
        .iter_mut()
        .find(|a| a.id == 0)
        .ok_or(UlesError::TooManyOpenActions)?;
    *slot = OpenAction { id, record_ts };
    bond.next_action_id += 1;
    bond.issuance_closed = true;

    let nominal_at_announce = bond.nominal;
    match kind {
        ActionKind::PartialRedemption => bond.nominal -= principal_per_bond,
        ActionKind::Redemption => bond.halted_from_ts = Some(record_ts),
        ActionKind::Coupon => {}
    }

    let pay_end_ts = record_ts
        .checked_add(bond.pay_window_secs)
        .ok_or(UlesError::MathOverflow)?;
    ctx.accounts.action.set_inner(Action {
        bond: bond.key(),
        id,
        kind,
        record_ts,
        pay_end_ts,
        principal_per_bond,
        nominal_at_announce,
        coupon_rate_bps: bond.coupon_rate_bps,
        coupons_per_year: bond.coupons_per_year,
        // Bonds are burned only when a redemption settles, and every other record
        // date comes before the redemption record date, so supply cannot change
        // between this announcement and the record date.
        supply_at_record: bond.supply,
        funded: 0,
        paid: 0,
        settled_qty: 0,
        receipts: 0,
        status: ActionStatus::Announced,
        bump: ctx.bumps.action,
    });

    emit!(ActionAnnounced {
        bond: bond.key(),
        action_id: id,
        kind,
        record_ts,
        pay_end_ts,
    });
    Ok(())
}
