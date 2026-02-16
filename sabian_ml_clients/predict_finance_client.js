// predict_finance_client.js

import axios from 'axios';

const API_URL = 'http://localhost:5021/predict_finance';

async function getFinancePrediction(inputData) {
  try {
    const response = await axios.post(API_URL, inputData);
    console.log('Prediction Result:', response.data);
  } catch (error) {
    console.error('Error making prediction:', error.response ? error.response.data : error.message);
  }
}

// Final input with all required keys
const exampleInput = {
  gdp_growth: 3.5,
  inflation_rate: 2.0,
  interest_rate: 1.5,
  credit_access_index: 0.7,
  investment_flow: 20.0,
  exchange_rate: 15.2 // Add this line
};

getFinancePrediction(exampleInput);
