// server.js
// ---------------------- Imports & Setup ----------------------
const express = require('express');
const axios = require('axios');

const app = express();
// body-parser n'est plus nécessaire depuis Express 4.16+
app.use(express.json());

// ---------------------- Message d'accueil par défaut ----------------------
const WELCOME_TEXT =
  '👋 Hello! I m your assistant bot 🤖. ' +
  'I can help you discover Draa Tafilalet. ' +
  ' What would you like to explore today?';

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
  // NOTE: le champ s'appelle "entryFre" dans ton code — je le garde tel quel
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
    .map((part) =>
      part
        .split('-')
        .map((seg) =>
          seg
            .split("'")
            .map((sub) => toTitleCaseWord(sub))
            .join("'")
        )
        .map((seg) => toTitleCaseWord(seg))
        .join('-')
    )
    .join(' ');
}

// Comparaison ville: insensible casse + accents
function cityEquals(a = '', b = '') {
  return (
    removeDiacritics(String(a).trim().toLowerCase()) ===
    removeDiacritics(String(b).trim().toLowerCase())
  );
}

// Détecter une "attraction" (vs amenity) par présence de champs spécifiques
function isAttraction(item) {
  const hasEntryFre = Object.prototype.hasOwnProperty.call(item, 'entryFre');
  const hasGuideTours = Object.prototype.hasOwnProperty.call(
    item,
    'guideToursAvailable'
  );
  return hasEntryFre || hasGuideTours;
}

// ---------------------- Endpoint case-sensitive: variantes + fallback ----------------------
// Génère des variantes de casse pour un endpoint case-sensitive
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
        const key =
          item?.id != null
            ? `id:${item.id}`
            : `nk:${item?.name || ''}|${item?.cityName || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(item);
        }
      }
    } catch (_e) {
      // on essaie la variante suivante
    }
  }
  return results;
}

// Fallback: fetch all attractions puis filtre localement par city (insensible casse/accents)
async function fetchByCityFallbackScanning(cityRaw) {
  try {
    const { data } = await api.get('/getAll/Attraction');
    const arr = Array.isArray(data) ? data : [data];
    return arr.filter((item) => cityEquals(item?.cityName || '', cityRaw));
  } catch (_e) {
    return [];
  }
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

  // ----------- Attraction par ville (endpoint case-sensitive + fallback) -----------
  Ask_Attraction_ByCity: {
    url: '/getLocationByCity', // on appellera avec variantes et fallback
    icon: '🌆',
    intro: (city) => `Here are the attractions in ${city}:`,
    empty: (city) => `Sorry, I couldn't find attractions in ${city}.`,
    formatter: defaultFormatter, // ou formatFullAttraction
  },

  // ----------- Types d'attractions PAR VILLE (filtrage local) -----------
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
    if (!name) return 'Please tell me the name of the attraction.';
    const fullUrl = `${url}/${encodeURIComponent(name)}`;

    try {
      const { data } = await api.get(fullUrl);
      const arr = Array.isArray(data) ? data : [data];
      if (!arr?.length) return empty;
      return buildReply({ intro, icon, items: arr, formatter });
    } catch (e) {
      console.error('Fetch error:', e?.message);
      return 'Oops, something went wrong while fetching information. Please try again later!';
    }
  }

  // ---- Types PAR VILLE (filtrage local) ----
  if (cityFiltered) {
    const rawCity = (parameters?.cityName || parameters?.name || '').toString().trim();
    if (!rawCity) return 'Please tell me the city name.';
    const cityName = normalizeCityName(rawCity);
    if (typeof intro === 'function') intro = intro(cityName);
    if (typeof empty === 'function') empty = empty(cityName);

    try {
      const { data } = await api.get(url); // ex: /NaturalAttractions
      const arr = Array.isArray(data) ? data : [data];

      // filtre par ville (insensible casse/accents)
      const byCity = arr.filter((it) => cityEquals(it?.cityName || '', rawCity));

      if (!byCity.length) return empty;
      return buildReply({ intro, icon, items: byCity, formatter });
    } catch (e) {
      console.error('Fetch error:', e?.message);
      return 'Oops, something went wrong while fetching information. Please try again later!';
    }
  }

  // ---- ByCity "général" (endpoint case-sensitive + fallback) ----
  if (intentName === 'Ask_Attraction_ByCity') {
    const rawCity = (parameters?.cityName || parameters?.name || '').toString().trim();
    if (!rawCity) return 'Please tell me the city name.';
    const normalizedCity = normalizeCityName(rawCity);
    if (typeof intro === 'function') intro = intro(normalizedCity);
    if (typeof empty === 'function') empty = empty(normalizedCity);

    try {
      // 1) Essais multi-variantes sur l'endpoint case-sensitive
      let items = await fetchByCityWithVariants(rawCity);

      // 2) Fallback si aucun résultat: scan global & filtre local
      if (!items || items.length === 0) {
        items = await fetchByCityFallbackScanning(rawCity);
      }

      // 3) Ne garder que les attractions (élimine les amenities)
      const onlyAttractions = (items || []).filter(isAttraction);

      if (!onlyAttractions.length) return empty;
      return buildReply({ intro, icon, items: onlyAttractions, formatter });
    } catch (e) {
      console.error('Fetch error:', e?.message);
      return 'Oops, something went wrong while fetching information. Please try again later!';
    }
  }

  // ---- Intents simples sans params dynamiques ----
  try {
    const { data } = await api.get(url);
    const arr = Array.isArray(data) ? data : [data];
    if (!arr?.length) return intentConfig[intentName].empty;
    return buildReply({ intro, icon, items: arr, formatter });
  } catch (e) {
    console.error('Fetch error:', e?.message);
    return 'Oops, something went wrong while fetching information. Please try again later!';
  }
}

