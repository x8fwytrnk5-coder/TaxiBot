import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

// Tvoj token
const TOKEN = "8447861013:AAFtQh4cYuO63j8jYaEfA6Cx74Xeu5FrTp4";
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// Tvoje admin chat ID
const ADMIN_CHAT_ID = 7646102788;

// Session storage
const sessions = {};

function sendMessage(chatId, text) {
  return axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  });
}

// Pomocná funkcia na spracovanie dátumu
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

  // Formát 1.2.2025
  if (input.includes(".")) {
    const parts = input.split(".");
    if (parts.length === 3) {
      const [day, month, year] = parts.map(p => p.trim());
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  // Formát 2025-02-01
  if (input.includes("-")) {
    return input;
  }

  return null;
}

app.post("/webhook", async (req, res) => {
  const msg = req.body.message;
  if (!msg || !msg.text) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // /id príkaz
  if (text === "/id") {
    await sendMessage(chatId, `Tvoje chat ID je: \`${chatId}\``);
    return res.sendStatus(200);
  }

  // Inicializácia session
  if (!sessions[chatId]) {
    sessions[chatId] = { step: 0, data: {} };
  }

  const session = sessions[chatId];

  // KROK 0 — uvítanie
  if (session.step === 0) {
    await sendMessage(chatId, "Vitaj v *Taxi Goral* 🚖\nNapíš prosím *adresu vyzdvihnutia*.");
    session.step = 1;
    return res.sendStatus(200);
  }

  // KROK 1 — adresa vyzdvihnutia
  if (session.step === 1) {
    session.data.from = text;
    await sendMessage(chatId, "Super. Teraz napíš *cieľ jazdy*.");
    session.step = 2;
    return res.sendStatus(200);
  }

  // KROK 2 — cieľ jazdy
  if (session.step === 2) {
    session.data.to = text;
    await sendMessage(chatId, "Na ktorý *deň* chceš jazdu? (napr. 2025-02-01, 1.2.2025, dnes, zajtra)");
    session.step = 3;
    return res.sendStatus(200);
  }

  // KROK 3 — dátum jazdy
  if (session.step === 3) {
    const parsed = parseDate(text);

    if (!parsed) {
      await sendMessage(chatId, "Nerozumiem dátumu. Skús napr. *2025-02-01* alebo *zajtra*.");
      return res.sendStatus(200);
    }

    session.data.date = parsed;
    await sendMessage(chatId, "A teraz napíš *čas jazdy* (napr. 14:30).");
    session.step = 4;
    return res.sendStatus(200);
  }

  // KROK 4 — čas jazdy
  if (session.step === 4) {
    session.data.time = text;

    // Spojenie dátumu + času
    const [h, m] = text.split(":");
    const fullISO = new Date(`${session.data.date}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`).toISOString();
    session.data.datetimeISO = fullISO;

    await sendMessage(chatId, "Aké je tvoje *telefónne číslo*? 📞");
    session.step = 5;
    return res.sendStatus(200);
  }

  // KROK 5 — telefónne číslo
  if (session.step === 5) {
    session.data.phone = text;

    const summary = `
📦 *Nová objednávka jazdy*
📍 Odkiaľ: ${session.data.from}
🎯 Kam: ${session.data.to}
📅 Dátum: ${session.data.date}
⏰ Čas: ${session.data.time}
📞 Telefón: ${session.data.phone}
    `;

    // Potvrdenie zákazníkovi
    await sendMessage(chatId, "Ďakujem, jazda bola prijatá! 🚖");
    await sendMessage(chatId, summary);

    // Notifikácia adminovi
    await sendMessage(
      ADMIN_CHAT_ID,
      `🔔 *Nová objednávka od zákazníka*\n${summary}\n\n👤 Chat ID zákazníka: \`${chatId}\`\n🕒 ISO: ${session.data.datetimeISO}`
    );

    delete sessions[chatId];
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// Healthcheck
app.get("/", (req, res) => {
  res.send("TaxiGoralBot beží.");
});

// Render PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server beží na porte ${PORT}`));
