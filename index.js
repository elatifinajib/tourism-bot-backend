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

      // On liste toutes les attractions avec un retour à la ligne HTML <br> entre chaque
      const list = attractions.map(a => `- ${a.name} (${a.cityName})`).join('<br>');
      const reply = `Here are the attractions:<br>${list}`;

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
