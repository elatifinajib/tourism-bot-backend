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
// DETECTION FUNCTIONS
// ============================

// Fonction pour détecter si c'est une attraction
function isAttraction(item) {
  return item.hasOwnProperty('entryFre') && item.hasOwnProperty('guideToursAvailable');
}

// Fonction pour détecter si c'est une amenity
function isAmenity(item) {
  return item.hasOwnProperty('price') && item.hasOwnProperty('openingHours') && item.hasOwnProperty('available');
}

// Fonction pour déterminer le type d'attraction
function determineAttractionType(attractionData) {
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

// 🆕 NOUVELLE FONCTION: Déterminer le type d'amenity
function determineAmenityType(amenityData) {
  // Restaurant
  if (amenityData.hasOwnProperty('menu') && amenityData.hasOwnProperty('typeCuisine')) {
    return 'restaurant';
  }
  // Hotel
  else if (amenityData.hasOwnProperty('numberStars') && amenityData.hasOwnProperty('numberOfRooms') && amenityData.hasOwnProperty('hasSwimmingPool')) {
    return 'hotel';
  }
  // Lodge
  else if (amenityData.hasOwnProperty('viewPanoramic') && amenityData.hasOwnProperty('closeNature')) {
    return 'lodge';
  }
  // Guest House
  else if (amenityData.hasOwnProperty('numberRooms') && amenityData.hasOwnProperty('breakfastIncluded')) {
    return 'guesthouse';
  }
  // Camping
  else if (amenityData.hasOwnProperty('capacity') && amenityData.hasOwnProperty('hasWaterSupply') && amenityData.hasOwnProperty('electricityAvailability')) {
    return 'camping';
  }
  // Cafe
  else if (amenityData.hasOwnProperty('wifiAvailable') && amenityData.hasOwnProperty('menu')) {
    return 'cafe';
  }
  // Fallback - analyser le nom
  else {
    const name = (amenityData.name || '').toLowerCase();
    const description = (amenityData.description || '').toLowerCase();
    
    if (name.includes('restaurant') || description.includes('restaurant') || description.includes('food')) {
      return 'restaurant';
    } else if (name.includes('hotel') || description.includes('hotel')) {
      return 'hotel';
    } else if (name.includes('lodge') || description.includes('lodge')) {
      return 'lodge';
    } else if (name.includes('guest') || name.includes('house') || description.includes('guest house')) {
      return 'guesthouse';
    } else if (name.includes('camping') || name.includes('camp') || description.includes('camping')) {
      return 'camping';
    } else if (name.includes('cafe') || name.includes('coffee') || description.includes('cafe')) {
      return 'cafe';
    } else {
      return 'amenity'; // Type générique
    }
  }
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
      // ATTRACTIONS INTENTS (existing)
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
        const cityNameAttr = parameters.city || parameters['geo-city'] || parameters.name;
        return await handleAttractionsByCity(sessionId, cityNameAttr);
      
      // 🆕 NOUVEAUX INTENTS AMENITIES
      case 'Ask_All_Amenities':
        return await handleAllAmenities(sessionId);
      
      case 'Ask_Restaurants':
        return await handleRestaurants(sessionId);
      
      case 'Ask_Hotels':
        return await handleHotels(sessionId);
      
      case 'Ask_Lodges':
        return await handleLodges(sessionId);
      
      case 'Ask_GuestHouses':
        return await handleGuestHouses(sessionId);
      
      case 'Ask_Camping':
        return await handleCamping(sessionId);
      
      case 'Ask_Cafes':
        return await handleCafes(sessionId);
      
      case 'Ask_Amenities_By_City':
        const cityNameAmen = parameters.city || parameters['geo-city'] || parameters.name;
        return await handleAmenitiesByCity(sessionId, cityNameAmen);
      
      // SHARED INTENTS (work for both attractions and amenities)
      case 'Pagination_ShowMore':
        return await handleShowMore(sessionId);
      
      case 'Pagination_Decline':
        return handleDecline(sessionId);
      
      case 'Ask_Details': // Generic details intent for both attractions and amenities
        const itemName = parameters['item-name'] || parameters['attraction-name'] || parameters['amenity-name'] || parameters.name;
        return await handleItemDetails(sessionId, itemName);
      
      // MAP INTENTS (work for both)
      case 'Show_Item_On_Map':
      case 'Map_Request_Yes':
        return await handleShowItemOnMap(sessionId);
      
      case 'Map_Request_No':
        return handleMapDecline(sessionId);
      
      case 'Default Welcome Intent':
        return {
          fulfillmentText: "Welcome to Draa-Tafilalet Tourism Assistant! I can help you discover attractions, amenities, restaurants, hotels, and more."
        };
        
      default:
        return {
          fulfillmentText: `I understand you're asking about "${intentName}", but I'm not sure how to help with that. Try asking about attractions, restaurants, hotels, or other amenities.`
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
// 🆕 AMENITIES HANDLERS
// ============================

async function handleAllAmenities(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/getAll/Amenities`);
    const allAmenities = response.data;
    
    if (!allAmenities || allAmenities.length === 0) {
      return { fulfillmentText: "No amenities found at the moment." };
    }

    return handlePaginatedResponse(allAmenities, 'all_amenities', 'amenities', sessionId, null, 'amenities');
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

    return handlePaginatedResponse(restaurants, 'restaurants', 'restaurants', sessionId, null, 'amenities');
  } catch (error) {
    console.error('❌ Error fetching restaurants:', error);
    return { fulfillmentText: "Having trouble finding restaurants." };
  }
}

async function handleHotels(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/Hotels`);
    const hotels = response.data;
    
    if (!hotels || hotels.length === 0) {
      return { fulfillmentText: "No hotels found." };
    }

    return handlePaginatedResponse(hotels, 'hotels', 'hotels', sessionId, null, 'amenities');
  } catch (error) {
    console.error('❌ Error fetching hotels:', error);
    return { fulfillmentText: "Having trouble finding hotels." };
  }
}

async function handleLodges(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/Lodges`);
    const lodges = response.data;
    
    if (!lodges || lodges.length === 0) {
      return { fulfillmentText: "No lodges found." };
    }

    return handlePaginatedResponse(lodges, 'lodges', 'lodges', sessionId, null, 'amenities');
  } catch (error) {
    console.error('❌ Error fetching lodges:', error);
    return { fulfillmentText: "Having trouble finding lodges." };
  }
}

async function handleGuestHouses(sessionId) {
  try {
    const response = await makeApiCall(`${API_BASE_URL}/api/public/GuestHouses`);
    const guestHouses = response.data;
    
    if (!guestHouses || guestHouses.length === 0) {
      return { fulfillmentText: "No guest houses found." };
    }

    return handlePaginatedResponse(guestHouses, 'guesthouses', 'guest houses', sessionId, null, 'amenities');
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

    return handlePaginatedResponse(camping, 'camping', 'camping sites', sessionId, null, 'amenities');
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

    return handlePaginatedResponse(cafes, 'cafes', 'cafes', sessionId, null, 'amenities');
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

    // Filtrer pour obtenir seulement les amenities (ont price, openingHours, available)
    const amenities = cityResult.data.filter(location => isAmenity(location));

    if (!amenities || amenities.length === 0) {
      return {
        fulfillmentText: `No amenities found in ${cityName}.`
      };
    }

    const formattedCityName = cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase();
    
    return handlePaginatedResponse(amenities, `city_amenities_${cityName.toLowerCase()}`, `amenities in ${formattedCityName}`, sessionId, formattedCityName, 'amenities');
  } catch (error) {
    console.error(`❌ Error finding amenities in ${cityName}:`, error);
    return {
      fulfillmentText: `Having trouble finding amenities in ${cityName}.`
    };
  }
}

// ============================
// EXISTING ATTRACTION HANDLERS (unchanged)
// ============================

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

    // Filtrer pour obtenir seulement les attractions
    const attractions = cityResult.data.filter(location => isAttraction(location));

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
// 🔧 MODIFIED: GENERIC ITEM DETAILS HANDLER
// ============================

async function handleItemDetails(sessionId, itemName) {
  try {
    if (!itemName) {
      return {
        fulfillmentText: "Please tell me which place you'd like to know more about."
      };
    }

    console.log(`🔍 Fetching details for item: ${itemName}`);
    
    const response = await makeApiCall(
      `${API_BASE_URL}/api/public/getLocationByName/${encodeURIComponent(itemName)}`
    );

    if (!response.data || response.data.length === 0) {
      return {
        fulfillmentText: `I couldn't find detailed information about "${itemName}". Please check the spelling or try another name.`
      };
    }

    const itemData = response.data[0];
    
    // Déterminer si c'est une attraction ou une amenity
    let itemType, category;
    if (isAttraction(itemData)) {
      itemType = 'attraction';
      category = determineAttractionType(itemData);
    } else if (isAmenity(itemData)) {
      itemType = 'amenity';
      category = determineAmenityType(itemData);
    } else {
      itemType = 'location';
      category = 'general';
    }
    
    console.log(`✅ Found ${itemType} (${category}): ${itemData.name}`);

    // Sauvegarder les données pour le flux map
    saveSessionData(sessionId, {
      itemData: itemData,
      itemType: itemType,
      category: category,
      waitingForDetailsText: true,
      waitingForMapResponse: true,
      itemName: itemData.name
    });

    // Premier message: juste les images
    return {
      fulfillmentText: "",
      payload: {
        flutter: {
          type: itemType === 'attraction' ? 'attraction_details' : 'amenity_details',
          category: category,
          data: {
            [itemType]: itemData,
            [`${itemType}Type`]: category,
            onlyImages: true
          }
        }
      }
    };

  } catch (error) {
    console.error(`❌ Error fetching item details for ${itemName}:`, error);
    
    if (error.response?.status === 404) {
      return {
        fulfillmentText: `I couldn't find a place named "${itemName}". Please check the name or try searching for something similar.`
      };
    }
    
    return {
      fulfillmentText: `Sorry, I'm having trouble retrieving details about "${itemName}" right now. Please try again later.`
    };
  }
}

