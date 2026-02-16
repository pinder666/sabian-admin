import fetch from 'node-fetch';

const url = 'http://127.0.0.1:5012/predict_conflict';

const data = {
    'Unemployment_Rate': 12.5,
    'Poverty_Rate': 30.0,
    'Political_Instability_Index': 4.2
};

async function predictConflictRisk() {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('Predicted Conflict Risk (%):', result.Predicted_Conflict_Risk);
}

predictConflictRisk();
