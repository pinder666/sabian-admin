import csv
import json
import re

# 🚀 SABIAN AUTO-ROUTER v10B — Enterprise Intelligence Layer
# World-class sector detection engine for any uploaded file.
# Scans column headers for 100+ keywords across business, healthcare, EV, supply chain, finance, law, and beyond.

MODULE_MAP = {
    # Healthcare Intelligence
    "patient": "health_boardroom", "diagnosis": "health_boardroom", "claim": "health_boardroom",
    "treatment": "health_boardroom", "ehr": "health_boardroom", "cpt": "health_boardroom",
    "icd": "health_boardroom", "visit": "health_boardroom", "clinical": "health_boardroom",
    
    # EV & Automotive Intelligence
    "ev": "ev_boardroom", "vehicle": "ev_boardroom", "battery": "ev_boardroom",
    "charging": "ev_boardroom", "range": "ev_boardroom", "vin": "ev_boardroom",
    "torque": "ev_boardroom", "motor": "ev_boardroom",

    # Mining, Energy & Raw Materials
    "ore": "mining_boardroom", "lithium": "mining_boardroom", "nickel": "mining_boardroom",
    "cobalt": "mining_boardroom", "mine": "mining_boardroom", "refinery": "mining_boardroom",
    "extraction": "mining_boardroom", "commodity": "mining_boardroom",

    # Logistics, Freight, Trade
    "shipment": "logistics_boardroom", "freight": "logistics_boardroom", "customs": "logistics_boardroom",
    "tariff": "logistics_boardroom", "warehouse": "logistics_boardroom", "carrier": "logistics_boardroom",
    "logistics": "logistics_boardroom", "port": "logistics_boardroom",

    # Finance, Banking, Capital Markets
    "revenue": "finance_boardroom", "profit": "finance_boardroom", "loss": "finance_boardroom",
    "p&l": "finance_boardroom", "balance": "finance_boardroom", "loan": "finance_boardroom",
    "equity": "finance_boardroom", "bank": "finance_boardroom", "capital": "finance_boardroom",
    "stock": "finance_boardroom", "dividend": "finance_boardroom", "forecast": "finance_boardroom",

    # Insurance & Actuarial
    "insurance": "insurance_boardroom", "policy": "insurance_boardroom", "premium": "insurance_boardroom",
    "underwriting": "insurance_boardroom", "adjuster": "insurance_boardroom", "risk": "insurance_boardroom",
    "claim amount": "insurance_boardroom",

    # Sales Intelligence
    "lead": "sales_boardroom", "crm": "sales_boardroom", "deal": "sales_boardroom",
    "pipeline": "sales_boardroom", "conversion": "sales_boardroom", "quote": "sales_boardroom",

    # Marketing & Performance
    "campaign": "marketing_boardroom", "click": "marketing_boardroom", "impression": "marketing_boardroom",
    "seo": "marketing_boardroom", "ctr": "marketing_boardroom", "engagement": "marketing_boardroom",
    "retargeting": "marketing_boardroom",

    # Retail / E-commerce
    "product": "retail_boardroom", "sku": "retail_boardroom", "inventory": "retail_boardroom",
    "merchandise": "retail_boardroom", "checkout": "retail_boardroom", "cart": "retail_boardroom",

    # HR / Workforce
    "employee": "hr_boardroom", "salary": "hr_boardroom", "payroll": "hr_boardroom",
    "recruiting": "hr_boardroom", "onboarding": "hr_boardroom", "benefits": "hr_boardroom",

    # Legal & Regulatory
    "contract": "legal_boardroom", "nda": "legal_boardroom", "compliance": "legal_boardroom",
    "license": "legal_boardroom", "regulation": "legal_boardroom", "litigation": "legal_boardroom",
    "hipaa": "legal_boardroom", "gdpr": "legal_boardroom",

    # Government / Infrastructure
    "fema": "gov_boardroom", "grant": "gov_boardroom", "relief": "gov_boardroom",
    "county": "gov_boardroom", "municipality": "gov_boardroom", "emergency": "gov_boardroom",

    # Intelligence / Strategy / Ops
    "kpi": "ops_boardroom", "milestone": "ops_boardroom", "initiative": "ops_boardroom",
    "workflow": "ops_boardroom", "objective": "ops_boardroom", "impact": "ops_boardroom"
}


# 🧠 Core Detection Function

def detect_module_from_csv(file_path):
    try:
        with open(file_path, newline='') as csvfile:
            reader = csv.reader(csvfile)
            headers = next(reader)
            scores = {}
            for header in headers:
                key = re.sub(r'[^a-z0-9 ]', '', header.lower())
                for keyword, module in MODULE_MAP.items():
                    if keyword in key:
                        scores[module] = scores.get(module, 0) + 1
            if scores:
                best_module = max(scores, key=scores.get)
                return best_module
            return "default_boardroom"
    except Exception as e:
        return f"error: {str(e)}"

if __name__ == "__main__":
    data = run_health_api_fetch()
    entry = {
        "source": "SabianHealthFeed",
        "timestamp": datetime.utcnow().isoformat(),
        "insights": data
    }
    with open("sabian_hive_report.json", "a") as f:
        f.write(json.dumps(entry) + "\n")
    print("[✓] Written to Sabian Hive Report.")

