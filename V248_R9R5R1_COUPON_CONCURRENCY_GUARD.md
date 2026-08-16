# V248 R9.5.1 Coupon Concurrency Guard

- pending and running retries block new coupon creation
- retry uses conditional pending-to-running claim
- concurrent scheduler duplicate retry execution is blocked
- automation stopped guard remains
- R9.5 / R9.4 / R8.3 / R9.2 retained
