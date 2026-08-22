# 11 — Roles & Permissions Comparison

## Roles

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Defined roles** | 11 (Administrator, Sales Manager, Sales Executive, Channel Partner/Broker, Project Manager, Procurement Manager, Site Engineer, Accountant, HR Manager, Customer Service, Customer) | 3 security levels (Owner, Data Entry, Auditor) + custom | Super Admin, Admin, Standard User, Viewer + custom roles |
| **Custom roles** | — | ✅ | ✅ |
| **Hierarchy** | Role-based | Security level-based | Hierarchy-based |

## Module permissions

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Granularity** | View/Create/Edit/Delete/Approve/Export/Report | Allow/Disallow facilities | View/Create/Edit/Delete/Import/Export |
| **Per module** | ✅ | ✅ | ✅ |

## Data permissions

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Scope** | Territory + project + department + own-data | User-wise + Tally audit | Hierarchy + territory + shared + private |
| **Territory-based** | ✅ | — | ✅ |
| **Project-based** | ✅ | — | — |
| **Record-level** | — | — | ✅ (shared/private) |

## Field permissions

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Field-level security** | Sensitive field hiding + read-only + mandatory | — | ✅ (View/Edit per field per profile) |

## API permissions

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Model** | — | — | OAuth2 scopes |

## Audit

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Audit trail** | Audit trails | Tally audit + Edit Log (immutable, cannot disable) + digital signature | Audit log per app |
| **Change tracking** | ✅ | ✅ (Edit Log per voucher) | ✅ |
