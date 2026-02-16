// predict_agriculture_client.js

import axios from 'axios';

// API URL for Agriculture server
const API_URL = 'http://localhost:5020/predict_agriculture';

async function getAgriculturePrediction(inputData) {
  try {
    const response = await axios.post(API_URL, inputData);
    console.log('Prediction Result:', response.data);
  } catch (error) {
    console.error('Error making prediction:', error.response ? error.response.data : error.message);
  }
}

// Updated example input:
const exampleInput = {
  irrigation_rate: 60.0,         // %
  crop_diversity: 0.8,           // 0–1 scale
  rural_population: 45.0,        // %
  fertilizer_use: 120.0,         // kg per hectare
  agriculture_spending: 8.0      // % of GDP
};

getAgriculturePrediction(exampleInput);
