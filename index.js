const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration
const API_BASE_URL = 'https://touristeproject.onrender.com';
const PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID || 'tourisme-bot-sxin';

// Session storage pour la pagination
const sessionStorage = new Map();

// Google Auth
let googleAuth = null;
let cachedToken = null;
let tokenExpiry = null;

// ============================
// GOOGLE AUTHENTICATION
// ============================

async function initializeGoogleAuth() {
  try {
    console.log('🔑 Initializing Google Auth...');
    
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      const { GoogleAuth } = require('google-auth-library');
      googleAuth = new GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/dialogflow'],
      });
      console.log('✅ Google Auth initialized with JSON credentials');
    }
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const { GoogleAuth } = require('google-auth-library');
      googleAuth = new GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/dialogflow'],
      });
      console.log('✅ Google Auth initialized with file credentials');
    }
    else {
      console.warn('⚠️ No Google credentials configured');
    }
  } catch (error) {
    console.error('❌ Error initializing Google Auth:', error);
  }
}

async function getGoogleAccessToken() {
  try {
    if (!googleAuth) {
      throw new Error('Google Auth not initialized');
    }

    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 300000) {
      return cachedToken;
    }

    const client = await googleAuth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (tokenResponse.token) {
      cachedToken = tokenResponse.token;
      tokenExpiry = tokenResponse.expiry_date;
      return tokenResponse.token;
    } else {
      throw new Error('Failed to obtain access token');
    }
  } catch (error) {
    console.error('❌ Error getting Google token:', error);
    throw error;
  }
}

// ============================
// UTILITY FUNCTIONS
// ============================

async function makeApiCall(url, maxRetries = 3, timeoutMs = 30000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: timeoutMs,
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'Tourism-Bot/1.0'
        }
      });
      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

