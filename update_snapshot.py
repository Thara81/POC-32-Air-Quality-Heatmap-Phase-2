import json

# Current correct data from our ETL
correct_data = {
    "delhi": {"pm25": 159.3, "score": 97, "category": "Severe"},
    "london": {"pm25": 5.9, "score": 15, "category": "Low"},
    "los-angeles": {"pm25": 8.9, "score": 44, "category": "Moderate"},
    "jakarta": {"pm25": 28.8, "score": 83, "category": "Severe"},
    "lagos": {"pm25": 31.0, "score": 84, "category": "Severe"},
    "warsaw": {"pm25": 12.8, "score": 61, "category": "High"},
    "sao-paulo": {"pm25": 28.2, "score": 82, "category": "Severe"},
    "beijing": {"pm25": 15.3, "score": 67, "category": "High"},
}

# Load existing snapshot
with open('data/exposure_scores.json', 'r') as f:
    data = json.load(f)

# Update PM2.5 entries with correct values
for item in data:
    if item['parameter'] == 'pm25' and item['cityId'] in correct_data:
        correct = correct_data[item['cityId']]
        item['meanConcentration'] = correct['pm25']
        item['score'] = correct['score']
        item['category'] = correct['category']
        # Recalculate ratio
        item['ratioToGuideline'] = round(correct['pm25'] / 5.0, 2)

# Write back
with open('data/exposure_scores.json', 'w') as f:
    json.dump(data, f, indent=2)

print("✅ Snapshot updated with correct city data!")
