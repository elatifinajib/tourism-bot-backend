// server.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ---- CONFIG ----
const BASE_URL = process.env.PUBLIC_API_BASE || 'https://touristeproject.onrender.com/api/public';
const TIMEOUT_MS = 8000;         // timeout axios
const RETRIES = 2;               // nb de retries réseau (en plus de la 1ère tentative)
const CACHE_TTL_MS = 60_000;     // cache 60s
const MAX_ITEMS = 10;            // on affiche 10 éléments max

// Intent → endpoint + emoji + titres FR/EN
const INTENT_MAP = {
  Ask_All_Attractions:       { path: '/getAll/Attraction',       emoji: '🌟', title: { fr: 'Attractions à découvrir',  en: 'Top attractions' } },
  Ask_Natural_Attractions:   { path: '/NaturalAttractions',      emoji: '🌿', title: { fr: 'Attractions naturelles',   en: 'Natural attractions' } },
  Ask_Historical_Attractions:{ path: '/HistoricalAttractions',   emoji: '🏛️', title: { fr: 'Sites historiques',        en: 'Historical attractions' } },
  Ask_Cultural_Attractions:  { path: '/CulturalAttractions',     emoji: '🎭', title: { fr: 'Attractions culturelles',  en: 'Cultural attractions' } },
  Ask_Artificial_Attractions:{ path: '/ArtificialAttractions',   emoji: '🏙️', title: { fr: 'Merveilles artificielles', en: 'Artificial attractions' } },

  Ask_All_Amenities:         { path: '/getAll/Amenities',        emoji: '🏨', title: { fr: 'Commodités',                en: 'Amenities' } },
  Ask_Restaurants:           { path: '/Restaurants',             emoji: '🍽️', title: { fr: 'Restaurants',              en: 'Restaurants' } },
  Ask_Cafes:                 { path: '/Cafes',                   emoji: '☕',  title: { fr: 'Cafés',                    en: 'Cafes' } },
  Ask_Campings:              { path: '/Camping',                 emoji: '🏕️', title: { fr: 'Campings',                 en: 'Campings' } },
  Ask_GuestHouses:           { path: '/GuestHouses',             emoji: '🏡', title: { fr: 'Maisons d’hôtes',          en: 'Guest houses' } },
  Ask_Hotels:                { path: '/Hotels',                  emoji: '🏨', title: { fr: 'Hôtels',                   en: 'Hotels' } },
  Ask_Lodges:                { path: '/Lodges',                  emoji: '🏞️', title: { fr: 'Lodges',                   en: 'Lodges' } },

  Ask_All_Activities:        { path: '/getAll/Activities',       emoji: '🎉', title: { fr: 'Activités',                en: 'Activities' } },
  Ask_Traditional_Activities:{ path: '/Activity/Traditional',    emoji: '🎉', title: { fr: 'Activités traditionnelles', en: 'Traditional activities' } },
  Ask_Sports_Activities:     { path: '/Activity/Sports',         emoji: '🏃‍♂️', title:{ fr: 'Activités sportives',     en: 'Sports activities' } },
  Ask_Adventural_Activities: { path: '/Activity/Adventure',      emoji: '🏞️', title: { fr: 'Activités d’aventure',     en: 'Adventure activities' } },

  Ask_All_AncillaryServices: { path: '/getAll/AncillaryService', emoji: '🛠️', title: { fr: 'Services annexes',         en: 'Ancillary services' } },
  Ask_All_TourGuide:         { path: '/Service/TourGuide',       emoji: '👨‍🏫', title:{ fr: 'Guides touristiques',      en: 'Tour guides' } },
  Ask_All_Sanitary:          { path: '/Service/Sanitary',        emoji: '💧', title: { fr: 'Services sanitaires',       en: 'Sanitary services' } },
  Ask_All_CarAgency:         { path: '/Service/CarAgency',       emoji: '🚗', title: { fr: 'Agences de location',       en: 'Car rental agencies' } },
  Ask_All_Administratives:   { path: '/Service/Administrative',  emoji: '📑', title: { fr: 'Services administratifs',   en: 'Administrative services' } },
  Ask_All_Banks:             { path: '/Service/Bank',            emoji: '🏦', title: { fr: 'Banques',                   en: 'Banks' } },

  Ask_All_Accessibilities:   { path: '/getAll/Accessibility',    emoji: '♿', title: { fr: 'Accessibilité',             en: 'Accessibility services' } },
  Ask_All_Bus:               { path: '/Bus',                     emoji: '🚌', title: { fr: 'Services de bus',           en: 'Bus services' } },
  Ask_All_Fly:               { path: '/Fly',                     emoji: '✈️', title: { fr: 'Vols',                      en: 'Flight services' } },
  Ask_All_Taxi:              { path: '/Taxi',                    emoji: '🚖', title: { fr: 'Taxis',                     en: 'Taxi services' } },
};

