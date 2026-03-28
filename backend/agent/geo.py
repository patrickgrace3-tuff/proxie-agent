import math
import json
from pathlib import Path
from typing import Optional

# ── Lightweight zip → (lat, lon, state, city) lookup ──
# Covers all US states with major zip codes per state
# Full dataset would be 40k+ zips; this covers enough for radius matching
ZIP_DATABASE: dict[str, tuple[float, float, str, str]] = {
    # Format: "zip": (lat, lon, state_code, city)
    # Tennessee
    "37122": (36.2009, -86.5186, "TN", "Mount Juliet"),
    "37201": (36.1627, -86.7816, "TN", "Nashville"),
    "38101": (35.1495, -90.0490, "TN", "Memphis"),
    "37402": (35.0456, -85.3097, "TN", "Chattanooga"),
    "37902": (35.9606, -83.9207, "TN", "Knoxville"),
    # Georgia
    "30301": (33.7490, -84.3880, "GA", "Atlanta"),
    "31401": (32.0835, -81.0998, "GA", "Savannah"),
    "31901": (32.4610, -84.9877, "GA", "Columbus"),
    # Texas
    "75201": (32.7767, -96.7970, "TX", "Dallas"),
    "77001": (29.7604, -95.3698, "TX", "Houston"),
    "78201": (29.4241, -98.4936, "TX", "San Antonio"),
    "73301": (30.2672, -97.7431, "TX", "Austin"),
    "79901": (31.7619, -106.4850, "TX", "El Paso"),
    # Illinois
    "60601": (41.8827, -87.6233, "IL", "Chicago"),
    "61602": (40.6936, -89.5890, "IL", "Peoria"),
    "62701": (39.7817, -89.6501, "IL", "Springfield"),
    # Ohio
    "43215": (39.9612, -82.9988, "OH", "Columbus"),
    "44101": (41.4993, -81.6944, "OH", "Cleveland"),
    "45202": (39.1031, -84.5120, "OH", "Cincinnati"),
    # Indiana
    "46201": (39.7684, -86.1581, "IN", "Indianapolis"),
    "46801": (41.0534, -85.1442, "IN", "Fort Wayne"),
    # North Carolina
    "28201": (35.2271, -80.8431, "NC", "Charlotte"),
    "27601": (35.7796, -78.6382, "NC", "Raleigh"),
    "27401": (36.0726, -79.7920, "NC", "Greensboro"),
    # Virginia
    "23219": (37.5407, -77.4360, "VA", "Richmond"),
    "23510": (36.8508, -76.2859, "VA", "Norfolk"),
    # South Carolina
    "29601": (34.8526, -82.3940, "SC", "Greenville"),
    "29201": (34.0007, -81.0348, "SC", "Columbia"),
    # Florida
    "32099": (30.3322, -81.6557, "FL", "Jacksonville"),
    "33101": (25.7617, -80.1918, "FL", "Miami"),
    "33601": (27.9506, -82.4572, "FL", "Tampa"),
    "32801": (28.5383, -81.3792, "FL", "Orlando"),
    # Missouri
    "64101": (39.0997, -94.5786, "MO", "Kansas City"),
    "63101": (38.6270, -90.1994, "MO", "St. Louis"),
    # Kentucky
    "40201": (38.2527, -85.7585, "KY", "Louisville"),
    "40501": (38.0406, -84.5037, "KY", "Lexington"),
    # Alabama
    "35203": (33.5186, -86.8104, "AL", "Birmingham"),
    "36101": (32.3668, -86.3000, "AL", "Montgomery"),
    # Mississippi
    "39201": (32.2988, -90.1848, "MS", "Jackson"),
    # Arkansas
    "72201": (34.7465, -92.2896, "AR", "Little Rock"),
    # Louisiana
    "70112": (29.9511, -90.0715, "LA", "New Orleans"),
    "71101": (32.5252, -93.7502, "LA", "Shreveport"),
    # Michigan
    "48201": (42.3314, -83.0458, "MI", "Detroit"),
    "49503": (42.9634, -85.6681, "MI", "Grand Rapids"),
    # Wisconsin
    "53201": (43.0389, -87.9065, "WI", "Milwaukee"),
    "53701": (43.0731, -89.4012, "WI", "Madison"),
    # Minnesota
    "55401": (44.9778, -93.2650, "MN", "Minneapolis"),
    "55101": (44.9537, -93.0900, "MN", "St. Paul"),
    # Iowa
    "50301": (41.5868, -93.6250, "IA", "Des Moines"),
    # Kansas
    "66101": (39.1141, -94.6275, "KS", "Kansas City"),
    "67201": (37.6872, -97.3301, "KS", "Wichita"),
    # Nebraska
    "68101": (41.2565, -95.9345, "NE", "Omaha"),
    "68501": (40.8136, -96.7026, "NE", "Lincoln"),
    # Oklahoma
    "73101": (35.4676, -97.5164, "OK", "Oklahoma City"),
    "74101": (36.1540, -95.9928, "OK", "Tulsa"),
    # Arizona
    "85001": (33.4484, -112.0740, "AZ", "Phoenix"),
    "85701": (32.2226, -110.9747, "AZ", "Tucson"),
    # Nevada
    "89101": (36.1699, -115.1398, "NV", "Las Vegas"),
    "89501": (39.5296, -119.8138, "NV", "Reno"),
    # Colorado
    "80201": (39.7392, -104.9903, "CO", "Denver"),
    "80901": (38.8339, -104.8214, "CO", "Colorado Springs"),
    # New Mexico
    "87101": (35.0853, -106.6056, "NM", "Albuquerque"),
    # Utah
    "84101": (40.7608, -111.8910, "UT", "Salt Lake City"),
    # Pennsylvania
    "19101": (39.9526, -75.1652, "PA", "Philadelphia"),
    "15201": (40.4406, -79.9959, "PA", "Pittsburgh"),
    # New York
    "10001": (40.7484, -73.9967, "NY", "New York City"),
    "14201": (42.8864, -78.8784, "NY", "Buffalo"),
    "12201": (42.6526, -73.7562, "NY", "Albany"),
    # New Jersey
    "07101": (40.7357, -74.1724, "NJ", "Newark"),
    # Maryland
    "21201": (39.2904, -76.6122, "MD", "Baltimore"),
    # Washington DC
    "20001": (38.9072, -77.0369, "DC", "Washington"),
    # Massachusetts
    "02101": (42.3601, -71.0589, "MA", "Boston"),
    # Washington State
    "98101": (47.6062, -122.3321, "WA", "Seattle"),
    "99201": (47.6588, -117.4260, "WA", "Spokane"),
    # Oregon
    "97201": (45.5051, -122.6750, "OR", "Portland"),
    # California
    "90001": (34.0522, -118.2437, "CA", "Los Angeles"),
    "94101": (37.7749, -122.4194, "CA", "San Francisco"),
    "95814": (38.5816, -121.4944, "CA", "Sacramento"),
    "92101": (32.7157, -117.1611, "CA", "San Diego"),
}

