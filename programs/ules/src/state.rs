use anchor_lang::prelude::*;

use crate::{constants::MAX_OPEN_ACTIONS, error::UlesError};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct OpenAction {
    pub id: u64,
    pub record_ts: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Bond {
    pub issuer: Pubkey,
    pub registrar: Pubkey,
    pub mint: Pubkey,
    pub settlement_mint: Pubkey,
    pub nominal: u64,
    pub coupon_rate_bps: u16,
    pub coupons_per_year: u8,
    pub maturity_ts: i64,
    pub pay_window_secs: i64,
    pub supply: u64,
    pub issuance_closed: bool,
    pub halted_from_ts: Option<i64>,
    pub next_action_id: u64,
    pub open_actions: [OpenAction; MAX_OPEN_ACTIONS],
    pub bump: u8,
}

impl Bond {
    pub fn is_open(&self, action_id: u64) -> bool {
        action_id != 0 && self.open_actions.iter().any(|a| a.id == action_id)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct Snap {
    pub action_id: u64,
    pub balance: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Holder {
    pub bond: Pubkey,
    pub wallet: Pubkey,
    pub snaps: [Snap; MAX_OPEN_ACTIONS],
    pub bump: u8,
}

impl Holder {
    pub fn snap(&self, action_id: u64) -> Option<u64> {
        self.snaps
            .iter()
            .find(|s| s.action_id == action_id)
            .map(|s| s.balance)
    }

    // A slot is free once its action is no longer open, so four slots always
    // cover four open actions without any cleanup instruction.
    pub fn record_snap(&mut self, bond: &Bond, action_id: u64, balance: u64) -> Result<()> {
        if self.snap(action_id).is_some() {
            return Ok(());
        }
        let slot = self
            .snaps
            .iter_mut()
            .find(|s| !bond.is_open(s.action_id))
            .ok_or(UlesError::NoFreeSnapSlot)?;
        *slot = Snap { action_id, balance };
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ActionKind {
    Coupon,
    PartialRedemption,
    Redemption,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ActionStatus {
    Announced,
    Funded,
    Closed,
}

#[account]
#[derive(InitSpace)]
pub struct Action {
    pub bond: Pubkey,
    pub id: u64,
    pub kind: ActionKind,
    pub record_ts: i64,
    pub pay_end_ts: i64,
    pub principal_per_bond: u64,
    pub nominal_at_announce: u64,
    pub coupon_rate_bps: u16,
    pub coupons_per_year: u8,
    pub supply_at_record: u64,
    pub funded: u64,
    pub paid: u64,
    pub receipts: u32,
    pub status: ActionStatus,
    pub bump: u8,
}
