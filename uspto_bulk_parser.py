import os
import zipfile
import xml.etree.ElementTree as ET

# Folder where your zip file is stored
BULK_ZIP_PATH = "C:/Users/user/Desktop/sabian.ai/upload_watch/ipg240409.zip"
  # 🔁 Replace with actual filename
EXTRACT_PATH = "C:/Users/user/Desktop/sabian.ai/upload_watch/uspto_extracted"

# Ensure extraction path exists
os.makedirs(EXTRACT_PATH, exist_ok=True)

# Extract the ZIP
with zipfile.ZipFile(BULK_ZIP_PATH, 'r') as zip_ref:
    zip_ref.extractall(EXTRACT_PATH)
    print(f"✅ Extracted files to: {EXTRACT_PATH}")

# Parse XML files
def parse_patent_file(xml_file):
    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()

        title = root.findtext(".//invention-title") or "No Title Found"
        abstract = root.findtext(".//abstract") or "No Abstract Found"

        print("📘 Patent Title:", title.strip())
        print("🧾 Abstract:", abstract.strip())
        print("-" * 60)
    except Exception as e:
        print(f"⚠️ Error parsing {xml_file}: {e}")

# Go through all extracted XMLs
for root_dir, _, files in os.walk(EXTRACT_PATH):
    for file in files:
        if file.endswith(".xml"):
            parse_patent_file(os.path.join(root_dir, file))
