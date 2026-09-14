-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WageType" AS ENUM ('DAILY', 'MONTHLY', 'FIXED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'CONTRACT', 'CASUAL', 'PROBATION', 'INTERN');

-- CreateEnum
CREATE TYPE "BenefitType" AS ENUM ('PF', 'ESI', 'HEALTH_INSURANCE', 'ACCIDENT_INSURANCE', 'BONUS', 'LEAVE_ENCASHMENT', 'ACCOMMODATION', 'TRAVEL_ALLOWANCE', 'FOOD_ALLOWANCE', 'UNIFORM', 'PPE', 'OTHER');

-- CreateEnum
CREATE TYPE "BenefitFrequency" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ISSUED', 'CONFIRMED', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EmployeeResourceCategory" AS ENUM ('ELECTRONICS', 'VEHICLE', 'TOOL', 'UNIFORM', 'ACCESS', 'DOCUMENT', 'SIM_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "SalaryComponentType" AS ENUM ('BASIC', 'HRA', 'DA', 'TA', 'SPECIAL_ALLOWANCE', 'FOOD_ALLOWANCE', 'MEDICAL_ALLOWANCE', 'UNIFORM_ALLOWANCE', 'WASHING_ALLOWANCE', 'LTA', 'PERFORMANCE_BONUS', 'JOINING_BONUS', 'RETENTION_BONUS', 'EMPLOYER_PF', 'EMPLOYEE_PF', 'EMPLOYER_ESI', 'EMPLOYEE_ESI', 'GRATUITY', 'PROFESSION_TAX', 'TDS', 'OTHER');

-- CreateEnum
CREATE TYPE "ComponentFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'READ', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('BUG', 'FEATURE', 'UX', 'PRAISE', 'QUESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'WAREHOUSE', 'MALL', 'LAND', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "StockLocationType" AS ENUM ('CENTRAL_WAREHOUSE', 'COMPANY_WAREHOUSE', 'PROJECT_SITE', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "MaterialClass" AS ENUM ('RAW_MATERIAL', 'CONSUMABLE', 'MRO', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'OVERTIME', 'LEAVE', 'LATE', 'PAID_LEAVE', 'NON_PAID_LEAVE');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PROCESSED', 'PAID');

-- CreateEnum
CREATE TYPE "DprApprovalStatus" AS ENUM ('SUBMITTED', 'SUB_ADMIN_APPROVED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProcurementScope" AS ENUM ('COMPANY', 'PROJECT');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE_RECEIPT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ISSUE_TO_PROJECT', 'ISSUE_TO_DEPARTMENT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN', 'SALE', 'SCRAP_GENERATED');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaterialIssueStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DirectPurchaseStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScrapGenerationStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'COUNTED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "AreaUnit" AS ENUM ('SQFT', 'SQM', 'SQYD', 'ACRE', 'BIGHA', 'KATHA', 'HECTARE');

-- CreateEnum
CREATE TYPE "LandPurchaseMode" AS ENUM ('WHOLE', 'SUBDIVIDED', 'BOOKED');

-- CreateEnum
CREATE TYPE "LandType" AS ENUM ('FREEHOLD', 'LEASEHOLD');

-- CreateEnum
CREATE TYPE "LeaseType" AS ENUM ('ONE_TIME', 'YEARLY');

-- CreateEnum
CREATE TYPE "LandCostFrequency" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateEnum
CREATE TYPE "LandCostRecurrenceInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "LandPaymentScheduleItemStatus" AS ENUM ('PENDING', 'DUE', 'PARTIAL', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "LandParcelStatus" AS ENUM ('AVAILABLE', 'HOLD', 'PARTITIONED', 'RESERVED', 'SOLD', 'RENTED');

-- CreateEnum
CREATE TYPE "LandParcelPurpose" AS ENUM ('SELL', 'PROJECT', 'HOLD');

-- CreateEnum
CREATE TYPE "BuiltUnitType" AS ENUM ('BHK_1', 'BHK_2', 'BHK_3', 'BHK_4', 'SHOP', 'OFFICE', 'WAREHOUSE_UNIT', 'VILLA', 'OTHER');

-- CreateEnum
CREATE TYPE "BuiltUnitStatus" AS ENUM ('PLANNED', 'UNDER_CONSTRUCTION', 'AVAILABLE', 'RESERVED', 'HOLD', 'SOLD', 'RENTED');

-- CreateEnum
CREATE TYPE "UnitOrigin" AS ENUM ('CREATED', 'PURCHASED');

-- CreateEnum
CREATE TYPE "PortalListingStatus" AS ENUM ('DRAFT', 'LISTED', 'DELISTED', 'SYNC_FAILED');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_MAINTENANCE', 'RETIRED', 'SOLD');

