import fetch from 'node-fetch';

const url = 'http://127.0.0.1:5010/predict_investment';

const data = {
    'GDP_Growth_Rate': 5.5,
    'Inflation_Rate': 2.1,
    'Interest_Rate': 3.0
};

async function predictInvestment() {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('Predicted Investment Amount (in millions):', result.Predicted_Investment);
}

predictInvestment();
