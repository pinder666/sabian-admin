// predict_innovation_client.js

import axios from 'axios';

const API_URL = 'http://localhost:5022/predict_innovation';

async function getInnovationPrediction(inputData) {
  try {
    const response = await axios.post(API_URL, inputData);
    console.log('Prediction Result:', response.data);
  } catch (error) {
    console.error('Error making prediction:', error.response ? error.response.data : error.message);
  }
}

const exampleInput = {
  tech_adoption: 0.8,        // Tech adoption rate (0–1)
  r_and_d_spending: 3.5,     // R&D spending % of GDP
  education_index: 0.77,     // Education Index (0–1)
  startup_activity: 0.6,     // Startup activity index (0–1)
  patent_applications: 250,  // Number of patent applications
  government_support: 0.7    // Government support index (0–1) ✅ ADDED
};

getInnovationPrediction(exampleInput);
