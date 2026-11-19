import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
async function askJson(system, user) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return JSON.parse(res.choices[0].message.content);
}
export async function classifyEmail({ from_addr, subject, body }) {
  const system = `You triage emails. Reply with JSON: {"priority":"high|mid|low","summary":"one short line"}.
high = needs action soon (deadlines, bosses, clients, payments, urgent, meetings).
mid = useful but not urgent (updates, questions that can wait).
low = newsletters, promotions, automated notifications.`;
  try {
    const out = await askJson(system, `From: ${from_addr}\nSubject: ${subject}\n\n${body.slice(0, 2000)}`);
    const priority = ["high", "mid", "low"].includes(out.priority) ? out.priority : "mid";
    return { priority, summary: out.summary || "" };
  } catch (err) {
    console.error("classify failed:", err.message);
    return { priority: "mid", summary: "" };
  }
}
export async function understandChat(message, recentEmails) {
  const system = `You are an email and calendar assistant. Today is ${new Date().toISOString()}.
Decide what the user wants and reply with JSON in one of these shapes:
{"action":"reply","mail_id":"<id from the list>","body":"the full reply text, written as the user"}
{"action":"create_event","title":"...","start":"ISO 8601","end":"ISO 8601"}
{"action":"list_events"}
{"action":"answer","text":"a short helpful answer"}
Use "reply" only when the user clearly wants to answer a specific email. If they say "the last mail" or "the urgent one", pick the matching id.
If you cannot tell which email, use "answer" and ask which one.
Recent emails:
${recentEmails.map((e) => `- id=${e.id} | from ${e.from_addr} | "${e.subject}" | ${e.priority} | ${e.summary}`).join("\n")}`;
  return askJson(system, message);
}
