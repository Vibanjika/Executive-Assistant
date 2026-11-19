import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Resend } from "resend";
import { one, run } from "./db.js";
import { oauthClient, SCOPES } from "./google.js";
const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
export async function requireAuth(req, res, next) {
  try {
    const { id } = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
    req.user = await one("SELECT * FROM users WHERE id = ?", [id]);
    if (!req.user) throw new Error("no user");
    next();
  } catch {
    res.status(401).json({ error: "Please log in" });
  }
}
router.post("/request-otp", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email" });
  const code = String(crypto.randomInt(100000, 1000000));
  await run(
    `INSERT INTO otps (email, code_hash, expires_at) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at)`,
    [email, sha(code), Date.now() + 10 * 60 * 1000]
  );
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: email,
      subject: `Your login code: ${code}`,
      html: `<p>Your Exe Assistant code is <b style="font-size:20px">${code}</b>. It expires in 10 minutes.</p>`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("resend failed:", err.message);
    res.status(500).json({ error: "Could not send the code" });
  }
});
router.post("/verify-otp", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const code = String(req.body.code || "").trim();
  const row = await one("SELECT * FROM otps WHERE email = ?", [email]);
  if (!row || row.expires_at < Date.now() || row.code_hash !== sha(code)) {
    return res.status(400).json({ error: "Wrong or expired code" });
  }
  await run("DELETE FROM otps WHERE email = ?", [email]);
  await run("INSERT IGNORE INTO users (email) VALUES (?)", [email]);
  const user = await one("SELECT * FROM users WHERE email = ?", [email]);
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 3600 * 1000 });
  res.json({ ok: true });
});
router.get("/me", requireAuth, (req, res) => {
  res.json({ email: req.user.email, googleConnected: !!req.user.google_refresh_token });
});
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});
router.get("/google", requireAuth, (req, res) => {
  const state = jwt.sign({ id: req.user.id, purpose: "google-connect" }, process.env.JWT_SECRET, {
    expiresIn: "10m",
  });
  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", 
    scope: SCOPES,
    state,
  });
  res.redirect(url);
});
router.get("/google/callback", async (req, res) => {
  const dashboard = `${process.env.FRONTEND_URL}/dashboard`;
  try {
    if (req.query.error) throw new Error(`Google returned: ${req.query.error}`);
    const payload = jwt.verify(String(req.query.state), process.env.JWT_SECRET);
    if (payload.purpose !== "google-connect") throw new Error("bad state");
    const user = await one("SELECT * FROM users WHERE id = ?", [payload.id]);
    if (!user) throw new Error("no user");
    const { tokens } = await oauthClient().getToken(String(req.query.code));
    if (tokens.refresh_token) {
      await run("UPDATE users SET google_refresh_token = ? WHERE id = ?", [tokens.refresh_token, user.id]);
    }
    res.redirect(dashboard);
  } catch (err) {
    console.error("google callback failed:", err.message);
    res.redirect(`${dashboard}?error=google`);
  }
});
export default router;
