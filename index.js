const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Fonction pour normaliser le texte (minuscule et suppression des accents)
const normalizeString = (str) => {
  return str
    .toLowerCase() // Mettre tout en minuscule
    .normalize('NFD') // Normalisation Unicode
    .replace(/[\u0300-\u036f]/g, ''); // Supprimer les accents
};

// Webhook principal
app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    const context = req.body.queryResult.outputContexts.find(context => context.name.includes('show-attractions'));

    if (intentName === 'Ask_All_Attractions') {
      const response = await axios.get('https://touristeproject.onrender.com/api/public/getAll/Attraction');
      const attractions = response.data;

      if (!Array.isArray(attractions) || attractions.length === 0) {
        return res.json({ fulfillmentText: 'Aucune attraction trouvée.' });
      }

      // Stocker l'état de la page
      const firstFive = attractions.slice(0, 5).map(a => `- ${a.name}`).join('\n');
      const reply = `Voici quelques attractions :\n${firstFive}\n\nVoulez-vous en voir plus ?`;

      // Créer un contexte pour savoir que la page 1 a été affichée
      return res.json({
        fulfillmentText: reply,
        outputContexts: [
          {
            name: `${req.body.session}/contexts/show-attractions`,
            lifespanCount: 5,
            parameters: {
              page: 1
            }
          }
        ]
      });
    }

    if (intentName === 'Voir_plus_attractions') {
      const response = await axios.get('https://touristeproject.onrender.com/api/public/getAll/Attraction');
      const attractions = response.data;

      if (!Array.isArray(attractions) || attractions.length <= 5) {
        return res.json({ fulfillmentText: 'Il n’y a pas plus d’attractions à afficher.' });
      }

      // Vérifier la page courante dans le contexte
      const currentPage = context ? context.parameters.page : 1;
      const nextFive = attractions.slice(currentPage * 5, (currentPage + 1) * 5).map(a => `- ${a.name}`).join('\n');

      // Mettre à jour la page
      const newPage = currentPage + 1;
      const reply = `Voici d’autres attractions :\n${nextFive}`;

      return res.json({
        fulfillmentText: reply,
        outputContexts: [
          {
            name: `${req.body.session}/contexts/show-attractions`,
            lifespanCount: 5,
            parameters: {
              page: newPage
            }
          }
        ]
      });
    }

    if (intentName === 'Ask_Attraction_Details') {
      const attractionName = req.body.queryResult.parameters['attraction_name'];

      // Récupérer toutes les attractions
      const response = await axios.get('https://touristeproject.onrender.com/api/public/getAll/Attraction');
      const attractions = response.data;

      // Normaliser le nom d'attraction entré par l'utilisateur
      const normalizedAttractionName = normalizeString(attractionName);
      const attraction = attractions.find(a => normalizeString(a.name) === normalizedAttractionName);

      if (!attraction) {
        return res.json({ fulfillmentText: `Je n'ai trouvé aucune attraction nommée "${attractionName}". Si tu peux essayer d'écrire un nom correct de l'attraction.` });
      }

      const id = attraction.id_Location;
      const detailRes = await axios.get(`https://touristeproject.onrender.com/api/public/getLocationById/${id}`);
      const details = detailRes.data;

      // Construire la réponse avec le nom, la ville, et la description
      const reply = {
        fulfillmentText: `Détails de ${details.name} (${details.cityName}) :\n📍 Ville : ${details.cityName}\n💰 Entrée : ${details.entryFee}\n📖 Description : ${details.description}`,
        fulfillmentMessages: [
          {
            platform: "ACTIONS_ON_GOOGLE", // Pour l'affichage sur l'app mobile
            payload: {
              google: {
                "richResponse": {
                  "items": [
                    {
                      "carouselBrowse": {
                        "items": details.images.map(image => ({
                          "title": `Image de ${details.name}`,
                          "openUrlAction": {
                            "url": image  // URL de l'image à afficher dans le carrousel
                          }
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
                "richResponse": {
                  "items": [
                    {
                      "simpleResponse": {
                        "textToSpeech": `Voir ${details.name} sur la carte`
                      }
                    },
                    {
                      "suggestions": {
                        "suggestions": [
                          {
                            "title": "Voir sur la carte",
                            "action": {
                              "url": `https://www.google.com/maps?q=${details.latitude},${details.longitude}` // Lien vers Google Maps
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            }
          }
        ]
      };

      return res.json(reply);
    }

    // Réponse par défaut si aucun intent reconnu
    return res.json({ fulfillmentText: "Je n'ai pas compris votre demande." });

  } catch (error) {
    console.error('Erreur webhook:', error.message);
    return res.json({ fulfillmentText: 'Erreur lors de la récupération des attractions.' });
  }
});

// Lancer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook actif sur http://localhost:${PORT}`);
});
