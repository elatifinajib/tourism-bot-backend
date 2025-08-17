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

// ---------------------- Utils: Logging ----------------------
function logInfo(msg, meta = {}) {
  try {
    console.log(`[INFO] ${msg} :: ${JSON.stringify(meta)}`);
  } catch {
    console.log(`[INFO] ${msg}`);
  }
}
function logError(msg, meta = {}) {
  try {
    console.error(`[ERROR] ${msg} :: ${JSON.stringify(meta)}`);
  } catch {
    console.error(`[ERROR] ${msg}`);
  }
}

// ---------------------- Helpers: normalisation & matching ----------------------
function removeDiacritics(str = '') {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function toTitleCaseWord(word = '') {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
// Title Case robuste (espaces, tirets, apostrophes)
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

// ---------------------- Détection du type + formatters ----------------------
// Heuristiques simples (adaptables si tu ajoutes un champ "type" côté API)
function detectType(item = {}) {
  // Si l'API expose déjà item.type, on le respecte
  const t = String(item.type || '').toLowerCase();
  if (t.includes('natural')) return 'natural';
  if (t.includes('histor')) return 'historical';
  if (t.includes('cultur')) return 'cultural';
  if (t.includes('artific') || t.includes('modern') || t.includes('man-made')) return 'artificial';

  // Heuristiques par attributs:
  if (item.protectedArea === true || item.guideToursAvailable === true) return 'natural';
  if (item.yearBuild || item.style) return 'historical';
  // Si style existe mais sans yearBuild on peut classer culturel
  if (item.style && !item.yearBuild) return 'cultural';
  // Fallback
  return 'generic';
}

function pickImages(item) {
  if (!Array.isArray(item.imageUrls)) return null;
  const imgs = item.imageUrls.slice(0, 2).filter(Boolean);
  return imgs.length ? imgs : null;
}

function baseLines(icon, item) {
  let lines = [`${icon} ${item.name || 'Unknown'}`];
  if (item.cityName) lines.push(`🏙️ City: ${item.cityName}`);
  if (item.countryName) lines.push(`🌍 Country: ${item.countryName}`);
  return lines;
}

function formatNaturalAttraction(icon, item) {
  const lines = baseLines(icon, item);
  if (item.description) lines.push(`ℹ️ ${item.description}`);
  if (item.entryFre !== undefined) lines.push(`💵 Entry Fee: ${item.entryFre}`);
  if (item.guideToursAvailable !== undefined)
    lines.push(`🗺️ Guided Tours: ${item.guideToursAvailable ? 'Yes' : 'No'}`);
  if (item.protectedArea !== undefined)
    lines.push(`🌿 Protected Area: ${item.protectedArea ? 'Yes' : 'No'}`);
  if (item.latitude && item.longitude)
    lines.push(`📍 Coordinates: ${item.latitude}, ${item.longitude}`);
  const imgs = pickImages(item);
  if (imgs) lines.push(`🖼️ Images: ${imgs.join(', ')}`);
  return lines.join('\n');
}

function formatHistoricalAttraction(icon, item) {
  const lines = baseLines(icon, item);
  if (item.description) lines.push(`ℹ️ ${item.description}`);
  if (item.style) lines.push(`🏛️ Style: ${item.style}`);
  if (item.yearBuild) lines.push(`📅 Year Built: ${item.yearBuild}`);
  if (item.entryFre !== undefined) lines.push(`💵 Entry Fee: ${item.entryFre}`);
  if (item.latitude && item.longitude)
    lines.push(`📍 Coordinates: ${item.latitude}, ${item.longitude}`);
  const imgs = pickImages(item);
  if (imgs) lines.push(`🖼️ Images: ${imgs.join(', ')}`);
  return lines.join('\n');
}

function formatCulturalAttraction(icon, item) {
  const lines = baseLines(icon, item);
  if (item.description) lines.push(`ℹ️ ${item.description}`);
  if (item.style) lines.push(`🎨 Style: ${item.style}`);
  if (item.entryFre !== undefined) lines.push(`💵 Entry Fee: ${item.entryFre}`);
  if (item.latitude && item.longitude)
    lines.push(`📍 Coordinates: ${item.latitude}, ${item.longitude}`);
  const imgs = pickImages(item);
  if (imgs) lines.push(`🖼️ Images: ${imgs.join(', ')}`);
  return lines.join('\n');
}

function formatArtificialAttraction(icon, item) {
  const lines = baseLines(icon, item);
  if (item.description) lines.push(`ℹ️ ${item.description}`);
  if (item.yearBuild) lines.push(`📅 Year Opened: ${item.yearBuild}`);
  if (item.entryFre !== undefined) lines.push(`💵 Entry Fee: ${item.entryFre}`);
  if (item.latitude && item.longitude)
    lines.push(`📍 Coordinates: ${item.latitude}, ${item.longitude}`);
  const imgs = pickImages(item);
  if (imgs) lines.push(`🖼️ Images: ${imgs.join(', ')}`);
  return lines.join('\n');
}

function formatGenericAttraction(icon, item) {
  const lines = baseLines(icon, item);
  if (item.description) lines.push(`ℹ️ ${item.description}`);
  if (item.entryFre !== undefined) lines.push(`💵 Entry Fee: ${item.entryFre}`);
  if (item.style) lines.push(`🏛️ Style: ${item.style}`);
  if (item.yearBuild) lines.push(`📅 Year Built: ${item.yearBuild}`);
  if (item.latitude && item.longitude)
    lines.push(`📍 Coordinates: ${item.latitude}, ${item.longitude}`);
  const imgs = pickImages(item);
  if (imgs) lines.push(`🖼️ Images: ${imgs.join(', ')}`);
  return lines.join('\n');
}

function selectFormatterForItem(icon, item) {
  const type = detectType(item);
  switch (type) {
    case 'natural': return (ic, it) => formatNaturalAttraction(ic, it);
    case 'historical': return (ic, it) => formatHistoricalAttraction(ic, it);
    case 'cultural': return (ic, it) => formatCulturalAttraction(ic, it);
    case 'artificial': return (ic, it) => formatArtificialAttraction(ic, it);
    default: return (ic, it) => formatGenericAttraction(ic, it);
  }
}

// ---------------------- Formatters "liste" ----------------------
function defaultFormatter(icon, item) {
  const city = item.cityName ? ` (${item.cityName})` : '';
  return `${icon} ${item.name || 'Unknown'}${city}`;
}
function formatFullAttraction(icon, item) {
  // Dispatcher par type
  const fmt = selectFormatterForItem(icon, item);
  return fmt(icon, item);
}

// ---------------------- Réponses + Chips (Dialogflow Messenger) ----------------------
function buildReply({ intro, icon, items, formatter }) {
  const fmt = formatter || defaultFormatter;
  const list = items.map((i) => fmt(icon, i)).join('\n\n');
  return `${intro}\n${list}`;
}

// Chips Dialogflow Messenger (payload "richContent")
function buildChips(chips = []) {
  if (!chips?.length) return null;
  return {
    payload: {
      richContent: [[
        {
          type: 'chips',
          options: chips.map(label => ({ text: label })),
        },
      ]],
    },
    platform: 'WEB' // Dialogflow Messenger (web demo)
  };
}

function replyWithTextAndChips(text, chips = []) {
  const messages = [{ text: { text: [text] } }];
  const chipPayload = buildChips(chips);
  if (chipPayload) messages.push(chipPayload);
  return {
    fulfillmentText: text,
    fulfillmentMessages: messages,
  };
}

// ---------------------- Endpoint case-sensitive: variantes + fallback ----------------------
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
      const path = `/getLocationByCity/${encodeURIComponent(v)}`;
      logInfo('GET variant', { path, city: v });
      const { data, status } = await api.get(path);
      logInfo('Response variant', { status, city: v });

      if (!data) continue;
      const arr = Array.isArray(data) ? data : [data];
      for (const item of arr) {
        const key = item?.id != null ? `id:${item.id}` : `nk:${item?.name || ''}|${item?.cityName || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(item);
        }
      }
    } catch (e) {
      logError('Variant fetch failed', { city: v, error: e?.message });
    }
  }
  return results;
}

// Fallback: fetch all attractions puis filtre localement par city (insensible casse/accents)
async function fetchByCityFallbackScanning(cityRaw) {
  try {
    const path = '/getAll/Attraction';
    logInfo('GET fallback scan', { path, city: cityRaw });
    const { data, status } = await api.get(path);
    logInfo('Response fallback scan', { status, city: cityRaw });

    const arr = Array.isArray(data) ? data : [data];
    return arr.filter(item => cityEquals(item?.cityName || '', cityRaw));
  } catch (e) {
    logError('Fallback scan failed', { city: cityRaw, error: e?.message });
    return [];
  }
}

// Détecter une "attraction" (vs amenity) par présence de champs spécifiques
function isAttraction(item) {
  const hasEntryFre = Object.prototype.hasOwnProperty.call(item, 'entryFre');
  const hasGuideTours = Object.prototype.hasOwnProperty.call(item, 'guideToursAvailable');
  // Ajoutons d'autres signaux positifs
  const hasStyle = Object.prototype.hasOwnProperty.call(item, 'style');
  const hasYear = Object.prototype.hasOwnProperty.call(item, 'yearBuild');
  return hasEntryFre || hasGuideTours || hasStyle || hasYear;
}

// ---------------------- Configuration des intents ----------------------
const intentConfig = {
  // ----------- Attractions (globaux) -----------
  Ask_All_Attractions: {
    url: '/getAll/Attraction',
    icon: '🌟',
    intro: 'Discover the best attractions around! Here are some of the top spots:',
    empty: "Sorry, I couldn't find any attractions for you.",
    formatter: defaultFormatter,
    chips: ['By City 🏙️', 'Natural 🌿', 'Historical 🏛️', 'Cultural 🎭', 'Artificial 🏙️'],
  },
  Ask_Natural_Attractions: {
    url: '/NaturalAttractions',
    icon: '🌿',
    intro: 'If you love nature, check out these amazing natural attractions:',
    empty: "I couldn't find any natural wonders for you.",
    formatter: defaultFormatter,
    chips: ['Filter by City 🏙️', 'All Attractions 🌟'],
  },
  Ask_Historical_Attractions: {
    url: '/HistoricalAttractions',
    icon: '🏛️',
    intro: 'Step back in time and explore these incredible historical sites:',
    empty: "I couldn't find any historical attractions for you.",
    formatter: defaultFormatter,
    chips: ['Filter by City 🏙️', 'All Attractions 🌟'],
  },
  Ask_Cultural_Attractions: {
    url: '/CulturalAttractions',
    icon: '🎭',
    intro: 'Immerse yourself in rich culture! Here are some of the best cultural attractions:',
    empty: "I couldn't find any cultural attractions for you.",
    formatter: defaultFormatter,
    chips: ['Filter by City 🏙️', 'All Attractions 🌟'],
  },
  Ask_Artificial_Attractions: {
    url: '/ArtificialAttractions',
    icon: '🏙️',
    intro: 'Check out these stunning artificial wonders:',
    empty: "I couldn't find any artificial attractions for you.",
    formatter: defaultFormatter,
    chips: ['Filter by City 🏙️', 'All Attractions 🌟'],
  },

  // ----------- Attraction par nom -----------
  Ask_Attraction_ByName: {
    url: '/getLocationByName', // + /{name}
    icon: '📍',
    intro: 'Here are the full details for this attraction:',
    empty: "Sorry, I couldn't find details for this attraction.",
    formatter: formatFullAttraction,
    chips: ['All Attractions 🌟', 'Search by City 🏙️'],
  },

  // ----------- Attraction par ville (endpoint case-sensitive + fallback) -----------
  Ask_Attraction_ByCity: {
    url: '/getLocationByCity', // on appellera avec variantes et fallback
    icon: '🌆',
    intro: (city) => `Here are the attractions in ${city}:`,
    empty: (city) => `Sorry, I couldn't find attractions in ${city}.`,
    formatter: defaultFormatter, // liste courte
    chipsForCity: (city) => [
      `Natural in ${city} 🌿`,
      `Historical in ${city} 🏛️`,
      `Cultural in ${city} 🎭`,
      `Artificial in ${city} 🏙️`,
      'All Attractions 🌟',
    ],
  },

  // ----------- Types d’attractions PAR VILLE (filtrage local) -----------
  Ask_Natural_Attractions_ByCity: {
    url: '/NaturalAttractions', // on récupère tout, puis on filtre localement par ville
    icon: '🌿',
    intro: (city) => `Natural attractions in ${city}:`,
    empty: (city) => `No natural attractions found in ${city}.`,
    formatter: defaultFormatter,
    cityFiltered: true,
  },
  Ask_Historical_Attractions_ByCity: {
    url: '/HistoricalAttractions',
    icon: '🏛️',
    intro: (city) => `Historical attractions in ${city}:`,
    empty: (city) => `No historical attractions found in ${city}.`,
    formatter: defaultFormatter,
    cityFiltered: true,
  },
  Ask_Cultural_Attractions_ByCity: {
    url: '/CulturalAttractions',
    icon: '🎭',
    intro: (city) => `Cultural attractions in ${city}:`,
    empty: (city) => `No cultural attractions found in ${city}.`,
    formatter: defaultFormatter,
    cityFiltered: true,
  },
  Ask_Artificial_Attractions_ByCity: {
    url: '/ArtificialAttractions',
    icon: '🏙️',
    intro: (city) => `Artificial attractions in ${city}:`,
    empty: (city) => `No artificial attractions found in ${city}.`,
    formatter: defaultFormatter,
    cityFiltered: true,
  },
};

// ---------------------- Fonction générique ----------------------
async function handleIntent(intentName, parameters) {
  const config = intentConfig[intentName];
  if (!config) return null;

  let { url, icon, intro, empty, formatter, cityFiltered } = config;

  // ---- ByName ----
  if (intentName === 'Ask_Attraction_ByName') {
    const name = (parameters?.name || '').toString().trim();
    if (!name) return replyWithTextAndChips('Please tell me the name of the attraction.', ['All Attractions 🌟', 'Search by City 🏙️']);
    const fullUrl = `${url}/${encodeURIComponent(name)}`;

    try {
      logInfo('Fetch ByName', { intentName, url: fullUrl, params: parameters });
      const { data, status } = await api.get(fullUrl);
      logInfo('Response ByName', { status, name });

      const arr = Array.isArray(data) ? data : [data];
      if (!arr?.length) return replyWithTextAndChips(config.empty, config.chips);

      // Détails complets (formatter par type item à item)
      const detailedList = arr.map(item => formatFullAttraction(icon, item)).join('\n\n');
      return replyWithTextAndChips(`${config.intro}\n${detailedList}`, config.chips);
    } catch (e) {
      logError('Fetch error ByName', { error: e?.message, url: fullUrl });
      return replyWithTextAndChips('Oops, something went wrong while fetching information. Please try again later!', ['All Attractions 🌟']);
    }
  }

  // ---- Types PAR VILLE (filtrage local) ----
  if (cityFiltered) {
    const rawCity = (parameters?.cityName || parameters?.name || '').toString().trim();
    if (!rawCity) return replyWithTextAndChips('Please tell me the city name.', ['Casablanca', 'Marrakech', 'Fes']);
    const cityName = normalizeCityName(rawCity);
    if (typeof intro === 'function') intro = intro(cityName);
    if (typeof empty === 'function') empty = empty(cityName);

    try {
      logInfo('Fetch TypeByCity (local filter)', { intentName, url, city: rawCity, params: parameters });
      const { data, status } = await api.get(url); // ex: /NaturalAttractions
      logInfo('Response TypeByCity', { status, url });

      const arr = Array.isArray(data) ? data : [data];
      const byCity = arr.filter(it => cityEquals(it?.cityName || '', rawCity));

      if (!byCity.length) return replyWithTextAndChips(empty, ['All Attractions 🌟', `Ask attractions in ${cityName}`]);
      const text = buildReply({ intro, icon, items: byCity, formatter });
      return replyWithTextAndChips(text, ['All Attractions 🌟', `More in ${cityName}`]);
    } catch (e) {
      logError('Fetch error TypeByCity', { error: e?.message, url, city: rawCity });
      return replyWithTextAndChips('Oops, something went wrong while fetching information. Please try again later!', ['All Attractions 🌟']);
    }
  }

  // ---- ByCity “général” (endpoint case-sensitive + fallback) ----
  if (intentName === 'Ask_Attraction_ByCity') {
    const rawCity = (parameters?.cityName || parameters?.name || '').toString().trim();
    if (!rawCity) return replyWithTextAndChips('Please tell me the city name.', ['Casablanca', 'Marrakech', 'Fes']);

    const normalizedCity = normalizeCityName(rawCity);
    if (typeof intro === 'function') intro = intro(normalizedCity);
    if (typeof empty === 'function') empty = empty(normalizedCity);

    try {
      logInfo('Fetch ByCity', { intentName, city: rawCity });
      let items = await fetchByCityWithVariants(rawCity);
      if (!items || items.length === 0) {
        logInfo('ByCity empty -> Fallback scan', { city: rawCity });
        items = await fetchByCityFallbackScanning(rawCity);
      }

      const onlyAttractions = (items || []).filter(isAttraction);
      if (!onlyAttractions.length) return replyWithTextAndChips(empty, config.chipsForCity ? config.chipsForCity(normalizedCity) : ['All Attractions 🌟']);

      const text = buildReply({ intro, icon, items: onlyAttractions, formatter });
      const chips = config.chipsForCity ? config.chipsForCity(normalizedCity) : ['All Attractions 🌟'];
      return replyWithTextAndChips(text, chips);
    } catch (e) {
      logError('Fetch error ByCity', { error: e?.message, city: rawCity });
      return replyWithTextAndChips('Oops, something went wrong while fetching information. Please try again later!', ['All Attractions 🌟']);
    }
  }

  // ---- Intents simples sans params dynamiques ----
  try {
    logInfo('Fetch Simple', { intentName, url });
    const { data, status } = await api.get(url);
    logInfo('Response Simple', { status, url });

    const arr = Array.isArray(data) ? data : [data];
    if (!arr?.length) return replyWithTextAndChips(config.empty, config.chips || ['All Attractions 🌟']);

    const text = buildReply({ intro, icon, items: arr, formatter });
    return replyWithTextAndChips(text, config.chips || ['All Attractions 🌟']);
  } catch (e) {
    logError('Fetch error Simple', { error: e?.message, url });
    return replyWithTextAndChips('Oops, something went wrong while fetching information. Please try again later!', ['All Attractions 🌟']);
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

    const response = await handleIntent(intentName, parameters);
    if (!response) {
      return res.json({ fulfillmentText: "Sorry, I didn't understand your request." });
    }
    return res.json(response);
  } catch (error) {
    logError('Webhook error', { error: error?.message });
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