async function tryMultipleCityVariants(cityName) {
  const variants = [
    cityName,
    cityName.toLowerCase(),
    cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase(),
    cityName.toUpperCase(),
  ];

  const uniqueVariants = [...new Set(variants)];
  let allResults = [];
  let successfulVariant = null;

  for (const variant of uniqueVariants) {
    try {
      const response = await makeApiCall(
        `${API_BASE_URL}/api/public/getLocationByCity/${encodeURIComponent(variant)}`
      );

      if (response.data && response.data.length > 0) {
        const newResults = response.data.filter(newItem => 
          !allResults.some(existingItem => existingItem.id_Location === newItem.id_Location)
        );
        
        allResults = [...allResults, ...newResults];
        successfulVariant = variant;
      }
    } catch (error) {
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

// ============================
// SESSION MANAGEMENT
// ============================

function saveSessionData(sessionId, data) {
  const newData = { ...data, timestamp: Date.now() };
  sessionStorage.set(sessionId, newData);
  console.log(`💾 Session data saved for ${sessionId}`);
}

function getSessionData(sessionId) {
  const data = sessionStorage.get(sessionId);
  
  if (data) {
    // Expire after 1 hour
    if (Date.now() - data.timestamp > 60 * 60 * 1000) {
      sessionStorage.delete(sessionId);
      return null;
    }
  }
  
  return data;
}

function extractSessionId(sessionPath) {
  return sessionPath ? sessionPath.split('/').pop() : 'default-session';
}

// ============================
// MAIN ENDPOINTS
// ============================

app.get('/', (req, res) => {
  res.json({
    message: '🚀 Tourism Bot Backend with Dialogflow',
    timestamp: new Date().toISOString(),
    dialogflowConfigured: !!googleAuth,
    projectId: PROJECT_ID
  });
});

// Main proxy endpoint for Flutter
app.post('/dialogflow-proxy', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    console.log(`🔄 Processing: "${message}" (session: ${sessionId})`);
    
    if (googleAuth) {
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
      const response = await processDialogflowResponse(queryResult, sessionId);
      return res.json(response);
      
    } else {
      return res.status(500).json({
        fulfillmentText: "Dialogflow service unavailable"
      });
    }
    
  } catch (error) {
    console.error('❌ Proxy error:', error);
    res.status(500).json({
      fulfillmentText: "Sorry, I'm experiencing technical difficulties."
    });
  }
});

// ============================
// DIALOGFLOW RESPONSE PROCESSING
// ============================

async function processDialogflowResponse(queryResult, sessionId) {
  const intentName = queryResult.intent.displayName;
  const parameters = queryResult.parameters || {};
  
  console.log(`🎯 Processing intent: ${intentName}`);
  
  try {
    switch (intentName) {
      case 'Ask_All_Attractions':
        return await handleAllAttractions(sessionId);
      
      case 'Ask_Natural_Attractions':
        return await handleNaturalAttractions(sessionId);
      
      case 'Ask_Cultural_Attractions':
        return await handleCulturalAttractions(sessionId);
      
      case 'Ask_Historical_Attractions':
        return await handleHistoricalAttractions(sessionId);
      
      case 'Ask_Artificial_Attractions':
        return await handleArtificialAttractions(sessionId);
      
      case 'Ask_Attractions_By_City':
        const cityName = parameters.city || parameters['geo-city'] || parameters.name;
        return await handleAttractionsByCity(sessionId, cityName);
      
      case 'Pagination_ShowMore':
        return await handleShowMore(sessionId);
      
      case 'Pagination_Decline':
        return handleDecline(sessionId);
      
      case 'Ask_Attraction_Details':
        const attractionName = parameters['attraction-name'] || parameters.name;
        return await handleAttractionDetails(sessionId, attractionName);
      
      // 🆕 NOUVEAUX INTENTS POUR LES MAPS
      case 'Show_Attraction_On_Map':
      case 'Map_Request_Yes':
        return await handleShowAttractionOnMap(sessionId);
      
      case 'Map_Request_No':
        return handleMapDecline(sessionId);
      
      case 'Default Welcome Intent':
        return {
          fulfillmentText: "Welcome to Draa-Tafilalet Tourism Assistant! I can help you discover attractions, cultural sites, natural wonders, and more."
        };
        
      default:
        return {
          fulfillmentText: `I understand you're asking about "${intentName}", but I'm not sure how to help with that. Try asking about attractions, cultural sites, or natural wonders.`
        };
    }
  } catch (error) {
    console.error(`❌ Error processing intent ${intentName}:`, error);
    return {
      fulfillmentText: "Sorry, there was an error processing your request."
    };
  }
}

// ============================
// 🆕 NOUVEAUX HANDLERS POUR MAPS
// ============================

// 🔧 MODIFICATION dans handleShowAttractionOnMap
async function handleShowAttractionOnMap(sessionId) {
  try {
    const sessionData = getSessionData(sessionId);
    
    if (!sessionData || !sessionData.attractionData) {
      return {
        fulfillmentText: "I don't have location information available. Please ask about a specific attraction first."
      };
    }

    const attraction = sessionData.attractionData;
    const lat = attraction.latitude;
    const lng = attraction.longitude;
    const name = attraction.name;
    
    // Créer le lien Google Maps
    const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}&query_place_id=&query=${encodeURIComponent(name)}`;
    
    // Nettoyer la session
    sessionStorage.delete(sessionId);

    // 🔧 MESSAGE TRÈS COURT ET SIMPLE
    return {
      fulfillmentText: `📍 Location: ${name}`, // 🔧 MESSAGE MINIMALISTE
      payload: {
        flutter: {
          type: 'map_location',
          data: {
            attraction: attraction,
            coordinates: { latitude: lat, longitude: lng },
            googleMapsUrl: googleMapsUrl
            // 🚫 SUPPRIMÉ: appleMapsUrl, mapOptions, actions complexes
          }
          // 🚫 SUPPRIMÉ: actions array
        }
      }
    };
  } catch (error) {
    console.error('❌ Error showing attraction on map:', error);
    return {
      fulfillmentText: "Sorry, I couldn't retrieve the location information right now."
    };
  }
}

function handleMapDecline(sessionId) {
  // Nettoyer les données de session
  if (sessionId) {
    sessionStorage.delete(sessionId);
  }
  
  return {
    fulfillmentText: "No problem! Is there anything else you'd like to know about this attraction or would you like to explore other places? 😊"
  };
}

// ============================
// ATTRACTION HANDLERS
// ============================

async function handleAttractionDetails(sessionId, attractionName) {
  try {
    if (!attractionName) {
      return {
        fulfillmentText: "Please tell me which attraction you'd like to know more about."
      };
    }

    console.log(`🔍 Fetching details for attraction: ${attractionName}`);
    
    const response = await makeApiCall(
      `${API_BASE_URL}/api/public/getLocationByName/${encodeURIComponent(attractionName)}`
    );

    if (!response.data || response.data.length === 0) {
      return {
        fulfillmentText: `I couldn't find detailed information about "${attractionName}". Please check the spelling or try another attraction name.`
      };
    }

    const attractionData = response.data[0];
    const attractionType = determineAttractionType(attractionData);
    
    console.log(`✅ Found ${attractionType} attraction: ${attractionData.name}`);

    // 🆕 MODIFICATION: Sauvegarder les données pour le flux map
    saveSessionData(sessionId, {
      attractionData: attractionData,
      attractionType: attractionType,
      waitingForDetailsText: true,
      waitingForMapResponse: true, // 🆕 NOUVEAU FLAG
      attractionName: attractionData.name
    });

    // Premier message: juste les images
    return {
      fulfillmentText: "",
      payload: {
        flutter: {
          type: 'attraction_details',
          category: attractionType,
          data: {
            attraction: attractionData,
            attractionType: attractionType,
            onlyImages: true
          }
        }
      }
    };

  } catch (error) {
    console.error(`❌ Error fetching attraction details for ${attractionName}:`, error);
    
    if (error.response?.status === 404) {
      return {
        fulfillmentText: `I couldn't find an attraction named "${attractionName}". Please check the name or try searching for something similar.`
      };
    }
    
    return {
      fulfillmentText: `Sorry, I'm having trouble retrieving details about "${attractionName}" right now. Please try again later.`
    };
  }
}

