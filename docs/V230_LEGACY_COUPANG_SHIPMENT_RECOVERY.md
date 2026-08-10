# V230 Legacy Coupang shipment recovery

V229 showed `direct recovery 0/0`, so no history row ever reached the AdminPlus direct lookup.
Older Coupang history may not contain modern local `paymentStatus=완료` / `marketplacePreparingAt` fields.

V230:
- lets old Coupang history into direct recovery when it has a customer order code or AdminPlus order code;
- can find the AdminPlus order by either identifier;
- still blocks Coupang marketplace upload unless the recovered row matches a current `INSTRUCT` order;
- exposes eligible/skipped candidates and current-INSTRUCT mismatch counts.

Revision: `legacy-coupang-shipment-recovery-v230-20260810`.