// ============================
// PAGINATION HANDLERS (modified to support both attractions and amenities)
// ============================

function handlePaginatedResponse(allItems, category, categoryDisplayName, sessionId, cityName = null, contentType = 'attractions') {
  const ITEMS_PER_PAGE = 10;
  const totalCount = allItems.length;
  
  // Messages selon le type de contenu
  const getDisplayMessage = (count, isFirst = false) => {
    const prefix = isFirst ? `I found ${count}` : `Here are all the remaining`;
    
    if (cityName) {
      return `${prefix} ${contentType} in ${cityName}!`;
    }
    
    const contentMessages = {
      'attractions': {
        'all': `${prefix} amazing attractions in Draa-Tafilalet!`,
        'natural': `${prefix} beautiful natural attractions!`,
        'cultural': `${prefix} fascinating cultural attractions!`,
        'historical': `${prefix} remarkable historical attractions!`,
        'artificial': `${prefix} impressive artificial attractions!`
      },
      'amenities': {
        'all_amenities': `${prefix} great amenities in Draa-Tafilalet!`,
        'restaurants': `${prefix} delicious restaurants!`,
        'hotels': `${prefix} comfortable hotels!`,
        'lodges': `${prefix} cozy lodges!`,
        'guesthouses': `${prefix} welcoming guest houses!`,
        'camping': `${prefix} camping sites!`,
        'cafes': `${prefix} lovely cafes!`
      }
    };
    
    return contentMessages[contentType]?.[category] || `${prefix} ${categoryDisplayName}!`;
  };
  
  if (totalCount <= ITEMS_PER_PAGE) {
    return {
      fulfillmentText: getDisplayMessage(totalCount, true),
      payload: {
        flutter: {
          type: contentType === 'attractions' ? 'attractions_list' : 'amenities_list',
          category: category,
          data: {
            [contentType]: allItems,
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
    const firstPageItems = allItems.slice(0, ITEMS_PER_PAGE);
    const remainingItems = allItems.slice(ITEMS_PER_PAGE);
    const remainingCount = remainingItems.length;
    
    saveSessionData(sessionId, {
      remainingItems,
      category,
      categoryDisplayName,
      cityName: cityName,
      contentType: contentType,
      waitingForMoreResponse: true
    });

    return {
      fulfillmentText: getDisplayMessage(totalCount, true).replace('!', `. Here are the first ${ITEMS_PER_PAGE}:`),
      payload: {
        flutter: {
          type: contentType === 'attractions' ? 'attractions_list_with_more' : 'amenities_list_with_more',
          category: category,
          data: {
            [contentType]: firstPageItems,
            count: firstPageItems.length,
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

async function handleShowMore(sessionId) {
  const sessionData = getSessionData(sessionId);
  
  if (!sessionData || !sessionData.remainingItems || sessionData.remainingItems.length === 0) {
    return {
      fulfillmentText: "I don't have any additional items to show right now."
    };
  }

  const { remainingItems, category, categoryDisplayName, cityName, contentType } = sessionData;
  
  sessionStorage.delete(sessionId);

  const naturalResponse = cityName 
    ? `Perfect! Here are all the remaining ${contentType} in ${cityName}:`
    : `Perfect! Here are all the remaining ${categoryDisplayName}:`;

  return {
    fulfillmentText: naturalResponse,
    payload: {
      flutter: {
        type: contentType === 'attractions' ? 'attractions_list' : 'amenities_list',
        category: category,
        data: {
          [contentType]: remainingItems,
          count: remainingItems.length,
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
    fulfillmentText: "No problem! I'm here whenever you need help discovering places in Draa-Tafilalet. Just ask me anytime!"
  };
}

// ============================
// MAP HANDLERS (modified to work with both attractions and amenities)
// ============================

async function handleShowItemOnMap(sessionId) {
  try {
    const sessionData = getSessionData(sessionId);
    
    if (!sessionData || !sessionData.itemData) {
      return {
        fulfillmentText: "I don't have location information available. Please ask about a specific place first."
      };
    }

    const item = sessionData.itemData;
    const lat = item.latitude;
    const lng = item.longitude;
    const name = item.name;
    
    // Créer le lien Google Maps
    const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}&query_place_id=&query=${encodeURIComponent(name)}`;
    
    // Nettoyer la session
    sessionStorage.delete(sessionId);

    return {
      fulfillmentText: `Here you can find ${name} on the map: `,
      payload: {
        flutter: {
          type: 'map_location',
          data: {
            item: item,
            coordinates: { latitude: lat, longitude: lng },
            googleMapsUrl: googleMapsUrl
          }
        }
      }
    };
  } catch (error) {
    console.error('❌ Error showing item on map:', error);
    return {
      fulfillmentText: "Sorry, I couldn't retrieve the location information right now."
    };
  }
}

function handleMapDecline(sessionId) {
  if (sessionId) {
    sessionStorage.delete(sessionId);
  }
  
  return {
    fulfillmentText: "No problem! Is there anything else you'd like to know about this place or would you like to explore other locations?"
  };
}

// ============================
// TEXT GENERATION FOR DETAILS (modified to support amenities)
// ============================

function sendItemDetailsText(itemData, itemType, category) {
  let message = `**${itemData.name}**\n\n`;
  message += `📍 **Location:** ${itemData.cityName}, ${itemData.countryName}\n\n`;
  
  if (itemData.description) {
    message += `📝 **Description:**\n${itemData.description}\n\n`;
  }
  
  if (itemType === 'attraction') {
    // Attraction-specific details
    message += `💰 **Entry Fee:** ${itemData.entryFre == 0 ? 'Free' : itemData.entryFre + ' MAD'}\n`;
    message += `🎯 **Guided Tours:** ${itemData.guideToursAvailable ? 'Available' : 'Not Available'}\n`;
    
    // Add type-specific info
    switch (category) {
      case 'natural':
        if (itemData.protectedArea !== undefined) {
          message += `🌿 **Protected Area:** ${itemData.protectedArea ? 'Yes - Protected Natural Site' : 'No'}\n`;
        }
        break;
        
      case 'cultural':
      case 'historical':
      case 'artificial':
        if (itemData.yearBuild) {
          message += `📅 **Year Built:** ${itemData.yearBuild}\n`;
        }
        if (itemData.style) {
          message += `🏛️ **Architectural Style:** ${itemData.style}\n`;
        }
        break;
    }
  } else if (itemType === 'amenity') {
    // Amenity-specific details
    message += `💰 **Price Range:** ${itemData.price == 0 ? 'Free' : itemData.price + ' MAD'}\n`;
    message += `🕐 **Opening Hours:** ${itemData.openingHours}\n`;
    message += `✅ **Available:** ${itemData.available ? 'Yes' : 'No'}\n`;
    
    // Add amenity type-specific info
    switch (category) {
      case 'restaurant':
        if (itemData.typeCuisine) {
          message += `🍽️ **Cuisine Type:** ${itemData.typeCuisine}\n`;
        }
        if (itemData.menu) {
          message += `📋 **Menu:** ${itemData.menu}\n`;
        }
        break;
        
      case 'hotel':
        if (itemData.numberStars) {
          message += `⭐ **Stars:** ${itemData.numberStars}\n`;
        }
        if (itemData.numberOfRooms) {
          message += `🏠 **Rooms:** ${itemData.numberOfRooms}\n`;
        }
        if (itemData.hasSwimmingPool !== undefined) {
          message += `🏊 **Swimming Pool:** ${itemData.hasSwimmingPool ? 'Available' : 'Not Available'}\n`;
        }
        break;
        
      case 'lodge':
        if (itemData.viewPanoramic !== undefined) {
          message += `🏔️ **Panoramic View:** ${itemData.viewPanoramic ? 'Available' : 'Not Available'}\n`;
        }
        if (itemData.closeNature !== undefined) {
          message += `🌲 **Close to Nature:** ${itemData.closeNature ? 'Yes' : 'No'}\n`;
        }
        break;
        
      case 'guesthouse':
        if (itemData.numberRooms) {
          message += `🏠 **Number of Rooms:** ${itemData.numberRooms}\n`;
        }
        if (itemData.breakfastIncluded !== undefined) {
          message += `🍳 **Breakfast Included:** ${itemData.breakfastIncluded ? 'Yes' : 'No'}\n`;
        }
        break;
        
      case 'camping':
        if (itemData.capacity) {
          message += `👥 **Capacity:** ${itemData.capacity} people\n`;
        }
        if (itemData.hasWaterSupply !== undefined) {
          message += `💧 **Water Supply:** ${itemData.hasWaterSupply ? 'Available' : 'Not Available'}\n`;
        }
        if (itemData.electricityAvailability !== undefined) {
          message += `⚡ **Electricity:** ${itemData.electricityAvailability ? 'Available' : 'Not Available'}\n`;
        }
        if (itemData.sanitaryAvailability !== undefined) {
          message += `🚿 **Sanitary Facilities:** ${itemData.sanitaryAvailability ? 'Available' : 'Not Available'}\n`;
        }
        break;
        
      case 'cafe':
        if (itemData.wifiAvailable !== undefined) {
          message += `📶 **WiFi:** ${itemData.wifiAvailable ? 'Available' : 'Not Available'}\n`;
        }
        if (itemData.menu) {
          message += `📋 **Menu:** ${itemData.menu}\n`;
        }
        break;
    }
  }
  
  // Question pour la carte
  message += `\n🗺️ Would you like to see this place on the map?`;
  
  return message;
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