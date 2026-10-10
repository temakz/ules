# Ules

Corporate actions for a tokenized bond on Solana: coupon payment, partial early redemption and redemption at maturity, with the holder register fixed on the record date inside the program.

Ules (үлес) means "share" or "what is due to you" in Kazakh.

- Live app: https://ules-xi.vercel.app
- Program on devnet: [`2opZy6fred5rQdjREkie4nNqDt6wzPfDrqcmvgaqTZ49`](https://explorer.solana.com/address/2opZy6fred5rQdjREkie4nNqDt6wzPfDrqcmvgaqTZ49?cluster=devnet)
- Full lifecycle run on devnet: [`demo-output/`](demo-output/)

Built for the Superteam Kazakhstan x KASE side track "Corporate Actions on Blockchain".

## What it does

One bond, three corporate actions, every step recorded on chain.

The demo bond follows the example from the track: face value 1,000 KZT, 10% a year, two coupons a year. Three holders: Aigerim, Bauyrzhan and Dana, 18 bonds in total.

| Action | Per bond | Paid in total |
|---|---|---|
| Coupon | 50 KZT | 900 KZT |
| Partial redemption, 30% of face value | 300 KZT | 5,400 KZT |
| Coupon on the reduced face value of 700 KZT | 35 KZT | 630 KZT |
| Redemption: 700 KZT plus the last coupon, bonds burned | 735 KZT | 13,230 KZT |

Each holder gets an on-chain receipt for each action. The app shows them with the formula next to the amount, for example `7 x 1,000 KZT x 10% / 2 = 350 KZT`.

## The hard part: who held the bond on the record date

The math is simple. The hard part is that the bond is a token and keeps moving between wallets. A coupon belongs to whoever held the bond on the record date, not to whoever holds it on the payment date.

The usual answers are to freeze transfers around the record date, or to take a snapshot off chain and ask everyone to trust it. Ules does neither.

The bond mint is a Token-2022 mint with a transfer hook. Every transfer calls the Ules program. After a record date passes, the hook saves a holder's balance the first time that balance changes. Holders who never move their bonds cost nothing: their current balance is still their record-date balance.

Example from the demo run:

1. Before the record date Aigerim sends 2 bonds to Bauyrzhan. No snapshot, the record date has not come yet.
2. The record date of the first coupon passes. Bauyrzhan holds 7 bonds.
3. Bauyrzhan sends 3 bonds to Dana. The hook sees that the record date has passed and saves Bauyrzhan's 7 and Dana's 3 before the transfer.
4. The coupon pays Bauyrzhan for 7 bonds and Dana for 3, although after the transfer they hold 4 and 6.

On devnet: [the bond](https://explorer.solana.com/address/Fdw3aauWivHvbYm5VhsF919DEKAB2aEsZDCV4ev3JeTy?cluster=devnet), [Bauyrzhan's transfer to Dana](https://explorer.solana.com/tx/4dBam6y8iJYLVYEEHKLfy3gqNKDtmpBYUz6h1P4gt9cSEMwf6qUT7fupKscDhFeEEgfNLd9YDP17dFGuv6KC3vRd?cluster=devnet).

## Architecture

One Anchor program, `programs/ules`.

### Accounts

| Account | Seeds | Holds |
|---|---|---|
| `Bond` | `["bond", mint]` | issuer, registrar, bond and settlement mints, current face value, coupon rate, coupons per year, supply, payment window, open actions (up to 4), redemption halt |
| `Holder` | `["holder", bond, wallet]` | the register entry for one wallet and its record-date snapshots |
| `Action` | `["action", bond, id as u64 LE]` | kind, record date, end of payment window, amounts fixed at announcement, funded and paid totals, status |
| `Receipt` | `["receipt", action, holder]` | bonds held on the record date, amount paid, time |

The bond mint has decimals 0, so one token is one bond. `Bond` is the mint authority and the permanent delegate.

The settlement token is a separate mint with decimals 2, so one unit is one tiyn. The demo uses a test stablecoin, `tKZT`. The program reads the decimals from the mint, so a real tenge stablecoin such as KZTE can replace it by changing one address.

### Instructions

| Instruction | Who | What it does |
|---|---|---|
| `create_bond` | issuer | creates the bond mint with the transfer hook and permanent delegate |
| `register_holder` | registrar | opens a register entry and a bond account for a wallet |
| `issue` | issuer | places bonds with registered holders, only before the first corporate action |
| transfer hook | Token-2022 | checks the register, blocks transfers after the redemption record date, saves snapshots |
| `announce_coupon`, `announce_partial_redemption`, `announce_redemption` | issuer | open a corporate action with a record date |
| `fund` | issuer | moves the full amount due into the action's vault |
| `settle` | anyone | pays one holder from the vault and writes the receipt |
| `close_action` | issuer | returns what is left in the vault to the issuer and frees the slot |

The program emits an event on announce, fund, settle and close.

## Record-date logic

- An action is announced with a record date in the future.
- After the record date, the first transfer that touches a holder writes that holder's balance before the transfer into a snapshot slot for that action.
- At payment time the quantity is the snapshot if there is one, otherwise the current balance. With no snapshot the balance has not changed since the record date.
- The hook accepts only associated token accounts, so each wallet has exactly one position and "current balance" is unambiguous.
- The hook checks the `transferring` flag, so it cannot be called outside a real transfer.
- A holder has 4 snapshot slots, one per open action. A slot frees up when its action is closed, so no cleanup is needed.

A hooked transfer costs 34k to 46k compute units.

## Entitlement math

All amounts are integers in tiyn. Intermediate values use `u128`. Results round down to the tiyn.

```
coupon             = qty * face_value * rate_bps / (10_000 * coupons_per_year)
partial redemption = qty * principal_per_bond
redemption         = qty * face_value + coupon for the last period
```

- The amount to fund uses the same function with the full supply, and `floor(a + b) >= floor(a) + floor(b)`, so the vault always covers every holder.
- What rounding leaves in the vault goes back to the issuer when the action is closed. A test with three holders and 2,500 tiyn funded pays 3 x 833 and returns 1 tiyn.
- Amounts per bond are fixed at announcement. A partial redemption lowers the face value right away, and the next coupon announced after it is computed on the new face value.

The formula matches real payments on KASE. The bond [HCBNb27](https://kase.kz/ru/investors/bonds/HCBNb27) (1,000 KZT face value, 19% a year, semi-annual) paid its first coupon of 950,000,000 KZT on 7 October 2026: `10,000,000 x 1,000 x 19% / 2`.

## Settlement flow

```
announce -> record date -> fund -> settle (once per holder) -> close
```

- `fund` takes the full amount due. Settlement can start only after funding and after the record date.
- `settle` can be called by anyone: the issuer, a bot, the holder. The money can only go to the holder's own account for the settlement mint, and the receipt PDA makes a second payment impossible.
- Payments are accepted until the end of the payment window. On KASE this window is 15 days. The demo uses 120 seconds.
- `close_action` works after the window ends or when every bond has been settled.

Redemption has two extra rules:

- From its record date on, bond transfers are rejected, much like KASE suspends trading in bonds before an early redemption.
- `settle` burns the holder's bonds through the permanent delegate. The burn does not go through the hook, so before burning the program writes the snapshots the hook would have written. An unpaid coupon whose record date has passed still pays the right amount after the bonds are gone. There is a test for exactly this case.

## Implemented and simulated

| Part | Status |
|---|---|
| Bond token, holder register, record-date snapshot | on chain |
| Entitlement calculation, payment, burn on redemption | on chain |
| Receipts and events for every action | on chain |
| Settlement currency | simulated: test tenge stablecoin `tKZT` on devnet |
| KYC | simulated: the registrar registers a wallet |
| Dates | real record dates in production are 00:00 Almaty time on the record date; the demo sets them 25 seconds ahead |
| Network | devnet |

## How it fits the Kazakhstan market

Ules follows how bonds are serviced on KASE today:

- **Record date.** The [HCBNb27 prospectus](https://kase.kz/files/emitters/HCBN/hcbnf9_hcbnb27_2026.pdf) pays the coupon to holders registered "at the start of the last day of the period", and the payment follows within 15 calendar days. Ules uses the same record date and a payment window.
- **Register and payment report.** In Kazakhstan the holder register is kept by the Central Securities Depository. After each payment the issuer sends the depository a list of holders with the amount paid to each. The Ules receipts are that list, on chain and verifiable by anyone, for every action.
- **Partial redemption by face value.** [SMKFb1](https://kase.kz/ru/investors/bonds/SMKFb1) partially redeemed its bonds on 1 October 2026 by lowering the face value to 778 KZT. Ules does the same: bonds stay with holders, the face value goes down, later coupons follow the new value.
- **Trading halt.** KASE suspends trading in bonds before an early redemption, and suspends repo trading while a dividend register is being fixed. Ules stops bond transfers from the redemption record date.

## Limitations

- An action that was announced but never funded cannot be closed and keeps its slot. In practice this is an issuer default, and default handling is outside this prototype.
- One bond per run, devnet only.
- The app is read only. The demo script plays the issuer and the payment bot.

## Run it

Requirements: Rust, Solana CLI 3.x, Anchor 1.1.x, Node 22.

Tests on a local validator, 13 of them:

```
npm install
anchor build
anchor test --validator legacy
```

`--validator legacy` uses `solana-test-validator` instead of Anchor's default surfpool. The validator loads the program at its devnet address, so a fresh clone needs no program keypair.

On Windows `solana-test-validator` does not start natively: run it in WSL with `--bpf-program 2opZy6fred5rQdjREkie4nNqDt6wzPfDrqcmvgaqTZ49 target/deploy/ules.so`, airdrop SOL to your wallet, then `anchor test --skip-local-validator --skip-deploy`.

Full lifecycle on devnet against the deployed program (needs `anchor build` for the IDL and about 0.1 SOL in the default wallet):

```
npm run demo
```

The script creates a new bond each time, prints every transaction with an explorer link, checks every payment against the formula and writes `demo-output/devnet-<time>.json`.

App:

```
npm --prefix app install
npm run dev
```

It reads the latest run from `demo-output` and all numbers from devnet. `VITE_RPC_URL` sets a custom RPC.

## Repository

```
programs/ules   Anchor program
tests           tests on a local validator
scripts         devnet demo
demo-output     latest devnet run
app             read-only web app
```
