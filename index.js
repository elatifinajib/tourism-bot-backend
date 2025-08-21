const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }

// 🆕 Fonction pour extraire le nom d'attraction des paramètres
function extractAttractionNameFromParameters(parameters) {
  if (parameters.attraction) return parameters.attraction;
  if (parameters.name) return parameters.name;
  if (parameters['attraction-name']) return parameters['attraction-name'];
  
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === 'string' && value.length > 2) {
      return value;
    }
  }
  return null;
}

// 🆕 Fonction pour tester plusieurs variantes du nom d'attraction
async function tryMultipleAttractionNameVariants(attractionName) {
  const variants = [
    attractionName, // tel quel
    attractionName.toLowerCase(), // tout en minuscules
    attractionName.charAt(0).toUpperCase() + attractionName.slice(1).toLowerCase(), // Première lettre majuscule
    attractionName.toUpperCase(), // tout en majuscules
  ];

  const uniqueVariants = [...new Set(variants)];
  console.log(`🔄 Trying attraction name variants: ${uniqueVariants.join(', ')}`);

  for (const variant of uniqueVariants) {
    try {
      console.log(`🌍 Trying attraction name variant: ${variant}`);
      
      const response = await axios.get(`${API_BASE_URL}/api/public/getLocationByName/${encodeURIComponent(variant)}`, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data && Object.keys(response.data).length > 0) {
        console.log(`✅ Success with variant: ${variant} - Found attraction details`);
        return {
          success: true,
          data: response.data,
          usedVariant: variant
        };
      }
    } catch (error) {
      console.log(`❌ Failed with variant: ${variant} - ${error.message}`);
      continue;
    }
  }

  return {
    success: false,
    data: null,
    usedVariant: null
  };
}

// 🆕 Handler pour attraction par nom
async function handleAttractionByName(sessionId, attractionName) {
  try {
    if (!attractionName) {
      return {
        fulfillmentText: "I'd be happy to show you details about a specific attraction! Could you please tell me the name of the attraction you're interested in? For example: 'Ksar', 'Hassan II Mosque', or any other attraction name."
      };
    }

    console.log(`🏛️ Fetching attraction details for: ${attractionName}`);
    
    const attractionResult = await tryMultipleAttractionNameVariants(attractionName);

    if (!attractionResult.success) {
      console.log(`❌ No results found for any variant of: ${attractionName}`);
      return {
        fulfillmentText: `I couldn't find any attraction named "${attractionName}". Please make sure you've spelled the attraction name correctly, or try asking about attractions in a specific city or category.`
      };
    }

    const attraction = attractionResult.data;
    console.log(`✅ Found attraction: ${attraction.name}`);

    // Vérifier que c'est bien une attraction (et pas une amenity)
    const isAttraction = attraction.hasOwnProperty('entryFre') && attraction.hasOwnProperty('guideToursAvailable');
    
    if (!isAttraction) {
      console.log(`⚠️ Found location but it's not an attraction: ${attraction.name}`);
      return {
        fulfillmentText: `I found a location named "${attractionName}", but it's not classified as a tourist attraction. Try asking about tourist attractions in a specific city or category.`
      };
    }

    return {
      fulfillmentText: `Here are the complete details about ${attraction.name}:`,
      
      payload: {
        flutter: {
          type: 'attraction_details',
          data: {
            attraction: attraction,
            attractionName: attraction.name
          },
          actions: [
            { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' },
            { type: 'share', label: 'Share', icon: 'share' }
          ]
        }
      }
    };

  } catch (error) {
    console.error(`❌ Error in handleAttractionByName for ${attractionName}:`, error);
    return {
      fulfillmentText: `I'm having trouble finding details about ${attractionName} right now. Please try again later or ask about attractions in a specific city.`
    };
  }

// 🆕 Fonction pour extraire le nom d'attraction des paramètres
function extractAttractionNameFromParameters(parameters) {
  if (parameters.attraction) return parameters.attraction;
  if (parameters.name) return parameters.name;
  if (parameters['attraction-name']) return parameters['attraction-name'];
  
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === 'string' && value.length > 2) {
      return value;
    }
  }
  return null;
}

