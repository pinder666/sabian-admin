 // predict_security_client.js

import axios from 'axios';

const API_URL = 'http://localhost:5023/predict_security';

async function getSecurityPrediction(inputData) {
  try {
    const response = await axios.post(API_URL, inputData);
    console.log('Prediction Result:', response.data);
  } catch (error) {
    console.error('Error making prediction:', error.response ? error.response.data : error.message);
  }
}

// Example input
const exampleInput = {
  crime_rate: 4.5,              // Crimes per 1,000 people
  police_per_1000: 2.8,         // Officers per 1,000
  surveillance_index: 0.65,     // Surveillance effectiveness (0–1)
  education_index: 0.72,        // Education Index (0–1)
  urbanization_rate: 68.0       // Urban population percentage
};

getSecurityPrediction(exampleInput);
