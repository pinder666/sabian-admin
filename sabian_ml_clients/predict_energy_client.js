import fetch from 'node-fetch';

const url = 'http://127.0.0.1:5009/predict_energy';

const data = {
    'Solar_Capacity': 1500,
    'Wind_Capacity': 1200,
    'Hydro_Capacity': 800
};

async function predictEnergyProduction() {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('Predicted Energy Production (MW):', result.Predicted_Energy_Production);
}

predictEnergyProduction();
