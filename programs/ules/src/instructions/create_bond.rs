use anchor_lang::{
    prelude::*,
    system_program::{create_account, CreateAccount},
};
use anchor_spl::{
    token_2022::{
        initialize_mint2,
        spl_token_2022::{extension::ExtensionType, state::Mint as MintState},
        InitializeMint2, Token2022,
    },
    token_2022_extensions::{
        permanent_delegate_initialize, transfer_hook_initialize, PermanentDelegateInitialize,
        TransferHookInitialize,
    },
    token_interface::Mint,
};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::{constants::*, error::UlesError, state::*};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BondParams {
    pub registrar: Pubkey,
    pub nominal: u64,
    pub coupon_rate_bps: u16,
    pub coupons_per_year: u8,
    pub maturity_ts: i64,
}

#[derive(Accounts)]
pub struct CreateBond<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(mut)]
    pub mint: Signer<'info>,
    #[account(
        init,
        payer = issuer,
        space = 8 + Bond::INIT_SPACE,
        seeds = [BOND_SEED, mint.key().as_ref()],
        bump,
    )]
    pub bond: Account<'info, Bond>,
    /// CHECK: TLV data written in the handler, read by Token-2022 on every transfer
    #[account(
        init,
        payer = issuer,
        space = ExtraAccountMetaList::size_of(extra_account_metas()?.len())?,
        seeds = [EXTRA_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

// Token-2022 passes these to the hook after the 5 standard accounts:
// 5 = Bond, 6 = Holder of the source owner, 7 = Holder of the destination owner.
// The owner is read from bytes 32..64 of each token account.
fn extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    let holder_of = |token_account_index: u8| {
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: HOLDER_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 },
                Seed::AccountData {
                    account_index: token_account_index,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            true,
        )
    };
    Ok(vec![
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: BOND_SEED.to_vec(),
                },
                Seed::AccountKey { index: 1 },
            ],
            false,
            false,
        )?,
        holder_of(0)?,
        holder_of(2)?,
    ])
}

pub fn handle_create_bond(ctx: Context<CreateBond>, params: BondParams) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        params.nominal > 0
            && params.coupon_rate_bps > 0
            && params.coupons_per_year > 0
            && params.maturity_ts > now,
        UlesError::InvalidParams
    );

    let mint = &ctx.accounts.mint;
    let bond_key = ctx.accounts.bond.key();
    let token_program = ctx.accounts.token_program.key();

    let space = ExtensionType::try_calculate_account_len::<MintState>(&[
        ExtensionType::TransferHook,
        ExtensionType::PermanentDelegate,
    ])?;
    create_account(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            CreateAccount {
                from: ctx.accounts.issuer.to_account_info(),
                to: mint.to_account_info(),
            },
        ),
        Rent::get()?.minimum_balance(space),
        space as u64,
        &token_program,
    )?;

    transfer_hook_initialize(
        CpiContext::new(
            token_program,
            TransferHookInitialize {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: mint.to_account_info(),
            },
        ),
        None,
        Some(crate::ID),
    )?;
    permanent_delegate_initialize(
        CpiContext::new(
            token_program,
            PermanentDelegateInitialize {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: mint.to_account_info(),
            },
        ),
        &bond_key,
    )?;
    initialize_mint2(
        CpiContext::new(
            token_program,
            InitializeMint2 {
                mint: mint.to_account_info(),
            },
        ),
        0,
        &bond_key,
        None,
    )?;

    let metas_info = ctx.accounts.extra_account_meta_list.to_account_info();
    let mut metas_data = metas_info.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut metas_data, &extra_account_metas()?)?;

    ctx.accounts.bond.set_inner(Bond {
        issuer: ctx.accounts.issuer.key(),
        registrar: params.registrar,
        mint: mint.key(),
        settlement_mint: ctx.accounts.settlement_mint.key(),
        nominal: params.nominal,
        coupon_rate_bps: params.coupon_rate_bps,
        coupons_per_year: params.coupons_per_year,
        maturity_ts: params.maturity_ts,
        supply: 0,
        issuance_closed: false,
        halted_from_ts: None,
        next_action_id: 1,
        open_actions: Default::default(),
        bump: ctx.bumps.bond,
    });
    Ok(())
}
