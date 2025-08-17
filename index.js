// server.js — Ultimate Attractions Chatbot Backend
// ---------------------- Imports & Setup ----------------------
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ---------------------- Config API ----------------------
const BASE_URL = 'https://touristeproject.onrender.com/api/public';
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// ---------------------- Utility Functions ----------------------
function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPrice(price) {
  if (price === 0 || price === 0.0) return 'Free entry 🆓';
  return `Entry fee: ${price}€ 💰`;
}

function formatGuideInfo(available) {
  return available ? '👨‍🏫 Guide tours available' : '📖 Self-guided visit';
}

// ---------------------- Advanced Formatters ----------------------
function compactFormatter(icon, item) {
  const city = item.cityName ? ` (${item.cityName})` : '';
  const price = item.entryFee === 0 ? ' - Free' : ` - ${item.entryFee}€`;
  return `${icon} **${item.name}**${city}${price}`;
}

function standardFormatter(icon, item) {
  const city = item.cityName ? ` (${item.cityName})` : '';
  const country = item.countryName ? `, ${item.countryName}` : '';
  const price = formatPrice(item.entryFee || 0);
  const guide = formatGuideInfo(item.guideToursAvailable);
  
  return `${icon} **${item.name}**${city}${country}
📝 ${item.description || 'Amazing place to visit'}
${price} | ${guide}`;
}

function detailedFormatter(icon, item) {
  const city = item.cityName ? ` (${item.cityName})` : '';
  const country = item.countryName ? `, ${item.countryName}` : '';
  const price = formatPrice(item.entryFee || 0);
  const guide = formatGuideInfo(item.guideToursAvailable);
  
  let details = `${icon} **${item.name}**${city}${country}\n\n`;
  details += `📝 ${item.description || 'A wonderful place to visit'}\n`;
  details += `${price}\n${guide}\n`;
  
  // Type-specific attributes
  if (item.protectedArea !== undefined) {
    details += item.protectedArea ? `🌿 Protected natural area\n` : '';
  }
  if (item.style) {
    details += `🏛️ Style: ${item.style}\n`;
  }
  if (item.yearBuild) {
    details += `📅 Built: ${item.yearBuild}\n`;
  }
  
  if (item.latitude && item.longitude) {
    details += `📍 Location: ${item.latitude}, ${item.longitude}`;
  }
  
  return details;
}

function buildReply({ intro, icon, items, formatter = standardFormatter, limit = null }) {
  if (!items || items.length === 0) {
    return intro.includes('Sorry') ? intro : `Sorry, I couldn't find any results for your request. 😔`;
  }
  
  const limitedItems = limit ? items.slice(0, limit) : items;
  const list = limitedItems.map((i) => formatter(icon, i)).join('\n\n---\n\n');
  
  let reply = `${intro}\n\n${list}`;
  
  if (limit && items.length > limit) {
    reply += `\n\n📌 *Showing ${limit} of ${items.length} results. Ask for more specific criteria to see others!*`;
  }
  
  return reply;
}

// ---------------------- Handlers ----------------------
async function handleAllAttractions() {
  try {
    const { data } = await api.get('/getAll/Attraction');
    const arr = Array.isArray(data) ? data : [data];
    
    return buildReply({
      intro: '🌟 **All Available Attractions:**',
      icon: '🌟',
      items: arr,
      formatter: compactFormatter,
      limit: 8
    });
  } catch (e) {
    return 'Oops, something went wrong while fetching attractions. Please try again later! 😔';
  }
}

