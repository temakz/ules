pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

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
}
