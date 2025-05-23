// Run with: npx ts-node ts-script/nitrolite-demo.ts
// The password for state wallet (p2) is: 123456

import { NitroliteClient } from "@erc7824/nitrolite";
import { createPublicClient, http, Address, Hex, Client } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  Wallet,
  JsonRpcProvider,
  Contract,
  formatEther,
  keccak256,
  toUtf8Bytes,
  AbiCoder,
} from "ethers"; // v6 imports
import fs from "fs";
import dotenv from "dotenv";
// @ts-ignore
import readlineSync = require("readline-sync");
import { encryptWithPassword, decryptWithPassword } from "./crypto-helper";
import { NitroliteRPC } from "@erc7824/nitrolite";
import { createWalletClient } from "viem";

dotenv.config();

// --- Helper: Convert flat hex signature to {v, r, s} ---
function hexToSignature(sig: string) {
  const sigBuf = Buffer.from(sig.slice(2), "hex");
  const r = "0x" + sigBuf.slice(0, 32).toString("hex");
  const s = "0x" + sigBuf.slice(32, 64).toString("hex");
  let v = sigBuf[64];
  if (v < 27) v += 27;
  return { v, r: r as Hex, s: s as Hex };
}

// --- User must fill in this address for p3 (system/clearnode) ---
const P3_ADDRESS = "0x120C1fc5B7f357c0254cDC8027970DDD6405e115" as Address; // TODO: Replace with real system address!

// --- Contract addresses from deployment ---
const contractAddresses = {
  custody: "0x19Cf25AaA8ba1F68A4B3CCC4dCcC1cC23fF7076B" as Address,
  adjudicator: "0x37b3030D103C95bc60FD80A6eba3c43F11671DEd" as Address,
  guestAddress: P3_ADDRESS,
  tokenAddress: "0xFEA2c8D010B84E5b6F107d9E3588d242aF8983b8" as Address,
};

// Add ERC20 interface
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function balanceOf(address account) public view returns (uint256)",
  "function transfer(address to, uint256 amount) public returns (bool)",
] as const;

// --- Helper: Load or create a private key file ---
function loadOrCreateKey(path: string): string {
  if (fs.existsSync(path)) {
    const keyData = JSON.parse(fs.readFileSync(path, "utf8"));
    return keyData.privateKey;
  } else {
    const newKey = Wallet.createRandom().privateKey;
    fs.mkdirSync(require("path").dirname(path), { recursive: true });
    fs.writeFileSync(path, JSON.stringify({ privateKey: newKey }));
    return newKey;
  }
}

// --- Helper: Save/load encrypted state wallet (p2) ---
function saveEncryptedStateWallet(enc: string) {
  fs.writeFileSync(
    "./keys/state-wallet-encrypted.json",
    JSON.stringify({ enc })
  );
}
function loadEncryptedStateWallet(): string | null {
  if (fs.existsSync("./keys/state-wallet-encrypted.json")) {
    return JSON.parse(
      fs.readFileSync("./keys/state-wallet-encrypted.json", "utf8")
    ).enc;
  }
  return null;
}

// --- Step 1: Set up p1 (user wallet) ---
const p1Key = loadOrCreateKey("./keys/p1-user-key.json") as `0x${string}`;
const p1Account = privateKeyToAccount(p1Key);

// --- Step 2: Set up p2 (state wallet, encrypted with password) ---
let p2Address: Address;
let p2Key: `0x${string}`;
let p2Wallet: Wallet;
let password: string;
let encP2: string | null = loadEncryptedStateWallet();
if (!encP2) {
  // First time: generate and encrypt
  password = readlineSync.question(
    "Set a 6-digit password for your state wallet (p2): ",
    { hideEchoBack: true }
  );
  if (!/^\d{6}$/.test(password)) throw new Error("Password must be 6 digits.");
  p2Key = ensureHexPrefix(Wallet.createRandom().privateKey) as `0x${string}`;
  saveEncryptedStateWallet(encryptWithPassword(p2Key, password));
  p2Wallet = new Wallet(p2Key);
  p2Address = p2Wallet.address as Address;
  console.log("State wallet (p2) created and encrypted.");
} else {
  // Prompt for password to decrypt
  password = readlineSync.question(
    "Enter your 6-digit password to unlock state wallet (p2): ",
    { hideEchoBack: true }
  );
  try {
    p2Key = ensureHexPrefix(decryptWithPassword(encP2, password));
    p2Wallet = new Wallet(p2Key);
    p2Address = p2Wallet.address as Address;
    console.log("State wallet (p2) decrypted.");
  } catch (e) {
    throw new Error("Failed to decrypt state wallet. Wrong password?");
  }
}

