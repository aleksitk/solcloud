# Toolchain setup (Windows → WSL2)

Anchor/Solana program builds are unreliable on native Windows, so we develop the
on-chain program inside **WSL2 (Ubuntu)**. The Node/Wasm and dashboard parts can
run on either side; keeping everything in WSL is simplest.

## 1. Install WSL2 (PowerShell, as Administrator)

```powershell
wsl --install -d Ubuntu
```

Reboot if prompted, then open **Ubuntu** from the Start menu and create your Linux user.

## 2. Inside Ubuntu — base packages

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libssl-dev libudev-dev curl git
```

## 3. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"
rustc --version
```

## 4. Solana CLI (Agave 3.1.2+)

Use **Agave 3.1.2**. Anchor then installs platform-tools **v1.57** (Rust 1.95),
which can parse crates.io `edition2024` manifests. Agave 2.x ships Cargo 1.79
or 1.84 and fails with `feature edition2024 is required`. Do not delete
`platform-tools-sdk` inside the Solana release; `cargo-build-sbf` needs it.

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.2/install)"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version          # solana-cli 3.1.2
cargo-build-sbf --version
```

## 5. Node.js (LTS) via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
. ~/.bashrc
nvm install --lts
node --version
```

## 6. Anchor via avm

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.31.1
avm use 0.31.1
anchor --version   # anchor-cli 0.31.1
```

## 7. Devnet wallet + funds (also covers Phase 0)

```bash
solana config set --url devnet
solana-keygen new                 # creates ~/.config/solana/id.json
solana address
solana airdrop 2                  # repeat if the faucet is dry
solana balance
```

## 8. Build & deploy the program

```bash
cd /mnt/c/Users/Students/solcloud/program
npm install                       # test deps (@coral-xyz/anchor, mocha, ...)
anchor build                      # generates target/deploy/solcloud-keypair.json
anchor keys sync                  # writes the real program id into lib.rs & Anchor.toml
anchor build                      # rebuild with the synced id
anchor deploy --provider.cluster devnet
```

`anchor keys sync` replaces the placeholder `declare_id!` with the keypair Anchor
generated on first build, so the deployed program id is consistent everywhere.

If `anchor build` fails with `feature edition2024 is required` and mentions
Cargo 1.79 or 1.84, the **Solana CLI on PATH is too old**. Host `rustc 1.99`
does not matter — `cargo-build-sbf` uses its own bundled Cargo. Install
Agave 3.1.2+, wipe the old tools cache, and rebuild (see section 4).

## Notes

- Keep the source on `/mnt/c/...` if you edit it from Windows, but do not put
  Cargo's `target/` there. WSL returns `Input/output error` when Rust writes
  build artifacts to the Windows drive. Point the output at the Linux disk:

```bash
echo 'export CARGO_TARGET_DIR="$HOME/solcloud-target"' >> ~/.bashrc
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
```
- Keep the devnet keypair safe and **never commit it** (`.gitignore` already blocks
  `*keypair*.json` / `id.json`).
