const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  try {
    const response = await axios.get('https://touristeproject.onrender.com/api/public/getAll/Attraction');
    const attractions = response.data;

    if (!attractions.length) {
      return res.json({ fulfillmentText: 'Aucune attraction trouvée.' });
    }

    const names = attractions.map(a => a.name).slice(0, 5).join(', ');
    const reply = `Voici quelques attractions : ${names}`;

    res.json({ fulfillmentText: reply });
  } catch (err) {
    console.error(err);
    res.json({ fulfillmentText: 'Erreur lors de la récupération des attractions.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook actif sur http://localhost:${PORT}`);
});
