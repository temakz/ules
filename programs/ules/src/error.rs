use anchor_lang::prelude::*;

#[error_code]
pub enum UlesError {
    #[msg("Invalid bond parameters")]
    InvalidParams,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Issuance is closed")]
    IssuanceClosed,
    #[msg("Wallet is not registered as a holder")]
    HolderNotRegistered,
    #[msg("Bonds can only be held in the holder's associated token account")]
    NotAssociatedAccount,
    #[msg("Transfer hook called outside of a transfer")]
    NotTransferring,
    #[msg("Transfers are halted ahead of redemption")]
    TransfersHalted,
    #[msg("Record date must be in the future")]
    RecordDateInPast,
    #[msg("Too many open actions")]
    TooManyOpenActions,
    #[msg("No free snapshot slot")]
    NoFreeSnapSlot,
}