// --- Step 3: Set up p3 (system/clearnode, local key for demo) ---
const p3Key = loadOrCreateKey("./keys/p3-system-key.json") as `0x${string}`;
const p3Wallet = new Wallet(p3Key);
const p3Address: Address =
  P3_ADDRESS !== "0x0000000000000000000000000000000000000000"
    ? P3_ADDRESS
    : (p3Wallet.address as Address);

// --- Step 4: Set up Nitrolite client with p1 as on-chain wallet, p2 as state wallet ---
// Use SEPOLIA_RPC_URL from .env for all RPC calls
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
if (!SEPOLIA_RPC_URL) {
  throw new Error("SEPOLIA_RPC_URL is not set in your .env file!");
}

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
});

const walletClient = createWalletClient({
  account: p1Account,
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
});

// Updated stateWalletClient to minimal implementation for Nitrolite SDK
const stateWalletClient = {
  account: { address: p2Address },
  signMessage: async ({ message: { raw } }: any) => {
    // Using ethers v6 to sign the raw message without EIP-191 prefix
    const sig = p2Wallet.signingKey.sign(raw);
    return sig.serialized as Hex;
  },
} as any;

const client = new NitroliteClient({
  publicClient,
  walletClient,
  stateWalletClient,
  chainId: sepolia.id,
  challengeDuration: BigInt(86400),
  addresses: contractAddresses,
});

