// server.js
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

// ---- Helpers d'affichage ----
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

// ---- Détection attraction vs amenity ----
function isAttraction(item) {
  if (!item || typeof item !== 'object') return false;

  // Champs qui signalent une attraction
  const attractionFields = [
    'entryFre',
    'guideToursAvailable',
    'style',
    'protectedArea',
    'yearBuild',
  ];

  // Champs qui signalent un amenity (hôtel, etc.)
  const amenityFields = [
    'price',
    'openingHours',
    'numberStars',
    'numberOfRooms',
    'hasSwimmingPool',
    'available',
  ];

  const hasAttractionField = attractionFields.some((f) => item[f] !== undefined);
  const hasAmenityField = amenityFields.some((f) => item[f] !== undefined);

  if (hasAttractionField && !hasAmenityField) return true;
  if (!hasAttractionField && hasAmenityField) return false;

  // Ambigu : on exclut si présence de marqueurs amenity
  if (hasAmenityField && !hasAttractionField) return false;

  // Fallback : garder ce qui n'a pas l'air d'un amenity
  return !hasAmenityField;
}

// ---- Normalisation ville (insensible casse/accents) ----
function normalizeCity(str) {
  if (!str) return str;
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

  // ----------- Attraction par nom ----------- 
  Ask_Attraction_ByName: {
    url: '/getLocationByName', // + /{name}
    icon: '📍',
    intro: 'Here are the full details for this attraction:',
    empty: "Sorry, I couldn't find details for this attraction.",
    formatter: formatFullAttraction,
  },

  // ----------- NEW: Attractions par ville -----------
  Ask_Attraction_ByCity: {
    url: '/getLocationByCity', // + /{cityName}
    icon: '🌆',
    intro: 'Attractions in this city:',
    empty: "I couldn't find attractions in this city.",
    filter: (items) => items.filter(isAttraction),
    // formatter: formatFullAttraction, // décommente pour des fiches détaillées
  },
};

// ---- Fonction générique ----
async function handleIntent(intentName, parameters) {
  const config = intentConfig[intentName];
  if (!config) return null;

  let { url, icon, intro, empty, formatter, filter } = config;

  // --- Cas 1 : Détails par nom
  if (intentName === 'Ask_Attraction_ByName') {
    const name = parameters?.name;
    if (!name) return "Please tell me the name of the attraction.";
    url = `${url}/${encodeURIComponent(name)}`;
    try {
      const { data } = await api.get(url);
      if (!data) return empty;
      const itemsArray = Array.isArray(data) ? data : [data];
      return buildReply({ intro, icon, items: itemsArray, formatter });
    } catch (err) {
      console.error('API error (Ask_Attraction_ByName):', err?.message);
      return 'Oops, something went wrong while fetching information. Please try again later!';
    }
  }

  // --- Cas 2 : Attractions par ville (avec fallback casse/accents)
  if (intentName === 'Ask_Attraction_ByCity') {
    const originalCity = (parameters?.cityName || parameters?.name || '').toString().trim();
    if (!originalCity) return "Please tell me the city name.";

    const userIntro = `Discover top attractions in ${originalCity}:`;
    const userEmpty = `I couldn't find attractions in ${originalCity}.`;

    // 1) tentative telle quelle
    const url1 = `${url}/${encodeURIComponent(originalCity)}`;
    try {
      let { data } = await api.get(url1);
      let itemsArray = Array.isArray(data) ? data : (data ? [data] : []);
      if (typeof filter === 'function') itemsArray = filter(itemsArray);

      if (itemsArray.length > 0) {
        return buildReply({ intro: userIntro, icon, items: itemsArray, formatter });
      }

      // 2) tentative normalisée
      const normalized = normalizeCity(originalCity);
      const needsFallback = normalized && normalized !== originalCity.toLowerCase();
      if (needsFallback) {
        const url2 = `${url}/${encodeURIComponent(normalized)}`;
        const { data: data2 } = await api.get(url2);
        let itemsArray2 = Array.isArray(data2) ? data2 : (data2 ? [data2] : []);
        if (typeof filter === 'function') itemsArray2 = filter(itemsArray2);

        if (itemsArray2.length > 0) {
          return buildReply({ intro: userIntro, icon, items: itemsArray2, formatter });
        }
      }

      return userEmpty;
    } catch (err) {
      console.error('API error (Ask_Attraction_ByCity):', err?.message);
      return 'Oops, something went wrong while fetching information. Please try again later!';
    }
  }

  // --- Cas génériques (autres intents de liste)
  try {
    const { data } = await api.get(url);
    if (!data || (Array.isArray(data) && data.length === 0)) return empty;

    let itemsArray = Array.isArray(data) ? data : [data];
    if (typeof filter === 'function') itemsArray = filter(itemsArray);
    if (!itemsArray || itemsArray.length === 0) return empty;

    return buildReply({ intro, icon, items: itemsArray, formatter });
  } catch (err) {
    console.error('API error (generic):', err?.message);
    return 'Oops, something went wrong while fetching information. Please try again later!';
  }
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