function determineAttractionType(attractionData) {
  // Vérifier les propriétés spécifiques pour déterminer le type
  if (attractionData.hasOwnProperty('protectedArea')) {
    return 'natural';
  } else if (attractionData.hasOwnProperty('style') && attractionData.hasOwnProperty('yearBuild')) {
    // Si a les deux, vérifier d'autres indices
    if (attractionData.hasOwnProperty('historicalPeriod') || attractionData.hasOwnProperty('dynastyName')) {
      return 'historical';
    } else {
      return 'cultural';
    }
  } else if (attractionData.hasOwnProperty('yearBuild') && !attractionData.hasOwnProperty('style')) {
    return 'artificial';
  } else if (attractionData.hasOwnProperty('style') && !attractionData.hasOwnProperty('yearBuild')) {
    return 'historical';
  } else {
    // Fallback - analyser le nom ou la description
    const name = (attractionData.name || '').toLowerCase();
    const description = (attractionData.description || '').toLowerCase();
    
    if (name.includes('gorge') || name.includes('oasis') || name.includes('desert') || 
        description.includes('natural') || description.includes('nature')) {
      return 'natural';
    } else if (name.includes('kasbah') || name.includes('mosque') || name.includes('museum') ||
               description.includes('cultural') || description.includes('heritage')) {
      return 'cultural';
    } else if (name.includes('palace') || name.includes('fortress') || name.includes('ruins') ||
               description.includes('historical') || description.includes('ancient')) {
      return 'historical';
    } else {
      return 'artificial';
    }
  }
}

async function handleAllAttractions(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/getAll/Attraction`);
    const allAttractions = response.data;
    
    if (!allAttractions || allAttractions.length === 0) {
      return { fulfillmentText: "No attractions found at the moment." };
    }

    return handlePaginatedResponse(allAttractions, 'all', 'general', sessionId);
  } catch (error) {
    console.error('❌ Error fetching all attractions:', error);
    return { fulfillmentText: "Having trouble accessing attractions database." };
  }
}

async function handleNaturalAttractions(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/NaturalAttractions`);
    const allAttractions = response.data;
    
    if (!allAttractions || allAttractions.length === 0) {
      return { fulfillmentText: "No natural attractions found." };
    }

    return handlePaginatedResponse(allAttractions, 'natural', 'natural', sessionId);
  } catch (error) {
    console.error('❌ Error fetching natural attractions:', error);
    return { fulfillmentText: "Having trouble finding natural attractions." };
  }
}

