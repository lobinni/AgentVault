import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const accountFrom = (name) => {
  const raw = required(name);
  return createAccount(raw.startsWith("0x") ? raw : `0x${raw}`);
};

const address = required("CONTRACT_ADDRESS");
const client = accountFrom("CLIENT_PRIVATE_KEY");
const agent = accountFrom("AGENT_PRIVATE_KEY");
const clientSdk = createClient({ chain: studionet, account: client });
const agentSdk = createClient({ chain: studionet, account: agent });
const rpcUrl = studionet.rpcUrls.default.http[0];
const reward = BigInt(process.env.REWARD_WEI || "1000");
const bond = BigInt(process.env.BOND_WEI || "500");
const artifactUrl = required("ARTIFACT_URL");
const contentCommitment = (url) => {
  const normalized = url.trim().toLowerCase();
  const ipfsPrefix = "https://ipfs.io/ipfs/";
  const arweavePrefix = "https://arweave.net/";
  const sourceId = normalized.startsWith(ipfsPrefix)
    ? normalized.slice(ipfsPrefix.length).split("/")[0]
    : normalized.startsWith(arweavePrefix)
      ? normalized.slice(arweavePrefix.length).split("/")[0]
      : "";
  if (sourceId.length < 32) throw new Error("ARTIFACT_URL must be a content-addressed IPFS or Arweave URL.");
  return `content:${sourceId}`;
};
const artifactCommitment = contentCommitment(artifactUrl);
const mandateTitle = process.env.MANDATE_TITLE || "AgentVault live accountability verification";
const specUrl = process.env.SPEC_URL || artifactUrl;
const submissionNote = process.env.SUBMISSION_NOTE ||
  "This immutable packet records the delivered outcome and execution evidence used for the AgentVault Studionet lifecycle verification.";

const readJson = async (sdk, functionName, args = []) =>
  JSON.parse(await sdk.readContract({ address, functionName, args }));

const assert = (condition, message, details) => {
  if (!condition) {
    throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
  }
};

const decodeReturnValue = (transaction) => {
  const receipt = transaction?.consensus_data?.leader_receipt?.[0];
  const readable = receipt?.result?.payload?.readable;
  if (typeof readable !== "string") return "";
  try {
    const decoded = JSON.parse(readable);
    return typeof decoded === "string" ? decoded : "";
  } catch {
    return readable;
  }
};

const contractErrorCodes = new Set([
  "INVALID_AGENT",
  "INVALID_TITLE",
  "IMMUTABLE_TERMS_REQUIRED",
  "TERMS_COMMITMENT_MISMATCH",
  "IMMUTABLE_SPEC_REQUIRED",
  "REWARD_REQUIRED",
  "BOND_REQUIRED",
  "MANDATE_NOT_FOUND",
  "AGENT_ONLY",
  "MANDATE_NOT_OPEN",
  "EXACT_BOND_REQUIRED",
  "ACCEPTANCE_EXPIRED",
  "DELIVERY_NOT_AVAILABLE",
  "DELIVERY_EXPIRED",
  "REVISION_ALREADY_USED",
  "IMMUTABLE_FINDINGS_REQUIRED",
  "FINDINGS_COMMITMENT_MISMATCH",
  "LOG_COMMITMENT_MISMATCH",
  "INVALID_SUBMISSION_NOTE",
  "DELIVERY_NOT_CHALLENGEABLE",
  "CHALLENGE_WINDOW_CLOSED",
  "IMMUTABLE_CHALLENGE_REQUIRED",
  "CHALLENGE_COMMITMENT_MISMATCH",
  "INVALID_CHALLENGE_NOTE",
  "PARTY_ONLY",
  "DELIVERY_NOT_READY",
  "CHALLENGE_WINDOW_OPEN",
  "RULING_NOT_READY",
  "ESCROW_INVARIANT_BROKEN",
  "INVALID_RULING",
  "CLIENT_ONLY",
  "CANCELLATION_CLOSED",
  "DELIVERY_TIMEOUT_NOT_AVAILABLE",
  "DELIVERY_WINDOW_OPEN",
  "RECOVERY_NOT_AVAILABLE",
  "RECOVERY_WINDOW_OPEN",
]);

const write = async (sdk, functionName, args = [], value = 0n) => {
  const hash = await sdk.writeContract({ address, functionName, args, value });
  const receipt = await sdk.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 2000,
    retries: 180,
    fullTransaction: false,
  });
  const transaction = await sdk.getTransaction({ hash });
  const status = transaction.statusName || receipt.statusName;
  const execution =
    transaction.txExecutionResultName ||
    receipt.txExecutionResultName ||
    "NOT_EXPOSED_BY_SDK";
  const returned = transaction.txDataDecoded || decodeReturnValue(transaction);
  if (contractErrorCodes.has(returned)) {
    const error = new Error(`Contract rejected ${functionName}: ${returned}`);
    error.transaction = { hash, status, execution, returned };
    throw error;
  }
  return { hash, status, execution, returned };
};

