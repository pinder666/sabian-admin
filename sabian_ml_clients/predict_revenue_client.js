const fetch = require('node-fetch');

// Example business data
const businessData = {
    Expenses: 9000,
    Customers: 240,
    New_Customers: 65
};

// Send POST request to Sabian ML API
async function getPredictedRevenue() {
    const response = await fetch('http://127.0.0.1:5005/predict_revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(businessData)
    });

    const result = await response.json();
    console.log('Predicted Revenue:', result.Predicted_Revenue);
}

getPredictedRevenue();
