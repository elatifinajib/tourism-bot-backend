// Enhanced Tourism Chatbot Backend - Complete Implementation
// =============================================================

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Enable CORS for Flutter app
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// ---------------------- API Configuration ----------------------
const BASE_URL = 'https://touristeproject.onrender.com/api/public';
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// ---------------------- Utility Functions ----------------------

// Normalize names for case-insensitive search
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

// Filter attractions from mixed data (attractions have entryFre and guideToursAvailable)
function filterAttractions(data) {
  if (!Array.isArray(data)) return [];
  return data.filter(item => 
    item.hasOwnProperty('entryFre') && item.hasOwnProperty('guideToursAvailable')
  );
}

// Truncate description for better readability
function truncateDescription(description, maxLength = 120) {
  if (!description) return 'Discover this amazing attraction!';
  if (description.length <= maxLength) return description;
  return description.substring(0, maxLength).trim() + '...';
}

// Format price display
function formatPrice(price) {
  if (!price || price === 0) return '🆓 Free entry';
  return `💰 ${price} MAD`;
}

// ---------------------- Response Formatters ----------------------
const formatters = {
  // All attractions formatter
  all: (item) => {
    const city = item.cityName ? ` (${item.cityName})` : '';
    const price = formatPrice(item.entryFre);
    const guide = item.guideToursAvailable ? '👨‍🏫 Guide available' : '';
    
    return `🌟 **${item.name}**${city}
📝 ${truncateDescription(item.description)}
${price}${guide ? ' • ' + guide : ''}`;
  },

  // Natural attractions formatter
  natural: (item) => {
    const city = item.cityName ? ` (${item.cityName})` : '';
    const price = formatPrice(item.entryFre);
    const protected = item.protectedArea ? '🛡️ Protected area' : '';
    
    return `🌿 **${item.name}**${city}
🏞️ ${truncateDescription(item.description)}
${price}${protected ? ' • ' + protected : ''}`;
  },

  // Historical attractions formatter
  historical: (item) => {
    const city = item.cityName ? ` (${item.cityName})` : '';
    const price = formatPrice(item.entryFre);
    const style = item.style ? `🏛️ Style: ${item.style}` : '';
    
    return `🏰 **${item.name}**${city}
⏳ ${truncateDescription(item.description)}
${price}${style ? ' • ' + style : ''}`;
  },

  // Cultural attractions formatter
  cultural: (item) => {
    const city = item.cityName ? ` (${item.cityName})` : '';
    const price = formatPrice(item.entryFre);
    const year = item.yearBuild ? `📅 Built: ${item.yearBuild}` : '';
    const style = item.style ? `🎨 Style: ${item.style}` : '';
    
    return `🎭 **${item.name}**${city}
🎨 ${truncateDescription(item.description)}
${price}${year ? ' • ' + year : ''}${style && year ? ' • ' + style : style ? ' • ' + style : ''}`;
  },

  // Artificial attractions formatter
  artificial: (item) => {
    const city = item.cityName ? ` (${item.cityName})` : '';
    const price = formatPrice(item.entryFre);
    const year = item.yearBuild ? `📅 Built: ${item.yearBuild}` : '';
    
    return `🏗️ **${item.name}**${city}
🏢 ${truncateDescription(item.description)}
${price}${year ? ' • ' + year : ''}`;
  },

  // Detailed formatter for single attraction
  detailed: (item) => {
    const city = item.cityName ? ` (${item.cityName})` : '';
    const country = item.countryName ? `, ${item.countryName}` : '';
    const price = formatPrice(item.entryFre);
    const guide = item.guideToursAvailable ? '👨‍🏫 Guided tours available' : '🚶‍♂️ Self-guided visit';
    
    // Special attributes based on type
    let specialInfo = '';
    if (item.protectedArea !== undefined) {
      specialInfo += item.protectedArea ? '\n🛡️ This is a protected natural area' : '';
    }
    if (item.style) {
      specialInfo += `\n🎨 Architectural style: ${item.style}`;
    }
    if (item.yearBuild) {
      specialInfo += `\n📅 Year built: ${item.yearBuild}`;
    }
    
    return `✨ **${item.name}**${city}${country}

📖 **Description:**
${item.description || 'A wonderful attraction waiting to be discovered!'}

💵 **Pricing:** ${price}
🎯 **Tours:** ${guide}
📍 **Coordinates:** ${item.latitude}, ${item.longitude}${specialInfo}

Would you like to know about other attractions in the area?`;
  }
};

