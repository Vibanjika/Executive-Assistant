"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import { ShimmerButton, BorderBeam } from "../components/magic";
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email"); 
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/auth/me").then(() => router.replace("/dashboard")).catch(() => {});
  }, [router]);
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (step === "email") {
        await api("/auth/request-otp", { method: "POST", body: { email } });
        setStep("code");
      } else {
        await api("/auth/verify-otp", { method: "POST", body: { email, code } });
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="center">
      <form className="card login" onSubmit={submit}>
        <BorderBeam />
        <h1>Vibot:Executive Assistant</h1>
        <p className="muted">
          {step === "email" ? "Enter your email and we'll send you a login code." : `We sent a 6-digit code to ${email}.`}
        </p>
        {step === "email" ? (
          <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        ) : (
          <input inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
        )}
        {error && <p className="error">{error}</p>}
        <ShimmerButton type="submit" disabled={busy}>
          {busy ? "Please wait" : step === "email" ? "Send code" : "Log in"}
        </ShimmerButton>
        {step === "code" && (
          <button type="button" className="link" onClick={() => { setStep("email"); setCode(""); }}>
            Use a different email
          </button>
        )}
      </form>
    </main>
  );
}
