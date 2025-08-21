// index.js - Code complet avec intégration Dialogflow
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Base URL
const API_BASE_URL = 'https://touristeproject.onrender.com';

// Session storage pour gérer le flux de pagination
const sessionStorage = new Map();

// 🔑 Configuration Google Cloud
const PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID || 'tourisme-bot-sxin';

// Configuration des credentials Google
let googleAuth = null;
let cachedToken = null;
let tokenExpiry = null;

// Initialiser Google Auth
async function initializeGoogleAuth() {
  try {
    console.log('🔑 Initializing Google Auth...');
    
    // Option A : Utiliser JSON depuis variable d'environnement
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      
      const { GoogleAuth } = require('google-auth-library');
      googleAuth = new GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/dialogflow'],
      });
      
      console.log('✅ Google Auth initialized with JSON credentials');
    }
    // Option B : Utiliser fichier
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const { GoogleAuth } = require('google-auth-library');
      googleAuth = new GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/dialogflow'],
      });
      
      console.log('✅ Google Auth initialized with file credentials');
    }
    else {
      console.warn('⚠️ No Google credentials configured - using fallback mode');
    }
  } catch (error) {
    console.error('❌ Error initializing Google Auth:', error);
  }
}

// Fonction pour obtenir un token d'accès
async function getGoogleAccessToken() {
  try {
    if (!googleAuth) {
      throw new Error('Google Auth not initialized');
    }

    // Vérifier si on a un token valide en cache
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 300000) { // 5 min de marge
      console.log('✅ Using cached Google token');
      return cachedToken;
    }

    console.log('🔄 Getting fresh Google token...');
    const client = await googleAuth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (tokenResponse.token) {
      cachedToken = tokenResponse.token;
      tokenExpiry = tokenResponse.expiry_date;
      
      console.log('✅ New Google token obtained');
      console.log(`⏰ Token expires at: ${new Date(tokenExpiry)}`);
      
      return tokenResponse.token;
    } else {
      throw new Error('Failed to obtain access token');
    }
  } catch (error) {
    console.error('❌ Error getting Google token:', error);
    throw error;
  }
}

// Fonction utilitaire pour appels API avec retry
async function makeApiCall(url, maxRetries = 3, timeoutMs = 30000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 API call attempt ${attempt}/${maxRetries} to: ${url}`);
      
      const response = await axios.get(url, {
        timeout: timeoutMs,
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'Tourism-Bot/1.0'
        }
      });

      console.log(`✅ API call successful on attempt ${attempt}`);
      return response;
      
    } catch (error) {
      console.log(`❌ API call attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`⏳ Waiting ${delayMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Tourism Bot Backend with REAL Dialogflow is running!',
    timestamp: new Date().toISOString(),
    dialogflowConfigured: !!googleAuth,
    projectId: PROJECT_ID,
    endpoints: {
      webhook: '/webhook (Dialogflow)',
      dialogflowProxy: '/dialogflow-proxy (Flutter)',
      health: '/',
      test: '/test',
      dialogflowToken: '/get-dialogflow-token',
      testDialogflow: '/test-dialogflow-api',
      checkConfig: '/check-dialogflow-config'
    }
  });
});

// Test endpoint
app.get('/test', async (req, res) => {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/getAll/Attraction`);
    res.json({
      message: '✅ Connection to Tourism API successful',
      attractionsCount: response.data.length,
      sampleAttraction: response.data[0] || null
    });
  } catch (error) {
    res.status(500).json({
      message: '❌ Failed to connect to Tourism API',
      error: error.message
    });
  }
});

// 🔑 Endpoint pour obtenir l'access token Dialogflow
app.get('/get-dialogflow-token', async (req, res) => {
  try {
    console.log('🔑 Request for Dialogflow access token...');

    const token = await getGoogleAccessToken();
    
    res.json({
      access_token: token,
      expires_in: Math.floor((tokenExpiry - Date.now()) / 1000),
      token_type: 'Bearer',
      project_id: PROJECT_ID
    });

  } catch (error) {
    console.error('❌ Error getting Dialogflow token:', error);
    res.status(500).json({
      error: 'Failed to obtain Dialogflow access token',
      message: error.message
    });
  }
});

