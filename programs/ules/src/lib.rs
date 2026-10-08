pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use spl_discriminator::SplDiscriminate;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

pub use instructions::*;

declare_id!("2opZy6fred5rQdjREkie4nNqDt6wzPfDrqcmvgaqTZ49");

#[program]
pub mod ules {
    use super::*;

    pub fn create_bond(ctx: Context<CreateBond>, params: BondParams) -> Result<()> {
        instructions::create_bond::handle_create_bond(ctx, params)
    }

    pub fn register_holder(ctx: Context<RegisterHolder>) -> Result<()> {
        instructions::register_holder::handle_register_holder(ctx)
    }

    pub fn issue(ctx: Context<Issue>, qty: u64) -> Result<()> {
        instructions::issue::handle_issue(ctx, qty)
    }

    pub fn announce_coupon(ctx: Context<Announce>, record_ts: i64) -> Result<()> {
        instructions::announce::handle_announce_coupon(ctx, record_ts)
    }

    pub fn announce_partial_redemption(
        ctx: Context<Announce>,
        record_ts: i64,
        principal_per_bond: u64,
    ) -> Result<()> {
        instructions::announce::handle_announce_partial_redemption(
            ctx,
            record_ts,
            principal_per_bond,
        )
    }

    pub fn announce_redemption(ctx: Context<Announce>, record_ts: i64) -> Result<()> {
        instructions::announce::handle_announce_redemption(ctx, record_ts)
    }

    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        instructions::transfer_hook::handle_transfer_hook(ctx, amount)
    }
}
