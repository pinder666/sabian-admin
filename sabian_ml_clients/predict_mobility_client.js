import axios from 'axios';

const API_URL = 'http://localhost:5025/predict_mobility';

async function loopForever() {
  while (true) {
    try {
      const inputData = {
        population_density: 1000,
        vehicle_ownership: 0.7,
        public_transport_usage: 0.5
      };

      const response = await axios.post(API_URL, inputData);
      console.log('Prediction:', response.data);
    } catch (error) {
      console.error('Error:', error.message);
    }

    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 sec delay
  }
}

loopForever();
