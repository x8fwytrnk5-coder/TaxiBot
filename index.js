import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";

const app = express();
app.use(bodyParser.json());

// Telegram token
const TOKEN = "8447861013:AAFtQh4cYuO63j8jYaEfA6Cx74Xeu5FrTp4";
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// Admin chat ID
const ADMIN_CHAT_ID = 7646102788;

// Session storage
const sessions = {};

// Uložené objednávky (pre kontrolu kolízií)
const orders = [];

// -----------------------------
// SEND MESSAGE
// -----------------------------
function sendMessage(chatId, text) {
  return axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  });
}

// -----------------------------
// SEND DOCUMENT (ICS) – s opakovaním
// -----------------------------
async function sendDocument(chatId, filePath) {
  if (!fs.existsSync(filePath)) {
    console.error("❌ ICS file not found:", filePath);
    return;
  }

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", fs.createReadStream(filePath));

  // Prvý pokus
  try {
    await axios.post(`${TELEGRAM_API}/sendDocument`, formData, {
      headers: formData.getHeaders()
    });
    return;
  } catch (err) {
    console.error("⚠️ Prvý pokus o odoslanie ICS zlyhal, skúšam znova...");
  }

  // Druhý pokus po 1 sekunde
  await new Promise(r => setTimeout(r, 1000));

  try {
    await axios.post(`${TELEGRAM_API}/sendDocument`, formData, {
      headers: formData.getHeaders()
    });
    return;
  } catch (err) {
    console.error("❌ Druhý pokus o odoslanie ICS zlyhal.");
    await sendMessage(ADMIN_CHAT_ID, "❗ Nepodarilo sa odoslať ICS súbor k novej objednávke.");
  }
}

// -----------------------------
// ICS GENERATOR (SAFE VERSION)
// -----------------------------
function addEventToCalendar(order) {
  const filePath = "/tmp/taxi-goral.ics"; // Render-safe path

  const eventLines = [
    "BEGIN:VEVENT",
    `UID:${order.id}@taxigoral`,
    `DTSTAMP:${formatDate(new Date())}`,
    `DTSTART:${formatDate(order.start)}`,
    `DTEND:${formatDate(order.end)}`,
    "SUMMARY:Taxi Goral – jazda",
    `DESCRIPTION:Vyzdvihnutie: ${order.from}\\nCieľ: ${order.to}\\nCena: ${order.price} €`,
    `LOCATION:${order.from}`,
    "END:VEVENT"
  ];

  const event = eventLines.join("\n");

  let calendar;

  if (fs.existsSync(filePath)) {
    calendar = fs.readFileSync(filePath, "utf8");
    calendar = calendar.replace("END:VCALENDAR", event + "\nEND:VCALENDAR");
  } else {
    calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Taxi Goral//EN",
      event,
      "END:VCALENDAR"
    ].join("\n");
  }

  fs.writeFileSync(filePath, calendar, "utf8");
  return filePath;
}

