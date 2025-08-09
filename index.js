// server.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// --- Config de base
const BASE_URL = 'https://touristeproject.onrender.com/api/public';

// Utilitaire pour afficher un label propre par endpoint
const labelFromEndpoint = (endpoint) => {
  const map = {
    'getAll/Attraction': 'Attractions',
    'NaturalAttractions': 'Natural attractions',
    'HistoricalAttractions': 'Historical attractions',
    'CulturalAttractions': 'Cultural attractions',
    'ArtificialAttractions': 'Artificial attractions'
  };
  return map[endpoint] || 'Attractions';
};

// Fonction pour normaliser le texte (mettre en minuscule et supprimer les accents)
const normalizeString = (str = '') => {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

// --- Fonction générique pour lister et créer le contexte
const handleAskAttractions = async (endpoint, contextName, res, req) => {
  const { data: attractions } = await axios.get(`${BASE_URL}/${endpoint}`);

  if (!Array.isArray(attractions) || attractions.length === 0) {
    return res.json({ fulfillmentText: `I couldn't find any ${labelFromEndpoint(endpoint).toLowerCase()} for you.` });
  }

  // Afficher les 5 premières attractions
  const firstFive = attractions.slice(0, 5).map(a => `- ${a.name}`).join('\n');
  const reply = `Here are some ${labelFromEndpoint(endpoint).toLowerCase()}:\n${firstFive}`;

  // Bouton "See more" compatible Google Assistant
  const responseWithButton = {
    fulfillmentText: reply,
    fulfillmentMessages: [
      {
        platform: "ACTIONS_ON_GOOGLE",
        payload: {
          google: {
            richResponse: {
              items: [
                { simpleResponse: { textToSpeech: reply } }
              ],
              linkOutSuggestion: {
                destinationName: "See more",
                // IMPORTANT: remplace par l’URL publique de TON backend
                url: `https://your-backend-url.com/see-more-attractions/${endpoint}?page=1`
              }
            }
          }
        }
      }
    ]
  };

  // Contexte pour suivre la page actuelle et l’endpoint utilisé
  return res.json({
    fulfillmentText: reply,
    fulfillmentMessages: responseWithButton.fulfillmentMessages,
    outputContexts: [
      {
        name: `${req.body.session}/contexts/${contextName}`,
        lifespanCount: 5,
        parameters: {
          page: 1,          // la prochaine page à servir (items 6-10)
          endpoint          // on stocke l’endpoint exact
        }
      }
    ]
  });
};

// --- Webhook principal
app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body?.queryResult?.intent?.displayName;
    const contexts = req.body?.queryResult?.outputContexts || [];
    const context = contexts.find(c =>
      c.name.includes('show-attractions') ||
      c.name.includes('show-natural-attractions') ||
      c.name.includes('show-historical-attractions') ||
      c.name.includes('show-cultural-attractions') ||
      c.name.includes('show-artificial-attractions')
    );

    // Si une nouvelle question hors attractions arrive, on nettoie le contexte
    if (context) {
      if (![ 'Ask_All_Attractions', 'Ask_Natural_Attractions', 'Ask_Historical_Attractions', 'Ask_Cultural_Attractions', 'Ask_Artificial_Attractions' ].includes(intentName)) {
        return res.json({
          fulfillmentText: "Let's move on to something else. Feel free to ask me about other attractions.",
          outputContexts: []
        });
      }
    }

    // Routing des intents -> bons endpoints (conformes à tes routes)
    if (intentName === 'Ask_All_Attractions') {
      return await handleAskAttractions('getAll/Attraction', 'show-attractions', res, req);
    }
    if (intentName === 'Ask_Natural_Attractions') {
      return await handleAskAttractions('NaturalAttractions', 'show-natural-attractions', res, req);
    }
    if (intentName === 'Ask_Historical_Attractions') {
      return await handleAskAttractions('HistoricalAttractions', 'show-historical-attractions', res, req);
    }
    if (intentName === 'Ask_Cultural_Attractions') {
      return await handleAskAttractions('CulturalAttractions', 'show-cultural-attractions', res, req);
    }
    if (intentName === 'Ask_Artificial_Attractions') {
      return await handleAskAttractions('ArtificialAttractions', 'show-artificial-attractions', res, req);
    }

    // --- Détails d'une attraction précise
    if (intentName === 'Ask_Attraction_Details') {
      const attractionName = req.body?.queryResult?.parameters?.['attraction-name'];

      // Récupérer la liste complète pour matcher par nom
      const { data: attractions } = await axios.get(`${BASE_URL}/getAll/Attraction`);

      const normalized = normalizeString(attractionName);
      const attraction = attractions.find(a => normalizeString(a.name) === normalized);

      if (!attraction) {
        return res.json({
          fulfillmentText: `Sorry, I couldn't find an attraction named "${attractionName}". Maybe try typing the name more correctly?`
        });
      }

      const id = attraction.id_Location;
      const { data: details } = await axios.get(`${BASE_URL}/getLocationById/${id}`);

      const reply = {
        fulfillmentText:
          `Here are the details for ${details.name} (${details.cityName}): \n` +
          `📍 City: ${details.cityName} \n` +
          `💰 Entry Fee: ${details.entryFee} \n` +
          `📖 Description: ${details.description}`,
        fulfillmentMessages: [
          {
            platform: "ACTIONS_ON_GOOGLE",
            payload: {
              google: {
                richResponse: {
                  items: [
                    {
                      carouselBrowse: {
                        items: (details.images || []).map((image) => ({
                          title: `Image of ${details.name}`,
                          openUrlAction: { url: image }
                        }))
                      }
                    }
                  ]
                }
              }
            }
          },
          {
            platform: "ACTIONS_ON_GOOGLE",
            payload: {
              google: {
                richResponse: {
                  items: [
                    { simpleResponse: { textToSpeech: `See ${details.name} on the map.` } }
                  ],
                  linkOutSuggestion: {
                    destinationName: "View on the map",
                    url: `https://www.google.com/maps?q=${details.latitude},${details.longitude}`
                  }
                }
              }
            }
          }
        ]
      };

      return res.json(reply);
    }

    // Intent par défaut si rien ne matche
    return res.json({ fulfillmentText: "Sorry, I didn't understand your request." });
  } catch (error) {
    console.error('Webhook error:', error?.message);
    return res.json({ fulfillmentText: 'Error retrieving attractions.' });
  }
});