// 🧪 Endpoint pour tester l'API Dialogflow directement
app.get('/test-dialogflow-api', async (req, res) => {
  try {
    console.log('🧪 Testing direct Dialogflow API call...');

    const token = await getGoogleAccessToken();
    
    const sessionPath = `projects/${PROJECT_ID}/agent/sessions/test-session`;
    const detectIntentUrl = `https://dialogflow.googleapis.com/v2/${sessionPath}:detectIntent`;

    const testPayload = {
      queryInput: {
        text: {
          text: 'hello',
          languageCode: 'en-US',
        }
      }
    };

    const response = await axios.post(detectIntentUrl, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      timeout: 15000
    });

    res.json({
      success: true,
      message: '✅ Dialogflow API test successful!',
      intent: response.data.queryResult.intent.displayName,
      fulfillmentText: response.data.queryResult.fulfillmentText,
      confidence: response.data.queryResult.intentDetectionConfidence,
      projectId: PROJECT_ID
    });

  } catch (error) {
    console.error('❌ Dialogflow API test failed:', error);
    res.status(500).json({
      success: false,
      message: '❌ Dialogflow API test failed',
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// 📝 Endpoint pour vérifier la configuration
app.get('/check-dialogflow-config', (req, res) => {
  res.json({
    projectId: PROJECT_ID,
    googleAuthInitialized: !!googleAuth,
    credentialsConfigured: !!(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS),
    tokenCached: !!cachedToken,
    tokenExpiry: tokenExpiry ? new Date(tokenExpiry).toISOString() : null,
    environment: {
      hasCredentialsJson: !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
      hasCredentialsFile: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectIdSet: !!process.env.DIALOGFLOW_PROJECT_ID
    }
  });
});

// 🔄 Endpoint proxy simple pour Dialogflow depuis Flutter
app.post('/dialogflow-proxy', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    console.log(`🔄 Proxy request from Flutter: "${message}" (session: ${sessionId})`);
    
    // Si on a configuré Google Auth, utiliser la vraie API Dialogflow
    if (googleAuth) {
      try {
        const token = await getGoogleAccessToken();
        
        const sessionPath = `projects/${PROJECT_ID}/agent/sessions/${sessionId}`;
        const detectIntentUrl = `https://dialogflow.googleapis.com/v2/${sessionPath}:detectIntent`;

        const dialogflowPayload = {
          queryInput: {
            text: {
              text: message,
              languageCode: 'en-US',
            }
          }
        };

        const dialogflowResponse = await axios.post(detectIntentUrl, dialogflowPayload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          timeout: 15000
        });

        const queryResult = dialogflowResponse.data.queryResult;
        const intentName = queryResult.intent.displayName;
        const parameters = queryResult.parameters || {};
        
        console.log(`✅ Dialogflow API response: ${intentName}`);
        
        // Si c'est un intent complexe, traiter via nos handlers
        if (_needsComplexResponse(intentName)) {
          const complexResponse = await handleDialogflowIntent(intentName, sessionId, parameters);
          return res.json(complexResponse);
        } else {
          // Réponse simple de Dialogflow
          return res.json({
            fulfillmentText: queryResult.fulfillmentText || 'I understand, but I\'m not sure how to help with that.'
          });
        }
        
      } catch (dialogflowError) {
        console.error('❌ Dialogflow API error:', dialogflowError.message);
        // Fallback vers la simulation
      }
    }
    
    // Fallback : Simuler Dialogflow avec notre logique locale
    console.log('📋 Using local intent detection fallback');
    
    const simulatedIntent = _detectIntentLocally(message);
    const simulatedParameters = _extractParametersLocally(message);
    
    const response = await handleDialogflowIntent(simulatedIntent, sessionId, simulatedParameters);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Proxy error:', error);
    res.status(500).json({
      fulfillmentText: "Sorry, I'm experiencing technical difficulties. Please try again."
    });
  }
});

// 🔥 Webhook Dialogflow - pour les appels directs de Dialogflow
app.post('/webhook', async (req, res) => {
  try {
    console.log('🎯 Dialogflow Webhook called:', JSON.stringify(req.body, null, 2));

    const intentName = req.body.queryResult?.intent?.displayName;
    const queryText = req.body.queryResult?.queryText;
    const parameters = req.body.queryResult?.parameters || {};
    const sessionId = extractSessionId(req.body.session);

    console.log(`🔍 Dialogflow Intent: ${intentName}`);
    console.log(`💬 User message: ${queryText}`);
    console.log(`📊 Dialogflow Parameters: ${JSON.stringify(parameters)}`);
    console.log(`🆔 Session ID: ${sessionId}`);

    if (!intentName) {
      return res.json({
        fulfillmentText: "I didn't understand that. Could you please rephrase?"
      });
    }

    let response = {};

    const sessionData = getSessionData(sessionId);
    
    if (sessionData && sessionData.waitingForMoreResponse) {
      if (isUserWantingMore(queryText)) {
        response = await handleShowMore(sessionId);
      } else if (isUserDeclining(queryText)) {
        response = handleDecline(sessionId);
      } else {
        response = await handleDialogflowIntent(intentName, sessionId, parameters);
      }
    } else {
      response = await handleDialogflowIntent(intentName, sessionId, parameters);
    }

    console.log('📤 Response sent to Dialogflow:', JSON.stringify(response, null, 2));
    res.json(response);

  } catch (error) {
    console.error('❌ Dialogflow Webhook error:', error);
    res.status(500).json({
      fulfillmentText: "Sorry, I'm experiencing technical difficulties. Please try again in a moment."
    });
  }
});

// Fonction helper pour détecter si on a besoin d'une réponse complexe
function _needsComplexResponse(intentName) {
  const complexIntents = [
    'Ask_All_Attractions',
    'Ask_Natural_Attractions',
    'Ask_Cultural_Attractions',
    'Ask_Historical_Attractions',
    'Ask_Artificial_Attractions',
    'Ask_Attractions_By_City'
  ];
  return complexIntents.includes(intentName);
}

// Fonction helper pour détecter l'intent localement (fallback)
function _detectIntentLocally(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('all attractions') || lowerMessage.includes('best attractions')) {
    return 'Ask_All_Attractions';
  }
  if (lowerMessage.includes('natural')) {
    return 'Ask_Natural_Attractions';
  }
  if (lowerMessage.includes('cultural')) {
    return 'Ask_Cultural_Attractions';
  }
  if (lowerMessage.includes('historical') || lowerMessage.includes('history')) {
    return 'Ask_Historical_Attractions';
  }
  if (lowerMessage.includes('artificial')) {
    return 'Ask_Artificial_Attractions';
  }
  
  // Vérifier les villes
  const cities = ['errachidia', 'midelt', 'tinghir', 'zagora', 'ouarzazate'];
  if (cities.some(city => lowerMessage.includes(city))) {
    return 'Ask_Attractions_By_City';
  }
  
  return 'Default Welcome Intent';
}

