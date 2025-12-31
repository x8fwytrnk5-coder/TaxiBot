const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// TODO: Sem nechaj tvoj token
const TOKEN = "8447861013:AAFtQh4cYuO63j8jYaEfA6Cx74Xeu5FrTp4";
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// TODO: Sem doplníš svoje chat ID, keď ho zistíš cez /id
const ADMIN_CHAT_ID = 123456789;

// Dočasné úložisko session pre objednávky (v pamäti)
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
  if (!msg || !msg.text) {
    return res.sendStatus(200);
  }

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // ŠPECIÁLNY PRÍKAZ: zisti moje chat ID
  if (text === "/id") {
    await sendMessage(chatId, `Tvoje chat ID je: \`${chatId}\``);
    return res.sendStatus(200);
  }

  // Ak nemáme session pre daný chat, vytvoríme novú
  if (!sessions[chatId]) {
    sessions[chatId] = { step: 0, data: {} };
  }

  const session = sessions[chatId];

  // KROK 0 – Začiatok objednávky
  if (session.step === 0) {
    await sendMessage(
      chatId,
      "Vitaj v *Taxi Goral* 🚖\nNapíš prosím *adresu vyzdvihnutia*."
    );
    session.step = 1;
    return res.sendStatus(200);
  }

  // KROK 1 – Adresa vyzdvihnutia
  if (session.step === 1) {
    session.data.from = text;
    await sendMessage(chatId, "Super. Teraz napíš *cieľ jazdy*.");
    session.step = 2;
    return res.sendStatus(200);
  }

  // KROK 2 – Cieľ jazdy
  if (session.step === 2) {
    session.data.to = text;
    await sendMessage(
      chatId,
      "Kedy chceš jazdu? Napíš *čas* (napr. 14:30 alebo \"čo najskôr\")."
    );
    session.step = 3;
    return res.sendStatus(200);
  }

  // KROK 3 – Čas jazdy
  if (session.step === 3) {
    session.data.time = text;

    const summary =
      `📦 *Nová objednávka jazdy*\n` +
      `📍 Odkiaľ: ${session.data.from}\n` +
      `🎯 Kam: ${session.data.to}\n` +
      `⏰ Čas: ${session.data.time}`;

    // Potvrdenie zákazníkovi
    await sendMessage(chatId, "Ďakujem, jazda bola prijatá! 🚖");
    await sendMessage(chatId, summary);

    // Notifikácia adminovi (tebe), ak je ADMIN_CHAT_ID nastavené
    if (ADMIN_CHAT_ID && ADMIN_CHAT_ID !== 123456789) {
      await sendMessage(
        ADMIN_CHAT_ID,
        `🔔 *Nová objednávka od zákazníka*\n\n${summary}\n\n👤 Chat ID zákazníka: \`${chatId}\``
      );
    }

    // Reset session pre tento chat
    delete sessions[chatId];

    return res.sendStatus(200);
  }

  // Fallback – ak by sa čokoľvek pokazilo
  await sendMessage(
    chatId,
    "Prepáč, niečo sa pokazilo. Skúsme to odznova – napíš prosím *adresu vyzdvihnutia*."
  );
  sessions[chatId] = { step: 1, data: {} };
  return res.sendStatus(200);
});

// Jednoduchý healthcheck
app.get("/", (req, res) => {
  res.send("TaxiGoralBot beží.");
});

// Render používa PORT z prostredia, nie pevne 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server beží na porte ${PORT}`);
});
