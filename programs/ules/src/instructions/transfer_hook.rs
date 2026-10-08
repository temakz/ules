use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::get_associated_token_address_with_program_id,
    token_2022::spl_token_2022::{
        extension::{transfer_hook::TransferHookAccount, BaseStateWithExtensions, StateWithExtensions},
        state::Account as TokenAccountState,
    },
    token_interface::{Mint, TokenAccount},
};

use crate::{constants::*, error::UlesError, state::*};

#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(token::mint = mint)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: owner or delegate of the source, already verified by Token-2022
    pub authority: UncheckedAccount<'info>,
    /// CHECK: address checked by seeds, contents read by Token-2022
    #[account(seeds = [EXTRA_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    #[account(seeds = [BOND_SEED, mint.key().as_ref()], bump = bond.bump)]
    pub bond: Account<'info, Bond>,
    /// CHECK: may not exist, loaded in the handler
    #[account(mut, seeds = [HOLDER_SEED, bond.key().as_ref(), source.owner.as_ref()], bump)]
    pub sender_holder: UncheckedAccount<'info>,
    /// CHECK: may not exist, loaded in the handler
    #[account(mut, seeds = [HOLDER_SEED, bond.key().as_ref(), destination.owner.as_ref()], bump)]
    pub receiver_holder: UncheckedAccount<'info>,
}

pub fn handle_transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;
    assert_transferring(&accounts.source.to_account_info())?;

    let bond = &accounts.bond;
    let now = Clock::get()?.unix_timestamp;
    if let Some(halted_from) = bond.halted_from_ts {
        require!(now < halted_from, UlesError::TransfersHalted);
    }

    // One wallet holds one position, so a snapshot of the ATA is the wallet's
    // whole balance on the record date.
    for account in [&accounts.source, &accounts.destination] {
        let ata = get_associated_token_address_with_program_id(
            &account.owner,
            &bond.mint,
            &anchor_spl::token_2022::ID,
        );
        require_keys_eq!(account.key(), ata, UlesError::NotAssociatedAccount);
    }

    let mut receiver = load_holder(&accounts.receiver_holder)?;
    let mut sender = load_holder(&accounts.sender_holder)?;
    let self_transfer = accounts.sender_holder.key() == accounts.receiver_holder.key();

    // Token-2022 calls the hook after moving the tokens, so balances here are post-transfer.
    let sender_before = accounts
        .source
        .amount
        .checked_add(amount)
        .ok_or(UlesError::MathOverflow)?;
    let receiver_before = accounts
        .destination
        .amount
        .checked_sub(amount)
        .ok_or(UlesError::MathOverflow)?;

    let fixed = bond
        .open_actions
        .iter()
        .filter(|a| a.id != 0 && now >= a.record_ts);
    for action in fixed {
        if self_transfer {
            sender.record_snap(bond, action.id, accounts.source.amount)?;
        } else {
            sender.record_snap(bond, action.id, sender_before)?;
            receiver.record_snap(bond, action.id, receiver_before)?;
        }
    }

    store_holder(&accounts.sender_holder, &sender)?;
    if !self_transfer {
        store_holder(&accounts.receiver_holder, &receiver)?;
    }
    Ok(())
}

fn assert_transferring(source: &AccountInfo) -> Result<()> {
    let data = source.try_borrow_data()?;
    let state = StateWithExtensions::<TokenAccountState>::unpack(&data)?;
    let ext = state.get_extension::<TransferHookAccount>()?;
    require!(bool::from(ext.transferring), UlesError::NotTransferring);
    Ok(())
}

fn load_holder(info: &AccountInfo) -> Result<Holder> {
    require_keys_eq!(*info.owner, crate::ID, UlesError::HolderNotRegistered);
    let data = info.try_borrow_data()?;
    Holder::try_deserialize(&mut &data[..]).map_err(|_| UlesError::HolderNotRegistered.into())
}

fn store_holder(info: &AccountInfo, holder: &Holder) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    holder.try_serialize(&mut &mut data[..])
}