async function handleNaturalAttractions(cityName = null) {
  try {
    if (cityName) {
      // Get attractions by city and filter natural ones
      const { data } = await api.get(`/getLocationByCity/${encodeURIComponent(cityName)}`);
      const attractions = data.filter(item => 
        item.hasOwnProperty('entryFee') && 
        item.hasOwnProperty('guideToursAvailable') &&
        item.hasOwnProperty('protectedArea')
      );
      
      return buildReply({
        intro: `🌿 **Natural Attractions in ${cityName}:**`,
        icon: '🌿',
        items: attractions,
        formatter: standardFormatter
      });
    } else {
      const { data } = await api.get('/NaturalAttractions');
      return buildReply({
        intro: '🌿 **Beautiful Natural Attractions:**',
        icon: '🌿',
        items: Array.isArray(data) ? data : [data],
        formatter: standardFormatter,
        limit: 6
      });
    }
  } catch (e) {
    const location = cityName ? ` in ${cityName}` : '';
    return `I couldn't find natural attractions${location}. Please try another search! 🌿`;
  }
}

async function handleHistoricalAttractions(cityName = null) {
  try {
    if (cityName) {
      const { data } = await api.get(`/getLocationByCity/${encodeURIComponent(cityName)}`);
      const attractions = data.filter(item => 
        item.hasOwnProperty('entryFee') && 
        item.hasOwnProperty('guideToursAvailable') &&
        item.hasOwnProperty('style') &&
        !item.hasOwnProperty('yearBuild')
      );
      
      return buildReply({
        intro: `🏛️ **Historical Attractions in ${cityName}:**`,
        icon: '🏛️',
        items: attractions,
        formatter: standardFormatter
      });
    } else {
      const { data } = await api.get('/HistoricalAttractions');
      return buildReply({
        intro: '🏛️ **Fascinating Historical Sites:**',
        icon: '🏛️',
        items: Array.isArray(data) ? data : [data],
        formatter: standardFormatter,
        limit: 6
      });
    }
  } catch (e) {
    const location = cityName ? ` in ${cityName}` : '';
    return `I couldn't find historical attractions${location}. Please try another search! 🏛️`;
  }
}

async function handleCulturalAttractions(cityName = null) {
  try {
    if (cityName) {
      const { data } = await api.get(`/getLocationByCity/${encodeURIComponent(cityName)}`);
      const attractions = data.filter(item => 
        item.hasOwnProperty('entryFee') && 
        item.hasOwnProperty('guideToursAvailable') &&
        item.hasOwnProperty('yearBuild') &&
        item.hasOwnProperty('style')
      );
      
      return buildReply({
        intro: `🎨 **Cultural Attractions in ${cityName}:**`,
        icon: '🎨',
        items: attractions,
        formatter: standardFormatter
      });
    } else {
      const { data } = await api.get('/CulturalAttractions');
      return buildReply({
        intro: '🎨 **Amazing Cultural Attractions:**',
        icon: '🎨',
        items: Array.isArray(data) ? data : [data],
        formatter: standardFormatter,
        limit: 6
      });
    }
  } catch (e) {
    const location = cityName ? ` in ${cityName}` : '';
    return `I couldn't find cultural attractions${location}. Please try another search! 🎨`;
  }
}

async function handleArtificialAttractions(cityName = null) {
  try {
    if (cityName) {
      const { data } = await api.get(`/getLocationByCity/${encodeURIComponent(cityName)}`);
      const attractions = data.filter(item => 
        item.hasOwnProperty('entryFee') && 
        item.hasOwnProperty('guideToursAvailable') &&
        item.hasOwnProperty('yearBuild') &&
        !item.hasOwnProperty('style')
      );
      
      return buildReply({
        intro: `🏗️ **Artificial Attractions in ${cityName}:**`,
        icon: '🏗️',
        items: attractions,
        formatter: standardFormatter
      });
    } else {
      const { data } = await api.get('/ArtificialAttractions');
      return buildReply({
        intro: '🏗️ **Impressive Artificial Attractions:**',
        icon: '🏗️',
        items: Array.isArray(data) ? data : [data],
        formatter: standardFormatter,
        limit: 6
      });
    }
  } catch (e) {
    const location = cityName ? ` in ${cityName}` : '';
    return `I couldn't find artificial attractions${location}. Please try another search! 🏗️`;
  }
}

