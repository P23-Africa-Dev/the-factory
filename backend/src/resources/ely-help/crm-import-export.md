---
title: Import or export leads
module: crm
roles: owner, admin, supervisor, agent
routes: /crm, /crm/leads
keywords: import, export, csv, excel, spreadsheet, upload leads, download leads, bulk
tools: crm.import_preview, crm.import_leads
---
Import in the CRM:
1. In CRM, open the import option and choose a CSV or Excel file.
2. Match your columns to lead fields, choose the target pipeline, and review the preview.
3. Confirm to import. Rows that match existing leads can be merged.

Import through ELY:
1. In the ELY chat, use "Import leads" and choose a CSV file (save Excel sheets as CSV first). The file needs a Name column; Email, Phone, Location, Industry, Source, Status and Priority columns are picked up automatically.
2. ELY checks the file and tells you how many rows are ready, how many look like existing leads, and which rows have errors.
3. Confirm, and ELY imports them. Up to 500 rows per file.

Export:
1. In CRM, choose Export.
2. Pick what to export (all leads or the filtered leads) and the format, then download.

ELY cannot download an export for you; use the Export button in CRM.
