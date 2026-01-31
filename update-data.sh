#!/bin/bash
set -e

DATA_DIR=/var/data/dxbdata
LOG_FILE=/var/log/dxbdata-update.log

echo "[$(date)] Starting DXBData update..." >> $LOG_FILE

# Download fresh CSVs
cd $DATA_DIR
wget -q -O transactions_new.csv 'https://www.dubaipulse.gov.ae/dataset/3b25a6f5-9077-49d7-8a1e-bc6d5dea88fd/resource/a37511b0-ea36-485d-bccd-2d6cb24507e7/download/transactions.csv'
wget -q -O rent_contracts_new.csv 'https://www.dubaipulse.gov.ae/dataset/dld-registration/resource/765b5a69-ca16-4bfd-9852-74612f3c4ea6/download/rent_contracts.csv'

# Backup old files
mv transactions.csv transactions_backup.csv 2>/dev/null || true
mv rent_contracts.csv rent_contracts_backup.csv 2>/dev/null || true
mv transactions_new.csv transactions.csv
mv rent_contracts_new.csv rent_contracts.csv

echo "[$(date)] CSVs downloaded. Importing to database..." >> $LOG_FILE

# Clear and reimport transactions
sudo -u postgres psql dxbdata << 'SQL'
TRUNCATE TABLE transactions;
\copy transactions(procedure_id, procedure_name_ar, procedure_name_en, instance_date, property_type_id, property_type_ar, property_type_en, area_name_ar, area_name_en, property_sub_type_ar, property_sub_type_en, procedure_area, actual_worth, meter_sale_price, rent_value, meter_rent_price, building_name_ar, building_name_en, reg_type_id, reg_type_ar, reg_type_en) FROM '/var/data/dxbdata/transactions.csv' WITH (FORMAT csv, HEADER true);
SQL

# Clear and reimport rentals
sudo -u postgres psql dxbdata << 'SQL'
TRUNCATE TABLE rentals;
\copy rentals(contract_id, contract_reg_type_en, contract_start_date, contract_end_date, contract_amount, annual_amount, property_type_en, property_sub_type_en, property_usage_en, project_name_en, master_project_en, area_name_en, actual_area, nearest_metro_en, nearest_mall_en, tenant_type_en) FROM '/var/data/dxbdata/rent_contracts.csv' WITH (FORMAT csv, HEADER true);
SQL

# Cleanup backups
rm -f transactions_backup.csv rent_contracts_backup.csv

echo "[$(date)] Update complete!" >> $LOG_FILE

# Check price alerts after import
cd /var/www/dxbdata && node check-alerts.js >> /var/log/dxbdata-alerts.log 2>&1