STATE_NAMES = {
    "AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California",
    "CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia",
    "HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa",
    "KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland",
    "MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi",
    "MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire",
    "NJ":"New Jersey","NM":"New Mexico","NY":"New York","NC":"North Carolina",
    "ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania",
    "RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee",
    "TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington",
    "WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming","DC":"D.C."
}


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def get_zip_info(zip_code: str) -> Optional[tuple[float, float, str, str]]:
    """Return (lat, lon, state_code, city) for a zip code."""
    zip_code = zip_code.strip().zfill(5)[:5]
    if zip_code in ZIP_DATABASE:
        return ZIP_DATABASE[zip_code]
    # Try prefix match (first 3 digits)
    prefix = zip_code[:3]
    for z, data in ZIP_DATABASE.items():
        if z.startswith(prefix):
            return data
    return None


def zip_distance_miles(zip1: str, zip2: str) -> Optional[float]:
    """Distance in miles between two zip codes."""
    info1 = get_zip_info(zip1)
    info2 = get_zip_info(zip2)
    if not info1 or not info2:
        return None
    return haversine_miles(info1[0], info1[1], info2[0], info2[1])


def get_state_for_zip(zip_code: str) -> Optional[str]:
    info = get_zip_info(zip_code)
    return info[2] if info else None


def get_city_for_zip(zip_code: str) -> Optional[str]:
    info = get_zip_info(zip_code)
    return info[3] if info else None


def zips_within_radius(center_zip: str, radius_miles: int) -> list[str]:
    """Return all zip codes in our database within radius_miles of center_zip."""
    center = get_zip_info(center_zip)
    if not center:
        return []
    clat, clon = center[0], center[1]
    return [
        z for z, (lat, lon, state, city) in ZIP_DATABASE.items()
        if haversine_miles(clat, clon, lat, lon) <= radius_miles
    ]


def states_within_radius(center_zip: str, radius_miles: int) -> list[str]:
    """Return unique state codes within radius of zip."""
    nearby_zips = zips_within_radius(center_zip, radius_miles)
    states = set()
    for z in nearby_zips:
        info = get_zip_info(z)
        if info:
            states.add(info[2])
    return list(states)


def carrier_location_in_radius(carrier_location: str, carrier_states: list[str],
                                center_zip: str, radius_miles: Optional[int],
                                state_wide: bool, home_state: str) -> tuple[bool, str]:
    """
    Check if a carrier's location is within the driver's geography rules.
    Returns (passes: bool, reason: str)
    """
    if not center_zip:
        return True, "No geography filter set"

    # State-wide mode: carrier must operate in driver's home state
    if state_wide:
        if home_state and home_state in carrier_states:
            return True, f"Operates in {home_state} (your state)"
        elif home_state:
            return False, f"Does not operate in {home_state}"
        return True, "State-wide mode, no home state set"

    # Radius mode: check if carrier's primary location is within radius
    if radius_miles:
        # Try to extract a zip from the carrier location string
        zip_match = __import__('re').search(r'\b(\d{5})\b', carrier_location or '')
        if zip_match:
            dist = zip_distance_miles(center_zip, zip_match.group(1))
            if dist is not None:
                if dist <= radius_miles:
                    return True, f"{int(dist)} miles from your location"
                else:
                    return False, f"{int(dist)} miles away (max {radius_miles})"

        # Fall back to state-based radius check
        nearby_states = states_within_radius(center_zip, radius_miles)
        if any(s in nearby_states for s in carrier_states):
            return True, f"Operates within {radius_miles}-mile radius"
        return False, f"Outside {radius_miles}-mile radius"

    return True, "No radius filter"
