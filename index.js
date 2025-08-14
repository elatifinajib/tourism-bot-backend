// server.js
// Backend Dialogflow durci : sécurité, résilience, cache, i18n, pagination, validations.

/* =========================
 * Dépendances
 * ========================= */
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const { exponentialDelay, isNetworkError, isRetryableError } = require('axios-retry');

const morgan = require('morgan');

/* =========================
 * Config runtime
 * ========================= */
const PORT = process.env.PORT || 3000;
// Base API amont (mettez-la en env pour pouvoir switch facilement)
const BASE_URL =
  process.env.PUBLIC_API_BASE_URL ||
  'https://touristeproject.onrender.com/api/public';

// Limites par défaut (peuvent être surchargées via Dialogflow parameters.limit)
const DEFAULT_MAX_ITEMS = Number(process.env.DEFAULT_MAX_ITEMS || 10);

// Caching (LRU maison ultra simple)
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 30_000); // 30s
const cacheStore = new Map(); // key: url, value: { data, expires }

/* =========================
 * App & middlewares
 * ========================= */
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// Logs HTTP structurés
app.use(
  morgan((tokens, req, res) =>
    JSON.stringify({
      ts: new Date().toISOString(),
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: Number(tokens.status(req, res)),
      length: tokens.res(req, res, 'content-length'),
      response_ms: Number(tokens['response-time'](req, res)),
      intent: req.body?.queryResult?.intent?.displayName || null,
    })
  )
);

// Rate limiting global simple
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120, // 120 req / min / IP
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* =========================
 * Client API résilient
 * ========================= */
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
});
axiosRetry(api, {
  retries: 3,
  retryDelay: exponentialDelay,
  retryCondition: (err) =>
    isNetworkError(err) ||
    isRetryableError(err) ||
    (err.response && err.response.status >= 500),
});


/* =========================
 * i18n minimal (en / fr)
 * ========================= */
const M = {
  fr: {
    unknown: "Désolé, je n'ai pas compris votre demande.",
    empty: "Désolé, je n'ai rien trouvé pour l'instant.",
    more: (n) => `\n…et ${n} autre(s).`,
    error: "Oups, un problème est survenu. Réessayez plus tard !",
  },
  en: {
    unknown: "Sorry, I didn't understand your request.",
    empty: "Sorry, I couldn't find anything for now.",
    more: (n) => `\n…and ${n} more.`,
    error: "Oops, something went wrong. Please try again later!",
  },
};
function t(langCode) {
  return langCode?.startsWith('fr') ? M.fr : M.en;
}

/* =========================
 * Intent config
 * =========================
 * NB: Textes d’intro/outro ici en EN pour garder votre original,
 * l’i18n des messages génériques (unknown/empty/error) est gérée par M ci-dessus.
 */
