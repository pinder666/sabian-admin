import fetch from 'node-fetch';

const url = 'http://127.0.0.1:5014/predict_climate';

const data = {
    'Average_Temperature': 28.5,
    'Rainfall_mm': 120.0,
    'CO2_Emissions_per_Capita': 4.2
};
async function predictClimateImpact() {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('Predicted Climate Impact Score:', result.Predicted_Climate_Impact);
}

predictClimateImpact();
