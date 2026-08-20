# AgentVault 🔐

> **Secure Liability Protocol for Autonomous AI Agents**

AgentVault is a challengeable liability protocol built on [GenLayer](https://genlayer.com). Clients fund outcomes, agents stake liability bonds, and a decentralized validator panel authenticates every success criterion — through domain-appropriate attestations and independently reproducible checks — before capital moves.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![GenLayer](https://img.shields.io/badge/GenLayer-Studionet-00f0a0)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Contract](https://img.shields.io/badge/Contract-v0.3.0-orange)

---

## 🚨 Recent Updates — v0.3.0 (criterion-level verification)

**Read this first if you are a returning contributor or reviewer.**

v0.3.0 is a protocol-hardening release made in direct response to review
feedback:

> *"Validators settle financially meaningful disputes using short, party-selected evidence that does not authenticate or reproduce the underlying work. For a stronger version, require criterion-level findings backed by domain-appropriate attestations or reproducible checks."*

### What changed

| Area | v0.2.x (before) | v0.3.0 (current) |
|---|---|---|
| Success definition | Free-text `success_criteria` (40–1600 chars, party-written) | Client-pinned **machine-checkable criteria spec** (JSON, 1–5 criteria) |
| Agent delivery | One `output_url` artifact + log | **Findings bundle**: one finding per criterion, structurally enforced |
| Authentication | None — validators read party prose | Every finding must carry an `attestation_url` that **binds the evidence CID** and criterion id |
| Reproduction | None — validators trusted summaries | Every finding must carry a `check_url`; **validators re-read the check themselves** |
| Ruling granularity | Single overall verdict + hardcoded score (0/60/100) | **Per-criterion verdicts** (`AUTHENTICATED`/`REFUTED`) stored on-chain; score = % authenticated |
| Spec failure mode | N/A | Malformed spec ⇒ `CLIENT_EVIDENCE_UNAVAILABLE` (client cannot hold the bond hostage) |
| Findings failure mode | Generic "evidence unavailable" | Missing criterion/field ⇒ every criterion `REFUTED` ⇒ revision or slash |

### Breaking changes for integrators

- `open_mandate` signature changed:
  - **v0.2.x**: `(agent, title, terms_url, terms_digest, success_criteria, required_bond)`
  - **v0.3.0**: `(agent, title, terms_url, terms_digest, spec_url, required_bond)`
  - The spec digest is derived on-chain (`content:<cid>`); callers no longer pass it.
- `submit_evidence(mandate_id, `**`findings_url, findings_digest,`**` log_url, log_digest, note)` — the bundle replaces the single output artifact (same arity, new semantics; error codes renamed: `IMMUTABLE_FINDINGS_REQUIRED`, `FINDINGS_COMMITMENT_MISMATCH`).
- `get_mandate` fields renamed/added:
  - removed: `success_criteria`, `output_url`, `output_digest`
  - added: `spec_url`, `spec_digest`, `findings_url`, `findings_digest`, `criterion_verdicts`
- **On-chain score semantics changed**: `0–100` now means *percentage of authenticated criteria* (100 = fulfilled). v0.2.x used hardcoded 0/60/100.

### ⚠️ Action required: redeploy the contract

The Studionet deployment `0x6a3E6E584e42FFbe6Af4167FdE1F6B16aE0829E1` runs
v0.2.x bytecode and is **incompatible** with the v0.3.0 frontend. To use the
hardened protocol:

1. Open [GenLayer Studio](https://studio.genlayer.com) and upload `contracts/AgentVault.py`.
2. Deploy on Studionet → copy the new address.
3. Update all three places:
   - `.env` → `NEXT_PUBLIC_CONTRACT_ADDRESS=<new address>`
   - `src/lib/genlayer.ts` → `DEPLOYED_ADDRESS`
   - `vercel.json` → `env.NEXT_PUBLIC_CONTRACT_ADDRESS`
4. Re-run the live lifecycle script (see [Live Verification](#-live-verification)) before announcing adoption.

### File-level changelog

```
contracts/AgentVault.py              v0.2.16 → v0.3.0 (criterion-level verification)
src/lib/types.ts                     new fields: spec_*, findings_*, criterion_verdicts
src/lib/samples.ts                   templates now carry specUrl / findUrl + criteria summary
src/app/page.tsx                     spec findings forms + <CriterionVerdictsBlock> rendering
src/app/globals.css                  verdict chip styles (AUTHENTICATED / REFUTED)
tests/test_contract_static.py        new structural markers for the evidence model
frontend/scripts/live-lifecycle.mjs  updated call signatures + error-code set
docs/architecture.md                 full evidence-integrity model documented
README.md                            this file
```

---

## 📋 Table of Contents

- [Why GenLayer](#-why-genlayer)
- [Lifecycle](#-lifecycle)
- [Evidence Integrity Model](#-evidence-integrity-model)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Testing Guide](#-testing-guide)
- [Contract API](#-contract-api)
- [Live Verification](#-live-verification)
- [Deployment](#-deployment)
- [Project Structure](#-project-structure)
- [License](#-license)

## 🧠 Why GenLayer

Traditional smart contracts can only verify deterministic conditions. AI agent
work is contextual — activity logs may look valid while the business outcome is
wrong, unsafe or misleading. AgentVault uses GenLayer **Intelligent Contracts**
to:

- Read natural-language terms, specs and artifacts from content-addressed URLs
- Independently re-read attestation and check sources (not just party prose)
- Reach multi-validator semantic consensus on per-criterion outcomes
- Move real capital based on that judgment

## 🔄 Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                       MANDATE LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OPEN ──► BONDED ──► DELIVERED ──► CHALLENGED ──► RULING_READY  │
│    │         │           │              │              │         │
│    │         │           │              │              ▼         │
│    │         │           │              │      ┌──────────────┐  │
│    │         │           │              │      │  FULFILLED   │  │
│    │         │           │              │      │     or       │  │
│    │         │           │              │      │   BREACH     │  │
│    │         │           │              │      └──────────────┘  │
│    │         │           │              │                        │
│    │         │           ▼              │                        │
│    │         │    (no challenge)        │                        │
│    │         │    wait 2 days ──────────┘                        │
│    │         │                                                   │
│    │         ▼                                                   │
│    │  REVISION_REQUIRED ──► DELIVERED (one retry only)          │
│    │                                                             │
└─────────────────────────────────────────────────────────────────┘
```

### States

| State | Description |
|-------|-------------|
| `OPEN` | Client funded mandate, waiting for agent bond |
| `BONDED` | Agent accepted, executing work (7-day window) |
| `DELIVERED` | Findings locked, 2-day challenge window open |
| `CHALLENGED` | Client filed counter-evidence |
| `REVISION_REQUIRED` | One or more criteria refuted but curable — exactly one 3-day revision |
| `RULING_READY` | Validator verdict reached |
| `SETTLED_FULFILLED` | Agent received reward + bond |
| `SETTLED_BREACH` | Client received reward + slashed bond |
| `*_EVIDENCE_UNAVAILABLE` | 48-hour mutual/timeout recovery path |
| `RECOVERED` | Neutral recovery executed |

## 🛡 Evidence Integrity Model

Financial disputes are settled on **reproducible, authenticated findings**,
never on narrative summaries alone.

### 1. Criteria spec — client-pinned, immutable

```json
{
  "version": "1",
  "domain": "security",
  "criteria": [
    {
      "id": "c1",
      "requirement": "No reentrancy in the audited withdrawal paths",
      "attestation": { "type": "audit-report", "must_assert": "binds content:<evidence CID>" },
      "check": { "type": "tool-run", "target": "static-analysis output present, finding count = 0" }
    }
  ]
}
```

Rules: **1–5 criteria**, every criterion must declare both `attestation` and
`check`. Malformed specs ⇒ `CLIENT_EVIDENCE_UNAVAILABLE` ⇒ bounded neutral
recovery opens.

### 2. Findings bundle — agent-pinned, immutable

```json
{
  "version": "1",
  "findings": [
    {
      "criterion_id": "c1",
      "outcome": "pass",
      "evidence_url": "https://ipfs.io/ipfs/<cid>",
      "attestation_url": "https://arweave.net/<txid>",
      "check_url": "https://ipfs.io/ipfs/<cid>",
      "statement": "How the requirement is met (>= 40 chars)"
    }
  ]
}
```

- `evidence_url` — the work artifact; the contract derives its commitment as `content:<cid>`.
- `attestation_url` — domain-appropriate attestation that explicitly binds that commitment and the criterion id.
- `check_url` — source validators fetch and re-read (tool output, metric endpoint, deterministic artifact).

Any missing criterion or field ⇒ criterion recorded as `REFUTED`.

### 3. Validator protocol — per criterion

For every declared criterion the panel:

1. Re-reads the attestation; verifies it is domain-appropriate, targets the criterion, and binds the evidence commitment.
2. Re-reads the check; verifies it independently reproduces the declared requirement (thresholds, deterministic outputs).
3. Weighs client counter-evidence targeting the criterion.
4. Returns `AUTHENTICATED` or `REFUTED` — preferring `REFUTED` when in doubt.

Deterministic aggregation:

| Condition | Verdict | Score |
|---|---|---|
| All criteria AUTHENTICATED | `FULFILLED` | 100 |
| Any REFUTED (first delivery) | `REMEDIABLE_BREACH` → `REVISION_REQUIRED` | % authenticated |
| Any REFUTED (after revision) | `MATERIAL_BREACH` | % authenticated |
| Agent sources unreadable | `AGENT_EVIDENCE_UNAVAILABLE` | 0 |
| Client sources unreadable | `CLIENT_EVIDENCE_UNAVAILABLE` | 0 |

Per-criterion verdicts persist on-chain in `mandate_criterion_verdicts` —
rulings are auditable criterion by criterion.

## 🏗 Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  Next.js 16 + TypeScript + genlayer-js SDK                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Connect    │  │  Create with │  │  Per-criterion│         │
│  │   Wallet     │  │  spec spec   │  │  verdict view │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                    GENLAYER STUDIONET                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              AgentVault.py (v0.3.0)                       │  │
│  │  - Escrow management (reward + bond)                      │  │
│  │  - Criteria spec / findings / verdict storage             │  │
│  │  - Per-criterion authentication + reproduction            │  │
│  │  - Semantic consensus via prompt_comparative              │  │
│  │  - Bounded recovery paths for unreadable evidence         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

**Trust boundary**: the frontend never judges success. It creates transactions,
renders contract state, and links to content-addressed evidence. All judgment
happens on-chain via GenLayer validator consensus.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MetaMask or compatible Web3 wallet
- GEN tokens (free from [GenLayer Studio Faucet](https://studio.genlayer.com))

### Installation

```bash
git clone https://github.com/phamdat721101/agentvault.git
cd agentvault

npm install

cp .env.example .env
# set NEXT_PUBLIC_CONTRACT_ADDRESS to your deployed v0.3.0 contract

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

```env
# optional — the app is blockchain-only and does not require a database
# DATABASE_URL=postgresql://user:password@host:5432/dbname

NEXT_PUBLIC_CONTRACT_ADDRESS=<your deployed v0.3.0 contract>
```

## 🧪 Testing Guide

### Wallet setup

Two separate wallets with GEN funds:

| Wallet | Role | Funded by |
|---|---|---|
| Wallet 1 | **Client** (creates mandate, locks reward) | Studio faucet |
| Wallet 2 | **Agent** (accepts, locks bond, delivers findings) | Studio faucet |

> Faucet: [GenLayer Studio](https://studio.genlayer.com) → Accounts → Fund.

### Step 1 — Client opens the mandate

1. Connect Wallet 1 → **Open a vault**.
2. Pick a quick template (auto-fills title, reward, bond, terms URL, spec URL) or paste your own pinned spec.
3. Enter the agent address (Wallet 2).
4. **Fund vault** → confirm in MetaMask → wait for `Transaction accepted`.
5. The mandate appears as `OPEN` in **Active mandates**.

### Step 2 — Agent bonds

1. Switch MetaMask to Wallet 2 and refresh.
2. Open the mandate → **Post bond** → confirm.
3. Status becomes `BONDED` (7-day delivery window).

### Step 3 — Agent locks findings

1. In the mandate drawer, submit:
   - **Findings bundle URL** — JSON with one finding per criterion (see schema above).
   - **Execution trace URL**.
   - **Agent statement** (≥ 30 chars).
2. **Lock findings** → confirm → status becomes `DELIVERED`.

### Step 4 — Challenge (optional, client view)

1. Switch to Wallet 1, open the mandate.
2. Submit counter-evidence URL + material objection (≥ 30 chars) → status `CHALLENGED`.
3. Skipping the challenge requires waiting out the 2-day window before adjudication.

### Step 5 — Adjudicate

1. Either party → **Run liability review**.
2. Validators authenticate each criterion through its attestation, reproduce it through its check, and return per-criterion verdicts.
3. Status:
   - `RULING_READY` — fulfilled or material breach
   - `REVISION_REQUIRED` — curable refutations (agent repeats Step 3 once)

### Step 6 — Settle

**Enforce ruling** → payouts execute:
- `FULFILLED` → agent gets reward + bond
- `MATERIAL_BREACH` → client gets reward + slashed bond

### Demo artifacts for exploration

The prefilled IPFS CIDs in forms are valid format placeholders for UI testing.
A **real ruling** requires properly pinned spec/findings JSON as documented
above — validators will refute placeholder content by design.

## 📜 Contract API

### Write methods

| Method | Payable | Caller | Notes |
|---|---|---|---|
| `open_mandate(agent, title, terms_url, terms_digest, spec_url, required_bond)` | ✅ reward | Client | Invalid input refunds attached GEN |
| `accept_mandate(mandate_id)` | ✅ exact bond | Agent | Wrong-value call refunds & never mutates state |
| `submit_evidence(id, findings_url, findings_digest, log_url, log_digest, note)` | — | Agent | One revision allowed after `REVISION_REQUIRED` |
| `challenge_delivery(id, challenge_url, challenge_digest, note)` | — | Client | Before 2-day window closes |
| `adjudicate(mandate_id)` | — | Either | Per-criterion verification panel |
| `settle(mandate_id)` | — | Either | Executes the ruling payout |
| `cancel_open(mandate_id)` | — | Client | Only while `OPEN` |
| `claim_delivery_timeout(mandate_id)` | — | Client | Slash on missed delivery/revision deadline |
| `approve_recovery(mandate_id)` | — | Either | Mutual early recovery on unavailable evidence |
| `claim_recovery_timeout(mandate_id)` | — | Either* | Asymmetric: client-only enforcement when agent evidence died |

### View methods

| Method | Returns |
|---|---|
| `get_stats()` | `{mandate_count, rewards_locked, bonds_locked, agent_paid, client_paid, slashed}` |
| `get_mandate(id)` | Full mandate record incl. `spec_url`, `findings_url`, `criterion_verdicts`, `score`, `decision` |

### Settlement matrix

| Verdict | Agent | Client |
|---|---:|---:|
| FULFILLED | reward + returned bond | 0 |
| REMEDIABLE_BREACH | one bounded revision | no movement |
| MATERIAL_BREACH | 0 | reward + slashed bond |
| AGENT_EVIDENCE_UNAVAILABLE | bond only by mutual recovery | reward + slash after 48h client enforcement |
| CLIENT_EVIDENCE_UNAVAILABLE | bond after neutral recovery | reward after neutral recovery |

## 🔬 Live Verification

`frontend/scripts/live-lifecycle.mjs` proves the protocol against a deployed
v0.3.0 contract with two funded wallets:

```bash
export CONTRACT_ADDRESS="<deployed v0.3.0 address>"
export CLIENT_PRIVATE_KEY="<funded client key>"
export AGENT_PRIVATE_KEY="<funded agent key>"
export ARTIFACT_URL="<pinned IPFS/Arweave bundle URL>"
# optional: SPEC_URL, MANDATE_TITLE, SUBMISSION_NOTE, REWARD_WEI, BOND_WEI

node frontend/scripts/live-lifecycle.mjs
```

It fails unless it verifies:

- An invalid payable call immediately returns the full attached GEN.
- A wrong-value agent bond leaves contract balance and mandate state untouched.
- The client challenge path is exercised before adjudication.
- Validator consensus reaches a valid liability or bounded-recovery state.
- Final settlement clears the mandate's reward and bond custody.

Local structural checks:

```bash
python -m unittest discover -s tests -p "test_*.py"
```

## 🌐 Deployment

### Current deployment

| Property | Value |
|---|---|
| Network | GenLayer Studionet (chain ID 61999) |
| Frontend contract (v0.3.0) | **⚠️ awaiting redeploy — see [Recent Updates](#-recent-updates--v030-criterion-level-verification)** |
| Legacy v0.2.x contract | `0x6a3E6E584e42FFbe6Af4167FdE1F6B16aE0829E1` ([explorer](https://explorer-studio.genlayer.com/address/0x6a3E6E584e42FFbe6Af4167FdE1F6B16aE0829E1)) |
| SDK | `genlayer-js` 1.1.8 |

### Deploy your own contract

1. Open [GenLayer Studio](https://studio.genlayer.com).
2. Upload `contracts/AgentVault.py` (v0.3.0).
3. Deploy on Studionet → copy the address.
4. Set `NEXT_PUBLIC_CONTRACT_ADDRESS` (env / `src/lib/genlayer.ts` fallback / `vercel.json`).

### Deploy the frontend to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/phamdat721101/agentvault)

1. Push this repo to GitHub.
2. Vercel → **New Project** → import the repository.
3. Add env `NEXT_PUBLIC_CONTRACT_ADDRESS=<your v0.3.0 contract>`.
4. Deploy. `DATABASE_URL` is **not required** — the app is blockchain-only and `/api/health` adapts.

### Manual deployment script

```powershell
.\scripts\deploy\deploy.ps1 -Contract "contracts/AgentVault.py"
```

## 📁 Project Structure

```
agentvault/
├── contracts/
│   └── AgentVault.py          # GenLayer Intelligent Contract (v0.3.0)
├── docs/
│   ├── architecture.md        # Evidence-integrity model & settlement design
│   └── design-guidelines/     # UI/UX guidelines
├── frontend/
│   └── scripts/
│       └── live-lifecycle.mjs # Two-wallet E2E lifecycle proof
├── scripts/deploy/
│   └── deploy.ps1             # Manual deployment guidance
├── src/
│   ├── app/
│   │   ├── api/health/        # DB-optional health endpoint
│   │   ├── globals.css        # Dark vault theme + verdict chips
│   │   ├── layout.tsx
│   │   └── page.tsx           # Main UI + CriterionVerdictsBlock
│   ├── db/                    # Optional Drizzle/Postgres (gracefully skipped)
│   └── lib/
│       ├── genlayer.ts        # SDK reads/writes + acceptance polling
│       ├── samples.ts         # Quick templates with spec URLs
│       └── types.ts           # Mandate / CriterionVerdicts / TxResult
├── tests/
│   ├── test_contract_static.py     # Structural + evidence-model markers
│   └── test_lifecycle_model.py     # Lifecycle invariant model
├── .env.example
├── vercel.json
└── README.md
```

## 🎨 UI Theme

| Element | Value |
|---|---|
| Background | `#06080f` deep navy |
| Cards | `#111827` |
| Primary accent | `#06d6a0` cyan |
| Secondary accent | `#f7b731` amber |
| Verdict: AUTHENTICATED | cyan chip |
| Verdict: REFUTED | red chip |

## 🤝 Contributing

1. Fork and branch (`git checkout -b feature/criterion-audit-trails`)
2. Keep the structural test suite green: `python -m unittest discover -s tests -p "test_*.py"`
3. Keep the frontend typecheck clean: `npm exec tsc -- --noEmit`
4. Open a PR describing the evidence-model impact of any contract change.

## 📄 License

MIT — see [LICENSE](LICENSE).

## 🔗 Links

- [GenLayer Documentation](https://docs.genlayer.com)
- [GenLayer Studio](https://studio.genlayer.com)
- [Studionet Explorer](https://explorer-studio.genlayer.com)

---

**Built with ❤️ on GenLayer Intelligent Contracts — v0.3.0 hardened for authenticated, reproducible rulings.**
