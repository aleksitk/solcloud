# SolCloud pitch

Slides: https://claude.ai/artifact/LmEKBM9mt5vk3HjyCdNVp8

Colosseum asks for two videos: a presentation of two to three minutes, and a product demo of no more than three minutes. This file holds the text for both. The presentation runs about 2:45 at a calm pace. Read it aloud with a timer before recording.

Fill every `[bracket]` with your own facts before you record.

## Presentation video (8 slides, about 2:45)

### 1. Cover (0:00, 12 s)

Hi, I'm [your name]. SolCloud is a protocol that lets a Solana program hand work to a committee of staked nodes, and trust the answer most of them agree on.

> გამარჯობა, მე ვარ [სახელი]. SolCloud არის პროტოკოლი, რომლითაც Solana-ს პროგრამა სამუშაოს აძლევს stake-იანი ნოდების კომიტეტს და ენდობა პასუხს, რომელზეც უმრავლესობა თანხმდება.

### 2. Team (0:12, 20 s)

A little about me. [Your background in one sentence.] I ran into this problem when [where you met it]. In four days I shipped the on-chain program, the node software, a command line tool and the site. After the hackathon I plan to [your plan].

> ცოტა ჩემზე. [შენი გამოცდილება ერთ წინადადებაში.] ამ პრობლემას წავაწყდი, როცა [სად]. ოთხ დღეში გავაკეთე ჯაჭვის პროგრამა, ნოდის პროგრამა, ბრძანებების ხელსაწყო და საიტი. ჰაკათონის შემდეგ ვაპირებ [გეგმა].

### 3. Problem (0:32, 22 s)

Here is the problem. A Solana transaction gets at most 1.4 million compute units. Anything heavier has to run off-chain, and then the program must trust whoever ran it. Game studios feel this when they simulate a match. DeFi teams feel it when they check a route or a score. Anyone wiring an agent to a program feels it too.

> პრობლემა ასეთია. Solana-ს ტრანზაქციას მაქსიმუმ 1.4 მილიონი გამოთვლის ერთეული აქვს. უფრო მძიმე სამუშაო ჯაჭვს გარეთ უნდა გაეშვას, და მაშინ პროგრამა უნდა ენდოს მას, ვინც გაუშვა. ამას გრძნობენ თამაშების სტუდიები, DeFi გუნდები და ყველა, ვინც აგენტს პროგრამასთან აკავშირებს.

### 4. How it works (0:54, 25 s)

SolCloud works like this. A requester locks a reward, and the program draws a committee from the staked nodes. Each node runs the same Wasm and posts only a hash, so nobody can copy. Then they reveal. The majority shares the reward. A node that answers differently, or commits and goes silent, loses half its stake.

> SolCloud ასე მუშაობს. მომთხოვნი კეტავს ჯილდოს, პროგრამა კი stake-იანი ნოდებიდან ირჩევს კომიტეტს. თითო ნოდა უშვებს იმავე Wasm-ს და აქვეყნებს მხოლოდ hash-ს, ამიტომ ვერავინ გადაიწერს. მერე პასუხებს ხსნიან. უმრავლესობა იყოფს ჯილდოს. ნოდა, რომელიც სხვანაირად პასუხობს ან commit-ის შემდეგ ჩუმდება, stake-ის ნახევარს კარგავს.

### 5. Insight (1:19, 25 s)

The insight: most work does not need a mathematical proof. It needs a wrong answer to cost more than it pays. Replicated execution is not new. iExec began that way and Chainlink Functions does it on EVM chains. What is new is doing it natively on Solana, where the program itself draws the committee and settles, and any laptop can be a node. It is economic security, and we say so.

> მთავარი აზრი: სამუშაოს უმეტესობას მათემატიკური მტკიცებულება არ სჭირდება. საჭიროა, რომ არასწორი პასუხი უფრო ძვირი დაჯდეს, ვიდრე მოგებას მოიტანს. გამეორებითი შესრულება ახალი არ არის: iExec ასე დაიწყო და Chainlink Functions ამას EVM ქსელებზე აკეთებს. ახალია ის, რომ ეს Solana-ზე მშობლიურად ხდება, კომიტეტს თვითონ პროგრამა ირჩევს და ხურავს, და ნებისმიერი ლეპტოპი შეიძლება იყოს ნოდა. ეს ეკონომიკური უსაფრთხოებაა, და ამას პირდაპირ ვამბობთ.

### 6. Product and traction (1:44, 22 s)

This is shipped and running on devnet. Fifteen rounds have settled on the live program. A round takes under a minute, and the nodes close it themselves. Slashing works: you can watch a node lose half its stake. And running a node is one file. [One sentence of early feedback: who tried it and what they said.]

> ეს უკვე გაშვებულია და მუშაობს devnet-ზე. ცოცხალ პროგრამაზე თხუთმეტი round დასრულდა. Round წუთზე ნაკლებს იღებს და ნოდები თვითონ ხურავენ. Slash მუშაობს: შეგიძლია ნახო, როგორ კარგავს ნოდა stake-ის ნახევარს. ნოდის გაშვება კი ერთი ფაილია. [ერთი წინადადება პირველ გამოხმაურებაზე.]

### 7. Market and model (2:06, 22 s)

The market is every Solana program that outgrows its compute budget. [Your market figure.] Requesters pay a reward per task. The protocol will take a small cut of each reward, and it already keeps slashed stake. To start, developers get an SDK that sends a task in one call, operators get a one-file node, and our first tasks come from [your first target teams].

> ბაზარი არის Solana-ს ყველა პროგრამა, რომელსაც გამოთვლის ლიმიტი არ ჰყოფნის. [ბაზრის ციფრი.] მომთხოვნები თითო task-ზე ჯილდოს იხდიან. პროტოკოლი თითო ჯილდოდან მცირე წილს აიღებს, ხოლო ჩამოჭრილი stake უკვე მასთან რჩება. დასაწყისში დეველოპერებს აქვთ SDK, რომელიც task-ს ერთი გამოძახებით აგზავნის, ოპერატორებს ერთფაილიანი ნოდა, პირველი task-ები კი მოვა [პირველი სამიზნე გუნდები]-დან.

### 8. Vision (2:28, 15 s)

The vision: any Solana program can ask for any computation and get one checked answer back. Next come stake-weighted committees, larger programs, and mainnet. It is live now at solcloud.onrender.com. Thank you.

> ხედვა: Solana-ს ნებისმიერ პროგრამას შეუძლია ნებისმიერი გამოთვლა მოითხოვოს და ერთი შემოწმებული პასუხი მიიღოს. შემდეგია stake-ით შეწონილი კომიტეტები, უფრო დიდი პროგრამები და mainnet. ახლავე მუშაობს: solcloud.onrender.com. გმადლობთ.

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

**Go-to-market:** Start with Solana developers who already move work off-chain and trust a single server: [name two or three kinds of team you can actually reach]. Give them the SDK, where a first task is one call from their backend, with no account and no API key. Grow the node side with the one-file node, since operators need no special hardware. Charge a small protocol fee on each reward once tasks carry real value. [Add the first concrete step you will take the week after the hackathon.]

## Before you record

- Colosseum scores seven things: founder and market fit, insight, product and execution, market size, founder communication, viability, and traction. Slides 2, 5, 6 and 7 answer the ones a technical pitch usually skips.
- Their own advice: a clear story beats polished editing, a voiceover on slides is fine, avoid buzzwords, and do not go over three minutes.
- Make sure the videos and the repository are open to the judges.
