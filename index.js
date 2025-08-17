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

// ---------------------- Formatter ----------------------
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

function handleGreeting() {
  return `Hello! 👋 I'm your travel assistant! 🌟

I can help you discover amazing attractions:

🌟 **All attractions** - "Show me all attractions"
🌿 **Natural attractions** - "Natural places to visit"
🏛️ **Historical attractions** - "Historical sites please"
🎨 **Cultural attractions** - "Cultural venues"
🏗️ **Artificial attractions** - "Modern attractions"

❓ **Need help?** - Just say "help"

What would you like to explore today? 🚀`;
}

function handleHelp() {
  return `🆘 **I can help you discover attractions!**

**Available commands:**
• "Show me all attractions" - See everything
• "Natural attractions" - Parks, nature sites
• "Historical attractions" - Monuments, heritage sites
• "Cultural attractions" - Museums, galleries
• "Artificial attractions" - Modern buildings, bridges

Just ask me naturally and I'll find the perfect attractions for you! 🌟`;
}

// ---------------------- Main Webhook Handler ----------------------
app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body?.queryResult?.intent?.displayName;
    
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