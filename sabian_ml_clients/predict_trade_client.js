import fetch from 'node-fetch';

const url = 'http://127.0.0.1:5008/predict_trade';

const data = {
    'Exports': 5000,
    'Imports': 3000,
    'Trade_Agreements': 5
};

async function predictTradeBalance() {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('Predicted Trade Balance:', result.Predicted_Trade_Balance);
}

predictTradeBalance();