// 🆕 Fonction pour tester plusieurs variantes du nom d'attraction (gestion de la casse)
async function tryMultipleAttractionNameVariants(attractionName) {
  const variants = [
    attractionName, // tel quel
    attractionName.toLowerCase(), // tout en minuscules
    attractionName.charAt(0).toUpperCase() + attractionName.slice(1).toLowerCase(), // Première lettre majuscule
    attractionName.toUpperCase(), // tout en majuscules
    attractionName.replace(/\s+/g, ' ').trim(), // Nettoie les espaces multiples
  ];

  // Supprimer les doublons
  const uniqueVariants = [...new Set(variants)];
  
  console.log(`🔄 Trying attraction name variants: ${uniqueVariants.join(', ')}`);

  for (const variant of uniqueVariants) {
    try {
      console.log(`🌍 Trying attraction name variant: ${variant}`);
      
      const response = await axios.get(`${API_BASE_URL}/api/public/getLocationByName/${encodeURIComponent(variant)}`, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data && Object.keys(response.data).length > 0) {
        console.log(`✅ Success with variant: ${variant} - Found attraction details`);
        return {
          success: true,
          data: response.data,
          usedVariant: variant
        };
      }
    } catch (error) {
      console.log(`❌ Failed with variant: ${variant} - ${error.message}`);
      continue;
    }
  }

  return {
    success: false,
    data: null,
    usedVariant: null
  };
}

// 🆕 Handler pour attraction par nom
async function handleAttractionByName(sessionId, attractionName) {
  try {
    if (!attractionName) {
      return {
        fulfillmentText: "I'd be happy to show you details about a specific attraction! Could you please tell me the name of the attraction you're interested in? For example: 'Ksar', 'Hassan II Mosque', or any other attraction name."
      };
    }

    console.log(`🏛️ Fetching attraction details for: ${attractionName}`);
    
    const attractionResult = await tryMultipleAttractionNameVariants(attractionName);

    console.log(`📊 Attraction search result:`, {
      success: attractionResult.success,
      usedVariant: attractionResult.usedVariant
    });

    if (!attractionResult.success) {
      console.log(`❌ No results found for any variant of: ${attractionName}`);
      return {
        fulfillmentText: `I couldn't find any attraction named "${attractionName}". Please make sure you've spelled the attraction name correctly, or try asking about attractions in a specific city or category.`
      };
    }

    const attraction = attractionResult.data;
    console.log(`✅ Found attraction: ${attraction.name}`);

    // Vérifier que c'est bien une attraction (et pas une amenity)
    const isAttraction = attraction.hasOwnProperty('entryFre') && attraction.hasOwnProperty('guideToursAvailable');
    
    if (!isAttraction) {
      console.log(`⚠️ Found location but it's not an attraction: ${attraction.name}`);
      return {
        fulfillmentText: `I found a location named "${attractionName}", but it's not classified as a tourist attraction. Try asking about tourist attractions in a specific city or category.`
      };
    }

    const formattedAttractionName = attraction.name;
    
    return {
      fulfillmentText: `Here are the complete details about ${formattedAttractionName}:`,
      
      payload: {
        flutter: {
          type: 'attraction_details',
          data: {
            attraction: attraction,
            attractionName: formattedAttractionName
          },
          actions: [
            { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' },
            { type: 'share', label: 'Share', icon: 'share' }
          ]
        }
      }
    };

  } catch (error) {
    console.error(`❌ Error in handleAttractionByName for ${attractionName}:`, error);
    console.error(`❌ Error stack:`, error.stack);
    return {
      fulfillmentText: `I'm having trouble finding details about ${attractionName} right now. Please try again later or ask about attractions in a specific city.`
    };
  }));

// API Base URL
const API_BASE_URL = 'https://touristeproject.onrender.com';

// Session storage pour gérer le flux de pagination
const sessionStorage = new Map();

// Health check
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Tourism Bot Backend is running!',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: '/webhook',
      health: '/',
      test: '/test'
    }
  });
});

