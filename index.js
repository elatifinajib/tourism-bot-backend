const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const API_BASE_URL = 'https://touristeproject.onrender.com';
const PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID || 'tourisme-bot-sxin';
const ITEMS_PER_PAGE = 10;
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage
const sessionStorage = new Map();
let googleAuth = null;
let cachedToken = null;
let tokenExpiry = null;

// ============================
// GOOGLE AUTHENTICATION
// ============================

async function initializeGoogleAuth() {
  try {
    console.log('🔑 Initializing Google Auth...');
    
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    if (credentialsJson || credentialsFile) {
      const { GoogleAuth } = require('google-auth-library');
      googleAuth = new GoogleAuth({
        ...(credentialsJson ? { credentials: JSON.parse(credentialsJson) } : { keyFile: credentialsFile }),
        scopes: ['https://www.googleapis.com/auth/dialogflow'],
      });
      console.log('✅ Google Auth initialized');
    } else {
      console.warn('⚠️ No Google credentials configured');
    }
  } catch (error) {
    console.error('❌ Error initializing Google Auth:', error);
  }
}

async function getGoogleAccessToken() {
  if (!googleAuth) throw new Error('Google Auth not initialized');

  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  const client = await googleAuth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (tokenResponse.token) {
    cachedToken = tokenResponse.token;
    tokenExpiry = tokenResponse.expiry_date;
    return tokenResponse.token;
  }
  
  throw new Error('Failed to obtain access token');
}

// ============================
// UTILITIES
// ============================

class ApiService {
  static async makeCall(url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await axios.get(url, {
          timeout: 30000,
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'Tourism-Bot/1.0'
          }
        });
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
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

    let allResults = [];
    for (const variant of [...new Set(variants)]) {
      try {
        const response = await this.makeCall(`${API_BASE_URL}/api/public/getLocationByCity/${encodeURIComponent(variant)}`);
        if (response.data?.length > 0) {
          const newResults = response.data.filter(newItem => 
            !allResults.some(existingItem => existingItem.id_Location === newItem.id_Location)
          );
          allResults = [...allResults, ...newResults];
        }
      } catch (error) {
        continue;
      }
    }

    return {
      success: allResults.length > 0,
      data: allResults.length > 0 ? allResults : null,
      totalFound: allResults.length
    };
  }

  static async tryMultipleCityVariantsForActivities(cityName) {
    const variants = [
      cityName,
      cityName.toLowerCase(),
      cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase(),
      cityName.toUpperCase(),
    ];

    let allResults = [];
    for (const variant of [...new Set(variants)]) {
      try {
        const response = await this.makeCall(`${API_BASE_URL}/api/public/getAll/Activities`);
        if (response.data?.length > 0) {
          const filteredResults = response.data.filter(activity => 
            activity.cityOfTheActivity?.toLowerCase().includes(variant.toLowerCase())
          );
          const newResults = filteredResults.filter(newItem => 
            !allResults.some(existingItem => existingItem.id_Activity === newItem.id_Activity)
          );
          allResults = [...allResults, ...newResults];
        }
      } catch (error) {
        continue;
      }
    }

    return {
      success: allResults.length > 0,
      data: allResults.length > 0 ? allResults : null,
      totalFound: allResults.length
    };
  }

  static async getActivityByName(activityName) {
    try {
      const response = await this.makeCall(`${API_BASE_URL}/api/public/getAll/Activities`);
      if (response.data?.length > 0) {
        const activity = response.data.find(act => 
          act.name?.toLowerCase().includes(activityName.toLowerCase()) ||
          activityName.toLowerCase().includes(act.name?.toLowerCase())
        );
        return activity ? { success: true, data: activity } : { success: false, data: null };
      }
      return { success: false, data: null };
    } catch (error) {
      return { success: false, data: null };
    }
  }
}

class SessionManager {
  static save(sessionId, data) {
    sessionStorage.set(sessionId, { ...data, timestamp: Date.now() });
    console.log(`💾 Session data saved for ${sessionId}`);
  }

