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
// SEND DOCUMENT (ICS)
// -----------------------------
async function sendDocument(chatId, filePath) {
  if (!fs.existsSync(filePath)) {
    console.error("❌ ICS file not found:", filePath);
    return;
  }

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", fs.createReadStream(filePath));

  return axios.post(`${TELEGRAM_API}/sendDocument`, formData, {
    headers: formData.getHeaders()
  });
}

// -----------------------------
// ICS GENERATOR
// -----------------------------
function addEventToCalendar(order) {
  const filePath = "/tmp/taxi-goral.ics"; // Render-safe path

  const event = `
BEGIN:VEVENT
UID:${order.id}@taxigoral
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(order.start)}
DTEND:${formatDate(order.end)}
SUMMARY:Taxi Goral – jazda
DESCRIPTION:Vyzdvihnutie: ${order.from}\\nCieľ: ${order.to}\\nCena: ${order.price} €
LOCATION:${order.from}
END:VEVENT
`;

  let calendar;

  if (fs.existsSync(filePath)) {
    calendar = fs.readFileSync(filePath, "utf8");
    calendar = calendar.replace("END:VCALENDAR", event + "END:VCALENDAR");
  } else {
    calendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Taxi Goral//EN
${event}END:VCALENDAR`;
  }

  fs.writeFileSync(filePath, calendar
