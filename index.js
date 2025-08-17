// server.js — Simple Attractions Chatbot Backend
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
function normalizeAttractionName(name) {
  if (!name) return '';
  
  // Normalize the string: remove diacritics, normalize spaces and apostrophes
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/['']/g, "'") // Normalize apostrophes
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
    
  // Convert to title case for better matching
  return normalized.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function truncateDescription(description, maxLines = 2, maxCharsPerLine = 50) {
  if (!description) return 'Amazing place to visit...';
  
  // Split into words and create lines
  const words = description.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + word).length > maxCharsPerLine) {
      if (currentLine) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        lines.push(word);
        currentLine = '';
      }
    } else {
      currentLine += word + ' ';
    }
    
    if (lines.length >= maxLines) break;
  }
  
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine.trim());
  }
  
  return lines.join('\n') + '...';
}

// ---------------------- Detailed Formatter for Specific Attraction ----------------------
function formatSpecificAttraction(item) {
  if (!item) return 'Attraction not found. 😔';
  
  const city = item.cityName ? ` (${item.cityName})` : '';
  const country = item.countryName ? `, ${item.countryName}` : '';
  
  let details = `🌟 ${item.name}${city}${country}\n\n`;
  details += `📝 Description:\n${item.description || 'Amazing place to visit!'}\n\n`;
  
  // Entry fee
  if (item.entryFee !== undefined) {
    const price = item.entryFee === 0 ? 'Free entry 🆓' : `Entry fee: ${item.entryFee}€ 💰`;
    details += `💰 ${price}\n`;
  }
  
  // Guide tours
  if (item.guideToursAvailable !== undefined) {
    const guide = item.guideToursAvailable ? '👨‍🏫 Guide tours available' : '📖 Self-guided visit';
    details += `${guide}\n`;
  }
  
  // Type-specific attributes
  if (item.protectedArea !== undefined) {
    details += item.protectedArea ? `🌿 Protected natural area\n` : '';
  }
  if (item.style) {
    details += `🏛️ Architectural style: ${item.style}\n`;
  }
  if (item.yearBuild) {
    details += `📅 Year built: ${item.yearBuild}\n`;
  }
  
  // Location coordinates
  if (item.latitude && item.longitude) {
    details += `📍 Coordinates: ${item.latitude}, ${item.longitude}`;
  }
  
  return details;
}
function formatAttractions(items, title) {
  if (!items || items.length === 0) {
    return `${title}\n\nSorry, no attractions found. 😔`;
  }
  
  const attractionsList = items.map((item, index) => {
    const city = item.cityName ? ` (${item.cityName})` : '';
    const shortDescription = truncateDescription(item.description);
    
    return `${index + 1}. ${item.name}${city}\n${shortDescription}`;
  }).join('\n\n');
  
  const countInfo = items.length > 10 ? `\n\n📌 Showing 10 of ${items.length} attractions.` : '';
  
  return `${title}\n\n${attractionsList}${countInfo}`;
}

// ---------------------- Handlers ----------------------
async function handleAllAttractions() {
  try {
    const { data } = await api.get('/getAll/Attraction');
    const arr = Array.isArray(data) ? data : [data];
    const limitedItems = arr.slice(0, 10);
    
    return formatAttractions(limitedItems, '🌟 All Available Attractions:');
  } catch (e) {
    console.error('All attractions error:', e?.message);
    return 'Oops, something went wrong while fetching attractions. Please try again later! 😔';
  }
}

async function handleNaturalAttractions() {
  try {
    const { data } = await api.get('/NaturalAttractions');
    const arr = Array.isArray(data) ? data : [data];
    const limitedItems = arr.slice(0, 10);
    
    return formatAttractions(limitedItems, '🌿 Natural Attractions:');
  } catch (e) {
    console.error('Natural attractions error:', e?.message);
    return 'I couldn\'t find natural attractions. Please try again later! 🌿';
  }
}