// Fonction helper pour extraire les paramètres localement
function _extractParametersLocally(message) {
  const lowerMessage = message.toLowerCase();
  const cities = ['errachidia', 'midelt', 'tinghir', 'zagora', 'ouarzazate'];
  
  for (const city of cities) {
    if (lowerMessage.includes(city)) {
      return { city: city, name: city };
    }
  }
  
  return {};
}

// 🆕 Fonction pour gérer les intents Dialogflow
async function handleDialogflowIntent(intentName, sessionId, parameters = {}) {
  console.log(`🎯 Processing Dialogflow intent: ${intentName}`);
  
  switch (intentName) {
    case 'Ask_All_Attractions':
      console.log('📋 Handling: All Attractions');
      return await handleAllAttractions(sessionId);
    
    case 'Ask_Natural_Attractions':
      console.log('🌿 Handling: Natural Attractions');
      return await handleNaturalAttractions(sessionId);
    
    case 'Ask_Cultural_Attractions':
      console.log('🎭 Handling: Cultural Attractions');
      return await handleCulturalAttractions(sessionId);
    
    case 'Ask_Historical_Attractions':
      console.log('🏛️ Handling: Historical Attractions');
      return await handleHistoricalAttractions(sessionId);
    
    case 'Ask_Artificial_Attractions':
      console.log('🏗️ Handling: Artificial Attractions');
      return await handleArtificialAttractions(sessionId);
    
    case 'Ask_Attractions_By_City':
      const cityName = parameters.city || parameters['geo-city'] || parameters.name;
      console.log(`🏙️ Handling: Attractions by City - ${cityName}`);
      return await handleAttractionsByCity(sessionId, cityName);
    
    case 'Default Welcome Intent':
      console.log('👋 Handling: Welcome');
      return {
        fulfillmentText: "Welcome to Draa-Tafilalet Tourism Assistant! I'm here to help you discover amazing attractions. You can ask me about all attractions, natural sites, cultural landmarks, historical places, artificial attractions, or attractions in a specific city."
      };
    
    default:
      console.log(`❓ Unknown intent: ${intentName}`);
      return {
        fulfillmentText: `I understand you're asking about "${intentName}", but I'm not sure how to help with that. Try asking about 'all attractions', 'natural attractions', 'cultural sites', 'historical places', 'artificial attractions', or attractions in a specific city like 'attractions in Errachidia'.`
      };
  }
}

