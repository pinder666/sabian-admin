import comtradeapicall
import pandas as pd

# Rare-earth HS codes (one at a time allowed)
rare_earth_codes = [
    "280530",  # Rare-earth metals, scandium & yttrium
    "280540",  # Mercury (related but included)
    "280800",  # Nitric acid etc. (related to processing)
    "284610",  # Cerium compounds
    "284690"   # Other rare-earth compounds
]

all_data = []

for code in rare_earth_codes:
    print(f"Pulling code {code} ...")

    data = comtradeapicall.previewFinalData(
        typeCode='C',
        freqCode='A',
        clCode='HS',
        period='2022',
        reporterCode='100',     # ALL reporters
        cmdCode=code,
        flowCode='M',
        partnerCode='0',        # WORLD
        partner2Code=None,
        customsCode=None,
        motCode=None,
        maxRecords=500,         # Comtrade preview cap
        format_output='JSON',
        aggregateBy=None,
        breakdownMode='classic',
        countOnly=None,
        includeDesc=True
    )

    if data is not None and len(data) > 0:
        all_data.append(data)

# Merge all results
if all_data:
    df = pd.concat(all_data, ignore_index=True)
    print(df)
    print(f"\nTOTAL ROWS RETURNED: {len(df)}")
else:
    print("No data returned for any rare-earth codes.")
 