// ---------------------- Intent Configuration ----------------------
const intentConfig = {
  // All attractions
  'attractions.all': {
    url: '/getAll/Attraction',
    intro: '🌟 **Discover Amazing Attractions in Draa-Tafilalet!**\n\nHere are some incredible places you can visit:',
    formatter: formatters.all,
    limit: 5
  },

  // Natural attractions
  'attractions.natural': {
    url: '/NaturalAttractions',
    intro: '🌿 **Natural Wonders of Draa-Tafilalet**\n\nExplore these breathtaking natural attractions:',
    formatter: formatters.natural,
    limit: 5
  },

  // Historical attractions
  'attractions.historical': {
    url: '/HistoricalAttractions',
    intro: '🏰 **Historical Treasures**\n\nStep back in time with these historical sites:',
    formatter: formatters.historical,
    limit: 5
  },

  // Cultural attractions
  'attractions.cultural': {
    url: '/CulturalAttractions',
    intro: '🎭 **Cultural Heritage**\n\nImmerse yourself in the rich culture:',
    formatter: formatters.cultural,
    limit: 5
  },

  // Artificial attractions
  'attractions.artificial': {
    url: '/ArtificialAttractions',
    intro: '🏗️ **Architectural Marvels**\n\nAdmire these impressive constructions:',
    formatter: formatters.artificial,
    limit: 5
  },

  // Search by name
  'attractions.search.name': {
    url: '/getLocationByName/',
    intro: '📍 **Attraction Details**',
    formatter: formatters.detailed,
    isSearch: true,
    searchType: 'name'
  },

  // Search by city
  'attractions.search.city': {
    url: '/getLocationByCity/',
    intro: '🏘️ **Attractions in [CITY]**\n\nHere are the attractions you can visit:',
    formatter: formatters.all,
    isSearch: true,
    searchType: 'city',
    limit: 8
  },

  // Free attractions
  'attractions.free': {
    url: '/getAll/Attraction',
    intro: '🆓 **Free Attractions**\n\nEnjoy these amazing places without spending a dime:',
    formatter: formatters.all,
    filter: item => item.entryFre === 0,
    limit: 6
  },

  // Guided attractions
  'attractions.guided': {
    url: '/getAll/Attraction',
    intro: '👨‍🏫 **Attractions with Guided Tours**\n\nGet expert insights at these locations:',
    formatter: formatters.all,
    filter: item => item.guideToursAvailable === true,
    limit: 6
  }
};

// ---------------------- Main Handler Function ----------------------
async function handleIntent(intentName, parameters = {}) {
  console.log(`🎯 Processing intent: ${intentName}`, parameters);
  
  const config = intentConfig[intentName];
  
  if (!config) {
    return "I'm sorry, I didn't understand your request. Try asking about attractions, natural sites, historical places, or cultural locations!";
  }

  try {
    let url = config.url;
    let data;

    // Handle special search cases
    if (config.isSearch) {
      const searchTerm = parameters.attractionName || parameters.cityName || parameters['geo-city'] || '';
      
      if (!searchTerm) {
        return config.searchType === 'name' 
          ? "Please tell me the name of the attraction you're looking for!"
          : "Please tell me which city you'd like to explore!";
      }

      console.log(`🔍 Searching for ${config.searchType}: "${searchTerm}"`);

      if (config.searchType === 'name') {
        // Search by name with case handling
        const normalizedName = normalizeName(searchTerm);
        url += encodeURIComponent(normalizedName);
        
        try {
          console.log(`📡 API call: ${url}`);
          const response = await api.get(url);
          data = [response.data]; // Single item in array
        } catch (error) {
          if (error.response && error.response.status === 404) {
            // Try with original name if normalization fails
            url = config.url + encodeURIComponent(searchTerm);
            console.log(`📡 Retry API call: ${url}`);
            const response = await api.get(url);
            data = [response.data];
          } else {
            throw error;
          }
        }
      } else if (config.searchType === 'city') {
        // Search by city
        const normalizedCity = normalizeName(searchTerm);
        url += encodeURIComponent(normalizedCity);
        
        try {
          console.log(`📡 API call: ${url}`);
          const response = await api.get(url);
          // Filter only attractions (with entryFre and guideToursAvailable)
          data = filterAttractions(response.data);
        } catch (error) {
          if (error.response && error.response.status === 404) {
            url = config.url + encodeURIComponent(searchTerm);
            console.log(`📡 Retry API call: ${url}`);
            const response = await api.get(url);
            data = filterAttractions(response.data);
          } else {
            throw error;
          }
        }
        
        if (data.length === 0) {
          return `Sorry, I couldn't find any attractions in "${searchTerm}". Try checking the spelling or ask about other cities in Draa-Tafilalet region like Ouarzazate, Merzouga, or Tinghir!`;
        }
      }
    } else {
      // Normal request
      console.log(`📡 API call: ${url}`);
      const response = await api.get(url);
      data = Array.isArray(response.data) ? response.data : [response.data];
    }

    // Apply filters if defined
    if (config.filter && typeof config.filter === 'function') {
      console.log(`🔍 Applying filter, before: ${data.length} items`);
      data = data.filter(config.filter);
      console.log(`🔍 After filter: ${data.length} items`);
    }

    // Check if we have results
    if (!data || data.length === 0) {
      return getEmptyResponse(intentName, parameters);
    }

    // Limit results if necessary
    if (config.limit && data.length > config.limit) {
      data = data.slice(0, config.limit);
      console.log(`✂️ Limited results to ${config.limit} items`);
    }

    // Build response
    const intro = config.intro.replace('[CITY]', parameters.cityName || parameters['geo-city'] || '');
    const formattedItems = data.map(config.formatter).join('\n\n---\n\n');
    
    let response = `${intro}\n\n${formattedItems}`;
    
    // Add contextual suggestions
    response += getContextualSuggestions(intentName, data);

    console.log(`✅ Response built successfully for ${data.length} items`);
    return response;

  } catch (error) {
    console.error(`❌ Error handling intent ${intentName}:`, error.message);
    return getErrorResponse(error);
  }
}

