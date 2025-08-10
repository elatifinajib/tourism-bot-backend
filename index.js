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

    // ----------- Gérer les Attractions -----------

    // Si l'intent est "Ask_All_Attractions"
    if (intentName === 'Ask_All_Attractions') {
      const { data: attractions } = await axios.get(`${BASE_URL}/getAll/Attraction`);

      if (!Array.isArray(attractions) || attractions.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any attractions for you." });
      }

      // On liste toutes les attractions avec le symbole d'attraction
      const list = attractions.map(a => `🌟 ${a.name} (${a.cityName})`).join('\n');
      const reply = `Discover the best attractions around! Here are some of the top spots:\n${list}\n`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // Si l'intent est "Ask_Natural_Attractions"
    if (intentName === 'Ask_Natural_Attractions') {
      const { data: naturalAttractions } = await axios.get(`${BASE_URL}/NaturalAttractions`);

      if (!Array.isArray(naturalAttractions) || naturalAttractions.length === 0) {
        return res.json({ fulfillmentText: "I couldn't find any natural wonders for you." });
      }

      // On liste toutes les attractions naturelles avec le symbole d'attraction naturelle
      const list = naturalAttractions.map(a => `🌿 ${a.name} (${a.cityName})`).join('\n');
      const reply = `If you love nature, you're in for a treat! Check out these amazing natural attractions:\n${list}\n`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
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
      const reply = `Step back in time and explore some incredible historical sites! Here are some top recommendations:\n${list}\n`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
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
      const reply = `Get ready to immerse yourself in rich culture! Here are some of the best cultural attractions:\n${list}\n`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
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
      const reply = `Check out these stunning artificial wonders! Here's what you can explore:\n${list}\n`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // ----------- Gérer les Amenities -----------

    // Si l'intent est "Ask_All_Amenities"
    if (intentName === 'Ask_All_Amenities') {
      const { data: amenities } = await axios.get(`${BASE_URL}/getAll/Amenities`);

      if (!Array.isArray(amenities) || amenities.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any amenities for you." });
      }

      // On liste toutes les amenities avec le nom et la ville
      const list = amenities.map(a => `🏨 ${a.name} (${a.cityName})`).join('\n');
      const reply = `Here are some amenities that can enhance your visit:\n${list}\nThese places offer great services to make your experience unforgettable!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // Si l'intent est "Ask_Restaurants"
    if (intentName === 'Ask_Restaurants') {
      const { data: restaurants } = await axios.get(`${BASE_URL}/Restaurants`);

      if (!Array.isArray(restaurants) || restaurants.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any restaurants for you." });
      }

      // On liste tous les restaurants avec le symbole d'attraction
      const list = restaurants.map(r => `🍽️ ${r.name} (${r.cityName})`).join('\n');
      const reply = `Looking for a great place to eat? Here are some top restaurants:\n${list}\nEnjoy your meal!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // ----------- Gérer les Cafés -----------

    // Si l'intent est "Ask_Cafes"
    if (intentName === 'Ask_Cafes') {
      const { data: cafes } = await axios.get(`${BASE_URL}/Cafes`);

      if (!Array.isArray(cafes) || cafes.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any cafes for you." });
      }

      // On liste tous les cafés avec le symbole
      const list = cafes.map(c => `☕ ${c.name} (${c.cityName})`).join('\n');
      const reply = `Looking for a cozy place to relax? Here are some popular cafes:\n${list}\nEnjoy your coffee!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // ----------- Gérer les Campings -----------

    // Si l'intent est "Ask_Campings"
    if (intentName === 'Ask_Campings') {
      const { data: campings } = await axios.get(`${BASE_URL}/Camping`);

      if (!Array.isArray(campings) || campings.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any campgrounds for you." });
      }

      // On liste tous les campings avec le symbole
      const list = campings.map(c => `🏕️ ${c.name} (${c.cityName})`).join('\n');
      const reply = `Ready to explore the great outdoors? Here are some beautiful camping spots:\n${list}\nHappy camping!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // ----------- Gérer les Guest Houses -----------

    // Si l'intent est "Ask_GuestHouses"
    if (intentName === 'Ask_GuestHouses') {
      const { data: guestHouses } = await axios.get(`${BASE_URL}/GuestHouses`);

      if (!Array.isArray(guestHouses) || guestHouses.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any guest houses for you." });
      }

      // On liste toutes les guest houses avec le symbole
      const list = guestHouses.map(g => `🏡 ${g.name} (${g.cityName})`).join('\n');
      const reply = `Looking for a homey stay? Here are some lovely guest houses:\n${list}\nEnjoy your stay!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // ----------- Gérer les Hotels -----------

    // Si l'intent est "Ask_Hotels"
    if (intentName === 'Ask_Hotels') {
      const { data: hotels } = await axios.get(`${BASE_URL}/Hotels`);

      if (!Array.isArray(hotels) || hotels.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any hotels for you." });
      }

      // On liste tous les hôtels avec le symbole
      const list = hotels.map(h => `🏨 ${h.name} (${h.cityName})`).join('\n');
      const reply = `Here are some of the best hotels for your stay:\n${list}\nEnjoy your luxurious stay!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // ----------- Gérer les Lodges -----------

    // Si l'intent est "Ask_Lodges"
    if (intentName === 'Ask_Lodges') {
      const { data: lodges } = await axios.get(`${BASE_URL}/Lodges`);

      if (!Array.isArray(lodges) || lodges.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any lodges for you." });
      }

      // On liste tous les lodges avec le symbole
      const list = lodges.map(l => `🏞️ ${l.name} (${l.cityName})`).join('\n');
      const reply = `Escape into nature and stay at these amazing lodges:\n${list}\nEnjoy your stay in nature!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    

    // Réponse par défaut
    return res.json({ fulfillmentText: "Sorry, I didn't understand your request. Please let me know what you're looking for!" });

  } catch (error) {
    console.error('Webhook error:', error?.message);
    return res.json({ fulfillmentText: 'Oops, something went wrong while fetching information. Please try again later!' });
  }
});

// Démarrage serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook is running on http://localhost:${PORT}`);
});
