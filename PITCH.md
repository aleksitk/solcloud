# SolCloud pitch

Slides: https://claude.ai/artifact/LmEKBM9mt5vk3HjyCdNVp8

Colosseum asks for two videos: a presentation of two to three minutes, and a product demo of no more than three minutes. This file holds the text for both. The presentation runs about 2:10 at a calm pace. Read it aloud with a timer before recording.

## Presentation video (8 slides, about 2:10)

### 1. Cover (0:00, 12 s)

Hi, I'm Aleksi Tkebuchava, founder of SolCloud. SolCloud gives a Solana program off-chain compute it can trust. A committee of staked nodes runs the code, and the majority answer is the result.

> გამარჯობა, მე ვარ ალექსი ტყებუჩავა, SolCloud-ის დამფუძნებელი. SolCloud Solana-ს პროგრამას აძლევს ჯაჭვს გარეთ გამოთვლას, რომელსაც შეუძლია ენდოს. კოდს უშვებს stake-იანი ნოდების კომიტეტი, და შედეგია უმრავლესობის პასუხი.

### 2. Team (0:12, 11 s)

I'm a software engineer, building this alone and full-time. In four days I shipped the on-chain program, the node software, an SDK, and the site.

> ვარ პროგრამული ინჟინერი, ვაშენებ მარტო და სრული განაკვეთით. ოთხ დღეში გავაკეთე ჯაჭვის პროგრამა, ნოდის პროგრამა, SDK და საიტი.

### 3. Problem (0:23, 15 s)

The problem: a Solana transaction gets at most 1.4 million compute units. Anything heavier runs off-chain, and then the program has to trust whoever ran it. Games, DeFi, and agents all hit this wall.

> პრობლემა: Solana-ს ტრანზაქციას მაქსიმუმ 1.4 მილიონი გამოთვლის ერთეული აქვს. უფრო მძიმე სამუშაო ჯაჭვს გარეთ ეშვება, და მაშინ პროგრამა უნდა ენდოს მას, ვინც გაუშვა. თამაშები, DeFi და აგენტები ამ კედელს ეჯახებიან.

### 4. Solution (0:38, 22 s)

Here is our answer. A requester locks a reward, and the program draws a committee of staked nodes. Each node runs the same code and first posts only a hash, so nobody can copy. Then they reveal. The majority shares the reward. A node that is wrong, or goes silent, loses half its stake.

> ჩვენი პასუხი ასეთია. მომთხოვნი კეტავს ჯილდოს, პროგრამა კი ირჩევს stake-იანი ნოდების კომიტეტს. თითო ნოდა უშვებს იმავე კოდს და ჯერ მხოლოდ hash-ს აქვეყნებს, ამიტომ ვერავინ გადაიწერს. მერე პასუხებს ხსნიან. უმრავლესობა იყოფს ჯილდოს. ნოდა, რომელიც ცდება ან ჩუმდება, stake-ის ნახევარს კარგავს.

### 5. Product and traction (1:00, 16 s)

It is live on devnet. Twenty tasks have run on the program. A round settles in under a minute, with no operator involved. A backend sends a task with one call, and running a node is one file.

> ეს მუშაობს devnet-ზე. პროგრამაზე ოცი task გაეშვა. Round წუთზე ნაკლებში იხურება, ოპერატორის ჩარევის გარეშე. ბექენდი task-ს ერთი გამოძახებით აგზავნის, ნოდის გაშვება კი ერთი ფაილია.

### 6. Why it wins (1:16, 26 s)

Why does it win? Bonsol and other ZK coprocessors need a prover for every run. Switchboard and iExec need special enclave hardware. Truebit-style fraud proofs make you wait. Chainlink Functions is the closest, but it lives on EVM chains. SolCloud needs none of that, and it is native to Solana: the program picks the committee, holds the money, and stores the code.

> რატომ იმარჯვებს? Bonsol-ს და სხვა ZK coprocessor-ებს ყოველ გაშვებაზე prover სჭირდებათ. Switchboard-ს და iExec-ს სპეციალური enclave აპარატურა. Truebit-ის ტიპის fraud proof-ები გალოდინებს. Chainlink Functions ყველაზე ახლოსაა, მაგრამ EVM ქსელებზეა. SolCloud-ს არცერთი არ სჭირდება და Solana-ზე მშობლიურია: პროგრამა ირჩევს კომიტეტს, ინახავს ფულს და კოდს.

### 7. Market and model (1:42, 18 s)

The market: DePIN networks earned 72 million dollars on chain last year, according to Messari. Our model: the requester pays a reward per task, and the protocol keeps ten percent. Our first users are Solana game and DeFi teams that already run work off-chain.

> ბაზარი: Messari-ს მიხედვით, DePIN ქსელებმა შარშან ჯაჭვზე 72 მილიონი დოლარი გამოიმუშავეს. ჩვენი მოდელი: მომთხოვნი თითო task-ზე ჯილდოს იხდის, პროტოკოლი კი ათ პროცენტს იტოვებს. პირველი მომხმარებლები არიან Solana-ს თამაშებისა და DeFi-ის გუნდები, რომლებიც სამუშაოს უკვე ჯაჭვს გარეთ უშვებენ.

