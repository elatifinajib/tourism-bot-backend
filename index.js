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
    const contexts = req.body?.queryResult?.outputContexts; // Récupérer les contextes

    let reply = '';
    let list = '';

    // Si l'intent est "Ask_All_Attractions"
    if (intentName === 'Ask_All_Attractions') {
      const { data: attractions } = await axios.get(`${BASE_URL}/getAll/Attraction`);

      if (!Array.isArray(attractions) || attractions.length === 0) {
        reply = "I couldn't find any attractions for you.";
      } else {
        list = attractions.map(a => `🌟 ${a.name} (${a.cityName})`).join('\n');
        reply = `Here are the attractions:\n${list}`;
      }

      // Définir le contexte "attractions_requested"
      return res.json({
        fulfillmentText: reply,
        outputContexts: [
          {
            name: `${req.body.session}/contexts/attractions_requested`,
            lifespanCount: 5, // Le contexte dure pour 5 tours
            parameters: {
              last_attraction: 'all' // Marque que l'utilisateur a demandé les attractions générales
            }
          }
        ]
      });
    }

    // Si l'intent est "Ask_Historical_Attractions"
    if (intentName === 'Ask_Historical_Attractions') {
      const { data: historicalAttractions } = await axios.get(`${BASE_URL}/getAll/HistoricalAttraction`);

      if (!Array.isArray(historicalAttractions) || historicalAttractions.length === 0) {
        reply = "I couldn't find any historical attractions for you.";
      } else {
        list = historicalAttractions.map(a => `🏛️ ${a.name} (${a.cityName})`).join('\n');
        reply = `Here are some historical attractions:\n${list}`;
      }

      // Vérifier si un contexte est défini pour une attraction précédente (All Attractions par exemple)
      if (contexts && contexts.some(context => context.name.includes('attractions_requested') && context.parameters.last_attraction === 'all')) {
        reply = `You previously asked for all attractions. Now I’m showing you the historical ones.\n${reply}`;
      }

      return res.json({
        fulfillmentText: reply,
        outputContexts: [
          {
            name: `${req.body.session}/contexts/attractions_requested`,
            lifespanCount: 5,
            parameters: {
              last_attraction: 'historical' // Marque que l'utilisateur a demandé les attractions historiques
            }
          }
        ]
      });
    }

    // Si l'intent est "Ask_Natural_Attractions"
    if (intentName === 'Ask_Natural_Attractions') {
      const { data: naturalAttractions } = await axios.get(`${BASE_URL}/getAll/NaturalAttraction`);

      if (!Array.isArray(naturalAttractions) || naturalAttractions.length === 0) {
        reply = "I couldn't find any natural attractions for you.";
      } else {
        list = naturalAttractions.map(a => `🌿 ${a.name} (${a.cityName})`).join('\n');
        reply = `Here are some natural attractions:\n${list}`;
      }

      // Mise à jour du contexte
      return res.json({
        fulfillmentText: reply,
        outputContexts: [
          {
            name: `${req.body.session}/contexts/attractions_requested`,
            lifespanCount: 5,
            parameters: {
              last_attraction: 'natural' // Marque que l'utilisateur a demandé des attractions naturelles
            }
          }
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
