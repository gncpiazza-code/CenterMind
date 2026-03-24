
import os

api_path = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\api.py"

with open(api_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# find ALL occurrences of def get_hierarchy_config
indices = []
for i, line in enumerate(lines):
    if 'def get_hierarchy_config(dist_id: int' in line:
        indices.append(i)

if len(indices) > 1:
    print(f"Found {len(indices)} occurrences. Keeping the first one at line {indices[0]+1} and removing the others.")
    
    # We keep the first one and its decorator
    # The first one is at indices[0]
    # The second one starts at indices[1]
    
    to_remove_start = indices[1] - 1 # usually the line before is empty or has a decorator if it was a real one
    # But wait, looking at my view_file output:
    # 1691:     except Exception as e:
    # 1692:         logger.error(f"Error fetching hierarchy config: {e}")
    # 1693:         raise HTTPException(status_code=500, detail=str(e))
    # 1694: 
    # 1695: def get_hierarchy_config(dist_id: int, _=Depends(verify_auth)):
    
    # Actually wait, let's look at the indices again.
    # The first one starts at 1642.
    # The second one starts at 1695 (approx).
    
    # We find where save_hierarchy_config starts
    save_idx = -1
    for i in range(indices[1], len(lines)):
        if 'def save_hierarchy_config' in line or '@app.post("/api/admin/hierarchy-config/save' in lines[i]:
            save_idx = i
            break
            
    if save_idx != -1:
        new_lines = lines[:indices[1]] + lines[save_idx:]
        # Note: I'm removing the second 'def get_hierarchy_config' and anything until save_hierarchy_config
        # But wait, I might need to keep decorators for save_hierarchy_config
        with open(api_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print(f"Removed lines from {indices[1]+1} to {save_idx}")
    else:
        print("Error: Could not find save_hierarchy_config to stop removal.")
else:
    print(f"Only {len(indices)} occurrences found. No cleanup needed.")
