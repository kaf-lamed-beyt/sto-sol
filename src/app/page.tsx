"use client";

import { useState } from "react";
import {
  Connection,
  Transaction,
  TransactionInstruction,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function DepositSigner() {
  const wallet = useWallet();
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [durationDays, setDurationDays] = useState<number>(7);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const days = parseInt(e.target.value);
    if (!isNaN(days) && days > 0) {
      setDurationDays(days);
    }
  };

  const calculateEstimatedCost = () => {
    if (!file) return null;

    const ratePerBytePerDay = 1000;
    const sizeBytes = file.size;
    const totalLamports = sizeBytes * durationDays * ratePerBytePerDay;
    const totalSOL = totalLamports / 1_000_000_000;

    return {
      lamports: totalLamports,
      sol: totalSOL,
    };
  };

  const estimatedCost = calculateEstimatedCost();

  const handleDeposit = async () => {
    if (!wallet.publicKey) {
      setStatus("Connect your wallet first.");
      return;
    }
    if (!file) {
      setStatus("Please select a file first.");
      return;
    }
    if (durationDays < 1) {
      setStatus("Duration must be at least 1 day.");
      return;
    }

    setIsLoading(true);
    setStatus("Uploading file & fetching deposit instruction...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      // need to convert days to seconds so it matches what the server and program expect
      formData.append("duration", String(durationDays * 86400));
      formData.append("publicKey", wallet.publicKey.toBase58());

      const res = await fetch("https://storacha-solana-sdk-bshc.onrender.com/api/user/uploadFile", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Backend response error:", errorData);
        setStatus(
          `❌ Backend error: ${errorData.error || "Unknown backend error"}`,
        );
        return;
      }

      const { instructions } = await res.json();
      if (!instructions || instructions.length === 0) {
        setStatus("❌ No instruction data received from backend");
        return;
      }

      setStatus("Building transaction...");

      const connection = new Connection(clusterApiUrl("testnet"), "confirmed");
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");

      const depositIx = new TransactionInstruction({
        programId: new PublicKey(instructions[0].programId),
        /* eslint-disable @typescript-eslint/no-explicit-any */
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
    } catch (err) {
      console.error("Transaction error:", err);
      setStatus(
        `❌ Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
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
        height: "50vh",
        maxWidth: "600px",
        margin: "0 auto",
        padding: "20px",
      }}
    >
      <WalletMultiButton />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5em",
          width: "100%",
        }}
      >
        <label htmlFor="file-input">Select File:</label>
        <input
          id="file-input"
          type="file"
          onChange={handleFileChange}
          style={{ padding: "8px" }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5em",
          width: "100%",
        }}
      >
        <label htmlFor="duration-input">Storage Duration (days):</label>
        <input
          id="duration-input"
          type="number"
          placeholder={durationDays.toString()}
          onChange={handleDurationChange}
          style={{ padding: "8px" }}
        />
      </div>

      {file && (
        <div
          style={{
            padding: "12px",
            backgroundColor: "#161315",
            borderRadius: "8px",
            width: "100%",
            fontSize: "14px",
          }}
        >
          <p>
            <strong>File:</strong> {file.name} ({Math.round(file.size / 1024)}
            KB)
          </p>
          <p>
            <strong>Duration:</strong> {durationDays} days
          </p>
          {estimatedCost && (
            <p>
              <strong>Estimated Cost:</strong> {estimatedCost.sol.toFixed(4)}{" "}
              SOL
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleDeposit}
        disabled={!wallet.publicKey || isLoading || !file}
        style={{
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor:
            !wallet.publicKey || isLoading || !file ? "#ccc" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor:
            !wallet.publicKey || isLoading || !file ? "not-allowed" : "pointer",
        }}
      >
        {isLoading ? "Processing..." : "Submit Deposit"}
      </button>

      <p
        style={{
          maxWidth: "100%",
          wordBreak: "break-all",
          textAlign: "center",
        }}
      >
        {status}
      </p>
    </div>
  );
}