// Test endpoint
app.get('/test', async (req, res) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/public/getAll/Attraction`, {
      timeout: 10000
    });
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

// Webhook principal pour Dialogflow
app.post('/webhook', async (req, res) => {
  try {
    console.log('🎯 Webhook called:', JSON.stringify(req.body, null, 2));

    const intentName = req.body.queryResult?.intent?.displayName;
    const queryText = req.body.queryResult?.queryText?.toLowerCase();
    const parameters = req.body.queryResult?.parameters || {};
    const sessionId = extractSessionId(req.body.session);

    console.log(`🔍 Intent detected: ${intentName}`);
    console.log(`💬 User message: ${queryText}`);
    console.log(`📊 Parameters: ${JSON.stringify(parameters)}`);
    console.log(`🆔 Session ID: ${sessionId}`);

    let response = {};

    // Vérifier d'abord s'il y a un état de pagination en cours
    const sessionData = getSessionData(sessionId);
    
    if (sessionData && sessionData.waitingForMoreResponse) {
      // L'utilisateur est dans un état "voir plus"
      if (isUserWantingMore(queryText)) {
        response = await handleShowMore(sessionId);
      } else if (isUserDeclining(queryText)) {
        response = handleDecline(sessionId);
      } else {
        // L'utilisateur dit autre chose, on traite la nouvelle demande
        response = await handleRegularIntent(intentName, sessionId, parameters);
      }
    } else {
      // Flux normal sans pagination en cours
      response = await handleRegularIntent(intentName, sessionId, parameters);
    }

    console.log('📤 Response sent:', JSON.stringify(response, null, 2));
    res.json(response);

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({
      fulfillmentText: "Sorry, I'm experiencing technical difficulties. Please try again in a moment."
    });
  }
});

// Fonctions utilitaires
function extractSessionId(sessionPath) {
  return sessionPath ? sessionPath.split('/').pop() : 'default-session';
}

function isUserWantingMore(queryText) {
  const positiveResponses = ['yes', 'oui', 'ok', 'okay', 'sure', 'please', 'show more', 'voir plus', 'more', 'continue', 'd\'accord', 'bien sûr'];
  return positiveResponses.some(response => queryText.includes(response));
}

function isUserDeclining(queryText) {
  const negativeResponses = ['no', 'non', 'nope', 'not now', 'maybe later', 'that\'s enough', 'pas maintenant', 'merci'];
  return negativeResponses.some(response => queryText.includes(response));
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

// Fonction pour gérer les intents réguliers
async function handleRegularIntent(intentName, sessionId, parameters = {}) {
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
      const cityName = parameters.city || parameters['geo-city'] || extractCityFromParameters(parameters);
      console.log(`🏙️ City extracted: ${cityName}`);
      return await handleAttractionsByCity(sessionId, cityName);
    
    case 'Ask_Attraction_By_Name':
      const attractionName = parameters.attraction || parameters.name || extractAttractionNameFromParameters(parameters);
      console.log(`🏛️ Attraction name extracted: ${attractionName}`);
      return await handleAttractionByName(sessionId, attractionName);
    
    case 'Ask_Attraction_By_Name':
      const attractionName = parameters.attraction || parameters.name || extractAttractionNameFromParameters(parameters);
      console.log(`🏛️ Attraction name extracted: ${attractionName}`);
      return await handleAttractionByName(sessionId, attractionName);
    
    case 'Default Welcome Intent':
      return {
        fulfillmentText: "Welcome to Draa-Tafilalet Tourism Assistant! I'm here to help you discover amazing attractions. You can ask me about all attractions, natural sites, cultural landmarks, historical places, artificial attractions, or attractions in a specific city."
      };
    
    default:
      return {
        fulfillmentText: "I can help you discover attractions in Draa-Tafilalet! Try asking about 'all attractions', 'natural attractions', 'cultural sites', 'historical places', 'artificial attractions', or attractions in a specific city like 'attractions in Errachidia'."
      };
  }
}

// 🆕 Fonction pour extraire le nom de ville des paramètres
function extractCityFromParameters(parameters) {
  if (parameters.city) return parameters.city;
  if (parameters['geo-city']) return parameters['geo-city'];
  if (parameters.location) return parameters.location;
  
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

// 🆕 Fonction pour tenter plusieurs variantes de la ville (gestion de la casse)
async function tryMultipleCityVariants(cityName) {
  const variants = [
    cityName, // tel quel (ex: sAFi)
    cityName.toLowerCase(), // tout en minuscules (ex: safi)
    cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase(), // Première lettre majuscule (ex: Safi)
    cityName.toUpperCase(), // tout en majuscules (ex: SAFI)
    // 🆕 Variantes supplémentaires pour les casses mixtes courantes
    cityName.toLowerCase().charAt(0).toUpperCase() + cityName.toLowerCase().slice(1), // Force première majuscule
    cityName.replace(/\s+/g, ''), // Supprime les espaces si il y en a
  ];

  // Supprimer les doublons
  const uniqueVariants = [...new Set(variants)];
  
  console.log(`🔄 Trying city variants: ${uniqueVariants.join(', ')}`);

  let allResults = []; // Pour regrouper tous les résultats
  let successfulVariants = []; // Pour tracker les variantes qui marchent

  for (const variant of uniqueVariants) {
    try {
      console.log(`🌍 Trying city variant: ${variant}`);
      
      const response = await axios.get(`${API_BASE_URL}/api/public/getLocationByCity/${encodeURIComponent(variant)}`, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data && response.data.length > 0) {
        console.log(`✅ Success with variant: ${variant} - Found ${response.data.length} locations`);
        
        // Ajouter les résultats à la liste (éviter les doublons par id_Location)
        const newResults = response.data.filter(newItem => 
          !allResults.some(existingItem => existingItem.id_Location === newItem.id_Location)
        );
        
        allResults = [...allResults, ...newResults];
        successfulVariants.push(variant);
        
        console.log(`📊 Total results so far: ${allResults.length}`);
      }
    } catch (error) {
      console.log(`❌ Failed with variant: ${variant} - ${error.message}`);
      continue; // Essayer la variante suivante
    }
  }

  if (allResults.length > 0) {
    return {
      success: true,
      data: allResults,
      usedVariants: successfulVariants, // Toutes les variantes qui ont marché
      totalFound: allResults.length
    };
  }

  return {
    success: false,
    data: null,
    usedVariants: [],
    totalFound: 0
  };
}

// Handler functions avec pagination
async function handleAllAttractions(sessionId) {
  try {
    console.log('🏛️ Fetching all attractions...');
    
    const response = await axios.get(`${API_BASE_URL}/api/public/getAll/Attraction`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    const allAttractions = response.data;
    console.log(`✅ ${allAttractions.length} attractions fetched`);

    if (!allAttractions || allAttractions.length === 0) {
      return {
        fulfillmentText: "I'm sorry, but I couldn't find any attractions at the moment. Please try again later."
      };
    }

    return handlePaginatedResponse(allAttractions, 'all', 'general', sessionId);

  } catch (error) {
    console.error('❌ Error fetching all attractions:', error.message);
    return {
      fulfillmentText: "I apologize, but I'm having trouble accessing the attractions database right now. Please try again in a few moments."
    };
  }
}

async function handleNaturalAttractions(sessionId) {
  try {
    console.log('🌿 Fetching natural attractions...');
    
    const response = await axios.get(`${API_BASE_URL}/api/public/NaturalAttractions`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

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
    
    const response = await axios.get(`${API_BASE_URL}/api/public/CulturalAttractions`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

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
    
    const response = await axios.get(`${API_BASE_URL}/api/public/HistoricalAttractions`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

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
    
    const response = await axios.get(`${API_BASE_URL}/api/public/ArtificialAttractions`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

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

// 🆕 Handler pour attractions par ville
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
      usedVariants: cityResult.usedVariants
    });

    if (!cityResult.success) {
      console.log(`❌ No results found for any variant of: ${cityName}`);
      return {
        fulfillmentText: `I couldn't find any information about "${cityName}". Please make sure you've spelled the city name correctly, or try asking about another city in Draa-Tafilalet like Errachidia, Midelt, Tinghir, or Zagora.`
      };
    }

    const allLocations = cityResult.data;
    const usedVariants = cityResult.usedVariants;
    
    console.log(`📍 ${allLocations.length} total locations fetched for city variants`);
    console.log(`🔍 Sample location structure:`, allLocations[0]);

    // Filtrer pour ne garder que les attractions (qui ont entryFre et guideToursAvailable)
    const attractions = allLocations.filter(location => {
      const hasEntryFre = location.hasOwnProperty('entryFre');
      const hasGuideToursAvailable = location.hasOwnProperty('guideToursAvailable');
      
      console.log(`🔍 Location "${location.name}": entryFre=${hasEntryFre}, guideToursAvailable=${hasGuideToursAvailable}`);
      
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
    console.error(`❌ Error stack:`, error.stack);
    return {
      fulfillmentText: `I'm having trouble finding attractions in ${cityName} right now. Please try again later or ask about attractions in another city.`
    };
  }
}