// Handler functions avec pagination
async function handleAllAttractions(sessionId) {
  try {
    console.log('🏛️ Fetching all attractions...');
    
    const response = await makeApiCall(`${API_BASE_URL}/api/public/getAll/Attraction`);
    const allAttractions = response.data;
    console.log(`✅ ${allAttractions.length} attractions fetched successfully`);

    if (!allAttractions || allAttractions.length === 0) {
      return {
        fulfillmentText: "I'm sorry, but I couldn't find any attractions at the moment. The database might be empty or temporarily unavailable."
      };
    }

    return handlePaginatedResponse(allAttractions, 'all', 'general', sessionId);

  } catch (error) {
    console.error('❌ Error fetching all attractions:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return {
        fulfillmentText: "The attractions database is taking longer than usual to respond. This might be because the server is starting up. Please try again in a minute."
      };
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        fulfillmentText: "I'm unable to connect to the attractions database right now. Please try again later."
      };
    } else {
      return {
        fulfillmentText: "I apologize, but I'm having trouble accessing the attractions database right now. Please try again in a few moments."
      };
    }
  }
}

async function handleNaturalAttractions(sessionId) {
  try {
    console.log('🌿 Fetching natural attractions...');
    
    const response = await makeApiCall(`${API_BASE_URL}/api/public/NaturalAttractions`);
    const allAttractions = response.data;
    console.log(`✅ ${allAttractions.length} natural attractions fetched`);

    if (!allAttractions || allAttractions.length === 0) {
      return {
        fulfillmentText: "I couldn't find any natural attractions right now. Please try again later."
      };
    }

    return handlePaginatedResponse(allAttractions, 'natural', 'natural', sessionId);

  } catch (error) {
    console.error('❌ Error fetching natural attractions:', error.message);
    return {
      fulfillmentText: "I'm having trouble finding natural attractions at the moment. Please try again later."
    };
  }
}

async function handleCulturalAttractions(sessionId) {
  try {
    console.log('🎭 Fetching cultural attractions...');
    
    const response = await makeApiCall(`${API_BASE_URL}/api/public/CulturalAttractions`);
    const allAttractions = response.data;
    console.log(`✅ ${allAttractions.length} cultural attractions fetched`);

    if (!allAttractions || allAttractions.length === 0) {
      return {
        fulfillmentText: "No cultural attractions are currently available."
      };
    }

    return handlePaginatedResponse(allAttractions, 'cultural', 'cultural', sessionId);

  } catch (error) {
    console.error('❌ Error fetching cultural attractions:', error.message);
    return {
      fulfillmentText: "I'm currently unable to retrieve cultural attractions. Please try again shortly."
    };
  }
}

async function handleHistoricalAttractions(sessionId) {
  try {
    console.log('🏛️ Fetching historical attractions...');
    
    const response = await makeApiCall(`${API_BASE_URL}/api/public/HistoricalAttractions`);
    const allAttractions = response.data;
    console.log(`✅ ${allAttractions.length} historical attractions fetched`);

    if (!allAttractions || allAttractions.length === 0) {
      return {
        fulfillmentText: "No historical attractions are currently available."
      };
    }

    return handlePaginatedResponse(allAttractions, 'historical', 'historical', sessionId);

  } catch (error) {
    console.error('❌ Error fetching historical attractions:', error.message);
    return {
      fulfillmentText: "I'm having difficulty accessing historical attractions right now. Please try again later."
    };
  }
}