  static get(sessionId) {
    const data = sessionStorage.get(sessionId);
    if (data && Date.now() - data.timestamp > SESSION_TIMEOUT) {
      sessionStorage.delete(sessionId);
      return null;
    }
    return data;
  }

  static delete(sessionId) {
    sessionStorage.delete(sessionId);
  }
}

class TypeDetector {
  static isAttraction(item) {
    return item.hasOwnProperty('entryFre') && item.hasOwnProperty('guideToursAvailable');
  }

  static isAmenity(item) {
    return item.hasOwnProperty('price') && item.hasOwnProperty('openingHours') && item.hasOwnProperty('available');
  }

  static isActivity(item) {
    return item.hasOwnProperty('id_Activity') && item.hasOwnProperty('cityOfTheActivity') && item.hasOwnProperty('duration');
  }

  static determineAttractionType(data) {
    if (data.hasOwnProperty('protectedArea')) return 'natural';
    if (data.hasOwnProperty('style') && data.hasOwnProperty('yearBuild')) {
      return data.hasOwnProperty('historicalPeriod') || data.hasOwnProperty('dynastyName') ? 'historical' : 'cultural';
    }
    if (data.hasOwnProperty('yearBuild')) return 'artificial';
    if (data.hasOwnProperty('style')) return 'historical';

    const text = `${data.name || ''} ${data.description || ''}`.toLowerCase();
    const patterns = {
      natural: ['gorge', 'oasis', 'desert', 'natural', 'nature'],
      cultural: ['kasbah', 'mosque', 'museum', 'cultural', 'heritage'],
      historical: ['palace', 'fortress', 'ruins', 'historical', 'ancient']
    };

    for (const [type, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => text.includes(keyword))) return type;
    }
    return 'artificial';
  }

  static determineAmenityType(data) {
    const typeMap = [
      { type: 'restaurant', props: ['menu', 'typeCuisine'] },
      { type: 'hotel', props: ['numberStars', 'numberOfRooms', 'hasSwimmingPool'] },
      { type: 'lodge', props: ['viewPanoramic', 'closeNature'] },
      { type: 'guesthouse', props: ['numberRooms', 'breakfastIncluded'] },
      { type: 'camping', props: ['capacity', 'hasWaterSupply', 'electricityAvailability'] },
      { type: 'cafe', props: ['wifiAvailable', 'menu'] }
    ];

    for (const { type, props } of typeMap) {
      if (props.some(prop => data.hasOwnProperty(prop))) return type;
    }

    const text = `${data.name || ''} ${data.description || ''}`.toLowerCase();
    const keywords = {
      restaurant: ['restaurant', 'food'], hotel: ['hotel'], lodge: ['lodge'],
      guesthouse: ['guest', 'house'], camping: ['camping', 'camp'], cafe: ['cafe', 'coffee']
    };

    for (const [type, words] of Object.entries(keywords)) {
      if (words.some(word => text.includes(word))) return type;
    }
    return 'amenity';
  }

  static determineActivityType(data) {
    if (data.hasOwnProperty('typeSport')) return 'sportive';
    if (data.hasOwnProperty('terrainType') && data.hasOwnProperty('ageRestriction')) return 'adventure';
    if (data.hasOwnProperty('traditionAssociated')) return 'cultural';
    if (data.hasOwnProperty('craftType')) return 'traditional';
    
    const text = `${data.name || ''} ${data.description || ''}`.toLowerCase();
    const patterns = {
      adventure: ['desert', 'climbing', 'hiking', 'adventure', 'expedition'],
      sportive: ['sport', 'climbing', 'football', 'tennis', 'swimming'],
      cultural: ['cultural', 'festival', 'tradition', 'heritage', 'ceremony'],
      traditional: ['craft', 'traditional', 'pottery', 'weaving', 'handicraft']
    };

    for (const [type, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => text.includes(keyword))) return type;
    }
    return 'general';
  }
}

