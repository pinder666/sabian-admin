// predict_tourism_client.js

import axios from 'axios';

// Correct API URL for Tourism server
const API_URL = 'http://localhost:5019/predict_tourism';

async function getTourismPrediction(inputData) {
  try {
    const response = await axios.post(API_URL, inputData);
    console.log('Prediction Result:', response.data);
  } catch (error) {
    console.error('Error making prediction:', error.response ? error.response.data : error.message);
  }
}

// Example usage:
const exampleInput = {
  gdp_growth: 4.0,              // GDP growth (%)
  urbanization_rate: 70.0,      // Urbanization (%)
  healthcare_index: 0.7,        // Healthcare Index (0–1)
  education_index: 0.75,        // Education Index (0–1)
  security_index: 0.8,          // Security Index (0–1)
  infrastructure_quality: 0.85, // Infrastructure Quality (0–1)
  natural_attractions: 0.9,     // Natural Attractions Score (0–1)
  safety_index: 0.78,           // Safety Index (0–1)
  marketing_spend: 2.5          // Marketing spend (as % of GDP) ✅ newly added
};

getTourismPrediction(exampleInput);
