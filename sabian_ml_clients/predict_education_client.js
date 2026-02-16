import fetch from 'node-fetch';

const url = 'http://127.0.0.1:5015/predict_education';

const data = {
    'Government_Education_Spending': 5000,
    'Literacy_Rate': 85.0,
    'Internet_Access_Schools': 60.0
};

async function predictEducationIndex() {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('Predicted Education Index Score:', result.Predicted_Education_Index);
}

predictEducationIndex();