const intentConfig = {
  // ----------- Attractions -----------
  Ask_All_Attractions: {
    url: '/getAll/Attraction',
    icon: '🌟',
    intro: "Discover the best attractions around! Here are some of the top spots:",
    outro: "Have an amazing trip and enjoy every moment!",
    empty: "Sorry, I couldn't find any attractions for you.",
  },
  Ask_Natural_Attractions: {
    url: '/NaturalAttractions',
    icon: '🌿',
    intro:
      "If you love nature, you're in for a treat! Check out these amazing natural attractions:",
    outro: 'Breathe in, slow down, and enjoy the views!',
    empty: "I couldn't find any natural wonders for you.",
  },
  Ask_Historical_Attractions: {
    url: '/HistoricalAttractions',
    icon: '🏛️',
    intro:
      'Step back in time and explore some incredible historical sites! Here are some top recommendations:',
    outro: "Let history come alive—take your time to soak it all in!",
    empty: "I couldn't find any historical attractions for you.",
  },
  Ask_Cultural_Attractions: {
    url: '/CulturalAttractions',
    icon: '🎭',
    intro:
      "Get ready to immerse yourself in rich culture! Here are some of the best cultural attractions:",
    outro: 'Celebrate the local spirit and connect with the community!',
    empty: "I couldn't find any cultural attractions for you.",
  },
  Ask_Artificial_Attractions: {
    url: '/ArtificialAttractions',
    icon: '🏙️',
    intro: "Check out these stunning artificial wonders! Here's what you can explore:",
    outro: "Marvel at human creativity—and don't forget your camera!",
    empty: "I couldn't find any artificial attractions for you.",
  },

  // ----------- Amenities -----------
  Ask_All_Amenities: {
    url: '/getAll/Amenities',
    icon: '🏨',
    intro: 'Here are some amenities that can enhance your visit:',
    outro: 'These places offer great services to make your experience unforgettable!',
    empty: "Sorry, I couldn't find any amenities for you.",
  },
  Ask_Restaurants: {
    url: '/Restaurants',
    icon: '🍽️',
    intro: 'Looking for a great place to eat? Here are some top restaurants:',
    outro: 'Enjoy your meal!',
    empty: "Sorry, I couldn't find any restaurants for you.",
  },
  Ask_Cafes: {
    url: '/Cafes',
    icon: '☕',
    intro: 'Looking for a cozy place to relax? Here are some popular cafes:',
    outro: 'Enjoy your coffee!',
    empty: "Sorry, I couldn't find any cafes for you.",
  },
  Ask_Campings: {
    url: '/Camping',
    icon: '🏕️',
    intro: 'Ready to explore the great outdoors? Here are some beautiful camping spots:',
    outro: 'Happy camping!',
    empty: "Sorry, I couldn't find any campgrounds for you.",
  },
  Ask_GuestHouses: {
    url: '/GuestHouses',
    icon: '🏡',
    intro: 'Looking for a homey stay? Here are some lovely guest houses:',
    outro: 'Enjoy your stay!',
    empty: "Sorry, I couldn't find any guest houses for you.",
  },
  Ask_Hotels: {
    url: '/Hotels',
    icon: '🏨',
    intro: 'Here are some of the best hotels for your stay:',
    outro: 'Enjoy your luxurious stay!',
    empty: "Sorry, I couldn't find any hotels for you.",
  },
  Ask_Lodges: {
    url: '/Lodges',
    icon: '🏞️',
    intro: 'Escape into nature and stay at these amazing lodges:',
    outro: 'Enjoy your stay in nature!',
    empty: "Sorry, I couldn't find any lodges for you.",
  },

  // ----------- Activities -----------
  Ask_All_Activities: {
    url: '/getAll/Activities',
    icon: '🎉',
    intro: 'Looking for fun things to do? Here are some exciting activities to try:',
    outro: 'Have a great time!',
    empty: "Sorry, I couldn't find any activities for you.",
    formatter: (icon, i) => `${icon} ${i.name}`,
  },
  Ask_Traditional_Activities: {
    url: '/Activity/Traditional',
    icon: '🎉',
    intro:
      'Want to experience some local traditions? Check out these amazing traditional activities:',
    outro: 'Enjoy the experience!',
    empty: "Sorry, I couldn't find any traditional activities for you.",
    formatter: (icon, i) => `${icon} ${i.name}`,
  },
  Ask_Sports_Activities: {
    url: '/Activity/Sports',
    icon: '🏃‍♂️',
    intro: 'Looking for some action? Here are the best sports activities to enjoy:',
    outro: 'Get ready to move!',
    empty: "Sorry, I couldn't find any sports activities for you.",
    formatter: (icon, i) => `${icon} ${i.name}`,
  },
  Ask_Cultural_Activities: {
    url: '/Activity/Cultural',
    icon: '🎭',
    intro: 'Immerse yourself in culture! Here are some wonderful cultural activities:',
    outro: 'Enjoy the rich heritage!',
    empty: "Sorry, I couldn't find any cultural activities for you.",
    formatter: (icon, i) => `${icon} ${i.name}`,
  },
  // nom original conservé
  Ask_Adventural_Activities: {
    url: '/Activity/Adventure',
    icon: '🏞️',
    intro: 'Are you ready for some adventure? Here are some thrilling activities:',
    outro: 'Time for an adventure!',
    empty: "Sorry, I couldn't find any adventure activities for you.",
    formatter: (icon, i) => `${icon} ${i.name}`,
  },

  // ----------- Ancillary Services -----------
  Ask_All_AncillaryServices: {
    url: '/getAll/AncillaryService',
    icon: '🛠️',
    intro: 'Here are some additional services that can enhance your experience:',
    outro: 'These services will make your trip even better!',
    empty: "Sorry, I couldn't find any ancillary services for you.",
  },
  Ask_All_TourGuide: {
    url: '/Service/TourGuide',
    icon: '👨‍🏫',
    intro: 'Looking for a local guide? Here are some experienced tour guides:',
    outro: "They'll make your visit even more special!",
    empty: "Sorry, I couldn't find any tour guides for you.",
  },
  Ask_All_Sanitary: {
    url: '/Service/Sanitary',
    icon: '💧',
    intro: 'Here are some sanitary services available for you:',
    outro: 'Stay healthy during your trip!',
    empty: "Sorry, I couldn't find any sanitary services for you.",
  },
  Ask_All_CarAgency: {
    url: '/Service/CarAgency',
    icon: '🚗',
    intro: 'Here are some car rental agencies to help you get around:',
    outro: 'Drive safely!',
    empty: "Sorry, I couldn't find any car agencies for you.",
  },
  Ask_All_Administratives: {
    url: '/Service/Administrative',
    icon: '📑',
    intro: 'Here are some administrative services you may need:',
    outro: 'Get all the help you need!',
    empty: "Sorry, I couldn't find any administrative services for you.",
  },
  Ask_All_Banks: {
    url: '/Service/Bank',
    icon: '🏦',
    intro: 'Here are some banks where you can manage your finances:',
    outro: 'Feel free to visit one!',
    empty: "Sorry, I couldn't find any banks for you.",
  },

  // ----------- Accessibility -----------
  Ask_All_Accessibilities: {
    url: '/getAll/Accessibility',
    icon: '♿',
    intro: 'Here are some accessibility services to make your visit more comfortable:',
    outro: 'Let me know if you need more details!',
    empty: "Sorry, I couldn't find any accessibility services for you.",
  },

  // ----------- Transport -----------
  Ask_All_Bus: {
    url: '/Bus',
    icon: '🚌',
    intro: 'Looking for buses? Here are some bus services you can use:',
    outro: 'Safe travels!',
    empty: "Sorry, I couldn't find any bus services for you.",
  },
  Ask_All_Fly: {
    url: '/Fly',
    icon: '✈️',
    intro: 'Need a flight? Here are some flight services to get you to your destination:',
    outro: 'Safe travels!',
    empty: "Sorry, I couldn't find any flight services for you.",
  },
  Ask_All_Taxi: {
    url: '/Taxi',
    icon: '🚖',
    intro: 'Looking for a taxi? Here are some reliable taxi services:',
    outro: 'Hop in and enjoy your ride!',
    empty: "Sorry, I couldn't find any taxi services for you.",
  },

  // ----------- Available Packages -----------
  Ask_All_AvailablePackages: {
    url: '/getAll/available_Package',
    icon: '🎁',
    intro: 'Here are some amazing available packages for you to explore:',
    outro: 'These packages will make your trip unforgettable!',
    empty: "Sorry, I couldn't find any available packages for you.",
  },
};

