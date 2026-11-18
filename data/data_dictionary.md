# Data Dictionary

## schedule_availability.csv

One row per class, Nov 6 – Dec 31, 2026 (1,208 rows). Week 1 is the real schedule; later weeks repeat its pattern. Seat counts are simulated.

| Column | Meaning |
|---|---|
| class_id | Unique key, e.g. SW-20261115-0915-yoga-restore |
| start_iso, end_iso | Eastern time; end is blank where class length is unpublished |
| instructor | Week 1 only |
| capacity, seats_left, waitlist | Simulated |
| status | open, few_left, full, or holiday_unconfirmed |
| booking_opens_iso | 7 days before, plus 1 hour (website rule); priority is 10 days |
| schedule_basis | observed or projected |
| demo_pinned | Fixed values: Sun 11/15 Yoga Restore (5 left), Sat 11/14 Hot Pilates (3 left), Sat 11/14 9 AM Reform (full, 4 waitlisted), Fri 11/13 Party Ride (12 left) |

## class_catalog.csv

One row per class type (17): studio, length, intensity, heat, gear, beginner fit, and the names people use for it (spin = Ride). Intensity and beginner fit are our labels, based on the published descriptions.

## booking_requests_template.csv

An example format for saved booking requests: caller, class, call summary, follow-up flag, and status. Includes one sample row.

## fact_sheet.csv

37 verified facts, each with the knowledge-base doc it comes from. Useful as an answer key.