// ---- HTTP client axios ----
const api = axios.create({ baseURL: BASE_URL, timeout: TIMEOUT_MS });

// ---- Petit cache mémoire (clé=path, valeur={data, expiry}) ----
const cache = new Map();
function setCache(key, data) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}
function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) { cache.delete(key); return null; }
  return entry.data;
}

// ---- utilitaires ----
function langFrom(req) {
  const lc = req.body?.queryResult?.languageCode || '';
  return (lc || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
function safeArray(x) { return Array.isArray(x) ? x : []; }

function formatList(items, emoji) {
  return items
    .filter(it => it && it.name)
    .map(it => `${emoji} ${it.name}${it.cityName ? ` (${it.cityName})` : ''}`)
    .join('\n');
}

async function fetchWithRetry(path) {
  let lastErr;
  for (let i = 0; i <= RETRIES; i++) {
    try {
      const cached = getCache(path);
      if (cached) return cached;

      const { data } = await api.get(path);
      const arr = safeArray(data);
      setCache(path, arr);
      return arr;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 200 * i)); // mini backoff
    }
  }
  throw lastErr;
}

function buildReply({ intentCfg, lang, fullList }) {
  const list = [...fullList].sort((a, b) => {
    const ac = (a.cityName || '').localeCompare(b.cityName || '');
    if (ac !== 0) return ac;
    return (a.name || '').localeCompare(b.name || '');
  });

  const count = list.length;
  const top = list.slice(0, MAX_ITEMS);
  const more = Math.max(0, count - top.length);

  const header = lang === 'fr'
    ? `${intentCfg.title.fr} — ${count} résultat${count>1?'s':''}`
    : `${intentCfg.title.en} — ${count} result${count>1?'s':''}`;

  const body = formatList(top, intentCfg.emoji);

  const tail = lang === 'fr'
    ? (more > 0 ? `\n…et encore ${more} autre${more>1?'s':''}.` : '')
    : (more > 0 ? `\n…and ${more} more.` : '');

  const cta = lang === 'fr'
    ? `\n\nTu veux un autre type (ex: hôtels, cafés) ? Dis-le moi 🙂`
    : `\n\nWant another type (e.g., hotels, cafes)? Just say it 🙂`;

  return `${header}\n${body}${tail}${cta}`;
}

// Petit “menu de types” quand l’utilisateur dit OUI
function buildTypeMenu(lang) {
  if (lang === 'fr') {
    return [
      "D’accord ! Dis-moi ce que tu veux voir :",
      "• 🏨 Hôtels",
      "• ☕ Cafés",
      "• 🍽️ Restaurants",
      "• 🌟 Attractions (toutes)",
      "• 🎉 Activités",
      "• 🚌 Bus   • 🚖 Taxis   • ✈️ Vols   • 🏦 Banques",
      "Par exemple : « montre-moi les hôtels » ou « cafés »."
    ].join('\n');
  }
  return [
    "Alright! Tell me what you'd like to see:",
    "• 🏨 Hotels",
    "• ☕ Cafes",
    "• 🍽️ Restaurants",
    "• 🌟 Attractions (all)",
    "• 🎉 Activities",
    "• 🚌 Bus   • 🚖 Taxis   • ✈️ Flights   • 🏦 Banks",
    "For example: “show me hotels” or “cafes”."
  ].join('\n');
}

