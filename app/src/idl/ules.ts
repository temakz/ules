/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/ules.json`.
 */
export type Ules = {
  address: "2opZy6fred5rQdjREkie4nNqDt6wzPfDrqcmvgaqTZ49";
  metadata: {
    name: "ules";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Corporate actions for a tokenized bond on Solana";
  };
  instructions: [
    {
      name: "announceCoupon";
      discriminator: [93, 168, 99, 65, 11, 194, 211, 165];
      accounts: [
        {
          name: "issuer";
          writable: true;
          signer: true;
          relations: ["bond"];
        },
        {
          name: "bond";
          writable: true;
        },
        {
          name: "action";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [97, 99, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "bond";
              },
              {
                kind: "account";
                path: "bond.nextActionId";
                account: "bond";
              },
            ];
          };
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "recordTs";
          type: "i64";
        },
      ];
    },
    {
      name: "announcePartialRedemption";
      discriminator: [161, 167, 115, 159, 97, 76, 76, 71];
      accounts: [
        {
          name: "issuer";
          writable: true;
          signer: true;
          relations: ["bond"];
        },
        {
          name: "bond";
          writable: true;
        },
        {
          name: "action";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [97, 99, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "bond";
              },
              {
                kind: "account";
                path: "bond.nextActionId";
                account: "bond";
              },
            ];
          };
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "recordTs";
          type: "i64";
        },
        {
          name: "principalPerBond";
          type: "u64";
        },
      ];
    },
    {
      name: "announceRedemption";
      discriminator: [84, 8, 229, 221, 97, 147, 247, 214];
      accounts: [
        {
          name: "issuer";
          writable: true;
          signer: true;
          relations: ["bond"];
        },
        {
          name: "bond";
          writable: true;
        },
        {
          name: "action";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [97, 99, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "bond";
              },
              {
                kind: "account";
                path: "bond.nextActionId";
                account: "bond";
              },
            ];
          };
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "recordTs";
          type: "i64";
        },
      ];
    },
    {
      name: "closeAction";
      discriminator: [68, 91, 38, 183, 124, 74, 239, 136];
      accounts: [
        {
          name: "issuer";
          writable: true;
          signer: true;
          relations: ["bond"];
        },
        {
          name: "bond";
          writable: true;
          relations: ["action"];
        },
        {
          name: "action";
          writable: true;
        },
        {
          name: "settlementMint";
          relations: ["bond"];
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "action";
              },
              {
                kind: "account";
                path: "settlementTokenProgram";
              },
              {
                kind: "account";
                path: "settlementMint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "issuerSettlement";
          writable: true;
        },
        {
          name: "settlementTokenProgram";
        },
      ];
      args: [];
    },
    {
      name: "createBond";
      discriminator: [96, 81, 70, 166, 111, 33, 61, 50];
      accounts: [
        {
          name: "issuer";
          writable: true;
          signer: true;
        },
        {
          name: "mint";
          writable: true;
          signer: true;
        },
        {
          name: "bond";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 111, 110, 100];
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
          };
        },
        {
          name: "extraAccountMetaList";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115,
                ];
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
          };
        },
        {
          name: "settlementMint";
        },
        {
          name: "tokenProgram";
          address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "params";
          type: {
            defined: {
              name: "bondParams";
            };
          };
        },
      ];
    },
    {
      name: "fund";
      discriminator: [218, 188, 111, 221, 152, 113, 174, 7];
      accounts: [
        {
          name: "issuer";
          writable: true;
          signer: true;
          relations: ["bond"];
        },
        {
          name: "bond";
          relations: ["action"];
        },
        {
          name: "action";
          writable: true;
        },
        {
          name: "settlementMint";
          relations: ["bond"];
        },
        {
          name: "issuerSettlement";
          writable: true;
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "action";
              },
              {
                kind: "account";
                path: "settlementTokenProgram";
              },
              {
                kind: "account";
                path: "settlementMint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "settlementTokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "issue";
      discriminator: [190, 1, 98, 214, 81, 99, 222, 247];
      accounts: [
        {
          name: "issuer";
          signer: true;
          relations: ["bond"];
        },
        {
          name: "bond";
          writable: true;
        },
        {
          name: "mint";
          writable: true;
          relations: ["bond"];
        },
        {
          name: "holder";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [104, 111, 108, 100, 101, 114];
              },
              {
                kind: "account";
                path: "bond";
              },
              {
                kind: "account";
                path: "holder.wallet";
                account: "holder";
              },
            ];
          };
        },
        {
          name: "holderAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "holder.wallet";
                account: "holder";
              },
              {
                kind: "account";
                path: "tokenProgram";
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "tokenProgram";
          address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
        },
      ];
      args: [
        {
          name: "qty";
          type: "u64";
        },
      ];
    },
    {
      name: "registerHolder";
      discriminator: [113, 111, 117, 246, 175, 59, 98, 161];
      accounts: [
        {
          name: "registrar";
          writable: true;
          signer: true;
          relations: ["bond"];
        },
        {
          name: "bond";
        },
        {
          name: "mint";
          relations: ["bond"];
        },
        {
          name: "wallet";
        },
        {
          name: "holder";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [104, 111, 108, 100, 101, 114];
              },
              {
                kind: "account";
                path: "bond";
              },
              {
                kind: "account";
                path: "wallet";
              },
            ];
          };
        },
        {
          name: "holderAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "wallet";
              },
              {
                kind: "account";
                path: "tokenProgram";
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "tokenProgram";
          address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "settle";
      discriminator: [175, 42, 185, 87, 144, 131, 102, 212];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "bond";
          writable: true;
          relations: ["action"];
        },
        {
          name: "action";
          writable: true;
        },
        {
          name: "holder";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [104, 111, 108, 100, 101, 114];
              },
              {
                kind: "account";
                path: "bond";
              },
              {
                kind: "account";
                path: "holder.wallet";
                account: "holder";
              },
            ];
          };
        },
        {
          name: "wallet";
        },
        {
          name: "mint";
          writable: true;
          relations: ["bond"];
        },
        {
          name: "holderBonds";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "wallet";
              },
              {
                kind: "account";
                path: "tokenProgram";
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "settlementMint";
          relations: ["bond"];
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "action";
              },
              {
                kind: "account";
                path: "settlementTokenProgram";
              },
              {
                kind: "account";
                path: "settlementMint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "holderSettlement";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "wallet";
              },
              {
                kind: "account";
                path: "settlementTokenProgram";
              },
              {
                kind: "account";
                path: "settlementMint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "receipt";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 99, 101, 105, 112, 116];
              },
              {
                kind: "account";
                path: "action";
              },
              {
                kind: "account";
                path: "holder";
              },
            ];
          };
        },
        {
          name: "tokenProgram";
          address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
        },
        {
          name: "settlementTokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "transferHook";
      discriminator: [105, 37, 101, 197, 75, 251, 102, 26];
      accounts: [
        {
          name: "source";
        },
        {
          name: "mint";
        },
        {
          name: "destination";
        },
        {
          name: "authority";
        },
        {
          name: "extraAccountMetaList";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115,
                ];
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
          };
        },
        {
          name: "bond";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 111, 110, 100];
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
          };
        },
        {
          name: "senderHolder";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [104, 111, 108, 100, 101, 114];
              },
              {
                kind: "account";
                path: "bond";
              },
              {
                kind: "account";
                path: "source.owner";
              },
            ];
          };
        },
        {
          name: "receiverHolder";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [104, 111, 108, 100, 101, 114];
              },
              {
                kind: "account";
                path: "bond";
              },
              {
                kind: "account";
                path: "destination.owner";
              },
            ];
          };
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
  ];
  accounts: [
    {
      name: "action";
      discriminator: [144, 241, 105, 219, 74, 136, 203, 176];
    },
    {
      name: "bond";
      discriminator: [224, 128, 48, 251, 182, 246, 111, 196];
    },
    {
      name: "holder";
      discriminator: [37, 121, 1, 40, 55, 46, 199, 157];
    },
    {
      name: "receipt";
      discriminator: [39, 154, 73, 106, 80, 102, 145, 153];
    },
  ];
  events: [
    {
      name: "actionAnnounced";
      discriminator: [183, 193, 90, 98, 193, 99, 3, 0];
    },
    {
      name: "actionClosed";
      discriminator: [12, 207, 175, 173, 7, 142, 107, 78];
    },
    {
      name: "actionFunded";
      discriminator: [86, 14, 72, 100, 66, 157, 25, 135];
    },
    {
      name: "settled";
      discriminator: [232, 210, 40, 17, 142, 124, 145, 238];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "invalidParams";
      msg: "Invalid bond parameters";
    },
    {
      code: 6001;
      name: "zeroAmount";
      msg: "Amount must be greater than zero";
    },
    {
      code: 6002;
      name: "mathOverflow";
      msg: "Arithmetic overflow";
    },
    {
      code: 6003;
      name: "issuanceClosed";
      msg: "Issuance is closed";
    },
    {
      code: 6004;
      name: "holderNotRegistered";
      msg: "Wallet is not registered as a holder";
    },
    {
      code: 6005;
      name: "notAssociatedAccount";
      msg: "Bonds can only be held in the holder's associated token account";
    },
    {
      code: 6006;
      name: "notTransferring";
      msg: "Transfer hook called outside of a transfer";
    },
    {
      code: 6007;
      name: "transfersHalted";
      msg: "Transfers are halted ahead of redemption";
    },
    {
      code: 6008;
      name: "recordDateInPast";
      msg: "Record date must be in the future";
    },
    {
      code: 6009;
      name: "tooManyOpenActions";
      msg: "Too many open actions";
    },
    {
      code: 6010;
      name: "noFreeSnapSlot";
      msg: "No free snapshot slot";
    },
    {
      code: 6011;
      name: "invalidPrincipal";
      msg: "Principal must be above zero and below the nominal";
    },
    {
      code: 6012;
      name: "alreadyRedeeming";
      msg: "Redemption is already announced";
    },
    {
      code: 6013;
      name: "afterRedemption";
      msg: "Record date must be before the redemption record date";
    },
    {
      code: 6014;
      name: "invalidStatus";
      msg: "Action is not in the expected status";
    },
    {
      code: 6015;
      name: "recordDateNotReached";
      msg: "Record date has not been reached";
    },
    {
      code: 6016;
      name: "paymentWindowClosed";
      msg: "Payment window is closed";
    },
    {
      code: 6017;
      name: "nothingToSettle";
      msg: "Holder had no bonds on the record date";
    },
    {
      code: 6018;
      name: "closeTooEarly";
      msg: "Action can be closed after the payment window or once everyone is paid";
    },
  ];
  types: [
    {
      name: "action";
      type: {
        kind: "struct";
        fields: [
          {
            name: "bond";
            type: "pubkey";
          },
          {
            name: "id";
            type: "u64";
          },
          {
            name: "kind";
            type: {
              defined: {
                name: "actionKind";
              };
            };
          },
          {
            name: "recordTs";
            type: "i64";
          },
          {
            name: "payEndTs";
            type: "i64";
          },
          {
            name: "principalPerBond";
            type: "u64";
          },
          {
            name: "nominalAtAnnounce";
            type: "u64";
          },
          {
            name: "couponRateBps";
            type: "u16";
          },
          {
            name: "couponsPerYear";
            type: "u8";
          },
          {
            name: "supplyAtRecord";
            type: "u64";
          },
          {
            name: "funded";
            type: "u64";
          },
          {
            name: "paid";
            type: "u64";
          },
          {
            name: "settledQty";
            type: "u64";
          },
          {
            name: "receipts";
            type: "u32";
          },
          {
            name: "status";
            type: {
              defined: {
                name: "actionStatus";
              };
            };
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "actionAnnounced";
      type: {
        kind: "struct";
        fields: [
          {
            name: "bond";
            type: "pubkey";
          },
          {
            name: "actionId";
            type: "u64";
          },
          {
            name: "kind";
            type: {
              defined: {
                name: "actionKind";
              };
            };
          },
          {
            name: "recordTs";
            type: "i64";
          },
          {
            name: "payEndTs";
            type: "i64";
          },
        ];
      };
    },
    {
      name: "actionClosed";
      type: {
        kind: "struct";
        fields: [
          {
            name: "bond";
            type: "pubkey";
          },
          {
            name: "actionId";
            type: "u64";
          },
          {
            name: "paid";
            type: "u64";
          },
          {
            name: "returned";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "actionFunded";
      type: {
        kind: "struct";
        fields: [
          {
            name: "bond";
            type: "pubkey";
          },
          {
            name: "actionId";
            type: "u64";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "actionKind";
      type: {
        kind: "enum";
        variants: [
          {
            name: "coupon";
          },
          {
            name: "partialRedemption";
          },
          {
            name: "redemption";
          },
        ];
      };
    },
    {
      name: "actionStatus";
      type: {
        kind: "enum";
        variants: [
          {
            name: "announced";
          },
          {
            name: "funded";
          },
          {
            name: "closed";
          },
        ];
      };
    },
    {
      name: "bond";
      type: {
        kind: "struct";
        fields: [
          {
            name: "issuer";
            type: "pubkey";
          },
          {
            name: "registrar";
            type: "pubkey";
          },
          {
            name: "mint";
            type: "pubkey";
          },
          {
            name: "settlementMint";
            type: "pubkey";
          },
          {
            name: "nominal";
            type: "u64";
          },
          {
            name: "couponRateBps";
            type: "u16";
          },
          {
            name: "couponsPerYear";
            type: "u8";
          },
          {
            name: "maturityTs";
            type: "i64";
          },
          {
            name: "payWindowSecs";
            type: "i64";
          },
          {
            name: "supply";
            type: "u64";
          },
          {
            name: "issuanceClosed";
            type: "bool";
          },
          {
            name: "haltedFromTs";
            type: {
              option: "i64";
            };
          },
          {
            name: "nextActionId";
            type: "u64";
          },
          {
            name: "openActions";
            type: {
              array: [
                {
                  defined: {
                    name: "openAction";
                  };
                },
                4,
              ];
            };
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "bondParams";
      type: {
        kind: "struct";
        fields: [
          {
            name: "registrar";
            type: "pubkey";
          },
          {
            name: "nominal";
            type: "u64";
          },
          {
            name: "couponRateBps";
            type: "u16";
          },
          {
            name: "couponsPerYear";
            type: "u8";
          },
          {
            name: "maturityTs";
            type: "i64";
          },
          {
            name: "payWindowSecs";
            type: "i64";
          },
        ];
      };
    },
    {
      name: "holder";
      type: {
        kind: "struct";
        fields: [
          {
            name: "bond";
            type: "pubkey";
          },
          {
            name: "wallet";
            type: "pubkey";
          },
          {
            name: "snaps";
            type: {
              array: [
                {
                  defined: {
                    name: "snap";
                  };
                },
                4,
              ];
            };
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "openAction";
      type: {
        kind: "struct";
        fields: [
          {
            name: "id";
            type: "u64";
          },
          {
            name: "recordTs";
            type: "i64";
          },
        ];
      };
    },
    {
      name: "receipt";
      type: {
        kind: "struct";
        fields: [
          {
            name: "action";
            type: "pubkey";
          },
          {
            name: "wallet";
            type: "pubkey";
          },
          {
            name: "qty";
            type: "u64";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "ts";
            type: "i64";
          },
        ];
      };
    },
    {
      name: "settled";
      type: {
        kind: "struct";
        fields: [
          {
            name: "bond";
            type: "pubkey";
          },
          {
            name: "actionId";
            type: "u64";
          },
          {
            name: "wallet";
            type: "pubkey";
          },
          {
            name: "qty";
            type: "u64";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "snap";
      type: {
        kind: "struct";
        fields: [
          {
            name: "actionId";
            type: "u64";
          },
          {
            name: "balance";
            type: "u64";
          },
        ];
      };
    },
  ];
};
