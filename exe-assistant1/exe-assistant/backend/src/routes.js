import { Router } from "express";
import { all, one } from "./db.js";
import { requireAuth } from "./auth.js";
import { understandChat } from "./ai.js";
import { syncInbox, sendReply, listEvents, createEvent } from "./google.js";
const router = Router();
router.use(requireAuth);
const needGoogle = (req, res, next) =>
  req.user.google_refresh_token ? next() : res.status(400).json({ error: "Connect Google first" });
router.get("/mail", async (req, res) => {
  const { priority } = req.query; // high | mid | low (optional)
  const rows = ["high", "mid", "low"].includes(priority)
    ? await all("SELECT * FROM emails WHERE user_id = ? AND priority = ? ORDER BY received_at DESC LIMIT 50", [req.user.id, priority])
    : await all("SELECT * FROM emails WHERE user_id = ? ORDER BY received_at DESC LIMIT 50", [req.user.id]);
  res.json(rows);
});
router.post("/mail/sync", needGoogle, async (req, res) => {
  try {
    res.json({ added: await syncInbox(req.user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post("/mail/:id/reply", needGoogle, async (req, res) => {
  const email = await one("SELECT * FROM emails WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!email) return res.status(404).json({ error: "Mail not found" });
  try {
    await sendReply(req.user, email, req.body.text);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get("/calendar", needGoogle, async (req, res) => {
  try {
    res.json(await listEvents(req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post("/chat", needGoogle, async (req, res) => {
  try {
    const recent = await all("SELECT id, from_addr, subject, priority, summary FROM emails WHERE user_id = ? ORDER BY received_at DESC LIMIT 15", [req.user.id]);
    const intent = await understandChat(req.body.message, recent);
    if (intent.action === "reply") {
      const email = await one("SELECT * FROM emails WHERE id = ? AND user_id = ?", [intent.mail_id, req.user.id]);
      if (!email) return res.json({ reply: "I couldn't find that email. Which one do you mean?" });
      await sendReply(req.user, email, intent.body);
      return res.json({ reply: `Sent to ${email.from_addr}:\n\n${intent.body}` });
    }
    if (intent.action === "create_event") {
      await createEvent(req.user, intent);
      return res.json({ reply: `Added "${intent.title}" to your calendar.`, refreshCalendar: true });
    }
    if (intent.action === "list_events") {
      const events = await listEvents(req.user);
      const text = events.length
        ? events.map((e) => `• ${e.title} (${new Date(e.start).toLocaleString()})`).join("\n")
        : "Nothing coming up.";
      return res.json({ reply: text });
    }
    res.json({ reply: intent.text || "Sorry, I didn't get that." });
  } catch (err) {
    console.error("chat failed:", err.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});
export default router;
