import axios from 'axios';

const brains = [
  {
    name: 'Agriculture',
    url: 'http://localhost:5008/predict_agriculture',
    input: {
      fertilizer_use: 50,
      irrigation_rate: 70,
      crop_diversity: 3,
      rural_population: 20000,
      agriculture_spending: 150000
    }
  },
  {
    name: 'Climate',
    url: 'http://localhost:5014/predict_climate',
    input: {
      Average_Temperature: 28.5,
      Rainfall_mm: 120.0,
      CO2_Emissions_per_Capita: 4.2
    }
  },
  {
    name: 'Conflict',
    url: 'http://localhost:5012/predict_conflict',
    input: {
      Unemployment_Rate: 12.5,
      Poverty_Rate: 30.0,
      Political_Instability_Index: 4.2
    }
  },
  {
    name: 'Economy',
    url: 'http://localhost:5017/predict_economy',
    input: {
      gdp: 25000,
      export_growth: 5.0,
      inflation_rate: 2.5,
      interest_rate: 3.5,
      population_growth: 1.2,
      unemployment_rate: 5.5,
      investment_rate: 22.0
    }
  },
  {
    name: 'Education',
    url: 'http://localhost:5015/predict_education',
    input: {
      Government_Education_Spending: 5000,
      Literacy_Rate: 85.0,
      Internet_Access_Schools: 60.0
    }
  },
  {
    name: 'Employment',
    url: 'http://localhost:5018/predict_employment',
    input: {
      education_level: 0.75,
      economic_growth: 3.5,
      population_growth: 1.2,
      technology_access: 70.0,
      urbanization_rate: 65.0
    }
  },
  {
    name: 'Energy',
    url: 'http://localhost:5009/predict_energy',
    input: {
      Solar_Capacity: 1500,
      Wind_Capacity: 1200,
      Hydro_Capacity: 800
    }
  },
  {
    name: 'Finance',
    url: 'http://localhost:5021/predict_finance',
    input: {
      gdp_growth: 3.5,
      inflation_rate: 2.0,
      interest_rate: 1.5,
      credit_access_index: 0.7,
      investment_flow: 20.0,
      exchange_rate: 15.2
    }
  },
  {
    name: 'Growth',
    url: 'http://localhost:5006/predict_growth',
    input: {
      Marketing_Spend: 12000,
      Product_Launches: 2,
      Customer_Reviews: 85,
      Market_Expansion: 3
    }
  },
  {
    name: 'Healthcare',
    url: 'http://localhost:5016/predict_healthcare',
    input: {
      region: "Southern Africa",
      healthcare_spending: 7.5,
      doctor_density: 1.2,
      hospital_beds: 2.5,
      urban_population_pct: 62.0,
      education_index: 0.68
    }
  },
  {
    name: 'Infrastructure',
    url: 'http://localhost:5013/predict_infrastructure',
    input: {
      Road_Condition_Index: 6.5,
      Electricity_Access_Rate: 75.0,
      Internet_Penetration_Rate: 45.0
    }
  },
  {
    name: 'Innovation',
    url: 'http://localhost:5022/predict_innovation',
    input: {
      tech_adoption: 0.8,
      r_and_d_spending: 3.5,
      education_index: 0.77,
      startup_activity: 0.6,
      patent_applications: 250,
      government_support: 0.7
    }
  },
  {
    name: 'Investment',
    url: 'http://localhost:5010/predict_investment',
    input: {
      GDP_Growth_Rate: 5.5,
      Inflation_Rate: 2.1,
      Interest_Rate: 3.0
    }
  },
  {
    name: 'Jobs',
    url: 'http://localhost:5007/predict_jobs',
    input: {
      GDP: 12000,
      Education_Spending: 3000,
      Infrastructure_Spending: 5000
    }
  },
  {
    name: 'Mobility',
    url: 'http://localhost:5025/predict_mobility',
    input: {
      population_density: 1000,
      vehicle_ownership: 0.7,
      public_transport_usage: 0.5
    }
  },
  {
    name: 'Poverty',
    url: 'http://localhost:5011/predict_poverty',
    input: {
      GDP_Growth_Rate: 4.5,
      Education_Spending: 2500,
      Health_Spending: 3000
    }
  },
  {
    name: 'Revenue',
    url: 'http://localhost:5005/predict_revenue',
    input: {
      Expenses: 9000,
      Customers: 240,
      New_Customers: 65
    }
  },
  {
    name: 'Security',
    url: 'http://localhost:5023/predict_security',
    input: {
      crime_rate: 4.5,
      police_per_1000: 2.8,
      surveillance_index: 0.65,
      education_index: 0.72,
      urbanization_rate: 68.0
    }
  },
  {
    name: 'Tourism',
    url: 'http://localhost:5019/predict_tourism',
    input: {
      gdp_growth: 4.0,
      urbanization_rate: 70.0,
      healthcare_index: 0.7,
      education_index: 0.75,
      security_index: 0.8,
      infrastructure_quality: 0.85,
      natural_attractions: 0.9,
      safety_index: 0.78,
      marketing_spend: 2.5
    }
  },
  {
    name: 'Trade',
    url: 'http://localhost:5008/predict_trade',
    input: {
      Exports: 5000,
      Imports: 3000,
      Trade_Agreements: 5
    }
  },
  {
    name: 'Crime',
    url: 'http://localhost:5023/predict_crime',
    input: {
      unemployment_rate: 6.5,
      poverty_rate: 18.0,
      police_presence_index: 0.7,
      education_index: 0.72,
      urban_density: 3000
    }
  }
];

async function loopBrains() {
  while (true) {
    for (const brain of brains) {
      try {
        console.log(`Sending to ${brain.name} at ${brain.url}...`);
        const response = await axios.post(brain.url, brain.input);
        console.log(`${brain.name} Prediction:`, response.data);
      } catch (error) {
        console.error(`Error with ${brain.name}:`, error.message);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

loopBrains();