// ============================
// API ENDPOINTS CONFIGURATION (AVEC ACTIVITÉS)
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
  },
  activities: {
    all: '/api/public/getAll/Activities',
    adventure: '/api/public/Activity/Adventure',
    sportive: '/api/public/Activity/Sportive',
    cultural: '/api/public/Activity/Cultural',
    traditional: '/api/public/Activity/Traditional'
  }
};

// ============================
// CONTENT HANDLERS (AVEC ACTIVITÉS)
// ============================

class ContentHandler {
  static async handleGenericContent(endpoint, category, sessionId, contentType = 'attractions') {
    try {
      const response = await ApiService.makeCall(`${API_BASE_URL}${endpoint}`);
      if (!response.data?.length) {
        return { fulfillmentText: `No ${contentType} found.` };
      }
      return this.createPaginationResponse(response.data, category, sessionId, null, contentType);
    } catch (error) {
      console.error(`❌ Error fetching ${contentType}:`, error);
      return { fulfillmentText: `Having trouble finding ${contentType}.` };
    }
  }

  static async handleContentByCity(sessionId, cityName, contentType) {
    if (!cityName) {
      return { fulfillmentText: `Please tell me which city you're interested in for ${contentType}.` };
    }

    try {
      let items;
      if (contentType === 'activities') {
        const cityResult = await ApiService.tryMultipleCityVariantsForActivities(cityName);
        if (!cityResult.success) {
          return { fulfillmentText: `I couldn't find ${contentType} information about "${cityName}". Try another city.` };
        }
        items = cityResult.data;
      } else {
        const cityResult = await ApiService.tryMultipleCityVariants(cityName);
        if (!cityResult.success) {
          return { fulfillmentText: `I couldn't find ${contentType} information about "${cityName}". Try another city.` };
        }

        if (contentType === 'attractions') {
          items = cityResult.data.filter(location => TypeDetector.isAttraction(location));
        } else if (contentType === 'amenities') {
          items = cityResult.data.filter(location => TypeDetector.isAmenity(location));
        }
      }

      if (!items?.length) {
        return { fulfillmentText: `No ${contentType} found in ${cityName}.` };
      }

      const formattedCityName = cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase();
      return this.createPaginationResponse(items, `city_${contentType}_${cityName.toLowerCase()}`, sessionId, formattedCityName, contentType);
    } catch (error) {
      console.error(`❌ Error finding ${contentType} in ${cityName}:`, error);
      return { fulfillmentText: `Having trouble finding ${contentType} in ${cityName}.` };
    }
  }

  static async handleItemDetails(sessionId, itemName, itemType) {
    if (!itemName) {
      return { fulfillmentText: `Please tell me which ${itemType} you'd like to know more about.` };
    }

    try {
      let itemData = null;
      let isCorrectType = false;
      let category = '';

      if (itemType === 'activity') {
        const activityResult = await ApiService.getActivityByName(itemName);
        if (!activityResult.success) {
          return { fulfillmentText: `I couldn't find detailed information about "${itemName}". Please check the spelling.` };
        }
        itemData = activityResult.data;
        isCorrectType = TypeDetector.isActivity(itemData);
        category = TypeDetector.determineActivityType(itemData);
      } else {
        const response = await ApiService.makeCall(`${API_BASE_URL}/api/public/getLocationByName/${encodeURIComponent(itemName)}`);
        
        if (!response.data?.length) {
          return { fulfillmentText: `I couldn't find detailed information about "${itemName}". Please check the spelling.` };
        }

        itemData = response.data[0];

        if (itemType === 'attraction') {
          isCorrectType = TypeDetector.isAttraction(itemData);
          category = TypeDetector.determineAttractionType(itemData);
        } else if (itemType === 'amenity') {
          isCorrectType = TypeDetector.isAmenity(itemData);
          category = TypeDetector.determineAmenityType(itemData);
        }
      }
      
      if (!isCorrectType) {
        return { fulfillmentText: `"${itemName}" doesn't appear to be an ${itemType}.` };
      }

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
      return { fulfillmentText: `Sorry, I'm having trouble retrieving details about "${itemName}".` };
    }
  }

