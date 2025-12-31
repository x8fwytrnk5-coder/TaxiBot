import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import fs from "fs";

const app = express();
app.use(bodyParser.json());

// Token
const TOKEN = "8447861013:AAFtQh4cYuO63j8jYaEfA6Cx74Xeu5FrTp4";
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// Admin ID
const ADMIN_CHAT_ID = 7646102788;

// Načítanie datasetu
const streets = JSON.parse(fs.readFileSync("streets-bb.json", "utf8"));

// Session storage
const sessions = {};

// Odstránenie diakritiky
function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Fuzzy search
function searchStreets(query) {
  const q = normalize(query);
  return streets
    .filter(s => normalize(s.street).includes(q))
    .slice(0, 5);
}

// Odoslanie správy
function sendMessage(chatId, text, extra = {}) {
  return axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    ...extra
  });
}

// Inline návrhy
function sendSuggestions(chatId, list, step) {
  return sendMessage(chatId, "Vyber adresu:", {
    reply_markup: {
      inline_keyboard: list.map(item => [
        {
          text: `${item.street}, ${item.city}`,
          callback_data: JSON.stringify({
            action: "select_address",
            street: item.street,
            city: item.city,
            step
          })
        }
      ])
    }
  });
}

app.post("/webhook", async (req, res) => {
  const msg = req.body.message;
  const callback = req.body.callback_query;

  // CALLBACK – výber adresy
  if (callback) {
    const data = JSON.parse(callback.data);
    const chatId = callback.message.chat.id;

    if (data.action === "select_address") {
      const session = sessions[chatId];
      if (!session) return res.sendStatus(200);

      if (data.step === 1) session.data.from = data.street;
      if (data.step === 2) session.data.to = data.street;

      await sendMessage(chatId, `Vybrané: *${data.street}*`);

      if (data.step === 1) {
        session.step = 2;
        await sendMessage(chatId, "Teraz napíš *cieľ jazdy*.");
      } else if (data.step === 2) {
        session.step = 3;
        await sendMessage(chatId, "Kedy chceš jazdu? Napíš *čas* (napr. 14:30).");
      }

      return res.sendStatus(200);
    }
  }

  // TEXT MESSAGE
  if (!msg || !msg.text) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // /id
  if (text === "/id") {
    await sendMessage(chatId, `Tvoje chat ID je: \`${chatId}\``);
    return res.sendStatus(200);
  }

  // Inicializácia session
  if (!sessions[chatId]) {
    sessions[chatId] = { step: 0, data: {} };
  }

  const session = sessions[chatId];

  // KROK 0 – uvítanie
  if (session.step === 0) {
    await sendMessage(chatId, "Vitaj v *Taxi Goral* 🚖\nNapíš *adresu vyzdvihnutia*.");
    session.step = 1;
    return res.sendStatus(200);
  }

  // KROK 1 – našeptávanie FROM
  if (session.step === 1) {
    const results = searchStreets(text);

    if (results.length === 1) {
      session.data.from = results[0].street;
      await sendMessage(chatId, `Vybrané: *${results[0].street}*`);
      session.step = 2;
      await sendMessage(chatId, "Teraz napíš *cieľ jazdy*.");
      return res.sendStatus(200);
    }

    if (results.length > 1) {
      return sendSuggestions(chatId, results, 1);
    }

    await sendMessage(chatId, "Nenašiel som adresu. Skús napísať časť názvu.");
    return res.sendStatus(200);
  }

  // KROK 2 – našeptávanie TO
  if (session.step === 2) {
    const results = searchStreets(text);

    if (results.length === 1) {
      session.data.to = results[0].street;
      await sendMessage(chatId, `Vybrané: *${results[0].street}*`);
      session.step = 3;
      await sendMessage(chatId, "Kedy chceš jazdu? Napíš *čas* (napr. 14:30).");
      return res.sendStatus(200);
    }

    if (results.length > 1) {
      return sendSuggestions(chatId, results, 2);
    }

    await sendMessage(chatId, "Nenašiel som adresu. Skús napísať časť názvu.");
    return res.sendStatus(200);
  }

  // KROK 3 – čas
  if (session.step === 3) {
    session.data.time = text;
    await sendMessage(chatId, "Aké je tvoje *telefónne číslo*? 📞");
    session.step = 4;
    return res.sendStatus(200);
  }

  // KROK 4 – telefón
  if (session.step === 4) {
    session.data.phone = text;

    const summary = `
📦 *Nová objednávka jazdy*
📍 Odkiaľ: ${session.data.from}
🎯 Kam: ${session.data.to}
⏰ Čas: ${session.data.time}
📞 Telefón: ${session.data.phone}
    `;

    await sendMessage(chatId, "Ďakujem, jazda bola prijatá! 🚖");
    await sendMessage(chatId, summary);

    await sendMessage(
      ADMIN_CHAT_ID,
      `🔔 *Nová objednávka od zákazníka*\n${summary}\n👤 Chat ID: \`${chatId}\``
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
