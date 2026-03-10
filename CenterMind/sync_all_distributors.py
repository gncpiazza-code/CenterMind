from dotenv import load_dotenv
load_dotenv() # MUST be before erp_service import

import os
import logging
from db import sb
from services.erp_ingestion_service import erp_service

# Setup logging to see what's happening
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GlobalSync")

def sync_all():
    logger.info("Starting Global ERP Synchronization...")
    
    try:
        # 1. Get all mapped distributors
        res = sb.table("erp_empresa_mapping").select("id_distribuidor, nombre_erp").execute()
        dist_ids = list(set(row["id_distribuidor"] for row in res.data))
        
        if not dist_ids:
            logger.warning("No distributors found in erp_empresa_mapping.")
            return

        logger.info(f"Found {len(dist_ids)} distributors to sync: {dist_ids}")

        # 2. For each distributor, sync branches and link vendors
        for d_id in dist_ids:
            logger.info(f"--- Syncing Dist {d_id} ---")
            erp_service._sync_erp_branches_to_locations(d_id)
            
        logger.info("✅ Global Synchronization Complete.")

    except Exception as e:
        logger.error(f"❌ Error during global sync: {e}")

if __name__ == "__main__":
    sync_all()
