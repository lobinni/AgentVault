"use client";

import {
  createClient,
  createAccount,
} from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { TxResult } from "./types";

declare global {
  interface Window {
    ethereum?: {
      request: (input: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

type RuntimeClient = {
  connect?: (network: string) => Promise<void>;
  readContract: (input: {
    account?: ReturnType<typeof createAccount>;
    address: `0x${string}`;
    functionName: string;
    args: unknown[];
  }) => Promise<unknown>;
  writeContract: (input: {
    address: `0x${string}`;
    functionName: string;
    args: unknown[];
    value: bigint;
  }) => Promise<string>;
};

// Bump the key when the production deployment changes so stale browser state
// can never override the contract address shipped with this release.
const STORAGE_KEY = "agentvault.contract.v8";
const DEPLOYED_ADDRESS = "0x58c259629C5D0B1F7b1504665Ace93277fA660d8";
const envAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || DEPLOYED_ADDRESS;

// Studio's gen_call requires a sender even for views. Keep an isolated account
// for reads so syncing works before a reviewer connects a wallet.
const readAccount = createAccount();
const readClient = createClient({
  chain: studionet,
  account: readAccount,
}) as unknown as RuntimeClient;

const STUDIO_RPC_URL = studionet.rpcUrls.default.http[0];
const statusNames: Record<string, string> = {
  "0": "UNINITIALIZED",
  "1": "PENDING",
  "2": "PROPOSING",
  "3": "COMMITTING",
  "4": "REVEALING",
  "5": "ACCEPTED",
  "6": "UNDETERMINED",
  "7": "FINALIZED",
  "8": "CANCELED",
  "9": "APPEAL_REVEALING",
  "10": "APPEAL_COMMITTING",
  "11": "READY_TO_FINALIZE",
  "12": "VALIDATORS_TIMEOUT",
  "13": "LEADER_TIMEOUT",
};

function transactionStatusName(value: unknown): string {
  const record = value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
  const raw = record?.statusName ?? record?.status ?? value;
  const text = String(raw);
  return statusNames[text] ?? text;
}

async function waitForStudioAcceptance(hash: `0x${string}`): Promise<string> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const response = await fetch(STUDIO_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Studio expects the raw transaction hash here. Passing { txId: hash }
      // triggers a backend database type error instead of checking the status.
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: attempt + 1,
        method: "gen_getTransactionStatus",
        params: [hash],
      }),
    });
    const payload = await response.json() as { result?: unknown; error?: { message?: string } };
    if (!response.ok || payload.error) {
      // Studio may expose the wallet response before its transaction index has
      // caught up. Treat that short gap as PENDING rather than surfacing a
      // false failure to the user.
      if (payload.error?.message?.toLowerCase().includes("not found")) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        continue;
      }
      throw new Error(payload.error?.message || "Unable to read the Studio transaction status.");
    }

    const status = transactionStatusName(payload.result);
    if (status === "ACCEPTED" || status === "FINALIZED") return status;
    if (["UNDETERMINED", "CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"].includes(status)) {
      throw new Error(`Transaction finished with ${status}. No contract state was accepted.`);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("Timed out waiting for Studionet to accept the transaction.");
}

export function contractAddress(): `0x${string}` | "" {
  if (typeof window === "undefined") return envAddress as `0x${string}` | "";
  return (window.localStorage.getItem(STORAGE_KEY) || envAddress) as `0x${string}` | "";
}

export function saveContractAddress(value: string) {
  window.localStorage.setItem(STORAGE_KEY, value.trim());
}

export async function connectWallet(): Promise<TxResult> {
  if (!window.ethereum) return { success: false, error: "A browser wallet is required." };
  try {
    const chainId = `0x${studionet.id.toString(16)}`;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId }],
      });
    } catch {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: "GenLayer Studio Network",
          nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
          rpcUrls: ["https://studio.genlayer.com/api"],
          blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
        }],
      });
    }
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
      params: [],
    }) as string[];
    return accounts[0]
      ? { success: true, data: accounts[0] }
      : { success: false, error: "No wallet account selected." };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Wallet connection failed." };
  }
}

export async function readContract(functionName: string, args: unknown[] = []): Promise<TxResult> {
  const address = contractAddress();
  if (!address) return { success: false, error: "Set a Studionet contract address first." };
  try {
    const data = await readClient.readContract({
      account: readAccount,
      address,
      functionName,
      args,
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Contract read failed." };
  }
}

export async function writeContract(
  functionName: string,
  args: unknown[] = [],
  value = BigInt(0),
): Promise<TxResult> {
  const address = contractAddress();
  if (!address) return { success: false, error: "Set a Studionet contract address first." };
  if (!window.ethereum) return { success: false, error: "Connect a funded wallet first." };
  let hash = "";
  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
      params: [],
    }) as string[];
    if (!accounts[0]) return { success: false, error: "No wallet account selected." };
    const client = createClient({
      chain: studionet,
      provider: window.ethereum,
      account: accounts[0] as `0x${string}`,
    }) as unknown as RuntimeClient;
    hash = await client.writeContract({ address, functionName, args, value });
    const status = await waitForStudioAcceptance(hash as `0x${string}`);
    return {
      success: true,
      hash,
      status,
      data: "Studionet accepted the transaction. The dashboard is refreshing live contract state.",
    };
  } catch (error) {
    return {
      success: false,
      hash: hash || undefined,
      error: error instanceof Error ? error.message : "Contract write failed.",
    };
  }
}

export function parseGen(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(normalized)) throw new Error("Use a valid GEN amount.");
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * BigInt("1000000000000000000") + BigInt(fraction.padEnd(18, "0"));
}

export function formatGen(value: string): string {
  const amount = BigInt(value || "0");
  const unit = BigInt("1000000000000000000");
  const whole = amount / unit;
  const fraction = (amount % unit).toString().padStart(18, "0").slice(0, 2);
  return `${whole}.${fraction}`;
}

export function explorerTx(hash: string) {
  return `https://explorer-studio.genlayer.com/tx/${hash}`;
}

export function explorerContract(address: string) {
  return `https://explorer-studio.genlayer.com/address/${address}`;
}