async function handleCulturalAttractions(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/CulturalAttractions`);
    const allAttractions = response.data;
    
    if (!allAttractions || allAttractions.length === 0) {
      return { fulfillmentText: "No cultural attractions found." };
    }

    return handlePaginatedResponse(allAttractions, 'cultural', 'cultural', sessionId);
  } catch (error) {
    console.error('❌ Error fetching cultural attractions:', error);
    return { fulfillmentText: "Having trouble finding cultural attractions." };
  }
}

async function handleHistoricalAttractions(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/HistoricalAttractions`);
    const allAttractions = response.data;
    
    if (!allAttractions || allAttractions.length === 0) {
      return { fulfillmentText: "No historical attractions found." };
    }

    return handlePaginatedResponse(allAttractions, 'historical', 'historical', sessionId);
  } catch (error) {
    console.error('❌ Error fetching historical attractions:', error);
    return { fulfillmentText: "Having trouble finding historical attractions." };
  }
}

async function handleArtificialAttractions(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/ArtificialAttractions`);
    const allAttractions = response.data;
    
    if (!allAttractions || allAttractions.length === 0) {
      return { fulfillmentText: "No artificial attractions found." };
    }

    return handlePaginatedResponse(allAttractions, 'artificial', 'artificial', sessionId);
  } catch (error) {
    console.error('❌ Error fetching artificial attractions:', error);
    return { fulfillmentText: "Having trouble finding artificial attractions." };
  }
}

async function handleAttractionsByCity(sessionId, cityName) {
  try {
    if (!cityName) {
      return {
        fulfillmentText: "Please tell me which city you're interested in."
      };
    }

    const cityResult = await tryMultipleCityVariants(cityName);
    
    if (!cityResult.success) {
      return {
        fulfillmentText: `I couldn't find information about "${cityName}". Try another city.`
      };
    }

    const attractions = cityResult.data.filter(location => 
      location.hasOwnProperty('entryFre') && location.hasOwnProperty('guideToursAvailable')
    );

    if (!attractions || attractions.length === 0) {
      return {
        fulfillmentText: `No tourist attractions found in ${cityName}.`
      };
    }

    const formattedCityName = cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase();
    
    return handlePaginatedResponse(attractions, `city_${cityName.toLowerCase()}`, `attractions in ${formattedCityName}`, sessionId, formattedCityName);
  } catch (error) {
    console.error(`❌ Error finding attractions in ${cityName}:`, error);
    return {
      fulfillmentText: `Having trouble finding attractions in ${cityName}.`
    };
  }
}

// ============================
// PAGINATION HANDLERS
// ============================

function handlePaginatedResponse(allAttractions, category, categoryDisplayName, sessionId, cityName = null) {
  const ITEMS_PER_PAGE = 10;
  const totalCount = allAttractions.length;
  
  if (totalCount <= ITEMS_PER_PAGE) {
    const messagesByCategory = {
      'all': `I found ${totalCount} amazing attractions in Draa-Tafilalet!`,
      'natural': `I found ${totalCount} beautiful natural attractions!`,
      'cultural': `I found ${totalCount} fascinating cultural attractions!`,
      'historical': `I found ${totalCount} remarkable historical attractions!`,
      'artificial': `I found ${totalCount} impressive artificial attractions!`
    };

    let displayMessage;
    if (cityName) {
      displayMessage = `I found ${totalCount} wonderful attractions in ${cityName}!`;
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
    const firstPageAttractions = allAttractions.slice(0, ITEMS_PER_PAGE);
    const remainingAttractions = allAttractions.slice(ITEMS_PER_PAGE);
    const remainingCount = remainingAttractions.length;
    
    saveSessionData(sessionId, {
      remainingAttractions,
      category,
      categoryDisplayName,
      cityName: cityName,
      waitingForMoreResponse: true
    });

    const messagesByCategory = {
      'all': `I found ${totalCount} amazing attractions! Here are the first ${ITEMS_PER_PAGE}:`,
      'natural': `I found ${totalCount} natural attractions! Here are the first ${ITEMS_PER_PAGE}:`,
      'cultural': `I found ${totalCount} cultural attractions! Here are the first ${ITEMS_PER_PAGE}:`,
      'historical': `I found ${totalCount} historical attractions! Here are the first ${ITEMS_PER_PAGE}:`,
      'artificial': `I found ${totalCount} artificial attractions! Here are the first ${ITEMS_PER_PAGE}:`
    };

    let displayMessage;
    if (cityName) {
      displayMessage = `I found ${totalCount} attractions in ${cityName}! Here are the first ${ITEMS_PER_PAGE}:`;
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
            { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
          ]
        }
      }
    };
  }
}