// --- Step 5: Demo lifecycle ---
(async () => {
  // 1. Check USDC balance for p1

  let usdcBalance;
  try {
    usdcBalance = await client.getTokenBalance();
  } catch (e: any) {
    console.error("[ERROR] Failed to get USDC balance:", e.message);
    if (e.stack) console.error(e.stack);
    console.error("[DEBUG] client config:", client);
    return;
  }

  // [DEBUG] Check p1's ETH balance before deposit
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const ethBalance = await provider.getBalance(p1Account.address);

  if (ethBalance === BigInt(0)) {
    console.warn(
      "[WARNING] p1 has 0 ETH. You need ETH for gas to approve and deposit!"
    );
  }

  const usdc = new Contract(
    contractAddresses.tokenAddress,
    ERC20_ABI,
    provider
  );
  const signer = new Wallet(p1Key, provider);

  // 2. Deposit USDC (100 USDC, 6 decimals) from p1
  const depositAmount = BigInt(100_000_000); // 100 USDC

  try {
    const allowance = await (usdc as any).allowance(
      p1Account.address,
      contractAddresses.custody
    );

    if (allowance < depositAmount) {
      const tx = await (usdc as any)
        .connect(signer)
        .approve(contractAddresses.custody, depositAmount);
      console.log("[DEBUG] Sent manual approve tx:", tx.hash);
      await tx.wait();
      console.log("[DEBUG] Manual approve succeeded!");
    } else {
      console.log("[DEBUG] Sufficient allowance already set.");
    }
  } catch (err) {
    console.error("[DEBUG] Manual approve failed:", err);
  }

  try {
    const depositTx = await client.deposit(depositAmount);
    console.log("Deposit tx submitted:", depositTx);
  } catch (e: any) {
    console.error("Deposit failed:", e.message);
    if (e.stack) console.error(e.stack);
    // Print the full error object for diagnostics
    console.error("[DEBUG] Full error object:", e);
    console.warn(
      "[DEBUG] Make sure p1 has enough ETH for gas and the token contract is a valid ERC20 on Sepolia!"
    );
    return;
  }

  // The SDK needs patched to support the state wallet signing process

  //   // 3. Create channel: participants are [p2, p3], only p2 has initial allocation
  //   console.log("[DEBUG] Channel creation:");
  //   console.log("  - State wallet (signer):", p2Address);
  //   console.log("  - User wallet (sender):", p1Account.address);
  //   console.log("  - System/clearnode (p3):", p3Address);
  //   console.log("  - Initial allocation amounts: [p2, p3] =", [
  //     depositAmount,
  //     BigInt(0),
  //   ]);

  //   const createChannelParams = {
  //     initialAllocationAmounts: [depositAmount, BigInt(0)] as [bigint, bigint], // [p2, p3]
  //     stateData: "0x" as `0x${string}`,
  //   };

  //   let channelId: Hex;
  //   try {
  //     const {
  //       channelId: chId,
  //       initialState: returnedState,
  //       txHash,
  //     } = await client.createChannel(createChannelParams);
  //     channelId = chId;
  //     console.log("[SUCCESS] Channel created with ID:", channelId);
  //     console.log("[DEBUG] Initial state:", returnedState);
  //     console.log("[DEBUG] Transaction hash:", txHash);
  //   } catch (err) {
  //     console.error("[ERROR] Failed to create channel:", err);
  //     try {
  //       console.log(
  //         "[DEBUG] Error details:",
  //         JSON.stringify(
  //           (err as any).cause?.details,
  //           (key, value) =>
  //             typeof value === "bigint" ? value.toString() : value,
  //           2
  //         )
  //       );
  //     } catch {}
  //     throw err;
  //   }

  //   // 4. Simulate p3 (system) signing a state if conditions are met
  //   // For demo: p3 signs a state update transferring all funds from p2 to p3
  //   const newAllocations = [
  //     {
  //       destination: p2Address,
  //       token: contractAddresses.tokenAddress,
  //       amount: BigInt(0),
  //     },
  //     {
  //       destination: p3Address,
  //       token: contractAddresses.tokenAddress,
  //       amount: depositAmount,
  //     },
  //   ] as [
  //     { destination: Address; token: Address; amount: bigint },
  //     { destination: Address; token: Address; amount: bigint }
  //   ];

  //   const newState = {
  //     intent: 3, // FINALIZE
  //     version: BigInt(2),
  //     data: "0x" as Hex,
  //     allocations: newAllocations,
  //     sigs: [] as Hex[],
  //   };

  //   // p2 signs first (using ethers v6)
  //   const abiCoder = AbiCoder.defaultAbiCoder();
  //   const stateHash = keccak256(
  //     abiCoder.encode(
  //       [
  //         "uint8",
  //         "uint256",
  //         "bytes",
  //         "tuple(address destination,address token,uint256 amount)[2]",
  //       ],
  //       [
  //         newState.intent,
  //         newState.version,
  //         newState.data,
  //         newAllocations.map((a) => [a.destination, a.token, a.amount]),
  //       ]
  //     )
  //   );

  //   // p2 signs using ethers v6
  //   const p2Sig = p2Wallet.signingKey.sign(stateHash);
  //   newState.sigs.push(p2Sig.serialized as Hex);

  //   // p3 checks and signs (using ethers v6)
  //   const p3Sig = p3Wallet.signingKey.sign(stateHash);
  //   newState.sigs.push(p3Sig.serialized as Hex);

  //   console.log("Final state signed by p2 and p3:", newState);

  //   // 5. p1 closes the channel with the final state
  //   try {
  //     const closeParams = {
  //       stateData: "0x" as Hex,
  //       finalState: {
  //         channelId,
  //         stateData: "0x" as Hex,
  //         allocations: newAllocations as [
  //           (typeof newAllocations)[0],
  //           (typeof newAllocations)[1]
  //         ],
  //         version: BigInt(2),
  //         serverSignature: hexToSignature(newState.sigs[1]),
  //       },
  //     };
  //     const closeTx = await client.closeChannel(closeParams);
  //     console.log("Channel closed. Tx:", closeTx);
  //   } catch (e: any) {
  //     console.error("Channel close failed:", e.message);
  //     if (e.stack) console.error(e.stack);
  //   }

  //   // 6. Construct and sign a get_channels message using NitroliteRPC
  //   const messageSigner = async (payload: any): Promise<Hex> => {
  //     // Use p2 for signing with ethers v6
  //     const hash = keccak256(toUtf8Bytes(JSON.stringify(payload)));
  //     const sig = p2Wallet.signingKey.sign(hash);
  //     return sig.serialized as Hex;
  //   };

  //   const getChannelsReq = NitroliteRPC.createRequest(
  //     Date.now(),
  //     "get_channels",
  //     [],
  //     Math.floor(Date.now() / 1000)
  //   );
  //   const signedGetChannels = await NitroliteRPC.signRequestMessage(
  //     getChannelsReq,
  //     messageSigner
  //   );
  //   console.log(
  //     "Signed get_channels message:",
  //     JSON.stringify(signedGetChannels)
  //   );

  //   // 7. (Optional) Connect to ClearNode via WebSocket and send get_channels (if you have a real URL)
  //   // ...

  // --- Demo complete ---
  console.log("\nDemo complete. You can now inspect the lifecycle above.");
  console.log(
    "If you want to reset the state wallet, delete ./keys/state-wallet-encrypted.json"
  );
})();

// Helper to ensure a string is 0x-prefixed
function ensureHexPrefix(str: string): `0x${string}` {
  return (str.startsWith("0x") ? str : "0x" + str) as `0x${string}`;
}
