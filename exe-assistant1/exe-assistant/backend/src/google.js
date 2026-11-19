import { google } from "googleapis";
import { one, run } from "./db.js";
import { classifyEmail } from "./ai.js";
export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify", 
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
];
export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}
function clientFor(user) {
  const client = oauthClient();
  client.setCredentials({ refresh_token: user.google_refresh_token });
  return client;
}
function decode(data = "") {
  return Buffer.from(data, "base64url").toString("utf8");
}
function findBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decode(payload.body.data);
  for (const part of payload.parts || []) {
    const text = findBody(part);
    if (text) return text;
  }
  return payload.body?.data ? decode(payload.body.data) : "";
}
const header = (msg, name) =>
  msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
export async function syncInbox(user) {
  const gmail = google.gmail({ version: "v1", auth: clientFor(user) });
  const list = await gmail.users.messages.list({
    userId: "me",
    q: "in:inbox newer_than:2d",
    maxResults: 20,
  });
  let added = 0;
  for (const { id } of list.data.messages || []) {
    if (await one("SELECT 1 FROM emails WHERE id = ?", [id])) continue;
    const { data: msg } = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const mail = {
      from_addr: header(msg, "From"),
      subject: header(msg, "Subject") || "(no subject)",
      body: findBody(msg.payload) || msg.snippet || "",
    };
    const { priority, summary } = await classifyEmail(mail);
    await run(
      `INSERT INTO emails
        (id, user_id, thread_id, message_id, from_addr, subject, body, summary, priority, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, user.id, msg.threadId, header(msg, "Message-ID"),
        mail.from_addr.slice(0, 500), mail.subject.slice(0, 900), mail.body, summary, priority,
        Number(msg.internalDate),
      ]
    );
    added++;
  }
  return added;
}
export async function sendReply(user, email, text) {
  const gmail = google.gmail({ version: "v1", auth: clientFor(user) });
  const subject = /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`;
  const raw = [
    `To: ${email.from_addr}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `In-Reply-To: ${email.message_id}`,
    `References: ${email.message_id}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ].join("\r\n");
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: Buffer.from(raw).toString("base64url"), threadId: email.thread_id },
  });
  await run("UPDATE emails SET replied = 1 WHERE id = ?", [email.id]);
}
export async function listEvents(user) {
  const calendar = google.calendar({ version: "v3", auth: clientFor(user) });
  const { data } = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  });
  return (data.items || []).map((e) => ({
    id: e.id,
    title: e.summary || "(no title)",
    start: e.start.dateTime || e.start.date,
    end: e.end.dateTime || e.end.date,
  }));
}
export async function createEvent(user, { title, start, end }) {
  const calendar = google.calendar({ version: "v3", auth: clientFor(user) });
  const { data } = await calendar.events.insert({
    calendarId: "primary",
    requestBody: { summary: title, start: { dateTime: start }, end: { dateTime: end } },
  });
  return data;
}
