# State-machine transition matrix

Generated: 2026-10-16T07:18:29.984Z — http://localhost:3000

| Verdict | Count |
| ------- | ----- |
| OK      | 360   |
| GAP     | 0     |
| REVIEW  | 13    |
| BUG     | 0     |

## MaterialIssue

| Status    | Action  | HTTP | Verdict | Message                                              |
| --------- | ------- | ---- | ------- | ---------------------------------------------------- |
| PENDING   | execute | 200  | OK      |                                                      |
| PENDING   | cancel  | 200  | OK      |                                                      |
| COMPLETED | execute | 400  | OK      | {"error":"Cannot execute issue in status COMPLETED"} |
| COMPLETED | cancel  | 200  | OK      |                                                      |
| CANCELLED | execute | 400  | OK      | {"error":"Cannot execute issue in status CANCELLED"} |
| CANCELLED | cancel  | 400  | OK      | {"error":"Issue is already cancelled"}               |

## StockTransfer

| Status     | Action         | HTTP | Verdict | Message                                                                     |
| ---------- | -------------- | ---- | ------- | --------------------------------------------------------------------------- |
| DRAFT      | dispatch       | 200  | OK      |                                                                             |
| DRAFT      | complete       | 200  | OK      |                                                                             |
| DRAFT      | returnToSource | 400  | OK      | {"error":"Cannot return transfer in status DRAFT — must be IN_TRANSIT"}     |
| DRAFT      | cancel         | 200  | OK      |                                                                             |
| IN_TRANSIT | dispatch       | 400  | OK      | {"error":"Cannot dispatch transfer in status IN_TRANSIT"}                   |
| IN_TRANSIT | complete       | 200  | OK      |                                                                             |
| IN_TRANSIT | returnToSource | 200  | OK      |                                                                             |
| IN_TRANSIT | cancel         | 400  | OK      | {"error":"Cannot cancel transfer in status IN_TRANSIT"}                     |
| COMPLETED  | dispatch       | 400  | OK      | {"error":"Cannot dispatch transfer in status COMPLETED"}                    |
| COMPLETED  | complete       | 400  | OK      | {"error":"Cannot complete transfer in status COMPLETED"}                    |
| COMPLETED  | returnToSource | 400  | OK      | {"error":"Cannot return transfer in status COMPLETED — must be IN_TRANSIT"} |
| COMPLETED  | cancel         | 400  | OK      | {"error":"Cannot cancel transfer in status COMPLETED"}                      |
| CANCELLED  | dispatch       | 400  | OK      | {"error":"Cannot dispatch transfer in status CANCELLED"}                    |
| CANCELLED  | complete       | 400  | OK      | {"error":"Cannot complete transfer in status CANCELLED"}                    |
| CANCELLED  | returnToSource | 400  | OK      | {"error":"Cannot return transfer in status CANCELLED — must be IN_TRANSIT"} |
| CANCELLED  | cancel         | 400  | OK      | {"error":"Cannot cancel transfer in status CANCELLED"}                      |

## PurchaseOrder