### 8. Vision (2:00, 10 s)

The vision: any program, any computation, one checked answer. Next come stake-weighted committees and mainnet. Try it at solcloud.onrender.com. Thank you.

> ხედვა: ნებისმიერი პროგრამა, ნებისმიერი გამოთვლა, ერთი შემოწმებული პასუხი. შემდეგია stake-ით შეწონილი კომიტეტები და mainnet. სცადეთ: solcloud.onrender.com. გმადლობთ.

## Numbers to know (for questions)

Figures as of 10 October 2026: SOL is about $110, and staking SOL natively pays about 6% a year.

**What a task costs today.** The default reward, 0.05 SOL, is a demo value: about $5.50. Chainlink Functions charges $0.03 a request plus gas. A real price has to be in cents.

**Why it cannot be cents yet.** Each task leaves accounts on chain whose rent is never returned: about 0.0047 SOL for the task (paid by the requester), 0.0021 SOL for each node's commit, and 0.0019 SOL for the result (paid by the node that finalizes). For a committee of three that is about 0.013 SOL, or $1.40, locked per task. Closing those accounts after a round settles returns the rent and leaves only transaction fees, about 0.00004 SOL, under half a cent. That change is the step between a demo and a priced product.

**Is a node worth running?** A node locks 1 SOL ($110). Staked natively, that SOL would earn about $6.60 a year, so a node has to beat that.

| Reward per task (3 nodes) | A node earns per task | Tasks a year to match native staking |
| --- | --- | --- |
| 0.05 SOL, the demo value | $1.83 | 4 |
| $0.30 | $0.10 | 66 |
| $0.03, the Chainlink price | $0.01 | 660, about two a day |

The machine costs almost nothing: the work is small and a laptop does it.

**Slash against reward.** One wrong answer costs 0.5 SOL, $55. At the demo reward that is 30 tasks of income. At three cents a task it is 5,500. A node acting alone never gains by cheating.

**What the stake does not cover.** Nodes that form the majority are paid, not slashed. So the cost of forcing a wrong answer is the cost of holding most of a committee, not the slash. With three nodes of 1 SOL each, that is small. Larger committees, a higher minimum stake, and stake-weighted selection raise it. Until then SolCloud fits tasks whose answer is worth less than the committee's stake.

**What the protocol earns.** Today, only slashed stake. The plan is a cut of each reward. As an illustration, not a forecast: at the planned 10% of a $0.03 reward, one million tasks a month is $3,000 a month. The business needs volume, or tasks valuable enough to carry a higher reward.

## Product demo video (no more than 3:00)

Colosseum wants this one to show how the product works and how it uses Solana. Record the screen and talk over it. Keep the listeners running before you start.

1. **Home page (15 s).** "This is SolCloud on devnet. These numbers are read from the program's accounts." Point at the committee animation and the live stats.
2. **Run a task (60 s).** Connect Phantom. Show the code in the editor and say it is the exact program the nodes run. Compile, then Publish: "this stores the Wasm in a program account, so any node can fetch it." Set the input and press Review: "the program drew these three nodes from the registry." Sign.
3. **Watch it settle (30 s).** Open Network. Show the round going from Committing to Finalized, the two meters filling, and the output. "No operator touched this. The nodes committed, revealed, and one of them sent finalize."
4. **A node's terminal (20 s).** Show a listener window with the run, commit, reveal and finalize lines for that task.
5. **The slash (25 s).** Open task 17 on the Network page or in Explorer: "this node committed and never revealed. After the window closed it lost half its stake, and the round still settled on the other two."
6. **Run a node (20 s).** Show the Run a node page and the one-file download. "It makes its own key, waits for SOL, stakes, and starts."
7. **Architecture (10 s).** "One Anchor program holds the registry, the escrow, the Wasm, and the results. Everything else is a client."

## Submission form drafts

**One line:** A protocol that lets a Solana program hand work to a committee of staked nodes and trust the answer most of them agree on.

**Description:** SolCloud runs a small WebAssembly program on several independent nodes and settles on the answer the majority gives. Nodes commit a hash before they reveal, so none can copy another. A node that answers differently, or commits and stays silent, loses half its stake. The Anchor program draws the committee, holds the reward in escrow, stores the Wasm, and pays the majority. Live on devnet with a site, an SDK, a CLI, and a one-file node.

**Go-to-market:** Start with Solana developers who already move work off-chain and trust a single server: game studios that simulate matches, and DeFi teams that score or route off-chain. Give them the SDK, where a first task is one call from their backend, with no account and no API key. Grow the node side with the one-file node, since operators need no special hardware. Take ten percent of each reward as the protocol fee once tasks carry real value. First step after the hackathon: return account rent when a round settles, so a task can be priced in cents.

## Before you record

- Colosseum scores seven things: founder and market fit, insight, product and execution, market size, founder communication, viability, and traction. Slides 2, 5, 6 and 7 answer the ones a technical pitch usually skips: team, traction, insight, and market.
- Their own advice: a clear story beats polished editing, a voiceover on slides is fine, avoid buzzwords, and do not go over three minutes.
- Make sure the videos and the repository are open to the judges.
