import fetch from 'node-fetch';

const url = 'http://127.0.0.1:5007/predict_jobs';

const data = {
    'GDP': 12000,
    'Education_Spending': 3000,
    'Infrastructure_Spending': 5000
};

async function predictJobs() {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('Predicted Jobs Created:', result.Predicted_Jobs);
}

predictJobs();
