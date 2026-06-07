#!/usr/bin/env python3
# historical/fetchers/gee_fire_fetcher.py
# Google Earth Engine MOD14A1 fire data fetcher
# Returns annual fire pixel counts by country (2000-present)

import ee
import json
import sys
import os
from datetime import datetime

def authenticate_gee(service_account_key_path, project_id):
    """Authenticate with Google Earth Engine using service account"""
    try:
        credentials = ee.ServiceAccountCredentials(
            email=None,  # Will be read from JSON
            key_file=service_account_key_path
        )
        ee.Initialize(credentials=credentials, project=project_id)
        return True
    except Exception as e:
        print(f"[ERROR] GEE authentication failed: {e}", file=sys.stderr)
        return False

def get_country_geometry(country_name):
    """Get country boundary geometry from Earth Engine"""
    # Load LSIB (Large Scale International Boundaries) dataset
    countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')

    # Sabian name -> LSIB country_na value (verified against USDOS/LSIB_SIMPLE/2017)
    name_map = {
        'CAR':                  'Central African Rep',
        'DRC':                  'Dem Rep of the Congo',
        'Myanmar':              'Burma',
        'Bosnia':               'Bosnia & Herzegovina',
        'North Korea':          'Korea, North',
        'North Macedonia':      'Macedonia',
        'Palestine':            'West Bank',
        'Solomon Islands':      'Solomon Is',
        'South Korea':          'Korea, South',
        'Ivory Coast':          "Cote d'Ivoire",
        'Trinidad and Tobago':  'Trinidad & Tobago',
        'UAE':                  'United Arab Emirates',
        'South Sudan':          'South Sudan',
        'Burkina Faso':         'Burkina Faso',
        'Congo':                'Rep of the Congo',
    }

    lsib_name = name_map.get(country_name, country_name)
    filtered = countries.filter(ee.Filter.eq('country_na', lsib_name))

    # EE null objects are truthy in Python — must check count to verify match
    count = filtered.size().getInfo()
    if count == 0:
        print(f"[GEE] Country not found in LSIB: '{country_name}' (tried: '{lsib_name}')", file=sys.stderr)
        return None

    return filtered.first().geometry()

def count_fire_pixels(country_name, year, geometry):
    """Count fire detections in a country for a given year"""
    try:
        # MOD14A1: MODIS Terra Thermal Anomalies & Fire Daily
        # Available from 2000-11-01 to present
        mod14a1 = ee.ImageCollection('MODIS/061/MOD14A1')

        # Filter by date range (full year)
        start_date = f'{year}-01-01'
        end_date = f'{year}-12-31'

        # For 2000, start from Nov 1 (MODIS Terra launch)
        if year == 2000:
            start_date = '2000-11-01'

        year_data = mod14a1.filterDate(start_date, end_date).filterBounds(geometry)

        # FireMask band: 0-9 scale
        # Values >= 7 indicate fire detected with varying confidence
        # 7 = low confidence, 8 = nominal confidence, 9 = high confidence
        def count_fires(image):
            fire_mask = image.select('FireMask').gte(7)
            fire_count = fire_mask.reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=geometry,
                scale=1000,  # 1km resolution
                maxPixels=1e9,
                bestEffort=True,  # avoid timeout on large/complex polygons
                tileScale=4       # increase tile memory for large countries
            )
            return image.set('fire_count', fire_count.get('FireMask'))

        # Map over all images in the year
        with_counts = year_data.map(count_fires)

        # Sum across all days in the year
        total_fires = with_counts.aggregate_sum('fire_count').getInfo()

        # Handle None/null values
        if total_fires is None:
            return 0

        return int(total_fires)

    except Exception as e:
        print(f"[ERROR] Failed to count fires for {country_name} {year}: {e}", file=sys.stderr)
        return None

def fetch_country_fire_data(country_name, start_year=2000):
    """Fetch all fire data for a country from start_year to present"""
    current_year = datetime.now().year
    results = []

    # Get country geometry
    geometry = get_country_geometry(country_name)
    if not geometry:
        return [{
            'signal_key': 'fire_hotspot',
            'signal_name': 'Satellite Fire',
            'date': f'{start_year}-01-01',
            'raw_value': None,
            'raw_metadata': {'country': country_name, 'error': 'country_not_found_in_lsib'},
            'source': 'gee_modis_mod14a1',
            'gap': True,
            'gap_reason': 'country_boundary_not_found'
        }]

    print(f"[GEE] Fetching fire data for {country_name} ({start_year}-{current_year})", file=sys.stderr)

    for year in range(start_year, current_year + 1):
        fire_count = count_fire_pixels(country_name, year, geometry)

        results.append({
            'signal_key': 'fire_hotspot',
            'signal_name': 'Satellite Fire',
            'date': f'{year}-01-01',
            'raw_value': fire_count,
            'raw_metadata': {
                'country': country_name,
                'year': year,
                'fire_pixel_count': fire_count,
                'source_dataset': 'MODIS/061/MOD14A1',
                'confidence_threshold': 7
            },
            'source': 'gee_modis_mod14a1',
            'gap': fire_count is None or fire_count == 0,
            'gap_reason': 'no_fires_detected' if fire_count == 0 else ('fetch_error' if fire_count is None else None)
        })

        print(f"  {year}: {fire_count if fire_count is not None else 'ERROR'} fire pixels", file=sys.stderr)

    return results

def main():
    if len(sys.argv) < 4:
        print("Usage: python gee_fire_fetcher.py <service_account_key> <project_id> <country_name>", file=sys.stderr)
        sys.exit(1)

    key_path = sys.argv[1]
    project_id = sys.argv[2]
    country_name = sys.argv[3]

    # Authenticate
    if not authenticate_gee(key_path, project_id):
        sys.exit(1)

    # Fetch data
    data = fetch_country_fire_data(country_name)

    # Output as JSON
    print(json.dumps(data, indent=2))

if __name__ == '__main__':
    main()
