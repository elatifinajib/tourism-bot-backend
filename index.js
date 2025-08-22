// index.cleaned.js — Tourism Bot Backend (Dialogflow-first, cleaned)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Config ----
const API_BASE_URL = process.env.API_BASE_URL || 'https://touristeproject.onrender.com';
const PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID || 'tourisme-bot-sxin';
const ITEMS_PER_PAGE = 10;

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- In-memory session storage (pagination state) ----
const sessionStorage = new Map();

// ---- Google Auth (Dialogflow) ----
let googleAuth = null;
let cachedToken = null;
let tokenExpiry = null; // ms epoch

async function initializeGoogleAuth() {
  try {
    const hasJson = !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const hasFile = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!hasJson && !hasFile) return; // run without Dialogflow if not configured

    const { GoogleAuth } = require('google-auth-library');
    googleAuth = hasJson
      ? new GoogleAuth({
          credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
          scopes: ['https://www.googleapis.com/auth/dialogflow'],
        })
      : new GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ['https://www.googleapis.com/auth/dialogflow'],
        });
  } catch (err) {
    console.error('Google Auth init error:', err.message);
    googleAuth = null; // fallback mode
  }
}

async function getGoogleAccessToken() {
  if (!googleAuth) throw new Error('Google Auth not initialized');

  // reuse token if still valid (5 min buffer)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  const client = await googleAuth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse.token;
  if (!token) throw new Error('Failed to obtain access token');

  // try reading expiry if available on client
  const { expiry_date } = client.credentials || {};
  cachedToken = token;
  tokenExpiry = typeof expiry_date === 'number' ? expiry_date : Date.now() + 50 * 60 * 1000; // ~50min default
  return token;
}

// ---- HTTP helper with retry ----
async function makeApiCall(url, maxRetries = 3, timeoutMs = 30000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get(url, {
        timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Tourism-Bot/1.0' },
      });
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (attempt - 1), 5000)));
    }
  }
}

// ---- Health & diagnostics ----
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    dialogflowConfigured: !!googleAuth,
    projectId: PROJECT_ID,
    endpoints: {
      webhook: 'POST /webhook',
      dialogflowProxy: 'POST /dialogflow-proxy',
      test: 'GET /test',
      token: 'GET /get-dialogflow-token',
      checkConfig: 'GET /check-dialogflow-config',
    },
  });
});

app.get('/test', async (_req, res) => {
  try {
    const r = await makeApiCall(`${API_BASE_URL}/api/public/getAll/Attraction`);
    res.json({ message: 'Tourism API OK', attractionsCount: r.data?.length || 0, sample: r.data?.[0] || null });
  } catch (e) {
    res.status(500).json({ message: 'Tourism API error', error: e.message });
  }
});

app.get('/get-dialogflow-token', async (_req, res) => {
  try {
    const token = await getGoogleAccessToken();
    res.json({ access_token: token, expires_in: Math.max(0, Math.floor((tokenExpiry - Date.now()) / 1000)), token_type: 'Bearer', project_id: PROJECT_ID });
  } catch (e) {
    res.status(500).json({ error: 'Failed to obtain Dialogflow access token', message: e.message });
  }
});

app.get('/test-dialogflow-api', async (_req, res) => {
  try {
    const token = await getGoogleAccessToken();
    const sessionPath = `projects/${PROJECT_ID}/agent/sessions/test-session`;
    const url = `https://dialogflow.googleapis.com/v2/${sessionPath}:detectIntent`;
    const payload = { queryInput: { text: { text: 'hello', languageCode: 'en-US' } } };
    const df = await axios.post(url, payload, { headers: { Authorization: `Bearer ${token}` } });
    const qr = df.data.queryResult || {};
    res.json({ success: true, intent: qr.intent?.displayName, fulfillmentText: qr.fulfillmentText, confidence: qr.intentDetectionConfidence, projectId: PROJECT_ID });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Dialogflow API test failed', error: e.message });
  }
});

app.get('/check-dialogflow-config', (_req, res) => {
  res.json({
    projectId: PROJECT_ID,
    googleAuthInitialized: !!googleAuth,
    credentialsConfigured: !!(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS),
    tokenCached: !!cachedToken,
    tokenExpiry: tokenExpiry ? new Date(tokenExpiry).toISOString() : null,
  });
});

