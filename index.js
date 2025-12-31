import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

const TOKEN = "8447861013:AAFtQh4cYuO63j8jYaEfA6Cx74Xeu5FrTp4";
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const ADMIN_CHAT_ID = 123456789; // sem doplníme tvoje ID

// Dočasné úložisko objednávok
const sessions = {};

function sendMessage(chatId, text) {
  return axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
  });
}

app.post("/webhook", async (req, res) => {
  const msg = req.body.message;
  if (!msg || !msg.text) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const text = msg.text;

  // Ak nemáme session, vytvoríme
  if (!sessions[chatId]) {
    sessions[chatId] = { step: 0, data: {} };
  }

  const session = sessions[chatId];

  // KROK 0 – Začiatok objednávky
  if (session.step === 0) {
    await sendMessage(chatId, "Vitaj v Taxi Goral 🚖\nNapíš prosím *adresu vyzdvihnutia*.");
    session.step = 1;
    return res.sendStatus(200);
  }

  // KROK 1 – Adresa
  if (session.step === 1) {
    session.data.from = text;
    await sendMessage(chatId, "Super. Teraz napíš *cieľ jazdy*.");
    session.step = 2;
    return res.sendStatus(200);
  }

  // KROK 2 – Cieľ
  if (session.step === 2) {
    session.data.to = text;
    await sendMessage(chatId, "Kedy chceš jazdu? Napíš *čas* (napr. 14:30).");
    session.step = 3;
    return res.sendStatus(200);
  }

  // KROK 3 – Čas
  if (session.step === 3) {
    session.data.time = text;

    const summary = `
📦 *Nová objednávka jazdy*
📍 Odkiaľ: ${session.data.from}
🎯 Kam: ${session.data.to}
⏰ Čas: ${session.data.time}
    `;

    // Pošleme zákazníkovi potvrdenie
    await sendMessage(chatId, "Ďakujem, jazda bola prijatá! 🚖");
    await sendMessage(chatId, summary);

    // Pošleme adminovi (tebe)
    await sendMessage(ADMIN_CHAT_ID, `🔔 *Nová objednávka od zákazníka*\n${summary}`);

    // Reset session
    delete sessions[chatId];

    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("TaxiGoralBot beží.");
});

app.listen(3000, () => console.log("Server beží na porte 3000"));
