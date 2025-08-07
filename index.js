const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Function to normalize text (lowercase and remove accents)
const normalizeString = (str) => {
  return str
    .toLowerCase() // Make everything lowercase
    .normalize('NFD') // Unicode normalization
    .replace(/[\u0300-\u036f]/g, ''); // Remove accents
};

// Main webhook
app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    const context = req.body.queryResult.outputContexts.find(context => context.name.includes('show-attractions'));

    if (intentName === 'Ask_All_Attractions') {
      const response = await axios.get('https://touristeproject.onrender.com/api/public/getAll/Attraction');
      const attractions = response.data;

      if (!Array.isArray(attractions) || attractions.length === 0) {
        return res.json({ fulfillmentText: "I couldn't find any attractions for you. data base is empty!" });
      }

      // Show the first 5 attractions
      const firstFive = attractions.slice(0, 5).map(a => `- ${a.name}`).join('\n');
      const reply = `Here are some attractions:\n${firstFive}\n\nWould you like to see more?`;

      // Create context to keep track of the current page
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

    if (intentName === 'See_more_attractions') {
      const response = await axios.get('https://touristeproject.onrender.com/api/public/getAll/Attraction');
      const attractions = response.data;

      if (!Array.isArray(attractions) || attractions.length <= 5) {
        return res.json({ fulfillmentText: "There are no more attractions to show.data base only have this!" });
      }

      // Check current page from context
      const currentPage = context ? context.parameters.page : 1;
      const nextFive = attractions.slice(currentPage * 5, (currentPage + 1) * 5).map(a => `- ${a.name}`).join('\n');

      // Update the page
      const newPage = currentPage + 1;
      const reply = `Here are some more attractions:\n${nextFive}`;

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

      // Get all attractions
      const response = await axios.get('https://touristeproject.onrender.com/api/public/getAll/Attraction');
      const attractions = response.data;

      // Normalize the entered attraction name
      const normalizedAttractionName = normalizeString(attractionName);
      const attraction = attractions.find(a => normalizeString(a.name) === normalizedAttractionName);

      if (!attraction) {
        return res.json({ fulfillmentText: `Sorry, I couldn't find an attraction named "${attractionName}". Maybe try typing the name more correctly?` });
      }

      const id = attraction.id_Location;
      const detailRes = await axios.get(`https://touristeproject.onrender.com/api/public/getLocationById/${id}`);
      const details = detailRes.data;

      // Build the response with name, city, and description
      const reply = {
        fulfillmentText: `Here are the details for ${details.name} (${details.cityName}):\n📍 City: ${details.cityName}\n💰 Entry Fee: ${details.entryFee}\n📖 Description: ${details.description}`,
        fulfillmentMessages: [
          {
            platform: "ACTIONS_ON_GOOGLE", // For mobile app display
            payload: {
              google: {
                "richResponse": {
                  "items": [
                    {
                      "carouselBrowse": {
                        "items": details.images.map(image => ({
                          "title": `Image of ${details.name}`,
                          "openUrlAction": {
                            "url": image  // URL of the image to display in the carousel
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
                        "textToSpeech": `See ${details.name} on the map.`
                      }
                    },
                    {
                      "suggestions": {
                        "suggestions": [
                          {
                            "title": "View on the map",
                            "action": {
                              "url": `https://www.google.com/maps?q=${details.latitude},${details.longitude}` // Link to Google Maps
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

    // Default response if no intent recognized
    return res.json({ fulfillmentText: "Sorry, I didn't understand your request." });

  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.json({ fulfillmentText: 'Error retrieving attractions.' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook is running on http://localhost:${PORT}`);
});