// Fonction principale de pagination (modifiée pour supporter les villes)
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

    // Message pour les villes
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
    
    // Sauvegarder les attractions restantes dans la session avec état d'attente
    saveSessionData(sessionId, {
      remainingAttractions,
      category,
      categoryDisplayName,
      waitingForMoreResponse: true,
      cityName: cityName
    });

    // Messages pour le premier affichage
    const messagesByCategory = {
      'all': `I found ${totalCount} amazing attractions in Draa-Tafilalet for you!\n\nHere are the first ${ITEMS_PER_PAGE} incredible places you can explore:`,
      'natural': `I found ${totalCount} beautiful natural attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} stunning landscapes you can discover:`,
      'cultural': `I found ${totalCount} fascinating cultural attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} amazing cultural sites:`,
      'historical': `I found ${totalCount} remarkable historical attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} incredible historical sites:`,
      'artificial': `I found ${totalCount} impressive artificial attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} amazing modern marvels:`
    };

    // Message pour les villes
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

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);
  res.status(500).json({
    fulfillmentText: "An unexpected error occurred."
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Tourism Bot Backend started on port ${PORT}`);
  console.log(`📱 Webhook URL: https://tourism-bot-backend-production.up.railway.app/webhook`);
  console.log(`🏛️ Tourism API: ${API_BASE_URL}`);
  console.log('✅ Ready to handle Dialogflow requests with pagination and city search!');
});

module.exports = app;