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

// ❌ SUPPRIMÉ : Session storage - plus nécessaire avec Dialogflow contexts
// const sessionStorage = new Map();

// Google Auth (gardé identique)
let googleAuth = null;
let cachedToken = null;
let tokenExpiry = null;

// ============================
// GOOGLE AUTHENTICATION (Identique)
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
// UTILITY FUNCTIONS (Identiques)
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
// ✅ NOUVEAUX HELPERS DIALOGFLOW CONTEXTS
// ============================

function createDialogflowContext(sessionId, contextName, lifespanCount = 2, parameters = {}) {
  return {
    name: `projects/${PROJECT_ID}/agent/sessions/${sessionId}/contexts/${contextName}`,
    lifespanCount: lifespanCount,
    parameters: parameters
  };
}

function findContextByName(contexts, contextName) {
  if (!contexts || !Array.isArray(contexts)) return null;
  
  return contexts.find(context => 
    context.name && context.name.includes(`/contexts/${contextName}`)
  );
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

// ✅ ENDPOINT PRINCIPAL CORRIGÉ
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
      console.log(`🎯 Intent: ${queryResult.intent.displayName}`);
      
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
// ✅ DIALOGFLOW RESPONSE PROCESSING CORRIGÉ
// ============================

async function processDialogflowResponse(queryResult, sessionId) {
  const intentName = queryResult.intent.displayName;
  const parameters = queryResult.parameters || {};
  const contexts = queryResult.outputContexts || [];
  
  console.log(`🎯 Processing intent: ${intentName}`);
  
  try {
    switch (intentName) {
      // ===== ATTRACTIONS INTENTS =====
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
      
      case 'Ask_Attraction_Details':
        const attractionName = parameters['attraction-name'] || parameters.name;
        return await handleAttractionDetails(sessionId, attractionName);
      
      // ===== AMENITIES INTENTS =====
      case 'Ask_All_Amenities':
        return await handleAllAmenities(sessionId);
      
      case 'Ask_Restaurants':
        return await handleRestaurants(sessionId);
      
      case 'Ask_Lodges':
        return await handleLodges(sessionId);
      
      case 'Ask_Hotels':
        return await handleHotels(sessionId);
      
      case 'Ask_Guest_Houses':
        return await handleGuestHouses(sessionId);
      
      case 'Ask_Camping':
        return await handleCamping(sessionId);
      
      case 'Ask_Cafes':
        return await handleCafes(sessionId);
      
      case 'Ask_Amenities_By_City':
        const amenityCityName = parameters.city || parameters['geo-city'] || parameters.name;
        return await handleAmenitiesByCity(sessionId, amenityCityName);
      
      case 'Ask_Amenity_Details':
        const amenityName = parameters['amenity-name'] || parameters.name;
        return await handleAmenityDetails(sessionId, amenityName);
      
      // ===== ✅ NOUVEAUX INTENTS PAGINATION =====
      case 'Pagination_ShowMore':
        return await handleShowMoreWithContext(contexts, sessionId);
      
      case 'Pagination_Decline':
        return handleDeclineWithContext(contexts, sessionId);
      
      // ===== ✅ NOUVEAUX INTENTS MAP =====
      case 'Map_Request_Yes':
        return await handleShowOnMapWithContext(contexts, sessionId);
      
      case 'Map_Request_No':
        return handleMapDeclineWithContext(contexts, sessionId);
      
      case 'Default Welcome Intent':
        return {
          fulfillmentText: "Welcome to Draa-Tafilalet Tourism Assistant! I can help you discover attractions, amenities, restaurants, hotels, and more in our beautiful region."
        };
        
      default:
        console.log(`⚠️ Unhandled intent: ${intentName}`);
        return {
          fulfillmentText: `I understand you're asking about "${intentName}", but I'm not sure how to help with that. Try asking about attractions, amenities, restaurants, or hotels.`
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
// ✅ PAGINATION AVEC DIALOGFLOW CONTEXTS
// ============================

function handlePaginatedResponse(allItems, category, categoryDisplayName, sessionId, cityName = null, itemType = 'attraction') {
  const ITEMS_PER_PAGE = 10;
  const totalCount = allItems.length;
  
  console.log(`📊 handlePaginatedResponse: ${totalCount} ${itemType}s, category: ${category}`);
  
  if (totalCount <= ITEMS_PER_PAGE) {
    // Pas de pagination nécessaire
    const messagesByCategory = {
      // Attractions
      'all': `I found ${totalCount} amazing attractions in Draa-Tafilalet!`,
      'natural': `I found ${totalCount} beautiful natural attractions!`,
      'cultural': `I found ${totalCount} fascinating cultural attractions!`,
      'historical': `I found ${totalCount} remarkable historical attractions!`,
      'artificial': `I found ${totalCount} impressive artificial attractions!`,
      
      // Amenities
      'all_amenities': `I found ${totalCount} great amenities in Draa-Tafilalet!`,
      'restaurants': `I found ${totalCount} wonderful restaurants!`,
      'hotels': `I found ${totalCount} comfortable hotels!`,
      'lodges': `I found ${totalCount} beautiful lodges!`,
      'guest_houses': `I found ${totalCount} cozy guest houses!`,
      'camping': `I found ${totalCount} great camping sites!`,
      'cafes': `I found ${totalCount} lovely cafes!`
    };

    let displayMessage;
    if (cityName) {
      displayMessage = `I found ${totalCount} wonderful ${itemType === 'amenity' ? 'amenities' : 'attractions'} in ${cityName}!`;
    } else {
      displayMessage = messagesByCategory[category] || messagesByCategory['all'];
    }

    return {
      fulfillmentText: displayMessage,
      payload: {
        flutter: {
          type: itemType === 'amenity' ? 'amenities_list' : 'attractions_list',
          category: category,
          data: {
            [itemType === 'amenity' ? 'amenities' : 'attractions']: allItems,
            count: totalCount,
            cityName: cityName,
            itemType: itemType
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
    // ✅ PAGINATION AVEC DIALOGFLOW CONTEXT
    const firstPageItems = allItems.slice(0, ITEMS_PER_PAGE);
    const remainingItems = allItems.slice(ITEMS_PER_PAGE);
    const remainingCount = remainingItems.length;
    
    console.log(`📄 Pagination: Showing ${firstPageItems.length}, ${remainingCount} remaining`);
    
    // ✅ CRÉER DIALOGFLOW CONTEXT au lieu de session backend
    const waitingForMoreContext = createDialogflowContext(sessionId, 'waiting-for-more', 2, {
      remainingItems: JSON.stringify(remainingItems),
      category: category,
      categoryDisplayName: categoryDisplayName,
      cityName: cityName || '',
      itemType: itemType,
      totalFound: totalCount
    });

    const messagesByCategory = {
      'all': `I found ${totalCount} amazing attractions! Here are the first ${ITEMS_PER_PAGE}:`,
      'natural': `I found ${totalCount} natural attractions! Here are the first ${ITEMS_PER_PAGE}:`,
      'cultural': `I found ${totalCount} cultural attractions! Here are the first ${ITEMS_PER_PAGE}:`,
      'historical': `I found ${totalCount} historical attractions! Here are the first ${ITEMS_PER_PAGE}:`,
      'artificial': `I found ${totalCount} artificial attractions! Here are the first ${ITEMS_PER_PAGE}:`,
      'all_amenities': `I found ${totalCount} amenities! Here are the first ${ITEMS_PER_PAGE}:`,
      'restaurants': `I found ${totalCount} restaurants! Here are the first ${ITEMS_PER_PAGE}:`,
      'hotels': `I found ${totalCount} hotels! Here are the first ${ITEMS_PER_PAGE}:`,
      'lodges': `I found ${totalCount} lodges! Here are the first ${ITEMS_PER_PAGE}:`,
      'guest_houses': `I found ${totalCount} guest houses! Here are the first ${ITEMS_PER_PAGE}:`,
      'camping': `I found ${totalCount} camping sites! Here are the first ${ITEMS_PER_PAGE}:`,
      'cafes': `I found ${totalCount} cafes! Here are the first ${ITEMS_PER_PAGE}:`
    };

    let displayMessage;
    if (cityName) {
      displayMessage = `I found ${totalCount} ${itemType === 'amenity' ? 'amenities' : 'attractions'} in ${cityName}! Here are the first ${ITEMS_PER_PAGE}:`;
    } else {
      displayMessage = messagesByCategory[category] || messagesByCategory['all'];
    }

    return {
      fulfillmentText: displayMessage,
      outputContexts: [waitingForMoreContext], // ✅ DIALOGFLOW CONTEXT
      payload: {
        flutter: {
          type: itemType === 'amenity' ? 'amenities_list_with_more' : 'attractions_list_with_more',
          category: category,
          data: {
            [itemType === 'amenity' ? 'amenities' : 'attractions']: firstPageItems,
            count: firstPageItems.length,
            hasMore: true,
            totalCount: totalCount,
            remainingCount: remainingCount,
            cityName: cityName,
            sendMoreMessage: true,
            itemType: itemType
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

// ✅ HANDLE SHOW MORE AVEC DIALOGFLOW CONTEXT
async function handleShowMoreWithContext(contexts, sessionId) {
  console.log(`🔍 handleShowMoreWithContext called for session: ${sessionId}`);
  
  const waitingForMoreContext = findContextByName(contexts, 'waiting-for-more');
  
  if (!waitingForMoreContext || !waitingForMoreContext.parameters) {
    console.log(`❌ No waiting-for-more context found`);
    return {
      fulfillmentText: "I don't have any additional items to show right now. Please ask me about attractions or amenities first."
    };
  }

  const parameters = waitingForMoreContext.parameters;
  const remainingItemsStr = parameters.remainingItems;
  const category = parameters.category || 'all';
  const categoryDisplayName = parameters.categoryDisplayName || 'items';
  const cityName = parameters.cityName || null;
  const itemType = parameters.itemType || 'attraction';

  if (!remainingItemsStr) {
    console.log(`❌ No remaining items in context`);
    return {
      fulfillmentText: "I don't have any additional items to show."
    };
  }

  let remainingItems;
  try {
    remainingItems = JSON.parse(remainingItemsStr);
  } catch (error) {
    console.error('❌ Error parsing remaining items:', error);
    return {
      fulfillmentText: "Sorry, there was an error retrieving additional items."
    };
  }

  console.log(`✅ Showing ${remainingItems.length} more ${itemType}s of category: ${category}`);
  
  const itemLabel = itemType === 'amenity' ? 'amenities' : 'attractions';
  const naturalResponse = cityName 
    ? `Perfect! Here are all the remaining ${itemLabel} in ${cityName}:`
    : `Perfect! Here are all the remaining ${categoryDisplayName} ${itemLabel}:`;

  return {
    fulfillmentText: naturalResponse,
    payload: {
      flutter: {
        type: itemType === 'amenity' ? 'amenities_list' : 'attractions_list',
        category: category,
        data: {
          [itemType === 'amenity' ? 'amenities' : 'attractions']: remainingItems,
          count: remainingItems.length,
          cityName: cityName,
          itemType: itemType
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

// ✅ HANDLE DECLINE AVEC DIALOGFLOW CONTEXT
function handleDeclineWithContext(contexts, sessionId) {
  console.log(`🚫 handleDeclineWithContext called for session: ${sessionId}`);
  
  const waitingForMoreContext = findContextByName(contexts, 'waiting-for-more');
  
  if (waitingForMoreContext) {
    console.log(`✅ Declining pagination request`);
    return {
      fulfillmentText: "No problem! I'm here whenever you need help discovering attractions or amenities in Draa-Tafilalet. What else would you like to know? 😊"
    };
  } else {
    console.log(`ℹ️ General decline response`);
    return {
      fulfillmentText: "Okay, no problem! Is there anything else I can help you with? 😊"
    };
  }
}

// ============================
// ✅ MAP HANDLING AVEC DIALOGFLOW CONTEXTS
// ============================

// ✅ HANDLE SHOW ON MAP AVEC DIALOGFLOW CONTEXT
async function handleShowOnMapWithContext(contexts, sessionId) {
  try {
    console.log(`🗺️ handleShowOnMapWithContext called for session: ${sessionId}`);
    
    const waitingForMapContext = findContextByName(contexts, 'waiting-for-map');
    
    if (!waitingForMapContext || !waitingForMapContext.parameters) {
      console.log(`❌ No waiting-for-map context found`);
      return {
        fulfillmentText: "I don't have location information available. Please ask about a specific attraction or amenity first."
      };
    }

    const parameters = waitingForMapContext.parameters;
    const itemDataStr = parameters.itemData;
    const itemName = parameters.itemName || 'this location';

    if (!itemDataStr) {
      console.log(`❌ No item data in context`);
      return {
        fulfillmentText: "I don't have location information available."
      };
    }

    let itemData;
    try {
      itemData = JSON.parse(itemDataStr);
    } catch (error) {
      console.error('❌ Error parsing item data:', error);
      return {
        fulfillmentText: "Sorry, there was an error retrieving location information."
      };
    }

    const lat = itemData.latitude;
    const lng = itemData.longitude;
    const name = itemData.name || itemName;
    
    if (!lat || !lng) {
      console.log(`❌ Invalid coordinates: lat=${lat}, lng=${lng}`);
      return {
        fulfillmentText: "Location coordinates are not available for this item."
      };
    }
    
    // Créer le lien Google Maps
    const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}&query_place_id=&query=${encodeURIComponent(name)}`;
    
    console.log(`✅ Showing ${name} on map at ${lat}, ${lng}`);

    return {
      fulfillmentText: `Here you can find ${name} on the map: `,
      payload: {
        flutter: {
          type: 'map_location',
          data: {
            item: itemData,
            coordinates: { latitude: lat, longitude: lng },
            googleMapsUrl: googleMapsUrl
          }
        }
      }
    };
  } catch (error) {
    console.error('❌ Error showing on map:', error);
    return {
      fulfillmentText: "Sorry, I couldn't retrieve the location information right now."
    };
  }
}

// ✅ HANDLE MAP DECLINE AVEC DIALOGFLOW CONTEXT
function handleMapDeclineWithContext(contexts, sessionId) {
  console.log(`🚫 handleMapDeclineWithContext called for session: ${sessionId}`);
  
  const waitingForMapContext = findContextByName(contexts, 'waiting-for-map');
  
  if (waitingForMapContext) {
    console.log(`✅ Declining map request`);
    return {
      fulfillmentText: "No problem! Is there anything else you'd like to know about this place or would you like to explore other locations? 😊"
    };
  } else {
    console.log(`ℹ️ General decline response`);
    return {
      fulfillmentText: "Okay, no problem! Is there anything else I can help you with? 😊"
    };
  }
}

// ============================
// 🆕 AMENITIES HANDLERS (Identiques mais avec pagination corrigée)
// ============================

async function handleAllAmenities(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/getAll/Amenities`);
    const allAmenities = response.data;
    
    if (!allAmenities || allAmenities.length === 0) {
      return { fulfillmentText: "No amenities found at the moment." };
    }

    return handlePaginatedResponse(allAmenities, 'all_amenities', 'amenities', sessionId, null, 'amenity');
  } catch (error) {
    console.error('❌ Error fetching all amenities:', error);
    return { fulfillmentText: "Having trouble accessing amenities database." };
  }
}

async function handleRestaurants(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/Restaurants`);
    const restaurants = response.data;
    
    if (!restaurants || restaurants.length === 0) {
      return { fulfillmentText: "No restaurants found." };
    }

    return handlePaginatedResponse(restaurants, 'restaurants', 'restaurants', sessionId, null, 'amenity');
  } catch (error) {
    console.error('❌ Error fetching restaurants:', error);
    return { fulfillmentText: "Having trouble finding restaurants." };
  }
}

async function handleLodges(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/Lodges`);
    const lodges = response.data;
    
    if (!lodges || lodges.length === 0) {
      return { fulfillmentText: "No lodges found." };
    }

    return handlePaginatedResponse(lodges, 'lodges', 'lodges', sessionId, null, 'amenity');
  } catch (error) {
    console.error('❌ Error fetching lodges:', error);
    return { fulfillmentText: "Having trouble finding lodges." };
  }
}

async function handleHotels(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/Hotels`);
    const hotels = response.data;
    
    if (!hotels || hotels.length === 0) {
      return { fulfillmentText: "No hotels found." };
    }

    return handlePaginatedResponse(hotels, 'hotels', 'hotels', sessionId, null, 'amenity');
  } catch (error) {
    console.error('❌ Error fetching hotels:', error);
    return { fulfillmentText: "Having trouble finding hotels." };
  }
}

async function handleGuestHouses(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/GuestHouses`);
    const guestHouses = response.data;
    
    if (!guestHouses || guestHouses.length === 0) {
      return { fulfillmentText: "No guest houses found." };
    }

    return handlePaginatedResponse(guestHouses, 'guest_houses', 'guest houses', sessionId, null, 'amenity');
  } catch (error) {
    console.error('❌ Error fetching guest houses:', error);
    return { fulfillmentText: "Having trouble finding guest houses." };
  }
}

async function handleCamping(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/Camping`);
    const camping = response.data;
    
    if (!camping || camping.length === 0) {
      return { fulfillmentText: "No camping sites found." };
    }

    return handlePaginatedResponse(camping, 'camping', 'camping sites', sessionId, null, 'amenity');
  } catch (error) {
    console.error('❌ Error fetching camping sites:', error);
    return { fulfillmentText: "Having trouble finding camping sites." };
  }
}

async function handleCafes(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/Cafes`);
    const cafes = response.data;
    
    if (!cafes || cafes.length === 0) {
      return { fulfillmentText: "No cafes found." };
    }

    return handlePaginatedResponse(cafes, 'cafes', 'cafes', sessionId, null, 'amenity');
  } catch (error) {
    console.error('❌ Error fetching cafes:', error);
    return { fulfillmentText: "Having trouble finding cafes." };
  }
}

async function handleAmenitiesByCity(sessionId, cityName) {
  try {
    if (!cityName) {
      return {
        fulfillmentText: "Please tell me which city you're interested in for amenities."
      };
    }

    const cityResult = await tryMultipleCityVariants(cityName);
    
    if (!cityResult.success) {
      return {
        fulfillmentText: `I couldn't find amenities information about "${cityName}". Try another city.`
      };
    }

    // Filter amenities (items without entryFre and guideToursAvailable)
    const amenities = cityResult.data.filter(location => 
      !location.hasOwnProperty('entryFre') && !location.hasOwnProperty('guideToursAvailable')
    );

    if (!amenities || amenities.length === 0) {
      return {
        fulfillmentText: `No amenities found in ${cityName}.`
      };
    }

    const formattedCityName = cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase();
    
    return handlePaginatedResponse(amenities, `city_amenities_${cityName.toLowerCase()}`, `amenities in ${formattedCityName}`, sessionId, formattedCityName, 'amenity');
  } catch (error) {
    console.error(`❌ Error finding amenities in ${cityName}:`, error);
    return {
      fulfillmentText: `Having trouble finding amenities in ${cityName}.`
    };
  }
}

// ✅ AMENITY DETAILS AVEC DIALOGFLOW CONTEXT
async function handleAmenityDetails(sessionId, amenityName) {
  try {
    if (!amenityName) {
      return {
        fulfillmentText: "Please tell me which amenity you'd like to know more about."
      };
    }

    console.log(`🔍 Fetching details for amenity: ${amenityName}`);
    
    const response = await makeApiCall(
      `${API_BASE_URL}/api/public/getLocationByName/${encodeURIComponent(amenityName)}`
    );

    if (!response.data || response.data.length === 0) {
      return {
        fulfillmentText: `I couldn't find detailed information about "${amenityName}". Please check the spelling or try another amenity name.`
      };
    }

    const amenityData = response.data[0];
    const amenityType = determineAmenityType(amenityData);
    
    console.log(`✅ Found ${amenityType} amenity: ${amenityData.name}`);

    // ✅ CRÉER DIALOGFLOW CONTEXT pour la carte au lieu de session backend
    const waitingForMapContext = createDialogflowContext(sessionId, 'waiting-for-map', 2, {
      itemData: JSON.stringify(amenityData),
      itemType: 'amenity',
      amenityType: amenityType,
      itemName: amenityData.name
    });

    // Premier message: juste les images
    return {
      fulfillmentText: "",
      outputContexts: [waitingForMapContext], // ✅ DIALOGFLOW CONTEXT
      payload: {
        flutter: {
          type: 'amenity_details',
          category: amenityType,
          data: {
            amenity: amenityData,
            amenityType: amenityType,
            onlyImages: true
          }
        }
      }
    };

  } catch (error) {
    console.error(`❌ Error fetching amenity details for ${amenityName}:`, error);
    
    if (error.response?.status === 404) {
      return {
        fulfillmentText: `I couldn't find an amenity named "${amenityName}". Please check the name or try searching for something similar.`
      };
    }
    
    return {
      fulfillmentText: `Sorry, I'm having trouble retrieving details about "${amenityName}" right now. Please try again later.`
    };
  }
}

function determineAmenityType(amenityData) {
  // Vérifier les propriétés spécifiques pour déterminer le type d'amenity
  if (amenityData.hasOwnProperty('menu') && amenityData.hasOwnProperty('typeCuisine')) {
    return 'restaurant';
  } else if (amenityData.hasOwnProperty('viewPanoramic') && amenityData.hasOwnProperty('closeNature')) {
    return 'lodge';
  } else if (amenityData.hasOwnProperty('numberStars') && amenityData.hasOwnProperty('numberOfRooms')) {
    return 'hotel';
  } else if (amenityData.hasOwnProperty('numberRooms') && amenityData.hasOwnProperty('breakfastIncluded')) {
    return 'guest_house';
  } else if (amenityData.hasOwnProperty('capacity') && amenityData.hasOwnProperty('hasWaterSupply')) {
    return 'camping';
  } else if (amenityData.hasOwnProperty('wifiAvailable') && amenityData.hasOwnProperty('menu')) {
    return 'cafe';
  } else {
    // Fallback - analyser le nom ou la description
    const name = (amenityData.name || '').toLowerCase();
    const description = (amenityData.description || '').toLowerCase();
    
    if (name.includes('restaurant') || description.includes('restaurant')) {
      return 'restaurant';
    } else if (name.includes('hotel') || description.includes('hotel')) {
      return 'hotel';
    } else if (name.includes('lodge') || description.includes('lodge')) {
      return 'lodge';
    } else if (name.includes('cafe') || name.includes('café') || description.includes('cafe')) {
      return 'cafe';
    } else if (name.includes('camping') || description.includes('camping')) {
      return 'camping';
    } else if (name.includes('guest') || name.includes('house') || description.includes('guest')) {
      return 'guest_house';
    } else {
      return 'amenity';
    }
  }
}

// ============================
// ATTRACTION HANDLERS (Identiques mais avec pagination corrigée)
// ============================

async function handleAllAttractions(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/getAll/Attraction`);
    const allAttractions = response.data;
    
    if (!allAttractions || allAttractions.length === 0) {
      return { fulfillmentText: "No attractions found at the moment." };
    }

    return handlePaginatedResponse(allAttractions, 'all', 'general', sessionId, null, 'attraction');
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

    return handlePaginatedResponse(allAttractions, 'natural', 'natural', sessionId, null, 'attraction');
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

    return handlePaginatedResponse(allAttractions, 'cultural', 'cultural', sessionId, null, 'attraction');
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

    return handlePaginatedResponse(allAttractions, 'historical', 'historical', sessionId, null, 'attraction');
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

    return handlePaginatedResponse(allAttractions, 'artificial', 'artificial', sessionId, null, 'attraction');
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
    
    return handlePaginatedResponse(attractions, `city_${cityName.toLowerCase()}`, `attractions in ${formattedCityName}`, sessionId, formattedCityName, 'attraction');
  } catch (error) {
    console.error(`❌ Error finding attractions in ${cityName}:`, error);
    return {
      fulfillmentText: `Having trouble finding attractions in ${cityName}.`
    };
  }
}

// ✅ ATTRACTION DETAILS AVEC DIALOGFLOW CONTEXT
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

    // ✅ CRÉER DIALOGFLOW CONTEXT pour la carte au lieu de session backend
    const waitingForMapContext = createDialogflowContext(sessionId, 'waiting-for-map', 2, {
      itemData: JSON.stringify(attractionData),
      itemType: 'attraction',
      attractionType: attractionType,
      itemName: attractionData.name
    });

    // Premier message: juste les images
    return {
      fulfillmentText: "",
      outputContexts: [waitingForMapContext], // ✅ DIALOGFLOW CONTEXT
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

// ============================
// ❌ DEBUG ENDPOINTS - SUPPRIMÉS (plus nécessaires avec Dialogflow contexts)
// ============================

// ============================
// ERROR HANDLING (Identique)
// ============================

app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);
  res.status(500).json({
    fulfillmentText: "An unexpected error occurred."
  });
});

// ============================
// SERVER STARTUP (Identique)
// ============================

initializeGoogleAuth().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Tourism Bot Backend started on port ${PORT}`);
    console.log(`🔑 Google Auth initialized: ${!!googleAuth}`);
    console.log(`📋 Project ID: ${PROJECT_ID}`);
    console.log('✅ Ready to handle Dialogflow requests with Contexts!');
  });
}).catch(error => {
  console.error('❌ Failed to initialize:', error);
  app.listen(PORT, () => {
    console.log(`⚠️ Tourism Bot Backend started in FALLBACK mode on port ${PORT}`);
  });
});

module.exports = app;