// ---- Dialogflow proxy (for Flutter) ----
app.post('/dialogflow-proxy', async (req, res) => {
  try {
    const { message, sessionId } = req.body || {};
    if (!message || !sessionId) return res.status(400).json({ fulfillmentText: 'Missing message or sessionId.' });

    if (!googleAuth) return res.status(503).json({ fulfillmentText: 'Dialogflow not configured.' });

    const token = await getGoogleAccessToken();
    const sessionPath = `projects/${PROJECT_ID}/agent/sessions/${sessionId}`;
    const url = `https://dialogflow.googleapis.com/v2/${sessionPath}:detectIntent`;
    const payload = { queryInput: { text: { text: message, languageCode: 'en-US' } } };
    const df = await axios.post(url, payload, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });

    const qr = df.data.queryResult || {};
    const response = await handleIntent(
      qr.intent?.displayName,
      qr.parameters || {},
      sessionId,
      qr.outputContexts || [],
      qr.fulfillmentText || ''
    );
    res.json(response);
  } catch (e) {
    res.status(500).json({ fulfillmentText: "I'm having trouble connecting to Dialogflow. Please try again." });
  }
});

// ---- Dialogflow webhook (fulfillment) ----
app.post('/webhook', async (req, res) => {
  try {
    const qr = req.body?.queryResult || {};
    const intentName = qr.intent?.displayName;
    const sessionId = extractSessionId(req.body?.session);
    if (!intentName) return res.json({ fulfillmentText: "I didn't understand that. Could you rephrase?" });

    // If a pagination flow is active and user typed a free text, try to decide show-more/decline here
    const sessionData = getSessionData(sessionId);
    const queryText = qr.queryText || '';
    if (sessionData?.waitingForMoreResponse) {
      if (isUserWantingMore(queryText)) return res.json(await handleShowMoreFromContext(sessionId));
      if (isUserDeclining(queryText)) return res.json(await handleDeclineFromContext(sessionId));
    }

    const response = await handleIntent(intentName, qr.parameters || {}, sessionId, qr.outputContexts || [], qr.fulfillmentText || '');
    res.json(response);
  } catch (e) {
    res.status(500).json({ fulfillmentText: "Sorry, I'm experiencing technical difficulties. Please try again in a moment." });
  }
});

// ---- Intent router (single source of truth) ----
async function handleIntent(intentName, parameters, sessionId, outputContexts, fallbackFulfillmentText) {
  try {
    switch (intentName) {
      case 'Ask_All_Attractions':
        return await handleAllAttractionsWithContext(sessionId, outputContexts);
      case 'Ask_Natural_Attractions':
        return await handleNaturalAttractionsWithContext(sessionId, outputContexts);
      case 'Ask_Cultural_Attractions':
        return await handleCulturalAttractionsWithContext(sessionId, outputContexts);
      case 'Ask_Historical_Attractions':
        return await handleHistoricalAttractionsWithContext(sessionId, outputContexts);
      case 'Ask_Artificial_Attractions':
        return await handleArtificialAttractionsWithContext(sessionId, outputContexts);
      case 'Ask_Attractions_By_City': {
        const cityName = parameters.city || parameters['geo-city'] || parameters.name;
        return await handleAttractionsByCityWithContext(sessionId, cityName, outputContexts);
      }
      case 'Pagination_ShowMore':
        return await handleShowMoreFromContext(sessionId);
      case 'Pagination_Decline':
        return await handleDeclineFromContext(sessionId);
      case 'Default Welcome Intent':
        return { fulfillmentText: fallbackFulfillmentText || 'Welcome to Draa-Tafilalet Tourism Assistant!' };
      default:
        return { fulfillmentText: fallbackFulfillmentText || `I'm not sure how to help with "${intentName}".` };
    }
  } catch (e) {
    return { fulfillmentText: 'There was an error processing your request.' };
  }
}

// ---- Category handlers (Dialogflow-context aware) ----
async function handleAllAttractionsWithContext(sessionId, outputContexts) {
  try {
    const r = await makeApiCall(`${API_BASE_URL}/api/public/getAll/Attraction`);
    return handlePaginatedResponseWithContext(r.data || [], 'all', 'general', sessionId, outputContexts);
  } catch {
    return { fulfillmentText: 'Having trouble accessing attractions database.' };
  }
}

