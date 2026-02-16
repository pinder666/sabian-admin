// predict_economy_client.js

import axios from 'axios';

const API_URL = 'http://localhost:5017/predict_economy';

async function getEconomyPrediction(inputData) {
  try {
    const response = await axios.post(API_URL, inputData);
    console.log('Prediction Result:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Error making prediction:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Example usage:
const exampleInput = {
  gdp: 25000,               // GDP in millions
  export_growth: 5.0,        // Export growth %
  inflation_rate: 2.5,       // Inflation %
  interest_rate: 3.5,        // Interest rate %
  population_growth: 1.2,    // Population growth %
  unemployment_rate: 5.5,    // Unemployment rate %
  investment_rate: 22.0      // Investment as % of GDP
};

getEconomyPrediction(exampleInput);
