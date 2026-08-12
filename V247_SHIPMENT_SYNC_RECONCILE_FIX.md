# V247 Shipment Sync Reconcile Fix

AdminPlus submitted orders can recover tracking independent of internal auto-payment status; marketplace transition still requires confirmed courier+tracking. Coupang INSTRUCT is reconciled before acknowledgement retry, uploaded rows are excluded, and sourceKey is preserved.
