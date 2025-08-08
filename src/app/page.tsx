"use client";
import { useState } from "react";
import {
  Connection,
  Transaction,
  TransactionInstruction,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { useWallet, WalletProvider } from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

export default function DepositSigner() {
  const wallet = useWallet();
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleDeposit = async () => {
    if (!wallet.publicKey) {
      setStatus("Connect your wallet first.");
      return;
    }

    setIsLoading(true);
    setStatus("Fetching deposit instruction...");

    try {
      const res = await fetch("http://localhost:5040/api/solana/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: wallet.publicKey.toBase58(),
          cid: "bafyha1eigdyrzt5x3y4f5l5labfasqa1527gq1vz5c6uvvqc6a6",
          size: 10043,
          duration: 30,
          depositAmount: 0.4,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Backend response error:", errorData);
        setStatus(
          `❌ Backend error: ${errorData.error || "Unknown backend error"}`,
        );
        return;
      }

      const { instructions, message } = await res.json();
      console.log("Backend response:", { instructions, message });

      if (!instructions || instructions.length === 0) {
        setStatus("❌ No instruction data received from backend");
        return;
      }

      setStatus("Building transaction...");

      const connection = new Connection(clusterApiUrl("testnet"), "confirmed");
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");

      // We now expect only depositIx from backend
      const depositIx = new TransactionInstruction({
        programId: new PublicKey(instructions[0].programId),
        keys: instructions[0].keys.map((key: any) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instructions[0].data, "base64"),
      });

      const tx = new Transaction();
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = wallet.publicKey;
      tx.add(depositIx);

      setStatus("Signing and sending...");

      const signedTx = await wallet.signTransaction!(tx);

      const signature = await connection.sendRawTransaction(
        signedTx.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        },
      );

      setStatus("Confirming transaction...");

      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed",
      );

      setStatus(`✅ Transaction confirmed: ${signature}`);
      console.log(
        `View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=testnet`,
      );
    } catch (err) {
      console.error("Transaction error:", err);

      let errorMessage = "Unknown error";
      if (err instanceof Error) {
        errorMessage = err.message;

        if (err.message.includes("Transaction simulation failed")) {
          errorMessage =
            "Transaction simulation failed. Check program logs for details.";
        } else if (err.message.includes("Blockhash not found")) {
          errorMessage = "Transaction expired. Please try again.";
        } else if (err.message.includes("Insufficient funds")) {
          errorMessage = "Insufficient SOL balance for transaction.";
        }
      }

      setStatus(`❌ Failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeConfig = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setStatus("Connect wallet first to initialize config");
      return;
    }

    setIsLoading(true);
    setStatus("Fetching init config instruction...");

    try {
      const res = await fetch("http://localhost:5040/api/solana/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPubkey: wallet.publicKey.toBase58() }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        setStatus(`❌ Backend error: ${errorData.error || "Unknown error"}`);
        return;
      }

      const { instructions } = await res.json();
      if (!instructions || instructions.length === 0) {
        setStatus("❌ No instructions received from backend");
        return;
      }

      const connection = new Connection(clusterApiUrl("testnet"), "confirmed");
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");

      const initIx = new TransactionInstruction({
        programId: new PublicKey(instructions[0].programId),
        keys: instructions[0].keys.map((k: any) => ({
          pubkey: new PublicKey(k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: Buffer.from(instructions[0].data, "base64"),
      });

      const tx = new Transaction();
      tx.add(initIx);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = latestBlockhash.blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");

      setStatus(`✅ Config initialized: ${sig}`);
    } catch (err) {
      console.error("Init config transaction error:", err);
      setStatus(
        `❌ Failed to init config: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1em",
        justifyContent: "center",
        alignItems: "center",
        height: "40vh"
      }}
    >
      <WalletMultiButton />
      <button onClick={handleDeposit} disabled={!wallet.publicKey || isLoading}>
        {isLoading ? "Processing..." : "Submit Deposit"}
      </button>

      <button
        onClick={initializeConfig}
        disabled={isLoading || !wallet.publicKey}
      >
        {isLoading ? "Processing..." : "Initialize Config (Run Once)"}
      </button>

      <p>{status}</p>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = [new PhantomWalletAdapter()];

  return (
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  );
}
