"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Gavel,
  LoaderCircle,
  Lock,
  Plus,
  RefreshCw,
  Settings2,
  Shield,
  ShieldCheck,
  TriangleAlert,
  Vault,
  Wallet,
  X,
} from "lucide-react";
import {
  connectWallet,
  contractAddress,
  explorerContract,
  explorerTx,
  formatGen,
  parseGen,
  readContract,
  saveContractAddress,
  writeContract,
} from "@/lib/genlayer";
import type { CriterionVerdicts, Mandate, ProtocolStats, TxResult } from "@/lib/types";
import { vaultSamples, type VaultSample } from "@/lib/samples";

const emptyStats: ProtocolStats = {
  mandate_count: "0",
  rewards_locked: "0",
  bonds_locked: "0",
  agent_paid: "0",
  client_paid: "0",
  slashed: "0",
};

const statusCopy: Record<string, string> = {
  OPEN: "Awaiting bond",
  BONDED: "Agent executing",
  DELIVERED: "Delivery locked",
  CHALLENGED: "Counter-evidence filed",
  REVISION_REQUIRED: "Revision required",
  RULING_READY: "Ruling ready",
  AGENT_EVIDENCE_UNAVAILABLE: "Agent evidence unavailable",
  CLIENT_EVIDENCE_UNAVAILABLE: "Client evidence unavailable",
  SETTLED_FULFILLED: "Fulfilled & paid",
  SETTLED_BREACH: "Liability enforced",
  RECOVERED: "Neutral recovery",
  CANCELLED: "Cancelled",
};

function short(value: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—";
}

function decodeJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [address, setAddress] = useState(() => contractAddress());
  const [stats, setStats] = useState(emptyStats);
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [selected, setSelected] = useState<Mandate | null>(null);
  const [panel, setPanel] = useState<"create" | "contract" | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<TxResult | null>(null);
  const [now, setNow] = useState(0);
  const [sample, setSample] = useState<VaultSample | null>(null);

  const refresh = useCallback(async () => {
    if (!contractAddress()) return;
    setLoading(true);
    const statsResult = await readContract("get_stats");
    if (!statsResult.success) {
      setNotice(statsResult);
      setLoading(false);
      return;
    }
    const nextStats = decodeJson<ProtocolStats>(statsResult.data);
    setStats(nextStats);
    const count = Math.min(Number(nextStats.mandate_count || 0), 24);
    const results = await Promise.all(
      Array.from({ length: count }, (_, id) => readContract("get_mandate", [BigInt(id)])),
    );
    const next = results
      .filter((result) => result.success)
      .map((result) => decodeJson<Mandate>(result.data))
      .reverse();
    setMandates(next);
    setSelected((current) => current ? next.find((item) => item.id === current.id) ?? null : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const configured = contractAddress();
      setAddress(configured);
      if (configured) void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const kickoff = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!window.ethereum?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setWallet(accounts?.[0] ?? "");
    };
    const onChain = () => {
      setWallet("");
      setNotice({ success: false, error: "Network changed. Reconnect on GenLayer Studionet." });
    };
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccounts);
      window.ethereum?.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const activeCapital = useMemo(
    () => BigInt(stats.rewards_locked || "0") + BigInt(stats.bonds_locked || "0"),
    [stats],
  );

  async function onConnect() {
    const result = await connectWallet();
    setNotice(result);
    if (result.success) setWallet(String(result.data));
  }

  async function transact(label: string, fn: string, args: unknown[] = [], value = BigInt(0)) {
    setBusy(label);
    setNotice(null);
    const result = await writeContract(fn, args, value);
    setNotice(result);
    setBusy("");
    if (result.success) {
      await refresh();
      // Extra refresh after a short delay to catch state propagation
      window.setTimeout(() => void refresh(), 4000);
    }
  }

  async function createMandate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setBusy("Opening mandate");
      setNotice(null);
      const result = await writeContract("open_mandate", [
        form.get("agent"),
        form.get("title"),
        form.get("termsUrl"),
        contentCommitment(String(form.get("termsUrl"))),
        form.get("specUrl"),
        parseGen(String(form.get("bond"))),
      ], parseGen(String(form.get("reward"))));
      setNotice(result);
      setBusy("");
      if (result.success) {
        setPanel(null);
        await refresh();
      }
    } catch (error) {
      setNotice({ success: false, error: error instanceof Error ? error.message : "Invalid form." });
    }
  }

  async function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    await transact("Locking evidence", "submit_evidence", [
      BigInt(selected.id),
      form.get("findingsUrl"),
      contentCommitment(String(form.get("findingsUrl"))),
      form.get("logUrl"),
      contentCommitment(String(form.get("logUrl"))),
      form.get("note"),
    ]);
  }

  async function submitChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const challengeUrl = String(form.get("challengeUrl"));
    await transact("Locking counter-evidence", "challenge_delivery", [
      BigInt(selected.id),
      challengeUrl,
      contentCommitment(challengeUrl),
      form.get("challengeNote"),
    ]);
  }

  function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("address"));
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
      setNotice({ success: false, error: "Enter a valid deployed contract address." });
      return;
    }
    saveContractAddress(value);
    setAddress(value as `0x${string}`);
    setPanel(null);
    void refresh();
  }

  return (
    <main>
      <div className="noise" />
      <div className="glow-bg">
        <div className="glow-orb cyan" />
        <div className="glow-orb amber" />
      </div>

      {/* ── NAV ── */}
      <header className="nav">
        <button className="brand" onClick={() => setSelected(null)}>
          <span className="brand-mark"><Shield size={18} /></span>
          <span>AGENTVAULT</span>
          <em>STUDIONET</em>
        </button>
        <nav className="main-nav" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#mandates">Mandates</a>
          <a href="#protocol">Protocol</a>
        </nav>
        <div className="nav-actions">
          {address ? (
            <a
              className="text-button contract-explorer"
              href={explorerContract(address)}
              target="_blank"
              rel="noreferrer"
              title="View contract on GenLayer Explorer"
            >
              <span className="live-dot" />
              {short(address)}
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          ) : (
            <button className="text-button" onClick={() => setPanel("contract")}>
              <span className="live-dot offline" />
              Set contract
            </button>
          )}
          <button
            className="header-settings"
            onClick={() => setPanel("contract")}
            aria-label="Change contract address"
            title="Change contract address"
          >
            <Settings2 size={15} aria-hidden="true" />
          </button>
          <button className="wallet-button" onClick={onConnect}>
            <Wallet size={15} />
            {wallet ? short(wallet) : "Connect"}
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-grid" />
        <div className="eyebrow"><span>Secure Liability Protocol for AI Agents</span></div>
        <h1>Your capital.<br /><i>Their accountability.</i></h1>
        <p>
          Lock outcomes in a vault, require agent bonds, and let decentralized
          validators enforce fulfilment — or slash.
        </p>
        <div className="hero-actions">
          <button className="primary" onClick={() => setPanel("create")}>
            Open a vault <ArrowUpRight size={17} />
          </button>
          <button className="secondary" onClick={() => document.getElementById("protocol")?.scrollIntoView({ behavior: "smooth" })}>
            How it works
          </button>
        </div>
        <div className="vault-badge">
          <Vault size={30} />
          <span>OUTCOME<br />SECURED</span>
        </div>
      </section>

      {/* ── CAPITAL STRIP ── */}
      <section className="capital-strip" id="how-it-works">
        <div>
          <span>Capital secured</span>
          <strong>{formatGen(activeCapital.toString())} GEN</strong>
        </div>
        <div>
          <span>Active vaults</span>
          <strong>{stats.mandate_count.padStart(2, "0")}</strong>
        </div>
        <div>
          <span>Bonds locked</span>
          <strong>{formatGen(stats.bonds_locked)} GEN</strong>
        </div>
        <div>
          <span>Slashed</span>
          <strong>{formatGen(stats.slashed)} GEN</strong>
        </div>
      </section>

      {/* ── MANDATES ── */}
      <section className="workspace" id="mandates">
        <div className="section-heading">
          <div>
            <span className="kicker">VAULT LEDGER</span>
            <h2>Active mandates</h2>
          </div>
          <button className="icon-button" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw size={17} className={loading ? "spin" : ""} />
          </button>
        </div>

        {!address ? (
          <button className="empty-ledger" onClick={() => setPanel("contract")}>
            <Lock size={36} />
            <strong>Connect to an AgentVault contract</strong>
            <span>All reads are live on-chain. No mock data.</span>
          </button>
        ) : loading && mandates.length === 0 ? (
          <div className="empty-ledger">
            <LoaderCircle size={36} className="spin" />
            <strong>Reading contract state…</strong>
            <span>Fetching mandates from Studionet.</span>
          </div>
        ) : mandates.length === 0 ? (
          <button className="empty-ledger" onClick={() => setPanel("create")}>
            <Plus size={36} />
            <strong>No mandates yet — open the first vault</strong>
            <span>Reward and agent liability bond are locked in one lifecycle.</span>
          </button>
        ) : (
          <div className="ledger">
            {mandates.map((mandate) => (
              <button key={mandate.id} className="mandate-row" onClick={() => setSelected(mandate)}>
                <span className="mandate-id">AV/{mandate.id.padStart(4, "0")}</span>
                <span className="mandate-main">
                  <strong>{mandate.title}</strong>
                  <small>Agent {short(mandate.agent)}</small>
                </span>
                <span className="stake">
                  <small>Reward / bond</small>
                  <strong>{formatGen(mandate.reward)} / {formatGen(mandate.required_bond)} GEN</strong>
                </span>
                <span className={`status status-${mandate.status.toLowerCase()}`}>
                  {statusCopy[mandate.status] ?? mandate.status}
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── PROTOCOL ── */}
      <section className="protocol" id="protocol">
        <div className="protocol-intro">
          <span className="kicker">THE VAULT PROTOCOL</span>
          <h2>Trust is not a score.<br />It is capital at risk.</h2>
          <p>
            AgentVault turns vague service promises into a challengeable liability
            record with deadlines, one curable revision and enforceable slashing.
          </p>
        </div>
        <div className="protocol-steps">
          {[
            [CircleDollarSign, "01", "Fund the outcome", "The client escrows a real reward against immutable success criteria."],
            [Fingerprint, "02", "Bond the agent", "The assigned agent stakes collateral before it receives execution authority."],
            [FileCheck2, "03", "Deliver or challenge", "Content-addressed delivery and client counter-evidence are locked into one record."],
            [Gavel, "04", "Cure or enforce", "Validators may allow one bounded revision or enforce payment and bond slashing."],
          ].map(([Icon, number, title, copy]) => {
            const StepIcon = Icon as typeof ShieldCheck;
            return (
              <article key={String(number)}>
                <span>{String(number)}</span>
                <StepIcon size={20} />
                <h3>{String(title)}</h3>
                <p>{String(copy)}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="brand">
          <span className="brand-mark"><Shield size={16} /></span>
          <span>AGENTVAULT</span>
        </div>
        <p>Autonomous work. Accountable outcomes.</p>
        <span>Built on GenLayer Intelligent Contracts</span>
      </footer>

      {/* ── MANDATE DETAIL DRAWER ── */}
      {selected && (
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <aside className="drawer">
            <button className="close" onClick={() => setSelected(null)} aria-label="Close"><X /></button>
            <span className="kicker">VAULT AV/{selected.id.padStart(4, "0")}</span>
            <h2>{selected.title}</h2>
            <div className="drawer-status">
              <span className={`status status-${selected.status.toLowerCase()}`}>
                {statusCopy[selected.status] ?? selected.status}
              </span>
              <span>{selected.score !== "0" ? `${selected.score}/100` : "Not scored"}</span>
            </div>

            <div className="money-grid">
              <div><small>Reward</small><strong>{formatGen(selected.reward)} GEN</strong></div>
              <div><small>Required bond</small><strong>{formatGen(selected.required_bond)} GEN</strong></div>
            </div>
            <div className="criterion">
              <small>Current phase deadline</small>
              <p>{formatDeadline(selected.deadline)}</p>
              <span>{selected.revision_count === "0" ? "One revision remains available" : "Revision already used"}</span>
            </div>
            <div className="criterion">
              <small>Machine-checkable verification spec</small>
              <p>Every criterion is authenticated by a domain-appropriate attestation and reproduced by a check — not judged from party prose.</p>
              <a href={selected.spec_url} target="_blank">Criteria spec <ExternalLink size={13} /></a>{"  ·  "}
              <a href={selected.terms_url} target="_blank">Locked terms <ExternalLink size={13} /></a>
            </div>
            {selected.findings_url && (
              <div className="criterion">
                <small>Agent findings bundle</small>
                <p>Criterion-level findings with evidence, attestation and reproducible check per criterion.</p>
                <a href={selected.findings_url} target="_blank">Findings bundle <ExternalLink size={13} /></a>{"  ·  "}
                <a href={selected.log_url} target="_blank">Execution trace <ExternalLink size={13} /></a>
              </div>
            )}
            <CriterionVerdictsBlock raw={selected.criterion_verdicts} />
            <div className="ruling">
              <Gavel size={18} />
              <div>
                <small>Liability record · {selected.decision}</small>
                <p>{selected.reason}</p>
              </div>
            </div>

            {selected.status === "OPEN" && wallet.toLowerCase() === selected.agent.toLowerCase() && (
              <button className="primary wide" disabled={!!busy} onClick={() =>
                void transact("Posting agent bond", "accept_mandate", [BigInt(selected.id)], BigInt(selected.required_bond))
              }>
                {busy ? <LoaderCircle className="spin" /> : <ShieldCheck size={17} />}
                Post {formatGen(selected.required_bond)} GEN bond
              </button>
            )}

            {(selected.status === "BONDED" || selected.status === "REVISION_REQUIRED") &&
              wallet.toLowerCase() === selected.agent.toLowerCase() && (
              <form className="form" onSubmit={submitEvidence}>
                <h3>{selected.status === "REVISION_REQUIRED" ? "Submit the one allowed revision" : "Lock criterion-level findings"}</h3>
                <p className="drawer-copy">The findings bundle must contain one finding per spec criterion — each with an evidence URL, an attestation URL binding the evidence content, and a reproducible check URL validators can re-read.</p>
                <Field name="findingsUrl" label="Findings bundle URL (criterion-level JSON)" placeholder="https://ipfs.io/ipfs/bafkrei..." defaultValue="https://ipfs.io/ipfs/bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku" />
                <Field name="logUrl" label="Content-addressed execution trace" placeholder="https://ipfs.io/ipfs/bafkrei..." defaultValue="https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi" />
                <label>Agent statement<textarea name="note" minLength={30} required placeholder="Explain the observable outcome and evidence trail." defaultValue="Completed the assigned mandate with full deliverables and execution evidence attached above." /></label>
                <button className="primary wide" disabled={!!busy}>
                  {busy ? <><LoaderCircle size={17} className="spin" /> Submitting…</> : <><FileCheck2 size={17} /> Lock findings</>}
                </button>
              </form>
            )}
            {(selected.status === "BONDED" || selected.status === "REVISION_REQUIRED") &&
              wallet.toLowerCase() === selected.client.toLowerCase() && (
              <button className="secondary wide" disabled={!!busy} onClick={() =>
                void transact("Enforcing delivery deadline", "claim_delivery_timeout", [BigInt(selected.id)])
              }>Enforce expired delivery deadline</button>
            )}

            {selected.status === "DELIVERED" && wallet.toLowerCase() === selected.client.toLowerCase() && (
              <form className="form" onSubmit={submitChallenge}>
                <h3>Challenge this delivery</h3>
                <p className="drawer-copy">Attach immutable counter-evidence to dispute the delivery.</p>
                <Field name="challengeUrl" label="Content-addressed counter-evidence" placeholder="https://ipfs.io/ipfs/bafkrei..." defaultValue="https://ipfs.io/ipfs/bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku" />
                <label>Material objection<textarea name="challengeNote" minLength={30} required placeholder="Identify the unmet criterion and point to the counter-evidence." defaultValue="The delivered output does not meet the observable success criteria specified in the mandate terms." /></label>
                <button className="secondary wide" disabled={!!busy}>
                  {busy ? <><LoaderCircle size={17} className="spin" /> Submitting…</> : "Lock counter-evidence"}
                </button>
              </form>
            )}
            {selected.status === "DELIVERED" && now <= Number(selected.deadline) * 1000 && (
              <p className="drawer-copy">
                The client challenge window remains open until {formatDeadline(selected.deadline)}.
                Unchallenged adjudication is unavailable before then.
              </p>
            )}
            {(
              selected.status === "CHALLENGED"
              || (
                selected.status === "DELIVERED"
                && now > Number(selected.deadline) * 1000
              )
            ) && isParty(selected, wallet) && (
              <button className="primary wide" disabled={!!busy} onClick={() =>
                void transact("Liability panel deliberating", "adjudicate", [BigInt(selected.id)])
              }>
                {busy ? <LoaderCircle className="spin" /> : <Gavel size={17} />} Run liability review
              </button>
            )}
            {selected.status === "RULING_READY" && isParty(selected, wallet) && (
              <button className="primary wide" disabled={!!busy} onClick={() =>
                void transact("Settling liability", "settle", [BigInt(selected.id)])
              }>
                {busy ? <LoaderCircle className="spin" /> : <Check size={17} />} Enforce ruling
              </button>
            )}
            {(
              selected.status === "AGENT_EVIDENCE_UNAVAILABLE"
              || selected.status === "CLIENT_EVIDENCE_UNAVAILABLE"
            ) && isParty(selected, wallet) && (
              <>
                <button className="secondary wide" disabled={!!busy} onClick={() =>
                  void transact("Recording early recovery approval", "approve_recovery", [BigInt(selected.id)])
                }>Approve early neutral recovery</button>
                <button className="primary wide" disabled={!!busy} onClick={() =>
                  void transact("Checking recovery deadline", "claim_recovery_timeout", [BigInt(selected.id)])
                }>
                  {selected.status === "AGENT_EVIDENCE_UNAVAILABLE"
                    ? "Client: enforce liability after deadline"
                    : "Claim neutral recovery after deadline"}
                </button>
              </>
            )}
          </aside>
        </div>
      )}

      {/* ── PANEL DRAWER (create / contract) ── */}
      {panel && (
        <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) { setPanel(null); setSample(null); } }}>
          <aside className="drawer compact">
            <button className="close" onClick={() => { setPanel(null); setSample(null); }} aria-label="Close"><X /></button>
            {panel === "contract" ? (
              <>
                <span className="kicker">RUNTIME CONTRACT</span>
                <h2>Connect to Studionet</h2>
                <p className="drawer-copy">AgentVault reads live on-chain state. No mock data is ever substituted.</p>
                <form className="form" onSubmit={saveAddress}>
                  <Field name="address" label="Deployed contract address" defaultValue={address} placeholder="0x…" />
                  <button className="primary wide">Connect</button>
                </form>
              </>
            ) : (
              <>
                <span className="kicker">NEW VAULT MANDATE</span>
                <h2>Open a vault</h2>
                <p className="drawer-copy">Choose a template or fill in your own. Only the assigned agent can post the required bond.</p>

                {/* ── SAMPLE PICKER ── */}
                <div className="sample-picker">
                  <span className="sample-label">Quick templates</span>
                  <div className="sample-grid">
                    {vaultSamples.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`sample-card${sample?.id === s.id ? " active" : ""}`}
                        onClick={() => setSample(sample?.id === s.id ? null : s)}
                      >
                        <span className="sample-icon">{s.icon}</span>
                        <span className="sample-info">
                          <strong>{s.title}</strong>
                          <small>{s.category} · {s.reward} GEN</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── FORM ── */}
                <form className="form" onSubmit={createMandate} key={sample?.id ?? "blank"}>
                  <Field name="title" label="Mandate title" placeholder="Reconcile 1,000 vendor invoices" defaultValue={sample?.title ?? ""} />
                  <Field name="agent" label="Assigned agent address" placeholder="0x…" />
                  <div className="form-pair">
                    <Field name="reward" label="Reward (GEN)" placeholder="10" defaultValue={sample?.reward ?? ""} />
                    <Field name="bond" label="Agent bond (GEN)" placeholder="5" defaultValue={sample?.bond ?? ""} />
                  </div>
                  <Field name="termsUrl" label="Content-addressed terms URL" placeholder="https://ipfs.io/ipfs/..." defaultValue={sample?.termsUrl ?? ""} />
                  <Field name="specUrl" label="Criteria spec URL (machine-checkable JSON)" placeholder="https://ipfs.io/ipfs/..." defaultValue={sample?.specUrl ?? ""} />
                  {sample && (
                    <p className="sample-hint">{sample.summary}</p>
                  )}
                  <p className="spec-hint">
                    Spec format: {"{\"version\":\"1\",\"domain\":\"…\",\"criteria\":[{\"id\",\"requirement\",\"attestation\":{…},\"check\":{…}}]}"}
                    {" "}— 1 to 5 criteria, each with an attestation and a reproducible check.
                  </p>
                  <button className="primary wide" disabled={!!busy}>
                    {busy ? <LoaderCircle className="spin" /> : <Plus size={17} />} Fund vault
                  </button>
                </form>
              </>
            )}
          </aside>
        </div>
      )}

      {/* ── TOAST ── */}
      {notice && (
        <div className={`toast ${notice.success ? "success" : "error"}`}>
          {notice.success ? <Check size={18} /> : <TriangleAlert size={18} />}
          <div>
            <strong>{notice.success ? "Transaction accepted" : "Action needs attention"}</strong>
            <span>{notice.error || notice.status || "On-chain state refreshed."}</span>
            {notice.hash && <a href={explorerTx(notice.hash)} target="_blank">View transaction <ExternalLink size={12} /></a>}
          </div>
          <button onClick={() => setNotice(null)}><X size={15} /></button>
        </div>
      )}
    </main>
  );
}

function CriterionVerdictsBlock({ raw }: { raw: string }) {
  if (!raw) return null;
  let parsed: CriterionVerdicts | null = null;
  try {
    const candidate = JSON.parse(raw) as CriterionVerdicts;
    if (Array.isArray(candidate?.results) && candidate.results.length > 0) {
      parsed = candidate;
    }
  } catch {
    parsed = null;
  }
  if (!parsed) return null;
  return (
    <div className="criterion-verdicts">
      <small>Criterion-level validator verdicts</small>
      <ul>
        {parsed.results.map((item) => (
          <li key={item.id} className={item.verdict === "AUTHENTICATED" ? "v-pass" : "v-fail"}>
            <strong>{item.id}</strong>
            <span>{item.verdict === "AUTHENTICATED" ? "AUTHENTICATED" : "REFUTED"}</span>
            <p>{item.why}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label>{label}<input required {...props} /></label>;
}

function isParty(item: Mandate, wallet: string) {
  return !!wallet && [item.client, item.agent].includes(wallet.toLowerCase());
}

function contentCommitment(url: string) {
  const normalized = url.trim().toLowerCase();
  const ipfsPrefix = "https://ipfs.io/ipfs/";
  const arweavePrefix = "https://arweave.net/";
  const sourceId = normalized.startsWith(ipfsPrefix)
    ? normalized.slice(ipfsPrefix.length).split("/")[0]
    : normalized.startsWith(arweavePrefix)
      ? normalized.slice(arweavePrefix.length).split("/")[0]
      : "";
  return `content:${sourceId}`;
}

function formatDeadline(value: string) {
  const timestamp = Number(value || "0");
  if (!timestamp) return "No active deadline";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000));
}