async function handleNaturalAttractionsWithContext(sessionId, outputContexts) {
  try {
    const r = await makeApiCall(`${API_BASE_URL}/api/public/NaturalAttractions`);
    return handlePaginatedResponseWithContext(r.data || [], 'natural', 'natural', sessionId, outputContexts);
  } catch {
    return { fulfillmentText: 'Having trouble finding natural attractions.' };
  }
}

async function handleCulturalAttractionsWithContext(sessionId, outputContexts) {
  try {
    const r = await makeApiCall(`${API_BASE_URL}/api/public/CulturalAttractions`);
    return handlePaginatedResponseWithContext(r.data || [], 'cultural', 'cultural', sessionId, outputContexts);
  } catch {
    return { fulfillmentText: 'Having trouble finding cultural attractions.' };
  }
}

async function handleHistoricalAttractionsWithContext(sessionId, outputContexts) {
  try {
    const r = await makeApiCall(`${API_BASE_URL}/api/public/HistoricalAttractions`);
    return handlePaginatedResponseWithContext(r.data || [], 'historical', 'historical', sessionId, outputContexts);
  } catch {
    return { fulfillmentText: 'Having trouble finding historical attractions.' };
  }
}

async function handleArtificialAttractionsWithContext(sessionId, outputContexts) {
  try {
    const r = await makeApiCall(`${API_BASE_URL}/api/public/ArtificialAttractions`);
    return handlePaginatedResponseWithContext(r.data || [], 'artificial', 'artificial', sessionId, outputContexts);
  } catch {
    return { fulfillmentText: 'Having trouble finding artificial attractions.' };
  }
}

async function handleAttractionsByCityWithContext(sessionId, cityName, outputContexts) {
  try {
    if (!cityName) return { fulfillmentText: "Please tell me which city you're interested in." };

    const cityResult = await tryMultipleCityVariants(cityName);
    if (!cityResult.success) return { fulfillmentText: `I couldn't find information about "${cityName}". Try another city.` };

    const attractions = (cityResult.data || []).filter((loc) =>
      Object.prototype.hasOwnProperty.call(loc, 'entryFre') &&
      Object.prototype.hasOwnProperty.call(loc, 'guideToursAvailable')
    );

    if (!attractions.length) return { fulfillmentText: `No tourist attractions found in ${cityName}.` };

    const formattedCityName = cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase();
    return handlePaginatedResponseWithContext(
      attractions,
      `city_${formattedCityName.toLowerCase()}`,
      `attractions in ${formattedCityName}`,
      sessionId,
      outputContexts,
      formattedCityName
    );
  } catch {
    return { fulfillmentText: `Having trouble finding attractions in ${cityName}.` };
  }
}