async function handleCityAttractions(cityName) {
  try {
    const { data } = await api.get(`/getLocationByCity/${encodeURIComponent(cityName)}`);
    const attractions = data.filter(item => 
      item.hasOwnProperty('entryFee') && item.hasOwnProperty('guideToursAvailable')
    );

    if (!attractions.length) {
      return `I couldn't find any attractions in "${cityName}". Please check the spelling or try another city! 🏙️`;
    }

    return buildReply({
      intro: `🏙️ **All Attractions in ${cityName}:**`,
      icon: '🌟',
      items: attractions,
      formatter: standardFormatter
    });
  } catch (e) {
    return `I couldn't find information about "${cityName}". Please check the city name and try again! 🏙️`;
  }
}

async function handleSpecificAttraction(attractionName) {
  try {
    let { data } = await api.get(`/getLocationByName/${encodeURIComponent(attractionName)}`);
    
    if (!data) {
      const normalized = normalizeString(attractionName);
      ({ data } = await api.get(`/getLocationByName/${encodeURIComponent(normalized)}`));
    }

    return detailedFormatter('🌟', data);
  } catch (e) {
    return `I couldn't find "${attractionName}". Please check the spelling or ask for attractions in a specific city! 🔍`;
  }
}

async function handleFreeAttractions(cityName = null) {
  try {
    let data;
    if (cityName) {
      const cityData = await api.get(`/getLocationByCity/${encodeURIComponent(cityName)}`);
      data = cityData.data.filter(item => 
        item.hasOwnProperty('entryFee') && 
        item.hasOwnProperty('guideToursAvailable') &&
        (item.entryFee === 0 || item.entryFee === 0.0)
      );
    } else {
      const allData = await api.get('/getAll/Attraction');
      data = (Array.isArray(allData.data) ? allData.data : [allData.data])
        .filter(item => item.entryFee === 0 || item.entryFee === 0.0);
    }

    const location = cityName ? ` in ${cityName}` : '';
    return buildReply({
      intro: `🆓 **Free Attractions${location}:**`,
      icon: '🆓',
      items: data,
      formatter: standardFormatter,
      limit: 6
    });
  } catch (e) {
    return `I couldn't find free attractions. Please try another search! 🆓`;
  }
}

async function handleGuidedAttractions(cityName = null) {
  try {
    let data;
    if (cityName) {
      const cityData = await api.get(`/getLocationByCity/${encodeURIComponent(cityName)}`);
      data = cityData.data.filter(item => 
        item.hasOwnProperty('entryFee') && 
        item.hasOwnProperty('guideToursAvailable') &&
        item.guideToursAvailable === true
      );
    } else {
      const allData = await api.get('/getAll/Attraction');
      data = (Array.isArray(allData.data) ? allData.data : [allData.data])
        .filter(item => item.guideToursAvailable === true);
    }

    const location = cityName ? ` in ${cityName}` : '';
    return buildReply({
      intro: `👨‍🏫 **Attractions with Guided Tours${location}:**`,
      icon: '👨‍🏫',
      items: data,
      formatter: standardFormatter,
      limit: 6
    });
  } catch (e) {
    return `I couldn't find guided attractions. Please try another search! 👨‍🏫`;
  }
}

function handleGreeting() {
  return `Hello! 👋 I'm your ultimate travel companion! 🌟

**🔍 Browse All Attractions:**
• "Show me all attractions"
• "What's available to visit?"

**🏙️ Explore by City:**
• "Attractions in Paris"
• "What to see in Tokyo"

**🎯 Browse by Type:**
• "Natural attractions" 🌿
• "Historical sites" 🏛️
• "Cultural venues" 🎨
• "Modern attractions" 🏗️

**💰 Special Searches:**
• "Free attractions"
• "Guided tours available"

**📍 Get Specific Info:**
• "Tell me about Eiffel Tower"
• "Details about Central Park"

**🎯 Combine Searches:**
• "Natural attractions in London"
• "Free cultural sites in Paris"

What adventure shall we plan today? 🚀`;
}

