import json
import os

spec_path = os.path.join(os.path.dirname(__file__), "openapi_spec.json")

def find_lines():
    with open(spec_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if '"definitions": {' in line:
                print(f"Definitions found at line {i+1}")
            if '"exhibiciones": {' in line:
                print(f"Exhibiciones found at line {i+1}")

if __name__ == "__main__":
    find_lines()
