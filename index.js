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


    // ----------- Gérer les Activities -----------

    // Si l'intent est "Ask_All_Activities"
    if (intentName === 'Ask_All_Activities') {
      const { data: activities } = await axios.get(`${BASE_URL}/getAll/Activities`);

      if (!Array.isArray(activities) || activities.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any activities for you." });
      }

      // On liste toutes les activités avec le symbole
      const list = activities.map(a => `🎉 ${a.name} `).join('\n');
      const reply = `Looking for fun things to do? Here are some exciting activities to try:\n${list}\nHave a great time!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

     // ----------- Gérer les Activités Traditionnelles -----------

    // Si l'intent est "Ask_Traditional_Activities"
    if (intentName === 'Ask_Traditional_Activities') {
      const { data: traditionalActivities } = await axios.get(`${BASE_URL}/Activity/Traditional`);

      if (!Array.isArray(traditionalActivities) || traditionalActivities.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any traditional activities for you." });
      }

      // On liste toutes les activités traditionnelles avec le symbole
      const list = traditionalActivities.map(a => `🎉 ${a.name} `).join('\n');
      const reply = `Want to experience some local traditions? Check out these amazing traditional activities:\n${list}\nEnjoy the experience!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // ----------- Gérer les Activités Sportives -----------

    // Si l'intent est "Ask_Sports_Activities"
    if (intentName === 'Ask_Sports_Activities') {
      const { data: sportsActivities } = await axios.get(`${BASE_URL}/Activity/Sports`);

      if (!Array.isArray(sportsActivities) || sportsActivities.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any sports activities for you." });
      }

      // On liste toutes les activités sportives avec le symbole
      const list = sportsActivities.map(a => `🏃‍♂️ ${a.name} `).join('\n');
      const reply = `Looking for some action? Here are the best sports activities to enjoy:\n${list}\nGet ready to move!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // ----------- Gérer les Activités Culturelles -----------

    // Si l'intent est "Ask_Cultural_Activities"
    if (intentName === 'Ask_Cultural_Activities') {
      const { data: culturalActivities } = await axios.get(`${BASE_URL}/Activity/Cultural`);

      if (!Array.isArray(culturalActivities) || culturalActivities.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any cultural activities for you." });
      }

      // On liste toutes les activités culturelles avec le symbole
      const list = culturalActivities.map(a => `🎭 ${a.name} `).join('\n');
      const reply = `Immerse yourself in culture! Here are some wonderful cultural activities:\n${list}\nEnjoy the rich heritage!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // ----------- Gérer les Activités d'Aventure -----------

    // Si l'intent est "Ask_Adventure_Activities"
    if (intentName === 'Ask_Adventural_Activities') {
      const { data: adventureActivities } = await axios.get(`${BASE_URL}/Activity/Adventure`);

      if (!Array.isArray(adventureActivities) || adventureActivities.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any adventure activities for you." });
      }

      // On liste toutes les activités d'aventure avec le symbole
      const list = adventureActivities.map(a => `🏞️ ${a.name} `).join('\n');
      const reply = `Are you ready for some adventure? Here are some thrilling activities:\n${list}\nTime for an adventure!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // ----------- Gérer les Ancillary Services -----------

    // Si l'intent est "Ask_All_AncillaryServices"
    if (intentName === 'Ask_All_AncillaryServices') {
      const { data: ancillaryServices } = await axios.get(`${BASE_URL}/getAll/AncillaryService`);

      if (!Array.isArray(ancillaryServices) || ancillaryServices.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any ancillary services for you." });
      }

      // On liste tous les services auxiliaires avec le symbole d'attraction
      const list = ancillaryServices.map(service => `🛠️ ${service.name} (${service.cityName})`).join('\n');
      const reply = `Here are some additional services that can enhance your experience:\n${list}\nThese services will make your trip even better!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // Si l'intent est "Ask_All_TourGuide"
    if (intentName === 'Ask_All_TourGuide') {
      const { data: tourGuides } = await axios.get(`${BASE_URL}/Service/TourGuide`);

      if (!Array.isArray(tourGuides) || tourGuides.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any tour guides for you." });
      }

      // On liste tous les guides touristiques avec le symbole
      const list = tourGuides.map(guide => `👨‍🏫 ${guide.name} (${guide.cityName})`).join('\n');
      const reply = `Looking for a local guide? Here are some experienced tour guides:\n${list}\nThey'll make your visit even more special!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // Si l'intent est "Ask_All_Sanitary"
    if (intentName === 'Ask_All_Sanitary') {
      const { data: sanitaryServices } = await axios.get(`${BASE_URL}/Service/Sanitary`);

      if (!Array.isArray(sanitaryServices) || sanitaryServices.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any sanitary services for you." });
      }

      // On liste tous les services sanitaires avec le symbole
      const list = sanitaryServices.map(service => `💧 ${service.name} (${service.cityName})`).join('\n');
      const reply = `Here are some sanitary services available for you:\n${list}\nStay healthy during your trip!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // Si l'intent est "Ask_All_CarAgency"
    if (intentName === 'Ask_All_CarAgency') {
      const { data: carAgencies } = await axios.get(`${BASE_URL}/Service/CarAgency`);

      if (!Array.isArray(carAgencies) || carAgencies.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any car agencies for you." });
      }

      // On liste toutes les agences de location de voitures avec le symbole
      const list = carAgencies.map(agency => `🚗 ${agency.name} (${agency.cityName})`).join('\n');
      const reply = `Here are some car rental agencies to help you get around:\n${list}\nDrive safely!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // Si l'intent est "Ask_All_Administratives"
    if (intentName === 'Ask_All_Administratives') {
      const { data: administrativeServices } = await axios.get(`${BASE_URL}/Service/Administrative`);

      if (!Array.isArray(administrativeServices) || administrativeServices.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any administrative services for you." });
      }

      // On liste tous les services administratifs avec le symbole
      const list = administrativeServices.map(service => `📑 ${service.name} (${service.cityName})`).join('\n');
      const reply = `Here are some administrative services you may need:\n${list}\nGet all the help you need!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // Si l'intent est "Ask_All_Banks"
    if (intentName === 'Ask_All_Banks') {
      const { data: banks } = await axios.get(`${BASE_URL}/Service/Bank`);

      if (!Array.isArray(banks) || banks.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any banks for you." });
      }

      // On liste toutes les banques avec le symbole
      const list = banks.map(bank => `🏦 ${bank.name} (${bank.cityName})`).join('\n');
      const reply = `Here are some banks where you can manage your finances:\n${list}\nFeel free to visit one!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }
    // ----------- Gérer les Accessibilités -----------

    // Si l'intent est "Ask_All_Accessibilities"
    if (intentName === 'Ask_All_Accessibilities') {
      const { data: accessibilities } = await axios.get(`${BASE_URL}/getAll/Accessibility`);

      if (!Array.isArray(accessibilities) || accessibilities.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any accessibility services for you." });
      }

      // On liste toutes les accessibilités avec le symbole d'accessibilité
      const list = accessibilities.map(a => `♿ ${a.name} (${a.cityName})`).join('\n');
      const reply = `Here are some accessibility services to make your visit more comfortable:\n${list}\nLet me know if you need more details!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // Si l'intent est "Ask_All_Bus"
    if (intentName === 'Ask_All_Bus') {
      const { data: buses } = await axios.get(`${BASE_URL}/Bus`);

      if (!Array.isArray(buses) || buses.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any bus services for you." });
      }

      // On liste tous les services de bus avec le symbole
      const list = buses.map(bus => `🚌 ${bus.name} (${bus.cityName})`).join('\n');
      const reply = `Looking for buses? Here are some bus services you can use:\n${list}\nSafe travels!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // Si l'intent est "Ask_All_Fly"
    if (intentName === 'Ask_All_Fly') {
      const { data: flights } = await axios.get(`${BASE_URL}/Fly`);

      if (!Array.isArray(flights) || flights.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any flight services for you." });
      }

      // On liste tous les services de vols avec le symbole
      const list = flights.map(flight => `✈️ ${flight.name} (${flight.cityName})`).join('\n');
      const reply = `Need a flight? Here are some flight services to get you to your destination:\n${list}\nSafe travels!`;

      return res.json({
        fulfillmentText: reply,
        fulfillmentMessages: [
          { text: { text: [reply] } }
        ]
      });
    }

    // Si l'intent est "Ask_All_Taxi"
    if (intentName === 'Ask_All_Taxi') {
      const { data: taxis } = await axios.get(`${BASE_URL}/Taxi`);

      if (!Array.isArray(taxis) || taxis.length === 0) {
        return res.json({ fulfillmentText: "Sorry, I couldn't find any taxi services for you." });
      }

      // On liste tous les services de taxi avec le symbole
      const list = taxis.map(taxi => `🚖 ${taxi.name} (${taxi.cityName})`).join('\n');
      const reply = `Looking for a taxi? Here are some reliable taxi services:\n${list}\nHop in and enjoy your ride!`;

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
