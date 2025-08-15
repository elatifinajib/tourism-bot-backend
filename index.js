// server.js
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

// ---------------------- Helpers: normalisation & matching ----------------------
function removeDiacritics(str = '') {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Title Case robuste: espaces, tirets, apostrophes (ex: "saint-etienne" -> "Saint-Etienne")
function toTitleCaseWord(word = '') {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
function normalizeCityName(raw = '') {
  const s = String(raw).trim().toLowerCase();
  if (!s) return s;
  return s
    .split(' ')
    .map(part =>
      part
        .split('-')
        .map(seg =>
          seg
            .split("'")
            .map(sub => toTitleCaseWord(sub))
            .join("'")
        )
        .map(seg => toTitleCaseWord(seg))
        .join('-')
    )
    .join(' ');
}

// Comparaison ville: insensible casse + accents
function cityEquals(a = '', b = '') {
  return removeDiacritics(String(a).trim().toLowerCase()) ===
         removeDiacritics(String(b).trim().toLowerCase());
}

// Détecter une "attraction" (vs amenity) par présence de champs spécifiques
function isAttraction(item) {
  const hasEntryFre = Object.prototype.hasOwnProperty.call(item, 'entryFre');
  const hasGuideTours = Object.prototype.hasOwnProperty.call(item, 'guideToursAvailable');
  return hasEntryFre || hasGuideTours;
}

// Génère plusieurs variantes pour requêter l'endpoint sensible à la casse
function generateCityVariants(raw = '') {
  const norm = normalizeCityName(raw); // Title Case
  const low = norm.toLowerCase();
  const up = norm.toUpperCase();
  const uniq = Array.from(new Set([norm, low, up]));
  return uniq;
}

// Appel endpoint /getLocationByCity/{city} en essayant plusieurs variantes
async function fetchByCityWithVariants(cityRaw) {
  const variants = generateCityVariants(cityRaw);
  const results = [];
  const seen = new Set(); // dé-duplication par id ou (name|city)

  for (const v of variants) {
    try {
      const { data } = await api.get(`/getLocationByCity/${encodeURIComponent(v)}`);
      if (!data) continue;
      const arr = Array.isArray(data) ? data : [data];

      for (const item of arr) {
        const key = item?.id != null ? `id:${item.id}` : `nk:${item?.name || ''}|${item?.cityName || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(item);
        }
      }
    } catch (_err) {
      // on ignore et on tente la variante suivante
    }
  }

  return results;
}

// Fallback: fetch all attractions puis filtre localement par city (insensible à casse/accents)
async function fetchByCityFallbackScanning(cityRaw) {
  try {
    const { data } = await api.get('/getAll/Attraction');
    const arr = Array.isArray(data) ? data : [data];
    return arr.filter(item => cityEquals(item?.cityName || '', cityRaw));
  } catch (_err) {
    return [];
  }
}

// ---------------------- Configuration des intents ----------------------
const intentConfig = {
  // ----------- Attractions -----------
  Ask_All_Attractions: {
    url: '/getAll/Attraction',
    icon: '🌟',
    intro: 'Discover the best attractions around! Here are some of the top spots:',
    empty: "Sorry, I couldn't find any attractions for you.",
    formatter: defaultFormatter,
  },
  Ask_Natural_Attractions: {
    url: '/NaturalAttractions',
    icon: '🌿',
    intro: 'If you love nature, check out these amazing natural attractions:',
    empty: "I couldn't find any natural wonders for you.",
    formatter: defaultFormatter,
  },
  Ask_Historical_Attractions: {
    url: '/HistoricalAttractions',
    icon: '🏛️',
    intro: 'Step back in time and explore these incredible historical sites:',
    empty: "I couldn't find any historical attractions for you.",
    formatter: defaultFormatter,
  },
  Ask_Cultural_Attractions: {
    url: '/CulturalAttractions',
    icon: '🎭',
    intro: 'Immerse yourself in rich culture! Here are some of the best cultural attractions:',
    empty: "I couldn't find any cultural attractions for you.",
    formatter: defaultFormatter,
  },
  Ask_Artificial_Attractions: {
    url: '/ArtificialAttractions',
    icon: '🏙️',
    intro: 'Check out these stunning artificial wonders:',
    empty: "I couldn't find any artificial attractions for you.",
    formatter: defaultFormatter,
  },

  // ----------- Attraction par nom -----------
  Ask_Attraction_ByName: {
    url: '/getLocationByName', // + /{name}
    icon: '📍',
    intro: 'Here are the full details for this attraction:',
    empty: "Sorry, I couldn't find details for this attraction.",
    formatter: formatFullAttraction,
  },

  // ----------- Attraction par ville -----------
  Ask_Attraction_ByCity: {
    // on ne met pas la ville ici car on va appeler plusieurs variantes et fallback
    url: '/getLocationByCity',
    icon: '🌆',
    intro: (city) => `Here are the attractions in ${city}:`,
    empty: (city) => `Sorry, I couldn't find attractions in ${city}.`,
    formatter: defaultFormatter, // ou formatFullAttraction pour plus de détails
  },
};

// ---------------------- Fonction générique ----------------------
async function handleIntent(intentName, parameters) {
  const config = intentConfig[intentName];
  if (!config) return null;

  let { url, icon, intro, empty, formatter } = config;

  if (intentName === 'Ask_Attraction_ByName') {
    const name = (parameters?.name || '').toString().trim();
    if (!name) return 'Please tell me the name of the attraction.';
    url = `${url}/${encodeURIComponent(name)}`;

    try {
      const { data } = await api.get(url);
      if (!data) return empty;
      const itemsArray = Array.isArray(data) ? data : [data];
      if (!itemsArray.length) return empty;
      return buildReply({ intro, icon, items: itemsArray, formatter });
    } catch (error) {
      console.error('Fetch error:', error?.message);
      return 'Oops, something went wrong while fetching information. Please try again later!';
    }
  }

  if (intentName === 'Ask_Attraction_ByCity') {
    const rawCity = (parameters?.cityName || parameters?.name || '').toString().trim();
    if (!rawCity) return 'Please tell me the city name.';

    const normalizedCity = normalizeCityName(rawCity);
    if (typeof intro === 'function') intro = intro(normalizedCity);
    if (typeof empty === 'function') empty = empty(normalizedCity);

    try {
      // 1) Tentatives multi-variantes sur l'endpoint
      let items = await fetchByCityWithVariants(rawCity);

      // 2) Fallback si rien trouvé: scan global & filtre local
      if (!items || items.length === 0) {
        items = await fetchByCityFallbackScanning(rawCity);
      }

      // 3) Filtre attractions uniquement
      const onlyAttractions = (items || []).filter(isAttraction);

      if (!onlyAttractions.length) return empty;

      return buildReply({ intro, icon, items: onlyAttractions, formatter });
    } catch (error) {
      console.error('Fetch error:', error?.message);
      return 'Oops, something went wrong while fetching information. Please try again later!';
    }
  }

  // Intents simples (pas de params dynamiques)
  try {
    const { data } = await api.get(url);
    if (!data) return config.empty;

    const itemsArray = Array.isArray(data) ? data : [data];
    if (!itemsArray.length) return config.empty;

    return buildReply({ intro, icon, items: itemsArray, formatter });
  } catch (error) {
    console.error('Fetch error:', error?.message);
    return 'Oops, something went wrong while fetching information. Please try again later!';
  }
}

// ---------------------- Webhook ----------------------
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

// ---------------------- Health Route ----------------------
app.get('/', (_req, res) => res.send('OK'));

// ---------------------- Lancement ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook is running on http://localhost:${PORT}`);
});
