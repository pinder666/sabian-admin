// predict_employment_client.js

import axios from 'axios';

const API_URL = 'http://localhost:5018/predict_employment';

async function getEmploymentPrediction(inputData) {
  try {
    const response = await axios.post(API_URL, inputData);
    console.log('Prediction Result:', response.data);
  } catch (error) {
    console.error('Error making prediction:', error.response?.data || error.message);
  }
}

// Example usage:
const exampleInput = {
  education_level: 0.75,      // Education Index (0–1)
  economic_growth: 3.5,       // GDP growth (%)
  population_growth: 1.2,     // Population growth (%)
  technology_access: 70.0,    // % of people with internet/mobile access
  urbanization_rate: 65.0     // Urbanization (%)
};

getEmploymentPrediction(exampleInput);