// ---------------------- Nouvel endpoint pour chatbot riche ----------------------
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId, sessionId } = req.body;
    
    console.log('📱 Flutter request:', { message, userId, sessionId });

    // Détecter l'intent depuis le message (logique simple)
    const detectedIntent = detectIntentFromMessage(message);
    const parameters = extractParametersFromMessage(message);
    
    console.log('🎯 Detected intent:', detectedIntent);

    // Récupérer les données
    const data = await handleIntent(detectedIntent, parameters);
    
    if (!data) {
      return res.json({
        message: "Sorry, I didn't understand your request.",
        intent: 'unknown',
        type: 'text',
        isError: true
      });
    }

    // Formater réponse riche selon l'intent
    const richResponse = formatRichResponse(detectedIntent, data, parameters);
    
    return res.json(richResponse);
    
  } catch (error) {
    console.error('Chat API error:', error);
    return res.json({
      message: 'Sorry, something went wrong. Please try again.',
      intent: 'error',
      type: 'text',
      isError: true
    });
  }
});

// Fonction pour détecter l'intent depuis le message
function detectIntentFromMessage(message) {
  const msg = message.toLowerCase().trim();
  
  // Attractions générales
  if (msg.includes('attraction') && !msg.includes('natural') && !msg.includes('historical') && !msg.includes('cultural') && !msg.includes('artificial')) {
    return 'Ask_All_Attractions';
  }
  
  // Attractions par type
  if (msg.includes('natural')) return 'Ask_Natural_Attractions';
  if (msg.includes('historical') || msg.includes('history')) return 'Ask_Historical_Attractions';
  if (msg.includes('cultural') || msg.includes('culture')) return 'Ask_Cultural_Attractions';
  if (msg.includes('artificial')) return 'Ask_Artificial_Attractions';
  
  // Attractions par ville
  if (msg.includes('in ') || msg.includes('at ')) {
    if (msg.includes('natural')) return 'Ask_Natural_Attractions_ByCity';
    if (msg.includes('historical')) return 'Ask_Historical_Attractions_ByCity';
    if (msg.includes('cultural')) return 'Ask_Cultural_Attractions_ByCity';
    if (msg.includes('artificial')) return 'Ask_Artificial_Attractions_ByCity';
    return 'Ask_Attraction_ByCity';
  }
  
  // Attraction par nom spécifique
  if (msg.includes('tell me about') || msg.includes('details') || msg.includes('information about')) {
    return 'Ask_Attraction_ByName';
  }
  
  // Default
  return 'Ask_All_Attractions';
}

