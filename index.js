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
    const queryText = req.body.queryResult?.queryText;
    const sessionId = req.body.session;

    console.log(`🔍 Intent detected: ${intentName}`);
    console.log(`💬 User message: ${queryText}`);

    let response = {};

    switch (intentName) {
      case 'Ask_All_Attractions':
        response = await handleAllAttractions();
        break;
      
      case 'Ask_Natural_Attractions':
        response = await handleNaturalAttractions();
        break;
      
      case 'Ask_Cultural_Attractions':
        response = await handleCulturalAttractions();
        break;
      
      case 'Ask_Historical_Attractions':
        response = await handleHistoricalAttractions();
        break;
      
      case 'Ask_Artificial_Attractions':
        response = await handleArtificialAttractions();
        break;
      
      case 'Default Welcome Intent':
        response = {
          fulfillmentText: "Welcome to Draa-Tafilalet Tourism Assistant! I'm here to help you discover amazing attractions. You can ask me about all attractions, natural sites, cultural landmarks, historical places, or artificial attractions."
        };
        break;
      
      default:
        response = {
          fulfillmentText: "I can help you discover attractions in Draa-Tafilalet! Try asking about 'all attractions', 'natural attractions', 'cultural sites', 'historical places', or 'artificial attractions'."
        };
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

// Handler functions with improved natural responses
async function handleAllAttractions() {
  try {
    console.log('🏛️ Fetching all attractions...');
    
    const response = await axios.get(`${API_BASE_URL}/api/public/getAll/Attraction`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    const attractions = response.data;
    console.log(`✅ ${attractions.length} attractions fetched`);

    if (!attractions || attractions.length === 0) {
      return {
        fulfillmentText: "I'm sorry, but I couldn't find any attractions at the moment. Please try again later."
      };
    }

    // Réponse naturelle unifiée avec description
    const naturalResponse = `I found ${attractions.length} amazing attractions in Draa-Tafilalet for you!\n\nHere are some incredible places you can explore:`;

    return {
      fulfillmentText: naturalResponse,
      
      payload: {
        flutter: {
          type: 'attractions_list',
          category: 'all',
          data: {
            attractions: attractions,
            count: attractions.length,
            // Suppression du title et subtitle pour éviter la duplication
          },
          actions: [
            { type: 'view_details', label: 'View Details', icon: 'info' },
            { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
          ]
        }
      }
    };

  } catch (error) {
    console.error('❌ Error fetching all attractions:', error.message);
    return {
      fulfillmentText: "I apologize, but I'm having trouble accessing the attractions database right now. Please try again in a few moments."
    };
  }
}

async function handleNaturalAttractions() {
  try {
    console.log('🌿 Fetching natural attractions...');
    
    const response = await axios.get(`${API_BASE_URL}/api/public/NaturalAttractions`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    const attractions = response.data;
    console.log(`✅ ${attractions.length} natural attractions fetched`);

    if (!attractions || attractions.length === 0) {
      return {
        fulfillmentText: "I couldn't find any natural attractions right now. Please try again later."
      };
    }

    const naturalResponse = `I found ${attractions.length} beautiful natural attractions in Draa-Tafilalet!\n\nHere are stunning landscapes and natural areas you can discover:`;

    return {
      fulfillmentText: naturalResponse,
      
      payload: {
        flutter: {
          type: 'attractions_list',
          category: 'natural',
          data: {
            attractions: attractions,
            count: attractions.length,
          },
          actions: [
            { type: 'view_details', label: 'View Details', icon: 'info' },
            { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
          ]
        }
      }
    };

  } catch (error) {
    console.error('❌ Error fetching natural attractions:', error.message);
    return {
      fulfillmentText: "I'm having trouble finding natural attractions at the moment. Please try again later."
    };
  }
}

async function handleCulturalAttractions() {
  try {
    console.log('🎭 Fetching cultural attractions...');
    
    const response = await axios.get(`${API_BASE_URL}/api/public/CulturalAttractions`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    const attractions = response.data;
    console.log(`✅ ${attractions.length} cultural attractions fetched`);

    if (!attractions || attractions.length === 0) {
      return {
        fulfillmentText: "No cultural attractions are currently available."
      };
    }

    const naturalResponse = `I found ${attractions.length} fascinating cultural attractions in Draa-Tafilalet!\n\nHere are amazing cultural sites that showcase our rich heritage and traditions:`;

    return {
      fulfillmentText: naturalResponse,
      
      payload: {
        flutter: {
          type: 'attractions_list',
          category: 'cultural',
          data: {
            attractions: attractions,
            count: attractions.length,
          },
          actions: [
            { type: 'view_details', label: 'View Details', icon: 'info' },
            { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
          ]
        }
      }
    };

  } catch (error) {
    console.error('❌ Error fetching cultural attractions:', error.message);
    return {
      fulfillmentText: "I'm currently unable to retrieve cultural attractions. Please try again shortly."
    };
  }
}

async function handleHistoricalAttractions() {
  try {
    console.log('🏛️ Fetching historical attractions...');
    
    const response = await axios.get(`${API_BASE_URL}/api/public/HistoricalAttractions`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    const attractions = response.data;
    console.log(`✅ ${attractions.length} historical attractions fetched`);

    if (!attractions || attractions.length === 0) {
      return {
        fulfillmentText: "No historical attractions are currently available."
      };
    }

    const naturalResponse = `I found ${attractions.length} remarkable historical attractions in Draa-Tafilalet!\n\nHere are incredible historical sites where you can explore centuries of fascinating history:`;

    return {
      fulfillmentText: naturalResponse,
      
      payload: {
        flutter: {
          type: 'attractions_list',
          category: 'historical',
          data: {
            attractions: attractions,
            count: attractions.length,
          },
          actions: [
            { type: 'view_details', label: 'View Details', icon: 'info' },
            { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
          ]
        }
      }
    };

  } catch (error) {
    console.error('❌ Error fetching historical attractions:', error.message);
    return {
      fulfillmentText: "I'm having difficulty accessing historical attractions right now. Please try again later."
    };
  }
}

async function handleArtificialAttractions() {
  try {
    console.log('🏗️ Fetching artificial attractions...');
    
    const response = await axios.get(`${API_BASE_URL}/api/public/ArtificialAttractions`, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    const attractions = response.data;
    console.log(`✅ ${attractions.length} artificial attractions fetched`);

    if (!attractions || attractions.length === 0) {
      return {
        fulfillmentText: "No artificial attractions are currently available."
      };
    }

    const naturalResponse = `I found ${attractions.length} impressive artificial attractions in Draa-Tafilalet!\n\nHere are amazing modern marvels and architectural wonders you can visit:`;

    return {
      fulfillmentText: naturalResponse,
      
      payload: {
        flutter: {
          type: 'attractions_list',
          category: 'artificial',
          data: {
            attractions: attractions,
            count: attractions.length,
          },
          actions: [
            { type: 'view_details', label: 'View_details', icon: 'info' },
            { type: 'get_directions', label: 'Get Directions', icon: 'directions' },
            { type: 'add_favorite', label: 'Add to Favorites', icon: 'favorite_border' }
          ]
        }
      }
    };

  } catch (error) {
    console.error('❌ Error fetching artificial attractions:', error.message);
    return {
      fulfillmentText: "I'm currently unable to access artificial attractions. Please try again shortly."
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
  console.log('✅ Ready to handle Dialogflow requests!');
});

module.exports = app;