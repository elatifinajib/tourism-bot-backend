// index.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ---- Config API ----
const BASE_URL = 'https://touristeproject.onrender.com/api/public';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000, // 15s to avoid hanging requests
});

// ---- Configuration des intents (toutes celles du code d'origine) ----
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

  // ----------- Amenities -----------
  Ask_All_Amenities: {
    url: '/getAll/Amenities',
    icon: '🏨',
    intro: 'Here are some amenities that can enhance your visit:',
    empty: "Sorry, I couldn't find any amenities for you.",
  },
  Ask_Restaurants: {
    url: '/Restaurants',
    icon: '🍽️',
    intro: 'Looking for a great place to eat? Here are some top restaurants:',
    empty: "Sorry, I couldn't find any restaurants for you.",
  },
  Ask_Cafes: {
    url: '/Cafes',
    icon: '☕',
    intro: 'Looking for a cozy place to relax? Here are some popular cafes:',
    empty: "Sorry, I couldn't find any cafes for you.",
  },
  Ask_Campings: {
    url: '/Camping',
    icon: '🏕️',
    intro: 'Ready to explore the great outdoors? Here are some beautiful camping spots:',
    empty: "Sorry, I couldn't find any campgrounds for you.",
  },
  Ask_GuestHouses: {
    url: '/GuestHouses',
    icon: '🏡',
    intro: 'Looking for a homey stay? Here are some lovely guest houses:',
    empty: "Sorry, I couldn't find any guest houses for you.",
  },
  Ask_Hotels: {
    url: '/Hotels',
    icon: '🏨',
    intro: 'Here are some of the best hotels for your stay:',
    empty: "Sorry, I couldn't find any hotels for you.",
  },
  Ask_Lodges: {
    url: '/Lodges',
    icon: '🏞️',
    intro: 'Escape into nature and stay at these amazing lodges:',
    empty: "Sorry, I couldn’t find any lodges for you.",
  },

  // ----------- Activities -----------
  Ask_All_Activities: {
    url: '/getAll/Activities',
    icon: '🎉',
    intro: 'Looking for fun things to do? Here are some exciting activities to try:',
    empty: "Sorry, I couldn't find any activities for you.",
    // pas de ville dans le message d’origine
    formatter: (icon, i) => `${icon} ${i.name}`,
  },
  Ask_Traditional_Activities: {
    url: '/Activity/Traditional',
    icon: '🎉',
    intro: 'Want to experience some local traditions? Check out these amazing traditional activities:',
    empty: "Sorry, I couldn't find any traditional activities for you.",
    formatter: (icon, i) => `${icon} ${i.name}`,
  },
  Ask_Sports_Activities: {
    url: '/Activity/Sports',
    icon: '🏃‍♂️',
    intro: 'Looking for some action? Here are the best sports activities to enjoy:',
    empty: "Sorry, I couldn't find any sports activities for you.",
    formatter: (icon, i) => `${icon} ${i.name}`,
  },
  Ask_Cultural_Activities: {
    url: '/Activity/Cultural',
    icon: '🎭',
    intro: 'Immerse yourself in culture! Here are some wonderful cultural activities:',
    empty: "Sorry, I couldn't find any cultural activities for you.",
    formatter: (icon, i) => `${icon} ${i.name}`,
  },
  // NB : l’intent original s’appelle 'Ask_Adventural_Activities' (typo conservée)
  Ask_Adventural_Activities: {
    url: '/Activity/Adventure',
    icon: '🏞️',
    intro: 'Are you ready for some adventure? Here are some thrilling activities:',
    empty: "Sorry, I couldn't find any adventure activities for you.",
    formatter: (icon, i) => `${icon} ${i.name}`,
  },

  // ----------- Ancillary Services -----------
  Ask_All_AncillaryServices: {
    url: '/getAll/AncillaryService',
    icon: '🛠️',
    intro: 'Here are some additional services that can enhance your experience:',
    empty: "Sorry, I couldn't find any ancillary services for you.",
  },
  Ask_All_TourGuide: {
    url: '/Service/TourGuide',
    icon: '👨‍🏫',
    intro: 'Looking for a local guide? Here are some experienced tour guides:',
    empty: "Sorry, I couldn't find any tour guides for you.",
  },
  Ask_All_Sanitary: {
    url: '/Service/Sanitary',
    icon: '💧',
    intro: 'Here are some sanitary services available for you:',
    empty: "Sorry, I couldn't find any sanitary services for you.",
  },
  Ask_All_CarAgency: {
    url: '/Service/CarAgency',
    icon: '🚗',
    intro: 'Here are some car rental agencies to help you get around:',
    empty: "Sorry, I couldn't find any car agencies for you.",
  },
  Ask_All_Administratives: {
    url: '/Service/Administrative',
    icon: '📑',
    intro: 'Here are some administrative services you may need:',
    empty: "Sorry, I couldn't find any administrative services for you.",
  },
  Ask_All_Banks: {
    url: '/Service/Bank',
    icon: '🏦',
    intro: 'Here are some banks where you can manage your finances:',
    empty: "Sorry, I couldn't find any banks for you.",
  },

  // ----------- Accessibility -----------
  Ask_All_Accessibilities: {
    url: '/getAll/Accessibility',
    icon: '♿',
    intro: 'Here are some accessibility services to make your visit more comfortable:',
    empty: "Sorry, I couldn't find any accessibility services for you.",
  },

  // ----------- Transport -----------
  Ask_All_Bus: {
    url: '/Bus',
    icon: '🚌',
    intro: 'Looking for buses? Here are some bus services you can use:',
    empty: "Sorry, I couldn't find any bus services for you.",
  },
  Ask_All_Fly: {
    url: '/Fly',
    icon: '✈️',
    intro: 'Need a flight? Here are some flight services to get you to your destination:',
    empty: "Sorry, I couldn't find any flight services for you.",
  },
  Ask_All_Taxi: {
    url: '/Taxi',
    icon: '🚖',
    intro: 'Looking for a taxi? Here are some reliable taxi services:',
    empty: "Sorry, I couldn't find any taxi services for you.",
  },

  // ----------- Available Packages -----------
  Ask_All_AvailablePackages: {
    url: '/getAll/available_Package',
    icon: '🎁',
    intro: 'Here are some amazing available packages for you to explore:',
    empty: "Sorry, I couldn't find any available packages for you.",
  },
};

// ---- Helpers ----
function defaultFormatter(icon, item) {
  // par défaut : affiche le nom + la ville si présente
  const city = item.cityName ? ` (${item.cityName})` : '';
  return `${icon} ${item.name}${city}`;
}

function buildReply({ intro, icon, items, formatter }) {
  const fmt = formatter || defaultFormatter;
  const list = items.map((i) => fmt(icon, i)).join('\n');
  return `${intro}\n${list}`;
}

// ---- Fonction générique ----
async function handleIntent(intentName) {
  const config = intentConfig[intentName];
  if (!config) return null;

  const { url, icon, intro, empty, formatter } = config;

  const { data: items } = await api.get(url);

  if (!Array.isArray(items) || items.length === 0) {
    return empty;
  }

  return buildReply({ intro, icon, items, formatter });
}

// ---- Webhook ----
app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body?.queryResult?.intent?.displayName;
    if (!intentName) {
      return res.json({ fulfillmentText: "Sorry, I didn't understand your request." });
    }

    const reply = await handleIntent(intentName);

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

// Petite route de santé
app.get('/', (_req, res) => res.send('OK'));

// ---- Démarrage serveur ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook is running on http://localhost:${PORT}`);
});
