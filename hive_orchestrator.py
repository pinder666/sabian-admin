import json
import os
import subprocess

MISSIONS_FILE = 'missions_index.json'
LOGGER_SCRIPT = './logger.cjs'

def log_to_hive(payload):
    try:
        subprocess.run([
            "node", "-e",
            f"require('{LOGGER_SCRIPT}').logToHive({json.dumps(payload)})"
        ], check=True)
    except Exception as e:
        print(f"⚠️ Failed to log to Hive: {e}")

def load_missions():
    if not os.path.exists(MISSIONS_FILE):
        print("❌ Missions index not found.")
        return []
    with open(MISSIONS_FILE, 'r') as f:
        return json.load(f)

def list_missions(missions):
    print("\n=== MISSION LIST ===")
    for mission in missions:
        status = mission.get('status', 'unknown')
        name = mission.get('name', 'Unnamed')
        mid = mission.get('id', 'N/A')
        timestamp = mission.get('timestamp', 'N/A')
        print(f"🛰️  ID: {mid} | Name: {name} | Status: {status} | Timestamp: {timestamp}")

def view_mission_output(mission):
    mission_id = mission.get('id', 'N/A')
    output_path = os.path.join(mission.get('path', ''), 'output.json')

    if not os.path.exists(output_path):
        print("❌ Output file not found.")
        return

    with open(output_path, 'r') as f:
        output = json.load(f)

    print("\n=== MISSION OUTPUT ===")
    print(json.dumps(output, indent=2))

    log_to_hive({
        "source": "hive_orchestrator",
        "level": "intel",
        "event": f"Mission viewed: {mission.get('name', 'Unnamed')}",
        "data": {
            "mission_id": mission_id,
            "output": output
        },
        "tags": ["mission", "orchestrator", "output"]
    })

def select_and_view_output(missions):
    mission_id = input("Enter Mission ID: ")
    mission = next((m for m in missions if m.get('id') == mission_id), None)
    if not mission:
        print("❌ Mission ID not found.")
        return
    view_mission_output(mission)

def main_menu():
    missions = load_missions()
    if not missions:
        return

    while True:
        print("\n📡 Hive Orchestrator Menu")
        print("1. List All Missions")
        print("2. View Mission Output")
        print("3. Exit")
        choice = input("Choose an option: ")

        if choice == '1':
            list_missions(missions)
        elif choice == '2':
            select_and_view_output(missions)
        elif choice == '3':
            break
        else:
            print("Invalid choice.")

if __name__ == "__main__":
    main_menu()
