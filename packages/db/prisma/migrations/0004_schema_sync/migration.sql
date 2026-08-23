-- Migration 0004: Sync all schema changes since 0003
-- CreateEnum
CREATE TYPE "MaterialIssueStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DirectPurchaseStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScrapGenerationStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LandPurchaseMode" AS ENUM ('WHOLE', 'SUBDIVIDED', 'BOOKED');

-- CreateEnum
CREATE TYPE "LandType" AS ENUM ('FREEHOLD', 'LEASEHOLD');

-- CreateEnum
CREATE TYPE "LeaseType" AS ENUM ('ONE_TIME', 'YEARLY');

-- CreateEnum
CREATE TYPE "LandPaymentScheduleItemStatus" AS ENUM ('PENDING', 'DUE', 'PARTIAL', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "LandParcelPurpose" AS ENUM ('SELL', 'PROJECT', 'HOLD');

-- CreateEnum
CREATE TYPE "DeliveryTerms" AS ENUM ('DELIVERED_SITE', 'EX_WORKS', 'FOR_STATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "QuotationRequestStatus" AS ENUM ('OPEN', 'QUOTES_COLLECTED', 'APPROVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteSource" AS ENUM ('DOCUMENT', 'EMAIL', 'VERBAL', 'WHATSAPP', 'LETTER', 'EXCEL');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('PORTAL', 'WALK_IN', 'REFERRAL', 'BROKER', 'DIGITAL_AD', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'SITE_VISIT', 'NEGOTIATION', 'BOOKED', 'LOST');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'HOT');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'SITE_VISIT', 'NOTE', 'STAGE_CHANGE');

-- CreateEnum
CREATE TYPE "SaleExpenseHead" AS ENUM ('REGISTRY', 'STAMP_DUTY', 'TRANSFER', 'LEASE_RENT', 'GST', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseBorneBy" AS ENUM ('CLIENT', 'SELLER', 'NA');

-- CreateEnum
CREATE TYPE "DealSource" AS ENUM ('SELF', 'BROKER');

-- CreateEnum
CREATE TYPE "RateAnalysisComponentType" AS ENUM ('MATERIAL', 'LABOUR', 'EQUIPMENT', 'OVERHEAD', 'PROFIT', 'OTHER');

-- CreateEnum
CREATE TYPE "RateAnalysisLineBasis" AS ENUM ('QUANTITY', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "ChangeOrderType" AS ENUM ('ADDITION', 'DELETION', 'MODIFICATION', 'ACCELERATION', 'DECELERATION', 'VARIATION');

-- CreateEnum
CREATE TYPE "ChangeOrderReason" AS ENUM ('CLIENT_REQUEST', 'SITE_CONDITION', 'DESIGN_CHANGE', 'ERROR_OMISSION', 'REGULATORY', 'VALUE_ENGINEERING', 'OTHER');

-- CreateEnum
CREATE TYPE "ChangeOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NcrSeverity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR', 'OBSERVATION');

-- CreateEnum
CREATE TYPE "NcrStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CAPA_REQUIRED', 'ACCEPTED', 'REJECTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NcrCategory" AS ENUM ('MATERIAL', 'WORKMANSHIP', 'DESIGN', 'DOCUMENT', 'PROCESS', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "CapaStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'VERIFICATION', 'VERIFIED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('ACCIDENT', 'NEAR_MISS', 'INJURY', 'FATALITY', 'PROPERTY_DAMAGE', 'ENVIRONMENTAL', 'FIRE', 'STRUCTURAL', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('FIRST_AID', 'LOST_TIME', 'SERIOUS', 'FATAL', 'PROPERTY_ONLY');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'UNDER_INVESTIGATION', 'INVESTIGATED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HazardStatus" AS ENUM ('IDENTIFIED', 'MITIGATING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "HazardRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASSED', 'PASSED_WITH_NOTES', 'FAILED', 'STOP_WORK');

-- CreateEnum
CREATE TYPE "SafetyInspectionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GatePassStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXITED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GatePassCategory" AS ENUM ('MATERIAL_ISSUE', 'STOCK_TRANSFER', 'MATERIAL_SALE', 'SUPPLIER_RETURN', 'MANUAL');

-- CreateEnum
CREATE TYPE "LegalDocType" AS ENUM ('OWNERSHIP_CERTIFICATE', 'NON_ENCUMBRANCE', 'LAND_SANCTION', 'MUTATION_ENTRY', 'AGREEMENT_TO_SELL', 'TRANSFER_DUTY', 'BUDGET_APPROVAL', 'LAYOUT_APPROVAL', 'BUILDING_PERMISSION', 'ENVIRONMENTAL_CLEARANCE', 'POLLUTION_NOC_ESTABLISH', 'POLLUTION_NOC_OPERATE', 'FIRE_NOC', 'TREE_CUTTING_NOC', 'AIRPORT_NOC', 'DRAINAGE_NOC', 'ELECTRICITY_NOC', 'WATER_NOC', 'COMMENCEMENT_CERTIFICATE', 'RERA_REGISTRATION', 'PLINTH_CERTIFICATE', 'COMPLETION_CERTIFICATE', 'OCCUPANCY_CERTIFICATE', 'FUNCTIONAL_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "LegalDocStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'RENEWAL_DUE');

-- CreateEnum
CREATE TYPE "LegalDocAppliesTo" AS ENUM ('LAND', 'PROJECT', 'BOTH');

-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'PROJECT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttendanceStatus" ADD VALUE 'LATE';
ALTER TYPE "AttendanceStatus" ADD VALUE 'PAID_LEAVE';
ALTER TYPE "AttendanceStatus" ADD VALUE 'NON_PAID_LEAVE';

-- AlterEnum
ALTER TYPE "ProjectCostType" ADD VALUE 'TRANSFER_DUTY';

-- AlterEnum
ALTER TYPE "SaleStatus" ADD VALUE 'PENDING';

-- AlterEnum
ALTER TYPE "StockLocationType" ADD VALUE 'CENTRAL_WAREHOUSE';

-- DropForeignKey
ALTER TABLE "AssetSale" DROP CONSTRAINT "AssetSale_projectId_fkey";

-- AlterTable
ALTER TABLE "AssetSale" ADD COLUMN     "allotmentDate" TIMESTAMP(3),
ADD COLUMN     "allotmentDocumentName" TEXT,
ADD COLUMN     "allotmentDocumentUrl" TEXT,
ADD COLUMN     "allotmentLetterNo" TEXT,
ADD COLUMN     "atsDocumentName" TEXT,
ADD COLUMN     "atsDocumentUrl" TEXT,
ADD COLUMN     "bbaDate" TIMESTAMP(3),
ADD COLUMN     "bbaDocumentName" TEXT,
ADD COLUMN     "bbaDocumentUrl" TEXT,
ADD COLUMN     "bbaNo" TEXT,
ADD COLUMN     "brokerId" TEXT,
ADD COLUMN     "brokerName" TEXT,
ADD COLUMN     "brokerPhone" TEXT,
ADD COLUMN     "commissionAmount" DECIMAL(14,2),
ADD COLUMN     "commissionIsPartOfDeal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "commissionPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "commissionPaidDate" TIMESTAMP(3),
ADD COLUMN     "dealMaturityDate" TIMESTAMP(3),
ADD COLUMN     "dealMaturityMonths" INTEGER,
ADD COLUMN     "dealSource" "DealSource" NOT NULL DEFAULT 'SELF',
ADD COLUMN     "expectedRegistryDate" TIMESTAMP(3),
ADD COLUMN     "homeLoanAmount" DECIMAL(14,2),
ADD COLUMN     "homeLoanBank" TEXT,
ADD COLUMN     "homeLoanSanctionDate" TIMESTAMP(3),
ADD COLUMN     "homeLoanSanctionNo" TEXT,
ADD COLUMN     "paymentCycle" TEXT,
ADD COLUMN     "registryDocumentName" TEXT,
ADD COLUMN     "registryDocumentUrl" TEXT,
ADD COLUMN     "saleDeedNo" TEXT,
ADD COLUMN     "tdsAmount" DECIMAL(14,2),
ADD COLUMN     "tdsCertificateNo" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AssetSalePayment" ADD COLUMN     "chequeBank" TEXT,
ADD COLUMN     "chequeBounceReason" TEXT,
ADD COLUMN     "chequeClearDate" TIMESTAMP(3),
ADD COLUMN     "chequeDate" TIMESTAMP(3),
ADD COLUMN     "chequeNo" TEXT,
ADD COLUMN     "chequePhotoUrl" TEXT,
ADD COLUMN     "chequeStatus" TEXT;

-- AlterTable
ALTER TABLE "DirectPurchase" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "driverPhone" TEXT,
ADD COLUMN     "status" "DirectPurchaseStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "vehicleNumber" TEXT,
ADD COLUMN     "vehiclePhotoUrl" TEXT,
ADD COLUMN     "vehicleType" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "hierarchyLevel" INTEGER,
ADD COLUMN     "reportingLocationId" TEXT;

-- AlterTable
ALTER TABLE "GoodsReceipt" ADD COLUMN     "challanNumber" TEXT,
ADD COLUMN     "damageRemarks" TEXT,
ADD COLUMN     "deliveryMode" TEXT,
ADD COLUMN     "deliveryTermsType" TEXT,
ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "driverPhone" TEXT,
ADD COLUMN     "ewayBillNumber" TEXT,
ADD COLUMN     "gateInAt" TIMESTAMP(3),
ADD COLUMN     "gatePassNo" TEXT,
ADD COLUMN     "geoFenceDistance" DOUBLE PRECISION,
ADD COLUMN     "geoFenceOk" BOOLEAN,
ADD COLUMN     "grossWeight" DECIMAL(14,3),
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "lrNumber" TEXT,
ADD COLUMN     "netWeight" DECIMAL(14,3),
ADD COLUMN     "packageCount" INTEGER,
ADD COLUMN     "photos" JSONB,
ADD COLUMN     "receiverLat" DOUBLE PRECISION,
ADD COLUMN     "receiverLng" DOUBLE PRECISION,
ADD COLUMN     "receiverLocation" TEXT,
ADD COLUMN     "receiverSignature" TEXT,
ADD COLUMN     "receivingPhotoUrl" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectionPhotos" JSONB,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "shortageRemarks" TEXT,
ADD COLUMN     "supervisorId" TEXT,
ADD COLUMN     "supervisorSignature" TEXT,
ADD COLUMN     "tareWeight" DECIMAL(14,3),
ADD COLUMN     "transporterName" TEXT,
ADD COLUMN     "unloadedAt" TIMESTAMP(3),
ADD COLUMN     "unloadedById" TEXT,
ADD COLUMN     "unloadingLocation" TEXT,
ADD COLUMN     "unloadingRemarks" TEXT,
ADD COLUMN     "unloadingSlipNo" TEXT,
ADD COLUMN     "vehicleNumber" TEXT,
ADD COLUMN     "vehicleType" TEXT,
ADD COLUMN     "weighbridgeTicketNo" TEXT;

-- AlterTable
ALTER TABLE "GoodsReceiptLine" ADD COLUMN     "batchCode" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "inspectionRemarks" TEXT,
ADD COLUMN     "inspectionStatus" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "lotNumber" TEXT,
ADD COLUMN     "manufacturingDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LandParcel" ADD COLUMN     "purpose" "LandParcelPurpose" NOT NULL DEFAULT 'HOLD';

-- AlterTable
ALTER TABLE "LandPurchase" ADD COLUMN     "atsDocumentName" TEXT,
ADD COLUMN     "atsDocumentUrl" TEXT,
ADD COLUMN     "baseCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "brokerageAmount" DECIMAL(14,2),
ADD COLUMN     "gstAmount" DECIMAL(14,2),
ADD COLUMN     "gstPercent" DECIMAL(5,2),
ADD COLUMN     "isPossessed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "landType" "LandType" NOT NULL DEFAULT 'FREEHOLD',
ADD COLUMN     "leaseEndDate" TIMESTAMP(3),
ADD COLUMN     "leasePeriodYears" INTEGER,
ADD COLUMN     "leaseRentAmount" DECIMAL(14,2),
ADD COLUMN     "leaseRentPercent" DECIMAL(5,2),
ADD COLUMN     "leaseStartDate" TIMESTAMP(3),
ADD COLUMN     "leaseType" "LeaseType",
ADD COLUMN     "legalFees" DECIMAL(14,2),
ADD COLUMN     "mode" "LandPurchaseMode" NOT NULL DEFAULT 'WHOLE',
ADD COLUMN     "otherCharges" DECIMAL(14,2),
ADD COLUMN     "partialRegistryAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "possessionDate" TIMESTAMP(3),
ADD COLUMN     "possessionNotes" TEXT,
ADD COLUMN     "purchaseStage" TEXT NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "registrationAmount" DECIMAL(14,2),
ADD COLUMN     "registrationPercent" DECIMAL(5,2),
ADD COLUMN     "registryDocumentName" TEXT,
ADD COLUMN     "registryDocumentUrl" TEXT,
ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "stampDutyAmount" DECIMAL(14,2),
ADD COLUMN     "stampDutyPercent" DECIMAL(5,2),
ADD COLUMN     "tokenAmount" DECIMAL(14,2),
ADD COLUMN     "tokenChequePhotoUrl" TEXT,
ADD COLUMN     "tokenPaymentDate" TIMESTAMP(3),
ADD COLUMN     "tokenPaymentMode" TEXT,
ADD COLUMN     "transferDutyAmount" DECIMAL(14,2),
ADD COLUMN     "transferDutyPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "grade" TEXT,
ADD COLUMN     "specification" TEXT;

-- AlterTable
ALTER TABLE "MaterialIssue" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "driverPhone" TEXT,
ADD COLUMN     "status" "MaterialIssueStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "vehicleNumber" TEXT,
ADD COLUMN     "vehiclePhotoUrl" TEXT,
ADD COLUMN     "vehicleType" TEXT;

-- AlterTable
ALTER TABLE "MaterialSale" ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "driverPhone" TEXT,
ADD COLUMN     "vehicleNumber" TEXT,
ADD COLUMN     "vehiclePhotoUrl" TEXT,
ADD COLUMN     "vehicleType" TEXT;

-- AlterTable
ALTER TABLE "MaterialSalePayment" ADD COLUMN     "chequeBank" TEXT,
ADD COLUMN     "chequeBounceReason" TEXT,
ADD COLUMN     "chequeClearDate" TIMESTAMP(3),
ADD COLUMN     "chequeDate" TIMESTAMP(3),
ADD COLUMN     "chequeNo" TEXT,
ADD COLUMN     "chequePhotoUrl" TEXT,
ADD COLUMN     "chequeStatus" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "isPossessed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "possessionDate" TIMESTAMP(3),
ADD COLUMN     "possessionNotes" TEXT,
ADD COLUMN     "reraNumber" TEXT,
ADD COLUMN     "reraRegistrationDate" TIMESTAMP(3),
ADD COLUMN     "reraValidityDate" TIMESTAMP(3),
ADD COLUMN     "reraWebsiteUrl" TEXT;

-- AlterTable
ALTER TABLE "ProjectCost" ADD COLUMN     "sourceLegalDocId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "freightTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "insuranceTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "loadingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "miscChargesTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "packingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "discountPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "freightPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "insurancePerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "loadingPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "packingPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unitLandedCost" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RentalPayment" ADD COLUMN     "netReceived" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "periodEnd" DATE,
ADD COLUMN     "periodStart" DATE,
ADD COLUMN     "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tdsCertificateNo" TEXT;

-- AlterTable
ALTER TABLE "ScrapGeneration" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "status" "ScrapGenerationStatus" NOT NULL DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE "StockLocation" ADD COLUMN     "geoRadius" INTEGER,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "challanNumber" TEXT,
ADD COLUMN     "damageRemarks" TEXT,
ADD COLUMN     "deliveryMode" TEXT,
ADD COLUMN     "dispatchPhotos" JSONB,
ADD COLUMN     "dispatchSignature" TEXT,
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "dispatchedById" TEXT,
ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "driverPhone" TEXT,
ADD COLUMN     "geoFenceDistance" DOUBLE PRECISION,
ADD COLUMN     "geoFenceOk" BOOLEAN,
ADD COLUMN     "grossWeight" DECIMAL(14,3),
ADD COLUMN     "netWeight" DECIMAL(14,3),
ADD COLUMN     "packageCount" INTEGER,
ADD COLUMN     "photos" JSONB,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "receiverLat" DOUBLE PRECISION,
ADD COLUMN     "receiverLng" DOUBLE PRECISION,
ADD COLUMN     "receiverLocation" TEXT,
ADD COLUMN     "receiverSignature" TEXT,
ADD COLUMN     "shortageRemarks" TEXT,
ADD COLUMN     "supervisorId" TEXT,
ADD COLUMN     "supervisorSignature" TEXT,
ADD COLUMN     "tareWeight" DECIMAL(14,3),
ADD COLUMN     "transporterName" TEXT,
ADD COLUMN     "vehicleNumber" TEXT,
ADD COLUMN     "vehicleType" TEXT,
ADD COLUMN     "weighbridgeTicketNo" TEXT;

-- AlterTable
ALTER TABLE "StockTransferLine" ADD COLUMN     "qtyReceived" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SupplierReturn" ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "driverPhone" TEXT,
ADD COLUMN     "vehicleNumber" TEXT,
ADD COLUMN     "vehiclePhotoUrl" TEXT,
ADD COLUMN     "vehicleType" TEXT;

-- AlterTable
ALTER TABLE "Tenancy" ADD COLUMN     "baseRent" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "escalationIntervalMonths" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "escalationPercent" DECIMAL(5,2),
ADD COLUMN     "lastEscalatedAt" DATE,
ADD COLUMN     "nextEscalationDate" DATE,
ADD COLUMN     "rentAgreementDocumentName" TEXT,
ADD COLUMN     "rentAgreementDocumentUrl" TEXT,
ADD COLUMN     "sacCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" TEXT,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "employeeCode" TEXT,
ADD COLUMN     "joiningDate" TIMESTAMP(3),
ALTER COLUMN "role" SET DEFAULT 'PROJECT_MANAGER';

-- AlterTable
ALTER TABLE "VendorQuote" ADD COLUMN     "buyerTransportTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryTerms" TEXT,
ADD COLUMN     "deliveryTermsType" "DeliveryTerms" NOT NULL DEFAULT 'DELIVERED_SITE',
ADD COLUMN     "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "freightTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "handlingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "insuranceTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "loadingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "packingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "quotationRequestId" TEXT,
ADD COLUMN     "quoteSource" "QuoteSource" NOT NULL DEFAULT 'DOCUMENT',
ADD COLUMN     "sourceNote" TEXT,
ADD COLUMN     "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "warranty" TEXT,
ALTER COLUMN "requisitionId" DROP NOT NULL,
ALTER COLUMN "fileUrl" DROP NOT NULL,
ALTER COLUMN "fileName" DROP NOT NULL,
ALTER COLUMN "mimeType" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VendorQuoteLine" ADD COLUMN     "buyerTransportPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "freightPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "handlingPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "insurancePerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lineSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "loadingPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "packingPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxableValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unitLandedCost" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "photoUrl" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "transporterName" TEXT,
    "companyId" TEXT NOT NULL,
    "tripCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "lastLocationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleTrip" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "transporterName" TEXT,
    "photos" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "VehicleTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderCharge" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandSeller" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LandSeller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandPurchasePayment" (
    "id" TEXT NOT NULL,
    "landPurchaseId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMode" TEXT NOT NULL,
    "referenceNo" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chequeNo" TEXT,
    "chequeDate" TIMESTAMP(3),
    "chequeBank" TEXT,
    "chequePhotoUrl" TEXT,
    "chequeStatus" TEXT,
    "chequeClearDate" TIMESTAMP(3),
    "chequeBounceReason" TEXT,

    CONSTRAINT "LandPurchasePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandPurchasePaymentSchedule" (
    "id" TEXT NOT NULL,
    "landPurchaseId" TEXT NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandPurchasePaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandPurchasePaymentScheduleItem" (
    "id" TEXT NOT NULL,
    "paymentScheduleId" TEXT NOT NULL,
    "installmentNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "LandPaymentScheduleItemStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandPurchasePaymentScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HsnGstRate" (
    "id" TEXT NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "sacCode" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HsnGstRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "QuotationRequestStatus" NOT NULL DEFAULT 'OPEN',
    "minQuotesRequired" INTEGER NOT NULL DEFAULT 3,
    "requiredByDate" TIMESTAMP(3),
    "workActivity" TEXT,
    "destinationLocationId" TEXT,
    "submittedById" TEXT NOT NULL,
    "submittedByUserCompanyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedById" TEXT,
    "approvedByUserCompanyId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalReason" TEXT,
    "selectedQuoteId" TEXT,
    "convertedPoId" TEXT,

    CONSTRAINT "QuotationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationRequestLine" (
    "id" TEXT NOT NULL,
    "quotationRequestId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qtyRequired" DECIMAL(14,3) NOT NULL,
    "hsnCode" TEXT,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "interestedUnitId" TEXT,
    "assignedToId" TEXT,
    "convertedCustomerId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" "LeadSource" NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
    "score" INTEGER NOT NULL DEFAULT 0,
    "budgetMin" DECIMAL(14,2),
    "budgetMax" DECIMAL(14,2),
    "interestedUnitType" TEXT,
    "notes" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "note" TEXT,
    "outcome" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextFollowUpAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleExpense" (
    "id" TEXT NOT NULL,
    "assetSaleId" TEXT NOT NULL,
    "head" "SaleExpenseHead" NOT NULL,
    "label" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "borneBy" "ExpenseBorneBy" NOT NULL DEFAULT 'NA',
    "isIncluded" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleTerm" (
    "id" TEXT NOT NULL,
    "assetSaleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "extraAmount" DECIMAL(14,2),
    "isIncluded" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "agency" TEXT,
    "defaultCommissionPercent" DECIMAL(5,2),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateAnalysis" (
    "id" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "perUnit" TEXT NOT NULL,
    "totalRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "materialSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "labourSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "equipmentSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overheadSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profitSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "wastagePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateAnalysisLine" (
    "id" TEXT NOT NULL,
    "rateAnalysisId" TEXT NOT NULL,
    "componentType" "RateAnalysisComponentType" NOT NULL,
    "basis" "RateAnalysisLineBasis" NOT NULL DEFAULT 'QUANTITY',
    "materialId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,5),
    "unit" TEXT,
    "rate" DECIMAL(14,2),
    "percentage" DECIMAL(5,2),
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateAnalysisLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "changeOrderNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ChangeOrderType" NOT NULL DEFAULT 'MODIFICATION',
    "reason" "ChangeOrderReason" NOT NULL DEFAULT 'OTHER',
    "status" "ChangeOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "originalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revisedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costDelta" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "scheduleDeltaDays" INTEGER NOT NULL DEFAULT 0,
    "clientApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "clientApprovedAt" TIMESTAMP(3),
    "clientApprovedBy" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "implementedById" TEXT,
    "implementedAt" TIMESTAMP(3),
    "initiatedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderLine" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "boqItemId" TEXT,
    "description" TEXT NOT NULL,
    "originalQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "revisedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "originalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revisedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountDelta" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonConformanceReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ncrNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "NcrCategory" NOT NULL DEFAULT 'WORKMANSHIP',
    "severity" "NcrSeverity" NOT NULL DEFAULT 'MINOR',
    "status" "NcrStatus" NOT NULL DEFAULT 'OPEN',
    "location" TEXT,
    "wbsNodeId" TEXT,
    "boqItemId" TEXT,
    "raisedById" TEXT,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsibleParty" TEXT,
    "subcontractorId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closureNotes" TEXT,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonConformanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capa" (
    "id" TEXT NOT NULL,
    "ncrId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "capaNumber" TEXT NOT NULL,
    "status" "CapaStatus" NOT NULL DEFAULT 'DRAFT',
    "rootCause" TEXT NOT NULL,
    "correctiveAction" TEXT NOT NULL,
    "correctiveDueDate" TIMESTAMP(3),
    "correctiveDoneAt" TIMESTAMP(3),
    "correctiveDoneById" TEXT,
    "preventiveAction" TEXT NOT NULL,
    "preventiveDueDate" TIMESTAMP(3),
    "preventiveDoneAt" TIMESTAMP(3),
    "preventiveDoneById" TEXT,
    "verificationMethod" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationNotes" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closureNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyIncident" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "incidentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL DEFAULT 'ACCIDENT',
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'FIRST_AID',
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "incidentTime" TEXT,
    "location" TEXT,
    "wbsNodeId" TEXT,
    "peopleInvolved" TEXT,
    "injuredCount" INTEGER NOT NULL DEFAULT 0,
    "fatalities" INTEGER NOT NULL DEFAULT 0,
    "propertyDamageEstimate" DECIMAL(14,2),
    "reportedById" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "investigatedById" TEXT,
    "investigatedAt" TIMESTAMP(3),
    "rootCause" TEXT,
    "correctiveActions" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closureNotes" TEXT,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyHazard" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "hazardNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "HazardStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "likelihood" INTEGER NOT NULL DEFAULT 2,
    "severity" INTEGER NOT NULL DEFAULT 2,
    "riskLevel" "HazardRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "location" TEXT,
    "wbsNodeId" TEXT,
    "identifiedById" TEXT,
    "identifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mitigationPlan" TEXT,
    "mitigatedById" TEXT,
    "mitigatedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "targetResolutionDate" TIMESTAMP(3),
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyHazard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyInspection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SafetyInspectionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "result" "InspectionResult",
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "conductedDate" TIMESTAMP(3),
    "inspectorId" TEXT,
    "inspectorName" TEXT,
    "findings" TEXT,
    "complianceNotes" TEXT,
    "followUpActions" TEXT,
    "conductedById" TEXT,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatePass" (
    "id" TEXT NOT NULL,
    "gatePassNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "locationId" TEXT NOT NULL,
    "status" "GatePassStatus" NOT NULL DEFAULT 'DRAFT',
    "category" "GatePassCategory" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "exitedAt" TIMESTAMP(3),
    "exitedById" TEXT,
    "exitNotes" TEXT,
    "exitPhotos" JSONB,
    "vehicleNumber" TEXT,
    "vehicleType" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "transporterName" TEXT,
    "destination" TEXT,
    "purpose" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatePass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatePassLine" (
    "id" TEXT NOT NULL,
    "gatePassId" TEXT NOT NULL,
    "materialId" TEXT,
    "materialCode" TEXT,
    "materialName" TEXT,
    "unit" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "description" TEXT,

    CONSTRAINT "GatePassLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "landPurchaseId" TEXT,
    "projectId" TEXT,
    "type" "LegalDocType" NOT NULL,
    "title" TEXT NOT NULL,
    "authority" TEXT,
    "status" "LegalDocStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "appliesTo" "LegalDocAppliesTo" NOT NULL DEFAULT 'BOTH',
    "docNumber" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "prerequisiteType" "LegalDocType",
    "obtained" BOOLEAN NOT NULL DEFAULT false,
    "applicationDate" TIMESTAMP(3),
    "issueDate" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validTill" TIMESTAMP(3),
    "amount" DECIMAL(14,2),
    "expectedRegistryDate" TIMESTAMP(3),
    "documentUrl" TEXT,
    "documentName" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_companyId_idx" ON "Vehicle"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vehicleNumber_companyId_key" ON "Vehicle"("vehicleNumber", "companyId");

-- CreateIndex
CREATE INDEX "VehicleTrip_vehicleId_idx" ON "VehicleTrip"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleTrip_companyId_idx" ON "VehicleTrip"("companyId");

-- CreateIndex
CREATE INDEX "VehicleTrip_refType_refId_idx" ON "VehicleTrip"("refType", "refId");

-- CreateIndex
CREATE INDEX "PurchaseOrderCharge_purchaseOrderId_idx" ON "PurchaseOrderCharge"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "LandSeller_companyId_idx" ON "LandSeller"("companyId");

-- CreateIndex
CREATE INDEX "LandSeller_companyId_deletedAt_idx" ON "LandSeller"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "LandSeller_name_idx" ON "LandSeller"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LandSeller_companyId_phone_key" ON "LandSeller"("companyId", "phone");

-- CreateIndex
CREATE INDEX "LandPurchasePayment_landPurchaseId_idx" ON "LandPurchasePayment"("landPurchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "LandPurchasePaymentSchedule_landPurchaseId_key" ON "LandPurchasePaymentSchedule"("landPurchaseId");

-- CreateIndex
CREATE INDEX "LandPurchasePaymentSchedule_landPurchaseId_idx" ON "LandPurchasePaymentSchedule"("landPurchaseId");

-- CreateIndex
CREATE INDEX "LandPurchasePaymentScheduleItem_paymentScheduleId_idx" ON "LandPurchasePaymentScheduleItem"("paymentScheduleId");

-- CreateIndex
CREATE INDEX "LandPurchasePaymentScheduleItem_status_idx" ON "LandPurchasePaymentScheduleItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HsnGstRate_hsnCode_key" ON "HsnGstRate"("hsnCode");

-- CreateIndex
CREATE INDEX "HsnGstRate_hsnCode_idx" ON "HsnGstRate"("hsnCode");

-- CreateIndex
CREATE INDEX "HsnGstRate_category_idx" ON "HsnGstRate"("category");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationRequest_requestNumber_key" ON "QuotationRequest"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationRequest_selectedQuoteId_key" ON "QuotationRequest"("selectedQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationRequest_convertedPoId_key" ON "QuotationRequest"("convertedPoId");

-- CreateIndex
CREATE INDEX "QuotationRequest_companyId_idx" ON "QuotationRequest"("companyId");

-- CreateIndex
CREATE INDEX "QuotationRequest_projectId_idx" ON "QuotationRequest"("projectId");

-- CreateIndex
CREATE INDEX "QuotationRequest_submittedById_idx" ON "QuotationRequest"("submittedById");

-- CreateIndex
CREATE INDEX "QuotationRequest_status_idx" ON "QuotationRequest"("status");

-- CreateIndex
CREATE INDEX "QuotationRequestLine_quotationRequestId_idx" ON "QuotationRequestLine"("quotationRequestId");

-- CreateIndex
CREATE INDEX "QuotationRequestLine_materialId_idx" ON "QuotationRequestLine"("materialId");

-- CreateIndex
CREATE INDEX "Lead_companyId_stage_idx" ON "Lead"("companyId", "stage");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_stage_idx" ON "Lead"("assignedToId", "stage");

-- CreateIndex
CREATE INDEX "Lead_projectId_idx" ON "Lead"("projectId");

-- CreateIndex
CREATE INDEX "Lead_interestedUnitId_idx" ON "Lead"("interestedUnitId");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_nextFollowUpAt_idx" ON "Lead"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "Lead_deletedAt_idx" ON "Lead"("deletedAt");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_occurredAt_idx" ON "LeadActivity"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "LeadActivity_createdById_idx" ON "LeadActivity"("createdById");

-- CreateIndex
CREATE INDEX "SaleExpense_assetSaleId_idx" ON "SaleExpense"("assetSaleId");

-- CreateIndex
CREATE INDEX "SaleExpense_head_idx" ON "SaleExpense"("head");

-- CreateIndex
CREATE INDEX "SaleTerm_assetSaleId_idx" ON "SaleTerm"("assetSaleId");

-- CreateIndex
CREATE INDEX "Broker_companyId_idx" ON "Broker"("companyId");

-- CreateIndex
CREATE INDEX "Broker_companyId_deletedAt_idx" ON "Broker"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Broker_name_idx" ON "Broker"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RateAnalysis_boqItemId_key" ON "RateAnalysis"("boqItemId");

-- CreateIndex
CREATE INDEX "RateAnalysis_boqItemId_idx" ON "RateAnalysis"("boqItemId");

-- CreateIndex
CREATE INDEX "RateAnalysisLine_rateAnalysisId_idx" ON "RateAnalysisLine"("rateAnalysisId");

-- CreateIndex
CREATE INDEX "RateAnalysisLine_materialId_idx" ON "RateAnalysisLine"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_changeOrderNo_key" ON "ChangeOrder"("changeOrderNo");

-- CreateIndex
CREATE INDEX "ChangeOrder_projectId_idx" ON "ChangeOrder"("projectId");

-- CreateIndex
CREATE INDEX "ChangeOrder_companyId_idx" ON "ChangeOrder"("companyId");

-- CreateIndex
CREATE INDEX "ChangeOrder_status_idx" ON "ChangeOrder"("status");

-- CreateIndex
CREATE INDEX "ChangeOrder_phaseId_idx" ON "ChangeOrder"("phaseId");

-- CreateIndex
CREATE INDEX "ChangeOrderLine_changeOrderId_idx" ON "ChangeOrderLine"("changeOrderId");

-- CreateIndex
CREATE INDEX "ChangeOrderLine_boqItemId_idx" ON "ChangeOrderLine"("boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "NonConformanceReport_ncrNumber_key" ON "NonConformanceReport"("ncrNumber");

-- CreateIndex
CREATE INDEX "NonConformanceReport_projectId_idx" ON "NonConformanceReport"("projectId");

-- CreateIndex
CREATE INDEX "NonConformanceReport_companyId_idx" ON "NonConformanceReport"("companyId");

-- CreateIndex
CREATE INDEX "NonConformanceReport_status_idx" ON "NonConformanceReport"("status");

-- CreateIndex
CREATE INDEX "NonConformanceReport_severity_idx" ON "NonConformanceReport"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "Capa_ncrId_key" ON "Capa"("ncrId");

-- CreateIndex
CREATE UNIQUE INDEX "Capa_capaNumber_key" ON "Capa"("capaNumber");

-- CreateIndex
CREATE INDEX "Capa_ncrId_idx" ON "Capa"("ncrId");

-- CreateIndex
CREATE INDEX "Capa_projectId_idx" ON "Capa"("projectId");

-- CreateIndex
CREATE INDEX "Capa_status_idx" ON "Capa"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyIncident_incidentNumber_key" ON "SafetyIncident"("incidentNumber");

-- CreateIndex
CREATE INDEX "SafetyIncident_projectId_idx" ON "SafetyIncident"("projectId");

-- CreateIndex
CREATE INDEX "SafetyIncident_companyId_idx" ON "SafetyIncident"("companyId");

-- CreateIndex
CREATE INDEX "SafetyIncident_status_idx" ON "SafetyIncident"("status");

-- CreateIndex
CREATE INDEX "SafetyIncident_severity_idx" ON "SafetyIncident"("severity");

-- CreateIndex
CREATE INDEX "SafetyIncident_type_idx" ON "SafetyIncident"("type");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyHazard_hazardNumber_key" ON "SafetyHazard"("hazardNumber");

-- CreateIndex
CREATE INDEX "SafetyHazard_projectId_idx" ON "SafetyHazard"("projectId");

-- CreateIndex
CREATE INDEX "SafetyHazard_companyId_idx" ON "SafetyHazard"("companyId");

-- CreateIndex
CREATE INDEX "SafetyHazard_status_idx" ON "SafetyHazard"("status");

-- CreateIndex
CREATE INDEX "SafetyHazard_riskLevel_idx" ON "SafetyHazard"("riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyInspection_inspectionNumber_key" ON "SafetyInspection"("inspectionNumber");

-- CreateIndex
CREATE INDEX "SafetyInspection_projectId_idx" ON "SafetyInspection"("projectId");

-- CreateIndex
CREATE INDEX "SafetyInspection_companyId_idx" ON "SafetyInspection"("companyId");

-- CreateIndex
CREATE INDEX "SafetyInspection_status_idx" ON "SafetyInspection"("status");

-- CreateIndex
CREATE INDEX "SafetyInspection_scheduledDate_idx" ON "SafetyInspection"("scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "GatePass_gatePassNumber_key" ON "GatePass"("gatePassNumber");

-- CreateIndex
CREATE INDEX "GatePass_companyId_idx" ON "GatePass"("companyId");

-- CreateIndex
CREATE INDEX "GatePass_projectId_idx" ON "GatePass"("projectId");

-- CreateIndex
CREATE INDEX "GatePass_locationId_idx" ON "GatePass"("locationId");

-- CreateIndex
CREATE INDEX "GatePass_status_idx" ON "GatePass"("status");

-- CreateIndex
CREATE INDEX "GatePass_category_idx" ON "GatePass"("category");

-- CreateIndex
CREATE INDEX "GatePass_refType_refId_idx" ON "GatePass"("refType", "refId");

-- CreateIndex
CREATE INDEX "GatePassLine_gatePassId_idx" ON "GatePassLine"("gatePassId");

-- CreateIndex
CREATE INDEX "GatePassLine_materialId_idx" ON "GatePassLine"("materialId");

-- CreateIndex
CREATE INDEX "LegalDocument_companyId_idx" ON "LegalDocument"("companyId");

-- CreateIndex
CREATE INDEX "LegalDocument_landPurchaseId_idx" ON "LegalDocument"("landPurchaseId");

-- CreateIndex
CREATE INDEX "LegalDocument_projectId_idx" ON "LegalDocument"("projectId");

-- CreateIndex
CREATE INDEX "LegalDocument_type_idx" ON "LegalDocument"("type");

-- CreateIndex
CREATE INDEX "LegalDocument_status_idx" ON "LegalDocument"("status");

-- CreateIndex
CREATE INDEX "LegalDocument_appliesTo_idx" ON "LegalDocument"("appliesTo");

-- CreateIndex
CREATE INDEX "LegalDocument_sortOrder_idx" ON "LegalDocument"("sortOrder");

-- CreateIndex
CREATE INDEX "AssetSale_brokerId_idx" ON "AssetSale"("brokerId");

-- CreateIndex
CREATE INDEX "AssetSale_landParcelId_idx" ON "AssetSale"("landParcelId");

-- CreateIndex
CREATE UNIQUE INDEX "BuiltUnit_saleId_key" ON "BuiltUnit"("saleId");

-- CreateIndex
CREATE INDEX "BuiltUnit_saleId_idx" ON "BuiltUnit"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "LandParcel_saleId_key" ON "LandParcel"("saleId");

-- CreateIndex
CREATE INDEX "LandParcel_saleId_idx" ON "LandParcel"("saleId");

-- CreateIndex
CREATE INDEX "LandParcel_landPurchaseId_status_idx" ON "LandParcel"("landPurchaseId", "status");

-- CreateIndex
CREATE INDEX "LandPurchase_sellerId_idx" ON "LandPurchase"("sellerId");

-- CreateIndex
CREATE INDEX "LandPurchase_purchaseStage_idx" ON "LandPurchase"("purchaseStage");

-- CreateIndex
CREATE INDEX "ProjectCost_sourceLegalDocId_idx" ON "ProjectCost"("sourceLegalDocId");

-- CreateIndex
CREATE INDEX "Tenancy_nextEscalationDate_idx" ON "Tenancy"("nextEscalationDate");

-- CreateIndex
CREATE INDEX "VendorQuote_quotationRequestId_idx" ON "VendorQuote"("quotationRequestId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_reportingLocationId_fkey" FOREIGN KEY ("reportingLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleTrip" ADD CONSTRAINT "VehicleTrip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleTrip" ADD CONSTRAINT "VehicleTrip_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderCharge" ADD CONSTRAINT "PurchaseOrderCharge_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_unloadedById_fkey" FOREIGN KEY ("unloadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapGeneration" ADD CONSTRAINT "ScrapGeneration_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandSeller" ADD CONSTRAINT "LandSeller_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchase" ADD CONSTRAINT "LandPurchase_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "LandSeller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchasePayment" ADD CONSTRAINT "LandPurchasePayment_landPurchaseId_fkey" FOREIGN KEY ("landPurchaseId") REFERENCES "LandPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchasePayment" ADD CONSTRAINT "LandPurchasePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchasePaymentSchedule" ADD CONSTRAINT "LandPurchasePaymentSchedule_landPurchaseId_fkey" FOREIGN KEY ("landPurchaseId") REFERENCES "LandPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchasePaymentScheduleItem" ADD CONSTRAINT "LandPurchasePaymentScheduleItem_paymentScheduleId_fkey" FOREIGN KEY ("paymentScheduleId") REFERENCES "LandPurchasePaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandParcel" ADD CONSTRAINT "LandParcel_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "AssetSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuiltUnit" ADD CONSTRAINT "BuiltUnit_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "AssetSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_quotationRequestId_fkey" FOREIGN KEY ("quotationRequestId") REFERENCES "QuotationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_convertedPoId_fkey" FOREIGN KEY ("convertedPoId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_selectedQuoteId_fkey" FOREIGN KEY ("selectedQuoteId") REFERENCES "VendorQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequestLine" ADD CONSTRAINT "QuotationRequestLine_quotationRequestId_fkey" FOREIGN KEY ("quotationRequestId") REFERENCES "QuotationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequestLine" ADD CONSTRAINT "QuotationRequestLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchase" ADD CONSTRAINT "DirectPurchase_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_interestedUnitId_fkey" FOREIGN KEY ("interestedUnitId") REFERENCES "BuiltUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedCustomerId_fkey" FOREIGN KEY ("convertedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_landParcelId_fkey" FOREIGN KEY ("landParcelId") REFERENCES "LandParcel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleExpense" ADD CONSTRAINT "SaleExpense_assetSaleId_fkey" FOREIGN KEY ("assetSaleId") REFERENCES "AssetSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleTerm" ADD CONSTRAINT "SaleTerm_assetSaleId_fkey" FOREIGN KEY ("assetSaleId") REFERENCES "AssetSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_sourceLegalDocId_fkey" FOREIGN KEY ("sourceLegalDocId") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateAnalysis" ADD CONSTRAINT "RateAnalysis_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateAnalysisLine" ADD CONSTRAINT "RateAnalysisLine_rateAnalysisId_fkey" FOREIGN KEY ("rateAnalysisId") REFERENCES "RateAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateAnalysisLine" ADD CONSTRAINT "RateAnalysisLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_implementedById_fkey" FOREIGN KEY ("implementedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "WbsNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capa" ADD CONSTRAINT "Capa_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "NonConformanceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capa" ADD CONSTRAINT "Capa_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capa" ADD CONSTRAINT "Capa_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capa" ADD CONSTRAINT "Capa_correctiveDoneById_fkey" FOREIGN KEY ("correctiveDoneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capa" ADD CONSTRAINT "Capa_preventiveDoneById_fkey" FOREIGN KEY ("preventiveDoneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capa" ADD CONSTRAINT "Capa_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capa" ADD CONSTRAINT "Capa_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "WbsNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_investigatedById_fkey" FOREIGN KEY ("investigatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyHazard" ADD CONSTRAINT "SafetyHazard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyHazard" ADD CONSTRAINT "SafetyHazard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyHazard" ADD CONSTRAINT "SafetyHazard_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "WbsNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyHazard" ADD CONSTRAINT "SafetyHazard_identifiedById_fkey" FOREIGN KEY ("identifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyHazard" ADD CONSTRAINT "SafetyHazard_mitigatedById_fkey" FOREIGN KEY ("mitigatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyHazard" ADD CONSTRAINT "SafetyHazard_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyInspection" ADD CONSTRAINT "SafetyInspection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyInspection" ADD CONSTRAINT "SafetyInspection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyInspection" ADD CONSTRAINT "SafetyInspection_conductedById_fkey" FOREIGN KEY ("conductedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_exitedById_fkey" FOREIGN KEY ("exitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePassLine" ADD CONSTRAINT "GatePassLine_gatePassId_fkey" FOREIGN KEY ("gatePassId") REFERENCES "GatePass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePassLine" ADD CONSTRAINT "GatePassLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_landPurchaseId_fkey" FOREIGN KEY ("landPurchaseId") REFERENCES "LandPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Rename auto-created "Nirman Constructions" to "My Company" placeholder
UPDATE "Company" SET name = 'My Company', "gstin" = NULL, pan = NULL, address = NULL WHERE name = 'Nirman Constructions';
