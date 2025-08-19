const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// URL de ton API d'attractions déployée sur Render
const ATTRACTIONS_API_URL = 'https://ton-app-render.onrender.com/api/public/getAll/Attraction';

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Tourism Chatbot Backend is running!',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: '/webhook',
      health: '/',
      test: '/test'
    }
  });
});

// Test endpoint pour vérifier la connexion aux attractions
app.get('/test', async (req, res) => {
  try {
    const response = await axios.get(ATTRACTIONS_API_URL, {
      timeout: 10000
    });
    res.json({
      message: 'Connection to attractions API successful',
      attractionsCount: response.data.length,
      sampleAttraction: response.data[0] || null
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to connect to attractions API',
      error: error.message
    });
  }
});

// Webhook principal pour Dialogflow
app.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook appelé:', JSON.stringify(req.body, null, 2));

    const intentName = req.body.queryResult?.intent?.displayName;
    const queryText = req.body.queryResult?.queryText;
    const sessionId = req.body.session;

    console.log(`Intent détecté: ${intentName}`);
    console.log(`Message utilisateur: ${queryText}`);

    let response = {};

    switch (intentName) {
      case 'Ask_All_Attractions':
        response = await handleAllAttractionsRequest();
        break;
      
      case 'Default Welcome Intent':
        response = {
          fulfillmentText: "Bonjour ! Je suis votre assistant touristique pour la région Draa-Tafilalet. Comment puis-je vous aider aujourd'hui ?"
        };
        break;
      
      default:
        response = {
          fulfillmentText: "Je n'ai pas bien compris votre demande. Pouvez-vous me dire ce que vous cherchez ?"
        };
    }

    console.log('Réponse envoyée:', JSON.stringify(response, null, 2));
    res.json(response);

  } catch (error) {
    console.error('Erreur dans le webhook:', error);
    res.status(500).json({
      fulfillmentText: "Désolé, je rencontre un problème technique. Veuillez réessayer dans quelques instants."
    });
  }
});

// Fonction pour gérer la demande de toutes les attractions
async function handleAllAttractionsRequest() {
  try {
    console.log('Récupération des attractions...');
    
    // Appel à ton API d'attractions
    const response = await axios.get(ATTRACTIONS_API_URL, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const attractions = response.data;
    console.log(`${attractions.length} attractions récupérées`);

    if (!attractions || attractions.length === 0) {
      return {
        fulfillmentText: "Aucune attraction n'est disponible pour le moment. Veuillez réessayer plus tard."
      };
    }

    // Formatage pour Flutter
    return {
      fulfillmentText: `J'ai trouvé ${attractions.length} attractions magnifiques pour vous !`,
      
      // Payload spécial pour Flutter
      payload: {
        flutter: {
          type: 'attractions_list',
          data: {
            attractions: attractions,
            count: attractions.length,
            message: `Découvrez ${attractions.length} attractions incontournables`
          },
          actions: [
            {
              type: 'view_details',
              label: 'Voir détails',
              icon: 'info'
            },
            {
              type: 'get_directions',
              label: 'Itinéraire',
              icon: 'directions'
            },
            {
              type: 'favorite',
              label: 'Favoris',
              icon: 'favorite'
            }
          ]
        }
      },

      // Réponses riches pour Dialogflow (optionnel)
      fulfillmentMessages: [
        {
          platform: "ACTIONS_ON_GOOGLE",
          carouselSelect: {
            items: attractions.slice(0, 10).map(attraction => ({
              info: {
                key: attraction.id_Location?.toString() || Math.random().toString(),
                title: attraction.name || 'Attraction sans nom',
                description: `${attraction.cityName || 'Ville inconnue'}, ${attraction.countryName || 'Pays inconnu'} - ${attraction.entryFre || 0}€`,
                image: {
                  url: (attraction.imageUrls && attraction.imageUrls.length > 0) 
                    ? attraction.imageUrls[0] 
                    : "https://via.placeholder.com/300x200?text=No+Image"
                }
              }
            }))
          }
        }
      ]
    };

  } catch (error) {
    console.error('Erreur lors de la récupération des attractions:', error.message);
    
    return {
      fulfillmentText: "Désolé, je n'arrive pas à récupérer les attractions en ce moment. Le service pourrait être temporairement indisponible. Veuillez réessayer dans quelques minutes."
    };
  }
}

// Gestion des erreurs globales
app.use((error, req, res, next) => {
  console.error('Erreur globale:', error);
  res.status(500).json({
    fulfillmentText: "Une erreur inattendue s'est produite."
  });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📱 Webhook URL: https://tourism-bot-backend-production.up.railway.app/webhook`);
  console.log(`🏛️ API Attractions: ${ATTRACTIONS_API_URL}`);
});

module.exports = app;