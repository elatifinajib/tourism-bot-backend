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
const PAGE_SIZE = 5; // pagination

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

// Fonction pour créer une carte "info" avec l'image, le titre et le sous-titre
function infoCard(item, emoji) {
  const imageUrl = item?.imageUrls?.[0] || ''; // Prendre la première image (si elle existe)
  return {
    type: 'info',
    title: `${emoji} ${item?.name || ''}`.trim(),
    subtitle: item?.cityName ? String(item.cityName) : '',
    text: item?.description || '', // Ajouter la description si disponible
    image: imageUrl ? { src: { rawUrl: imageUrl } } : { src: { rawUrl: '' } } // Ajouter l'image si disponible
  };
}

// Construit fulfillmentMessages avec richContent (listes + chips)
function buildRichList({ headerText, items, emoji, lang, hasMore, family }) {
  // Section 1: header (une "info" concise)
  const header = {
    type: 'info',
    title: headerText,
    subtitle: ''
  };

  // Section 2: cartes items
  const cards = items.map(it => infoCard(it, emoji));

  // Section 3: chips selon contexte
  const chips = hasMore ? chipsYesNo(lang) : chipsFamily(family, lang);

  return [
    { text: { text: [headerText] } }, // fallback texte (utile dans l’historique)
    {
      payload: {
        richContent: [
          [header],
          ...cards.map(c => [c]),      // chaque carte sur sa ligne
          chips                        // chips en dernier
        ]
      }
    }
  ];
}

function buildAltMenuText(family, lang) {
  if (lang === 'fr') {
    switch (family) {
      case 'attractions': return "Choisis un autre type d’attraction 👇";
      case 'activities':  return "Choisis un autre type d’activité 👇";
      case 'amenities':   return "Choisis un autre lieu utile 👇";
      case 'transport':   return "Choisis un autre transport 👇";
      case 'services':    return "Choisis un autre service 👇";
      default:            return "Dis-moi ce que tu veux voir 👇";
    }
  } else {
    switch (family) {
      case 'attractions': return "Pick another kind of attraction 👇";
      case 'activities':  return "Pick another type of activity 👇";
      case 'amenities':   return "Pick another place to visit 👇";
      case 'transport':   return "Pick another transport 👇";
      case 'services':    return "Pick another service 👇";
      default:            return "Tell me what you'd like to see 👇";
    }
  }
}

// ---------- PAGE BUILDER ----------
function buildPagedReply({ intentName, intentCfg, lang, fullList, page }) {
  const listSorted = [...fullList].sort((a, b) => {
    const ac = (a.cityName || '').localeCompare(b.cityName || '');
    if (ac !== 0) return ac;
    return (a.name || '').localeCompare(b.name || '');
  });

  const total = listSorted.length;
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = listSorted.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < total;

  const headerText = lang === 'fr'
    ? `${intentCfg.title.fr} — ${total} résultat${total>1?'s':''} (page ${page})`
    : `${intentCfg.title.en} — ${total} result${total>1?'s':''} (page ${page})`;

  const family = getFamily(intentName);
  const fulfillmentMessages = buildRichList({
    headerText,
    items: pageItems,
    emoji: intentCfg.emoji,
    lang,
    hasMore,
    family
  });

  return { fulfillmentMessages, hasMore };
}

// ---------- WEBHOOK ----------
app.post('/webhook', async (req, res) => {
  const intentName = req.body?.queryResult?.intent?.displayName;
  const lang = langFrom(req);
  const session = req.body?.session || '';
  const cfg = INTENT_MAP[intentName];

  // YES
  if (intentName === 'Yes_Generic') {
    const listCtx = getCtx(req, 'list_ctx');
    const lastIntent = listCtx?.parameters?.lastIntent;
    const nextPage = Number(listCtx?.parameters?.nextPage || 2);
    const hasMorePrev = !!listCtx?.parameters?.hasMore;
    const lastCfg = INTENT_MAP[lastIntent];

    if (lastIntent && lastCfg && hasMorePrev) {
      try {
        const full = await fetchWithRetry(lastCfg.path);
        const { fulfillmentMessages, hasMore } = buildPagedReply({
          intentName: lastIntent, intentCfg: lastCfg, lang, fullList: full, page: nextPage
        });

        const outputContexts = [{
          name: `${session}/contexts/list_ctx`,
          lifespanCount: 5,
          parameters: { lastIntent, nextPage: nextPage + 1, hasMore }
        }];

        return res.json({ fulfillmentMessages, outputContexts, fulfillmentText: '' });
      } catch (e) {
        console.error('Yes_Generic paging error:', e?.message);
      }
    }

    // sinon → chips contextuels
    const fam = getFamily(lastIntent);
    const txt = buildAltMenuText(fam, lang);
    const payload = { richContent: [ [{ type: 'info', title: txt }], ...chipsFamily(fam, lang) ] };
    const outputContexts = [{
      name: `${session}/contexts/list_ctx`,
      lifespanCount: 3,
      parameters: { lastIntent, nextPage: 1, hasMore: false }
    }];
    return res.json({
      fulfillmentText: txt,
      fulfillmentMessages: [{ text: { text: [txt] } }, { payload }],
      outputContexts
    });
  }

  // NO
  if (intentName === 'No_Generic') {
    const txt = (lang === 'fr')
      ? "Très bien 🙂. Si tu veux autre chose plus tard, je suis là !"
      : "Alright 🙂. If you need anything later, I’m here!";
    const outputContexts = [{
      name: `${session}/contexts/list_ctx`,
      lifespanCount: 0
    }];
    return res.json({
      fulfillmentText: txt,
      fulfillmentMessages: [{ text: { text: [txt] } }], 
      outputContexts
    });
  }

  // LIST INTENTS
  if (!cfg) {
    const txt = lang === 'fr'
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

    // page 1
    const { fulfillmentMessages, hasMore } = buildPagedReply({
      intentName, intentCfg: cfg, lang, fullList, page: 1
    });

    // contexte pour YES/NEXT
    const outputContexts = [{
      name: `${session}/contexts/list_ctx`,
      lifespanCount: 5,
      parameters: { lastIntent: intentName, nextPage: 2, hasMore }
    }];

    return res.json({ fulfillmentMessages, outputContexts, fulfillmentText: '' });

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