// 🆕 FONCTION MODIFIÉE: sendAttractionDetailsText (sans coordonnées GPS)
function sendAttractionDetailsText(attractionData, attractionType) {
  let message = `**${attractionData.name}**\n\n`;
  message += `📍 **Location:** ${attractionData.cityName}, ${attractionData.countryName}\n\n`;
  
  if (attractionData.description) {
    message += `📝 **Description:**\n${attractionData.description}\n\n`;
  }
  
  message += `💰 **Entry Fee:** ${attractionData.entryFre == 0 ? 'Free' : attractionData.entryFre + ' MAD'}\n`;
  message += `🎯 **Guided Tours:** ${attractionData.guideToursAvailable ? 'Available' : 'Not Available'}\n`;
  
  // 🚫 SUPPRIMÉ : GPS coordinates ne sont plus affichées
  // message += `🗺️ **GPS:** ${attractionData.latitude.toFixed(4)}, ${attractionData.longitude.toFixed(4)}\n`;
  
  // Ajouter les infos spécifiques selon le type
  switch (attractionType) {
    case 'natural':
      if (attractionData.protectedArea !== undefined) {
        message += `🌿 **Protected Area:** ${attractionData.protectedArea ? 'Yes - Protected Natural Site' : 'No'}\n`;
      }
      break;
      
    case 'cultural':
    case 'historical':
    case 'artificial':
      if (attractionData.yearBuild) {
        message += `📅 **Year Built:** ${attractionData.yearBuild}\n`;
      }
      if (attractionData.style) {
        message += `🏛️ **Architectural Style:** ${attractionData.style}\n`;
      }
      break;
  }
  
  // 🆕 NOUVEAU: Ajouter la question pour la carte à la fin
  message += `\n🗺️ Would you like to see this attraction on the map?`;
  
  return message;
}

async function handleShowMore(sessionId) {
  const sessionData = getSessionData(sessionId);
  
  if (!sessionData || !sessionData.remainingAttractions || sessionData.remainingAttractions.length === 0) {
    return {
      fulfillmentText: "I don't have any additional attractions to show right now."
    };
  }

  const { remainingAttractions, category, categoryDisplayName, cityName } = sessionData;
  
  sessionStorage.delete(sessionId);

  const naturalResponse = cityName 
    ? `Perfect! Here are all the remaining attractions in ${cityName}:`
    : `Perfect! Here are all the remaining ${categoryDisplayName} attractions:`;

  return {
    fulfillmentText: naturalResponse,
    payload: {
      flutter: {
        type: 'attractions_list',
        category: category,
        data: {
          attractions: remainingAttractions,
          count: remainingAttractions.length,
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
}

function handleDecline(sessionId) {
  if (sessionId) {
    sessionStorage.delete(sessionId);
  }
  
  return {
    fulfillmentText: "No problem! I'm here whenever you need help discovering attractions in Draa-Tafilalet. Just ask me anytime! 😊"
  };
}

// ============================
// ERROR HANDLING
// ============================

app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);
  res.status(500).json({
    fulfillmentText: "An unexpected error occurred."
  });
});

// ============================
// SERVER STARTUP
// ============================

initializeGoogleAuth().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Tourism Bot Backend started on port ${PORT}`);
    console.log(`🔑 Google Auth initialized: ${!!googleAuth}`);
    console.log(`📋 Project ID: ${PROJECT_ID}`);
    console.log('✅ Ready to handle Dialogflow requests!');
  });
}).catch(error => {
  console.error('❌ Failed to initialize:', error);
  app.listen(PORT, () => {
    console.log(`⚠️ Tourism Bot Backend started in FALLBACK mode on port ${PORT}`);
  });
});

module.exports = app;