-- CreateEnum
CREATE TYPE "EquipmentAssignmentStatus" AS ENUM ('ACTIVE', 'RETURNED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('SCHEDULED', 'REPAIR', 'INSPECTION');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CONVERTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'SELECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeliveryTerms" AS ENUM ('DELIVERED_SITE', 'EX_WORKS', 'FOR_STATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "QuotationRequestStatus" AS ENUM ('OPEN', 'QUOTES_COLLECTED', 'APPROVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteSource" AS ENUM ('DOCUMENT', 'EMAIL', 'VERBAL', 'WHATSAPP', 'LETTER', 'EXCEL');

-- CreateEnum
CREATE TYPE "SupplierReturnStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('PORTAL', 'WALK_IN', 'REFERRAL', 'BROKER', 'DIGITAL_AD', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'SITE_VISIT', 'NEGOTIATION', 'BOOKED', 'LOST');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'HOT');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'SITE_VISIT', 'NOTE', 'STAGE_CHANGE');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('LAND', 'BUILT_UNIT', 'PROJECT');

-- CreateEnum
CREATE TYPE "SaleExpenseHead" AS ENUM ('REGISTRY', 'STAMP_DUTY', 'TRANSFER', 'LEASE_RENT', 'GST', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseBorneBy" AS ENUM ('CLIENT', 'SELLER', 'NA');

-- CreateEnum
CREATE TYPE "DealSource" AS ENUM ('SELF', 'BROKER');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "ProjectCostType" AS ENUM ('LABOUR', 'OVERHEAD', 'EQUIPMENT', 'CONTRACTOR', 'PERMIT', 'TRANSFER_DUTY', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExpenseClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "RecurringExpenseFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'CONTRA_EXPENSE');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TallySyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'IMPORTED', 'VARIANCE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CASUAL', 'SICK', 'EARNED', 'UNPAID', 'MATERNITY', 'PATERNITY');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenancyStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED', 'PENDING');

-- CreateEnum
CREATE TYPE "MaterialSaleReturnStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RenovationType" AS ENUM ('RENOVATION', 'ADDITION', 'VALUE_ADD', 'REPAIR');

-- CreateEnum
CREATE TYPE "RenovationStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BoqItemType" AS ENUM ('SECTION', 'SUBSECTION', 'LINE_ITEM');

-- CreateEnum
CREATE TYPE "RateAnalysisComponentType" AS ENUM ('MATERIAL', 'LABOUR', 'EQUIPMENT', 'OVERHEAD', 'PROFIT', 'OTHER');

-- CreateEnum
CREATE TYPE "RateAnalysisLineBasis" AS ENUM ('QUANTITY', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "WbsNodeType" AS ENUM ('PROJECT_NODE', 'PHASE_NODE', 'ACTIVITY', 'SUB_ACTIVITY', 'MILESTONE');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateEnum
CREATE TYPE "MbEntryStatus" AS ENUM ('DRAFT', 'VERIFIED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACTIVE', 'COMPLETED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubcontractorCategory" AS ENUM ('INDIVIDUAL', 'COMPANY', 'OTHER');

-- CreateEnum
CREATE TYPE "RaBillStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED');

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
CREATE TYPE "PaymentScheduleType" AS ENUM ('CLP', 'TLP', 'DPP');

-- CreateEnum
CREATE TYPE "PaymentScheduleItemStatus" AS ENUM ('PENDING', 'DUE', 'PARTIAL', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "RateContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

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

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "businessType" TEXT,
    "parentCompanyId" TEXT,
    "lciThresholdDefault" DECIMAL(5,2),
    "lciWeights" JSONB,
    "poApprovalThresholdManager" DECIMAL(14,2),
    "poApprovalThresholdAdmin" DECIMAL(14,2),
    "recordingConsentBeep" BOOLEAN NOT NULL DEFAULT true,
    "recordingRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "recordingAutoDelete" BOOLEAN NOT NULL DEFAULT false,
    "recordingStorageProvider" TEXT NOT NULL DEFAULT 'local',
    "recordingMode" TEXT NOT NULL DEFAULT 'ALL',
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "passwordRequireSpecial" BOOLEAN NOT NULL DEFAULT false,
    "passwordExpiryDays" INTEGER,
    "accountLockoutThreshold" INTEGER NOT NULL DEFAULT 5,
    "accountLockoutDurationMin" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCompany" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PROJECT_MANAGER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportsToUserCompanyId" TEXT,
    "scopeType" TEXT,
    "recordCalls" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserScope" (
    "id" TEXT NOT NULL,
    "userCompanyId" TEXT NOT NULL,
    "scopeKind" TEXT NOT NULL,
    "departmentId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userCompanyId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "baseRole" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "hierarchyLevel" INTEGER,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "dailyRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "wageType" "WageType" NOT NULL DEFAULT 'DAILY',
    "monthlySalary" DECIMAL(14,2),
    "designation" TEXT,
    "departmentId" TEXT,
    "joinDate" TIMESTAMP(3),
    "crewId" TEXT,
    "activeProjectId" TEXT,
    "reportingLocationId" TEXT,
    "hierarchyLevel" INTEGER,
    "reportsToEmployeeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "employmentType" "EmploymentType",
    "probationEndDate" TIMESTAMP(3),
    "confirmationDate" TIMESTAMP(3),
    "noticePeriodDays" INTEGER,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "contractStatus" "ContractStatus",
    "contractIssuedAt" TIMESTAMP(3),
    "contractConfirmedAt" TIMESTAMP(3),
    "contractAttachmentId" TEXT,
    "contractTerms" TEXT,
    "contractToken" TEXT,
    "offerLetterStatus" "ContractStatus",
    "offerLetterIssuedAt" TIMESTAMP(3),
    "offerLetterAttachmentId" TEXT,
    "offerLetterTerms" TEXT,
    "offerLetterAcceptedAt" TIMESTAMP(3),
    "offerToken" TEXT,
    "idCardStatus" "ContractStatus",
    "idCardIssuedAt" TIMESTAMP(3),
    "idCardAttachmentId" TEXT,
    "payDay" INTEGER,
    "bankAccountHolder" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "autoDepositEnabled" BOOLEAN,
    "autoDepositSetupAt" TIMESTAMP(3),
    "panNumber" TEXT,
    "aadhaarNumber" TEXT,
    "pfNumber" TEXT,
    "esiNumber" TEXT,
    "uan" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelation" TEXT,
    "permanentAddress" TEXT,
    "currentAddress" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "bloodGroup" TEXT,
    "photoUrl" TEXT,
    "documentsSubmitted" BOOLEAN,
    "backgroundVerified" BOOLEAN,
    "onboardingComplete" BOOLEAN,
    "appointmentLetterStatus" "ContractStatus",
    "appointmentLetterIssuedAt" TIMESTAMP(3),
    "appointmentLetterAttachmentId" TEXT,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeReason" TEXT,
    "components" JSONB NOT NULL,
    "totalCtc" DECIMAL(14,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeResource" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EmployeeResourceCategory" NOT NULL,
    "assetTag" TEXT,
    "serialNumber" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "conditionAtIssue" TEXT,
    "conditionAtReturn" TEXT,
    "depositAmount" DECIMAL(14,2),
    "depositRefunded" BOOLEAN NOT NULL DEFAULT false,
    "issuedBy" TEXT,
    "returnedTo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeExit" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "finalSettlementAmount" DECIMAL(14,2),
    "finalSettlementDate" TIMESTAMP(3),
    "finalSettlementStatus" TEXT,
    "leaveEncashmentDays" INTEGER,
    "leaveEncashmentAmount" DECIMAL(14,2),
    "assetsReturned" BOOLEAN,
    "assetsReturnNotes" TEXT,
    "exitInterviewConducted" BOOLEAN,
    "exitInterviewNotes" TEXT,
    "exitInterviewDate" TIMESTAMP(3),
    "pfExitFiled" BOOLEAN,
    "esiExitFiled" BOOLEAN,
    "terminationReason" TEXT,
    "terminationDate" TIMESTAMP(3) NOT NULL,
    "terminatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeExit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBenefit" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "BenefitType" NOT NULL,
    "amount" DECIMAL(14,2),
    "frequency" "BenefitFrequency" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryComponent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "SalaryComponentType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" "ComponentFrequency" NOT NULL DEFAULT 'MONTHLY',
    "isDeduction" BOOLEAN NOT NULL DEFAULT false,
    "isPercentage" BOOLEAN NOT NULL DEFAULT false,
    "percentageOfBasic" DECIMAL(5,2),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "phoneVerified" BOOLEAN,
    "phoneVerifiedAt" TIMESTAMP(3),
    "phoneSyncedAt" TIMESTAMP(3),
    "role" TEXT NOT NULL DEFAULT 'PROJECT_MANAGER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "employeeCode" TEXT,
    "designation" TEXT,
    "department" TEXT,
    "joiningDate" TIMESTAMP(3),
    "employmentEndDate" TIMESTAMP(3),
    "companyId" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "monitoringConsentAcceptedAt" TIMESTAMP(3),
    "monitoringConsentPolicyId" TEXT,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "message" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL DEFAULT 'OTHER',
    "screenshotUploadId" TEXT,
    "voiceUploadId" TEXT,
    "currentUrl" TEXT NOT NULL,
    "userAgent" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "filename" TEXT,
    "lineno" INTEGER,
    "colno" INTEGER,
    "stack" TEXT,
    "url" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scopedRole" TEXT NOT NULL DEFAULT 'SUPERVISOR',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "ProjectAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT,
    "aaguid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "clientIp" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL DEFAULT 'RESIDENTIAL',
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "address" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "totalBudget" DECIMAL(14,2),
    "description" TEXT,
    "costPerSqft" DECIMAL(14,2),
    "totalProjectCost" DECIMAL(14,2),
    "totalSellableArea" DECIMAL(14,3),
    "lciThreshold" DECIMAL(5,2),
    "reraNumber" TEXT,
    "reraRegistrationDate" TIMESTAMP(3),
    "reraValidityDate" TIMESTAMP(3),
    "reraWebsiteUrl" TEXT,
    "isPossessed" BOOLEAN NOT NULL DEFAULT false,
    "possessionDate" TIMESTAMP(3),
    "possessionNotes" TEXT,
    "possessionDocumentUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPhase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PhaseStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "budget" DECIMAL(14,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPhase_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "StockLocation" (
    "id" TEXT NOT NULL,
    "type" "StockLocationType" NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "phaseId" TEXT,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geoRadius" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'NOS',
    "class" "MaterialClass" NOT NULL DEFAULT 'RAW_MATERIAL',
    "hsnCode" TEXT,
    "gstRate" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" TEXT,
    "qrCode" TEXT,
    "name" TEXT NOT NULL,
    "grade" TEXT,
    "specification" TEXT,
    "categoryId" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'NOS',
    "hsnCode" TEXT,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "standardCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currentCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(14,3),
    "reorderPoint" DECIMAL(14,3),
    "economicOrderQty" DECIMAL(14,3),
    "volumetricDensity" DECIMAL(10,3),
    "bulkDiscountPct" DECIMAL(5,2),
    "isCorporateCommodity" BOOLEAN NOT NULL DEFAULT false,
    "isScrap" BOOLEAN NOT NULL DEFAULT false,
    "isLotTracked" BOOLEAN NOT NULL DEFAULT false,
    "baseUnit" TEXT NOT NULL DEFAULT 'NOS',
    "secondaryUnit" TEXT,
    "uomConversionFactor" DECIMAL(12,6),
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialLot" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "batchCode" TEXT,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "manufacturingDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "initialQty" DECIMAL(14,3) NOT NULL,
    "currentQty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "supplierId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandardConsumption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "standardQty" DECIMAL(14,3) NOT NULL,
    "baseQty" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unitOfMeasure" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandardConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "balanceOwed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "leadTimeDays" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcontractor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "trade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Subcontractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crew" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT,
    "supervisorId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerAttendance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "projectId" TEXT,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "hoursWorked" DECIMAL(5,2),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "recordedById" TEXT,
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkInLocation" TEXT,
    "checkOutLocation" TEXT,
    "geoFenceOk" BOOLEAN,
    "geoFenceDistance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "totalGross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalOvertime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "daysWorked" DECIMAL(5,2) NOT NULL,
    "basicAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overtimeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pf" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employerPf" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "esi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "professionTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentReference" TEXT,
    "paymentMode" TEXT,
    "paymentDate" TIMESTAMP(3),
    "proofUploadId" TEXT,
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyProgressReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "submittedById" TEXT,
    "weather" TEXT,
    "workSummary" TEXT NOT NULL,
    "progressPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "blockers" TEXT,
    "tomorrowPlan" TEXT,
    "notes" TEXT,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvalStatus" "DprApprovalStatus" NOT NULL DEFAULT 'SUBMITTED',
    "subAdminApprovedById" TEXT,
    "subAdminApprovedAt" TIMESTAMP(3),
    "adminApprovedById" TEXT,
    "adminApprovedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "workType" TEXT,
    "workQty" DECIMAL(14,3),
    "workUnit" TEXT,
    "varianceAnalysis" JSONB,
    "autoScrapGenerationId" TEXT,
    "costPostedDate" TIMESTAMP(3),
    "costPostedAmount" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyProgressReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPRMaterialLine" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "DPRMaterialLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPRLaborLine" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "employeeId" TEXT,
    "crewId" TEXT,
    "hoursWorked" DECIMAL(5,2) NOT NULL,
    "taskDescription" TEXT NOT NULL,

    CONSTRAINT "DPRLaborLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "procurementScope" "ProcurementScope" NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "destinationLocationId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freightTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loadingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "packingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insuranceTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "miscChargesTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "selectedQuoteId" TEXT,
    "quotationWaiverReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "invoiceId" TEXT,
    "companyId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsSection" TEXT,
    "netPaidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMode" TEXT NOT NULL,
    "referenceNo" TEXT,
    "chequePhotoUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "subtotal" DECIMAL(14,2) NOT NULL,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "hsnCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "matchStatus" TEXT,
    "matchNotes" TEXT,
    "receivedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "invoiceDocumentUrl" TEXT,
    "invoiceDocumentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qtyOrdered" DECIMAL(14,3) NOT NULL,
    "qtyReceived" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "freightPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loadingPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "packingPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insurancePerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitLandedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectionStatus" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
    "inspectionNotes" TEXT,
    "inspectedById" TEXT,
    "inspectedAt" TIMESTAMP(3),
    "deliveryTermsType" TEXT,
    "deliveryMode" TEXT,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "transporterName" TEXT,
    "challanNumber" TEXT,
    "invoiceNumber" TEXT,
    "ewayBillNumber" TEXT,
    "lrNumber" TEXT,
    "packageCount" INTEGER,
    "photos" JSONB,
    "receiverSignature" TEXT,
    "receiverLat" DOUBLE PRECISION,
    "receiverLng" DOUBLE PRECISION,
    "receiverLocation" TEXT,
    "geoFenceOk" BOOLEAN,
    "geoFenceDistance" DOUBLE PRECISION,
    "gateInAt" TIMESTAMP(3),
    "gatePassNo" TEXT,
    "receivingPhotoUrl" TEXT,
    "unloadingSlipNo" TEXT,
    "unloadedById" TEXT,
    "unloadedAt" TIMESTAMP(3),
    "unloadingLocation" TEXT,
    "unloadingRemarks" TEXT,
    "shortageRemarks" TEXT,
    "damageRemarks" TEXT,
    "supervisorSignature" TEXT,
    "supervisorId" TEXT,
    "weighbridgeTicketNo" TEXT,
    "grossWeight" DECIMAL(14,3),
    "tareWeight" DECIMAL(14,3),
    "netWeight" DECIMAL(14,3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "rejectionPhotos" JSONB,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qtyReceived" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "lotNumber" TEXT,
    "batchCode" TEXT,
    "expiryDate" TIMESTAMP(3),
    "manufacturingDate" TIMESTAMP(3),
    "inspectionStatus" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
    "inspectionRemarks" TEXT,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "balanceValueAfter" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "userId" TEXT,
    "lotId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLocationItem" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "movingAvgCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lotId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLocationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialIssue" (
    "id" TEXT NOT NULL,
    "issueNumber" TEXT,
    "projectId" TEXT,
    "departmentId" TEXT,
    "phaseId" TEXT,
    "builtUnitId" TEXT,
    "fromLocationId" TEXT NOT NULL,
    "subcontractorId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "status" "MaterialIssueStatus" NOT NULL DEFAULT 'COMPLETED',
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "receiverName" TEXT,
    "receiverMobile" TEXT,
    "vehicleNumber" TEXT,
    "vehicleType" TEXT,
    "vehiclePhotoUrl" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "notes" TEXT,
    "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sourceDprId" TEXT,
    "requisitionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialIssueLine" (
    "id" TEXT NOT NULL,
    "materialIssueId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "lotNumber" TEXT,

    CONSTRAINT "MaterialIssueLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapGeneration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scrapNumber" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "generationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceMaterialId" TEXT,
    "projectId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "ScrapGenerationStatus" NOT NULL DEFAULT 'COMPLETED',
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,

    CONSTRAINT "ScrapGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapGenerationLine" (
    "id" TEXT NOT NULL,
    "scrapGenerationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ScrapGenerationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT,
    "isInterCompany" BOOLEAN NOT NULL DEFAULT false,
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "handlingFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "markupPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "transferPriceTotal" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "receiverSignature" TEXT,
    "receiverLat" DOUBLE PRECISION,
    "receiverLng" DOUBLE PRECISION,
    "receiverLocation" TEXT,
    "geoFenceOk" BOOLEAN,
    "geoFenceDistance" DOUBLE PRECISION,
    "photos" JSONB,
    "deliveryMode" TEXT,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "transporterName" TEXT,
    "referenceNo" TEXT,
    "ewayBillNo" TEXT,
    "challanNumber" TEXT,
    "packageCount" INTEGER,
    "shortageRemarks" TEXT,
    "damageRemarks" TEXT,
    "dispatchPhotos" JSONB,
    "dispatchSignature" TEXT,
    "supervisorSignature" TEXT,
    "supervisorId" TEXT,
    "weighbridgeTicketNo" TEXT,
    "grossWeight" DECIMAL(14,3),
    "tareWeight" DECIMAL(14,3),
    "netWeight" DECIMAL(14,3),

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferLine" (
    "id" TEXT NOT NULL,
    "stockTransferId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "lotNumber" TEXT,
    "qtyReceived" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCostAtSource" DECIMAL(14,2),
    "unitTransferPrice" DECIMAL(14,2),
    "lineTransferTotal" DECIMAL(14,2),

    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "countDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "confirmedById" TEXT,
    "reconciledById" TEXT,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "countedQty" DECIMAL(14,3) NOT NULL,
    "systemQty" DECIMAL(14,3) NOT NULL,
    "variance" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "LandPurchase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "sellerId" TEXT,
    "sellerName" TEXT NOT NULL,
    "sellerContact" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalArea" DECIMAL(14,3) NOT NULL,
    "areaUnit" "AreaUnit" NOT NULL DEFAULT 'SQFT',
    "totalCost" DECIMAL(14,2) NOT NULL,
    "registryNo" TEXT,
    "location" TEXT,
    "documentUrl" TEXT,
    "mode" "LandPurchaseMode" NOT NULL DEFAULT 'WHOLE',
    "landType" "LandType" NOT NULL DEFAULT 'FREEHOLD',
    "leaseType" "LeaseType",
    "leasePeriodYears" INTEGER,
    "leaseStartDate" TIMESTAMP(3),
    "leaseEndDate" TIMESTAMP(3),
    "baseCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "leaseRentPercent" DECIMAL(5,2),
    "leaseRentAmount" DECIMAL(14,2),
    "gstPercent" DECIMAL(5,2),
    "gstAmount" DECIMAL(14,2),
    "registrationPercent" DECIMAL(5,2),
    "registrationAmount" DECIMAL(14,2),
    "stampDutyPercent" DECIMAL(5,2),
    "stampDutyAmount" DECIMAL(14,2),
    "transferDutyPercent" DECIMAL(5,2),
    "transferDutyAmount" DECIMAL(14,2),
    "brokerageAmount" DECIMAL(14,2),
    "legalFees" DECIMAL(14,2),
    "otherCharges" DECIMAL(14,2),
    "purchaseStage" TEXT NOT NULL DEFAULT 'COMPLETED',
    "tokenAmount" DECIMAL(14,2),
    "tokenPaymentDate" TIMESTAMP(3),
    "tokenPaymentMode" TEXT,
    "tokenChequePhotoUrl" TEXT,
    "atsDocumentUrl" TEXT,
    "atsDocumentName" TEXT,
    "bbaDocumentUrl" TEXT,
    "bbaDocumentName" TEXT,
    "bbaDate" TIMESTAMP(3),
    "registryDocumentUrl" TEXT,
    "registryDocumentName" TEXT,
    "isPossessed" BOOLEAN NOT NULL DEFAULT false,
    "possessionDate" TIMESTAMP(3),
    "possessionNotes" TEXT,
    "possessionDocumentUrl" TEXT,
    "partialRegistryAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LandPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandCostComponent" (
    "id" TEXT NOT NULL,
    "landPurchaseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" "LandCostFrequency" NOT NULL DEFAULT 'ONE_TIME',
    "interval" "LandCostRecurrenceInterval",
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "occurrences" INTEGER,
    "postedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandCostComponent_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "LandParcel" (
    "id" TEXT NOT NULL,
    "landPurchaseId" TEXT NOT NULL,
    "parentParcelId" TEXT,
    "number" TEXT NOT NULL,
    "area" DECIMAL(14,3) NOT NULL,
    "areaUnit" "AreaUnit" NOT NULL DEFAULT 'SQFT',
    "status" "LandParcelStatus" NOT NULL DEFAULT 'AVAILABLE',
    "purpose" "LandParcelPurpose" NOT NULL DEFAULT 'HOLD',
    "acquisitionCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "askingPrice" DECIMAL(14,2),
    "currentValuation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "nrvWriteDown" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isInfrastructure" BOOLEAN NOT NULL DEFAULT false,
    "marketValue" DECIMAL(15,2),
    "weightFactor" DECIMAL(5,2),
    "saleId" TEXT,
    "projectId" TEXT,
    "geometry" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LandParcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandPartition" (
    "id" TEXT NOT NULL,
    "parentParcelId" TEXT NOT NULL,
    "partitionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "childCount" INTEGER NOT NULL,
    "notes" TEXT,
    "allocationModel" TEXT NOT NULL DEFAULT 'PRO_RATA',
    "infrastructureArea" DECIMAL(12,2),
    "developmentCost" DECIMAL(15,2),

    CONSTRAINT "LandPartition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuiltUnit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "unitType" "BuiltUnitType" NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "floor" INTEGER,
    "wing" TEXT,
    "area" DECIMAL(14,3) NOT NULL,
    "areaUnit" "AreaUnit" NOT NULL DEFAULT 'SQFT',
    "carpetArea" DECIMAL(14,3),
    "superBuiltUpArea" DECIMAL(14,3),
    "balconyArea" DECIMAL(14,3),
    "clearHeight" DECIMAL(14,3),
    "hasLoadingDock" BOOLEAN NOT NULL DEFAULT false,
    "status" "BuiltUnitStatus" NOT NULL DEFAULT 'PLANNED',
    "originType" "UnitOrigin" NOT NULL DEFAULT 'CREATED',
    "acquisitionCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "purchaseDate" TIMESTAMP(3),
    "landParcelId" TEXT,
    "productionCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "askingPrice" DECIMAL(14,2),
    "currentValuation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "nrvWriteDown" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "capitalizedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saleId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BuiltUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalListing" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "builtUnitId" TEXT NOT NULL,
    "portalName" TEXT NOT NULL,
    "listingId" TEXT,
    "listingUrl" TEXT,
    "status" "PortalListingStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "askingPrice" DECIMAL(14,2) NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "area" DECIMAL(14,3) NOT NULL,
    "areaUnit" "AreaUnit" NOT NULL DEFAULT 'SQFT',
    "floor" INTEGER,
    "furnishing" TEXT,
    "photos" TEXT[],
    "listedAt" TIMESTAMP(3),
    "delistedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "serialNumber" TEXT,
    "category" TEXT,
    "companyId" TEXT NOT NULL,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "acquisitionCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currentValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "purchaseDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentAssignment" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "projectId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "status" "EquipmentAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,

    CONSTRAINT "EquipmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentMaintenance" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vendor" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequisition" (
    "id" TEXT NOT NULL,
    "reqNumber" TEXT NOT NULL,
    "projectId" TEXT,
    "departmentId" TEXT,
    "phaseId" TEXT,
    "requestedById" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "neededByDate" TIMESTAMP(3),
    "notes" TEXT,
    "convertedPoId" TEXT,
    "lciDecision" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "minQuotesRequired" INTEGER NOT NULL DEFAULT 3,
    "quotesWaived" BOOLEAN NOT NULL DEFAULT false,
    "quotesWaivedById" TEXT,
    "quotesWaivedReason" TEXT,
    "quotesWaivedAt" TIMESTAMP(3),
    "quotesLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequisitionLine" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qtyRequested" DECIMAL(14,3) NOT NULL,
    "notes" TEXT,
    "preferredSupplierId" TEXT,
    "currentStock" DECIMAL(14,3),
    "lastRate" DECIMAL(14,2),
    "lastRateDate" TIMESTAMP(3),

    CONSTRAINT "MaterialRequisitionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorQuote" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT,
    "supplierId" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "quoteSource" "QuoteSource" NOT NULL DEFAULT 'DOCUMENT',
    "sourceNote" TEXT,
    "landedTotal" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freightTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "handlingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "packingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loadingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insuranceTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "buyerTransportTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "validUntil" TIMESTAMP(3),
    "paymentTerms" TEXT,
    "deliveryTermsType" "DeliveryTerms" NOT NULL DEFAULT 'DELIVERED_SITE',
    "deliveryTerms" TEXT,
    "leadTimeDays" INTEGER,
    "warranty" TEXT,
    "isCheapest" BOOLEAN NOT NULL DEFAULT false,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "selectedById" TEXT,
    "selectedAt" TIMESTAMP(3),
    "selectionReason" TEXT,
    "submittedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "quotationRequestId" TEXT,

    CONSTRAINT "VendorQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorQuoteLine" (
    "id" TEXT NOT NULL,
    "vendorQuoteId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "hsnCode" TEXT,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "packingPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freightPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loadingPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insurancePerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "handlingPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "buyerTransportPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitLandedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "VendorQuoteLine_pkey" PRIMARY KEY ("id")
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
    "requisitionId" TEXT,

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
CREATE TABLE "SupplierReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "locationId" TEXT NOT NULL,
    "status" "SupplierReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditNoteNo" TEXT,
    "vehicleNumber" TEXT,
    "vehicleType" TEXT,
    "vehiclePhotoUrl" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnLine" (
    "id" TEXT NOT NULL,
    "supplierReturnId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "SupplierReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectPurchase" (
    "id" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "billAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vehicleNumber" TEXT,
    "vehicleType" TEXT,
    "vehiclePhotoUrl" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "DirectPurchaseStatus" NOT NULL DEFAULT 'COMPLETED',
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "requisitionId" TEXT,

    CONSTRAINT "DirectPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectPurchaseLine" (
    "id" TEXT NOT NULL,
    "directPurchaseId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "DirectPurchaseLine_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetSale" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "landParcelId" TEXT,
    "builtUnitId" TEXT,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT,
    "companyId" TEXT NOT NULL,
    "salePrice" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costBasis" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SaleStatus" NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMode" TEXT,
    "notes" TEXT,
    "saleStage" TEXT NOT NULL DEFAULT 'PENDING',
    "depositAmount" DECIMAL(14,2),
    "depositDate" TIMESTAMP(3),
    "finalSaleDate" TIMESTAMP(3),
    "saleDeedNo" TEXT,
    "expectedRegistryDate" TIMESTAMP(3),
    "atsNo" TEXT,
    "atsDate" TIMESTAMP(3),
    "allowRegistryBeforeFullPayment" BOOLEAN NOT NULL DEFAULT false,
    "allotmentLetterNo" TEXT,
    "allotmentDate" TIMESTAMP(3),
    "bbaNo" TEXT,
    "bbaDate" TIMESTAMP(3),
    "atsDocumentUrl" TEXT,
    "atsDocumentName" TEXT,
    "bbaDocumentUrl" TEXT,
    "bbaDocumentName" TEXT,
    "registryDocumentUrl" TEXT,
    "registryDocumentName" TEXT,
    "allotmentDocumentUrl" TEXT,
    "allotmentDocumentName" TEXT,
    "tdsAmount" DECIMAL(14,2),
    "tdsCertificateNo" TEXT,
    "homeLoanBank" TEXT,
    "homeLoanAmount" DECIMAL(14,2),
    "homeLoanSanctionNo" TEXT,
    "homeLoanSanctionDate" TIMESTAMP(3),
    "dealMaturityMonths" INTEGER,
    "dealMaturityDate" TIMESTAMP(3),
    "paymentCycle" TEXT,
    "dealSource" "DealSource" NOT NULL DEFAULT 'SELF',
    "brokerId" TEXT,
    "brokerName" TEXT,
    "brokerPhone" TEXT,
    "commissionAmount" DECIMAL(14,2),
    "commissionIsPartOfDeal" BOOLEAN NOT NULL DEFAULT false,
    "commissionPaid" BOOLEAN NOT NULL DEFAULT false,
    "commissionPaidDate" TIMESTAMP(3),
    "draftDocumentUrl" TEXT,
    "draftDocumentName" TEXT,
    "draftNotes" TEXT,
    "draftDate" DATE,
    "irn" TEXT,
    "irnAckNo" TEXT,
    "irnAckDate" TIMESTAMP(3),
    "irnQrCode" TEXT,
    "irnStatus" TEXT,
    "irnError" TEXT,
    "irnGeneratedAt" TIMESTAMP(3),
    "irnCancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetSalePayment" (
    "id" TEXT NOT NULL,
    "assetSaleId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "chequeNo" TEXT,
    "chequeDate" TIMESTAMP(3),
    "chequeBank" TEXT,
    "chequePhotoUrl" TEXT,
    "chequeStatus" TEXT,
    "chequeClearDate" TIMESTAMP(3),
    "chequeBounceReason" TEXT,

    CONSTRAINT "AssetSalePayment_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "ProjectCost" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costType" "ProjectCostType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendor" TEXT,
    "subcontractorId" TEXT,
    "notes" TEXT,
    "receiptUrl" TEXT,
    "createdById" TEXT,
    "sourceDprId" TEXT,
    "sourceLegalDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "glAccountCode" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "categoryId" TEXT,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "payeeName" TEXT,
    "paymentMode" TEXT,
    "bankAccount" TEXT,
    "chequeNo" TEXT,
    "chequeDate" TIMESTAMP(3),
    "chequePhotoUrl" TEXT,
    "referenceNo" TEXT,
    "receiptUrl" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "glPostedAt" TIMESTAMP(3),
    "recurringExpenseId" TEXT,
    "expenseClaimId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paymentMode" TEXT,
    "referenceNo" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaimLine" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "categoryId" TEXT,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(5,2),
    "gstAmount" DECIMAL(14,2),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiptUrl" TEXT,
    "notes" TEXT,

    CONSTRAINT "ExpenseClaimLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashFloat" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "floatAmount" DECIMAL(14,2) NOT NULL,
    "topUpTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "spentTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "custodianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashFloat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashTopUp" (
    "id" TEXT NOT NULL,
    "floatId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMode" TEXT,
    "referenceNo" TEXT,
    "notes" TEXT,
    "createdById" TEXT,

    CONSTRAINT "PettyCashTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "categoryId" TEXT,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" "RecurringExpenseFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "payeeName" TEXT,
    "supplierId" TEXT,
    "paymentMode" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseBudget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "categoryId" TEXT,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "memo" TEXT,
    "companyId" TEXT NOT NULL,
    "postedById" TEXT,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
    "totalDebit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "entityType" TEXT,
    "entityId" TEXT,
    "memo" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallySyncLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "tallyVoucherType" TEXT NOT NULL,
    "tallyVoucherNumber" TEXT,
    "referenceNumber" TEXT,
    "tallyAmount" DECIMAL(14,2),
    "syncStatus" "TallySyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "xmlPayload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TallySyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerifyError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "templateId" TEXT,
    "eventType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InAppNotification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dhKey" TEXT,
    "authKey" TEXT,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "dueDate" TIMESTAMP(3),
    "assignedToId" TEXT NOT NULL,
    "assignedById" TEXT,
    "estimateMins" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubTask" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskActivity" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTimeLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMins" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskTimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'Workflow',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "graphJson" JSONB NOT NULL,
    "companyId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledWorkflow" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "cron" TEXT,
    "intervalM" INTEGER,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL DEFAULT 'CASUAL',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" DECIMAL(5,2) NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "landParcelId" TEXT,
    "builtUnitId" TEXT,
    "customerId" TEXT,
    "projectId" TEXT,
    "tenantName" TEXT NOT NULL,
    "tenantPhone" TEXT,
    "tenantEmail" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "monthlyRent" DECIMAL(14,2) NOT NULL,
    "baseRent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "securityDeposit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rentAgreementNo" TEXT,
    "rentAgreementDocumentUrl" TEXT,
    "rentAgreementDocumentName" TEXT,
    "sacCode" TEXT,
    "escalationPercent" DECIMAL(5,2),
    "escalationIntervalMonths" INTEGER NOT NULL DEFAULT 12,
    "nextEscalationDate" DATE,
    "lastEscalatedAt" DATE,
    "rentFreeDays" INTEGER NOT NULL DEFAULT 0,
    "draftDocumentUrl" TEXT,
    "draftDocumentName" TEXT,
    "draftNotes" TEXT,
    "draftDate" DATE,
    "status" "TenancyStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalPayment" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsCertificateNo" TEXT,
    "netReceived" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATE NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "periodStart" DATE,
    "periodEnd" DATE,
    "reminderSentAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "date" DATE NOT NULL,
    "attendanceSummary" TEXT,
    "workDone" TEXT NOT NULL,
    "materialUsed" TEXT,
    "equipment" TEXT,
    "delay" TEXT,
    "remarks" TEXT,
    "submittedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialSale" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "scrapSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "partyName" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMode" TEXT,
    "vehicleNumber" TEXT,
    "vehicleType" TEXT,
    "vehiclePhotoUrl" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "notes" TEXT,
    "irn" TEXT,
    "irnAckNo" TEXT,
    "irnAckDate" TIMESTAMP(3),
    "irnQrCode" TEXT,
    "irnStatus" TEXT,
    "irnError" TEXT,
    "irnGeneratedAt" TIMESTAMP(3),
    "irnCancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialSalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
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

    CONSTRAINT "MaterialSalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialSaleLine" (
    "id" TEXT NOT NULL,
    "materialSaleId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "MaterialSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialSaleReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "materialSaleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "MaterialSaleReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditNoteNo" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialSaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialSaleReturnLine" (
    "id" TEXT NOT NULL,
    "materialSaleReturnId" TEXT NOT NULL,
    "materialSaleLineId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reason" TEXT,

    CONSTRAINT "MaterialSaleReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenovationProject" (
    "id" TEXT NOT NULL,
    "renovationNumber" TEXT NOT NULL,
    "type" "RenovationType" NOT NULL,
    "status" "RenovationStatus" NOT NULL DEFAULT 'PLANNED',
    "builtUnitId" TEXT,
    "landParcelId" TEXT,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "originalValuation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "newValuation" DECIMAL(14,2),
    "startDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenovationProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenovationCost" (
    "id" TEXT NOT NULL,
    "renovationProjectId" TEXT NOT NULL,
    "costType" "ProjectCostType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendor" TEXT,
    "notes" TEXT,
    "receiptUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenovationCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoqItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "parentId" TEXT,
    "type" "BoqItemType" NOT NULL DEFAULT 'SECTION',
    "serialNo" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "materialId" TEXT,
    "unit" TEXT,
    "estimatedQty" DECIMAL(14,3),
    "rate" DECIMAL(14,2),
    "estimatedAmount" DECIMAL(14,2),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoqItem_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "WbsNode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "parentId" TEXT,
    "boqItemId" TEXT,
    "type" "WbsNodeType" NOT NULL DEFAULT 'ACTIVITY',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "progressPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "totalFloat" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WbsNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WbsDependency" (
    "id" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" "DependencyType" NOT NULL DEFAULT 'FS',
    "lagDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WbsDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementBookEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "boqItemId" TEXT NOT NULL,
    "wbsNodeId" TEXT,
    "mbNumber" TEXT NOT NULL,
    "measuredQty" DECIMAL(14,3) NOT NULL,
    "cumulativeQty" DECIMAL(14,3) NOT NULL,
    "description" TEXT NOT NULL,
    "locationRef" TEXT,
    "measureDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MbEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "measuredById" TEXT,
    "verifiedById" TEXT,
    "approvedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "raBillLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasurementBookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractorWorkOrder" (
    "id" TEXT NOT NULL,
    "workOrderNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "subcontractorId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "workTitle" TEXT NOT NULL,
    "description" TEXT,
    "retentionPct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "tdsPct" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "tdsCategory" "SubcontractorCategory" NOT NULL DEFAULT 'COMPANY',
    "advanceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advanceRecoveryPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "totalWorkDone" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retentionBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "defectLiabilityMonths" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubcontractorWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractorWorkOrderLine" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "agreedRate" DECIMAL(14,2) NOT NULL,
    "cumulativeQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cumulativeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "SubcontractorWorkOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaBill" (
    "id" TEXT NOT NULL,
    "raBillNumber" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "status" "RaBillStatus" NOT NULL DEFAULT 'DRAFT',
    "grossAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cumulativeGross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retentionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advanceRecovery" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdById" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaBillLine" (
    "id" TEXT NOT NULL,
    "raBillId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "workOrderLineId" TEXT NOT NULL,
    "prevQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "thisQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "rate" DECIMAL(14,2) NOT NULL,
    "prevAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "thisAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "RaBillLine_pkey" PRIMARY KEY ("id")
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
    "materialId" TEXT,
    "workType" TEXT,
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
CREATE TABLE "PaymentSchedule" (
    "id" TEXT NOT NULL,
    "assetSaleId" TEXT NOT NULL,
    "type" "PaymentScheduleType" NOT NULL DEFAULT 'CLP',
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentScheduleItem" (
    "id" TEXT NOT NULL,
    "paymentScheduleId" TEXT NOT NULL,
    "wbsNodeId" TEXT,
    "installmentNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "PaymentScheduleItemStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateContract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "agreedRate" DECIMAL(14,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "minQty" DECIMAL(14,3),
    "maxQty" DECIMAL(14,3),
    "totalReleasedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "status" "RateContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateContract_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "BankSms" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2),
    "upiRef" TEXT,
    "accountNo" TEXT,
    "bankName" TEXT,
    "txnType" TEXT,
    "counterparty" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchedEntityType" TEXT,
    "matchedEntityId" TEXT,
    "paymentRecordId" TEXT,
    "matchConfidence" DECIMAL(5,2),
    "matchReason" TEXT,
    "smsHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankSms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "companyId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "label" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPhone" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "numberType" TEXT NOT NULL DEFAULT 'VIRTUAL',
    "provider" TEXT,
    "providerNumberId" TEXT,
    "department" TEXT,
    "label" TEXT,
    "assignedToUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "monthlyCost" DECIMAL(14,2),
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentBeep" BOOLEAN,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyPhone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneAssignment" (
    "id" TEXT NOT NULL,
    "companyPhoneId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "reason" TEXT,
    "assignedById" TEXT,

    CONSTRAINT "PhoneAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "companyPhoneId" TEXT,
    "callerUserId" TEXT,
    "calleeUserId" TEXT,
    "relatedCustomerId" TEXT,
    "relatedSupplierId" TEXT,
    "relatedProjectId" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "connectedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "ringDurationSec" INTEGER NOT NULL DEFAULT 0,
    "recordingId" TEXT,
    "recordingConsent" BOOLEAN NOT NULL DEFAULT false,
    "disposition" TEXT,
    "notes" TEXT,
    "callCost" DECIMAL(14,2),
    "provider" TEXT,
    "providerCallId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "conferenceId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallRecording" (
    "id" TEXT NOT NULL,
    "callLogId" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "fileSizeBytes" INTEGER,
    "format" TEXT NOT NULL DEFAULT 'mp3',
    "durationSec" INTEGER NOT NULL,
    "checksum" TEXT,
    "encryptionKeyRef" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "transcriptUrl" TEXT,
    "transcriptText" TEXT,
    "transcriptStatus" TEXT NOT NULL DEFAULT 'NONE',
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CallRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingAccessLog" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "RecordingAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallNote" (
    "id" TEXT NOT NULL,
    "callLogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallTag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',

    CONSTRAINT "CallTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLogTag" (
    "id" TEXT NOT NULL,
    "callLogId" TEXT NOT NULL,
    "callTagId" TEXT NOT NULL,

    CONSTRAINT "CallLogTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voicemail" (
    "id" TEXT NOT NULL,
    "callLogId" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "transcription" TEXT,
    "listenedAt" TIMESTAMP(3),
    "listenedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voicemail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "direction" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "companyPhoneId" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "relatedCallLogId" TEXT,
    "dltTemplateId" TEXT,

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelephonyProviderConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyRef" TEXT NOT NULL,
    "apiSecretRef" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "settings" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TelephonyProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "policyText" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "ConsentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentAcceptance" (
    "id" TEXT NOT NULL,
    "consentPolicyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ConsentAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextSeq" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE INDEX "Company_parentCompanyId_idx" ON "Company"("parentCompanyId");

-- CreateIndex
CREATE INDEX "UserCompany_companyId_idx" ON "UserCompany"("companyId");

-- CreateIndex
CREATE INDEX "UserCompany_reportsToUserCompanyId_idx" ON "UserCompany"("reportsToUserCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCompany_userId_companyId_key" ON "UserCompany"("userId", "companyId");

-- CreateIndex
CREATE INDEX "UserScope_userCompanyId_idx" ON "UserScope"("userCompanyId");

-- CreateIndex
CREATE INDEX "UserScope_departmentId_idx" ON "UserScope"("departmentId");

-- CreateIndex
CREATE INDEX "UserScope_projectId_idx" ON "UserScope"("projectId");

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_permission_key" ON "RolePermission"("role", "permission");

-- CreateIndex
CREATE INDEX "UserPermission_userCompanyId_idx" ON "UserPermission"("userCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userCompanyId_permission_key" ON "UserPermission"("userCompanyId", "permission");

-- CreateIndex
CREATE INDEX "CustomRole_companyId_idx" ON "CustomRole"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_companyId_key_key" ON "CustomRole"("companyId", "key");

-- CreateIndex
CREATE INDEX "UserPreference_companyId_idx" ON "UserPreference"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_companyId_key_key" ON "UserPreference"("userId", "companyId", "key");

-- CreateIndex
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");

-- CreateIndex
CREATE INDEX "Employee_deletedAt_idx" ON "Employee"("deletedAt");

-- CreateIndex
CREATE INDEX "Employee_userId_idx" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_crewId_idx" ON "Employee"("crewId");

-- CreateIndex
CREATE INDEX "Employee_activeProjectId_idx" ON "Employee"("activeProjectId");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_reportsToEmployeeId_idx" ON "Employee"("reportsToEmployeeId");

-- CreateIndex
CREATE INDEX "Employee_employmentType_idx" ON "Employee"("employmentType");

-- CreateIndex
CREATE INDEX "Employee_contractStatus_idx" ON "Employee"("contractStatus");

-- CreateIndex
CREATE INDEX "Employee_offerLetterStatus_idx" ON "Employee"("offerLetterStatus");

-- CreateIndex
CREATE INDEX "Employee_idCardStatus_idx" ON "Employee"("idCardStatus");

-- CreateIndex
CREATE INDEX "Employee_appointmentLetterStatus_idx" ON "Employee"("appointmentLetterStatus");

-- CreateIndex
CREATE INDEX "SalaryHistory_employeeId_idx" ON "SalaryHistory"("employeeId");

-- CreateIndex
CREATE INDEX "SalaryHistory_companyId_idx" ON "SalaryHistory"("companyId");

-- CreateIndex
CREATE INDEX "SalaryHistory_effectiveFrom_idx" ON "SalaryHistory"("effectiveFrom");

-- CreateIndex
CREATE INDEX "EmployeeResource_employeeId_idx" ON "EmployeeResource"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeResource_companyId_idx" ON "EmployeeResource"("companyId");

-- CreateIndex
CREATE INDEX "EmployeeResource_category_idx" ON "EmployeeResource"("category");

-- CreateIndex
CREATE INDEX "EmployeeResource_returnedAt_idx" ON "EmployeeResource"("returnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeExit_employeeId_key" ON "EmployeeExit"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeExit_companyId_idx" ON "EmployeeExit"("companyId");

-- CreateIndex
CREATE INDEX "EmployeeExit_terminationDate_idx" ON "EmployeeExit"("terminationDate");

-- CreateIndex
CREATE INDEX "EmployeeBenefit_employeeId_idx" ON "EmployeeBenefit"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeBenefit_type_idx" ON "EmployeeBenefit"("type");

-- CreateIndex
CREATE INDEX "SalaryComponent_employeeId_idx" ON "SalaryComponent"("employeeId");

-- CreateIndex
CREATE INDEX "SalaryComponent_type_idx" ON "SalaryComponent"("type");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryComponent_employeeId_type_key" ON "SalaryComponent"("employeeId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_phoneNormalized_idx" ON "User"("phoneNormalized");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- CreateIndex
CREATE INDEX "Feedback_companyId_idx" ON "Feedback"("companyId");

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "ErrorLog_userId_idx" ON "ErrorLog"("userId");

-- CreateIndex
CREATE INDEX "ErrorLog_companyId_idx" ON "ErrorLog"("companyId");

-- CreateIndex
CREATE INDEX "ErrorLog_type_idx" ON "ErrorLog"("type");

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "ProjectAssignment_userId_idx" ON "ProjectAssignment"("userId");

-- CreateIndex
CREATE INDEX "ProjectAssignment_projectId_idx" ON "ProjectAssignment"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAssignment_userId_projectId_key" ON "ProjectAssignment"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_providerId_accountId_idx" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialID_key" ON "Passkey"("credentialID");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_idx" ON "PhoneOtp"("phone");

-- CreateIndex
CREATE INDEX "PhoneOtp_expiresAt_idx" ON "PhoneOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "PhoneOtp_clientIp_idx" ON "PhoneOtp"("clientIp");

-- CreateIndex
CREATE INDEX "PhoneOtp_createdAt_idx" ON "PhoneOtp"("createdAt");

-- CreateIndex
CREATE INDEX "Project_companyId_idx" ON "Project"("companyId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "ProjectPhase_projectId_idx" ON "ProjectPhase"("projectId");

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
CREATE UNIQUE INDEX "StockLocation_departmentId_key" ON "StockLocation"("departmentId");

-- CreateIndex
CREATE INDEX "StockLocation_companyId_idx" ON "StockLocation"("companyId");

-- CreateIndex
CREATE INDEX "StockLocation_projectId_idx" ON "StockLocation"("projectId");

-- CreateIndex
CREATE INDEX "StockLocation_phaseId_idx" ON "StockLocation"("phaseId");

-- CreateIndex
CREATE INDEX "StockLocation_departmentId_idx" ON "StockLocation"("departmentId");

-- CreateIndex
CREATE INDEX "MaterialCategory_companyId_idx" ON "MaterialCategory"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_companyId_name_key" ON "MaterialCategory"("companyId", "name");

-- CreateIndex
CREATE INDEX "Material_categoryId_idx" ON "Material"("categoryId");

-- CreateIndex
CREATE INDEX "Material_companyId_idx" ON "Material"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_companyId_code_key" ON "Material"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Material_companyId_barcode_key" ON "Material"("companyId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Material_companyId_qrCode_key" ON "Material"("companyId", "qrCode");

-- CreateIndex
CREATE INDEX "MaterialLot_materialId_companyId_idx" ON "MaterialLot"("materialId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialLot_materialId_lotNumber_companyId_key" ON "MaterialLot"("materialId", "lotNumber", "companyId");

-- CreateIndex
CREATE INDEX "StandardConsumption_companyId_workType_idx" ON "StandardConsumption"("companyId", "workType");

-- CreateIndex
CREATE UNIQUE INDEX "StandardConsumption_companyId_workType_materialId_key" ON "StandardConsumption"("companyId", "workType", "materialId");

-- CreateIndex
CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");

-- CreateIndex
CREATE INDEX "Supplier_companyId_deletedAt_idx" ON "Supplier"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_gstin_key" ON "Supplier"("companyId", "gstin");

-- CreateIndex
CREATE INDEX "Subcontractor_companyId_idx" ON "Subcontractor"("companyId");

-- CreateIndex
CREATE INDEX "Subcontractor_companyId_deletedAt_idx" ON "Subcontractor"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Subcontractor_name_idx" ON "Subcontractor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subcontractor_companyId_gstin_key" ON "Subcontractor"("companyId", "gstin");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE INDEX "Department_deletedAt_idx" ON "Department"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_code_key" ON "Department"("companyId", "code");

-- CreateIndex
CREATE INDEX "Crew_companyId_idx" ON "Crew"("companyId");

-- CreateIndex
CREATE INDEX "Crew_projectId_idx" ON "Crew"("projectId");

-- CreateIndex
CREATE INDEX "Crew_supervisorId_idx" ON "Crew"("supervisorId");

-- CreateIndex
CREATE INDEX "WorkerAttendance_companyId_date_idx" ON "WorkerAttendance"("companyId", "date");

-- CreateIndex
CREATE INDEX "WorkerAttendance_projectId_date_idx" ON "WorkerAttendance"("projectId", "date");

-- CreateIndex
CREATE INDEX "WorkerAttendance_employeeId_date_idx" ON "WorkerAttendance"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerAttendance_employeeId_date_key" ON "WorkerAttendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "PayrollPeriod_companyId_idx" ON "PayrollPeriod"("companyId");

-- CreateIndex
CREATE INDEX "PayrollPeriod_status_idx" ON "PayrollPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_companyId_year_month_key" ON "PayrollPeriod"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "PayrollLine_employeeId_idx" ON "PayrollLine"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_payrollPeriodId_employeeId_key" ON "PayrollLine"("payrollPeriodId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyProgressReport_autoScrapGenerationId_key" ON "DailyProgressReport"("autoScrapGenerationId");

-- CreateIndex
CREATE INDEX "DailyProgressReport_companyId_date_idx" ON "DailyProgressReport"("companyId", "date");

-- CreateIndex
CREATE INDEX "DailyProgressReport_projectId_date_idx" ON "DailyProgressReport"("projectId", "date");

-- CreateIndex
CREATE INDEX "DailyProgressReport_approvalStatus_idx" ON "DailyProgressReport"("approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "DailyProgressReport_projectId_date_key" ON "DailyProgressReport"("projectId", "date");

-- CreateIndex
CREATE INDEX "DPRMaterialLine_dprId_idx" ON "DPRMaterialLine"("dprId");

-- CreateIndex
CREATE INDEX "DPRMaterialLine_materialId_idx" ON "DPRMaterialLine"("materialId");

-- CreateIndex
CREATE INDEX "DPRLaborLine_dprId_idx" ON "DPRLaborLine"("dprId");

-- CreateIndex
CREATE INDEX "DPRLaborLine_employeeId_idx" ON "DPRLaborLine"("employeeId");

-- CreateIndex
CREATE INDEX "DPRLaborLine_crewId_idx" ON "DPRLaborLine"("crewId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_idx" ON "PurchaseOrder"("companyId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_projectId_idx" ON "PurchaseOrder"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_approvedById_idx" ON "PurchaseOrder"("approvedById");

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_status_createdAt_idx" ON "PurchaseOrder"("companyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_paymentNumber_key" ON "SupplierPayment"("paymentNumber");

-- CreateIndex
CREATE INDEX "SupplierPayment_companyId_idx" ON "SupplierPayment"("companyId");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayment_purchaseOrderId_idx" ON "SupplierPayment"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "SupplierPayment_invoiceId_idx" ON "SupplierPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_companyId_idx" ON "SupplierInvoice"("companyId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_supplierId_idx" ON "SupplierInvoice"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_purchaseOrderId_idx" ON "SupplierInvoice"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_status_idx" ON "SupplierInvoice"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_materialId_idx" ON "PurchaseOrderLine"("materialId");

-- CreateIndex
CREATE INDEX "PurchaseOrderCharge_purchaseOrderId_idx" ON "PurchaseOrderCharge"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_purchaseOrderId_idx" ON "GoodsReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_locationId_idx" ON "GoodsReceipt"("locationId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_goodsReceiptId_idx" ON "GoodsReceiptLine"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_materialId_idx" ON "GoodsReceiptLine"("materialId");

-- CreateIndex
CREATE INDEX "StockMovement_materialId_timestamp_idx" ON "StockMovement"("materialId", "timestamp");

-- CreateIndex
CREATE INDEX "StockMovement_toLocationId_idx" ON "StockMovement"("toLocationId");

-- CreateIndex
CREATE INDEX "StockMovement_fromLocationId_idx" ON "StockMovement"("fromLocationId");

-- CreateIndex
CREATE INDEX "StockMovement_refType_refId_idx" ON "StockMovement"("refType", "refId");

-- CreateIndex
CREATE INDEX "StockMovement_lotId_idx" ON "StockMovement"("lotId");

-- CreateIndex
CREATE INDEX "StockLocationItem_materialId_idx" ON "StockLocationItem"("materialId");

-- CreateIndex
CREATE INDEX "StockLocationItem_lotId_idx" ON "StockLocationItem"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocationItem_locationId_materialId_key" ON "StockLocationItem"("locationId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssue_issueNumber_key" ON "MaterialIssue"("issueNumber");

-- CreateIndex
CREATE INDEX "MaterialIssue_projectId_idx" ON "MaterialIssue"("projectId");

-- CreateIndex
CREATE INDEX "MaterialIssue_departmentId_idx" ON "MaterialIssue"("departmentId");

-- CreateIndex
CREATE INDEX "MaterialIssue_fromLocationId_idx" ON "MaterialIssue"("fromLocationId");

-- CreateIndex
CREATE INDEX "MaterialIssue_phaseId_idx" ON "MaterialIssue"("phaseId");

-- CreateIndex
CREATE INDEX "MaterialIssue_builtUnitId_idx" ON "MaterialIssue"("builtUnitId");

-- CreateIndex
CREATE INDEX "MaterialIssue_sourceDprId_idx" ON "MaterialIssue"("sourceDprId");

-- CreateIndex
CREATE INDEX "MaterialIssue_requisitionId_idx" ON "MaterialIssue"("requisitionId");

-- CreateIndex
CREATE INDEX "MaterialIssueLine_materialIssueId_idx" ON "MaterialIssueLine"("materialIssueId");

-- CreateIndex
CREATE INDEX "MaterialIssueLine_materialId_idx" ON "MaterialIssueLine"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapGeneration_scrapNumber_key" ON "ScrapGeneration"("scrapNumber");

-- CreateIndex
CREATE INDEX "ScrapGeneration_companyId_idx" ON "ScrapGeneration"("companyId");

-- CreateIndex
CREATE INDEX "ScrapGeneration_toLocationId_idx" ON "ScrapGeneration"("toLocationId");

-- CreateIndex
CREATE INDEX "ScrapGeneration_generationDate_idx" ON "ScrapGeneration"("generationDate");

-- CreateIndex
CREATE INDEX "ScrapGenerationLine_scrapGenerationId_idx" ON "ScrapGenerationLine"("scrapGenerationId");

-- CreateIndex
CREATE INDEX "ScrapGenerationLine_materialId_idx" ON "ScrapGenerationLine"("materialId");

-- CreateIndex
CREATE INDEX "StockTransfer_fromLocationId_idx" ON "StockTransfer"("fromLocationId");

-- CreateIndex
CREATE INDEX "StockTransfer_toLocationId_idx" ON "StockTransfer"("toLocationId");

-- CreateIndex
CREATE INDEX "StockTransfer_createdById_idx" ON "StockTransfer"("createdById");

-- CreateIndex
CREATE INDEX "StockTransfer_isInterCompany_idx" ON "StockTransfer"("isInterCompany");

-- CreateIndex
CREATE INDEX "StockTransferLine_stockTransferId_idx" ON "StockTransferLine"("stockTransferId");

-- CreateIndex
CREATE INDEX "StockTransferLine_materialId_idx" ON "StockTransferLine"("materialId");

-- CreateIndex
CREATE INDEX "StockCount_locationId_idx" ON "StockCount"("locationId");

-- CreateIndex
CREATE INDEX "StockCount_createdById_idx" ON "StockCount"("createdById");

-- CreateIndex
CREATE INDEX "StockCountLine_stockCountId_idx" ON "StockCountLine"("stockCountId");

-- CreateIndex
CREATE INDEX "StockCountLine_materialId_idx" ON "StockCountLine"("materialId");

-- CreateIndex
CREATE INDEX "LandSeller_companyId_idx" ON "LandSeller"("companyId");

-- CreateIndex
CREATE INDEX "LandSeller_companyId_deletedAt_idx" ON "LandSeller"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "LandSeller_name_idx" ON "LandSeller"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LandSeller_companyId_phone_key" ON "LandSeller"("companyId", "phone");

-- CreateIndex
CREATE INDEX "LandPurchase_companyId_idx" ON "LandPurchase"("companyId");

-- CreateIndex
CREATE INDEX "LandPurchase_projectId_idx" ON "LandPurchase"("projectId");

-- CreateIndex
CREATE INDEX "LandPurchase_createdById_idx" ON "LandPurchase"("createdById");

-- CreateIndex
CREATE INDEX "LandPurchase_sellerId_idx" ON "LandPurchase"("sellerId");

-- CreateIndex
CREATE INDEX "LandPurchase_purchaseStage_idx" ON "LandPurchase"("purchaseStage");

-- CreateIndex
CREATE INDEX "LandCostComponent_landPurchaseId_idx" ON "LandCostComponent"("landPurchaseId");

-- CreateIndex
CREATE INDEX "LandCostComponent_createdById_idx" ON "LandCostComponent"("createdById");

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
CREATE UNIQUE INDEX "LandParcel_saleId_key" ON "LandParcel"("saleId");

-- CreateIndex
CREATE INDEX "LandParcel_landPurchaseId_idx" ON "LandParcel"("landPurchaseId");

-- CreateIndex
CREATE INDEX "LandParcel_parentParcelId_idx" ON "LandParcel"("parentParcelId");

-- CreateIndex
CREATE INDEX "LandParcel_status_idx" ON "LandParcel"("status");

-- CreateIndex
CREATE INDEX "LandParcel_saleId_idx" ON "LandParcel"("saleId");

-- CreateIndex
CREATE INDEX "LandParcel_landPurchaseId_status_idx" ON "LandParcel"("landPurchaseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LandParcel_landPurchaseId_number_key" ON "LandParcel"("landPurchaseId", "number");

-- CreateIndex
CREATE INDEX "LandPartition_parentParcelId_idx" ON "LandPartition"("parentParcelId");

-- CreateIndex
CREATE UNIQUE INDEX "BuiltUnit_saleId_key" ON "BuiltUnit"("saleId");

-- CreateIndex
CREATE INDEX "BuiltUnit_projectId_idx" ON "BuiltUnit"("projectId");

-- CreateIndex
CREATE INDEX "BuiltUnit_phaseId_idx" ON "BuiltUnit"("phaseId");

-- CreateIndex
CREATE INDEX "BuiltUnit_landParcelId_idx" ON "BuiltUnit"("landParcelId");

-- CreateIndex
CREATE INDEX "BuiltUnit_status_idx" ON "BuiltUnit"("status");

-- CreateIndex
CREATE INDEX "BuiltUnit_unitType_idx" ON "BuiltUnit"("unitType");

-- CreateIndex
CREATE INDEX "BuiltUnit_originType_idx" ON "BuiltUnit"("originType");

-- CreateIndex
CREATE INDEX "BuiltUnit_saleId_idx" ON "BuiltUnit"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "BuiltUnit_projectId_unitNumber_key" ON "BuiltUnit"("projectId", "unitNumber");

-- CreateIndex
CREATE INDEX "PortalListing_companyId_status_idx" ON "PortalListing"("companyId", "status");

-- CreateIndex
CREATE INDEX "PortalListing_portalName_status_idx" ON "PortalListing"("portalName", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PortalListing_builtUnitId_portalName_key" ON "PortalListing"("builtUnitId", "portalName");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_assetTag_key" ON "Equipment"("assetTag");

-- CreateIndex
CREATE INDEX "Equipment_companyId_idx" ON "Equipment"("companyId");

-- CreateIndex
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_equipmentId_idx" ON "EquipmentAssignment"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_locationId_idx" ON "EquipmentAssignment"("locationId");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_projectId_idx" ON "EquipmentAssignment"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentMaintenance_equipmentId_idx" ON "EquipmentMaintenance"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequisition_reqNumber_key" ON "MaterialRequisition"("reqNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequisition_convertedPoId_key" ON "MaterialRequisition"("convertedPoId");

-- CreateIndex
CREATE INDEX "MaterialRequisition_projectId_idx" ON "MaterialRequisition"("projectId");

-- CreateIndex
CREATE INDEX "MaterialRequisition_departmentId_idx" ON "MaterialRequisition"("departmentId");

-- CreateIndex
CREATE INDEX "MaterialRequisition_status_idx" ON "MaterialRequisition"("status");

-- CreateIndex
CREATE INDEX "MaterialRequisition_approvedById_idx" ON "MaterialRequisition"("approvedById");

-- CreateIndex
CREATE INDEX "MaterialRequisitionLine_requisitionId_idx" ON "MaterialRequisitionLine"("requisitionId");

-- CreateIndex
CREATE INDEX "MaterialRequisitionLine_materialId_idx" ON "MaterialRequisitionLine"("materialId");

-- CreateIndex
CREATE INDEX "VendorQuote_requisitionId_idx" ON "VendorQuote"("requisitionId");

-- CreateIndex
CREATE INDEX "VendorQuote_quotationRequestId_idx" ON "VendorQuote"("quotationRequestId");

-- CreateIndex
CREATE INDEX "VendorQuote_supplierId_idx" ON "VendorQuote"("supplierId");

-- CreateIndex
CREATE INDEX "VendorQuote_status_idx" ON "VendorQuote"("status");

-- CreateIndex
CREATE INDEX "VendorQuoteLine_vendorQuoteId_idx" ON "VendorQuoteLine"("vendorQuoteId");

-- CreateIndex
CREATE INDEX "VendorQuoteLine_materialId_idx" ON "VendorQuoteLine"("materialId");

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
CREATE INDEX "QuotationRequest_requisitionId_idx" ON "QuotationRequest"("requisitionId");

-- CreateIndex
CREATE INDEX "QuotationRequestLine_quotationRequestId_idx" ON "QuotationRequestLine"("quotationRequestId");

-- CreateIndex
CREATE INDEX "QuotationRequestLine_materialId_idx" ON "QuotationRequestLine"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturn_returnNumber_key" ON "SupplierReturn"("returnNumber");

-- CreateIndex
CREATE INDEX "SupplierReturn_supplierId_idx" ON "SupplierReturn"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierReturn_companyId_idx" ON "SupplierReturn"("companyId");

-- CreateIndex
CREATE INDEX "SupplierReturn_status_idx" ON "SupplierReturn"("status");

-- CreateIndex
CREATE INDEX "SupplierReturn_createdById_idx" ON "SupplierReturn"("createdById");

-- CreateIndex
CREATE INDEX "SupplierReturnLine_supplierReturnId_idx" ON "SupplierReturnLine"("supplierReturnId");

-- CreateIndex
CREATE INDEX "SupplierReturnLine_materialId_idx" ON "SupplierReturnLine"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectPurchase_billNumber_key" ON "DirectPurchase"("billNumber");

-- CreateIndex
CREATE INDEX "DirectPurchase_companyId_idx" ON "DirectPurchase"("companyId");

-- CreateIndex
CREATE INDEX "DirectPurchase_supplierId_idx" ON "DirectPurchase"("supplierId");

-- CreateIndex
CREATE INDEX "DirectPurchase_billDate_idx" ON "DirectPurchase"("billDate");

-- CreateIndex
CREATE INDEX "DirectPurchase_requisitionId_idx" ON "DirectPurchase"("requisitionId");

-- CreateIndex
CREATE INDEX "DirectPurchaseLine_directPurchaseId_idx" ON "DirectPurchaseLine"("directPurchaseId");

-- CreateIndex
CREATE INDEX "DirectPurchaseLine_materialId_idx" ON "DirectPurchaseLine"("materialId");

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
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

-- CreateIndex
CREATE INDEX "Customer_companyId_deletedAt_idx" ON "Customer"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_phone_key" ON "Customer"("companyId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "AssetSale_saleNumber_key" ON "AssetSale"("saleNumber");

-- CreateIndex
CREATE INDEX "AssetSale_projectId_idx" ON "AssetSale"("projectId");

-- CreateIndex
CREATE INDEX "AssetSale_companyId_idx" ON "AssetSale"("companyId");

-- CreateIndex
CREATE INDEX "AssetSale_customerId_idx" ON "AssetSale"("customerId");

-- CreateIndex
CREATE INDEX "AssetSale_paymentStatus_idx" ON "AssetSale"("paymentStatus");

-- CreateIndex
CREATE INDEX "AssetSale_createdById_idx" ON "AssetSale"("createdById");

-- CreateIndex
CREATE INDEX "AssetSale_brokerId_idx" ON "AssetSale"("brokerId");

-- CreateIndex
CREATE INDEX "AssetSale_landParcelId_idx" ON "AssetSale"("landParcelId");

-- CreateIndex
CREATE INDEX "AssetSale_irnStatus_idx" ON "AssetSale"("irnStatus");

-- CreateIndex
CREATE INDEX "AssetSale_companyId_saleDate_idx" ON "AssetSale"("companyId", "saleDate");

-- CreateIndex
CREATE INDEX "AssetSale_companyId_status_saleDate_idx" ON "AssetSale"("companyId", "status", "saleDate");

-- CreateIndex
CREATE INDEX "AssetSalePayment_assetSaleId_idx" ON "AssetSalePayment"("assetSaleId");

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
CREATE INDEX "ProjectCost_projectId_idx" ON "ProjectCost"("projectId");

-- CreateIndex
CREATE INDEX "ProjectCost_costType_idx" ON "ProjectCost"("costType");

-- CreateIndex
CREATE INDEX "ProjectCost_createdById_idx" ON "ProjectCost"("createdById");

-- CreateIndex
CREATE INDEX "ProjectCost_sourceDprId_idx" ON "ProjectCost"("sourceDprId");

-- CreateIndex
CREATE INDEX "ProjectCost_sourceLegalDocId_idx" ON "ProjectCost"("sourceLegalDocId");

-- CreateIndex
CREATE INDEX "ExpenseCategory_companyId_idx" ON "ExpenseCategory"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_companyId_name_key" ON "ExpenseCategory"("companyId", "name");

-- CreateIndex
CREATE INDEX "Expense_companyId_idx" ON "Expense"("companyId");

-- CreateIndex
CREATE INDEX "Expense_projectId_idx" ON "Expense"("projectId");

-- CreateIndex
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

-- CreateIndex
CREATE INDEX "Expense_companyId_date_idx" ON "Expense"("companyId", "date");

-- CreateIndex
CREATE INDEX "Expense_companyId_projectId_date_idx" ON "Expense"("companyId", "projectId", "date");

-- CreateIndex
CREATE INDEX "Expense_companyId_status_idx" ON "Expense"("companyId", "status");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Expense_supplierId_idx" ON "Expense"("supplierId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_companyId_idx" ON "ExpenseClaim"("companyId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_claimantId_idx" ON "ExpenseClaim"("claimantId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_status_idx" ON "ExpenseClaim"("status");

-- CreateIndex
CREATE INDEX "ExpenseClaimLine_claimId_idx" ON "ExpenseClaimLine"("claimId");

-- CreateIndex
CREATE INDEX "PettyCashFloat_companyId_idx" ON "PettyCashFloat"("companyId");

-- CreateIndex
CREATE INDEX "PettyCashFloat_projectId_idx" ON "PettyCashFloat"("projectId");

-- CreateIndex
CREATE INDEX "PettyCashTopUp_floatId_idx" ON "PettyCashTopUp"("floatId");

-- CreateIndex
CREATE INDEX "RecurringExpense_companyId_idx" ON "RecurringExpense"("companyId");

-- CreateIndex
CREATE INDEX "RecurringExpense_nextRunDate_idx" ON "RecurringExpense"("nextRunDate");

-- CreateIndex
CREATE INDEX "ExpenseBudget_companyId_idx" ON "ExpenseBudget"("companyId");

-- CreateIndex
CREATE INDEX "ExpenseBudget_projectId_idx" ON "ExpenseBudget"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseBudget_companyId_projectId_categoryId_periodStart_key" ON "ExpenseBudget"("companyId", "projectId", "categoryId", "periodStart");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- CreateIndex
CREATE INDEX "GlAccount_companyId_idx" ON "GlAccount"("companyId");

-- CreateIndex
CREATE INDEX "GlAccount_type_idx" ON "GlAccount"("type");

-- CreateIndex
CREATE UNIQUE INDEX "GlAccount_companyId_code_key" ON "GlAccount"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_idx" ON "JournalEntry"("companyId");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_entryDate_idx" ON "JournalEntry"("companyId", "entryDate");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_accountId_idx" ON "JournalLine"("journalEntryId", "accountId");

-- CreateIndex
CREATE INDEX "JournalLine_entityType_entityId_idx" ON "JournalLine"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "TallySyncLog_companyId_syncStatus_idx" ON "TallySyncLog"("companyId", "syncStatus");

-- CreateIndex
CREATE INDEX "TallySyncLog_syncStatus_idx" ON "TallySyncLog"("syncStatus");

-- CreateIndex
CREATE INDEX "TallySyncLog_referenceNumber_idx" ON "TallySyncLog"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TallySyncLog_journalEntryId_key" ON "TallySyncLog"("journalEntryId");

-- CreateIndex
CREATE INDEX "IntegrationConfig_companyId_idx" ON "IntegrationConfig"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_companyId_key_key" ON "IntegrationConfig"("companyId", "key");

-- CreateIndex
CREATE INDEX "NotificationTemplate_companyId_eventType_idx" ON "NotificationTemplate"("companyId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_companyId_eventType_channel_key" ON "NotificationTemplate"("companyId", "eventType", "channel");

-- CreateIndex
CREATE INDEX "NotificationLog_companyId_eventType_idx" ON "NotificationLog"("companyId", "eventType");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_status_idx" ON "NotificationLog"("userId", "status");

-- CreateIndex
CREATE INDEX "NotificationLog_status_idx" ON "NotificationLog"("status");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_companyId_eventType_idx" ON "NotificationPreference"("companyId", "eventType");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_eventType_channel_key" ON "NotificationPreference"("userId", "eventType", "channel");

-- CreateIndex
CREATE INDEX "InAppNotification_userId_isRead_idx" ON "InAppNotification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "InAppNotification_companyId_createdAt_idx" ON "InAppNotification"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_companyId_userId_idx" ON "PushSubscription"("companyId", "userId");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_isActive_idx" ON "PushSubscription"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Task_assignedToId_idx" ON "Task"("assignedToId");

-- CreateIndex
CREATE INDEX "Task_assignedById_idx" ON "Task"("assignedById");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "SubTask_taskId_idx" ON "SubTask"("taskId");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");

-- CreateIndex
CREATE INDEX "TaskComment_userId_idx" ON "TaskComment"("userId");

-- CreateIndex
CREATE INDEX "TaskComment_parentId_idx" ON "TaskComment"("parentId");

-- CreateIndex
CREATE INDEX "TaskActivity_taskId_idx" ON "TaskActivity"("taskId");

-- CreateIndex
CREATE INDEX "TaskActivity_createdAt_idx" ON "TaskActivity"("createdAt");

-- CreateIndex
CREATE INDEX "TaskDependency_blockerId_idx" ON "TaskDependency"("blockerId");

-- CreateIndex
CREATE INDEX "TaskDependency_blockedById_idx" ON "TaskDependency"("blockedById");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_blockerId_blockedById_key" ON "TaskDependency"("blockerId", "blockedById");

-- CreateIndex
CREATE INDEX "TaskTimeLog_taskId_idx" ON "TaskTimeLog"("taskId");

-- CreateIndex
CREATE INDEX "TaskTimeLog_userId_idx" ON "TaskTimeLog"("userId");

-- CreateIndex
CREATE INDEX "TaskTimeLog_endedAt_idx" ON "TaskTimeLog"("endedAt");

-- CreateIndex
CREATE INDEX "Workflow_deletedAt_idx" ON "Workflow"("deletedAt");

-- CreateIndex
CREATE INDEX "Workflow_companyId_idx" ON "Workflow"("companyId");

-- CreateIndex
CREATE INDEX "Workflow_status_idx" ON "Workflow"("status");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_idx" ON "WorkflowRun"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");

-- CreateIndex
CREATE INDEX "ScheduledWorkflow_workflowId_idx" ON "ScheduledWorkflow"("workflowId");

-- CreateIndex
CREATE INDEX "ScheduledWorkflow_nextRunAt_idx" ON "ScheduledWorkflow"("nextRunAt");

-- CreateIndex
CREATE INDEX "ScheduledWorkflow_enabled_idx" ON "ScheduledWorkflow"("enabled");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_idx" ON "LeaveRequest"("companyId");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_idx" ON "LeaveRequest"("employeeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_startDate_idx" ON "LeaveRequest"("startDate");

-- CreateIndex
CREATE INDEX "Tenancy_companyId_idx" ON "Tenancy"("companyId");

-- CreateIndex
CREATE INDEX "Tenancy_customerId_idx" ON "Tenancy"("customerId");

-- CreateIndex
CREATE INDEX "Tenancy_status_idx" ON "Tenancy"("status");

-- CreateIndex
CREATE INDEX "Tenancy_builtUnitId_idx" ON "Tenancy"("builtUnitId");

-- CreateIndex
CREATE INDEX "Tenancy_landParcelId_idx" ON "Tenancy"("landParcelId");

-- CreateIndex
CREATE INDEX "Tenancy_nextEscalationDate_idx" ON "Tenancy"("nextEscalationDate");

-- CreateIndex
CREATE INDEX "RentalPayment_tenancyId_idx" ON "RentalPayment"("tenancyId");

-- CreateIndex
CREATE INDEX "RentalPayment_status_idx" ON "RentalPayment"("status");

-- CreateIndex
CREATE INDEX "DailyReport_companyId_idx" ON "DailyReport"("companyId");

-- CreateIndex
CREATE INDEX "DailyReport_projectId_idx" ON "DailyReport"("projectId");

-- CreateIndex
CREATE INDEX "DailyReport_date_idx" ON "DailyReport"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialSale_saleNumber_key" ON "MaterialSale"("saleNumber");

-- CreateIndex
CREATE INDEX "MaterialSale_companyId_idx" ON "MaterialSale"("companyId");

-- CreateIndex
CREATE INDEX "MaterialSale_customerId_idx" ON "MaterialSale"("customerId");

-- CreateIndex
CREATE INDEX "MaterialSale_projectId_idx" ON "MaterialSale"("projectId");

-- CreateIndex
CREATE INDEX "MaterialSale_status_idx" ON "MaterialSale"("status");

-- CreateIndex
CREATE INDEX "MaterialSale_irnStatus_idx" ON "MaterialSale"("irnStatus");

-- CreateIndex
CREATE INDEX "MaterialSalePayment_saleId_idx" ON "MaterialSalePayment"("saleId");

-- CreateIndex
CREATE INDEX "MaterialSaleLine_materialSaleId_idx" ON "MaterialSaleLine"("materialSaleId");

-- CreateIndex
CREATE INDEX "MaterialSaleLine_materialId_idx" ON "MaterialSaleLine"("materialId");

-- CreateIndex
CREATE INDEX "MaterialSaleLine_locationId_idx" ON "MaterialSaleLine"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialSaleReturn_returnNumber_key" ON "MaterialSaleReturn"("returnNumber");

-- CreateIndex
CREATE INDEX "MaterialSaleReturn_materialSaleId_idx" ON "MaterialSaleReturn"("materialSaleId");

-- CreateIndex
CREATE INDEX "MaterialSaleReturn_companyId_idx" ON "MaterialSaleReturn"("companyId");

-- CreateIndex
CREATE INDEX "MaterialSaleReturn_customerId_idx" ON "MaterialSaleReturn"("customerId");

-- CreateIndex
CREATE INDEX "MaterialSaleReturn_status_idx" ON "MaterialSaleReturn"("status");

-- CreateIndex
CREATE INDEX "MaterialSaleReturnLine_materialSaleReturnId_idx" ON "MaterialSaleReturnLine"("materialSaleReturnId");

-- CreateIndex
CREATE INDEX "MaterialSaleReturnLine_materialId_idx" ON "MaterialSaleReturnLine"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "RenovationProject_renovationNumber_key" ON "RenovationProject"("renovationNumber");

-- CreateIndex
CREATE INDEX "RenovationProject_builtUnitId_idx" ON "RenovationProject"("builtUnitId");

-- CreateIndex
CREATE INDEX "RenovationProject_landParcelId_idx" ON "RenovationProject"("landParcelId");

-- CreateIndex
CREATE INDEX "RenovationProject_projectId_idx" ON "RenovationProject"("projectId");

-- CreateIndex
CREATE INDEX "RenovationProject_companyId_idx" ON "RenovationProject"("companyId");

-- CreateIndex
CREATE INDEX "RenovationProject_status_idx" ON "RenovationProject"("status");

-- CreateIndex
CREATE INDEX "RenovationCost_renovationProjectId_idx" ON "RenovationCost"("renovationProjectId");

-- CreateIndex
CREATE INDEX "RenovationCost_costType_idx" ON "RenovationCost"("costType");

-- CreateIndex
CREATE INDEX "BoqItem_projectId_idx" ON "BoqItem"("projectId");

-- CreateIndex
CREATE INDEX "BoqItem_parentId_idx" ON "BoqItem"("parentId");

-- CreateIndex
CREATE INDEX "BoqItem_phaseId_idx" ON "BoqItem"("phaseId");

-- CreateIndex
CREATE INDEX "BoqItem_materialId_idx" ON "BoqItem"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "RateAnalysis_boqItemId_key" ON "RateAnalysis"("boqItemId");

-- CreateIndex
CREATE INDEX "RateAnalysis_boqItemId_idx" ON "RateAnalysis"("boqItemId");

-- CreateIndex
CREATE INDEX "RateAnalysisLine_rateAnalysisId_idx" ON "RateAnalysisLine"("rateAnalysisId");

-- CreateIndex
CREATE INDEX "RateAnalysisLine_materialId_idx" ON "RateAnalysisLine"("materialId");

-- CreateIndex
CREATE INDEX "WbsNode_projectId_idx" ON "WbsNode"("projectId");

-- CreateIndex
CREATE INDEX "WbsNode_parentId_idx" ON "WbsNode"("parentId");

-- CreateIndex
CREATE INDEX "WbsNode_phaseId_idx" ON "WbsNode"("phaseId");

-- CreateIndex
CREATE INDEX "WbsNode_boqItemId_idx" ON "WbsNode"("boqItemId");

-- CreateIndex
CREATE INDEX "WbsDependency_successorId_idx" ON "WbsDependency"("successorId");

-- CreateIndex
CREATE UNIQUE INDEX "WbsDependency_predecessorId_successorId_type_key" ON "WbsDependency"("predecessorId", "successorId", "type");

-- CreateIndex
CREATE INDEX "MeasurementBookEntry_projectId_idx" ON "MeasurementBookEntry"("projectId");

-- CreateIndex
CREATE INDEX "MeasurementBookEntry_boqItemId_idx" ON "MeasurementBookEntry"("boqItemId");

-- CreateIndex
CREATE INDEX "MeasurementBookEntry_wbsNodeId_idx" ON "MeasurementBookEntry"("wbsNodeId");

-- CreateIndex
CREATE INDEX "MeasurementBookEntry_status_idx" ON "MeasurementBookEntry"("status");

-- CreateIndex
CREATE INDEX "MeasurementBookEntry_phaseId_idx" ON "MeasurementBookEntry"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorWorkOrder_workOrderNumber_key" ON "SubcontractorWorkOrder"("workOrderNumber");

-- CreateIndex
CREATE INDEX "SubcontractorWorkOrder_projectId_idx" ON "SubcontractorWorkOrder"("projectId");

-- CreateIndex
CREATE INDEX "SubcontractorWorkOrder_subcontractorId_idx" ON "SubcontractorWorkOrder"("subcontractorId");

-- CreateIndex
CREATE INDEX "SubcontractorWorkOrder_companyId_idx" ON "SubcontractorWorkOrder"("companyId");

-- CreateIndex
CREATE INDEX "SubcontractorWorkOrder_status_idx" ON "SubcontractorWorkOrder"("status");

-- CreateIndex
CREATE INDEX "SubcontractorWorkOrderLine_workOrderId_idx" ON "SubcontractorWorkOrderLine"("workOrderId");

-- CreateIndex
CREATE INDEX "SubcontractorWorkOrderLine_boqItemId_idx" ON "SubcontractorWorkOrderLine"("boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RaBill_raBillNumber_key" ON "RaBill"("raBillNumber");

-- CreateIndex
CREATE INDEX "RaBill_workOrderId_idx" ON "RaBill"("workOrderId");

-- CreateIndex
CREATE INDEX "RaBill_projectId_idx" ON "RaBill"("projectId");

-- CreateIndex
CREATE INDEX "RaBill_status_idx" ON "RaBill"("status");

-- CreateIndex
CREATE INDEX "RaBillLine_raBillId_idx" ON "RaBillLine"("raBillId");

-- CreateIndex
CREATE INDEX "RaBillLine_boqItemId_idx" ON "RaBillLine"("boqItemId");

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
CREATE UNIQUE INDEX "PaymentSchedule_assetSaleId_key" ON "PaymentSchedule"("assetSaleId");

-- CreateIndex
CREATE INDEX "PaymentSchedule_assetSaleId_idx" ON "PaymentSchedule"("assetSaleId");

-- CreateIndex
CREATE INDEX "PaymentScheduleItem_paymentScheduleId_idx" ON "PaymentScheduleItem"("paymentScheduleId");

-- CreateIndex
CREATE INDEX "PaymentScheduleItem_wbsNodeId_idx" ON "PaymentScheduleItem"("wbsNodeId");

-- CreateIndex
CREATE INDEX "PaymentScheduleItem_status_idx" ON "PaymentScheduleItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RateContract_contractNumber_key" ON "RateContract"("contractNumber");

-- CreateIndex
CREATE INDEX "RateContract_supplierId_idx" ON "RateContract"("supplierId");

-- CreateIndex
CREATE INDEX "RateContract_companyId_idx" ON "RateContract"("companyId");

-- CreateIndex
CREATE INDEX "RateContract_materialId_idx" ON "RateContract"("materialId");

-- CreateIndex
CREATE INDEX "RateContract_status_idx" ON "RateContract"("status");

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
CREATE UNIQUE INDEX "BankSms_smsHash_key" ON "BankSms"("smsHash");

-- CreateIndex
CREATE INDEX "BankSms_companyId_idx" ON "BankSms"("companyId");

-- CreateIndex
CREATE INDEX "BankSms_status_idx" ON "BankSms"("status");

-- CreateIndex
CREATE INDEX "BankSms_receivedAt_idx" ON "BankSms"("receivedAt");

-- CreateIndex
CREATE INDEX "BankSms_matchedEntityType_idx" ON "BankSms"("matchedEntityType");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_storedName_key" ON "Upload"("storedName");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_url_key" ON "Upload"("url");

-- CreateIndex
CREATE INDEX "Upload_companyId_idx" ON "Upload"("companyId");

-- CreateIndex
CREATE INDEX "Upload_uploadedById_idx" ON "Upload"("uploadedById");

-- CreateIndex
CREATE INDEX "EntityAttachment_companyId_idx" ON "EntityAttachment"("companyId");

-- CreateIndex
CREATE INDEX "EntityAttachment_entityType_entityId_idx" ON "EntityAttachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityAttachment_uploadId_idx" ON "EntityAttachment"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAttachment_uploadId_entityType_entityId_key" ON "EntityAttachment"("uploadId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CompanyPhone_companyId_idx" ON "CompanyPhone"("companyId");

-- CreateIndex
CREATE INDEX "CompanyPhone_phoneNormalized_idx" ON "CompanyPhone"("phoneNormalized");

-- CreateIndex
CREATE INDEX "CompanyPhone_assignedToUserId_idx" ON "CompanyPhone"("assignedToUserId");

-- CreateIndex
CREATE INDEX "PhoneAssignment_companyPhoneId_idx" ON "PhoneAssignment"("companyPhoneId");

-- CreateIndex
CREATE INDEX "PhoneAssignment_userId_idx" ON "PhoneAssignment"("userId");

-- CreateIndex
CREATE INDEX "CallLog_companyId_startedAt_idx" ON "CallLog"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "CallLog_companyPhoneId_idx" ON "CallLog"("companyPhoneId");

-- CreateIndex
CREATE INDEX "CallLog_callerUserId_idx" ON "CallLog"("callerUserId");

-- CreateIndex
CREATE INDEX "CallLog_fromNumber_idx" ON "CallLog"("fromNumber");

-- CreateIndex
CREATE INDEX "CallLog_toNumber_idx" ON "CallLog"("toNumber");

-- CreateIndex
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");

-- CreateIndex
CREATE INDEX "CallLog_relatedProjectId_idx" ON "CallLog"("relatedProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_companyId_providerCallId_key" ON "CallLog"("companyId", "providerCallId");

-- CreateIndex
CREATE UNIQUE INDEX "CallRecording_callLogId_key" ON "CallRecording"("callLogId");

-- CreateIndex
CREATE INDEX "CallRecording_expiresAt_idx" ON "CallRecording"("expiresAt");

-- CreateIndex
CREATE INDEX "RecordingAccessLog_recordingId_accessedAt_idx" ON "RecordingAccessLog"("recordingId", "accessedAt");

-- CreateIndex
CREATE INDEX "CallNote_callLogId_idx" ON "CallNote"("callLogId");

-- CreateIndex
CREATE UNIQUE INDEX "CallTag_companyId_name_key" ON "CallTag"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CallLogTag_callLogId_callTagId_key" ON "CallLogTag"("callLogId", "callTagId");

-- CreateIndex
CREATE UNIQUE INDEX "Voicemail_callLogId_key" ON "Voicemail"("callLogId");

-- CreateIndex
CREATE INDEX "SmsLog_companyId_sentAt_idx" ON "SmsLog"("companyId", "sentAt");

-- CreateIndex
CREATE INDEX "SmsLog_companyPhoneId_idx" ON "SmsLog"("companyPhoneId");

-- CreateIndex
CREATE INDEX "TelephonyProviderConfig_companyId_idx" ON "TelephonyProviderConfig"("companyId");

-- CreateIndex
CREATE INDEX "ConsentPolicy_companyId_effectiveAt_idx" ON "ConsentPolicy"("companyId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentAcceptance_consentPolicyId_userId_key" ON "ConsentAcceptance"("consentPolicyId", "userId");

-- CreateIndex
CREATE INDEX "BackupRecord_companyId_createdAt_idx" ON "BackupRecord"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NumberSequence_prefix_key" ON "NumberSequence"("prefix");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_parentCompanyId_fkey" FOREIGN KEY ("parentCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_reportsToUserCompanyId_fkey" FOREIGN KEY ("reportsToUserCompanyId") REFERENCES "UserCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_userCompanyId_fkey" FOREIGN KEY ("userCompanyId") REFERENCES "UserCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userCompanyId_fkey" FOREIGN KEY ("userCompanyId") REFERENCES "UserCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_reportingLocationId_fkey" FOREIGN KEY ("reportingLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_activeProjectId_fkey" FOREIGN KEY ("activeProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_reportsToEmployeeId_fkey" FOREIGN KEY ("reportsToEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryHistory" ADD CONSTRAINT "SalaryHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeResource" ADD CONSTRAINT "EmployeeResource_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeResource" ADD CONSTRAINT "EmployeeResource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeResource" ADD CONSTRAINT "EmployeeResource_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeResource" ADD CONSTRAINT "EmployeeResource_returnedTo_fkey" FOREIGN KEY ("returnedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExit" ADD CONSTRAINT "EmployeeExit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBenefit" ADD CONSTRAINT "EmployeeBenefit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryComponent" ADD CONSTRAINT "SalaryComponent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_screenshotUploadId_fkey" FOREIGN KEY ("screenshotUploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_voiceUploadId_fkey" FOREIGN KEY ("voiceUploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignment" ADD CONSTRAINT "ProjectAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignment" ADD CONSTRAINT "ProjectAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignment" ADD CONSTRAINT "ProjectAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPhase" ADD CONSTRAINT "ProjectPhase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleTrip" ADD CONSTRAINT "VehicleTrip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleTrip" ADD CONSTRAINT "VehicleTrip_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleTrip" ADD CONSTRAINT "VehicleTrip_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleTrip" ADD CONSTRAINT "VehicleTrip_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCategory" ADD CONSTRAINT "MaterialCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandardConsumption" ADD CONSTRAINT "StandardConsumption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandardConsumption" ADD CONSTRAINT "StandardConsumption_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcontractor" ADD CONSTRAINT "Subcontractor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_proofUploadId_fkey" FOREIGN KEY ("proofUploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_autoScrapGenerationId_fkey" FOREIGN KEY ("autoScrapGenerationId") REFERENCES "ScrapGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_subAdminApprovedById_fkey" FOREIGN KEY ("subAdminApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_adminApprovedById_fkey" FOREIGN KEY ("adminApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPRMaterialLine" ADD CONSTRAINT "DPRMaterialLine_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "DailyProgressReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPRMaterialLine" ADD CONSTRAINT "DPRMaterialLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPRLaborLine" ADD CONSTRAINT "DPRLaborLine_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "DailyProgressReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPRLaborLine" ADD CONSTRAINT "DPRLaborLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPRLaborLine" ADD CONSTRAINT "DPRLaborLine_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_selectedQuoteId_fkey" FOREIGN KEY ("selectedQuoteId") REFERENCES "VendorQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderCharge" ADD CONSTRAINT "PurchaseOrderCharge_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_unloadedById_fkey" FOREIGN KEY ("unloadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocationItem" ADD CONSTRAINT "StockLocationItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocationItem" ADD CONSTRAINT "StockLocationItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocationItem" ADD CONSTRAINT "StockLocationItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_builtUnitId_fkey" FOREIGN KEY ("builtUnitId") REFERENCES "BuiltUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_sourceDprId_fkey" FOREIGN KEY ("sourceDprId") REFERENCES "DailyProgressReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "MaterialRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssueLine" ADD CONSTRAINT "MaterialIssueLine_materialIssueId_fkey" FOREIGN KEY ("materialIssueId") REFERENCES "MaterialIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssueLine" ADD CONSTRAINT "MaterialIssueLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapGeneration" ADD CONSTRAINT "ScrapGeneration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapGeneration" ADD CONSTRAINT "ScrapGeneration_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapGeneration" ADD CONSTRAINT "ScrapGeneration_sourceMaterialId_fkey" FOREIGN KEY ("sourceMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapGeneration" ADD CONSTRAINT "ScrapGeneration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapGeneration" ADD CONSTRAINT "ScrapGeneration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapGeneration" ADD CONSTRAINT "ScrapGeneration_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapGenerationLine" ADD CONSTRAINT "ScrapGenerationLine_scrapGenerationId_fkey" FOREIGN KEY ("scrapGenerationId") REFERENCES "ScrapGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapGenerationLine" ADD CONSTRAINT "ScrapGenerationLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandSeller" ADD CONSTRAINT "LandSeller_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchase" ADD CONSTRAINT "LandPurchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchase" ADD CONSTRAINT "LandPurchase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchase" ADD CONSTRAINT "LandPurchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchase" ADD CONSTRAINT "LandPurchase_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "LandSeller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandCostComponent" ADD CONSTRAINT "LandCostComponent_landPurchaseId_fkey" FOREIGN KEY ("landPurchaseId") REFERENCES "LandPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandCostComponent" ADD CONSTRAINT "LandCostComponent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchasePayment" ADD CONSTRAINT "LandPurchasePayment_landPurchaseId_fkey" FOREIGN KEY ("landPurchaseId") REFERENCES "LandPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchasePayment" ADD CONSTRAINT "LandPurchasePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchasePaymentSchedule" ADD CONSTRAINT "LandPurchasePaymentSchedule_landPurchaseId_fkey" FOREIGN KEY ("landPurchaseId") REFERENCES "LandPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPurchasePaymentScheduleItem" ADD CONSTRAINT "LandPurchasePaymentScheduleItem_paymentScheduleId_fkey" FOREIGN KEY ("paymentScheduleId") REFERENCES "LandPurchasePaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandParcel" ADD CONSTRAINT "LandParcel_landPurchaseId_fkey" FOREIGN KEY ("landPurchaseId") REFERENCES "LandPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandParcel" ADD CONSTRAINT "LandParcel_parentParcelId_fkey" FOREIGN KEY ("parentParcelId") REFERENCES "LandParcel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandParcel" ADD CONSTRAINT "LandParcel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandParcel" ADD CONSTRAINT "LandParcel_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "AssetSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPartition" ADD CONSTRAINT "LandPartition_parentParcelId_fkey" FOREIGN KEY ("parentParcelId") REFERENCES "LandParcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuiltUnit" ADD CONSTRAINT "BuiltUnit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuiltUnit" ADD CONSTRAINT "BuiltUnit_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuiltUnit" ADD CONSTRAINT "BuiltUnit_landParcelId_fkey" FOREIGN KEY ("landParcelId") REFERENCES "LandParcel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuiltUnit" ADD CONSTRAINT "BuiltUnit_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "AssetSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalListing" ADD CONSTRAINT "PortalListing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalListing" ADD CONSTRAINT "PortalListing_builtUnitId_fkey" FOREIGN KEY ("builtUnitId") REFERENCES "BuiltUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentMaintenance" ADD CONSTRAINT "EquipmentMaintenance_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_quotesWaivedById_fkey" FOREIGN KEY ("quotesWaivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisitionLine" ADD CONSTRAINT "MaterialRequisitionLine_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "MaterialRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisitionLine" ADD CONSTRAINT "MaterialRequisitionLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisitionLine" ADD CONSTRAINT "MaterialRequisitionLine_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "MaterialRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_selectedById_fkey" FOREIGN KEY ("selectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_quotationRequestId_fkey" FOREIGN KEY ("quotationRequestId") REFERENCES "QuotationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuoteLine" ADD CONSTRAINT "VendorQuoteLine_vendorQuoteId_fkey" FOREIGN KEY ("vendorQuoteId") REFERENCES "VendorQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuoteLine" ADD CONSTRAINT "VendorQuoteLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "MaterialRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequest" ADD CONSTRAINT "QuotationRequest_selectedQuoteId_fkey" FOREIGN KEY ("selectedQuoteId") REFERENCES "VendorQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequestLine" ADD CONSTRAINT "QuotationRequestLine_quotationRequestId_fkey" FOREIGN KEY ("quotationRequestId") REFERENCES "QuotationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRequestLine" ADD CONSTRAINT "QuotationRequestLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnLine" ADD CONSTRAINT "SupplierReturnLine_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnLine" ADD CONSTRAINT "SupplierReturnLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchase" ADD CONSTRAINT "DirectPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchase" ADD CONSTRAINT "DirectPurchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchase" ADD CONSTRAINT "DirectPurchase_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchase" ADD CONSTRAINT "DirectPurchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchase" ADD CONSTRAINT "DirectPurchase_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchase" ADD CONSTRAINT "DirectPurchase_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "MaterialRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchaseLine" ADD CONSTRAINT "DirectPurchaseLine_directPurchaseId_fkey" FOREIGN KEY ("directPurchaseId") REFERENCES "DirectPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchaseLine" ADD CONSTRAINT "DirectPurchaseLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_landParcelId_fkey" FOREIGN KEY ("landParcelId") REFERENCES "LandParcel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_builtUnitId_fkey" FOREIGN KEY ("builtUnitId") REFERENCES "BuiltUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSale" ADD CONSTRAINT "AssetSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSalePayment" ADD CONSTRAINT "AssetSalePayment_assetSaleId_fkey" FOREIGN KEY ("assetSaleId") REFERENCES "AssetSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleExpense" ADD CONSTRAINT "SaleExpense_assetSaleId_fkey" FOREIGN KEY ("assetSaleId") REFERENCES "AssetSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleTerm" ADD CONSTRAINT "SaleTerm_assetSaleId_fkey" FOREIGN KEY ("assetSaleId") REFERENCES "AssetSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_sourceDprId_fkey" FOREIGN KEY ("sourceDprId") REFERENCES "DailyProgressReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_sourceLegalDocId_fkey" FOREIGN KEY ("sourceLegalDocId") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_expenseClaimId_fkey" FOREIGN KEY ("expenseClaimId") REFERENCES "ExpenseClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaimLine" ADD CONSTRAINT "ExpenseClaimLine_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaimLine" ADD CONSTRAINT "ExpenseClaimLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashFloat" ADD CONSTRAINT "PettyCashFloat_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashFloat" ADD CONSTRAINT "PettyCashFloat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashFloat" ADD CONSTRAINT "PettyCashFloat_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTopUp" ADD CONSTRAINT "PettyCashTopUp_floatId_fkey" FOREIGN KEY ("floatId") REFERENCES "PettyCashFloat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTopUp" ADD CONSTRAINT "PettyCashTopUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlAccount" ADD CONSTRAINT "GlAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GlAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallySyncLog" ADD CONSTRAINT "TallySyncLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallySyncLog" ADD CONSTRAINT "TallySyncLog_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConfig" ADD CONSTRAINT "IntegrationConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubTask" ADD CONSTRAINT "SubTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubTask" ADD CONSTRAINT "SubTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTimeLog" ADD CONSTRAINT "TaskTimeLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTimeLog" ADD CONSTRAINT "TaskTimeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledWorkflow" ADD CONSTRAINT "ScheduledWorkflow_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalPayment" ADD CONSTRAINT "RentalPayment_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSale" ADD CONSTRAINT "MaterialSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSale" ADD CONSTRAINT "MaterialSale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSale" ADD CONSTRAINT "MaterialSale_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSale" ADD CONSTRAINT "MaterialSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSalePayment" ADD CONSTRAINT "MaterialSalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "MaterialSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSalePayment" ADD CONSTRAINT "MaterialSalePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleLine" ADD CONSTRAINT "MaterialSaleLine_materialSaleId_fkey" FOREIGN KEY ("materialSaleId") REFERENCES "MaterialSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleLine" ADD CONSTRAINT "MaterialSaleLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleLine" ADD CONSTRAINT "MaterialSaleLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleReturn" ADD CONSTRAINT "MaterialSaleReturn_materialSaleId_fkey" FOREIGN KEY ("materialSaleId") REFERENCES "MaterialSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleReturn" ADD CONSTRAINT "MaterialSaleReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleReturn" ADD CONSTRAINT "MaterialSaleReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleReturn" ADD CONSTRAINT "MaterialSaleReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleReturnLine" ADD CONSTRAINT "MaterialSaleReturnLine_materialSaleReturnId_fkey" FOREIGN KEY ("materialSaleReturnId") REFERENCES "MaterialSaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleReturnLine" ADD CONSTRAINT "MaterialSaleReturnLine_materialSaleLineId_fkey" FOREIGN KEY ("materialSaleLineId") REFERENCES "MaterialSaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleReturnLine" ADD CONSTRAINT "MaterialSaleReturnLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSaleReturnLine" ADD CONSTRAINT "MaterialSaleReturnLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenovationProject" ADD CONSTRAINT "RenovationProject_builtUnitId_fkey" FOREIGN KEY ("builtUnitId") REFERENCES "BuiltUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenovationProject" ADD CONSTRAINT "RenovationProject_landParcelId_fkey" FOREIGN KEY ("landParcelId") REFERENCES "LandParcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenovationProject" ADD CONSTRAINT "RenovationProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenovationProject" ADD CONSTRAINT "RenovationProject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenovationProject" ADD CONSTRAINT "RenovationProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenovationCost" ADD CONSTRAINT "RenovationCost_renovationProjectId_fkey" FOREIGN KEY ("renovationProjectId") REFERENCES "RenovationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenovationCost" ADD CONSTRAINT "RenovationCost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateAnalysis" ADD CONSTRAINT "RateAnalysis_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateAnalysisLine" ADD CONSTRAINT "RateAnalysisLine_rateAnalysisId_fkey" FOREIGN KEY ("rateAnalysisId") REFERENCES "RateAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateAnalysisLine" ADD CONSTRAINT "RateAnalysisLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WbsNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsDependency" ADD CONSTRAINT "WbsDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "WbsNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsDependency" ADD CONSTRAINT "WbsDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "WbsNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementBookEntry" ADD CONSTRAINT "MeasurementBookEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementBookEntry" ADD CONSTRAINT "MeasurementBookEntry_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementBookEntry" ADD CONSTRAINT "MeasurementBookEntry_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementBookEntry" ADD CONSTRAINT "MeasurementBookEntry_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "WbsNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementBookEntry" ADD CONSTRAINT "MeasurementBookEntry_measuredById_fkey" FOREIGN KEY ("measuredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementBookEntry" ADD CONSTRAINT "MeasurementBookEntry_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementBookEntry" ADD CONSTRAINT "MeasurementBookEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementBookEntry" ADD CONSTRAINT "MeasurementBookEntry_raBillLineId_fkey" FOREIGN KEY ("raBillLineId") REFERENCES "RaBillLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorWorkOrder" ADD CONSTRAINT "SubcontractorWorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorWorkOrder" ADD CONSTRAINT "SubcontractorWorkOrder_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorWorkOrder" ADD CONSTRAINT "SubcontractorWorkOrder_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorWorkOrder" ADD CONSTRAINT "SubcontractorWorkOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorWorkOrderLine" ADD CONSTRAINT "SubcontractorWorkOrderLine_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "SubcontractorWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorWorkOrderLine" ADD CONSTRAINT "SubcontractorWorkOrderLine_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "SubcontractorWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillLine" ADD CONSTRAINT "RaBillLine_raBillId_fkey" FOREIGN KEY ("raBillId") REFERENCES "RaBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillLine" ADD CONSTRAINT "RaBillLine_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillLine" ADD CONSTRAINT "RaBillLine_workOrderLineId_fkey" FOREIGN KEY ("workOrderLineId") REFERENCES "SubcontractorWorkOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_assetSaleId_fkey" FOREIGN KEY ("assetSaleId") REFERENCES "AssetSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentScheduleItem" ADD CONSTRAINT "PaymentScheduleItem_paymentScheduleId_fkey" FOREIGN KEY ("paymentScheduleId") REFERENCES "PaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentScheduleItem" ADD CONSTRAINT "PaymentScheduleItem_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "WbsNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateContract" ADD CONSTRAINT "RateContract_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateContract" ADD CONSTRAINT "RateContract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateContract" ADD CONSTRAINT "RateContract_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateContract" ADD CONSTRAINT "RateContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "BankSms" ADD CONSTRAINT "BankSms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAttachment" ADD CONSTRAINT "EntityAttachment_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAttachment" ADD CONSTRAINT "EntityAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAttachment" ADD CONSTRAINT "EntityAttachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPhone" ADD CONSTRAINT "CompanyPhone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPhone" ADD CONSTRAINT "CompanyPhone_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneAssignment" ADD CONSTRAINT "PhoneAssignment_companyPhoneId_fkey" FOREIGN KEY ("companyPhoneId") REFERENCES "CompanyPhone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneAssignment" ADD CONSTRAINT "PhoneAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneAssignment" ADD CONSTRAINT "PhoneAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_companyPhoneId_fkey" FOREIGN KEY ("companyPhoneId") REFERENCES "CompanyPhone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_callerUserId_fkey" FOREIGN KEY ("callerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_calleeUserId_fkey" FOREIGN KEY ("calleeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecording" ADD CONSTRAINT "CallRecording_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "CallLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingAccessLog" ADD CONSTRAINT "RecordingAccessLog_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "CallRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingAccessLog" ADD CONSTRAINT "RecordingAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallNote" ADD CONSTRAINT "CallNote_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "CallLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallNote" ADD CONSTRAINT "CallNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTag" ADD CONSTRAINT "CallTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLogTag" ADD CONSTRAINT "CallLogTag_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "CallLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLogTag" ADD CONSTRAINT "CallLogTag_callTagId_fkey" FOREIGN KEY ("callTagId") REFERENCES "CallTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voicemail" ADD CONSTRAINT "Voicemail_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "CallLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voicemail" ADD CONSTRAINT "Voicemail_listenedById_fkey" FOREIGN KEY ("listenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_companyPhoneId_fkey" FOREIGN KEY ("companyPhoneId") REFERENCES "CompanyPhone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelephonyProviderConfig" ADD CONSTRAINT "TelephonyProviderConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentPolicy" ADD CONSTRAINT "ConsentPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentAcceptance" ADD CONSTRAINT "ConsentAcceptance_consentPolicyId_fkey" FOREIGN KEY ("consentPolicyId") REFERENCES "ConsentPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentAcceptance" ADD CONSTRAINT "ConsentAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRecord" ADD CONSTRAINT "BackupRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