// Helpers contexts (optionnels mais utiles pour le flux Oui/Non)
function ctxName(session, short) { return `${session}/contexts/${short}`; }
function getCtx(req, short) {
  const list = req.body?.queryResult?.outputContexts || [];
  return list.find(c => c.name && c.name.endsWith(`/${short}`));
}

app.post('/webhook', async (req, res) => {
  const intentName = req.body?.queryResult?.intent?.displayName;
  const lang = langFrom(req);
  const session = req.body?.session || '';
  const cfg = INTENT_MAP[intentName];

  // --- Gestion Oui/Non (intents nouvellement ajoutés dans Dialogflow) ---
  if (intentName === 'Yes_Generic') {
    // si on a un contexte d’attente (créé après une liste), on propose le menu
    const awaiting = getCtx(req, 'awaiting_type_ctx');
    const text = buildTypeMenu(lang);
    const outputContexts = [{
      name: ctxName(session, 'awaiting_type_ctx'),
      lifespanCount: 3,
      parameters: { asked: true }
    }];
    return res.json({
      fulfillmentText: text,
      fulfillmentMessages: [{ text: { text: [text] } }],
      outputContexts
    });
  }

  if (intentName === 'No_Generic') {
    const text = (lang === 'fr')
      ? "Très bien 🙂. Si tu veux autre chose plus tard, je suis là !"
      : "Alright 🙂. If you need anything later, I’m here!";
    // on “nettoie” le contexte d’attente
    const outputContexts = [{
      name: ctxName(session, 'awaiting_type_ctx'),
      lifespanCount: 0
    }];
    return res.json({
      fulfillmentText: text,
      fulfillmentMessages: [{ text: { text: [text] } }],
      outputContexts
    });
  }

  // --- Flux principal DRY pour toutes les listes ---
  if (!cfg) {
    const text = lang === 'fr'
      ? "Désolé, je n’ai pas compris ta demande. Que souhaites-tu trouver ?"
      : "Sorry, I didn’t understand your request. What are you looking for?";
    return res.json({ fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] });
  }

  try {
    const list = await fetchWithRetry(cfg.path);

    if (!Array.isArray(list) || list.length === 0) {
      const empty = lang === 'fr'
        ? "Désolé, je n’ai rien trouvé pour l’instant."
        : "Sorry, I couldn’t find anything right now.";
      return res.json({ fulfillmentText: empty, fulfillmentMessages: [{ text: { text: [empty] } }] });
    }

    const reply = buildReply({ intentCfg: cfg, lang, fullList: list });

    // on met un petit contexte “awaiting_type_ctx” pour que “oui / non” marche juste après
    const outputContexts = [{
      name: ctxName(session, 'awaiting_type_ctx'),
      lifespanCount: 3,
      parameters: { lastIntent: intentName }
    }];

    return res.json({
      fulfillmentText: reply,
      fulfillmentMessages: [{ text: { text: [reply] } }],
      outputContexts
    });

  } catch (error) {
    console.error('Webhook error:', {
      message: error?.message,
      intent: intentName,
      path: cfg?.path,
      baseURL: BASE_URL,
    });

    const oops = lang === 'fr'
      ? "Oups, un souci technique. Réessaie dans un instant !"
      : "Oops, something went wrong. Please try again shortly!";

    return res.json({
      fulfillmentText: oops,
      fulfillmentMessages: [{ text: { text: [oops] } }]
    });
  }
});

// ---- Démarrage serveur ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook is running on http://localhost:${PORT}`);
});
