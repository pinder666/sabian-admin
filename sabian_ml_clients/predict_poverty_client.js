import fetch from 'node-fetch';

const url = 'http://127.0.0.1:5011/predict_poverty';

const data = {
    'GDP_Growth_Rate': 4.5,
    'Education_Spending': 2500,
    'Health_Spending': 3000
};

async function predictPovertyReduction() {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('Predicted Poverty Reduction (%):', result.Predicted_Poverty_Reduction);
}

predictPovertyReduction();
