const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;

    if (intentName === 'Ask_All_Attractions') {
  const response = await axios.get('https://touristeproject.onrender.com/api/public/getAll/Attraction');
  const attractions = response.data;

  if (!Array.isArray(attractions) || attractions.length === 0) {
    return res.json({ fulfillmentText: 'Aucune attraction trouvée.' });
  }

  // Stocker les résultats en mémoire temporaire (ici : on prend toujours les 5 premiers pour l'exemple)
  const firstFive = attractions.slice(0, 5)
    .map((a, index) => `- ${a.name}`)
    .join('\n');

  const reply = `Voici quelques attractions :\n${firstFive}\n\nVoulez-vous en voir plus ?`;

  return res.json({ fulfillmentText: reply });
}


  } catch (error) {
    console.error('Erreur webhook:', error.message);
    return res.json({ fulfillmentText: 'Erreur lors de la récupération des attractions.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook actif sur http://localhost:${PORT}`);
});
