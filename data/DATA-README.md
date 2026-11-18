# Club Studio South Windsor Data

Everything was pulled from clubstudiofitness.com on Nov 6, 2026. Seat availability is simulated.

## What's here

- **rag/** — 11 short docs covering hours, pricing, policies, classes, guest passes, a caller FAQ, a class guide by goal, the weekly schedule, and what isn't published. Each `## ` section works as one chunk.
- **data/schedule_availability.csv** — 8 weeks of classes with simulated seats left, waitlists, and booking-open times.
- **data/class_catalog.csv** — class types with intensity, heat, gear, and common names (spin = Ride).
- **data/booking_requests_template.csv** — a sample format for saved requests.
- **data/fact_sheet.csv** — 37 verified facts for checking answers.
- **tools/build_schedule.ipynb** — regenerates the schedule from a fresh weekly pull.
- **sources/source-ledger.md** — where each fact came from.

## What it can do

- Answer most front-desk questions: hours, prices, fees, cancellations, what to bring, which class fits a goal.
- Find open classes by day, time, or type, and say how many seats are left.
- Give a few predictable test cases (see the data dictionary).

## Notes

- Not published, so not included: parking, holiday hours, class sizes, drop-in prices.
- Club Studio's terms limit reuse of site content, so this should stay within the team and be presented as an unaffiliated class demo.