// ---------------------- Response Helpers ----------------------
function getEmptyResponse(intentName, parameters) {
  const responses = {
    'attractions.natural': "I couldn't find any natural attractions right now. Try asking about all attractions or historical sites!",
    'attractions.historical': "No historical sites found at the moment. Would you like to see all attractions instead?",
    'attractions.cultural': "I couldn't locate cultural attractions right now. How about exploring natural wonders?",
    'attractions.artificial': "No artificial attractions found currently. Check out our historical or natural sites!",
    'attractions.free': "All attractions seem to have entry fees right now. Would you like to see all available attractions?",
    'attractions.guided': "No guided tours are available at the moment. Check out all attractions to plan your visit!",
    'attractions.search.city': `I couldn't find attractions in "${parameters.cityName || parameters['geo-city'] || 'that city'}". Try popular cities like Ouarzazate, Merzouga, or Tinghir!`
  };
  
  return responses[intentName] || "Sorry, no results found. Try asking about different types of attractions!";
}

function getContextualSuggestions(intentName, data) {
  const suggestions = {
    'attractions.all': '\n\n💡 **What would you like to know more about?**\n- Natural attractions\n- Historical sites\n- Cultural locations\n- Free attractions',
    'attractions.natural': '\n\n💡 **You might also enjoy:**\n- Historical attractions\n- Cultural sites\n- Ask about attractions in a specific city',
    'attractions.search.city': `\n\n💡 **Want to explore more?**\n- Ask about natural attractions\n- Find free activities\n- Get details about a specific attraction`,
    'attractions.free': '\n\n💡 **Planning your trip?**\n- Find attractions with guided tours\n- Explore natural wonders\n- Ask about attractions in specific cities'
  };
  
  return suggestions[intentName] || '\n\n💡 Ask me about specific attractions, cities, or types of places you\'d like to visit!';
}

function getErrorResponse(error) {
  if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return 'I\'m having trouble connecting to our attraction database right now. Please try again in a moment! 🔄';
  } else if (error.response && error.response.status === 404) {
    return 'I couldn\'t find that specific attraction. Please check the name and try again, or ask me to show all attractions! 🔍';
  } else if (error.response && error.response.status === 500) {
    return 'Our attraction service is temporarily unavailable. Please try again later! ⚠️';
  } else {
    return 'Oops! Something went wrong while fetching attraction information. Please try asking again! 🤖';
  }
}

// ---------------------- Webhook Endpoint ----------------------
app.post('/webhook', async (req, res) => {
  try {
    console.log('📨 Webhook received:', JSON.stringify(req.body, null, 2));
    
    const queryResult = req.body?.queryResult;
    
    if (!queryResult) {
      console.log('❌ No queryResult in request');
      return res.json({ 
        fulfillmentText: "I didn't receive your question properly. Could you please try asking again?" 
      });
    }

    const intentName = queryResult.intent?.displayName;
    const parameters = queryResult.parameters || {};
    const queryText = queryResult.queryText || '';
    
    console.log(`🎯 Intent: ${intentName}`);
    console.log(`📝 Query: ${queryText}`);
    console.log(`📊 Parameters:`, parameters);

    if (!intentName) {
      console.log('❌ No intent name found');
      return res.json({ 
        fulfillmentText: "I'm here to help you discover attractions in Draa-Tafilalet! Ask me about natural sites, historical places, cultural locations, or specific cities." 
      });
    }

    const fulfillmentText = await handleIntent(intentName, parameters);

    console.log('✅ Response ready, length:', fulfillmentText.length);

    return res.json({
      fulfillmentText,
      fulfillmentMessages: [{ 
        text: { 
          text: [fulfillmentText] 
        } 
      }]
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.json({
      fulfillmentText: 'I encountered an issue processing your request. Please try again! 🤖'
    });
  }
});

// ---------------------- Health Check Routes ----------------------
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Tourism Chatbot Webhook',
    message: 'Webhook is running successfully!',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Tourism Chatbot',
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Test endpoint to verify API connectivity
app.get('/test-api', async (req, res) => {
  try {
    const response = await api.get('/getAll/Attraction');
    res.json({
      status: 'success',
      message: 'API connection working',
      attractions_count: Array.isArray(response.data) ? response.data.length : 1
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'API connection failed',
      error: error.message
    });
  }
});

// ---------------------- Error Handling ----------------------
app.use((error, req, res, next) => {
  console.error('💥 Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong!'
  });
});

// ---------------------- Server Startup ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Tourism Chatbot Webhook started successfully`);
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`🏛️ Ready to help tourists explore Draa-Tafilalet region!`);
  console.log(`📍 Endpoints:`);
  console.log(`   - POST /webhook (Dialogflow webhook)`);
  console.log(`   - GET /health (Health check)`);
  console.log(`   - GET /test-api (API connectivity test)`);
});