// --- Route "See more" (serve la suite 5 par 5) ---
app.get('/see-more-attractions/:endpoint', async (req, res) => {
  const endpoint = req.params.endpoint;
  const page = parseInt(req.query.page, 10) || 1; // page 1 => items 6..10

  // petite whitelist pour éviter des appels arbitraires
  const allowed = new Set([
    'getAll/Attraction',
    'NaturalAttractions',
    'HistoricalAttractions',
    'CulturalAttractions',
    'ArtificialAttractions'
  ]);
  if (!allowed.has(endpoint)) {
    return res.status(400).json({ fulfillmentText: 'Invalid category.' });
  }

  try {
    const { data: attractions } = await axios.get(`${BASE_URL}/${endpoint}`);

    if (!Array.isArray(attractions) || attractions.length <= page * 5) {
      return res.json({ fulfillmentText: "There are no more attractions to show." });
    }

    const nextFive = attractions.slice(page * 5, (page + 1) * 5).map(a => `- ${a.name}`).join('\n');
    const reply =
      `Here are some more ${labelFromEndpoint(endpoint).toLowerCase()}:\n${nextFive}`;

    // Pas de bouton "See more" ici (on ne chaîne pas à l’infini)
    return res.json({
      fulfillmentText: reply,
      fulfillmentMessages: [
        {
          platform: "ACTIONS_ON_GOOGLE",
          payload: {
            google: {
              richResponse: {
                items: [
                  { simpleResponse: { textToSpeech: reply } }
                ]
              }
            }
          }
        }
      ]
    });
  } catch (e) {
    console.error('See-more error:', e?.message);
    return res.json({ fulfillmentText: 'Error retrieving more attractions.' });
  }
});

// --- Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook is running on http://localhost:${PORT}`);
});
