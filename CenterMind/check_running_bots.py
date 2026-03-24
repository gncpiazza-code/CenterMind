import psutil
import os

def check_bots():
    print("Checking for running bot processes...")
    found = False
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = proc.info.get('cmdline')
            if cmdline and 'python' in cmdline[0] and 'bot_worker.py' in str(cmdline):
                print(f"FOUND: PID {proc.info['pid']} - Cmd: {' '.join(cmdline)}")
                found = True
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    if not found:
        print("No bot_worker.py processes found.")

if __name__ == "__main__":
    check_bots()