| Status       | Action     | HTTP | Verdict | Message                                                                                                        |
| ------------ | ---------- | ---- | ------- | -------------------------------------------------------------------------------------------------------------- |
| DRAFT        | approve    | 200  | OK      |                                                                                                                |
| DRAFT        | reject     | 200  | OK      |                                                                                                                |
| DRAFT        | resubmit   | 400  | OK      | {"error":"Cannot resubmit PO in status DRAFT"}                                                                 |
| DRAFT        | order      | 400  | OK      | {"error":"Cannot order PO in status DRAFT"}                                                                    |
| DRAFT        | shortClose | 409  | OK      | {"error":"Only a partially-received PO can be short-closed (current: DRAFT). An unreceived PO should be cancel |
| DRAFT        | cancel     | 200  | OK      |                                                                                                                |
| APPROVED     | approve    | 400  | OK      | {"error":"Cannot approve PO in status APPROVED"}                                                               |
| APPROVED     | reject     | 400  | OK      | {"error":"Cannot reject PO in status APPROVED"}                                                                |
| APPROVED     | resubmit   | 400  | OK      | {"error":"Cannot resubmit PO in status APPROVED"}                                                              |
| APPROVED     | order      | 200  | OK      |                                                                                                                |
| APPROVED     | shortClose | 409  | OK      | {"error":"Only a partially-received PO can be short-closed (current: APPROVED). An unreceived PO should be can |
| APPROVED     | cancel     | 200  | OK      |                                                                                                                |
| REJECTED     | approve    | 400  | OK      | {"error":"Cannot approve PO in status REJECTED"}                                                               |
| REJECTED     | reject     | 400  | OK      | {"error":"Cannot reject PO in status REJECTED"}                                                                |
| REJECTED     | resubmit   | 200  | OK      |                                                                                                                |
| REJECTED     | order      | 400  | OK      | {"error":"Cannot order PO in status REJECTED"}                                                                 |
| REJECTED     | shortClose | 409  | OK      | {"error":"Only a partially-received PO can be short-closed (current: REJECTED). An unreceived PO should be can |
| REJECTED     | cancel     | 200  | OK      |                                                                                                                |
| ORDERED      | approve    | 400  | OK      | {"error":"Cannot approve PO in status ORDERED"}                                                                |
| ORDERED      | reject     | 400  | OK      | {"error":"Cannot reject PO in status ORDERED"}                                                                 |
| ORDERED      | resubmit   | 400  | OK      | {"error":"Cannot resubmit PO in status ORDERED"}                                                               |
| ORDERED      | order      | 400  | OK      | {"error":"Cannot order PO in status ORDERED"}                                                                  |
| ORDERED      | shortClose | 409  | REVIEW  | {"error":"Only a partially-received PO can be short-closed (current: ORDERED). An unreceived PO should be canc |
| ORDERED      | cancel     | 200  | OK      |                                                                                                                |
| PARTIAL      | approve    | 400  | OK      | {"error":"Cannot approve PO in status PARTIAL"}                                                                |
| PARTIAL      | reject     | 400  | OK      | {"error":"Cannot reject PO in status PARTIAL"}                                                                 |
| PARTIAL      | resubmit   | 400  | OK      | {"error":"Cannot resubmit PO in status PARTIAL"}                                                               |
| PARTIAL      | order      | 400  | OK      | {"error":"Cannot order PO in status PARTIAL"}                                                                  |
| PARTIAL      | shortClose | 200  | OK      |                                                                                                                |
| PARTIAL      | cancel     | 200  | OK      |                                                                                                                |
| RECEIVED     | approve    | 400  | OK      | {"error":"Cannot approve PO in status RECEIVED"}                                                               |
| RECEIVED     | reject     | 400  | OK      | {"error":"Cannot reject PO in status RECEIVED"}                                                                |
| RECEIVED     | resubmit   | 400  | OK      | {"error":"Cannot resubmit PO in status RECEIVED"}                                                              |
| RECEIVED     | order      | 400  | OK      | {"error":"Cannot order PO in status RECEIVED"}                                                                 |
| RECEIVED     | shortClose | 409  | OK      | {"error":"Only a partially-received PO can be short-closed (current: RECEIVED). An unreceived PO should be can |
| RECEIVED     | cancel     | 400  | OK      | {"error":"Cannot cancel a fully received PO"}                                                                  |
| SHORT_CLOSED | approve    | 400  | OK      | {"error":"Cannot approve PO in status SHORT_CLOSED"}                                                           |
| SHORT_CLOSED | reject     | 400  | OK      | {"error":"Cannot reject PO in status SHORT_CLOSED"}                                                            |
| SHORT_CLOSED | resubmit   | 400  | OK      | {"error":"Cannot resubmit PO in status SHORT_CLOSED"}                                                          |
| SHORT_CLOSED | order      | 400  | OK      | {"error":"Cannot order PO in status SHORT_CLOSED"}                                                             |
| SHORT_CLOSED | shortClose | 409  | OK      | {"error":"PO is already short-closed"}                                                                         |
| SHORT_CLOSED | cancel     | 200  | OK      |                                                                                                                |
| CANCELLED    | approve    | 400  | OK      | {"error":"Cannot approve PO in status CANCELLED"}                                                              |
| CANCELLED    | reject     | 400  | OK      | {"error":"Cannot reject PO in status CANCELLED"}                                                               |
| CANCELLED    | resubmit   | 400  | OK      | {"error":"Cannot resubmit PO in status CANCELLED"}                                                             |
| CANCELLED    | order      | 400  | OK      | {"error":"Cannot order PO in status CANCELLED"}                                                                |
| CANCELLED    | shortClose | 409  | OK      | {"error":"Only a partially-received PO can be short-closed (current: CANCELLED). An unreceived PO should be ca |
| CANCELLED    | cancel     | 400  | OK      | {"error":"PO already cancelled"}                                                                               |

## Tenancy

| Status     | Action    | HTTP | Verdict | Message                                                                           |
| ---------- | --------- | ---- | ------- | --------------------------------------------------------------------------------- |
| PENDING    | activate  | 200  | OK      |                                                                                   |
| PENDING    | terminate | 200  | OK      |                                                                                   |
| PENDING    | escalate  | 400  | OK      | {"error":"Cannot escalate rent on a PENDING tenancy. Tenancy must be ACTIVE."}    |
| ACTIVE     | activate  | 200  | OK      |                                                                                   |
| ACTIVE     | terminate | 200  | OK      |                                                                                   |
| ACTIVE     | escalate  | 400  | REVIEW  | {"error":"This tenancy has no escalation clause configured"}                      |
| EXPIRED    | activate  | 400  | OK      | {"error":"Cannot activate tenancy in status EXPIRED"}                             |
| EXPIRED    | terminate | 400  | OK      | {"error":"Cannot terminate tenancy in status EXPIRED"}                            |
| EXPIRED    | escalate  | 400  | OK      | {"error":"Cannot escalate rent on a EXPIRED tenancy. Tenancy must be ACTIVE."}    |
| TERMINATED | activate  | 400  | OK      | {"error":"Cannot activate tenancy in status TERMINATED"}                          |
| TERMINATED | terminate | 400  | OK      | {"error":"Cannot terminate tenancy in status TERMINATED"}                         |
| TERMINATED | escalate  | 400  | OK      | {"error":"Cannot escalate rent on a TERMINATED tenancy. Tenancy must be ACTIVE."} |

## ExpenseClaim

| Status    | Action  | HTTP | Verdict | Message                                                                         |
| --------- | ------- | ---- | ------- | ------------------------------------------------------------------------------- |
| DRAFT     | submit  | 200  | OK      |                                                                                 |
| DRAFT     | approve | 409  | OK      | {"error":"Only SUBMITTED claims can be approved (current: DRAFT)"}              |
| DRAFT     | reject  | 409  | OK      | {"error":"Only SUBMITTED claims can be rejected (current: DRAFT)"}              |
| DRAFT     | pay     | 409  | OK      | {"error":"Only APPROVED claims can be paid (current: DRAFT)"}                   |
| SUBMITTED | submit  | 409  | OK      | {"error":"Only DRAFT or REJECTED claims can be submitted (current: SUBMITTED)"} |
| SUBMITTED | approve | 200  | OK      |                                                                                 |
| SUBMITTED | reject  | 200  | OK      |                                                                                 |
| SUBMITTED | pay     | 409  | OK      | {"error":"Only APPROVED claims can be paid (current: SUBMITTED)"}               |
| APPROVED  | submit  | 409  | OK      | {"error":"Only DRAFT or REJECTED claims can be submitted (current: APPROVED)"}  |
| APPROVED  | approve | 409  | OK      | {"error":"Only SUBMITTED claims can be approved (current: APPROVED)"}           |
| APPROVED  | reject  | 409  | OK      | {"error":"Only SUBMITTED claims can be rejected (current: APPROVED)"}           |
| APPROVED  | pay     | 200  | OK      |                                                                                 |
| REJECTED  | submit  | 200  | OK      |                                                                                 |
| REJECTED  | approve | 409  | OK      | {"error":"Only SUBMITTED claims can be approved (current: REJECTED)"}           |
| REJECTED  | reject  | 409  | OK      | {"error":"Only SUBMITTED claims can be rejected (current: REJECTED)"}           |
| REJECTED  | pay     | 409  | OK      | {"error":"Only APPROVED claims can be paid (current: REJECTED)"}                |
| PAID      | submit  | 409  | OK      | {"error":"Only DRAFT or REJECTED claims can be submitted (current: PAID)"}      |
| PAID      | approve | 409  | OK      | {"error":"Only SUBMITTED claims can be approved (current: PAID)"}               |
| PAID      | reject  | 409  | OK      | {"error":"Only SUBMITTED claims can be rejected (current: PAID)"}               |
| PAID      | pay     | 409  | OK      | {"error":"Only APPROVED claims can be paid (current: PAID)"}                    |

## GatePass

| Status    | Action      | HTTP | Verdict | Message                                                                                                        |
| --------- | ----------- | ---- | ------- | -------------------------------------------------------------------------------------------------------------- |
| DRAFT     | submit      | 200  | OK      |                                                                                                                |
| DRAFT     | approve     | 400  | OK      | {"error":"Cannot approve gate pass in status DRAFT"}                                                           |
| DRAFT     | reject      | 400  | OK      | {"error":"Cannot reject gate pass in status DRAFT"}                                                            |
| DRAFT     | resubmit    | 400  | OK      | {"error":"Cannot resubmit gate pass in status DRAFT"}                                                          |
| DRAFT     | confirmExit | 400  | OK      | {"error":"Cannot confirm exit for gate pass in status DRAFT. Items can only exit after approval."}             |
| DRAFT     | cancel      | 200  | OK      |                                                                                                                |
| PENDING   | submit      | 400  | OK      | {"error":"Cannot submit gate pass in status PENDING"}                                                          |
| PENDING   | approve     | 200  | OK      |                                                                                                                |
| PENDING   | reject      | 200  | OK      |                                                                                                                |
| PENDING   | resubmit    | 400  | OK      | {"error":"Cannot resubmit gate pass in status PENDING"}                                                        |
| PENDING   | confirmExit | 400  | OK      | {"error":"Cannot confirm exit for gate pass in status PENDING. Items can only exit after approval."}           |
| PENDING   | cancel      | 200  | OK      |                                                                                                                |
| APPROVED  | submit      | 400  | OK      | {"error":"Cannot submit gate pass in status APPROVED"}                                                         |
| APPROVED  | approve     | 400  | OK      | {"error":"Cannot approve gate pass in status APPROVED"}                                                        |
| APPROVED  | reject      | 400  | OK      | {"error":"Cannot reject gate pass in status APPROVED"}                                                         |
| APPROVED  | resubmit    | 400  | OK      | {"error":"Cannot resubmit gate pass in status APPROVED"}                                                       |
| APPROVED  | confirmExit | 200  | OK      |                                                                                                                |
| APPROVED  | cancel      | 400  | OK      | {"error":"Cannot cancel an approved gate pass — items are cleared to leave. Contact security to confirm or rej |
| REJECTED  | submit      | 400  | OK      | {"error":"Cannot submit gate pass in status REJECTED"}                                                         |
| REJECTED  | approve     | 400  | OK      | {"error":"Cannot approve gate pass in status REJECTED"}                                                        |
| REJECTED  | reject      | 400  | OK      | {"error":"Cannot reject gate pass in status REJECTED"}                                                         |
| REJECTED  | resubmit    | 200  | OK      |                                                                                                                |
| REJECTED  | confirmExit | 400  | OK      | {"error":"Cannot confirm exit for gate pass in status REJECTED. Items can only exit after approval."}          |
| REJECTED  | cancel      | 400  | REVIEW  | {"error":"Cannot cancel a rejected gate pass"}                                                                 |
| EXITED    | submit      | 400  | OK      | {"error":"Cannot submit gate pass in status EXITED"}                                                           |
| EXITED    | approve     | 400  | OK      | {"error":"Cannot approve gate pass in status EXITED"}                                                          |
| EXITED    | reject      | 400  | OK      | {"error":"Cannot reject gate pass in status EXITED"}                                                           |
| EXITED    | resubmit    | 400  | OK      | {"error":"Cannot resubmit gate pass in status EXITED"}                                                         |
| EXITED    | confirmExit | 400  | OK      | {"error":"Cannot confirm exit for gate pass in status EXITED. Items can only exit after approval."}            |
| EXITED    | cancel      | 400  | OK      | {"error":"Cannot cancel an exited gate pass"}                                                                  |
| CANCELLED | submit      | 400  | OK      | {"error":"Cannot submit gate pass in status CANCELLED"}                                                        |
| CANCELLED | approve     | 400  | OK      | {"error":"Cannot approve gate pass in status CANCELLED"}                                                       |
| CANCELLED | reject      | 400  | OK      | {"error":"Cannot reject gate pass in status CANCELLED"}                                                        |
| CANCELLED | resubmit    | 400  | OK      | {"error":"Cannot resubmit gate pass in status CANCELLED"}                                                      |
| CANCELLED | confirmExit | 400  | OK      | {"error":"Cannot confirm exit for gate pass in status CANCELLED. Items can only exit after approval."}         |
| CANCELLED | cancel      | 400  | OK      | {"error":"Gate pass is already cancelled"}                                                                     |

## RaBill

| Status    | Action  | HTTP | Verdict | Message                                                                                      |
| --------- | ------- | ---- | ------- | -------------------------------------------------------------------------------------------- |
| DRAFT     | submit  | 200  | OK      |                                                                                              |
| DRAFT     | approve | 400  | OK      | {"error":"Cannot approve RA bill in status DRAFT (must be SUBMITTED)"}                       |
| DRAFT     | reject  | 403  | OK      | {"error":"You cannot reject an RA bill you created."}                                        |
| DRAFT     | pay     | 400  | OK      | {"error":"Cannot pay RA bill in status DRAFT (must be APPROVED)"}                            |
| SUBMITTED | submit  | 400  | OK      | {"error":"Cannot submit RA bill in status SUBMITTED"}                                        |
| SUBMITTED | approve | 200  | OK      |                                                                                              |
| SUBMITTED | reject  | 403  | REVIEW  | {"error":"You cannot reject an RA bill you created."}                                        |
| SUBMITTED | pay     | 400  | OK      | {"error":"Cannot pay RA bill in status SUBMITTED (must be APPROVED)"}                        |
| APPROVED  | submit  | 400  | OK      | {"error":"Cannot submit RA bill in status APPROVED"}                                         |
| APPROVED  | approve | 400  | OK      | {"error":"Cannot approve RA bill in status APPROVED (must be SUBMITTED)"}                    |
| APPROVED  | reject  | 400  | OK      | {"error":"Cannot reject RA bill in status APPROVED"}                                         |
| APPROVED  | pay     | 403  | REVIEW  | {"error":"You cannot pay an RA bill you created or submitted — ask another authorized user"} |
| PAID      | submit  | 400  | OK      | {"error":"Cannot submit RA bill in status PAID"}                                             |
| PAID      | approve | 400  | OK      | {"error":"Cannot approve RA bill in status PAID (must be SUBMITTED)"}                        |
| PAID      | reject  | 400  | OK      | {"error":"Cannot reject RA bill in status PAID"}                                             |
| PAID      | pay     | 400  | OK      | {"error":"Cannot pay RA bill in status PAID (must be APPROVED)"}                             |
| REJECTED  | submit  | 200  | OK      |                                                                                              |
| REJECTED  | approve | 400  | OK      | {"error":"Cannot approve RA bill in status REJECTED (must be SUBMITTED)"}                    |
| REJECTED  | reject  | 403  | OK      | {"error":"You cannot reject an RA bill you created."}                                        |
| REJECTED  | pay     | 400  | OK      | {"error":"Cannot pay RA bill in status REJECTED (must be APPROVED)"}                         |

## DailyProgressReport

| Status             | Action          | HTTP | Verdict | Message                                                                              |
| ------------------ | --------------- | ---- | ------- | ------------------------------------------------------------------------------------ |
| SUBMITTED          | subAdminApprove | 200  | OK      |                                                                                      |
| SUBMITTED          | adminApprove    | 400  | OK      | {"error":"DPR must be Sub-Admin approved first (current: SUBMITTED)"}                |
| SUBMITTED          | reject          | 200  | OK      |                                                                                      |
| SUBMITTED          | resubmit        | 400  | OK      | {"error":"Only rejected DPRs can be resubmitted"}                                    |
| SUB_ADMIN_APPROVED | subAdminApprove | 400  | OK      | {"error":"DPR must be in SUBMITTED status to approve (current: SUB_ADMIN_APPROVED)"} |
| SUB_ADMIN_APPROVED | adminApprove    | 200  | OK      |                                                                                      |
| SUB_ADMIN_APPROVED | reject          | 200  | OK      |                                                                                      |
| SUB_ADMIN_APPROVED | resubmit        | 400  | OK      | {"error":"Only rejected DPRs can be resubmitted"}                                    |
| APPROVED           | subAdminApprove | 400  | OK      | {"error":"DPR must be in SUBMITTED status to approve (current: APPROVED)"}           |
| APPROVED           | adminApprove    | 400  | OK      | {"error":"DPR must be Sub-Admin approved first (current: APPROVED)"}                 |
| APPROVED           | reject          | 400  | OK      | {"error":"Cannot reject an already-approved DPR"}                                    |
| APPROVED           | resubmit        | 400  | OK      | {"error":"Only rejected DPRs can be resubmitted"}                                    |
| REJECTED           | subAdminApprove | 400  | OK      | {"error":"DPR must be in SUBMITTED status to approve (current: REJECTED)"}           |
| REJECTED           | adminApprove    | 400  | OK      | {"error":"DPR must be Sub-Admin approved first (current: REJECTED)"}                 |
| REJECTED           | reject          | 400  | OK      | {"error":"Cannot reject an already-rejected DPR — resubmit it first"}                |
| REJECTED           | resubmit        | 200  | OK      |                                                                                      |

## MeasurementBookEntry

| Status   | Action  | HTTP | Verdict | Message                                                                      |
| -------- | ------- | ---- | ------- | ---------------------------------------------------------------------------- |
| DRAFT    | verify  | 200  | OK      |                                                                              |
| DRAFT    | approve | 400  | OK      | {"error":"Cannot approve entry in status DRAFT (must be VERIFIED first)"}    |
| DRAFT    | reject  | 200  | OK      |                                                                              |
| VERIFIED | verify  | 400  | OK      | {"error":"Cannot verify entry in status VERIFIED"}                           |
| VERIFIED | approve | 200  | OK      |                                                                              |
| VERIFIED | reject  | 200  | OK      |                                                                              |
| APPROVED | verify  | 400  | OK      | {"error":"Cannot verify entry in status APPROVED"}                           |
| APPROVED | approve | 400  | OK      | {"error":"Cannot approve entry in status APPROVED (must be VERIFIED first)"} |
| APPROVED | reject  | 400  | OK      | {"error":"Cannot reject an already-approved entry"}                          |
| REJECTED | verify  | 400  | OK      | {"error":"Cannot verify entry in status REJECTED"}                           |
| REJECTED | approve | 400  | OK      | {"error":"Cannot approve entry in status REJECTED (must be VERIFIED first)"} |
| REJECTED | reject  | 409  | OK      | {"error":"Cannot reject an already-rejected entry"}                          |

## EmployeeAdvance

| Status    | Action | HTTP | Verdict | Message                                       |
| --------- | ------ | ---- | ------- | --------------------------------------------- |
| ACTIVE    | pause  | 200  | OK      |                                               |
| ACTIVE    | resume | 200  | OK      |                                               |
| ACTIVE    | settle | 200  | OK      |                                               |
| ACTIVE    | cancel | 200  | OK      |                                               |
| PAUSED    | pause  | 200  | OK      |                                               |
| PAUSED    | resume | 200  | OK      |                                               |
| PAUSED    | settle | 200  | OK      |                                               |
| PAUSED    | cancel | 200  | OK      |                                               |
| SETTLED   | pause  | 400  | OK      | {"error":"Cannot change a settled advance"}   |
| SETTLED   | resume | 400  | OK      | {"error":"Cannot change a settled advance"}   |
| SETTLED   | settle | 400  | OK      | {"error":"Cannot change a settled advance"}   |
| SETTLED   | cancel | 400  | OK      | {"error":"Cannot change a settled advance"}   |
| CANCELLED | pause  | 400  | OK      | {"error":"Cannot change a cancelled advance"} |
| CANCELLED | resume | 400  | OK      | {"error":"Cannot change a cancelled advance"} |
| CANCELLED | settle | 400  | OK      | {"error":"Cannot change a cancelled advance"} |
| CANCELLED | cancel | 400  | OK      | {"error":"Cannot change a cancelled advance"} |

## LeaveRequest

| Status    | Action  | HTTP | Verdict | Message                                                |
| --------- | ------- | ---- | ------- | ------------------------------------------------------ |
| PENDING   | approve | 200  | OK      |                                                        |
| PENDING   | reject  | 200  | OK      |                                                        |
| PENDING   | cancel  | 200  | OK      |                                                        |
| APPROVED  | approve | 400  | OK      | {"error":"Cannot approve a leave in status APPROVED"}  |
| APPROVED  | reject  | 400  | OK      | {"error":"Cannot reject a leave in status APPROVED"}   |
| APPROVED  | cancel  | 200  | OK      |                                                        |
| REJECTED  | approve | 400  | OK      | {"error":"Cannot approve a leave in status REJECTED"}  |
| REJECTED  | reject  | 400  | OK      | {"error":"Cannot reject a leave in status REJECTED"}   |
| REJECTED  | cancel  | 400  | OK      | {"error":"Cannot cancel a leave in status REJECTED"}   |
| CANCELLED | approve | 400  | OK      | {"error":"Cannot approve a leave in status CANCELLED"} |
| CANCELLED | reject  | 400  | OK      | {"error":"Cannot reject a leave in status CANCELLED"}  |
| CANCELLED | cancel  | 400  | OK      | {"error":"Cannot cancel a leave in status CANCELLED"}  |

## SafetyIncident

| Status              | Action      | HTTP | Verdict | Message                                                                                |
| ------------------- | ----------- | ---- | ------- | -------------------------------------------------------------------------------------- |
| REPORTED            | investigate | 200  | OK      |                                                                                        |
| REPORTED            | close       | 400  | OK      | {"error":"Cannot close incident in REPORTED status — must be INVESTIGATED"}            |
| REPORTED            | cancel      | 200  | OK      |                                                                                        |
| REPORTED            | delete      | 200  | OK      |                                                                                        |
| UNDER_INVESTIGATION | investigate | 200  | OK      |                                                                                        |
| UNDER_INVESTIGATION | close       | 400  | OK      | {"error":"Cannot close incident in UNDER_INVESTIGATION status — must be INVESTIGATED"} |
| UNDER_INVESTIGATION | cancel      | 200  | OK      |                                                                                        |
| UNDER_INVESTIGATION | delete      | 409  | OK      | {"error":"Cannot delete an incident under investigation — cancel it first"}            |
| INVESTIGATED        | investigate | 400  | OK      | {"error":"Cannot investigate incident in INVESTIGATED status"}                         |
| INVESTIGATED        | close       | 200  | OK      |                                                                                        |
| INVESTIGATED        | cancel      | 200  | OK      |                                                                                        |
| INVESTIGATED        | delete      | 409  | OK      | {"error":"Cannot delete an incident under investigation — cancel it first"}            |
| CLOSED              | investigate | 400  | OK      | {"error":"Cannot investigate incident in CLOSED status"}                               |
| CLOSED              | close       | 400  | OK      | {"error":"Cannot close incident in CLOSED status — must be INVESTIGATED"}              |
| CLOSED              | cancel      | 400  | OK      | {"error":"Cannot cancel incident in CLOSED status"}                                    |
| CLOSED              | delete      | 400  | OK      | {"error":"Cannot delete a closed incident"}                                            |
| CANCELLED           | investigate | 400  | OK      | {"error":"Cannot investigate incident in CANCELLED status"}                            |
| CANCELLED           | close       | 400  | OK      | {"error":"Cannot close incident in CANCELLED status — must be INVESTIGATED"}           |
| CANCELLED           | cancel      | 400  | OK      | {"error":"Cannot cancel incident in CANCELLED status"}                                 |
| CANCELLED           | delete      | 200  | OK      |                                                                                        |

## SafetyHazard

| Status     | Action   | HTTP | Verdict | Message                                                  |
| ---------- | -------- | ---- | ------- | -------------------------------------------------------- |
| IDENTIFIED | mitigate | 200  | OK      |                                                          |
| IDENTIFIED | resolve  | 200  | OK      |                                                          |
| IDENTIFIED | delete   | 200  | OK      |                                                          |
| MITIGATING | mitigate | 400  | OK      | {"error":"Cannot start mitigation in MITIGATING status"} |
| MITIGATING | resolve  | 200  | OK      |                                                          |
| MITIGATING | delete   | 200  | OK      |                                                          |
| RESOLVED   | mitigate | 400  | OK      | {"error":"Cannot start mitigation in RESOLVED status"}   |
| RESOLVED   | resolve  | 400  | OK      | {"error":"Cannot resolve hazard in RESOLVED status"}     |
| RESOLVED   | delete   | 400  | OK      | {"error":"Cannot delete a resolved hazard"}              |

## SafetyInspection

| Status      | Action   | HTTP | Verdict | Message                                                                                                           |
| ----------- | -------- | ---- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| SCHEDULED   | start    | 200  | OK      |                                                                                                                   |
| SCHEDULED   | complete | 400  | OK      | {"error":"Invalid enum value. Expected 'PASSED' \| 'PASSED_WITH_NOTES' \| 'FAILED' \| 'STOP_WORK', received 'PASS |
| SCHEDULED   | cancel   | 200  | OK      |                                                                                                                   |
| SCHEDULED   | delete   | 200  | OK      |                                                                                                                   |
| IN_PROGRESS | start    | 400  | OK      | {"error":"Cannot start inspection in IN_PROGRESS status"}                                                         |
| IN_PROGRESS | complete | 400  | REVIEW  | {"error":"Invalid enum value. Expected 'PASSED' \| 'PASSED_WITH_NOTES' \| 'FAILED' \| 'STOP_WORK', received 'PASS |
| IN_PROGRESS | cancel   | 200  | OK      |                                                                                                                   |
| IN_PROGRESS | delete   | 409  | OK      | {"error":"Cannot delete an inspection in progress — cancel it first"}                                             |
| COMPLETED   | start    | 400  | OK      | {"error":"Cannot start inspection in COMPLETED status"}                                                           |
| COMPLETED   | complete | 400  | OK      | {"error":"Invalid enum value. Expected 'PASSED' \| 'PASSED_WITH_NOTES' \| 'FAILED' \| 'STOP_WORK', received 'PASS |
| COMPLETED   | cancel   | 400  | OK      | {"error":"Cannot cancel inspection in COMPLETED status"}                                                          |
| COMPLETED   | delete   | 400  | OK      | {"error":"Cannot delete a completed inspection"}                                                                  |
| CANCELLED   | start    | 400  | OK      | {"error":"Cannot start inspection in CANCELLED status"}                                                           |
| CANCELLED   | complete | 400  | OK      | {"error":"Invalid enum value. Expected 'PASSED' \| 'PASSED_WITH_NOTES' \| 'FAILED' \| 'STOP_WORK', received 'PASS |
| CANCELLED   | cancel   | 400  | OK      | {"error":"Cannot cancel inspection in CANCELLED status"}                                                          |
| CANCELLED   | delete   | 200  | OK      |                                                                                                                   |

## ChangeOrder

| Status      | Action    | HTTP | Verdict | Message                                                                            |
| ----------- | --------- | ---- | ------- | ---------------------------------------------------------------------------------- |
| DRAFT       | submit    | 200  | OK      |                                                                                    |
| DRAFT       | approve   | 400  | OK      | {"error":"Cannot approve change order in DRAFT status"}                            |
| DRAFT       | reject    | 400  | OK      | {"error":"Cannot reject change order in DRAFT status"}                             |
| DRAFT       | implement | 400  | OK      | {"error":"Cannot implement change order in DRAFT status — must be APPROVED"}       |
| DRAFT       | cancel    | 200  | OK      |                                                                                    |
| DRAFT       | delete    | 200  | OK      |                                                                                    |
| SUBMITTED   | submit    | 400  | OK      | {"error":"Cannot submit change order in SUBMITTED status"}                         |
| SUBMITTED   | approve   | 400  | REVIEW  | {"error":"Client approval name is required for this change order"}                 |
| SUBMITTED   | reject    | 200  | OK      |                                                                                    |
| SUBMITTED   | implement | 400  | OK      | {"error":"Cannot implement change order in SUBMITTED status — must be APPROVED"}   |
| SUBMITTED   | cancel    | 200  | OK      |                                                                                    |
| SUBMITTED   | delete    | 400  | OK      | {"error":"Cannot delete a submitted change order — cancel it first"}               |
| APPROVED    | submit    | 400  | OK      | {"error":"Cannot submit change order in APPROVED status"}                          |
| APPROVED    | approve   | 400  | OK      | {"error":"Cannot approve change order in APPROVED status"}                         |
| APPROVED    | reject    | 400  | OK      | {"error":"Cannot reject change order in APPROVED status"}                          |
| APPROVED    | implement | 200  | OK      |                                                                                    |
| APPROVED    | cancel    | 200  | OK      |                                                                                    |
| APPROVED    | delete    | 400  | OK      | {"error":"Cannot delete a approved change order — cancel it first"}                |
| REJECTED    | submit    | 200  | OK      |                                                                                    |
| REJECTED    | approve   | 400  | OK      | {"error":"Cannot approve change order in REJECTED status"}                         |
| REJECTED    | reject    | 400  | OK      | {"error":"Cannot reject change order in REJECTED status"}                          |
| REJECTED    | implement | 400  | OK      | {"error":"Cannot implement change order in REJECTED status — must be APPROVED"}    |
| REJECTED    | cancel    | 200  | OK      |                                                                                    |
| REJECTED    | delete    | 200  | OK      |                                                                                    |
| IMPLEMENTED | submit    | 400  | OK      | {"error":"Cannot submit change order in IMPLEMENTED status"}                       |
| IMPLEMENTED | approve   | 400  | OK      | {"error":"Cannot approve change order in IMPLEMENTED status"}                      |
| IMPLEMENTED | reject    | 400  | OK      | {"error":"Cannot reject change order in IMPLEMENTED status"}                       |
| IMPLEMENTED | implement | 400  | OK      | {"error":"Cannot implement change order in IMPLEMENTED status — must be APPROVED"} |
| IMPLEMENTED | cancel    | 400  | OK      | {"error":"Cannot cancel change order in IMPLEMENTED status"}                       |
| IMPLEMENTED | delete    | 400  | OK      | {"error":"Cannot delete an implemented change order"}                              |
| CANCELLED   | submit    | 400  | OK      | {"error":"Cannot submit change order in CANCELLED status"}                         |
| CANCELLED   | approve   | 400  | OK      | {"error":"Cannot approve change order in CANCELLED status"}                        |
| CANCELLED   | reject    | 400  | OK      | {"error":"Cannot reject change order in CANCELLED status"}                         |
| CANCELLED   | implement | 400  | OK      | {"error":"Cannot implement change order in CANCELLED status — must be APPROVED"}   |
| CANCELLED   | cancel    | 400  | OK      | {"error":"Change order is already cancelled"}                                      |
| CANCELLED   | delete    | 200  | OK      |                                                                                    |

## MaterialRequisition

| Status    | Action      | HTTP | Verdict | Message                                               |
| --------- | ----------- | ---- | ------- | ----------------------------------------------------- |
| DRAFT     | submit      | 200  | OK      |                                                       |
| DRAFT     | approve     | 400  | OK      | {"error":"Cannot approve indent in status DRAFT"}     |
| DRAFT     | reject      | 400  | OK      | {"error":"Cannot reject indent in status DRAFT"}      |
| DRAFT     | convert     | 400  | OK      | {"error":"Required"}                                  |
| DRAFT     | waiveQuotes | 400  | OK      | {"error":"A waiver reason is required"}               |
| SUBMITTED | submit      | 400  | OK      | {"error":"Cannot submit indent in status SUBMITTED"}  |
| SUBMITTED | approve     | 200  | OK      |                                                       |
| SUBMITTED | reject      | 200  | OK      |                                                       |
| SUBMITTED | convert     | 400  | OK      | {"error":"Required"}                                  |
| SUBMITTED | waiveQuotes | 400  | REVIEW  | {"error":"A waiver reason is required"}               |
| APPROVED  | submit      | 400  | OK      | {"error":"Cannot submit indent in status APPROVED"}   |
| APPROVED  | approve     | 400  | OK      | {"error":"Cannot approve indent in status APPROVED"}  |
| APPROVED  | reject      | 400  | OK      | {"error":"Cannot reject indent in status APPROVED"}   |
| APPROVED  | convert     | 400  | REVIEW  | {"error":"Required"}                                  |
| APPROVED  | waiveQuotes | 400  | REVIEW  | {"error":"A waiver reason is required"}               |
| CONVERTED | submit      | 400  | OK      | {"error":"Cannot submit indent in status CONVERTED"}  |
| CONVERTED | approve     | 400  | OK      | {"error":"Cannot approve indent in status CONVERTED"} |
| CONVERTED | reject      | 400  | OK      | {"error":"Cannot reject indent in status CONVERTED"}  |
| CONVERTED | convert     | 400  | OK      | {"error":"Required"}                                  |
| CONVERTED | waiveQuotes | 400  | OK      | {"error":"A waiver reason is required"}               |
| REJECTED  | submit      | 200  | OK      |                                                       |
| REJECTED  | approve     | 400  | OK      | {"error":"Cannot approve indent in status REJECTED"}  |
| REJECTED  | reject      | 400  | OK      | {"error":"Cannot reject indent in status REJECTED"}   |
| REJECTED  | convert     | 400  | OK      | {"error":"Required"}                                  |
| REJECTED  | waiveQuotes | 400  | OK      | {"error":"A waiver reason is required"}               |

## SupplierReturn

| Status    | Action   | HTTP | Verdict | Message                                                |
| --------- | -------- | ---- | ------- | ------------------------------------------------------ |
| DRAFT     | submit   | 200  | OK      |                                                        |
| DRAFT     | complete | 400  | OK      | {"error":"Cannot complete return in status DRAFT"}     |
| DRAFT     | cancel   | 200  | OK      |                                                        |
| SUBMITTED | submit   | 400  | OK      | {"error":"Cannot submit return in status SUBMITTED"}   |
| SUBMITTED | complete | 200  | OK      |                                                        |
| SUBMITTED | cancel   | 200  | OK      |                                                        |
| COMPLETED | submit   | 400  | OK      | {"error":"Cannot submit return in status COMPLETED"}   |
| COMPLETED | complete | 400  | OK      | {"error":"Cannot complete return in status COMPLETED"} |
| COMPLETED | cancel   | 400  | OK      | {"error":"Cannot cancel a completed return"}           |
| CANCELLED | submit   | 400  | OK      | {"error":"Cannot submit return in status CANCELLED"}   |
| CANCELLED | complete | 400  | OK      | {"error":"Cannot complete return in status CANCELLED"} |
| CANCELLED | cancel   | 400  | OK      | {"error":"Return is already cancelled"}                |

## StockCount

| Status     | Action    | HTTP | Verdict | Message                                                                                                       |
| ---------- | --------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------- |
| DRAFT      | confirm   | 200  | OK      |                                                                                                               |
| DRAFT      | reconcile | 400  | OK      | {"error":"Cannot reconcile count in status DRAFT"}                                                            |
| COUNTED    | confirm   | 400  | OK      | {"error":"Cannot confirm count in status COUNTED"}                                                            |
| COUNTED    | reconcile | 400  | REVIEW  | {"error":"17 stock movement(s) occurred at this location after the count — the count is stale. Recount before |
| RECONCILED | confirm   | 400  | OK      | {"error":"Cannot confirm count in status RECONCILED"}                                                         |
| RECONCILED | reconcile | 400  | OK      | {"error":"Cannot reconcile count in status RECONCILED"}                                                       |

## SupplierInvoice

| Status   | Action  | HTTP | Verdict | Message                                                          |
| -------- | ------- | ---- | ------- | ---------------------------------------------------------------- |
| PENDING  | approve | 200  | OK      |                                                                  |
| PENDING  | void    | 200  | OK      |                                                                  |
| MATCHED  | approve | 200  | OK      |                                                                  |
| MATCHED  | void    | 200  | OK      |                                                                  |
| DISPUTED | approve | 200  | OK      |                                                                  |
| DISPUTED | void    | 200  | OK      |                                                                  |
| APPROVED | approve | 409  | OK      | {"error":"Invoice is already approved — cannot approve again"}   |
| APPROVED | void    | 200  | OK      |                                                                  |
| PAID     | approve | 409  | OK      | {"error":"Invoice is already paid — cannot approve again"}       |
| PAID     | void    | 409  | OK      | {"error":"Cannot void a PAID invoice — void its payments first"} |
| VOID     | approve | 409  | OK      | {"error":"Invoice is already void — cannot approve again"}       |
| VOID     | void    | 409  | OK      | {"error":"Invoice is already voided"}                            |

## SubcontractorWorkOrder

| Status    | Action            | HTTP | Verdict | Message                                                                                                        |
| --------- | ----------------- | ---- | ------- | -------------------------------------------------------------------------------------------------------------- |
| DRAFT     | issue             | 200  | OK      |                                                                                                                |
| DRAFT     | complete          | 400  | OK      | {"error":"Cannot complete work order in status DRAFT (must be ACTIVE — issue the work order and start work fir |
| DRAFT     | release-retention | 400  | OK      | {"error":"Retention can only be released for completed work orders"}                                           |
| ISSUED    | issue             | 400  | OK      | {"error":"Cannot issue work order in status ISSUED"}                                                           |
| ISSUED    | complete          | 400  | REVIEW  | {"error":"Cannot complete work order in status ISSUED (must be ACTIVE — issue the work order and start work fi |
| ISSUED    | release-retention | 400  | OK      | {"error":"Retention can only be released for completed work orders"}                                           |
| ACTIVE    | issue             | 400  | OK      | {"error":"Cannot issue work order in status ACTIVE"}                                                           |
| ACTIVE    | complete          | 200  | OK      |                                                                                                                |
| ACTIVE    | release-retention | 400  | OK      | {"error":"Retention can only be released for completed work orders"}                                           |
| COMPLETED | issue             | 400  | OK      | {"error":"Cannot issue work order in status COMPLETED"}                                                        |
| COMPLETED | complete          | 400  | OK      | {"error":"Cannot complete work order in status COMPLETED (must be ACTIVE — issue the work order and start work |
| COMPLETED | release-retention | 400  | REVIEW  | {"error":"No retention balance to release"}                                                                    |
| CLOSED    | issue             | 400  | OK      | {"error":"Cannot issue work order in status CLOSED"}                                                           |
| CLOSED    | complete          | 400  | OK      | {"error":"Cannot complete work order in status CLOSED (must be ACTIVE — issue the work order and start work fi |
| CLOSED    | release-retention | 400  | OK      | {"error":"Retention can only be released for completed work orders"}                                           |
| CANCELLED | issue             | 400  | OK      | {"error":"Cannot issue work order in status CANCELLED"}                                                        |
| CANCELLED | complete          | 400  | OK      | {"error":"Cannot complete work order in status CANCELLED (must be ACTIVE — issue the work order and start work |
| CANCELLED | release-retention | 400  | OK      | {"error":"Retention can only be released for completed work orders"}                                           |

## MaterialSale

| Status             | Action | HTTP | Verdict | Message                                                                                                        |
| ------------------ | ------ | ---- | ------- | -------------------------------------------------------------------------------------------------------------- |
| PENDING            | cancel | 200  | OK      |                                                                                                                |
| ACTIVE             | cancel | 200  | OK      |                                                                                                                |
| PARTIALLY_RETURNED | cancel | 400  | OK      | {"error":"Cannot cancel a sale with returns — the returned stock and journal reversals would double-count. Pro |
| RETURNED           | cancel | 400  | OK      | {"error":"Cannot cancel a sale with returns — the returned stock and journal reversals would double-count. Pro |
| CANCELLED          | cancel | 400  | OK      | {"error":"Sale is already cancelled"}                                                                          |
