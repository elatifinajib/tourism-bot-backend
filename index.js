

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ---- Config API ----
const BASE_URL = 'https://touristeproject.onrender.com/api/public';
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// ---- Formatters ----
function defaultFormatter(icon, item) {
  const city = item.cityName ? ` (${item.cityName})` : '';
  return `${icon} ${item.name}${city}`;
}

function formatFullAttraction(icon, item) {
  let details = `${icon} ${item.name}`;

  if (item.cityName) details += `\n🏙️ City: ${item.cityName}`;
  if (item.countryName) details += `\n🌍 Country: ${item.countryName}`;
  if (item.description) details += `\nℹ️ Description: ${item.description}`;
  if (item.entryFre !== undefined) details += `\n💵 Entry Fee: ${item.entryFre}`;
  if (item.guideToursAvailable !== undefined) {
    details += `\n🗺️ Guided Tours: ${item.guideToursAvailable ? 'Yes' : 'No'}`;
  }
  if (item.protectedArea !== undefined) {
    details += `\n🌿 Protected Area: ${item.protectedArea ? 'Yes' : 'No'}`;
  }
  if (item.style) details += `\n🏛️ Style: ${item.style}`;
  if (item.yearBuild) details += `\n📅 Year Built: ${item.yearBuild}`;
  if (item.latitude && item.longitude) {
    details += `\n📍 Coordinates: ${item.latitude}, ${item.longitude}`;
  }
  if (Array.isArray(item.imageUrls) && item.imageUrls.length > 0) {
    details += `\n🖼️ Images: ${item.imageUrls.join(', ')}`;
  }
  return details;
}

function buildReply({ intro, icon, items, formatter }) {
  const fmt = formatter || defaultFormatter;
  const list = items.map((i) => fmt(icon, i)).join('\n\n');
  return `${intro}\n${list}`;
}

// ---- Configuration des intents ----
const intentConfig = {
  // ----------- Attractions ----------- 
  Ask_All_Attractions: {
    url: '/getAll/Attraction',
    icon: '🌟',
    intro: 'Discover the best attractions around! Here are some of the top spots:',
    empty: "Sorry, I couldn't find any attractions for you.",
  },
  Ask_Natural_Attractions: {
    url: '/NaturalAttractions',
    icon: '🌿',
    intro: 'If you love nature, check out these amazing natural attractions:',
    empty: "I couldn't find any natural wonders for you.",
  },
  Ask_Historical_Attractions: {
    url: '/HistoricalAttractions',
    icon: '🏛️',
    intro: 'Step back in time and explore these incredible historical sites:',
    empty: "I couldn't find any historical attractions for you.",
  },
  Ask_Cultural_Attractions: {
    url: '/CulturalAttractions',
    icon: '🎭',
    intro: 'Immerse yourself in rich culture! Here are some of the best cultural attractions:',
    empty: "I couldn't find any cultural attractions for you.",
  },
  Ask_Artificial_Attractions: {
    url: '/ArtificialAttractions',
    icon: '🏙️',
    intro: 'Check out these stunning artificial wonders:',
    empty: "I couldn't find any artificial attractions for you.",
  },

  // ----------- Nouveaux intents ----------- 
  Ask_Attraction_ByName: {
    url: '/getLocationByName', // on ajoutera /{name}
    icon: '📍',
    intro: 'Here are the full details for this attraction:',
    empty: "Sorry, I couldn't find details for this attraction.",
    formatter: formatFullAttraction,
  },
  Ask_Attraction_ByCity: {
    url: '/getLocationByCity', // on ajoutera /{cityName}
    icon: '🏙️',
    intro: 'Here are the attractions in this city:',
    empty: "I couldn't find attractions for this city.",
    formatter: (icon, item) => `${icon} ${item.name} (${item.cityName})`,
  },
};

// ---- Fonction générique ----
async function handleIntent(intentName, parameters) {
  const config = intentConfig[intentName];
  if (!config) return null;

  let { url, icon, intro, empty, formatter } = config;

  // Cas particulier: ajout de paramètres dynamiques
  if (intentName === 'Ask_Attraction_ByName') {
    const name = parameters?.name;
    if (!name) return "Please tell me the name of the attraction.";
    url = `${url}/${encodeURIComponent(name)}`;
  }

  if (intentName === 'Ask_Attraction_ByCity') {
    const cityName = parameters?.cityName;
    if (!cityName) return "Please tell me the city name.";
    url = `${url}/${encodeURIComponent(cityName)}`;
  }

  const { data: items } = await api.get(url);

  if (!items || (Array.isArray(items) && items.length === 0)) {
    return empty;
  }

  const itemsArray = Array.isArray(items) ? items : [items];
  return buildReply({ intro, icon, items: itemsArray, formatter });
}

// ---- Webhook ----
app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body?.queryResult?.intent?.displayName;
    const parameters = req.body?.queryResult?.parameters;

    if (!intentName) {
      return res.json({ fulfillmentText: "Sorry, I didn't understand your request." });
    }

    const reply = await handleIntent(intentName, parameters);

    if (!reply) {
      return res.json({ fulfillmentText: "Sorry, I didn't understand your request." });
    }

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

// Route santé
app.get('/', (_req, res) => res.send('OK'));

// ---- Lancement ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook is running on http://localhost:${PORT}`);
});
