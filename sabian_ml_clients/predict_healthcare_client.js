// predict_healthcare_client.js

import axios from 'axios';


// Replace with the correct API URL for Healthcare Access server
const API_URL = 'http://localhost:5016/predict_healthcare';

async function getHealthcareAccessPrediction(inputData) {
  try {
    const response = await axios.post(API_URL, inputData);
    console.log('Prediction Result:', response.data);
  } catch (error) {
    console.error('Error making prediction:', error.message);
  }
}

// Example usage:
const exampleInput = {
  region: "Southern Africa",
  healthcare_spending: 7.5, // % of GDP
  doctor_density: 1.2,      // Doctors per 1,000 people
  hospital_beds: 2.5,        // Beds per 1,000 people
  urban_population_pct: 62.0, // Urban population %
  education_index: 0.68      // Education Index score
};

getHealthcareAccessPrediction(exampleInput);
