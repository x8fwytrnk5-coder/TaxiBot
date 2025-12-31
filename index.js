import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

// Tvoj token
const TOKEN = "8447861013:AAFtQh4cYuO63j8jYaEfA6Cx74Xeu5FrTp4";
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// Sem sme doplnili tvoje chat ID
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
    await sendMessage(chatId, "Kedy chceš jazdu? Napíš *čas* (napr. 14:30).");
    session.step = 3;
    return res.sendStatus(200);
  }

  // KROK 3
  if (session.step === 3) {
    session.data.time = text;

    const summary = `
📦 *Nová objednávka jazdy*
📍 Odkiaľ: ${session.data.from}
🎯 Kam: ${session.data.to}
⏰ Čas: ${session.data.time}
    `;

    // Potvrdenie zákazníkovi
    await sendMessage(chatId, "Ďakujem, jazda bola prijatá! 🚖");
    await sendMessage(chatId, summary);

    // Notifikácia adminovi (tebe)
    await sendMessage(
      ADMIN_CHAT_ID,
      `🔔 *Nová objednávka od zákazníka*\n${summary}\n\n👤 Chat ID zákazníka: \`${chatId}\``
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
