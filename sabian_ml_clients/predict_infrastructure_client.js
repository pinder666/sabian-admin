import fetch from 'node-fetch';

const url = 'http://127.0.0.1:5013/predict_infrastructure';

const data = {
    'Road_Condition_Index': 6.5,
    'Electricity_Access_Rate': 75.0,
    'Internet_Penetration_Rate': 45.0
};

async function predictInfrastructureRisk() {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('Predicted Infrastructure Risk (%):', result.Predicted_Infrastructure_Risk);
}

predictInfrastructureRisk();
