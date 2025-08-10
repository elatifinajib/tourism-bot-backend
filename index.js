// server.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ---- CONFIG ----
const BASE_URL = process.env.PUBLIC_API_BASE || 'https://touristeproject.onrender.com/api/public';
const TIMEOUT_MS = 8000;
const RETRIES = 2;
const CACHE_TTL_MS = 60_000;
const PAGE_SIZE = 5; // <-- pagination

// Intent → endpoint + emoji + titres FR/EN
const INTENT_MAP = {
  // Attractions
  Ask_All_Attractions:        { path: '/getAll/Attraction',       emoji: '🌟', title: { fr: 'Attractions à découvrir',  en: 'Top attractions' } },
  Ask_Natural_Attractions:    { path: '/NaturalAttractions',      emoji: '🌿', title: { fr: 'Attractions naturelles',   en: 'Natural attractions' } },
  Ask_Historical_Attractions: { path: '/HistoricalAttractions',   emoji: '🏛️', title: { fr: 'Sites historiques',        en: 'Historical attractions' } },
  Ask_Cultural_Attractions:   { path: '/CulturalAttractions',     emoji: '🎭', title: { fr: 'Attractions culturelles',  en: 'Cultural attractions' } },
  Ask_Artificial_Attractions: { path: '/ArtificialAttractions',   emoji: '🏙️', title: { fr: 'Merveilles artificielles', en: 'Artificial attractions' } },

  // Hébergements / Bouffe / Lieux pratiques
  Ask_All_Amenities:          { path: '/getAll/Amenities',        emoji: '🏨', title: { fr: 'Commodités',                en: 'Amenities' } },
  Ask_Restaurants:            { path: '/Restaurants',             emoji: '🍽️', title: { fr: 'Restaurants',              en: 'Restaurants' } },
  Ask_Cafes:                  { path: '/Cafes',                   emoji: '☕',  title: { fr: 'Cafés',                    en: 'Cafes' } },
  Ask_Campings:               { path: '/Camping',                 emoji: '🏕️', title: { fr: 'Campings',                 en: 'Campings' } },
  Ask_GuestHouses:            { path: '/GuestHouses',             emoji: '🏡', title: { fr: 'Maisons d’hôtes',          en: 'Guest houses' } },
  Ask_Hotels:                 { path: '/Hotels',                  emoji: '🏨', title: { fr: 'Hôtels',                   en: 'Hotels' } },
  Ask_Lodges:                 { path: '/Lodges',                  emoji: '🏞️', title: { fr: 'Lodges',                   en: 'Lodges' } },

  // Activités
  Ask_All_Activities:         { path: '/getAll/Activities',       emoji: '🎉', title: { fr: 'Activités',                en: 'Activities' } },
  Ask_Traditional_Activities: { path: '/Activity/Traditional',    emoji: '🎉', title: { fr: 'Activités traditionnelles', en: 'Traditional activities' } },
  Ask_Sports_Activities:      { path: '/Activity/Sports',         emoji: '🏃‍♂️', title:{ fr: 'Activités sportives',     en: 'Sports activities' } },
  Ask_Adventural_Activities:  { path: '/Activity/Adventure',      emoji: '🏞️', title: { fr: 'Activités d’aventure',     en: 'Adventure activities' } },
  Ask_Cultural_Activities:    { path: '/Activity/Cultural',       emoji: '🎭', title: { fr: 'Activités culturelles',     en: 'Cultural activities' } },

  // Services annexes
  Ask_All_AncillaryServices:  { path: '/getAll/AncillaryService', emoji: '🛠️', title: { fr: 'Services annexes',         en: 'Ancillary services' } },
  Ask_All_TourGuide:          { path: '/Service/TourGuide',       emoji: '👨‍🏫', title:{ fr: 'Guides touristiques',      en: 'Tour guides' } },
  Ask_All_Sanitary:           { path: '/Service/Sanitary',        emoji: '💧', title: { fr: 'Services sanitaires',       en: 'Sanitary services' } },
  Ask_All_CarAgency:          { path: '/Service/CarAgency',       emoji: '🚗', title: { fr: 'Agences de location',       en: 'Car rental agencies' } },
  Ask_All_Administratives:    { path: '/Service/Administrative',  emoji: '📑', title: { fr: 'Services administratifs',   en: 'Administrative services' } },
  Ask_All_Banks:              { path: '/Service/Bank',            emoji: '🏦', title: { fr: 'Banques',                   en: 'Banks' } },

  // Accessibilité & Transport
  Ask_All_Accessibilities:    { path: '/getAll/Accessibility',    emoji: '♿', title: { fr: 'Accessibilité',             en: 'Accessibility services' } },
  Ask_All_Bus:                { path: '/Bus',                     emoji: '🚌', title: { fr: 'Services de bus',           en: 'Bus services' } },
  Ask_All_Fly:                { path: '/Fly',                     emoji: '✈️', title: { fr: 'Vols',                      en: 'Flight services' } },
  Ask_All_Taxi:               { path: '/Taxi',                    emoji: '🚖', title: { fr: 'Taxis',                     en: 'Taxi services' } },
};