/* =========================
 * Helpers
 * ========================= */
function safeItem(i) {
  const name =
    typeof i?.name === 'string' && i.name.trim() ? i.name.trim() : 'Unnamed';
  const city =
    typeof i?.cityName === 'string' && i.cityName.trim()
      ? ` (${i.cityName.trim()})`
      : '';
  return { name, city };
}

function defaultFormatter(icon, item) {
  return `${icon} ${item.name}${item.city || ''}`;
}

function buildReply({ intro, icon, items, formatter, outro, maxItems, moreText }) {
  const fmt = typeof formatter === 'function' ? formatter : defaultFormatter;
  const list = items.slice(0, maxItems).map((raw) => fmt(icon, safeItem(raw))).join('\n');
  const more =
    items.length > maxItems ? moreText(items.length - maxItems) : '';
  return outro ? `${intro}\n${list}${more}\n${outro}` : `${intro}\n${list}${more}`;
}

// Cache GET simple
async function cachedGet(url) {
  const now = Date.now();
  const cached = cacheStore.get(url);
  if (cached && cached.expires > now) return cached.data;
  const { data } = await api.get(url);
  cacheStore.set(url, { data, expires: now + CACHE_TTL_MS });
  return data;
}

// Lecture de paramètres utiles depuis Dialogflow
function readDialogflowParams(req) {
  const parameters = req.body?.queryResult?.parameters || {};
  return {
    limit:
      Number(parameters.limit) > 0
        ? Math.min(Number(parameters.limit), 50) // hard cap
        : DEFAULT_MAX_ITEMS,
    page:
      Number(parameters.page) > 0 ? Number(parameters.page) : 1, // non utilisé en backend texte, mais dispo si vous voulez étendre
  };
}

