export type Mandate = {
  id: string;
  client: string;
  agent: string;
  title: string;
  terms_url: string;
  terms_digest: string;
  spec_url: string;
  spec_digest: string;
  deadline: string;
  reward: string;
  required_bond: string;
  bond: string;
  findings_url: string;
  findings_digest: string;
  log_url: string;
  log_digest: string;
  submission_note: string;
  challenge_url: string;
  challenge_digest: string;
  challenge_note: string;
  revision_count: string;
  status: string;
  decision: string;
  score: string;
  reason: string;
  criterion_verdicts: string;
};

export type CriterionVerdict = {
  id: string;
  verdict: "AUTHENTICATED" | "REFUTED";
  why: string;
};

export type CriterionVerdicts = {
  results: CriterionVerdict[];
  why: string;
};

export type ProtocolStats = {
  mandate_count: string;
  rewards_locked: string;
  bonds_locked: string;
  agent_paid: string;
  client_paid: string;
  slashed: string;
};

export type TxResult = {
  success: boolean;
  data?: unknown;
  hash?: string;
  status?: string;
  pending?: boolean;
  error?: string;
};
