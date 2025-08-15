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

// ---------------------- Helpers: normalisation, matching, fetch variants ----------------------
function removeDiacritics(str = '') {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Title Case robuste (espaces, tirets, apostrophes)
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

// Comparaison de ville insensible à la casse et aux accents
function cityEquals(a = '', b = '') {
  return removeDiacritics(String(a).trim().toLowerCase()) ===
         removeDiacritics(String(b).trim().toLowerCase());
}

// Détection attraction (vs amenity)
function isAttraction(item) {
  const hasEntryFre = Object.prototype.hasOwnProperty.call(item, 'entryFre');
  const hasGuideTours = Object.prototype.hasOwnProperty.call(item, 'guideToursAvailable');
  return hasEntryFre || hasGuideTours;
}

// Génère des variantes de casse pour requêter un endpoint case-sensitive
function generateCityVariants(raw = '') {
  const title = normalizeCityName(raw);
  const low = title.toLowerCase();
  const up = title.toUpperCase();
  return Array.from(new Set([title, low, up]));
}

// Essaie /getLocationByCity avec plusieurs variantes
async function fetchByCityWithVariants(cityRaw) {
  const variants = generateCityVariants(cityRaw);
  const results = [];
  const seen = new Set();

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
    } catch (_e) {
      // on essaie la prochaine variante
    }
  }

  return results;
}

// Fallback: scan global et filtre local (insensible casse/accents)
async function fetchByCityFallbackScanning(cityRaw) {
  try {
    const { data } = await api.get('/getAll/Attraction');
    const arr = Array.isArray(data) ? data : [data];
    return arr.filter(item => cityEquals(item?.cityName || '', cityRaw));
  } catch (_e) {
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
    url: '/getLocationByCity', // on appellera avec variantes et fallback
    icon: '🌆',
    intro: (city) => `Here are the attractions in ${city}:`,
    empty: (city) => `Sorry, I couldn't find attractions in ${city}.`,
    formatter: defaultFormatter, // ou formatFullAttraction
  },
};

// ---------------------- Fonction générique ----------------------
async function handleIntent(intentName, parameters) {
  const config = intentConfig[intentName];
  if (!config) return null;

  let { url, icon, intro, empty, formatter } = config;

  // ---- ByName (simple) ----
  if (intentName === 'Ask_Attraction_ByName') {
    const name = (parameters?.name || '').toString().trim();
    if (!name) return 'Please tell me the name of the attraction.';
    url = `${url}/${encodeURIComponent(name)}`;

    try {
      const { data } = await api.get(url);
      if (!data) return empty;
      const arr = Array.isArray(data) ? data : [data];
      if (!arr.length) return empty;
      return buildReply({ intro, icon, items: arr, formatter });
    } catch (error) {
      console.error('Fetch error:', error?.message);
      return 'Oops, something went wrong while fetching information. Please try again later!';
    }
  }

  // ---- ByCity (case-sensitive safe) ----
  if (intentName === 'Ask_Attraction_ByCity') {
    const rawCity = (parameters?.cityName || parameters?.name || '').toString().trim();
    if (!rawCity) return 'Please tell me the city name.';

    const normalizedCity = normalizeCityName(rawCity);
    if (typeof intro === 'function') intro = intro(normalizedCity);
    if (typeof empty === 'function') empty = empty(normalizedCity);

    try {
      // 1) Essais multi-variantes sur l'endpoint case-sensitive
      let items = await fetchByCityWithVariants(rawCity);

      // 2) Fallback si aucun résultat
      if (!items || items.length === 0) {
        items = await fetchByCityFallbackScanning(rawCity);
      }

      // 3) Ne garder que les attractions
      const onlyAttractions = (items || []).filter(isAttraction);

      if (!onlyAttractions.length) return empty;

      return buildReply({ intro, icon, items: onlyAttractions, formatter });
    } catch (error) {
      console.error('Fetch error:', error?.message);
      return 'Oops, something went wrong while fetching information. Please try again later!';
    }
  }

  // ---- Intents simples sans params dynamiques ----
  try {
    const { data } = await api.get(url);
    if (!data) return config.empty;
    const arr = Array.isArray(data) ? data : [data];
    if (!arr.length) return config.empty;
    return buildReply({ intro, icon, items: arr, formatter });
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
