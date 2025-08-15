'use strict';

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

// ---- Normalizer: rend les clés homogènes quel que soit l'endpoint ----
function normalizeAttraction(item = {}) {
  return {
    // champs de base (avec fallbacks)
    name: item.name ?? item.attractionName ?? item.locationName ?? 'Unknown',
    cityName: item.cityName ?? item.city ?? item.town ?? 'Unknown',
    countryName: item.countryName ?? item.country,
    description: item.description ?? item.details ?? item.summary,

    // reste des métadonnées
    entryFre: item.entryFre ?? item.entryFee ?? item.price,
    guideToursAvailable: item.guideToursAvailable ?? item.guidedTours ?? item.toursAvailable,
    protectedArea: item.protectedArea ?? item.isProtected,
    style: item.style,
    yearBuild: item.yearBuild ?? item.yearBuilt ?? item.builtYear,
    latitude: item.latitude ?? item.lat,
    longitude: item.longitude ?? item.lng,
    imageUrls: item.imageUrls ?? item.images ?? item.photos,

    // brut pour debug
    _raw: item,
  };
}

// ---- Formatters ----
function defaultFormatter(icon, item) {
  const name = item?.name ?? 'Unknown';
  const city = item?.cityName ? ` (${item.cityName})` : '';
  return `${icon} ${name}${city}`;
}

function formatFullAttraction(icon, item) {
  const it = normalizeAttraction(item); // safety: même si on oublie de normaliser avant
  let details = `${icon} ${it.name}`;

  if (it.cityName) details += `\n🏙️ City: ${it.cityName}`;
  if (it.countryName) details += `\n🌍 Country: ${it.countryName}`;
  if (it.description) details += `\nℹ️ Description: ${it.description}`;
  if (it.entryFre !== undefined) details += `\n💵 Entry Fee: ${it.entryFre}`;
  if (it.guideToursAvailable !== undefined) {
    details += `\n🗺️ Guided Tours: ${it.guideToursAvailable ? 'Yes' : 'No'}`;
  }
  if (it.protectedArea !== undefined) {
    details += `\n🌿 Protected Area: ${it.protectedArea ? 'Yes' : 'No'}`;
  }
  if (it.style) details += `\n🏛️ Style: ${it.style}`;
  if (it.yearBuild) details += `\n📅 Year Built: ${it.yearBuild}`;
  if (it.latitude && it.longitude) {
    details += `\n📍 Coordinates: ${it.latitude}, ${it.longitude}`;
  }
  if (Array.isArray(it.imageUrls) && it.imageUrls.length > 0) {
    details += `\n🖼️ Images: ${it.imageUrls.join(', ')}`;
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
    url: '/getLocationByName', // + /{name}
    icon: '📍',
    intro: 'Here are the full details for this attraction:',
    empty: "Sorry, I couldn't find details for this attraction.",
    formatter: formatFullAttraction,
  },
  Ask_Attraction_ByCity: {
    url: '/getLocationByCity', // + /{cityName}
    icon: '🏙️',
    intro: 'Here are the attractions in this city:',
    empty: "I couldn't find attractions for this city.",
    // Formatter simple mais tolérant
    formatter: (icon, item) => {
      const it = normalizeAttraction(item);
      const name = it.name ?? 'Unknown';
      const city = it.cityName ?? 'Unknown';
      return `${icon} ${name} (${city})`;
    },
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

  // Appel API + logs de debug
  const { data: items } = await api.get(url);
  console.log(`${intentName} url:`, url);
  console.log(`${intentName} sample item:`, Array.isArray(items) ? items[0] : items);

  // Pas de résultats
  if (!items || (Array.isArray(items) && items.length === 0)) {
    return empty;
  }

  // Normalisation systématique avant formatage
  const rawArray = Array.isArray(items) ? items : [items];
  const itemsArray = rawArray.map(normalizeAttraction);

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