// ---- Familles pour menu contextuel ----
function getFamily(intent) {
  if (!intent) return 'generic';
  if (intent.includes('Attractions')) return 'attractions';
  if (intent.includes('Activities')) return 'activities';
  if (['Ask_Hotels','Ask_Cafes','Ask_Restaurants','Ask_Lodges','Ask_GuestHouses','Ask_Campings','Ask_All_Amenities'].includes(intent)) return 'amenities';
  if (['Ask_All_Bus','Ask_All_Taxi','Ask_All_Fly'].includes(intent)) return 'transport';
  if (['Ask_All_AncillaryServices','Ask_All_TourGuide','Ask_All_Sanitary','Ask_All_CarAgency','Ask_All_Administratives','Ask_All_Banks','Ask_All_Accessibilities'].includes(intent)) return 'services';
  return 'generic';
}

// ---- HTTP client axios ----
const api = axios.create({ baseURL: BASE_URL, timeout: TIMEOUT_MS });

// ---- Cache mémoire ----
const cache = new Map();
const setCache = (k, data) => cache.set(k, { data, expiry: Date.now() + CACHE_TTL_MS });
function getCache(k) {
  const e = cache.get(k);
  if (!e) return null;
  if (Date.now() > e.expiry) { cache.delete(k); return null; }
  return e.data;
}

// ---- Utils ----
const safeArray = x => Array.isArray(x) ? x : [];
const langFrom = req => ((req.body?.queryResult?.languageCode || '').toLowerCase().startsWith('fr') ? 'fr' : 'en');
const ctxName = (session, short) => `${session}/contexts/${short}`;
function getCtx(req, short) {
  const list = req.body?.queryResult?.outputContexts || [];
  return list.find(c => c.name && c.name.endsWith(`/${short}`));
}

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
      await new Promise(r => setTimeout(r, 200 * i));
    }
  }
  throw lastErr;
}