async function handleArtificialAttractions(sessionId) {
  try {
    console.log('🏗️ Fetching artificial attractions...');
    
    const response = await makeApiCall(`${API_BASE_URL}/api/public/ArtificialAttractions`);
    const allAttractions = response.data;
    console.log(`✅ ${allAttractions.length} artificial attractions fetched`);

    if (!allAttractions || allAttractions.length === 0) {
      return {
        fulfillmentText: "No artificial attractions are currently available."
      };
    }

    return handlePaginatedResponse(allAttractions, 'artificial', 'artificial', sessionId);

  } catch (error) {
    console.error('❌ Error fetching artificial attractions:', error.message);
    return {
      fulfillmentText: "I'm currently unable to access artificial attractions. Please try again shortly."
    };
  }
}

// Handler pour attractions par ville
async function handleAttractionsByCity(sessionId, cityName) {
  try {
    if (!cityName) {
      return {
        fulfillmentText: "I'd be happy to show you attractions in a specific city! Could you please tell me which city in Draa-Tafilalet you're interested in? For example: Errachidia, Midelt, Tinghir, Zagora, or any other city."
      };
    }

    console.log(`🏙️ Fetching attractions for city: ${cityName}`);
    
    const cityResult = await tryMultipleCityVariants(cityName);

    console.log(`📊 City search result:`, {
      success: cityResult.success,
      totalFound: cityResult.totalFound,
      usedVariant: cityResult.usedVariant
    });

    if (!cityResult.success) {
      console.log(`❌ No results found for any variant of: ${cityName}`);
      return {
        fulfillmentText: `I couldn't find any information about "${cityName}". Please make sure you've spelled the city name correctly, or try asking about another city in Draa-Tafilalet like Errachidia, Midelt, Tinghir, or Zagora.`
      };
    }

    const allLocations = cityResult.data;
    const usedVariant = cityResult.usedVariant;
    
    console.log(`📍 ${allLocations.length} total locations fetched for city variants`);

    // Filtrer pour ne garder que les attractions
    const attractions = allLocations.filter(location => {
      const hasEntryFre = location.hasOwnProperty('entryFre');
      const hasGuideToursAvailable = location.hasOwnProperty('guideToursAvailable');
      return hasEntryFre && hasGuideToursAvailable;
    });

    console.log(`🎯 ${attractions.length} attractions filtered from ${allLocations.length} locations`);

    if (!attractions || attractions.length === 0) {
      console.log(`⚠️ No attractions found, but found ${allLocations.length} other locations`);
      return {
        fulfillmentText: `I found ${allLocations.length} locations in ${cityName}, but no tourist attractions are currently available. Try asking about another city in Draa-Tafilalet, or ask about attractions by category (natural, cultural, historical, or artificial attractions).`
      };
    }

    const formattedCityName = cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase();
    console.log(`✅ Returning ${attractions.length} attractions for ${formattedCityName}`);
    
    return handlePaginatedResponse(attractions, `city_${cityName.toLowerCase()}`, `attractions in ${formattedCityName}`, sessionId, formattedCityName);

  } catch (error) {
    console.error(`❌ Error in handleAttractionsByCity for ${cityName}:`, error);
    return {
      fulfillmentText: `I'm having trouble finding attractions in ${cityName} right now. Please try again later or ask about attractions in another city.`
    };
  }
}

// Fonction pour tenter plusieurs variantes de la ville
async function tryMultipleCityVariants(cityName) {
  const variants = [
    cityName,
    cityName.toLowerCase(),
    cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase(),
    cityName.toUpperCase(),
  ];

  const uniqueVariants = [...new Set(variants)];
  
  console.log(`🔄 Trying city variants: ${uniqueVariants.join(', ')}`);

  let allResults = [];
  let successfulVariant = null;

  for (const variant of uniqueVariants) {
    try {
      console.log(`🌍 Trying city variant: ${variant}`);
      
      const response = await makeApiCall(
        `${API_BASE_URL}/api/public/getLocationByCity/${encodeURIComponent(variant)}`
      );

      if (response.data && response.data.length > 0) {
        console.log(`✅ Success with variant: ${variant} - Found ${response.data.length} locations`);
        
        const newResults = response.data.filter(newItem => 
          !allResults.some(existingItem => existingItem.id_Location === newItem.id_Location)
        );
        
        allResults = [...allResults, ...newResults];
        successfulVariant = variant;
        
        console.log(`📊 Total results so far: ${allResults.length}`);
      }
    } catch (error) {
      console.log(`❌ Failed with variant: ${variant} - ${error.message}`);
      continue;
    }
  }

  return {
    success: allResults.length > 0,
    data: allResults.length > 0 ? allResults : null,
    usedVariant: successfulVariant,
    totalFound: allResults.length
  };
}

