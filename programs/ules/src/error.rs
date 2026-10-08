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
    #[msg("Principal must be above zero and below the nominal")]
    InvalidPrincipal,
    #[msg("Redemption is already announced")]
    AlreadyRedeeming,
    #[msg("Record date must be before the redemption record date")]
    AfterRedemption,
    #[msg("Action is not in the expected status")]
    InvalidStatus,
    #[msg("Record date has not been reached")]
    RecordDateNotReached,
    #[msg("Payment window is closed")]
    PaymentWindowClosed,
    #[msg("Holder had no bonds on the record date")]
    NothingToSettle,
    #[msg("Action can be closed after the payment window or once everyone is paid")]
    CloseTooEarly,
}