function handleHelp() {
  return `🆘 **I can help you discover amazing attractions!**

**🌟 General Searches:**
• "all attractions" - See everything available
• "attractions in [city]" - City-specific results

**🎯 By Type:**
• "natural attractions" - Parks, lakes, mountains
• "historical attractions" - Monuments, ruins, heritage
• "cultural attractions" - Museums, galleries, theaters
• "artificial attractions" - Modern buildings, bridges

**🏙️ Type + City Combinations:**
• "natural attractions in Paris"
• "historical sites in Rome"
• "cultural venues in London"

**💰 Special Filters:**
• "free attractions" - No entry fee
• "guided tours" - Professional guides available
• "free attractions in [city]" - Free stuff in specific city

**📍 Specific Places:**
• "tell me about [attraction name]"
• "details about Louvre Museum"

**Pro tip:** Be as specific or general as you want! I understand natural language! 🧠✨`;
}

// ---------------------- Main Webhook Handler ----------------------
app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body?.queryResult?.intent?.displayName;
    const parameters = req.body?.queryResult?.parameters || {};
    
    let reply;

    switch (intentName) {
      case 'Default Welcome Intent':
        reply = handleGreeting();
        break;

      // Basic attraction types
      case 'Ask_All_Attractions':
        reply = await handleAllAttractions();
        break;
      case 'Ask_Natural_Attractions':
        reply = await handleNaturalAttractions();
        break;
      case 'Ask_Historical_Attractions':
        reply = await handleHistoricalAttractions();
        break;
      case 'Ask_Cultural_Attractions':
        reply = await handleCulturalAttractions();
        break;
      case 'Ask_Artificial_Attractions':
        reply = await handleArtificialAttractions();
        break;

      // City-specific searches
      case 'Ask_City_Attractions':
        reply = await handleCityAttractions(parameters.city_name);
        break;
      case 'Ask_Natural_Attractions_By_City':
        reply = await handleNaturalAttractions(parameters.city_name);
        break;
      case 'Ask_Historical_Attractions_By_City':
        reply = await handleHistoricalAttractions(parameters.city_name);
        break;
      case 'Ask_Cultural_Attractions_By_City':
        reply = await handleCulturalAttractions(parameters.city_name);
        break;
      case 'Ask_Artificial_Attractions_By_City':
        reply = await handleArtificialAttractions(parameters.city_name);
        break;

      // Special searches
      case 'Ask_Free_Attractions':
        reply = await handleFreeAttractions();
        break;
      case 'Ask_Free_Attractions_By_City':
        reply = await handleFreeAttractions(parameters.city_name);
        break;
      case 'Ask_Guided_Attractions':
        reply = await handleGuidedAttractions();
        break;
      case 'Ask_Guided_Attractions_By_City':
        reply = await handleGuidedAttractions(parameters.city_name);
        break;

      // Specific attraction
      case 'Ask_Specific_Attraction':
        reply = await handleSpecificAttraction(parameters.attraction_name);
        break;

      case 'Help_Intent':
        reply = handleHelp();
        break;

      default:
        reply = "I'm not sure how to help with that. Try asking about attractions or say 'help' to see all my features! 🤔";
    }

    return res.json({
      fulfillmentText: reply,
      fulfillmentMessages: [{ text: { text: [reply] } }],
    });
  } catch (error) {
    console.error('Webhook error:', error?.message);
    return res.json({
      fulfillmentText: 'Oops, something went wrong! Please try again later! 😔',
    });
  }
});

// ---------------------- Health Route ----------------------
app.get('/', (_req, res) => res.send('🌟 Ultimate Attractions Chatbot is running! 🚀'));

// ---------------------- Server Start ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌟 Ultimate Attractions Chatbot running on port ${PORT} 🚀`);
});