// Fonction pour extraire les paramètres
function extractParametersFromMessage(message) {
  const parameters = {};
  const msg = message.toLowerCase();
  
  // Extraire nom de ville après "in"
  const cityMatch = msg.match(/in\s+([a-zA-Z\s-']+)/);
  if (cityMatch) {
    parameters.cityName = cityMatch[1].trim();
  }
  
  // Extraire nom d'attraction après "about"
  const nameMatch = msg.match(/about\s+([a-zA-Z\s-']+)/);
  if (nameMatch) {
    parameters.name = nameMatch[1].trim();
  }
  
  return parameters;
}

// Fonction pour formater les réponses riches
function formatRichResponse(intent, data, parameters) {
  const config = intentConfig[intent];
  
  // Si c'est une string (ancienne logique), on retourne format simple
  if (typeof data === 'string') {
    return {
      message: data,
      intent: intent,
      type: 'text',
      data: null,
      components: null,
      isError: false
    };
  }
  
  // Si c'est un array (données d'attractions), on format en riche
  if (Array.isArray(data) && data.length > 0) {
    const responseType = getResponseType(intent);
    
    return {
      message: `Found ${data.length} ${responseType} for you!`,
      intent: intent,
      type: responseType,
      data: data,
      components: {
        type: 'carousel',
        items: data.map(item => ({
          id: item.id,
          title: item.name,
          subtitle: item.cityName || '',
          description: item.description || '',
          image: Array.isArray(item.imageUrls) && item.imageUrls.length > 0 ? item.imageUrls[0] : null,
          rating: item.rating || null,
          entryFee: item.entryFre || null,
          coordinates: item.latitude && item.longitude ? {
            lat: item.latitude,
            lng: item.longitude
          } : null,
          buttons: [
            { text: 'View Details', action: 'view_details', data: item.id },
            ...(item.latitude && item.longitude ? [{ text: 'Get Directions', action: 'directions', data: { lat: item.latitude, lng: item.longitude }}] : [])
          ]
        }))
      },
      isError: false
    };
  }
  
  // Pas de données
  return {
    message: config?.empty || "Sorry, I couldn't find anything for you.",
    intent: intent,
    type: 'text',
    data: null,
    components: null,
    isError: false
  };
}

// Fonction helper pour déterminer le type de réponse
function getResponseType(intent) {
  switch (intent) {
    case 'Ask_All_Attractions':
    case 'Ask_Attraction_ByCity':
    case 'Ask_Attraction_ByName':
      return 'attractions';
    case 'Ask_Natural_Attractions':
    case 'Ask_Natural_Attractions_ByCity':
      return 'natural_attractions';
    case 'Ask_Historical_Attractions':
    case 'Ask_Historical_Attractions_ByCity':
      return 'historical_attractions';
    case 'Ask_Cultural_Attractions':
    case 'Ask_Cultural_Attractions_ByCity':
      return 'cultural_attractions';
    case 'Ask_Artificial_Attractions':
    case 'Ask_Artificial_Attractions_ByCity':
      return 'artificial_attractions';
    default:
      return 'attractions';
  }
}

// ---------------------- Webhook ----------------------
app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body?.queryResult?.intent?.displayName;
    const parameters = req.body?.queryResult?.parameters;
    const action = req.body?.queryResult?.action;
    const queryText = req.body?.queryResult?.queryText;

    // 1) Cas "premier message" ou action welcome (Dialogflow ES déclenche input.welcome)
    const looksLikeWelcome =
      action === 'input.welcome' ||
      !intentName ||
      (typeof queryText === 'string' && queryText.trim() === '');

    if (looksLikeWelcome) {
      return res.json({
        fulfillmentText: WELCOME_TEXT,
        fulfillmentMessages: [{ text: { text: [WELCOME_TEXT] } }],
      });
    }

    // 2) Reste des intents gérés normalement
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
      fulfillmentText:
        'Oops, something went wrong while fetching information. Please try again later!',
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