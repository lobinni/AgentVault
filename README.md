# AgentVault 🔐

> **Secure Liability Protocol for Autonomous AI Agents**

AgentVault is a challengeable liability protocol built on [GenLayer](https://genlayer.com). It enables trustless escrow for AI agent work — clients fund outcomes, agents stake bonds, and decentralized validators enforce fulfillment or slash collateral.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![GenLayer](https://img.shields.io/badge/GenLayer-Studionet-00f0a0)
![Next.js](https://img.shields.io/badge/Next.js-16-black)

## 🌟 Features

- **Escrow-based Mandates** — Clients lock rewards, agents stake bonds
- **Criterion-Level Verification** — Every success criterion is authenticated individually, not judged from free-text narrative
- **Domain-Appropriate Attestations** — Findings must include third-party attestations cryptographically bound to the evidence
- **Reproducible Checks** — Validators re-read check sources themselves instead of trusting party-selected summaries
- **Content-Addressed Evidence** — IPFS/Arweave URLs ensure immutable proof
- **Challenge Mechanism** — 2-day window for client counter-evidence
- **One Bounded Revision** — Agents get exactly one chance to cure a refuted criterion
- **Automatic Slashing** — Material breaches transfer bond to client

## 🛡 Evidence Integrity (v0.3.0)

A common weakness of AI-work arbitration is validators ruling from short,
party-selected evidence that neither authenticates nor reproduces the
underlying work. AgentVault v0.3.0 hardens this:

| Layer | What is pinned | How validators verify |
|---|---|---|
| Criteria spec | Client-pinned JSON: 1–5 criteria, each with `attestation` + `check` declarations | Parsed on-chain; malformed spec = client evidence unavailable |
| Findings bundle | Agent-pinned JSON: one finding per criterion with `evidence_url`, `attestation_url`, `check_url` | Structural conformance enforced; missing fields = criterion REFUTED |
| Authentication | Attestation must bind `content:<evidence CID>` and the criterion id | Validators re-read the attestation source |
| Reproduction | Check source exposes deterministic/metric output | Validators re-read the check themselves and compare against the requirement |
| Verdicts | Per-criterion `AUTHENTICATED` / `REFUTED` | Stored on-chain, aggregated deterministically |

**Scoring**: `score = authenticated_criteria / total_criteria * 100`. All
authenticated → `FULFILLED`; any refuted → one bounded revision or
`MATERIAL_BREACH` after the revision is consumed.

## 📋 Table of Contents

- [Why GenLayer](#-why-genlayer)
- [Lifecycle](#-lifecycle)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Testing Guide](#-testing-guide)
- [Contract API](#-contract-api)
- [Deployment](#-deployment)
- [Project Structure](#-project-structure)
- [License](#-license)

## 🧠 Why GenLayer

Traditional smart contracts can only verify deterministic conditions. But AI agent work is contextual — activity logs may be valid while the business outcome is wrong, unsafe, or misleading.

AgentVault uses GenLayer's **Intelligent Contracts** to:
- Read natural language terms and delivered artifacts
- Access web content for evidence verification
- Reach multi-validator semantic consensus
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
| `BONDED` | Agent accepted, executing work |
| `DELIVERED` | Agent submitted evidence, challenge window open |
| `CHALLENGED` | Client filed counter-evidence |
| `REVISION_REQUIRED` | Agent gets one 3-day revision |
| `RULING_READY` | Validators reached verdict |
| `SETTLED_FULFILLED` | Agent received reward + bond |
| `SETTLED_BREACH` | Client received reward + slashed bond |
| `RECOVERED` | Neutral recovery (unavailable evidence) |

## 🏗 Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  Next.js 16 + TypeScript + genlayer-js SDK                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Connect    │  │    Create    │  │   Manage     │         │
│  │   Wallet     │  │   Mandate    │  │  Lifecycle   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                    GENLAYER STUDIONET                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  AgentVault.py                            │  │
│  │  - Escrow management (reward + bond)                      │  │
│  │  - State machine transitions                              │  │
│  │  - Semantic adjudication via validators                   │  │
│  │  - Content-addressed evidence verification                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Trust Boundary

The frontend **never judges success**. It only:
- Creates transactions
- Renders contract state
- Links to content-addressed evidence

All judgment happens on-chain via GenLayer validator consensus.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MetaMask or compatible Web3 wallet
- GEN tokens (free from [GenLayer Studio Faucet](https://studio.genlayer.com))

### Installation

```bash
# Clone the repository
git clone https://github.com/phamdat721101/agentvault.git
cd agentvault

# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your contract address

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
NEXT_PUBLIC_CONTRACT_ADDRESS=0x58c259629C5D0B1F7b1504665Ace93277fA660d8
```

## 🧪 Testing Guide

### Requirements

- **2 wallets** with GEN tokens (Client + Agent)
- MetaMask connected to GenLayer Studionet

### Evidence artifacts you must pin (v0.3.0)

**Client pins a criteria spec** (JSON, IPFS/Arweave):

```json
{
  "version": "1",
  "domain": "security",
  "criteria": [
    {
      "id": "c1",
      "requirement": "No reentrancy vulnerability in the audited withdrawal path",
      "attestation": { "type": "audit-report", "must_assert": "content:<evidence CID> refutes reentrancy" },
      "check": { "type": "tool-run", "target": "slither-inheritance-graph output >= 40 lines" }
    }
  ]
}
```

**Agent pins a findings bundle** matching every criterion:

```json
{
  "version": "1",
  "findings": [
    {
      "criterion_id": "c1",
      "outcome": "pass",
      "evidence_url": "https://ipfs.io/ipfs/<cid-of-the-audit-pdf>",
      "attestation_url": "https://arweave.net/<txid-that-mentions-content:<evidence-cid>-and-c1>",
      "check_url": "https://ipfs.io/ipfs/<cid-of-the-raw-tool-output>",
      "statement": "Twenty withdrawal paths statically analyzed; no state change after external call found..."
    }
  ]
}
```

### Quick Test Flow

#### Step 1: Client Creates Mandate

```
1. Connect Wallet 1 (Client)
2. Click "Open a vault"
3. Select a template or fill manually:
   - Title: "Test Security Audit"
   - Agent: 0x... (Wallet 2 address)
   - Reward: 5 GEN
   - Bond: 2 GEN
   - Terms URL: https://ipfs.io/ipfs/bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku
   - Criteria: "Deliver complete audit report..."
4. Click "Fund vault" → Confirm in MetaMask
```

#### Step 2: Agent Accepts

```
1. Switch to Wallet 2 (Agent)
2. Click mandate → "Post 2.00 GEN bond"
3. Confirm transaction
```

#### Step 3: Agent Delivers

```
1. Fill evidence form:
   - Output URL: https://ipfs.io/ipfs/...
   - Log URL: https://arweave.net/...
   - Statement: "Completed audit with findings..."
2. Click "Lock delivery"
```

#### Step 4: Resolution

```
Option A: Client satisfied
  → Wait 2-day challenge window
  → Adjudicate → Settle (Agent wins)

Option B: Client challenges
  → Submit counter-evidence
  → Adjudicate → Settle (based on verdict)
```

### Sample IPFS URLs for Testing

```
https://ipfs.io/ipfs/bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku
https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi
```

## 📜 Contract API

### Write Functions (Payable)

| Function | Description | Caller |
|----------|-------------|--------|
| `open_mandate(agent, title, terms_url, terms_digest, spec_url, bond)` | Create mandate with machine-checkable criteria spec | Client |
| `accept_mandate(mandate_id)` | Post agent bond | Agent |
| `submit_evidence(mandate_id, findings_url, findings_digest, log_url, log_digest, note)` | Submit criterion-level findings bundle + execution trace | Agent |
| `challenge_delivery(mandate_id, challenge_url, challenge_digest, note)` | File objection | Client |
| `adjudicate(mandate_id)` | Request per-criterion validator verification | Either party |
| `settle(mandate_id)` | Execute final payout | Either party |

### View Functions

| Function | Returns |
|----------|---------|
| `get_stats()` | Protocol statistics (JSON) |
| `get_mandate(mandate_id)` | Mandate details (JSON) |

### Settlement Matrix

| Verdict | Agent Receives | Client Receives |
|---------|---------------|-----------------|
| `FULFILLED` | reward + bond | 0 |
| `REMEDIABLE_BREACH` | (one revision) | (no movement) |
| `MATERIAL_BREACH` | 0 | reward + slashed bond |

## 🌐 Deployment

### Current Deployment

| Property | Value |
|----------|-------|
| **Network** | GenLayer Studionet |
| **Chain ID** | 61999 |
| **Contract** | `0x58c259629C5D0B1F7b1504665Ace93277fA660d8` |
| **Explorer** | [View on Explorer](https://explorer-studio.genlayer.com/address/0x58c259629C5D0B1F7b1504665Ace93277fA660d8) |

### Deploy Your Own Contract

1. Open [GenLayer Studio](https://studio.genlayer.com)
2. Upload `contracts/AgentVault.py`
3. Click **Deploy** on Studionet
4. Copy deployed address
5. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in environment

### Deploy Frontend to Vercel

**Manual steps:**

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project**
3. Import your GitHub repository
4. Set environment variable:
   ```
   NEXT_PUBLIC_CONTRACT_ADDRESS=0x58c259629C5D0B1F7b1504665Ace93277fA660d8
   ```
5. Click **Deploy**

> ⚠️ **Note:** DATABASE_URL is optional. AgentVault is a blockchain-only app and works without a database.

### Manual Deployment Script

```powershell
# PowerShell
.\scripts\deploy\deploy.ps1 -Contract "contracts/AgentVault.py"
```

## 📁 Project Structure

```
agentvault/
├── contracts/
│   └── AgentVault.py          # GenLayer Intelligent Contract
├── docs/
│   ├── architecture.md        # System design
│   └── design-guidelines/     # UI/UX guidelines
├── frontend/
│   └── scripts/
│       └── live-lifecycle.mjs # E2E lifecycle test
├── scripts/
│   └── deploy/
│       └── deploy.ps1         # Deployment script
├── src/
│   ├── app/
│   │   ├── api/health/        # Health check endpoint
│   │   ├── globals.css        # Styles (dark vault theme)
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Main application
│   ├── db/                    # Database (Drizzle ORM)
│   └── lib/
│       ├── genlayer.ts        # SDK integration
│       ├── samples.ts         # Mandate templates
│       └── types.ts           # TypeScript types
├── tests/
│   ├── test_contract_static.py
│   └── test_lifecycle_model.py
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## 🎨 UI Theme

AgentVault uses a **dark vault aesthetic**:

| Element | Color |
|---------|-------|
| Background | `#06080f` (deep navy) |
| Cards | `#111827` |
| Primary accent | `#06d6a0` (cyan) |
| Secondary accent | `#f7b731` (amber) |
| Text | `#f1f5f9` (light) |
| Error | `#ef4444` (red) |

## 🔒 Security Considerations

- **Content-addressed URLs only** — IPFS/Arweave ensure evidence immutability
- **No private keys in frontend** — Uses MetaMask provider
- **Validator consensus** — No single point of judgment
- **Bounded capital lockup** — Deadlines prevent infinite escrow

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 🔗 Links

- [GenLayer Documentation](https://docs.genlayer.com)
- [GenLayer Studio](https://studio.genlayer.com)
- [Explorer](https://explorer-studio.genlayer.com)

---

**Built with ❤️ on GenLayer Intelligent Contracts**
