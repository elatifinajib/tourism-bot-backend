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

// Constants
const ITEMS_PER_PAGE = 10;
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour
const API_TIMEOUT = 30000;
const MAX_RETRIES = 3;

// Session storage
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
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const { GoogleAuth } = require('google-auth-library');
      googleAuth = new GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/dialogflow'],
      });
      console.log('✅ Google Auth initialized with file credentials');
    } else {
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

class ApiService {
  static async makeCall(url, maxRetries = MAX_RETRIES, timeoutMs = API_TIMEOUT) {
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

  static async tryMultipleCityVariants(cityName) {
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
        const response = await this.makeCall(
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
}

// ============================
// SESSION MANAGEMENT
// ============================

class SessionManager {
  static save(sessionId, data) {
    const newData = { ...data, timestamp: Date.now() };
    sessionStorage.set(sessionId, newData);
    console.log(`💾 Session data saved for ${sessionId}`);
  }

  static get(sessionId) {
    const data = sessionStorage.get(sessionId);
    
    if (data) {
      if (Date.now() - data.timestamp > SESSION_TIMEOUT) {
        sessionStorage.delete(sessionId);
        return null;
      }
    }
    
    return data;
  }

  static delete(sessionId) {
    sessionStorage.delete(sessionId);
  }

  static extractId(sessionPath) {
    return sessionPath ? sessionPath.split('/').pop() : 'default-session';
  }
}

// ============================
// TYPE DETECTION UTILITIES
// ============================

class TypeDetector {
  static isAttraction(item) {
    return item.hasOwnProperty('entryFre') && item.hasOwnProperty('guideToursAvailable');
  }

  static isAmenity(item) {
    return item.hasOwnProperty('price') && item.hasOwnProperty('openingHours') && item.hasOwnProperty('available');
  }

  static determineAttractionType(attractionData) {
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

  static determineAmenityType(amenityData) {
    if (amenityData.hasOwnProperty('menu') && amenityData.hasOwnProperty('typeCuisine')) {
      return 'restaurant';
    } else if (amenityData.hasOwnProperty('numberStars') && amenityData.hasOwnProperty('numberOfRooms') && amenityData.hasOwnProperty('hasSwimmingPool')) {
      return 'hotel';
    } else if (amenityData.hasOwnProperty('viewPanoramic') && amenityData.hasOwnProperty('closeNature')) {
      return 'lodge';
    } else if (amenityData.hasOwnProperty('numberRooms') && amenityData.hasOwnProperty('breakfastIncluded')) {
      return 'guesthouse';
    } else if (amenityData.hasOwnProperty('capacity') && amenityData.hasOwnProperty('hasWaterSupply') && amenityData.hasOwnProperty('electricityAvailability')) {
      return 'camping';
    } else if (amenityData.hasOwnProperty('wifiAvailable') && amenityData.hasOwnProperty('menu')) {
      return 'cafe';
    } else {
      const name = (amenityData.name || '').toLowerCase();
      const description = (amenityData.description || '').toLowerCase();
      
      const typeMap = {
        restaurant: ['restaurant', 'food'],
        hotel: ['hotel'],
        lodge: ['lodge'],
        guesthouse: ['guest', 'house', 'guest house'],
        camping: ['camping', 'camp'],
        cafe: ['cafe', 'coffee']
      };

      for (const [type, keywords] of Object.entries(typeMap)) {
        if (keywords.some(keyword => name.includes(keyword) || description.includes(keyword))) {
          return type;
        }
      }
      
      return 'amenity';
    }
  }
}

// ============================
// MESSAGE GENERATORS
// ============================

class MessageGenerator {
  static getDisplayMessage(count, category, contentType, cityName = null, isFirst = false) {
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
    
    return contentMessages[contentType]?.[category] || `${prefix} items!`;
  }

  static createPaginationResponse(allItems, category, categoryDisplayName, sessionId, cityName = null, contentType = 'attractions') {
    const totalCount = allItems.length;
    
    const getActions = () => [
      { type: 'view_details', label: 'View Details', icon: 'info' },
      { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
      { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
    ];
    
    if (totalCount <= ITEMS_PER_PAGE) {
      return {
        fulfillmentText: this.getDisplayMessage(totalCount, category, contentType, cityName, true),
        payload: {
          flutter: {
            type: contentType === 'attractions' ? 'attractions_list' : 'amenities_list',
            category: category,
            data: {
              [contentType]: allItems,
              count: totalCount,
              cityName: cityName
            },
            actions: getActions()
          }
        }
      };
    } else {
      const firstPageItems = allItems.slice(0, ITEMS_PER_PAGE);
      const remainingItems = allItems.slice(ITEMS_PER_PAGE);
      const remainingCount = remainingItems.length;
      
      SessionManager.save(sessionId, {
        remainingItems,
        category,
        categoryDisplayName,
        cityName: cityName,
        contentType: contentType,
        waitingForMoreResponse: true
      });

      return {
        fulfillmentText: this.getDisplayMessage(totalCount, category, contentType, cityName, true)
          .replace('!', `. Here are the first ${ITEMS_PER_PAGE}:`),
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
            actions: getActions()
          }
        }
      };
    }
  }
}

// ============================
// API ENDPOINT MAPPINGS
// ============================

const API_ENDPOINTS = {
  attractions: {
    all: '/api/public/getAll/Attraction',
    natural: '/api/public/NaturalAttractions',
    cultural: '/api/public/CulturalAttractions',
    historical: '/api/public/HistoricalAttractions',
    artificial: '/api/public/ArtificialAttractions'
  },
  amenities: {
    all: '/api/public/getAll/Amenities',
    restaurants: '/api/public/Restaurants',
    hotels: '/api/public/Hotels',
    lodges: '/api/public/Lodges',
    guesthouses: '/api/public/GuestHouses',
    camping: '/api/public/Camping',
    cafes: '/api/public/Cafes'
  }
};

// ============================
// GENERIC HANDLERS
// ============================

class ContentHandler {
  static async handleGenericContent(endpoint, category, displayName, sessionId, contentType = 'attractions') {
    try {
      const response = await ApiService.makeCall(`${API_BASE_URL}${endpoint}`);
      const items = response.data;
      
      if (!items || items.length === 0) {
        return { fulfillmentText: `No ${displayName} found.` };
      }

      return MessageGenerator.createPaginationResponse(items, category, displayName, sessionId, null, contentType);
    } catch (error) {
      console.error(`❌ Error fetching ${displayName}:`, error);
      return { fulfillmentText: `Having trouble finding ${displayName}.` };
    }
  }

  static async handleContentByCity(sessionId, cityName, contentType) {
    try {
      if (!cityName) {
        return {
          fulfillmentText: `Please tell me which city you're interested in for ${contentType}.`
        };
      }

      const cityResult = await ApiService.tryMultipleCityVariants(cityName);
      
      if (!cityResult.success) {
        return {
          fulfillmentText: `I couldn't find ${contentType} information about "${cityName}". Try another city.`
        };
      }

      const items = cityResult.data.filter(location => 
        contentType === 'attractions' ? TypeDetector.isAttraction(location) : TypeDetector.isAmenity(location)
      );

      if (!items || items.length === 0) {
        return {
          fulfillmentText: `No ${contentType} found in ${cityName}.`
        };
      }

      const formattedCityName = cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase();
      
      return MessageGenerator.createPaginationResponse(
        items, 
        `city_${contentType}_${cityName.toLowerCase()}`, 
        `${contentType} in ${formattedCityName}`, 
        sessionId, 
        formattedCityName, 
        contentType
      );
    } catch (error) {
      console.error(`❌ Error finding ${contentType} in ${cityName}:`, error);
      return {
        fulfillmentText: `Having trouble finding ${contentType} in ${cityName}.`
      };
    }
  }

  static async handleItemDetails(sessionId, itemName, itemType) {
    try {
      if (!itemName) {
        return {
          fulfillmentText: `Please tell me which ${itemType} you'd like to know more about.`
        };
      }

      console.log(`🔍 Fetching details for ${itemType}: ${itemName}`);
      
      const response = await ApiService.makeCall(
        `${API_BASE_URL}/api/public/getLocationByName/${encodeURIComponent(itemName)}`
      );

      if (!response.data || response.data.length === 0) {
        return {
          fulfillmentText: `I couldn't find detailed information about "${itemName}". Please check the spelling or try another name.`
        };
      }

      const itemData = response.data[0];
      
      // Verify item type
      const isCorrectType = itemType === 'attraction' 
        ? TypeDetector.isAttraction(itemData)
        : TypeDetector.isAmenity(itemData);
      
      if (!isCorrectType) {
        const alternativeType = itemType === 'attraction' ? 'amenity' : 'attraction';
        return {
          fulfillmentText: `"${itemName}" appears to be an ${alternativeType}, not an ${itemType}. Try asking for ${alternativeType} details.`
        };
      }
      
      const category = itemType === 'attraction' 
        ? TypeDetector.determineAttractionType(itemData)
        : TypeDetector.determineAmenityType(itemData);
      
      console.log(`✅ Found ${itemType} (${category}): ${itemData.name}`);

      // Save session data for map flow
      SessionManager.save(sessionId, {
        [`${itemType}Data`]: itemData,
        [`${itemType}Type`]: category,
        waitingForDetailsText: true,
        waitingForMapResponse: true,
        [`${itemType}Name`]: itemData.name
      });

      return {
        fulfillmentText: "",
        payload: {
          flutter: {
            type: `${itemType}_details`,
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
      console.error(`❌ Error fetching ${itemType} details for ${itemName}:`, error);
      
      if (error.response?.status === 404) {
        return {
          fulfillmentText: `I couldn't find a ${itemType} named "${itemName}". Please check the name or try searching for something similar.`
        };
      }
      
      return {
        fulfillmentText: `Sorry, I'm having trouble retrieving details about "${itemName}" right now. Please try again later.`
      };
    }
  }
}

// ============================
// INTENT HANDLERS
// ============================

const IntentHandlers = {
  // Attraction handlers
  async handleAllAttractions(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.attractions.all, 'all', 'attractions', sessionId, 'attractions'
    );
  },

  async handleNaturalAttractions(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.attractions.natural, 'natural', 'natural attractions', sessionId, 'attractions'
    );
  },

  async handleCulturalAttractions(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.attractions.cultural, 'cultural', 'cultural attractions', sessionId, 'attractions'
    );
  },

  async handleHistoricalAttractions(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.attractions.historical, 'historical', 'historical attractions', sessionId, 'attractions'
    );
  },

  async handleArtificialAttractions(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.attractions.artificial, 'artificial', 'artificial attractions', sessionId, 'attractions'
    );
  },

  async handleAttractionsByCity(sessionId, cityName) {
    return ContentHandler.handleContentByCity(sessionId, cityName, 'attractions');
  },

  async handleAttractionDetails(sessionId, attractionName) {
    return ContentHandler.handleItemDetails(sessionId, attractionName, 'attraction');
  },

  // Amenity handlers
  async handleAllAmenities(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.amenities.all, 'all_amenities', 'amenities', sessionId, 'amenities'
    );
  },

  async handleRestaurants(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.amenities.restaurants, 'restaurants', 'restaurants', sessionId, 'amenities'
    );
  },

  async handleHotels(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.amenities.hotels, 'hotels', 'hotels', sessionId, 'amenities'
    );
  },

  async handleLodges(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.amenities.lodges, 'lodges', 'lodges', sessionId, 'amenities'
    );
  },

  async handleGuestHouses(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.amenities.guesthouses, 'guesthouses', 'guest houses', sessionId, 'amenities'
    );
  },

  async handleCamping(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.amenities.camping, 'camping', 'camping sites', sessionId, 'amenities'
    );
  },

  async handleCafes(sessionId) {
    return ContentHandler.handleGenericContent(
      API_ENDPOINTS.amenities.cafes, 'cafes', 'cafes', sessionId, 'amenities'
    );
  },

  async handleAmenitiesByCity(sessionId, cityName) {
    return ContentHandler.handleContentByCity(sessionId, cityName, 'amenities');
  },

  async handleAmenityDetails(sessionId, amenityName) {
    return ContentHandler.handleItemDetails(sessionId, amenityName, 'amenity');
  },

  // Shared handlers
  async handleShowMore(sessionId) {
    const sessionData = SessionManager.get(sessionId);
    
    if (!sessionData || !sessionData.remainingItems || sessionData.remainingItems.length === 0) {
      return {
        fulfillmentText: "I don't have any additional items to show right now."
      };
    }

    const { remainingItems, category, categoryDisplayName, cityName, contentType } = sessionData;
    
    SessionManager.delete(sessionId);

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
  },

  handleDecline(sessionId) {
    SessionManager.delete(sessionId);
    return {
      fulfillmentText: "No problem! I'm here whenever you need help discovering places in Draa-Tafilalet. Just ask me anytime!"
    };
  },

  async handleShowItemOnMap(sessionId) {
    try {
      const sessionData = SessionManager.get(sessionId);
      
      if (!sessionData) {
        return {
          fulfillmentText: "I don't have location information available. Please ask about a specific place first."
        };
      }

      const itemData = sessionData.attractionData || sessionData.amenityData;
      const itemType = sessionData.attractionData ? 'attraction' : 'amenity';
      
      if (!itemData) {
        return {
          fulfillmentText: "I don't have location information available. Please ask about a specific place first."
        };
      }

      const { latitude: lat, longitude: lng, name } = itemData;
      const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}&query_place_id=&query=${encodeURIComponent(name)}`;
      
      SessionManager.delete(sessionId);

      return {
        fulfillmentText: `Here you can find ${name} on the map: `,
        payload: {
          flutter: {
            type: 'map_location',
            data: {
              [itemType]: itemData,
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
  },

  handleMapDecline(sessionId) {
    SessionManager.delete(sessionId);
    return {
      fulfillmentText: "No problem! Is there anything else you'd like to know about this place or would you like to explore other locations?"
    };
  }
};

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
    // Intent to handler mapping
    const intentMap = {
      // Attraction intents
      'Ask_All_Attractions': () => IntentHandlers.handleAllAttractions(sessionId),
      'Ask_Natural_Attractions': () => IntentHandlers.handleNaturalAttractions(sessionId),
      'Ask_Cultural_Attractions': () => IntentHandlers.handleCulturalAttractions(sessionId),
      'Ask_Historical_Attractions': () => IntentHandlers.handleHistoricalAttractions(sessionId),
      'Ask_Artificial_Attractions': () => IntentHandlers.handleArtificialAttractions(sessionId),
      'Ask_Attractions_By_City': () => IntentHandlers.handleAttractionsByCity(
        sessionId, 
        parameters.city || parameters['geo-city'] || parameters.name
      ),
      'Ask_Attraction_Details': () => IntentHandlers.handleAttractionDetails(
        sessionId, 
        parameters['attraction-name'] || parameters.name
      ),

      // Amenity intents
      'Ask_All_Amenities': () => IntentHandlers.handleAllAmenities(sessionId),
      'Ask_Restaurants': () => IntentHandlers.handleRestaurants(sessionId),
      'Ask_Hotels': () => IntentHandlers.handleHotels(sessionId),
      'Ask_Lodges': () => IntentHandlers.handleLodges(sessionId),
      'Ask_GuestHouses': () => IntentHandlers.handleGuestHouses(sessionId),
      'Ask_Camping': () => IntentHandlers.handleCamping(sessionId),
      'Ask_Cafes': () => IntentHandlers.handleCafes(sessionId),
      'Ask_Amenities_By_City': () => IntentHandlers.handleAmenitiesByCity(
        sessionId, 
        parameters.city || parameters['geo-city'] || parameters.name
      ),
      'Ask_Amenity_Details': () => IntentHandlers.handleAmenityDetails(
        sessionId, 
        parameters['amenity-name'] || parameters.name
      ),

      // Shared intents
      'Pagination_ShowMore': () => IntentHandlers.handleShowMore(sessionId),
      'Pagination_Decline': () => IntentHandlers.handleDecline(sessionId),
      'Show_Attraction_On_Map': () => IntentHandlers.handleShowItemOnMap(sessionId),
      'Map_Request_Yes': () => IntentHandlers.handleShowItemOnMap(sessionId),
      'Map_Request_No': () => IntentHandlers.handleMapDecline(sessionId),

      // Default intent
      'Default Welcome Intent': () => ({
        fulfillmentText: "Welcome to Draa-Tafilalet Tourism Assistant! I can help you discover attractions, restaurants, hotels, lodges, guest houses, camping sites, cafes and more."
      })
    };

    const handler = intentMap[intentName];
    if (handler) {
      return await handler();
    } else {
      return {
        fulfillmentText: `I understand you're asking about "${intentName}", but I'm not sure how to help with that. Try asking about attractions, restaurants, hotels, or other services.`
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
// ERROR HANDLING MIDDLEWARE
// ============================

app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);
  res.status(500).json({
    fulfillmentText: "An unexpected error occurred."
  });
});

// ============================
// PERIODIC CLEANUP
// ============================

// Clean up expired sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [sessionId, data] of sessionStorage.entries()) {
    if (data.timestamp && (now - data.timestamp) > SESSION_TIMEOUT) {
      sessionStorage.delete(sessionId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned ${cleanedCount} expired sessions`);
  }
}, 30 * 60 * 1000);

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