function formatDate(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// -----------------------------
// DATE PARSER
// -----------------------------
function parseDate(input) {
  const lower = input.toLowerCase();

  if (lower === "dnes") {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }

  if (lower === "zajtra") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  if (input.includes(".")) {
    const parts = input.split(".");
    if (parts.length === 3) {
      const [day, month, year] = parts.map(p => p.trim());
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  if (input.includes("-")) return input;

  return null;
}

// -----------------------------
// TELEGRAM WEBHOOK
// -----------------------------
app.post("/webhook", async (req, res) => {
  const msg = req.body.message;
  if (!msg || !msg.text) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === "/id") {
    await sendMessage(chatId, `Tvoje chat ID je: \`${chatId}\``);
    return res.sendStatus(200);
  }

  if (!sessions[chatId]) {
    sessions[chatId] = { step: 0, data: {} };
  }

  const session = sessions[chatId];

  // KROK 0
  if (session.step === 0) {
    await sendMessage(chatId, "Vitaj v *Taxi Goral* 🚖\nNapíš prosím *adresu vyzdvihnutia*.");
    session.step = 1;
    return res.sendStatus(200);
  }

  // KROK 1
  if (session.step === 1) {
    session.data.from = text;
    await sendMessage(chatId, "Super. Teraz napíš *cieľ jazdy*.");
    session.step = 2;
    return res.sendStatus(200);
  }

  // KROK 2
  if (session.step === 2) {
    session.data.to = text;
    await sendMessage(chatId, "Na ktorý *deň* chceš jazdu?");
    session.step = 3;
    return res.sendStatus(200);
  }

  // KROK 3
  if (session.step === 3) {
    const parsed = parseDate(text);
    if (!parsed) {
      await sendMessage(chatId, "Nerozumiem dátumu.");
      return res.sendStatus(200);
    }

    session.data.date = parsed;
    await sendMessage(chatId, "Napíš *čas jazdy* (napr. 14:30).");
    session.step = 4;
    return res.sendStatus(200);
  }

  // KROK 4
  if (session.step === 4) {
    session.data.time = text;

    const [h, m] = text.split(":");
    const start = new Date(`${session.data.date}T${h}:${m}:00`);
    const end = new Date(start.getTime() + 20 * 60000);

    session.data.start = start;
    session.data.end = end;

    await sendMessage(chatId, "Aké je tvoje *telefónne číslo*?");
    session.step = 5;
    return res.sendStatus(200);
  }

  // KROK 5 — dokončenie
  if (session.step === 5) {
    session.data.phone = text;

    const price = "7.80"; // tvoja fixná cena

    // -----------------------------
    // KONTROLA KOLÍZIE
    // -----------------------------
    const newStart = session.data.start;
    const newEnd = session.data.end;

    const conflict = orders.some(o =>
      (newStart >= o.start && newStart < o.end) ||
      (newEnd > o.start && newEnd <= o.end) ||
      (newStart <= o.start && newEnd >= o.end)
    );

    if (conflict) {
      await sendMessage(chatId, "❗ Tento termín je už obsadený. Vyber prosím iný čas.");
      delete sessions[chatId];
      return res.sendStatus(200);
    }

    // -----------------------------
    // ULOŽENIE OBJEDNÁVKY
    // -----------------------------
    orders.push({
      start: session.data.start,
      end: session.data.end,
      from: session.data.from,
      to: session.data.to,
      phone: session.data.phone,
      price
    });

    // -----------------------------
    // ZÁKAZNÍK – rekapitulácia BEZ ceny
    // -----------------------------
    const customerSummary = [
      "📦 *Vaša objednávka bola prijatá*",
      `📍 Odkiaľ: ${session.data.from}`,
      `🎯 Kam: ${session.data.to}`,
      `📅 Dátum: ${session.data.date}`,
      `⏰ Čas: ${session.data.time}`,
      `📞 Telefón: ${session.data.phone}`,
      "",
      "Cena Vašej jazdy bude uvedená v potvrdzujúcej správe na Vaše telefónne číslo."
    ].join("\n");

    await sendMessage(chatId, customerSummary);

    // -----------------------------
    // ADMIN – plná správa S cenou
    // -----------------------------
    const adminSummary = [
      "📦 *Nová objednávka jazdy*",
      `📍 Odkiaľ: ${session.data.from}`,
      `🎯 Kam: ${session.data.to}`,
      `📅 Dátum: ${session.data.date}`,
      `⏰ Čas: ${session.data.time}`,
      `📞 Telefón: ${session.data.phone}`,
      `💶 Cena: ${price} €`
    ].join("\n");

    await sendMessage(ADMIN_CHAT_ID, adminSummary);

    // ICS event
    const filePath = addEventToCalendar({
      id: Date.now(),
      from: session.data.from,
      to: session.data.to,
      start: session.data.start,
      end: session.data.end,
      price
    });

    await sendDocument(ADMIN_CHAT_ID, filePath);

    delete sessions[chatId];
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// -----------------------------
// PUBLIC ICS ENDPOINT
// -----------------------------
app.get("/calendar.ics", (req, res) => {
  const filePath = "/tmp/taxi-goral.ics";

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Calendar not found");
  }

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", "inline; filename=taxi-goral.ics");

  const data = fs.readFileSync(filePath, "utf8");
  res.send(data);
});

// -----------------------------
// HEALTHCHECK
// -----------------------------
app.get("/", (req, res) => {
  res.send("TaxiGoralBot beží.");
});

// Render PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server beží na porte ${PORT}`));