// ---- Pagination (context-aware) ----
function handlePaginatedResponseWithContext(allAttractions, category, categoryDisplayName, sessionId, _outputContexts, cityName = null) {
  const totalCount = allAttractions.length;
  if (!totalCount) return { fulfillmentText: 'No attractions found.' };

  if (totalCount <= ITEMS_PER_PAGE) {
    const headline = cityName
      ? `I found ${totalCount} wonderful attractions in ${cityName}!`
      : {
          all: `I found ${totalCount} amazing attractions in Draa-Tafilalet!`,
          natural: `I found ${totalCount} beautiful natural attractions!`,
          cultural: `I found ${totalCount} fascinating cultural attractions!`,
          historical: `I found ${totalCount} remarkable historical attractions!`,
          artificial: `I found ${totalCount} impressive artificial attractions!`,
        }[category] || `I found ${totalCount} attractions!`;

    return {
      fulfillmentText: headline,
      payload: {
        flutter: {
          type: 'attractions_list',
          category,
          data: { attractions: allAttractions, count: totalCount, cityName },
          actions: [
            { type: 'view_details', label: 'View Details', icon: 'info' },
            { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' },
          ],
        },
      },
    };
  }

  const firstPage = allAttractions.slice(0, ITEMS_PER_PAGE);
  const remaining = allAttractions.slice(ITEMS_PER_PAGE);

  saveSessionData(sessionId, {
    remainingAttractions: remaining,
    category,
    categoryDisplayName,
    cityName,
    waitingForMoreResponse: true,
  });

  const headline = cityName
    ? `I found ${totalCount} attractions in ${cityName}! Here are the first ${ITEMS_PER_PAGE}:`
    : `I found ${totalCount} ${categoryDisplayName} attractions! Here are the first ${ITEMS_PER_PAGE}:`;

  return {
    fulfillmentText: headline,
    payload: {
      flutter: {
        type: 'attractions_list_with_more',
        category,
        data: {
          attractions: firstPage,
          count: firstPage.length,
          hasMore: true,
          totalCount,
          remainingCount: remaining.length,
          cityName,
          sendMoreMessage: true,
        },
        actions: [
          { type: 'view_details', label: 'View Details', icon: 'info' },
          { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
          { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' },
        ],
      },
    },
  };
}

// ---- Pagination intents ----
async function handleShowMoreFromContext(sessionId) {
  const data = sessionStorage.get(sessionId);
  if (!data?.remainingAttractions?.length) {
    return { fulfillmentText: "I don't have any additional attractions to show right now." };
  }
  const { remainingAttractions, category, categoryDisplayName, cityName } = data;
  sessionStorage.delete(sessionId);

  return {
    fulfillmentText: cityName
      ? `Perfect! Here are all the remaining attractions in ${cityName}:`
      : `Perfect! Here are all the remaining ${categoryDisplayName} attractions:`,
    payload: {
      flutter: {
        type: 'attractions_list',
        category,
        data: { attractions: remainingAttractions, count: remainingAttractions.length, cityName },
        actions: [
          { type: 'view_details', label: 'View Details', icon: 'info' },
          { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
          { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' },
        ],
      },
    },
  };
}

async function handleDeclineFromContext(sessionId) {
  if (sessionId) sessionStorage.delete(sessionId);
  return { fulfillmentText: "No problem! I'm here whenever you need help discovering attractions in Draa-Tafilalet." };
}

// ---- City variants helper ----
async function tryMultipleCityVariants(cityName) {
  const variants = Array.from(
    new Set([
      cityName,
      cityName.toLowerCase(),
      cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase(),
      cityName.toUpperCase(),
    ])
  );

  let all = [];
  for (const v of variants) {
    try {
      const r = await makeApiCall(`${API_BASE_URL}/api/public/getLocationByCity/${encodeURIComponent(v)}`);
      const arr = Array.isArray(r.data) ? r.data : [];
      const deduped = arr.filter((item) => !all.some((x) => x.id_Location === item.id_Location));
      all = all.concat(deduped);
    } catch {
      // ignore and try next variant
    }
  }

  return { success: all.length > 0, data: all, totalFound: all.length };
}

// ---- Utils ----
function extractSessionId(sessionPath) {
  return sessionPath ? String(sessionPath).split('/').pop() : 'default-session';
}

function isUserWantingMore(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return ['yes', 'oui', 'ok', 'okay', 'sure', 'please', 'show more', 'voir plus', 'more', 'continue', "d'accord", 'bien sûr'].some((t) => lower.includes(t));
}

function isUserDeclining(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return ['no', 'non', 'nope', 'not now', 'maybe later', "that's enough", 'pas maintenant', 'merci'].some((t) => lower.includes(t));
}

function saveSessionData(sessionId, data) {
  const existing = sessionStorage.get(sessionId) || {};
  sessionStorage.set(sessionId, { ...existing, ...data, timestamp: Date.now() });
}

function getSessionData(sessionId) {
  const data = sessionStorage.get(sessionId);
  if (!data) return null;
  if (Date.now() - (data.timestamp || 0) > 60 * 60 * 1000) {
    sessionStorage.delete(sessionId);
    return null;
  }
  return data;
}

// ---- Global error handler ----
app.use((err, _req, res, _next) => {
  console.error('Global error:', err);
  res.status(500).json({ fulfillmentText: 'An unexpected error occurred.' });
});

// ---- Start ----
initializeGoogleAuth()
  .catch((e) => console.error('Failed to initialize Google Auth:', e.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Tourism Bot Backend listening on :${PORT}`);
      console.log(`API_BASE_URL: ${API_BASE_URL}`);
      console.log(`Dialogflow configured: ${!!googleAuth}`);
    });
  });

module.exports = app;
