import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solcloud } from "../target/types/solcloud";
import { assert } from "chai";

describe("solcloud (skeleton)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Solcloud as Program<Solcloud>;

  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  it("initializes the global config", async () => {
    await program.methods
      .initialize(
        new anchor.BN(1_000_000_000), // min_stake = 1 SOL
        new anchor.BN(50_000_000), //   reward_default = 0.05 SOL
        5000 //                         slash_bps = 50%
      )
      .accountsPartial({
        config: configPda,
        authority: provider.wallet.publicKey,
        treasury: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.config.fetch(configPda);
    assert.ok(cfg.authority.equals(provider.wallet.publicKey));
    assert.equal(cfg.slashBps, 5000);
  });
});