  static createPaginationResponse(allItems, category, sessionId, cityName = null, contentType = 'attractions') {
    const totalCount = allItems.length;
    
    const getDisplayMessage = (count, isFirst = false) => {
      const prefix = isFirst ? `I found ${count}` : `Here are all the remaining`;
      if (cityName) {
        return `${prefix} ${contentType} in ${cityName}!`;
      }
      return `${prefix} ${contentType}!`;
    };
    
    const getActions = () => [
      { type: 'view_details', label: 'View Details', icon: 'info' },
      { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
      { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
    ];
    
    if (totalCount <= ITEMS_PER_PAGE) {
      return {
        fulfillmentText: getDisplayMessage(totalCount, true),
        payload: {
          flutter: {
            type: contentType === 'attractions' ? 'attractions_list' : contentType === 'amenities' ? 'amenities_list' : 'activities_list',
            category: category,
            data: { [contentType]: allItems, count: totalCount, cityName: cityName },
            actions: getActions()
          }
        }
      };
    }

    const firstPageItems = allItems.slice(0, ITEMS_PER_PAGE);
    const remainingItems = allItems.slice(ITEMS_PER_PAGE);
    
    SessionManager.save(sessionId, {
      remainingItems,
      category,
      cityName: cityName,
      contentType: contentType,
      waitingForMoreResponse: true
    });

    return {
      fulfillmentText: getDisplayMessage(totalCount, true).replace('!', `. Here are the first ${ITEMS_PER_PAGE}:`),
      payload: {
        flutter: {
          type: contentType === 'attractions' ? 'attractions_list_with_more' : contentType === 'amenities' ? 'amenities_list_with_more' : 'activities_list_with_more',
          category: category,
          data: {
            [contentType]: firstPageItems,
            count: firstPageItems.length,
            hasMore: true,
            totalCount: totalCount,
            remainingCount: remainingItems.length,
            cityName: cityName,
            sendMoreMessage: true
          },
          actions: getActions()
        }
      }
    };
  }
}

// ============================
// INTENT HANDLERS (AVEC ACTIVITÉS)
// ============================

const IntentHandlers = {
  // Attraction handlers
  handleAllAttractions: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.attractions.all, 'all', sessionId, 'attractions'),
  handleNaturalAttractions: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.attractions.natural, 'natural', sessionId, 'attractions'),
  handleCulturalAttractions: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.attractions.cultural, 'cultural', sessionId, 'attractions'),
  handleHistoricalAttractions: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.attractions.historical, 'historical', sessionId, 'attractions'),
  handleArtificialAttractions: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.attractions.artificial, 'artificial', sessionId, 'attractions'),
  handleAttractionsByCity: (sessionId, cityName) => ContentHandler.handleContentByCity(sessionId, cityName, 'attractions'),
  handleAttractionDetails: (sessionId, attractionName) => ContentHandler.handleItemDetails(sessionId, attractionName, 'attraction'),

  // Amenity handlers
  handleAllAmenities: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.amenities.all, 'all_amenities', sessionId, 'amenities'),
  handleRestaurants: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.amenities.restaurants, 'restaurants', sessionId, 'amenities'),
  handleHotels: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.amenities.hotels, 'hotels', sessionId, 'amenities'),
  handleLodges: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.amenities.lodges, 'lodges', sessionId, 'amenities'),
  handleGuestHouses: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.amenities.guesthouses, 'guesthouses', sessionId, 'amenities'),
  handleCamping: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.amenities.camping, 'camping', sessionId, 'amenities'),
  handleCafes: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.amenities.cafes, 'cafes', sessionId, 'amenities'),
  handleAmenitiesByCity: (sessionId, cityName) => ContentHandler.handleContentByCity(sessionId, cityName, 'amenities'),
  handleAmenityDetails: (sessionId, amenityName) => ContentHandler.handleItemDetails(sessionId, amenityName, 'amenity'),

  // Activity handlers
  handleAllActivities: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.activities.all, 'all_activities', sessionId, 'activities'),
  handleAdventureActivities: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.activities.adventure, 'adventure', sessionId, 'activities'),
  handleSportiveActivities: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.activities.sportive, 'sportive', sessionId, 'activities'),
  handleCulturalActivities: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.activities.cultural, 'cultural', sessionId, 'activities'),
  handleTraditionalActivities: (sessionId) => ContentHandler.handleGenericContent(API_ENDPOINTS.activities.traditional, 'traditional', sessionId, 'activities'),
  handleActivitiesByCity: (sessionId, cityName) => ContentHandler.handleContentByCity(sessionId, cityName, 'activities'),
  handleActivityDetails: (sessionId, activityName) => ContentHandler.handleItemDetails(sessionId, activityName, 'activity'),

  // Shared handlers
  async handleShowMore(sessionId) {
    const sessionData = SessionManager.get(sessionId);
    
    if (!sessionData?.remainingItems?.length) {
      return { fulfillmentText: "I don't have any additional items to show right now." };
    }

    const { remainingItems, category, cityName, contentType } = sessionData;
    SessionManager.delete(sessionId);

    let naturalResponse;
    if (cityName) {
      naturalResponse = `Perfect! Here are all the remaining ${contentType} in ${cityName}:`;
    } else {
      naturalResponse = `Perfect! Here are all the remaining ${contentType}:`;
    }

    return {
      fulfillmentText: naturalResponse,
      payload: {
        flutter: {
          type: contentType === 'attractions' ? 'attractions_list' : contentType === 'amenities' ? 'amenities_list' : 'activities_list',
          category: category,
          data: { [contentType]: remainingItems, count: remainingItems.length, cityName: cityName },
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
    return { fulfillmentText: "No problem! I'm here whenever you need help discovering places in Draa-Tafilalet. Just ask me anytime!" };
  },

  async handleShowItemOnMap(sessionId) {
    try {
      const sessionData = SessionManager.get(sessionId);
      
      if (!sessionData) {
        return { fulfillmentText: "I don't have location information available. Please ask about a specific place first." };
      }

      const itemData = sessionData.attractionData || sessionData.amenityData || sessionData.activityData;
      let itemType = sessionData.attractionData ? 'attraction' : sessionData.amenityData ? 'amenity' : 'activity';
      
      if (!itemData) {
        return { fulfillmentText: "I don't have location information available. Please ask about a specific place first." };
      }

      let lat, lng, name;
      if (itemType === 'activity') {
        lat = itemData.latitude || 0;
        lng = itemData.longitude || 0;
        name = itemData.name;
        
        if (lat === 0 && lng === 0) {
          return { fulfillmentText: `${name} doesn't have exact coordinates, but it's located in ${itemData.cityOfTheActivity}.` };
        }
      } else {
        lat = itemData.latitude;
        lng = itemData.longitude;
        name = itemData.name;
      }

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
      return { fulfillmentText: "Sorry, I couldn't retrieve the location information right now." };
    }
  },

  handleMapDecline(sessionId) {
    SessionManager.delete(sessionId);
    return { fulfillmentText: "No problem! Is there anything else you'd like to know about this place or would you like to explore other locations?" };
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
          text: { text: message, languageCode: 'en-US' }
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
      return res.status(500).json({ fulfillmentText: "Dialogflow service unavailable" });
    }
    
  } catch (error) {
    console.error('❌ Proxy error:', error);
    res.status(500).json({ fulfillmentText: "Sorry, I'm experiencing technical difficulties." });
  }
});

