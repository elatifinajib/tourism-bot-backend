// server.js — Version optimisée avec cache et meilleurs timeouts
// ---------------------- Imports & Setup ----------------------
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

app.use(bodyParser.json());

// ---------------------- Cache système ----------------------
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCachedData(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

// ---------------------- Config API Optimisée ----------------------
const BASE_URL = 'https://touristeproject.onrender.com/api/public';
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000, // Réduit de 15s à 10s
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
});

// ---------------------- Formatters ----------------------
function defaultFormatter(icon, item) {
  const city = item.cityName ? ` (${item.cityName})` : '';
  return `${icon} ${item.name}${city}`;
}

function buildReply({ intro, icon, items, formatter }) {
  const fmt = formatter || defaultFormatter;
  // Limite à 10 éléments maximum pour éviter les réponses trop longues
  const limitedItems = items.slice(0, 10);
  const list = limitedItems.map((i) => fmt(icon, i)).join('\n\n');
  const moreText = items.length > 10 ? `\n\n... and ${items.length - 10} more attractions!` : '';
  return `${intro}\n${list}${moreText}`;
}

// ---------------------- Intents Configuration ----------------------
const intentConfig = {
  Ask_All_Attractions: {
    url: '/getAll/Attraction',
    icon: '🌟',
    intro: 'Discover the best attractions around! Here are some of the top spots:',
    empty: "Sorry, I couldn't find any attractions for you.",
    formatter: defaultFormatter,
    cacheKey: 'all_attractions'
  },
};

// ---------------------- Handler générique avec cache ----------------------
async function handleIntent(intentName) {
  const config = intentConfig[intentName];
  if (!config) {
    return "Sorry, I didn't understand your request.";
  }

  const { url, icon, intro, formatter, empty, cacheKey } = config;
  
  try {
    // Vérifier le cache d'abord
    if (cacheKey) {
      const cachedResult = getCachedData(cacheKey);
      if (cachedResult) {
        console.log('Cache hit for:', cacheKey);
        return cachedResult;
      }
    }

    console.log('Fetching from API:', url);
    const startTime = Date.now();
    
    const { data } = await api.get(url);
    
    const endTime = Date.now();
    console.log(`API call took: ${endTime - startTime}ms`);
    
    const arr = Array.isArray(data) ? data : [data];
    if (!arr?.length) return empty;

    const reply = buildReply({ intro, icon, items: arr, formatter });
    
    // Mettre en cache le résultat
    if (cacheKey) {
      setCachedData(cacheKey, reply);
    }
    
    return reply;
    
  } catch (error) {
    console.error('Fetch error:', error?.message);
    console.error('Error details:', {
      code: error?.code,
      response: error?.response?.status,
      timeout: error?.code === 'ECONNABORTED'
    });
    
    return 'Oops, something went wrong while fetching information. Please try again later!';
  }
}

// ---------------------- Webhook avec meilleure gestion d'erreurs ----------------------
app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const intentName = req.body?.queryResult?.intent?.displayName;
    console.log('Received intent:', intentName);
    
    if (!intentName) {
      return res.json({ 
        fulfillmentText: "Sorry, I didn't understand your request." 
      });
    }

    const reply = await handleIntent(intentName);
    const processingTime = Date.now() - startTime;
    
    console.log(`Total processing time: ${processingTime}ms`);
    
    return res.json({
      fulfillmentText: reply,
      fulfillmentMessages: [{ text: { text: [reply] } }],
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Webhook error:', error?.message);
    console.error('Processing time before error:', processingTime);
    
    return res.json({
      fulfillmentText: 'Oops, something went wrong while fetching information. Please try again later!',
    });
  }
});

// ---------------------- Health Route avec diagnostics ----------------------
app.get('/', (req, res) => {
  const cacheStats = {
    entries: cache.size,
    keys: Array.from(cache.keys())
  };
  
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    cache: cacheStats,
    timestamp: new Date().toISOString()
  });
});

// ---------------------- Test endpoint pour diagnostics ----------------------
app.get('/test-api', async (req, res) => {
  try {
    const startTime = Date.now();
    const response = await api.get('/getAll/Attraction');
    const endTime = Date.now();
    
    res.json({
      success: true,
      responseTime: endTime - startTime,
      dataCount: Array.isArray(response.data) ? response.data.length : 1,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
  }
});

// ---------------------- Nettoyage périodique du cache ----------------------
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.delete(key);
      console.log('Cache expired for key:', key);
    }
  }
}, 60000); // Nettoie toutes les minutes

// ---------------------- Lancement ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook is running on http://localhost:${PORT}`);
  console.log('Cache system initialized');
});