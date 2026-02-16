const fetch = require('node-fetch');

// Example growth factors
const growthData = {
    Marketing_Spend: 12000,
    Product_Launches: 2,
    Customer_Reviews: 85,
    Market_Expansion: 3
};

// Send POST request to Sabian ML API (growth model)
async function getPredictedGrowth() {
    const response = await fetch('http://127.0.0.1:5006/predict_growth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(growthData)
    });

    const result = await response.json();
    console.log('Predicted Growth Rate (%):', result.Predicted_Growth);
}

getPredictedGrowth();
