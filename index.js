const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// URL de ton backend Spring Boot
const BASE_URL = 'https://touristeproject.onrender.com/api/public';

// Webhook principal
app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body?.queryResult?.intent?.displayName;

    // Si l'intent est "Ask_All_Attractions"
    if (intentName === 'Ask_All_Attractions') {
      const { data: attractions } = await axios.get(`${BASE_URL}/getAll/Attraction`);

      if (!Array.isArray(attractions) || attractions.length === 0) {
        return res.json({ fulfillmentText: "I couldn't find any attractions for you." });
      }

      // On liste toutes les attractions avec le symbole d'attraction
      const list = attractions.map(a => `🌟 ${a.name} (${a.cityName})`).join('\n');
      const reply = `Here are the attractions:\n${list}`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } } // Compatible avec Dialogflow Messenger
        ]
      });
    }

    // Si l'intent est "Ask_Natural_Attractions"
    if (intentName === 'Ask_Natural_Attractions') {
      const { data: naturalAttractions } = await axios.get(`${BASE_URL}/NaturalAttractions`);

      if (!Array.isArray(naturalAttractions) || naturalAttractions.length === 0) {
        return res.json({ fulfillmentText: "I couldn't find any natural attractions for you." });
      }

      // On liste toutes les attractions naturelles avec le symbole d'attraction naturelle
      const list = naturalAttractions.map(a => `🌿 ${a.name} (${a.cityName})`).join('\n');
      const reply = `Here are some natural attractions:\n${list}`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } } // Compatible avec Dialogflow Messenger
        ]
      });
    }

    // Si l'intent est "Ask_Historical_Attractions"
    if (intentName === 'Ask_Historical_Attractions') {
      const { data: historicalAttractions } = await axios.get(`${BASE_URL}/HistoricalAttractions`);

      if (!Array.isArray(historicalAttractions) || historicalAttractions.length === 0) {
        return res.json({ fulfillmentText: "I couldn't find any historical attractions for you." });
      }

      // On liste toutes les attractions historiques avec le symbole d'attraction historique
      const list = historicalAttractions.map(a => `🏛️ ${a.name} (${a.cityName})`).join('\n');
      const reply = `Here are some historical attractions:\n${list}`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } } // Compatible avec Dialogflow Messenger
        ]
      });
    }

    // Si l'intent est "Ask_Cultural_Attractions"
    if (intentName === 'Ask_Cultural_Attractions') {
      const { data: culturalAttractions } = await axios.get(`${BASE_URL}/CulturalAttractions`);

      if (!Array.isArray(culturalAttractions) || culturalAttractions.length === 0) {
        return res.json({ fulfillmentText: "I couldn't find any cultural attractions for you." });
      }

      // On liste toutes les attractions culturelles avec le symbole d'attraction culturelle
      const list = culturalAttractions.map(a => `🎭 ${a.name} (${a.cityName})`).join('\n');
      const reply = `Here are some cultural attractions:\n${list}`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } } // Compatible avec Dialogflow Messenger
        ]
      });
    }

    // Si l'intent est "Ask_Artificial_Attractions"
    if (intentName === 'Ask_Artificial_Attractions') {
      const { data: artificialAttractions } = await axios.get(`${BASE_URL}/ArtificialAttractions`);

      if (!Array.isArray(artificialAttractions) || artificialAttractions.length === 0) {
        return res.json({ fulfillmentText: "I couldn't find any artificial attractions for you." });
      }

      // On liste toutes les attractions artificielles avec le symbole d'attraction artificielle
      const list = artificialAttractions.map(a => `🏙️ ${a.name} (${a.cityName})`).join('\n');
      const reply = `Here are some artificial attractions:\n${list}`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } } // Compatible avec Dialogflow Messenger
        ]
      });
    }

    // Réponse par défaut
    return res.json({ fulfillmentText: "Sorry, I didn't understand your request." });

  } catch (error) {
    console.error('Webhook error:', error?.message);
    return res.json({ fulfillmentText: 'Error retrieving attractions.' });
  }
});

// Démarrage serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook is running on http://localhost:${PORT}`);
});
