// server.js — version minimale "All Attractions" uniquement

// ---------------------- Imports & Setup ----------------------
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ---------------------- Config API ----------------------
const BASE_URL = 'https://touristeproject.onrender.com/api/public';
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// ---------------------- Formatters ----------------------
function defaultFormatter(icon, item) {
  const city = item.cityName ? ` (${item.cityName})` : '';
  return `${icon} ${item.name}${city}`;
}

function buildReply({ intro, icon, items, formatter }) {
  const fmt = formatter || defaultFormatter;
  const list = items.map((i) => fmt(icon, i)).join('\n\n');
  return `${intro}\n${list}`;
}

// ---------------------- Intents (All Attractions uniquement) ----------------------
const intentConfig = {
  Ask_All_Attractions: {
    url: '/getAll/Attraction',
    icon: '🌟',
    intro: 'Discover the best attractions around! Here are some of the top spots:',
    empty: "Sorry, I couldn't find any attractions for you.",
    formatter: defaultFormatter,
  },
};

// ---------------------- Handler générique (réduit) ----------------------
async function handleIntent(intentName) {
  const config = intentConfig[intentName];
  if (!config) {
    return "Sorry, I didn't understand your request.";
  }

  const { url, icon, intro, formatter, empty } = config;

  try {
    const { data } = await api.get(url);
    const arr = Array.isArray(data) ? data : [data];
    if (!arr?.length) return empty;
    return buildReply({ intro, icon, items: arr, formatter });
  } catch (e) {
    console.error('Fetch error:', e?.message);
    return 'Oops, something went wrong while fetching information. Please try again later!';
  }
}

// ---------------------- Webhook ----------------------
app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body?.queryResult?.intent?.displayName;

    if (!intentName) {
      return res.json({ fulfillmentText: "Sorry, I didn't understand your request." });
    }

    const reply = await handleIntent(intentName);

    return res.json({
      fulfillmentText: reply,
      fulfillmentMessages: [{ text: { text: [reply] } }],
    });
  } catch (error) {
    console.error('Webhook error:', error?.message);
    return res.json({
      fulfillmentText: 'Oops, something went wrong while fetching information. Please try again later!',
    });
  }
});

// ---------------------- Health Route ----------------------
app.get('/', (_req, res) => res.send('OK'));

// ---------------------- Lancement ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook is running on http://localhost:${PORT}`);
});
