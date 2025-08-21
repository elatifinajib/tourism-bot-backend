// index.js - Version modifiée pour webhook Dialogflow
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
    message: '🚀 Tourism Bot Backend with Dialogflow is running!',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: '/webhook (Dialogflow)',
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

// 🔥 Webhook Dialogflow - NOUVELLE VERSION
app.post('/webhook', async (req, res) => {
  try {
    console.log('🎯 Dialogflow Webhook called:', JSON.stringify(req.body, null, 2));

    // ✅ Extraction des données RÉELLES de Dialogflow
    const intentName = req.body.queryResult?.intent?.displayName;
    const queryText = req.body.queryResult?.queryText;
    const parameters = req.body.queryResult?.parameters || {};
    const sessionId = extractSessionId(req.body.session);

    console.log(`🔍 Dialogflow Intent: ${intentName}`);
    console.log(`💬 User message: ${queryText}`);
    console.log(`📊 Dialogflow Parameters: ${JSON.stringify(parameters)}`);
    console.log(`🆔 Session ID: ${sessionId}`);

    // ✅ Vérifier si c'est un intent que nous devons traiter
    if (!intentName) {
      return res.json({
        fulfillmentText: "I didn't understand that. Could you please rephrase?"
      });
    }

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
        response = await handleDialogflowIntent(intentName, sessionId, parameters);
      }
    } else {
      // Flux normal sans pagination en cours
      response = await handleDialogflowIntent(intentName, sessionId, parameters);
    }

    console.log('📤 Response sent to Dialogflow:', JSON.stringify(response, null, 2));
    res.json(response);

  } catch (error) {
    console.error('❌ Dialogflow Webhook error:', error);
    res.status(500).json({
      fulfillmentText: "Sorry, I'm experiencing technical difficulties. Please try again in a moment."
    });
  }
});

// 🆕 Fonction pour gérer les intents Dialogflow
async function handleDialogflowIntent(intentName, sessionId, parameters = {}) {
  console.log(`🎯 Processing Dialogflow intent: ${intentName}`);
  
  switch (intentName) {
    case 'Ask_All_Attractions':
      console.log('📋 Handling: All Attractions');
      return await handleAllAttractions(sessionId);
    
    case 'Ask_Natural_Attractions':
      console.log('🌿 Handling: Natural Attractions');
      return await handleNaturalAttractions(sessionId);
    
    case 'Ask_Cultural_Attractions':
      console.log('🎭 Handling: Cultural Attractions');
      return await handleCulturalAttractions(sessionId);
    
    case 'Ask_Historical_Attractions':
      console.log('🏛️ Handling: Historical Attractions');
      return await handleHistoricalAttractions(sessionId);
    
    case 'Ask_Artificial_Attractions':
      console.log('🏗️ Handling: Artificial Attractions');
      return await handleArtificialAttractions(sessionId);
    
    case 'Ask_Attractions_By_City':
      // ✅ Extraction du paramètre city de Dialogflow
      const cityName = parameters.city || parameters['geo-city'] || parameters.name;
      console.log(`🏙️ Handling: Attractions by City - ${cityName}`);
      return await handleAttractionsByCity(sessionId, cityName);
    
    case 'Default Welcome Intent':
      console.log('👋 Handling: Welcome');
      return {
        fulfillmentText: "Welcome to Draa-Tafilalet Tourism Assistant! I'm here to help you discover amazing attractions. You can ask me about all attractions, natural sites, cultural landmarks, historical places, artificial attractions, or attractions in a specific city."
      };
    
    default:
      console.log(`❓ Unknown intent: ${intentName}`);
      return {
        fulfillmentText: `I understand you're asking about "${intentName}", but I'm not sure how to help with that. Try asking about 'all attractions', 'natural attractions', 'cultural sites', 'historical places', 'artificial attractions', or attractions in a specific city like 'attractions in Errachidia'.`
      };
  }
}

// ✅ Toutes les autres fonctions restent identiques
// (handleAllAttractions, handleNaturalAttractions, etc.)

// Fonctions utilitaires (inchangées)
function extractSessionId(sessionPath) {
  return sessionPath ? sessionPath.split('/').pop() : 'default-session';
}

function isUserWantingMore(queryText) {
  if (!queryText) return false;
  const lowerText = queryText.toLowerCase();
  const positiveResponses = ['yes', 'oui', 'ok', 'okay', 'sure', 'please', 'show more', 'voir plus', 'more', 'continue', 'd\'accord', 'bien sûr'];
  return positiveResponses.some(response => lowerText.includes(response));
}

function isUserDeclining(queryText) {
  if (!queryText) return false;
  const lowerText = queryText.toLowerCase();
  const negativeResponses = ['no', 'non', 'nope', 'not now', 'maybe later', 'that\'s enough', 'pas maintenant', 'merci'];
  return negativeResponses.some(response => lowerText.includes(response));
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

// 🆕 Nouveau endpoint pour tester l'intégration Dialogflow
app.get('/test-dialogflow', (req, res) => {
  res.json({
    message: '✅ Dialogflow Webhook endpoint is ready!',
    timestamp: new Date().toISOString(),
    supportedIntents: [
      'Ask_All_Attractions',
      'Ask_Natural_Attractions', 
      'Ask_Cultural_Attractions',
      'Ask_Historical_Attractions',
      'Ask_Artificial_Attractions',
      'Ask_Attractions_By_City'
    ],
    webhookUrl: 'https://tourism-bot-backend-production.up.railway.app/webhook'
  });
});

// Toutes les autres fonctions handler restent identiques
// (handleAllAttractions, handleNaturalAttractions, handleCulturalAttractions, etc.)
// ... [Copiez le reste du code depuis votre fichier actuel]

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);
  res.status(500).json({
    fulfillmentText: "An unexpected error occurred."
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Tourism Bot Backend with Dialogflow started on port ${PORT}`);
  console.log(`📱 Dialogflow Webhook URL: https://tourism-bot-backend-production.up.railway.app/webhook`);
  console.log(`🏛️ Tourism API: ${API_BASE_URL}`);
  console.log('✅ Ready to handle REAL Dialogflow requests!');
});

module.exports = app;