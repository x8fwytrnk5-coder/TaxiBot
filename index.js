import express from "express";
import bodyParser from "body-parser";
import { twiml } from "twilio";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// jednoduchá pamäť pre každý hovor
let sessions = {};

app.post("/voice", (req, res) => {
  const callSid = req.body.CallSid;
  const speech = req.body.SpeechResult?.trim() || "";
  const step = sessions[callSid]?.step || 0;

  const response = new twiml.VoiceResponse();

  // 1. otázka – pickup
  if (step === 0) {
    sessions[callSid] = { step: 1 };
    response.gather({
      input: "speech",
      action: "/voice",
      speechTimeout: "auto",
      language: "sk-SK"
    }).say("Dobrý deň, kam vás máme vyzdvihnúť?");
  }

  // 2. otázka – dropoff
  else if (step === 1) {
    sessions[callSid].pickup = speech;
    sessions[callSid].step = 2;
    response.gather({
      input: "speech",
      action: "/voice",
      speechTimeout: "auto",
      language: "sk-SK"
    }).say("Ďakujem. A kam idete?");
  }

  // 3. otázka – čas jazdy
  else if (step === 2) {
    sessions[callSid].dropoff = speech;
    sessions[callSid].step = 3;
    response.gather({
      input: "speech",
      action: "/voice",
      speechTimeout: "auto",
      language: "sk-SK"
    }).say("Kedy chcete jazdu?");
  }

  // 4. potvrdenie
  else if (step === 3) {
    sessions[callSid].time = speech;
    sessions[callSid].step = 4;

    const { pickup, dropoff, time } = sessions[callSid];

    response.say(
      `Ďakujem. Vaša jazda je z ${pickup} do ${dropoff} o ${time}. Dispečer vás bude kontaktovať. Prajem pekný deň.`
    );

    // tu môžeš poslať SMS, uložiť do kalendára, webhook atď.
    console.log("Nová jazda:", sessions[callSid]);
  }

  res.type("text/xml");
  res.send(response.toString());
});

// Railway port
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Taxi bot beží na porte " + port));
