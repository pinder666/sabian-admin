import fetch from 'node-fetch';

const url = 'http://localhost:5023/predict_crime';

const data = {
  unemployment_rate: 6.5,
  poverty_rate: 18.0,
  police_presence_index: 0.7,
  education_index: 0.72,
  urban_density: 3000
};

async function predictCrimeRate() {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await response.json();
  console.log('Predicted Crime Rate:', result.predicted_crime_rate);
}

predictCrimeRate();