async function handleHistoricalAttractions() {
  try {
    const { data } = await api.get('/HistoricalAttractions');
    const arr = Array.isArray(data) ? data : [data];
    const limitedItems = arr.slice(0, 10);
    
    return formatAttractions(limitedItems, '🏛️ Historical Attractions:');
  } catch (e) {
    console.error('Historical attractions error:', e?.message);
    return 'I couldn\'t find historical attractions. Please try again later! 🏛️';
  }
}

async function handleCulturalAttractions() {
  try {
    const { data } = await api.get('/CulturalAttractions');
    const arr = Array.isArray(data) ? data : [data];
    const limitedItems = arr.slice(0, 10);
    
    return formatAttractions(limitedItems, '🎨 Cultural Attractions:');
  } catch (e) {
    console.error('Cultural attractions error:', e?.message);
    return 'I couldn\'t find cultural attractions. Please try again later! 🎨';
  }
}

async function handleArtificialAttractions() {
  try {
    const { data } = await api.get('/ArtificialAttractions');
    const arr = Array.isArray(data) ? data : [data];
    const limitedItems = arr.slice(0, 10);
    
    return formatAttractions(limitedItems, '🏗️ Artificial Attractions:');
  } catch (e) {
    console.error('Artificial attractions error:', e?.message);
    return 'I couldn\'t find artificial attractions. Please try again later! 🏗️';
  }
}

async function handleSpecificAttraction(attractionName) {
  if (!attractionName) {
    return "Please specify which attraction you'd like to know more about.";
  }

  try {
    // Try multiple name variations to handle case sensitivity
    const nameVariations = [
      attractionName, // Original
      normalizeAttractionName(attractionName), // Normalized title case
      attractionName.toLowerCase(), // Lowercase
      attractionName.toUpperCase(), // Uppercase
      attractionName.charAt(0).toUpperCase() + attractionName.slice(1).toLowerCase() // First letter uppercase
    ];

    let data = null;
    let lastError = null;

    // Try each variation until one works
    for (const nameVar of nameVariations) {
      try {
        const response = await api.get(`/getLocationByName/${encodeURIComponent(nameVar)}`);
        if (response.data) {
          data = response.data;
          break;
        }
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    if (!data) {
      return `I couldn't find an attraction named "${attractionName}". Please check the spelling or try asking for attractions in a specific city. 🔍`;
    }

    return formatSpecificAttraction(data);
  } catch (e) {
    console.error('Specific attraction error:', e?.message);
    return `I couldn't find detailed information about "${attractionName}". Please check the spelling and try again. 🔍`;
  }
}
  return `Hello! 👋 I'm your assistant! 🌟

I can help you discover the beauty of Draa Tafilalet.
What would you like to explore today? 🚀`;


function handleHelp() {
  return `🆘 **I can help you discover attractions!**

**Available commands:**
• "Show me all attractions" - See everything
• "Natural attractions" - Parks, nature sites
• "Historical attractions" - Monuments, heritage sites
• "Cultural attractions" - Museums, galleries
• "Artificial attractions" - Modern buildings, bridges
• "Tell me about [attraction name]" - Detailed info about specific places

**Examples:**
• "Tell me about Eiffel Tower"
• "What is Big Ben"
• "About Louvre Museum"

Just ask me naturally and I'll find the perfect attractions for you! 🌟`;
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

      case 'Ask_Specific_Attraction':
        reply = await handleSpecificAttraction(parameters.attraction_name);
        break;

      case 'Help_Intent':
        reply = handleHelp();
        break;

      default:
        reply = "I'm not sure how to help with that. Try asking about attractions or say 'help' to see what I can do! 🤔";
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
app.get('/', (_req, res) => res.send('🌟 Simple Attractions Chatbot is running! 🚀'));

// ---------------------- Server Start ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌟 Simple Attractions Chatbot running on port ${PORT} 🚀`);
});