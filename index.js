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

// Nouvelle route pour envoyer le message "voir plus" après l'affichage du carousel
app.post('/send-more-question', async (req, res) => {
  try {
    const { sessionId, remainingCount, category } = req.body;
    
    console.log(`📤 Sending more question for session: ${sessionId}`);
    
    const categoryMessages = {
      'all': `Would you like to see the remaining ${remainingCount} attractions?`,
      'natural': `Want to explore ${remainingCount} more natural wonders?`,
      'cultural': `Interested in seeing ${remainingCount} more cultural treasures?`,
      'historical': `Want to discover ${remainingCount} more historical gems?`,
      'artificial': `Ready to see ${remainingCount} more architectural wonders?`
    };

    const response = {
      fulfillmentText: categoryMessages[category] || categoryMessages['all'],
      
      payload: {
        flutter: {
          type: 'yes_no_buttons',
          data: {
            message: categoryMessages[category] || categoryMessages['all'],
            remainingCount: remainingCount,
            category: category
          },
          actions: [
            { type: 'show_more', label: 'Yes, show more', icon: 'visibility' },
            { type: 'no_thanks', label: 'No, thanks', icon: 'close' }
          ]
        }
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error sending more question:', error);
    res.status(500).json({
      fulfillmentText: "Sorry, I'm experiencing technical difficulties."
    });
  }
});
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
    const sessionId = extractSessionId(req.body.session);

    console.log(`🔍 Intent detected: ${intentName}`);
    console.log(`💬 User message: ${queryText}`);
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
        // L'utilisateur dit autre chose, on garde l'état mais on traite la nouvelle demande
        response = await handleRegularIntent(intentName, sessionId);
      }
    } else {
      // Flux normal sans pagination en cours
      response = await handleRegularIntent(intentName, sessionId);
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

  const naturalResponse = `Perfect! Here are all the remaining ${categoryDisplayName} attractions in Draa-Tafilalet:\n\nEnjoy exploring these additional gems!`;

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
async function handleRegularIntent(intentName, sessionId) {
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
    
    case 'Default Welcome Intent':
      return {
        fulfillmentText: "Welcome to Draa-Tafilalet Tourism Assistant! I'm here to help you discover amazing attractions. You can ask me about all attractions, natural sites, cultural landmarks, historical places, or artificial attractions."
      };
    
    default:
      return {
        fulfillmentText: "I can help you discover attractions in Draa-Tafilalet! Try asking about 'all attractions', 'natural attractions', 'cultural sites', 'historical places', or 'artificial attractions'."
      };
  }
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

// Fonction principale de pagination
function handlePaginatedResponse(allAttractions, category, categoryDisplayName, sessionId) {
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

    return {
      fulfillmentText: messagesByCategory[category] || messagesByCategory['all'],
      
      payload: {
        flutter: {
          type: 'attractions_list',
          category: category,
          data: {
            attractions: allAttractions,
            count: totalCount,
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
      waitingForMoreResponse: true
    });

    // Messages simplifiés pour le premier affichage (sans question)
    const messagesByCategory = {
      'all': `I found ${totalCount} amazing attractions in Draa-Tafilalet for you!\n\nHere are the first ${ITEMS_PER_PAGE} incredible places you can explore:`,
      'natural': `I found ${totalCount} beautiful natural attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} stunning landscapes you can discover:`,
      'cultural': `I found ${totalCount} fascinating cultural attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} amazing cultural sites:`,
      'historical': `I found ${totalCount} remarkable historical attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} incredible historical sites:`,
      'artificial': `I found ${totalCount} impressive artificial attractions in Draa-Tafilalet!\n\nHere are the first ${ITEMS_PER_PAGE} amazing modern marvels:`
    };

    return {
      fulfillmentText: messagesByCategory[category] || messagesByCategory['all'],
      
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
            // Signal pour Flutter d'envoyer automatiquement le message "voir plus"
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
  console.log('✅ Ready to handle Dialogflow requests with pagination!');
});

module.exports = app;