const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

const rpc = async (method, params) => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(`RPC ${method} failed: ${JSON.stringify(payload.error || payload)}`);
  }
  return payload.result;
};

const contractBalance = async () =>
  BigInt(await rpc("eth_getBalance", [address, "latest"]));

const waitForFinalizedRollback = async (hash, expectedBalance) => {
  await clientSdk.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 2000,
    retries: 180,
    fullTransaction: false,
  });

  // EOA transfers are emitted as child transactions once the parent finalizes.
  // Poll the custody balance instead of treating ACCEPTED as the final outcome.
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const balance = await contractBalance();
    if (balance === expectedBalance) return balance;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Rollback transfer did not restore the contract balance after finality for ${hash}.`);
};

const unchangedStats = (before, after) =>
  before.mandate_count === after.mandate_count
  && before.rewards_locked === after.rewards_locked
  && before.bonds_locked === after.bonds_locked
  && before.agent_paid === after.agent_paid
  && before.client_paid === after.client_paid
  && before.slashed === after.slashed;

const attemptRejectedPayable = async ({
  label,
  sdk,
  functionName,
  args,
  value,
  mandateId: existingMandateId,
}) => {
  const beforeStats = await readJson(clientSdk, "get_stats");
  const beforeBalance = await contractBalance();
  const beforeMandate = existingMandateId === undefined
    ? undefined
    : await readJson(clientSdk, "get_mandate", [existingMandateId]);
  let transaction;
  let rejection = "";
  try {
    transaction = await write(sdk, functionName, args, value);
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
    transaction = error && typeof error === "object" && "transaction" in error
      ? error.transaction
      : undefined;
  }
  if (transaction?.hash) await waitForFinalizedRollback(transaction.hash, beforeBalance);
  const afterStats = await readJson(clientSdk, "get_stats");
  const afterBalance = await contractBalance();
  const afterMandate = existingMandateId === undefined
    ? undefined
    : await readJson(clientSdk, "get_mandate", [existingMandateId]);

  assert(
    unchangedStats(beforeStats, afterStats),
    `${label}: rejected payable call changed protocol counters`,
    { beforeStats, afterStats, transaction, rejection },
  );
  assert(
    beforeBalance === afterBalance,
    `${label}: attached GEN was not rolled back`,
    {
      beforeBalance: beforeBalance.toString(),
      afterBalance: afterBalance.toString(),
      transaction,
      rejection,
    },
  );
  if (beforeMandate !== undefined) {
    assert(
      JSON.stringify(beforeMandate) === JSON.stringify(afterMandate),
      `${label}: rejected payable call changed mandate state`,
      { beforeMandate, afterMandate, transaction, rejection },
    );
  }
  print({
    step: label,
    verified: true,
    attachedValueRolledBack: true,
    protocolStateUnchanged: true,
    contractBalance: afterBalance.toString(),
    transaction,
    rejection,
  });
};

const initial = await readJson(clientSdk, "get_stats");
const mandateId = BigInt(initial.mandate_count);

await attemptRejectedPayable({
  label: "invalid_open_payable_rollback",
  sdk: clientSdk,
  functionName: "open_mandate",
  args: [
    client.address,
    mandateTitle,
    artifactUrl,
    artifactCommitment,
    specUrl,
    bond,
  ],
  value: reward,
});

const openedTx = await write(
  clientSdk,
  "open_mandate",
  [
    agent.address,
    mandateTitle,
    artifactUrl,
    artifactCommitment,
    specUrl,
    bond,
  ],
  reward,
);
const opened = await readJson(clientSdk, "get_mandate", [mandateId]);
assert(opened.status === "OPEN", "Mandate was not opened", { openedTx, opened });
assert(opened.client === client.address.toLowerCase(), "Client sender binding failed", opened);
assert(opened.agent === agent.address.toLowerCase(), "Agent assignment failed", opened);
assert(opened.reward === reward.toString(), "Reward custody mismatch", opened);
print({ step: "open_mandate", verified: true, transaction: openedTx, mandate: opened });

await attemptRejectedPayable({
  label: "wrong_bond_payable_rollback",
  sdk: agentSdk,
  functionName: "accept_mandate",
  args: [mandateId],
  value: bond + 1n,
  mandateId,
});

const bondedTx = await write(agentSdk, "accept_mandate", [mandateId], bond);
const bonded = await readJson(clientSdk, "get_mandate", [mandateId]);
assert(bonded.status === "BONDED", "Agent bond was not locked", { bondedTx, bonded });
assert(bonded.bond === bond.toString(), "Bond custody mismatch", bonded);
print({ step: "accept_mandate", verified: true, transaction: bondedTx, mandate: bonded });

const evidenceTx = await write(agentSdk, "submit_evidence", [
  mandateId,
  artifactUrl,
  artifactCommitment,
  artifactUrl,
  artifactCommitment,
  submissionNote,
]);
const submitted = await readJson(clientSdk, "get_mandate", [mandateId]);
assert(submitted.status === "DELIVERED", "Delivery was not locked", { evidenceTx, submitted });
assert(submitted.findings_digest === artifactCommitment, "Findings commitment mismatch", submitted);
print({ step: "submit_evidence", verified: true, transaction: evidenceTx, mandate: submitted });

const challengeTx = await write(clientSdk, "challenge_delivery", [
  mandateId,
  artifactUrl,
  artifactCommitment,
  "Client confirms the immutable packet is the complete counter-evidence record for this live lifecycle test.",
]);
const challenged = await readJson(clientSdk, "get_mandate", [mandateId]);
assert(challenged.status === "CHALLENGED", "Challenge window was not exercised", {
  challengeTx,
  challenged,
});
print({ step: "challenge_delivery", verified: true, transaction: challengeTx, mandate: challenged });

const rulingTx = await write(clientSdk, "adjudicate", [mandateId]);
const ruled = await readJson(clientSdk, "get_mandate", [mandateId]);
assert(
  [
    "RULING_READY",
    "REVISION_REQUIRED",
    "AGENT_EVIDENCE_UNAVAILABLE",
    "CLIENT_EVIDENCE_UNAVAILABLE",
  ].includes(ruled.status),
  "Liability panel did not produce a valid transition",
  { rulingTx, ruled },
);
print({ step: "adjudicate", verified: true, transaction: rulingTx, mandate: ruled });

let finalRuling = ruled;
if (ruled.status === "REVISION_REQUIRED") {
  const revisionTx = await write(agentSdk, "submit_evidence", [
    mandateId,
    artifactUrl,
    artifactCommitment,
    artifactUrl,
    artifactCommitment,
    `${submissionNote} This is the single bounded revision requested by the liability panel.`,
  ]);
  const revisionChallengeTx = await write(clientSdk, "challenge_delivery", [
    mandateId,
    artifactUrl,
    artifactCommitment,
    "Client records the immutable counter-evidence packet for the single bounded revision.",
  ]);
  const rerulingTx = await write(clientSdk, "adjudicate", [mandateId]);
  finalRuling = await readJson(clientSdk, "get_mandate", [mandateId]);
  assert(
    [
      "RULING_READY",
      "AGENT_EVIDENCE_UNAVAILABLE",
      "CLIENT_EVIDENCE_UNAVAILABLE",
    ].includes(finalRuling.status),
    "Revision did not reach a terminal ruling or recovery path",
    { revisionTx, revisionChallengeTx, rerulingTx, finalRuling },
  );
  print({
    step: "bounded_revision",
    verified: true,
    transactions: [revisionTx, revisionChallengeTx, rerulingTx],
    mandate: finalRuling,
  });
}

if (finalRuling.status === "RULING_READY") {
  const settledTx = await write(clientSdk, "settle", [mandateId]);
  const settled = await readJson(clientSdk, "get_mandate", [mandateId]);
  assert(
    ["SETTLED_FULFILLED", "SETTLED_BREACH"].includes(settled.status),
    "Settlement did not finalize",
    { settledTx, settled },
  );
  assert(settled.reward === "0" && settled.bond === "0", "Settlement escrow was not cleared", settled);
  print({ step: "settle", verified: true, transaction: settledTx, mandate: settled });
} else {
  const clientRecovery = await write(clientSdk, "approve_recovery", [mandateId]);
  const agentRecovery = await write(agentSdk, "approve_recovery", [mandateId]);
  const recovered = await readJson(clientSdk, "get_mandate", [mandateId]);
  assert(recovered.status === "RECOVERED", "Neutral recovery did not finalize", {
    clientRecovery,
    agentRecovery,
    recovered,
  });
  assert(recovered.reward === "0" && recovered.bond === "0", "Recovery escrow was not cleared", recovered);
  print({
    step: "mutual_recovery",
    verified: true,
    transactions: [clientRecovery, agentRecovery],
    mandate: recovered,
  });
}

const finalStats = await readJson(clientSdk, "get_stats");
print({
  contract: address,
  client: client.address,
  agent: agent.address,
  mandateId: mandateId.toString(),
  finalStats,
  lifecycleVerified: true,
  note: "Current mandate escrow was cleared. Contract-wide locked totals can include unrelated open mandates.",
});