function buildAltMenu(family, lang) {
  if (lang === 'fr') {
    switch (family) {
      case 'attractions':
        return [
          "Tu veux voir un autre type d’attraction ?",
          "• 🌿 Naturelles   • 🏛️ Historiques",
          "• 🎭 Culturelles   • 🏙️ Artificielles",
          "Par exemple : « attractions naturelles » ou « attractions culturelles »."
        ].join('\n');
      case 'activities':
        return [
          "Tu veux un autre type d’activité ?",
          "• 🎭 Culturelles   • 🏃‍♂️ Sportives",
          "• 🎉 Traditionnelles   • 🏞️ Aventure",
          "Exemples : « activités sportives », « activités culturelles »."
        ].join('\n');
      case 'amenities':
        return [
          "Tu veux voir un autre lieu utile ?",
          "• 🏨 Hôtels   • ☕ Cafés   • 🍽️ Restaurants",
          "• 🏡 Maisons d’hôtes   • 🏞️ Lodges   • 🏕️ Campings",
          "Exemples : « montre-moi les hôtels », « cafés »."
        ].join('\n');
      case 'transport':
        return [
          "Besoin d’un autre transport ?",
          "• 🚌 Bus   • 🚖 Taxis   • ✈️ Vols",
          "Exemples : « bus », « taxis », « vols »."
        ].join('\n');
      case 'services':
        return [
          "Un autre service ?",
          "• 🛠️ Annexes   • 👨‍🏫 Guides   • 💧 Sanitaires",
          "• 🚗 Agences auto   • 📑 Administratifs   • 🏦 Banques   • ♿ Accessibilité",
          "Exemples : « banques », « guides touristiques »."
        ].join('\n');
      default:
        return [
          "D’accord ! Dis-moi ce que tu veux voir :",
          "• 🌟 Attractions   • 🎉 Activités",
          "• 🏨 Hôtels   • ☕ Cafés   • 🍽️ Restaurants",
          "• 🚌 Bus   • 🚖 Taxis   • ✈️ Vols   • 🏦 Banques",
          "Exemples : « attractions naturelles », « hôtels », « taxis »."
        ].join('\n');
    }
  } else {
    switch (family) {
      case 'attractions':
        return [
          "Want a different kind of attraction?",
          "• 🌿 Natural   • 🏛️ Historical",
          "• 🎭 Cultural   • 🏙️ Artificial",
          'Try: "natural attractions" or "cultural attractions".'
        ].join('\n');
      case 'activities':
        return [
          "Want a different type of activity?",
          "• 🎭 Cultural   • 🏃‍♂️ Sports",
          "• 🎉 Traditional   • 🏞️ Adventure",
          'E.g., "sports activities", "cultural activities".'
        ].join('\n');
      case 'amenities':
        return [
          "Want another place to visit?",
          "• 🏨 Hotels   • ☕ Cafes   • 🍽️ Restaurants",
          "• 🏡 Guest houses   • 🏞️ Lodges   • 🏕️ Campings",
          'E.g., "show me hotels", "cafes".'
        ].join('\n');
      case 'transport':
        return [
          "Need a different transport?",
          "• 🚌 Bus   • 🚖 Taxis   • ✈️ Flights",
          'E.g., "bus", "taxis", "flights".'
        ].join('\n');
      case 'services':
        return [
          "Another service?",
          "• 🛠️ Ancillary   • 👨‍🏫 Tour guides   • 💧 Sanitary",
          "• 🚗 Car agencies   • 📑 Administrative   • 🏦 Banks   • ♿ Accessibility",
          'E.g., "banks", "tour guides".'
        ].join('\n');
      default:
        return [
          "Alright! Tell me what you'd like to see:",
          "• 🌟 Attractions   • 🎉 Activities",
          "• 🏨 Hotels   • ☕ Cafes   • 🍽️ Restaurants",
          "• 🚌 Bus   • 🚖 Taxis   • ✈️ Flights   • 🏦 Banks",
          'For example: "natural attractions", "hotels", "taxis".'
        ].join('\n');
    }
  }
}

// construit la réponse d’une page + CTA contextuel
function buildPagedReply({ intentName, intentCfg, lang, fullList, page }) {
  // tri pour affichage propre
  const listSorted = [...fullList].sort((a, b) => {
    const ac = (a.cityName || '').localeCompare(b.cityName || '');
    if (ac !== 0) return ac;
    return (a.name || '').localeCompare(b.name || '');
  });

  const total = listSorted.length;
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = listSorted.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < total;

  const header = lang === 'fr'
    ? `${intentCfg.title.fr} — ${total} résultat${total>1?'s':''} (page ${page})`
    : `${intentCfg.title.en} — ${total} result${total>1?'s':''} (page ${page})`;

  const body = formatList(pageItems, intentCfg.emoji);

  let cta;
  if (hasMore) {
    cta = (lang === 'fr')
      ? `\n\nTu veux voir plus ? Réponds “oui” ou “non”.`
      : `\n\nWant to see more? Reply “yes” or “no”.`;
  } else {
    // plus rien à paginer → menu contextuel selon la famille
    const fam = getFamily(intentName);
    cta = `\n\n${buildAltMenu(fam, lang)}`;
  }

  return {
    text: `${header}\n${body}${cta}`,
    hasMore,
  };
}