/* =========================
 * Handler d’intent générique
 * ========================= */
async function handleIntent(intentName, langCode, { limit }) {
  const config = intentConfig[intentName];
  if (!config) return null;

  const { url, icon, intro, empty, formatter, outro } = config;

  // Récup data (avec cache + retries)
  const data = await cachedGet(url);

  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) {
    // Si l’intent a un message empty dédié → utilisez-le, sinon message i18n générique
    return empty || t(langCode).empty;
  }

  return buildReply({
    intro,
    icon,
    items,
    formatter,
    outro,
    maxItems: limit,
    moreText: t(langCode).more,
  });
}

/* =========================
 * Webhook Dialogflow
 * ========================= */
app.post('/webhook', async (req, res) => {
  const t0 = Date.now();
  const langCode = req.body?.queryResult?.languageCode || 'en';
  const i18n = t(langCode);

  try {
    const intentName = req.body?.queryResult?.intent?.displayName;
    if (!intentName) {
      return res.json({ fulfillmentText: i18n.unknown });
    }

    const params = readDialogflowParams(req);
    const reply = await handleIntent(intentName, langCode, params);

    if (!reply) {
      return res.json({ fulfillmentText: i18n.unknown });
    }

    // Réponse compatible Dialogflow v2
    return res.json({
      fulfillmentText: reply,
      fulfillmentMessages: [{ text: { text: [reply] } }],
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Webhook error',
        err: error?.message || String(error),
        stack: error?.stack,
        ms: Date.now() - t0,
      })
    );
    return res.json({ fulfillmentText: t(langCode).error });
  }
});

/* =========================
 * Health & Infos
 * ========================= */
app.get('/', (_req, res) => res.send('OK'));
app.get('/healthz', async (req, res) => {
  // Optionnel : ping léger de l’API amont si ?deep=1
  if (req.query.deep === '1') {
    try {
      await api.get('/healthz'); // s’il existe, sinon remplacez par un endpoint public léger
      return res.json({ ok: true, upstream: 'ok', now: Date.now() });
    } catch {
      return res.status(502).json({ ok: false, upstream: 'down', now: Date.now() });
    }
  }
  res.json({
    ok: true,
    version: '1.0.0',
    uptime_s: Math.round(process.uptime()),
    now: Date.now(),
  });
});

/* =========================
 * Lancement serveur
 * ========================= */
app.listen(PORT, () => {
  console.log(`Webhook running on http://localhost:${PORT}`);
});
