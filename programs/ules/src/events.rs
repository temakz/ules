use anchor_lang::prelude::*;

use crate::state::ActionKind;

#[event]
pub struct ActionAnnounced {
    pub bond: Pubkey,
    pub action_id: u64,
    pub kind: ActionKind,
    pub record_ts: i64,
    pub pay_end_ts: i64,
}

#[event]
pub struct ActionFunded {
    pub bond: Pubkey,
    pub action_id: u64,
    pub amount: u64,
}

#[event]
pub struct Settled {
    pub bond: Pubkey,
    pub action_id: u64,
    pub wallet: Pubkey,
    pub qty: u64,
    pub amount: u64,
}

#[event]
pub struct ActionClosed {
    pub bond: Pubkey,
    pub action_id: u64,
    pub paid: u64,
    pub returned: u64,
}