app.post('/webhook', async (req, res) => {
  const intentName = req.body?.queryResult?.intent?.displayName;
  const lang = langFrom(req);
  const session = req.body?.session || '';
  const cfg = INTENT_MAP[intentName];

  // ----- YES / NO intents -----
  if (intentName === 'Yes_Generic') {
    // récupérer contexte de liste (si présent)
    const listCtx = getCtx(req, 'list_ctx');
    const lastIntent = listCtx?.parameters?.lastIntent;
    const nextPage = Number(listCtx?.parameters?.nextPage || 2);
    const hasMorePrev = !!listCtx?.parameters?.hasMore;
    const lastCfg = INTENT_MAP[lastIntent];

    // si on a encore des résultats → page suivante
    if (lastIntent && lastCfg && hasMorePrev) {
      try {
        const full = await fetchWithRetry(lastCfg.path);
        const { text, hasMore } = buildPagedReply({
          intentName: lastIntent, intentCfg: lastCfg, lang, fullList: full, page: nextPage
        });

        const outputContexts = [{
          name: ctxName(session, 'list_ctx'),
          lifespanCount: 5,
          parameters: { lastIntent, nextPage: nextPage + 1, hasMore }
        }];

        return res.json({
          fulfillmentText: text,
          fulfillmentMessages: [{ text: { text: [text] } }],
          outputContexts
        });
      } catch (e) {
        console.error('Yes_Generic paging error:', e?.message);
      }
    }

    // sinon → proposer un menu contextuel basé sur le dernier intent (ou générique)
    const fam = getFamily(lastIntent);
    const menu = buildAltMenu(fam, lang);
    const outputContexts = [{
      name: ctxName(session, 'list_ctx'),
      lifespanCount: 3,
      parameters: { lastIntent, nextPage: 1, hasMore: false }
    }];
    return res.json({
      fulfillmentText: menu,
      fulfillmentMessages: [{ text: { text: [menu] } }],
      outputContexts
    });
  }

  if (intentName === 'No_Generic') {
    const txt = (lang === 'fr')
      ? "Très bien 🙂. Si tu veux autre chose plus tard, je suis là !"
      : "Alright 🙂. If you need anything later, I’m here!";
    // on garde/expire le contexte list_ctx
    const outputContexts = [{
      name: ctxName(session, 'list_ctx'),
      lifespanCount: 0
    }];
    return res.json({
      fulfillmentText: txt,
      fulfillmentMessages: [{ text: { text: [txt] } }],
      outputContexts
    });
  }

  // ----- Flux principal pour toutes les listes -----
  if (!cfg) {
    const txt = (lang === 'fr')
      ? "Désolé, je n’ai pas compris ta demande. Que souhaites-tu trouver ?"
      : "Sorry, I didn’t understand your request. What are you looking for?";
    return res.json({ fulfillmentText: txt, fulfillmentMessages: [{ text: { text: [txt] } }] });
  }

  try {
    const fullList = await fetchWithRetry(cfg.path);

    if (!Array.isArray(fullList) || fullList.length === 0) {
      const empty = lang === 'fr'
        ? "Désolé, je n’ai rien trouvé pour l’instant."
        : "Sorry, I couldn’t find anything right now.";
      return res.json({ fulfillmentText: empty, fulfillmentMessages: [{ text: { text: [empty] } }] });
    }

    // page 1 par défaut
    const { text, hasMore } = buildPagedReply({
      intentName, intentCfg: cfg, lang, fullList, page: 1
    });

    // contexte pour gérer “yes” → page suivante OU menu contextuel
    const outputContexts = [{
      name: ctxName(session, 'list_ctx'),
      lifespanCount: 5,
      parameters: { lastIntent: intentName, nextPage: 2, hasMore }
    }];

    return res.json({
      fulfillmentText: text,
      fulfillmentMessages: [{ text: { text: [text] } }],
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