// Fonction principale de pagination
function handlePaginatedResponse(allAttractions, category, categoryDisplayName, sessionId, cityName = null) {
  const ITEMS_PER_PAGE = 10;
  const totalCount = allAttractions.length;
  
  if (totalCount <= ITEMS_PER_PAGE) {
    // Moins de 10 attractions, afficher toutes sans pagination
    const messagesByCategory = {
      'all': `I found ${totalCount} amazing attractions in Draa-Tafilalet for you!\n\nHere are all the incredible places you can explore:`,
      'natural': `I found ${totalCount} beautiful natural attractions in Draa-Tafilalet!\n\nHere are all the stunning landscapes and protected natural areas you can discover:`,
      'cultural': `I found ${totalCount} fascinating cultural attractions in Draa-Tafilalet!\n\nHere are all the amazing cultural sites that showcase our rich heritage:`,
      'historical': `I found ${totalCount} remarkable historical attractions in Draa-Tafilalet!\n\nHere are all the incredible historical sites where you can explore our fascinating history:`,
      'artificial': `I found ${totalCount} impressive artificial attractions in Draa-Tafilalet!\n\nHere are all the amazing modern marvels and architectural wonders you can visit:`
    };

    let displayMessage;
    if (cityName) {
      displayMessage = `I found ${totalCount} wonderful attractions in ${cityName}!\n\nHere are all the amazing places you can visit in this beautiful city:`;
    } else {
      displayMessage = messagesByCategory[category] || messagesByCategory['all'];
    }

    return {
      fulfillmentText: displayMessage,
      
      payload: {
        flutter: {
          type: 'attractions_list',
          category: category,
          data: {
            attractions: allAttractions,
            count: totalCount,
            cityName: cityName
          },
          actions: [
            { type: 'view_details', label: 'View Details', icon: 'info' },
            { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
          ]
        }
      }
    };
  } else {
    // Plus de 10 attractions, pagination nécessaire
    const firstPageAttractions = allAttractions.slice(0, ITEMS_PER_PAGE);
    const remainingAttractions = allAttractions.slice(ITEMS_PER_PAGE);
    const remainingCount = remainingAttractions.length;
    
    // Sauvegarder les attractions restantes dans la session
    saveSessionData(sessionId, {
      remainingAttractions,
      category,
      categoryDisplayName,
      waitingForMoreResponse: true,
      cityName: cityName
    });

    const messagesByCategory = {
      'all': `I found ${totalCount} amazing attractions in Draa-Tafilalet for you!\n\nHere are the first ${ITEMS_PER_PAGE} incredible places you can explore:`,
      'natural': `I found ${totalCount} beautiful natural attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} stunning landscapes you can discover:`,
      'cultural': `I found ${totalCount} fascinating cultural attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} amazing cultural sites:`,
      'historical': `I found ${totalCount} remarkable historical attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} incredible historical sites:`,
      'artificial': `I found ${totalCount} impressive artificial attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} amazing modern marvels:`
    };

    let displayMessage;
    if (cityName) {
      displayMessage = `I found ${totalCount} wonderful attractions in ${cityName}!\n\nHere are the first ${ITEMS_PER_PAGE} amazing places you can visit:`;
    } else {
      displayMessage = messagesByCategory[category] || messagesByCategory['all'];
    }

    return {
      fulfillmentText: displayMessage,
      
      payload: {
        flutter: {
          type: 'attractions_list_with_more',
          category: category,
          data: {
            attractions: firstPageAttractions,
            count: firstPageAttractions.length,
            hasMore: true,
            totalCount: totalCount,
            remainingCount: remainingCount,
            cityName: cityName,
            sendMoreMessage: true
          },
          actions: [
            { type: 'view_details', label: 'View Details', icon: 'info' },
            { type: 'get_directions', label: 'Get_directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
          ]
        }
      }
    };
  }
}

// Handler pour "voir plus"
async function handleShowMore(sessionId) {
  const sessionData = getSessionData(sessionId);
  
  if (!sessionData || !sessionData.remainingAttractions) {
    return {
      fulfillmentText: "I don't have any additional attractions to show right now. Feel free to ask about a specific category of attractions!"
    };
  }

  const { remainingAttractions, category, categoryDisplayName } = sessionData;
  
  // Nettoyer la session
  sessionStorage.delete(sessionId);

  const naturalResponse = `Perfect! Here are all the remaining ${categoryDisplayName} attractions:\n\nEnjoy exploring these additional gems!`;

  return {
    fulfillmentText: naturalResponse,
    
    payload: {
      flutter: {
        type: 'attractions_list',
        category: category,
        data: {
          attractions: remainingAttractions,
          count: remainingAttractions.length,
        },
        actions: [
          { type: 'view_details', label: 'View Details', icon: 'info' },
          { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
          { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
        ]
      }
    }
  };
}

// Handler pour refus
function handleDecline(sessionId) {
  // Nettoyer la session
  if (sessionId) {
    sessionStorage.delete(sessionId);
  }
  
  return {
    fulfillmentText: "As you wish! No problem at all. I'm here anytime you need help discovering attractions in Draa-Tafilalet. Just ask me whenever you're ready! 😊"
  };
}

// Fonctions utilitaires
function extractSessionId(sessionPath) {
  return sessionPath ? sessionPath.split('/').pop() : 'default-session';
}

function isUserWantingMore(queryText) {
  if (!queryText) return false;
  const lowerText = queryText.toLowerCase();
  const positiveResponses = ['yes', 'oui', 'ok', 'okay', 'sure', 'please', 'show more', 'voir plus', 'more', 'continue', 'd\'accord', 'bien sûr'];
  return positiveResponses.some(response => lowerText.includes(response));
}

function isUserDeclining(queryText) {
  if (!queryText) return false;
  const lowerText = queryText.toLowerCase();
  const negativeResponses = ['no', 'non', 'nope', 'not now', 'maybe later', 'that\'s enough', 'pas maintenant', 'merci'];
  return negativeResponses.some(response => lowerText.includes(response));
}

function saveSessionData(sessionId, data) {
  sessionStorage.set(sessionId, { ...sessionStorage.get(sessionId), ...data, timestamp: Date.now() });
}

function getSessionData(sessionId) {
  const data = sessionStorage.get(sessionId);
  // Nettoyer les sessions anciennes (plus de 30 minutes)
  if (data && Date.now() - data.timestamp > 30 * 60 * 1000) {
    sessionStorage.delete(sessionId);
    return null;
  }
  return data;
}

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);
  res.status(500).json({
    fulfillmentText: "An unexpected error occurred."
  });
});

// Initialiser Google Auth au démarrage et démarrer le serveur
initializeGoogleAuth().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Tourism Bot Backend with REAL Dialogflow started on port ${PORT}`);
    console.log(`📱 Dialogflow Webhook URL: https://tourism-bot-backend-production.up.railway.app/webhook`);
    console.log(`🔄 Flutter Proxy URL: https://tourism-bot-backend-production.up.railway.app/dialogflow-proxy`);
    console.log(`🏛️ Tourism API: ${API_BASE_URL}`);
    console.log(`🔑 Google Auth initialized: ${!!googleAuth}`);
    console.log(`📋 Project ID: ${PROJECT_ID}`);
    console.log('✅ Ready to handle REAL Dialogflow requests!');
    console.log('');
    console.log('📋 Available endpoints:');
    console.log('  GET  / - Health check');
    console.log('  GET  /test - Test Tourism API');
    console.log('  GET  /check-dialogflow-config - Check Dialogflow configuration');
    console.log('  GET  /test-dialogflow-api - Test Dialogflow API directly');
    console.log('  GET  /get-dialogflow-token - Get Dialogflow access token');
    console.log('  POST /webhook - Dialogflow webhook');
    console.log('  POST /dialogflow-proxy - Flutter proxy to Dialogflow');
  });
}).catch(error => {
  console.error('❌ Failed to initialize:', error);
  // Démarrer quand même le serveur en mode fallback
  app.listen(PORT, () => {
    console.log(`⚠️ Tourism Bot Backend started in FALLBACK mode on port ${PORT}`);
    console.log(`❌ Google Auth failed to initialize: ${error.message}`);
    console.log(`🔄 Using local intent detection only`);
  });
});

module.exports = app;