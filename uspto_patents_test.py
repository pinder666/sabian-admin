from uspto_patents import fetch_recent_patents

print("🔍 Latest USPTO Patents:\n")
for title, abstract in fetch_recent_patents():
    print(f"📌 Title: {title}")
    print(f"📝 Abstract: {abstract}\n")
