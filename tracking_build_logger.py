import os
from datetime import datetime
import subprocess

WATCH_DIR = "."
LOG_QUEUE = "./.log_queue"
BUILD_LOG = "../BUILD_LOG.md"
TRACK_EXT = ".cjs"
SEEN_FILES = set()
SEEN_FOLDERS = set()
FIRST_RUN_FILE = "./.first_run_date"

def load_first_run_date():
    if os.path.exists(FIRST_RUN_FILE):
        with open(FIRST_RUN_FILE, "r") as f:
            date_str = f.read().strip()
            return datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
    else:
        now = datetime.now()
        with open(FIRST_RUN_FILE, "w") as f:
            f.write(now.strftime("%Y-%m-%d %H:%M:%S"))
        return now

def scan_files_and_folders(first_run_date):
    changes = []
    for root, dirs, files in os.walk(WATCH_DIR):
        for d in dirs:
            folder_path = os.path.join(root, d)
            mod_time = datetime.fromtimestamp(os.path.getmtime(folder_path))
            if mod_time >= first_run_date and folder_path not in SEEN_FOLDERS:
                SEEN_FOLDERS.add(folder_path)
                changes.append(f"Created folder: {folder_path}")
        for file in files:
            if file.endswith(TRACK_EXT):
                file_path = os.path.join(root, file)
                mod_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                if mod_time >= first_run_date and file_path not in SEEN_FILES:
                    SEEN_FILES.add(file_path)
                    changes.append(f"Created/updated file: {file_path}")
    return changes

def load_log_queue():
    if not os.path.exists(LOG_QUEUE):
        return []
    with open(LOG_QUEUE, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]

def clear_log_queue():
    open(LOG_QUEUE, "w").close()

def append_to_build_log(entries):
    with open(BUILD_LOG, "a", encoding="utf-8") as f:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        f.write(f"\n--- Build Log {timestamp} ---\n")
        for entry in entries:
            f.write(f"- {entry}\n")

def generate_summary(entries):
    print("\n=== SABIAN BUILD SUMMARY ===")
    for entry in entries:
        print(f"- {entry}")
    print("\nCopy and paste this into ChatGPT to continue where you left off.")

def run_logger():
    print("\n🧠 Sabian Tracking Build Logger Running...")
    first_run_date = load_first_run_date()
    changes = scan_files_and_folders(first_run_date)
    queue_entries = load_log_queue()
    entries = changes + queue_entries
    if entries:
        append_to_build_log(entries)
        generate_summary(entries)
        clear_log_queue()
    else:
        print("No new log entries found.")
def run_supabase_fetch():
    print("\n⏳ Fetching Supabase audit logs into .log_queue ...")
    result = subprocess.run(['node', 'tracking_supabase.cjs'], capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print("Errors:", result.stderr)

if __name__ == "__main__":
    run_supabase_fetch()
    run_logger()
