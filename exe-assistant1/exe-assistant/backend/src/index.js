import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initDb, all } from "./db.js";
import authRoutes from "./auth.js";
import apiRoutes from "./routes.js";
import { syncInbox } from "./google.js";
await initDb(); 
const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/auth", authRoutes);
app.use("/api", apiRoutes);
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
let syncing = false;
setInterval(async () => {
  if (syncing) return; 
  syncing = true;
  try {
    const users = await all("SELECT * FROM users WHERE google_refresh_token IS NOT NULL");
    for (const user of users) {
      try {
        const added = await syncInbox(user);
        if (added) console.log(`${user.email}: ${added} new mail(s)`);
      } catch (err) {
        console.error(`sync failed for ${user.email}:`, err.message);
      }
    }
  } finally {
    syncing = false;
  }
}, 30_000);
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