// ============================
// DIALOGFLOW RESPONSE PROCESSING (AVEC ACTIVITÉS)
// ============================

async function processDialogflowResponse(queryResult, sessionId) {
  const intentName = queryResult.intent.displayName;
  const parameters = queryResult.parameters || {};
  
  console.log(`🎯 Processing intent: ${intentName}`);
  console.log(`📊 All parameters:`, JSON.stringify(parameters, null, 2));
  
  try {
    const intentMap = {
      // Attraction intents
      'Ask_All_Attractions': () => IntentHandlers.handleAllAttractions(sessionId),
      'Ask_Natural_Attractions': () => IntentHandlers.handleNaturalAttractions(sessionId),
      'Ask_Cultural_Attractions': () => IntentHandlers.handleCulturalAttractions(sessionId),
      'Ask_Historical_Attractions': () => IntentHandlers.handleHistoricalAttractions(sessionId),
      'Ask_Artificial_Attractions': () => IntentHandlers.handleArtificialAttractions(sessionId),
      'Ask_Attractions_By_City': () => IntentHandlers.handleAttractionsByCity(sessionId, parameters.city_names || parameters.city || parameters['geo-city'] || parameters.name),
      'Ask_Attraction_Details': () => IntentHandlers.handleAttractionDetails(sessionId, parameters['attraction-name'] || parameters.name),

      // Amenity intents
      'Ask_All_Amenities': () => IntentHandlers.handleAllAmenities(sessionId),
      'Ask_Restaurants': () => IntentHandlers.handleRestaurants(sessionId),
      'Ask_Hotels': () => IntentHandlers.handleHotels(sessionId),
      'Ask_Lodges': () => IntentHandlers.handleLodges(sessionId),
      'Ask_GuestHouses': () => IntentHandlers.handleGuestHouses(sessionId),
      'Ask_Camping': () => IntentHandlers.handleCamping(sessionId),
      'Ask_Cafes': () => IntentHandlers.handleCafes(sessionId),
      'Ask_Amenities_By_City': () => IntentHandlers.handleAmenitiesByCity(sessionId, parameters.city_names || parameters.city || parameters['geo-city'] || parameters.name),
      'Ask_Amenity_Details': () => IntentHandlers.handleAmenityDetails(sessionId, parameters['amenity-name'] || parameters.name),

      // Activity intents
      'Ask_All_Activities': () => IntentHandlers.handleAllActivities(sessionId),
      'Ask_Adventure_Activities': () => IntentHandlers.handleAdventureActivities(sessionId),
      'Ask_Sportive_Activities': () => IntentHandlers.handleSportiveActivities(sessionId),
      'Ask_Cultural_Activities': () => IntentHandlers.handleCulturalActivities(sessionId),
      'Ask_Traditional_Activities': () => IntentHandlers.handleTraditionalActivities(sessionId),
      'Ask_Activities_By_City': () => IntentHandlers.handleActivitiesByCity(sessionId, parameters.city_names || parameters.city || parameters['geo-city'] || parameters.name),
      'Ask_Activity_Details': () => IntentHandlers.handleActivityDetails(sessionId, parameters['activity-name'] || parameters.name),

      // Shared intents
      'Pagination_ShowMore': () => IntentHandlers.handleShowMore(sessionId),
      'Pagination_Decline': () => IntentHandlers.handleDecline(sessionId),
      'Show_Attraction_On_Map': () => IntentHandlers.handleShowItemOnMap(sessionId),
      'Map_Request_Yes': () => IntentHandlers.handleShowItemOnMap(sessionId),
      'Map_Request_No': () => IntentHandlers.handleMapDecline(sessionId),
      'Default Welcome Intent': () => ({
        fulfillmentText: "Welcome to Draa-Tafilalet Tourism Assistant! I can help you discover attractions, restaurants, hotels, lodges, guest houses, camping sites, cafes, and activities."
      })
    };

    const handler = intentMap[intentName];
    return handler ? await handler() : {
      fulfillmentText: `I understand you're asking about "${intentName}", but I'm not sure how to help with that. Try asking about attractions, restaurants, hotels, activities, or other services.`
    };
  } catch (error) {
    console.error(`❌ Error processing intent ${intentName}:`, error);
    return { fulfillmentText: "Sorry, there was an error processing your request." };
  }
}

// ============================
// ERROR HANDLING & CLEANUP
// ============================

app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);
  res.status(500).json({ fulfillmentText: "An unexpected error occurred." });
});

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