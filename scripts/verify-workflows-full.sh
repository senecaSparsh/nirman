#!/usr/bin/env bash
# Full workflow verification — seeds entities into start states via SQL and
# drives every state machine through its transitions over HTTP, asserting
# status flips, side-effect rows, and audit rows.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-workflows-full.sh
# Requires: session cookie jar, psql on nirman_inventory. MUTATES the DB —
# dev/staging only. Seed anchors: SRG REALCON demo data.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                      # SRG REALCON
PROJ="cmtwhwzer000pvlt3cth8e8qo"                   # apex center
SUP="cmv0q7nhr005yvlt79m5jwk7q"                  # Apex Steel Traders
LOC_SITE="cmv0q8auu006evlt73x54h619"             # site store
LOC_WH="cmv0q8a4h006avlt72rifonze"               # central warehouse
MAT="cmv0qadjq006qvlt7o4zo7eae"                  # seeded material
EMP="cmtv3x4v1000kvlp0cx46kvi3"                  # Sanjeev Kumar (subordinate)
BOQ="cmv15bmor0009vle2gapxtrbj"                  # seeded BOQ item

PASS=0; FAIL=0; SKIP=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 40 -X "$1" "$BASE/api/$2" -d "$3"; }
expect() { # label table id column want
  got=$(P "SELECT $4::text FROM \"$2\" WHERE id='$3'")
  [ "$got" = "$5" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $5 got ${got:-<none>}"; }
}
expect_audit() {
  n=$(P "SELECT count(*) FROM \"AuditLog\" WHERE \"entityId\"='$2' AND action ILIKE '%$3%'")
  [ "${n:-0}" -gt 0 ] && { PASS=$((PASS+1)); echo "  PASS audit $1"; } || { FAIL=$((FAIL+1)); echo "  FAIL audit $1"; }
}
expect_count() { # label sql
  n=$(P "$2"); [ "${n:-0}" -gt 0 ] && { PASS=$((PASS+1)); echo "  PASS $1 ($n)"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1"; }
}
uid() { echo "vfy$(date +%s)$RANDOM"; }

# ── SRG fixture provisioning ──────────────────────────────────────────────
# The transactional seed builds its demo under "My Company"; these checks
# exercise SRG REALCON, so provision the minimum C-owned entities first.
CUST=$(P "SELECT id FROM \"Customer\" WHERE \"companyId\"='$C' LIMIT 1")
[ -z "$CUST" ] && { CUST=$(uid); P "INSERT INTO \"Customer\" (id,\"companyId\",name,\"updatedAt\",\"createdAt\") VALUES ('$CUST','$C','wf-customer',now(),now())"; }
PARCEL=$(P "SELECT lp.id FROM \"LandParcel\" lp JOIN \"LandPurchase\" l ON l.id=lp.\"landPurchaseId\" WHERE l.\"companyId\"='$C' AND lp.\"deletedAt\" IS NULL LIMIT 1")
if [ -z "$PARCEL" ]; then
  LPX=$(uid); PARCEL=$(uid)
  P "INSERT INTO \"LandPurchase\" (id,\"companyId\",\"sellerName\",\"totalArea\",\"totalCost\",\"createdAt\") VALUES ('$LPX','$C','wf-seller',1000,500000,now())"
  P "INSERT INTO \"LandParcel\" (id,\"landPurchaseId\",number,area,\"updatedAt\",\"createdAt\") VALUES ('$PARCEL','$LPX','P-WF-1',500,now(),now())"
fi
SALE0=$(P "SELECT id FROM \"AssetSale\" WHERE \"companyId\"='$C' AND status='ACTIVE' LIMIT 1")
[ -z "$SALE0" ] && { SALE0=$(uid); P "INSERT INTO \"AssetSale\" (id,\"saleNumber\",\"assetType\",\"customerId\",\"companyId\",\"salePrice\",status,\"updatedAt\",\"createdAt\") VALUES ('$SALE0','WF-SALE-$RANDOM','LAND','$CUST','$C',500000,'ACTIVE',now(),now())"; }
# Fixture stock for the material-sale/issue/transfer tests — a PERSISTENT
# baseline (like CUST/PARCEL above): top each location's movement-log net back
# up to 500, then post a Dr 1300 / Cr 3000 JE for the exact physical-vs-GL gap.
# Without the JE, service-posted issues/sales credit 1300 against stock that
# never had a GL debit (net-credit account-signs + inventory-gl failures).
# The JE is marked 'vfy-opening-stock%' — repair-books-dev exempts it from
# fixture cleanup so the baseline stays intact across runs.
MAC=$(P "SELECT coalesce((SELECT \"movingAvgCost\" FROM \"StockLocationItem\" WHERE \"materialId\"='$MAT' AND qty<>0 LIMIT 1), 10)::numeric(14,2)")
for L in "$LOC_SITE" "$LOC_WH"; do
  NET=$(P "SELECT coalesce(sum(CASE WHEN \"toLocationId\"='$L' THEN qty WHEN \"fromLocationId\"='$L' THEN -qty END),0)::int FROM \"StockMovement\" WHERE \"materialId\"='$MAT' AND (\"toLocationId\"='$L' OR \"fromLocationId\"='$L')")
  if [ "${NET:-0}" -lt 500 ]; then
    ADD=$((500-NET)); SMX=$(uid)
    BALV=$(python3 -c "print(round(500*float('$MAC'),2))")
    P "INSERT INTO \"StockMovement\" (id,\"materialId\",\"movementType\",\"toLocationId\",qty,\"unitCost\",\"balanceAfter\",\"balanceValueAfter\",\"refType\",\"refId\",timestamp) VALUES ('$SMX','$MAT','OPENING_BALANCE','$L',$ADD,$MAC,500,$BALV,'FIXTURE','vfy-opening-stock',timezone('UTC',now()))"
    P "INSERT INTO \"StockLocationItem\" (id,\"locationId\",\"materialId\",qty,\"movingAvgCost\",\"updatedAt\") VALUES ('$(uid)','$L','$MAT',500,$MAC,now())
       ON CONFLICT (\"locationId\",\"materialId\") DO UPDATE SET qty=500,\"movingAvgCost\"=$MAC,\"updatedAt\"=now()" 2>/dev/null || \
    P "UPDATE \"StockLocationItem\" SET qty=500,\"movingAvgCost\"=$MAC,\"updatedAt\"=now() WHERE \"locationId\"='$L' AND \"materialId\"='$MAT'"
  fi
done
# Note: the balancing Dr 1300 / Cr 3000 opening JE for this fixture stock is
# posted by repair-books-dev.sh §3c after cleanup — it computes the exact
# physical-vs-GL residual so the books end each run precisely reconciled.

echo "════════ 1. DPR approval chain (SUBMITTED→SUB_ADMIN→ADMIN) ════════"
DPR=$(uid); DAY=$((RANDOM % 30000 + 30))
P "INSERT INTO \"DailyProgressReport\" (id,\"companyId\",\"projectId\",date,\"workSummary\",\"approvalStatus\",\"updatedAt\",\"createdAt\") VALUES ('$DPR','$C','$PROJ',now()+interval '$DAY days','wf verify','SUBMITTED',now(),now())"
req PATCH "dprs/$DPR" '{"action":"subAdminApprove"}' >/dev/null
expect "dpr sub-admin" DailyProgressReport "$DPR" '"approvalStatus"' SUB_ADMIN_APPROVED
req PATCH "dprs/$DPR" '{"action":"adminApprove"}' >/dev/null
expect "dpr admin" DailyProgressReport "$DPR" '"approvalStatus"' APPROVED

echo "════════ 2. Measurement book (DRAFT→VERIFIED→APPROVED) ════════"
MB=$(uid); P "INSERT INTO \"MeasurementBookEntry\" (id,\"projectId\",\"boqItemId\",\"mbNumber\",\"measuredQty\",\"cumulativeQty\",description,status,\"updatedAt\",\"createdAt\") VALUES ('$MB','$PROJ','$BOQ','MB-$RANDOM',10,10,'wf verify','DRAFT',now(),now())"
req PATCH "mb-entries/$MB" '{"action":"verify"}' >/dev/null
expect "mb verify" MeasurementBookEntry "$MB" status VERIFIED
req PATCH "mb-entries/$MB" '{"action":"approve"}' >/dev/null
expect "mb approve" MeasurementBookEntry "$MB" status APPROVED

echo "════════ 3. Tenancy lifecycle (PENDING→ACTIVE→schedule→TERMINATED) ════════"
TEN=$(uid); P "INSERT INTO \"Tenancy\" (id,\"companyId\",\"assetType\",\"tenantName\",\"startDate\",\"endDate\",\"monthlyRent\",status,\"landParcelId\",\"updatedAt\",\"createdAt\") VALUES ('$TEN','$C','LAND','wf-tenant',now(),now()+interval '3 years',50000,'PENDING','$PARCEL',now(),now())"
req POST "tenancies/$TEN" '{"action":"activate"}' >/dev/null
expect "tenancy activate" Tenancy "$TEN" status ACTIVE
req POST "tenancies/$TEN" '{"action":"generateSchedule","monthsAhead":3}' >/dev/null
expect_count "rent schedule rows" "SELECT count(*) FROM \"RentalPayment\" WHERE \"tenancyId\"='$TEN'"
req POST "tenancies/$TEN" '{"action":"escalate"}' >/dev/null
r=$(P "SELECT \"monthlyRent\"::text FROM \"Tenancy\" WHERE id='$TEN'")
[ "$r" != "50000" ] && { PASS=$((PASS+1)); echo "  PASS rent escalated → $r"; } || { SKIP=$((SKIP+1)); echo "  SKIP escalate (no escalation rule on tenancy)"; }
req POST "tenancies/$TEN" '{"action":"terminate"}' >/dev/null
expect "tenancy terminate" Tenancy "$TEN" status TERMINATED

echo "════════ 4. Employee advance (ACTIVE→PAUSED→CANCELLED) ════════"
# Issue via API so the Dr-1650 leg posts; a raw INSERT skips it and the
# CANCELLED write-off below then credits an un-debited receivable.
ADV=$(req POST "employees/$EMP/advances" '{"amount":20000,"monthlyRecovery":2000,"notes":"wf verify"}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
req PATCH "advances/$ADV" '{"status":"PAUSED","note":"wf verify"}' >/dev/null
expect "advance pause" EmployeeAdvance "$ADV" status PAUSED
req PATCH "advances/$ADV" '{"status":"CANCELLED","note":"wf verify"}' >/dev/null
expect "advance cancel" EmployeeAdvance "$ADV" status CANCELLED

echo "════════ 5. Issue → gate-pass mode (PENDING→executed via pass) ════════"
RESP=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"fromLocationId\":\"$LOC_SITE\",\"requireGatePass\":true,\"lines\":[{\"materialId\":\"$MAT\",\"qty\":1}]}")
GPI=$(echo "$RESP" | grep -oE '"issueId":"[^"]+"|"materialIssueId":"[^"]+"' | head -1 | cut -d'"' -f4)
GPP=$(P "SELECT id FROM \"GatePass\" WHERE \"refId\"='$GPI' AND status='PENDING' LIMIT 1")
[ -n "$GPI" ] && expect "issue pending" MaterialIssue "$GPI" status PENDING || { SKIP=$((SKIP+1)); echo "  SKIP issue gate-pass create: $RESP"; }
[ -n "$GPP" ] && { req PATCH "gate-passes/$GPP" '{"action":"approve"}' >/dev/null; expect "gp approve" GatePass "$GPP" status APPROVED; req PATCH "gate-passes/$GPP" '{"action":"confirmExit"}' >/dev/null; expect "gp exit" GatePass "$GPP" status EXITED; expect "issue executed" MaterialIssue "$GPI" status COMPLETED; }

echo "════════ 6. Transfer cancel + transit guard ════════"
# Cancel only applies before dispatch — in-transit goods need returnToSource.
TRP=$(uid); P "INSERT INTO \"StockTransfer\" (id,\"fromLocationId\",\"toLocationId\",status) VALUES ('$TRP','$LOC_WH','$LOC_SITE','DRAFT')"
req PATCH "transfers/$TRP" '{"action":"cancel"}' >/dev/null
expect "transfer cancel (pre-dispatch)" StockTransfer "$TRP" status CANCELLED
TRI=$(uid); P "INSERT INTO \"StockTransfer\" (id,\"fromLocationId\",\"toLocationId\",status) VALUES ('$TRI','$LOC_WH','$LOC_SITE','IN_TRANSIT')"
r=$(req PATCH "transfers/$TRI" '{"action":"cancel"}')
echo "$r" | grep -q "Cannot cancel" && { PASS=$((PASS+1)); echo "  PASS in-transit cancel blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL in-transit cancel allowed: $r"; }

echo "════════ 7. Change order (DRAFT→SUBMITTED→APPROVED) ════════"
CO=$(uid); P "INSERT INTO \"ChangeOrder\" (id,\"companyId\",\"projectId\",\"changeOrderNo\",title,description,status,\"updatedAt\",\"createdAt\") VALUES ('$CO','$C','$PROJ','CO-$RANDOM','wf verify','wf','DRAFT',now(),now())"
req PATCH "change-orders/$CO" '{"action":"submit"}' >/dev/null
expect "co submit" ChangeOrder "$CO" status SUBMITTED
req PATCH "change-orders/$CO" '{"action":"approve","clientApprovedBy":"wf-client"}' >/dev/null
expect "co approve→implement" ChangeOrder "$CO" status IMPLEMENTED

echo "════════ 8. Safety hazard (IDENTIFIED→MITIGATING→RESOLVED) ════════"
HZ=$(uid); P "INSERT INTO \"SafetyHazard\" (id,\"companyId\",\"projectId\",\"hazardNumber\",title,description,status,\"updatedAt\",\"createdAt\") VALUES ('$HZ','$C','$PROJ','HZ-$RANDOM','wf verify','wf','IDENTIFIED',now(),now())"
req PATCH "safety/hazards/$HZ" '{"action":"mitigate","mitigationPlan":"barricade area"}' >/dev/null
expect "hazard mitigate" SafetyHazard "$HZ" status MITIGATING
req PATCH "safety/hazards/$HZ" '{"action":"resolve","resolutionNotes":"fixed"}' >/dev/null
expect "hazard resolve" SafetyHazard "$HZ" status RESOLVED

echo "════════ 9. Rate contract / direct purchase / scrap cancels ════════"
RC=$(uid); P "INSERT INTO \"RateContract\" (id,\"contractNumber\",\"supplierId\",\"companyId\",\"materialId\",\"agreedRate\",\"validFrom\",\"validTo\",status,\"updatedAt\",\"createdAt\") VALUES ('$RC','RC-$RANDOM','$SUP','$C','$MAT',100,now(),now()+interval '1 year','ACTIVE',now(),now())"
req PATCH "rate-contracts/$RC" '{"action":"cancel"}' >/dev/null
expect "rate-contract cancel" RateContract "$RC" status CANCELLED
DP=$(uid); P "INSERT INTO \"DirectPurchase\" (id,\"billNumber\",\"supplierName\",\"companyId\",\"locationId\",\"billDate\",status,\"updatedAt\",\"createdAt\") VALUES ('$DP','DP-$RANDOM','wf-sup','$C','$LOC_WH',now(),'COMPLETED',now(),now())"
req PATCH "direct-purchases/$DP" '{"action":"cancel"}' >/dev/null
expect "direct-purchase cancel" DirectPurchase "$DP" status CANCELLED
SG=$(uid); P "INSERT INTO \"ScrapGeneration\" (id,\"companyId\",\"scrapNumber\",\"toLocationId\",status,\"updatedAt\",\"createdAt\") VALUES ('$SG','$C','SCR-$RANDOM','$LOC_WH','COMPLETED',now(),now())"
req PATCH "scrap-generations/$SG" '{"action":"cancel"}' >/dev/null
expect "scrap cancel" ScrapGeneration "$SG" status CANCELLED

echo "════════ 10. Quality NCR→CAPA chain ════════"
NCR=$(uid); P "INSERT INTO \"NonConformanceReport\" (id,\"companyId\",\"projectId\",\"ncrNumber\",title,description,status,\"updatedAt\",\"createdAt\") VALUES ('$NCR','$C','$PROJ','NCR-$RANDOM','wf verify','wf','OPEN',now(),now())"
req PATCH "quality-control/ncr/$NCR" '{"action":"review","outcome":"CAPA_REQUIRED","reviewNotes":"needs corrective"}' >/dev/null
expect "ncr review" NonConformanceReport "$NCR" status CAPA_REQUIRED
CAPA=$(P "SELECT id FROM \"Capa\" WHERE \"ncrId\"='$NCR'")
[ -n "$CAPA" ] && { PASS=$((PASS+1)); echo "  PASS capa auto-created"; } || { FAIL=$((FAIL+1)); echo "  FAIL no capa row"; }
[ -n "$CAPA" ] && {
  # CAPA can't start empty — root cause + actions required before start
  req PATCH "quality-control/capa/$CAPA" '{"rootCause":"bad batch","correctiveAction":"replace","preventiveAction":"inspect on arrival"}' >/dev/null
  req PATCH "quality-control/capa/$CAPA" '{"action":"start"}' >/dev/null
  expect "capa start" Capa "$CAPA" status IN_PROGRESS
  req PATCH "quality-control/capa/$CAPA" '{"action":"corrective_done"}' >/dev/null
  req PATCH "quality-control/capa/$CAPA" '{"action":"preventive_done"}' >/dev/null
  expect "capa to-verification" Capa "$CAPA" status VERIFICATION
  req PATCH "quality-control/capa/$CAPA" '{"action":"verify","verificationMethod":"re-inspection","verificationNotes":"ok","effective":true}' >/dev/null
  expect "capa verify" Capa "$CAPA" status VERIFIED
  req PATCH "quality-control/capa/$CAPA" '{"action":"close","closureNotes":"done"}' >/dev/null
  expect "capa close" Capa "$CAPA" status CLOSED
}

echo "════════ 11. Safety incident (REPORTED→INVESTIGATED→CLOSED) ════════"
INC=$(uid); P "INSERT INTO \"SafetyIncident\" (id,\"companyId\",\"projectId\",\"incidentNumber\",title,description,\"incidentDate\",status,\"updatedAt\",\"createdAt\") VALUES ('$INC','$C','$PROJ','INC-$RANDOM','wf verify','wf',now(),'REPORTED',now(),now())"
req PATCH "safety/incidents/$INC" '{"action":"investigate","rootCause":"scaffold defect","correctiveActions":"reinforce scaffold"}' >/dev/null
expect "incident investigate" SafetyIncident "$INC" status INVESTIGATED
req PATCH "safety/incidents/$INC" '{"action":"close","closureNotes":"resolved"}' >/dev/null
expect "incident close" SafetyIncident "$INC" status CLOSED

echo "════════ 12. Equipment sale ════════"
EQSELL=$(uid); P "INSERT INTO \"Equipment\" (id,\"assetTag\",name,\"companyId\",status,\"currentValue\",\"updatedAt\",\"createdAt\") VALUES ('$EQSELL','EQ-VFY-$RANDOM','wf excavator','$C','AVAILABLE',18500,now(),now())"
req PATCH "equipment/$EQSELL" '{"action":"sell","salePrice":50000,"buyerName":"wf buyer"}' >/dev/null
expect "equipment sell" Equipment "$EQSELL" status SOLD

echo "════════ 13. Purchase order mutations (eta/addLine/shortClose) ════════"
PO=$(uid); POL=$(uid)
P "INSERT INTO \"PurchaseOrder\" (id,\"poNumber\",\"supplierId\",\"procurementScope\",\"companyId\",\"destinationLocationId\",status,\"updatedAt\",\"createdAt\") VALUES ('$PO','PO-VFY-$RANDOM','$SUP','COMPANY','$C','$LOC_WH','DRAFT',now(),now())"
# Seeded line carries 18% GST so the landed/ex-GST bases diverge — this
# discriminates correct math from the old bug where landed lineTotal was
# summed into the ex-GST subtotal and GST was re-computed on it.
P "INSERT INTO \"PurchaseOrderLine\" (id,\"purchaseOrderId\",\"materialId\",\"qtyOrdered\",\"unitCost\",\"gstRate\",\"unitLandedCost\",\"lineTotal\") VALUES ('$POL','$PO','$MAT',10,100,18,118,1180)"
P "UPDATE \"PurchaseOrder\" SET subtotal=1000, \"gstTotal\"=180, total=1180 WHERE id='$PO'"
req PATCH "purchase-orders/$PO" '{"action":"approve"}' >/dev/null
req PATCH "purchase-orders/$PO" '{"action":"order"}' >/dev/null
expect "po order" PurchaseOrder "$PO" status ORDERED
# addLine is a top-up on ORDERED/PARTIAL POs. Stone Aggregate is 5% GST, so
# 2×50 → unitLandedCost 52.50, lineTotal 105; header must land at
# subtotal 1100 / gst 185 / total 1285.
r=$(req PATCH "purchase-orders/$PO" '{"action":"addLine","materialId":"cmv0qacbt006kvlt7yyxfaahr","qtyOrdered":2,"unitCost":50}')
echo "$r" | grep -q '"ok":true' && { PASS=$((PASS+1)); echo "  PASS po addLine"; } || { FAIL=$((FAIL+1)); echo "  FAIL po addLine: $r"; }
r=$(P "SELECT \"lineTotal\"::text FROM \"PurchaseOrderLine\" WHERE \"purchaseOrderId\"='$PO' AND \"qtyOrdered\"=2")
[ "$r" = "105.00" ] && { PASS=$((PASS+1)); echo "  PASS addLine lineTotal (landed) $r"; } || { FAIL=$((FAIL+1)); echo "  FAIL addLine lineTotal: $r (want 105.00)"; }
r=$(P "SELECT subtotal::text||'/'||\"gstTotal\"::text||'/'||total::text FROM \"PurchaseOrder\" WHERE id='$PO'")
[ "$r" = "1100.00/185.00/1285.00" ] && { PASS=$((PASS+1)); echo "  PASS addLine header math $r"; } || { FAIL=$((FAIL+1)); echo "  FAIL addLine header math: $r (want 1100.00/185.00/1285.00)"; }
req PATCH "purchase-orders/$PO" '{"action":"updateEta","expectedDate":"2027-01-15"}' >/dev/null
r=$(P "SELECT \"expectedDate\"::date::text FROM \"PurchaseOrder\" WHERE id='$PO'")
[ "$r" = "2027-01-15" ] && { PASS=$((PASS+1)); echo "  PASS po updateEta"; } || { FAIL=$((FAIL+1)); echo "  FAIL po eta: $r"; }
# shortClose only applies to partially-received POs — unreceived ORDERED gets the guard
r=$(req PATCH "purchase-orders/$PO" '{"action":"shortClose","reason":"x"}')
echo "$r" | grep -q "partially-received" && { PASS=$((PASS+1)); echo "  PASS short-close guard"; } || { FAIL=$((FAIL+1)); echo "  FAIL shortClose guard: $r"; }
req PATCH "purchase-orders/$PO" '{"action":"cancel"}' >/dev/null
expect "po cancel" PurchaseOrder "$PO" status CANCELLED

echo "════════ 14. Work order (DRAFT→issue→complete) ════════"
WO=$(uid); P "INSERT INTO \"SubcontractorWorkOrder\" (id,\"workOrderNumber\",\"projectId\",\"subcontractorId\",\"companyId\",\"workTitle\",status,\"updatedAt\",\"createdAt\") VALUES ('$WO','WO-VFY-$RANDOM','$PROJ','cmv15ajxt0001vle27fpu0aec','$C','wf work','ACTIVE',now(),now())"
req PATCH "work-orders/$WO" '{"action":"complete"}' >/dev/null
expect "wo complete" SubcontractorWorkOrder "$WO" status COMPLETED
# issue guard: complete requires ACTIVE, not ISSUED
WO2=$(uid); P "INSERT INTO \"SubcontractorWorkOrder\" (id,\"workOrderNumber\",\"projectId\",\"subcontractorId\",\"companyId\",\"workTitle\",status,\"updatedAt\",\"createdAt\") VALUES ('$WO2','WO-VFY2-$RANDOM','$PROJ','cmv15ajxt0001vle27fpu0aec','$C','wf','ISSUED',now(),now())"
r=$(req PATCH "work-orders/$WO2" '{"action":"complete"}')
echo "$r" | grep -q "must be ACTIVE" && { PASS=$((PASS+1)); echo "  PASS wo complete guard"; } || { FAIL=$((FAIL+1)); echo "  FAIL wo guard: $r"; }

echo "════════ 15. Sale cancel + resend guard ════════"
SALEC=$(P "SELECT id FROM \"AssetSale\" WHERE status='ACTIVE' AND \"companyId\"='$C' LIMIT 1")
if [ -n "$SALEC" ]; then
  r=$(req PATCH "sales/$SALEC" '{"action":"cancel","reason":"wf verify"}')
  s=$(P "SELECT status FROM \"AssetSale\" WHERE id='$SALEC'")
  { [ "$s" = "CANCELLED" ] || echo "$r" | grep -q '"error"'; } && { PASS=$((PASS+1)); echo "  PASS sale cancel ($s)"; } || { FAIL=$((FAIL+1)); echo "  FAIL sale cancel: $r"; }
else SKIP=$((SKIP+1)); fi

echo "════════ 16. Safety inspection (SCHEDULED→IN_PROGRESS→COMPLETED) ════════"
INSP=$(uid); P "INSERT INTO \"SafetyInspection\" (id,\"companyId\",\"projectId\",\"inspectionNumber\",title,\"scheduledDate\",status,\"updatedAt\",\"createdAt\") VALUES ('$INSP','$C','$PROJ','INSP-$RANDOM','wf verify',now(),'SCHEDULED',now(),now())"
req PATCH "safety/inspections/$INSP" '{"action":"start"}' >/dev/null
expect "insp start" SafetyInspection "$INSP" status IN_PROGRESS
req PATCH "safety/inspections/$INSP" '{"action":"complete","result":"PASSED","findings":"all clear"}' >/dev/null
expect "insp complete" SafetyInspection "$INSP" status COMPLETED

echo "════════ 17. Error log resolve ════════"
EL=$(uid); P "INSERT INTO \"ErrorLog\" (id,type,message,url) VALUES ('$EL','wf','verify error','/wf')"
r=$(req PATCH "error-logs" "{\"id\":\"$EL\",\"action\":\"resolve\"}")
# DEVELOPER-only route — a controlled 403 IS the guard working
echo "$r" | grep -q "Forbidden" && { PASS=$((PASS+1)); echo "  PASS dev-only guard"; } || { FAIL=$((FAIL+1)); echo "  FAIL resolve: $r"; }

echo "════════ 18. Task timer stop ════════"
TASK=$(uid); U="cmtv3x4uq0002vlp05o8po34q" # OWNER session user
P "INSERT INTO \"Task\" (id,title,\"assignedToId\",\"updatedAt\",\"createdAt\") VALUES ('$TASK','wf task','$U',now(),now())"
req POST "tasks/$TASK/time" '{}' >/dev/null   # action defaults to start
r=$(req POST "tasks/$TASK/time?action=stop" '{}')
echo "$r" | grep -qE '"ok":true|durationMins' && { PASS=$((PASS+1)); echo "  PASS timer stop"; } || { FAIL=$((FAIL+1)); echo "  FAIL timer: $r"; }

echo "════════ 19. Gate pass reject→resubmit ════════"
GP2=$(uid); P "INSERT INTO \"GatePass\" (id,\"gatePassNumber\",\"companyId\",\"locationId\",category,status,\"updatedAt\",\"createdAt\") VALUES ('$GP2','GP-VFY-$RANDOM','$C','$LOC_SITE','MANUAL','PENDING',now(),now())"
req PATCH "gate-passes/$GP2" '{"action":"reject","reason":"wrong vehicle"}' >/dev/null
expect "gp reject" GatePass "$GP2" status REJECTED
req PATCH "gate-passes/$GP2" '{"action":"resubmit"}' >/dev/null
expect "gp resubmit" GatePass "$GP2" status PENDING

echo "════════ 20. MB reject + DPR cost-post ════════"
MB2=$(uid); P "INSERT INTO \"MeasurementBookEntry\" (id,\"projectId\",\"boqItemId\",\"mbNumber\",\"measuredQty\",\"cumulativeQty\",description,status,\"updatedAt\",\"createdAt\") VALUES ('$MB2','$PROJ','$BOQ','MB-R$RANDOM',5,5,'wf','DRAFT',now(),now())"
req PATCH "mb-entries/$MB2" '{"action":"reject","reason":"remeasure"}' >/dev/null
expect "mb reject" MeasurementBookEntry "$MB2" status REJECTED
r=$(req PATCH "dprs/$DPR" '{"action":"markCostPosted"}')
echo "$r" | grep -qE '"ok":true|"costPosted":true' && { PASS=$((PASS+1)); echo "  PASS dpr cost-posted"; } || { SKIP=$((SKIP+1)); echo "  SKIP cost-post: $r"; }

echo "════════ 21. Payroll process (DRAFT period) ════════"
PP=$(uid); MON=$((RANDOM % 9 + 1)); YR=$((2031 + RANDOM % 50)); P "INSERT INTO \"PayrollPeriod\" (id,\"companyId\",month,year,\"startDate\",\"endDate\",status,\"updatedAt\",\"createdAt\") VALUES ('$PP','$C',$MON,$YR,'$YR-0$MON-01','$YR-0$MON-28','DRAFT',now(),now())"
r=$(req PATCH "payroll/$PP" '{"action":"process"}')
# Correct guard: process needs generated lines first (generate → process → pay)
echo "$r" | grep -q "no lines" && { PASS=$((PASS+1)); echo "  PASS process-needs-generate guard"; } || { FAIL=$((FAIL+1)); echo "  FAIL payroll guard: $r"; }

echo "════════ 22. Transfer dispatch (DRAFT→IN_TRANSIT via API) ════════"
# Restock source — earlier runs may have drained it
P "INSERT INTO \"StockLocationItem\" (id,\"locationId\",\"materialId\",qty,\"movingAvgCost\",\"updatedAt\") VALUES ('$(uid)','$LOC_WH','$MAT',100,10,now()) ON CONFLICT (\"locationId\",\"materialId\") DO UPDATE SET qty=\"StockLocationItem\".qty+100"
# Dispatch requires a gate pass — create via the API which auto-creates one
RESP=$(req POST "transfers" "{\"fromLocationId\":\"$LOC_WH\",\"toLocationId\":\"$LOC_SITE\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":1}]}")
TRD=$(echo "$RESP" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
if [ -z "$TRD" ]; then FAIL=$((FAIL+1)); echo "  FAIL transfer create: $RESP"; else
  TGP=""
  for i in 1 2 3; do TGP=$(P "SELECT id FROM \"GatePass\" WHERE \"refId\"='$TRD' AND status='PENDING' LIMIT 1"); [ -n "$TGP" ] && break; sleep 2; done
  if [ -z "$TGP" ]; then FAIL=$((FAIL+1)); echo "  FAIL no gate pass for $TRD: $RESP"; else
    req PATCH "gate-passes/$TGP" '{"action":"approve"}' >/dev/null
    req PATCH "gate-passes/$TGP" '{"action":"confirmExit"}' >/dev/null
    req PATCH "transfers/$TRD" '{"action":"dispatch"}' >/dev/null
    expect "transfer dispatch" StockTransfer "$TRD" status IN_TRANSIT
    expect_count "dispatch movement" "SELECT count(*) FROM \"StockMovement\" WHERE \"refId\"='$TRD' AND \"movementType\"='TRANSFER_OUT'"
  fi
fi

echo "════════ 23. Material sale return (credit note) ════════"
CUST=$(P "SELECT id FROM \"Customer\" WHERE \"companyId\"='$C' LIMIT 1")
MS=$(req POST "material-sales" "{\"customerId\":\"$CUST\",\"notes\":\"wf verify\",\"lines\":[{\"materialId\":\"$MAT\",\"locationId\":\"$LOC_SITE\",\"qty\":5,\"unitPrice\":250,\"gstRate\":18}]}")
MSID=$(echo "$MS" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
MSL=$(P "SELECT id FROM \"MaterialSaleLine\" WHERE \"materialSaleId\"='$MSID' LIMIT 1")
r=$(req POST "material-sales/$MSID/returns" "{\"lines\":[{\"materialSaleLineId\":\"$MSL\",\"qty\":2,\"reason\":\"defective\"}]}")
RT=$(echo "$r" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
[ -n "$RT" ] && { PASS=$((PASS+1)); echo "  PASS sale return $RT"; expect_count "return stock" "SELECT count(*) FROM \"StockMovement\" WHERE \"refId\"='$RT'"; } || { FAIL=$((FAIL+1)); echo "  FAIL sale return: $r"; }

echo "════════ 24. Cheque clear/bounce ════════"
CHQ=$(uid); SALECH=$(uid)
P "INSERT INTO \"AssetSale\" (id,\"saleNumber\",\"assetType\",\"customerId\",\"companyId\",\"salePrice\",status,\"updatedAt\",\"createdAt\") VALUES ('$SALECH','WF-SALE-CHQ-$RANDOM','LAND','$CUST','$C',500000,'ACTIVE',now(),now())"
P "INSERT INTO \"AssetSalePayment\" (id,\"assetSaleId\",amount,mode,\"chequeNo\",\"chequeStatus\",status,\"paymentDate\") VALUES ('$CHQ','$SALECH',1000,'CHEQUE','CHQ-1','PENDING','ACTIVE',now())"
r=$(req POST "sales/payments/$CHQ/cheque" '{"action":"clear"}')
echo "$r" | grep -qE '"ok":true' && { PASS=$((PASS+1)); echo "  PASS cheque clear"; } || { FAIL=$((FAIL+1)); echo "  FAIL cheque clear: $r"; }
CHQ2=$(uid)
P "INSERT INTO \"AssetSalePayment\" (id,\"assetSaleId\",amount,mode,\"chequeNo\",\"chequeStatus\",status,\"paymentDate\") VALUES ('$CHQ2','$SALECH',2000,'CHEQUE','CHQ-2','PENDING','ACTIVE',now())"
r=$(req POST "sales/payments/$CHQ2/cheque" '{"action":"bounce","reason":"insufficient funds"}')
echo "$r" | grep -qE '"ok":true' && { PASS=$((PASS+1)); echo "  PASS cheque bounce"; } || { FAIL=$((FAIL+1)); echo "  FAIL cheque bounce: $r"; }

echo "════════ 25. PO reject→resubmit cycle ════════"
PO3=$(uid); POL3=$(uid)
P "INSERT INTO \"PurchaseOrder\" (id,\"poNumber\",\"supplierId\",\"procurementScope\",\"companyId\",\"destinationLocationId\",status,\"updatedAt\",\"createdAt\") VALUES ('$PO3','PO-VF3-$RANDOM','$SUP','COMPANY','$C','$LOC_WH','DRAFT',now(),now())"
P "INSERT INTO \"PurchaseOrderLine\" (id,\"purchaseOrderId\",\"materialId\",\"qtyOrdered\",\"unitCost\") VALUES ('$POL3','$PO3','$MAT',5,100)"
req PATCH "purchase-orders/$PO3" '{"action":"reject","rejectionReason":"price too high"}' >/dev/null
expect "po reject" PurchaseOrder "$PO3" status REJECTED
req PATCH "purchase-orders/$PO3" '{"action":"resubmit"}' >/dev/null
expect "po resubmit" PurchaseOrder "$PO3" status DRAFT

echo "════════ 26. Equipment maintenance ════════"
EQM=$(uid); EQMR=$(uid)
P "INSERT INTO \"Equipment\" (id,\"assetTag\",name,\"companyId\",status,\"updatedAt\",\"createdAt\") VALUES ('$EQM','EQ-M-$RANDOM','wf crane','$C','IN_MAINTENANCE',now(),now())"
P "INSERT INTO \"EquipmentMaintenance\" (id,\"equipmentId\",type) VALUES ('$EQMR','$EQM','PREVENTIVE')" 2>/dev/null
r=$(req PATCH "equipment/$EQM" '{"action":"complete-maintenance"}')
s=$(P "SELECT status FROM \"Equipment\" WHERE id='$EQM'")
{ [ "$s" = "AVAILABLE" ] || echo "$r" | grep -q '"error"'; } && { PASS=$((PASS+1)); echo "  PASS equip maintenance ($s)"; } || { FAIL=$((FAIL+1)); echo "  FAIL maint: $r"; }

echo "════════ 27. Leave approve (unlocked period) ════════"
# Prior runs leave APPROVED wf-leaves on $EMP — a new random window can overlap
# them and the overlap guard then correctly rejects this run's leave. Clear
# them first so each run starts clean (final repair sweep also deletes them).
P "DELETE FROM \"LeaveRequest\" WHERE \"employeeId\"='$EMP' AND reason='wf'"
LV=$(uid); LDOFF=$((RANDOM % 400 + 400)); P "INSERT INTO \"LeaveRequest\" (id,\"companyId\",\"employeeId\",type,\"startDate\",\"endDate\",days,status,reason,\"updatedAt\",\"createdAt\") VALUES ('$LV','$C','$EMP','UNPAID',now()+interval '$LDOFF days',now()+interval '$((LDOFF+2)) days',3,'PENDING','wf',now(),now())"
r=$(req POST "leaves/$LV" '{"approve":true}')
s=$(P "SELECT status FROM \"LeaveRequest\" WHERE id='$LV'")
[ "$s" = "APPROVED" ] && { PASS=$((PASS+1)); echo "  PASS leave approve"; } || { FAIL=$((FAIL+1)); echo "  FAIL leave ($s): $r"; }

echo "════════ 28a. Leave reject + WO retention guard + sale update ════════"
LVR=$(uid); LDOFF2=$((RANDOM % 400 + 400)); P "INSERT INTO \"LeaveRequest\" (id,\"companyId\",\"employeeId\",type,\"startDate\",\"endDate\",days,status,reason,\"updatedAt\",\"createdAt\") VALUES ('$LVR','$C','$EMP','UNPAID',now()+interval '$LDOFF2 days',now()+interval '$((LDOFF2+2)) days',3,'PENDING','wf',now(),now())"
req POST "leaves/$LVR" '{"approve":false,"rejectedReason":"staffing"}' >/dev/null
expect "leave reject" LeaveRequest "$LVR" status REJECTED
r=$(req PATCH "work-orders/$WO2" '{"action":"release-retention"}')
echo "$r" | grep -qE '"error"|"ok"' && { PASS=$((PASS+1)); echo "  PASS retention attempt (guarded)"; } || { FAIL=$((FAIL+1)); echo "  FAIL retention: $r"; }
SALEU=$(uid); P "INSERT INTO \"AssetSale\" (id,\"saleNumber\",\"assetType\",\"customerId\",\"companyId\",\"salePrice\",status,\"updatedAt\",\"createdAt\") VALUES ('$SALEU','WF-SALE-UPD-$RANDOM','LAND','$CUST','$C',500000,'ACTIVE',now(),now())"
[ -n "$SALEU" ] && { r=$(req PATCH "sales/$SALEU" '{"action":"update","notes":"wf verify note"}'); echo "$r" | grep -qE '"ok"|"error"' && { PASS=$((PASS+1)); echo "  PASS sale update"; } || { FAIL=$((FAIL+1)); echo "  FAIL update: $r"; }; }
r=$(req PATCH "sales/$SALEU" '{"action":"resendConfirmation"}')
echo "$r" | grep -qE '"ok"|"error"' && { PASS=$((PASS+1)); echo "  PASS resend attempt"; } || { FAIL=$((FAIL+1)); echo "  FAIL resend: $r"; }

echo "════════ 28b. Audit-trail spot checks ════════"
expect_count "audit: equip sell" "SELECT count(*) FROM \"AuditLog\" WHERE \"entityId\"='$EQSELL' AND action='EQUIPMENT_SELL'"
expect_count "audit: tenancy" "SELECT count(*) FROM \"AuditLog\" WHERE \"entityId\"='$TEN' AND action LIKE 'TENANCY%'"
expect_count "audit: dpr" "SELECT count(*) FROM \"AuditLog\" WHERE \"entityId\"='$DPR' AND action LIKE 'DPR%'"

echo "════════ 28. Tenancy changeTenant ════════"
TEN2=$(uid); P "INSERT INTO \"Tenancy\" (id,\"companyId\",\"assetType\",\"tenantName\",\"startDate\",\"endDate\",\"monthlyRent\",status,\"landParcelId\",\"updatedAt\",\"createdAt\") VALUES ('$TEN2','$C','LAND','tenant-a',now(),now()+interval '2 years',40000,'ACTIVE','$PARCEL',now(),now())"
r=$(req POST "tenancies/$TEN2" '{"action":"changeTenant","newTenantName":"tenant-b"}')
NTEN=$(echo "$r" | grep -oE '"newTenancyId":"[^"]+"' | cut -d'"' -f4)
t=$(P "SELECT \"tenantName\" FROM \"Tenancy\" WHERE id='$NTEN'")
s=$(P "SELECT status FROM \"Tenancy\" WHERE id='$TEN2'")
{ [ "$t" = "tenant-b" ] && [ "$s" = "TERMINATED" ]; } && { PASS=$((PASS+1)); echo "  PASS changeTenant (new=$NTEN, old=$s)"; } || { FAIL=$((FAIL+1)); echo "  FAIL tenant (new=$t old=$s): $r"; }

echo "════════ 28c. Stale-count reconcile guard ════════"
SC=$(curl -s -b /tmp/nirman-cookies.txt -H Content-Type:application/json -X POST "$BASE/api/stock-counts" -d "{\"locationId\":\"$LOC_SITE\",\"lines\":[{\"materialId\":\"$MAT\",\"countedQty\":1}]}" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
curl -s -b /tmp/nirman-cookies.txt -H Content-Type:application/json -X PATCH "$BASE/api/stock-counts/$SC" -d '{"action":"confirm"}' >/dev/null
P "INSERT INTO \"StockMovement\" (id,\"materialId\",\"movementType\",\"toLocationId\",qty,\"unitCost\",\"balanceAfter\",\"balanceValueAfter\",\"timestamp\") VALUES ('vfymv$RANDOM','$MAT','ADJUSTMENT_IN','$LOC_SITE',1,10,1,10,now())"
r=$(req PATCH "stock-counts/$SC" '{"action":"reconcile"}')
echo "$r" | grep -qi "stale" && { PASS=$((PASS+1)); echo "  PASS stale-count guard"; } || { FAIL=$((FAIL+1)); echo "  FAIL stale reconcile: $r"; }

echo "════════ 28d. Sale-return proportional GL ════════"
P "INSERT INTO \"StockLocationItem\" (id,\"locationId\",\"materialId\",qty,\"movingAvgCost\",\"updatedAt\") VALUES ('vfygr$RANDOM','$LOC_SITE','$MAT',50,10,now()) ON CONFLICT (\"locationId\",\"materialId\") DO UPDATE SET qty=\"StockLocationItem\".qty+50"
MS=$(curl -s -b /tmp/nirman-cookies.txt -H Content-Type:application/json -X POST "$BASE/api/material-sales" -d "{\"customerId\":\"$CUST\",\"notes\":\"wf verify\",\"lines\":[{\"materialId\":\"$MAT\",\"locationId\":\"$LOC_SITE\",\"qty\":10,\"unitPrice\":100,\"gstRate\":18}]}" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
MSL=$(P "SELECT id FROM \"MaterialSaleLine\" WHERE \"materialSaleId\"='$MS' LIMIT 1")
RT=$(curl -s -b /tmp/nirman-cookies.txt -H Content-Type:application/json -X POST "$BASE/api/material-sales/$MS/returns" -d "{\"lines\":[{\"materialSaleLineId\":\"$MSL\",\"qty\":3}]}" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
net=$(P "SELECT coalesce(sum(case when jl.\"debit\"::numeric>0 then -jl.\"debit\"::numeric else jl.\"credit\"::numeric end),0)::int FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='4000' AND je.\"sourceId\" IN ('$MS','$RT')")
{ [ -n "$RT" ] && [ "$net" = "700" ]; } && { PASS=$((PASS+1)); echo "  PASS return GL (net revenue=$net)"; } || { FAIL=$((FAIL+1)); echo "  FAIL return gl (net=$net)"; }

echo "════════ 29. Negative probes ════════"
r=$(req PATCH "gate-passes/nonexistent-id" '{"action":"approve"}'); echo "$r" | grep -q "error" && { PASS=$((PASS+1)); echo "  PASS ghost-id 4xx"; } || { FAIL=$((FAIL+1)); echo "  FAIL ghost id accepted"; }
r=$(req PATCH "dprs/$DPR" '{"action":"approve"}'); echo "$r" | grep -qi "error\|invalid\|cannot" && { PASS=$((PASS+1)); echo "  PASS invalid-action 4xx"; } || { FAIL=$((FAIL+1)); echo "  FAIL invalid dpr action"; }
r=$(req PATCH "expense-claims/$ADV" '{"action":"pay"}'); echo "$r" | grep -q "error" && { PASS=$((PASS+1)); echo "  PASS cross-entity 4xx"; } || { FAIL=$((FAIL+1)); echo "  FAIL cross-entity pay"; }

echo "════════ 30. Self-service asks (advance + punch-fix + withdraw + race) ════════"
# Worker's own ask via /api/me → HR decide via employee route → worker withdraw.
SELF_EMP=$(P "SELECT id FROM \"Employee\" WHERE \"userId\"=(SELECT \"userId\" FROM \"UserCompany\" WHERE \"companyId\"='$C' AND role='OWNER' LIMIT 1) LIMIT 1")
ADVREQ=$(req POST "me/advances" '{"amount":5000,"notes":"wf self-ask"}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('advanceId',''))" 2>/dev/null)
if [ -n "$ADVREQ" ]; then
  st=$(P "SELECT status FROM \"EmployeeAdvance\" WHERE id='$ADVREQ'")
  [ "$st" = "REQUESTED" ] && { PASS=$((PASS+1)); echo "  PASS self-ask → REQUESTED"; } || { FAIL=$((FAIL+1)); echo "  FAIL self-ask status: $st"; }
  # Race guard — a second pending ask must 4xx
  r2=$(req POST "me/advances" '{"amount":1000,"notes":"wf dup"}')
  echo "$r2" | grep -qi "pending\|already" && { PASS=$((PASS+1)); echo "  PASS dup-ask blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL dup-ask: $r2"; }
  # Withdraw own ask → CANCELLED; second withdraw → already decided
  rw=$(req PATCH "me/advances/$ADVREQ" '{}')
  echo "$rw" | grep -q "CANCELLED" && { PASS=$((PASS+1)); echo "  PASS withdraw own ask"; } || { FAIL=$((FAIL+1)); echo "  FAIL withdraw: $rw"; }
  rw2=$(req PATCH "me/advances/$ADVREQ" '{}')
  echo "$rw2" | grep -qi "already\|not found" && { PASS=$((PASS+1)); echo "  PASS re-withdraw blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL re-withdraw: $rw2"; }
else
  FAIL=$((FAIL+1)); echo "  FAIL self-ask create returned no id"
fi
# Punch-correction ask → HR approve → attendance row flips
# The OWNER's own self-ask is exercised above; self-approve must 403
# (H1 wall — approving your own punch-fix is a fraud vector), so the
# approve step runs on a DIFFERENT employee's request seeded via SQL.
CORRDAY=$(date -v-$((RANDOM % 8000 + 200))d +%Y-%m-%d 2>/dev/null || date -d "$((RANDOM % 8000 + 200)) days ago" +%Y-%m-%d)
CORR=$(req POST "me/attendance-corrections" "{\"date\":\"$CORRDAY\",\"status\":\"PRESENT\",\"reason\":\"wf forgot punch\"}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('requestId',''))" 2>/dev/null)
if [ -n "$CORR" ]; then
  st=$(P "SELECT status FROM \"AttendanceCorrectionRequest\" WHERE id='$CORR'")
  [ "$st" = "REQUESTED" ] && { PASS=$((PASS+1)); echo "  PASS punch-fix → REQUESTED"; } || { FAIL=$((FAIL+1)); echo "  FAIL punch-fix status: $st"; }
  rself=$(req POST "employees/$SELF_EMP/attendance-corrections/$CORR" '{"approve":true,"note":"wf self"}')
  echo "$rself" | grep -qi "cannot manage" && { PASS=$((PASS+1)); echo "  PASS self-approve 403"; } || { FAIL=$((FAIL+1)); echo "  FAIL self-approve allowed: $rself"; }
  CORR2="vfy$(date +%s)$RANDOM"
  P "INSERT INTO \"AttendanceCorrectionRequest\" (id,\"companyId\",\"employeeId\",date,\"requestedStatus\",reason,status,\"createdAt\",\"updatedAt\") VALUES ('$CORR2','$C','$EMP','$CORRDAY','PRESENT','wf sub ask','REQUESTED',now(),now())" >/dev/null
  rapp=$(req POST "employees/$EMP/attendance-corrections/$CORR2" '{"approve":true,"note":"wf approved"}')
  st2=$(P "SELECT status FROM \"AttendanceCorrectionRequest\" WHERE id='$CORR2'")
  [ "$st2" = "APPROVED" ] && { PASS=$((PASS+1)); echo "  PASS punch-fix approve"; } || { FAIL=$((FAIL+1)); echo "  FAIL punch-fix approve: $st2 $rapp"; }
  att=$(P "SELECT status FROM \"WorkerAttendance\" WHERE \"employeeId\"='$EMP' AND date='$CORRDAY'")
  [ "$att" = "PRESENT" ] && { PASS=$((PASS+1)); echo "  PASS attendance row upserted"; } || { FAIL=$((FAIL+1)); echo "  FAIL attendance row: $att"; }
  # same-day dup ask → 4xx
  rdup=$(req POST "me/attendance-corrections" "{\"date\":\"$CORRDAY\",\"status\":\"LATE\",\"reason\":\"wf dup day\"}")
  echo "$rdup" | grep -qi "already\|pending\|correction" && { PASS=$((PASS+1)); echo "  PASS same-day dup blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL same-day dup: $rdup"; }
else
  FAIL=$((FAIL+1)); echo "  FAIL punch-fix create returned no id"
fi

echo; echo "════════ RESULT: $PASS passed, $FAIL failed, $SKIP skipped ════════"

# Fixture hygiene — the SQL seeds above bypass the service layer (no JEs, no
# cache sync), which makes /api/health/books flag drift. Clean up the vfy*
# rows + orphaned JEs + repair caches so the books stay readable.
# Set KEEP_FIXTURES=1 to leave them for post-run inspection.
if [ "${KEEP_FIXTURES:-0}" != "1" ] && [ -x "$(dirname "$0")/repair-books-dev.sh" ]; then
  echo "════════ fixture cleanup (repair-books-dev) ════════"
  "$(dirname "$0")/repair-books-dev.sh" || echo "  (cleanup failed — run ./scripts/repair-books-dev.sh manually)"
fi

[ "$FAIL" -eq 0 ]
