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
      const
