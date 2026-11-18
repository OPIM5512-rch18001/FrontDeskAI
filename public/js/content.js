// Static site copy. Every fact comes from /data (collected from public pages on Nov 6, 2026).
// Items the club doesn't publish say so, and point people to the club.
export const CLUB = { name: 'Club Studio', place: 'South Windsor', address: '100 Cedar Avenue, South Windsor, CT 06074', area: 'Evergreen Walk', phone: '(860) 466-7628' };

export const HOURS = [
  { d: 'Monday – Thursday', h: '5:00 AM – 10:00 PM' },
  { d: 'Friday', h: '5:00 AM – 9:00 PM' },
  { d: 'Saturday – Sunday', h: '7:00 AM – 6:00 PM' }
];

export const STUDIOS = [
  { key: 'Reform', slot: 'reform', blurb: 'Reformer Pilates on custom machines. Low impact, all levels, grip socks required.', tag: '45 min · Low impact' },
  { key: 'CS4', slot: 'cs4', blurb: 'Five-station circuit: cardio intervals, strength, functional moves and core.', tag: '50 min · Every level' },
  { key: 'Ride', slot: 'ride', blurb: 'Rhythm-based indoor cycling with lights and music. Sneakers or cleats both work.', tag: '45 min · Low impact' },
  { key: 'Box', slot: 'box', blurb: 'Nine-round boxing and heavy-lift conditioning. Gloves required, $5 to rent.', tag: '45 min · High intensity' },
  { key: 'Sweat+', slot: 'sweat', blurb: 'Heated Pilates and yoga, plus restorative and specialty classes.', tag: 'Heated · Warm · Restore' }
];

export const FEATURED = ['Reform', 'CS4', 'Ride', 'Box x Bags', 'Hot Pilates', 'Yoga Restore'];

export const TIERS = [
  { name: 'Standard', price: 169, upfront: 338, blurb: 'Everything you need for the South Windsor club.', features: ['South Windsor club access', 'Unlimited boutique classes, up to 5 different per day', 'Book up to 7 days ahead', 'Month-to-month, no initiation or annual fee shown online'], note: 'Multi-person pricing: 2 for $318, 3 for $467, 4 for $616 per month.' },
  { name: 'Standard Plus', price: 209, upfront: 418, popular: true, blurb: 'Book earlier and bring friends.', features: ['Everything in Standard', 'Priority Booking: reserve up to 10 days ahead', '25 guest passes per year', 'Best for popular classes like Reform'], note: 'Priority Booking improves your odds but does not guarantee a spot.' },
  { name: 'Premier', price: 249, upfront: 498, blurb: 'Take your membership to every Club Studio.', features: ['Everything in Standard Plus', 'Access to all Club Studio locations', 'Priority Booking', '25 guest passes per year'], note: 'About 61 clubs across 16 states are listed, open or coming soon.' }
];

export const FAQ_CATS = ['Hours & location', 'Pricing & joining', 'Booking & classes', 'Gear & first visit', 'Guest passes & trials', 'Amenities', 'Cancel or freeze', 'Not published'];

export const FAQ = [
  { c: 'Hours & location', q: 'What are the club hours?', a: 'Monday to Thursday 5:00 AM to 10:00 PM, Friday 5:00 AM to 9:00 PM, and Saturday and Sunday 7:00 AM to 6:00 PM (Eastern). Holiday hours are not published, so call the club to confirm.' },
  { c: 'Hours & location', q: 'Where is the South Windsor club?', a: '100 Cedar Avenue, South Windsor, Connecticut 06074, in the Evergreen Walk area.' },
  { c: 'Hours & location', q: 'Are there other clubs in Connecticut?', a: 'South Windsor is the only open Club Studio in Connecticut right now. Norwalk and Stamford are listed as coming soon.' },
  { c: 'Pricing & joining', q: 'How much is a membership?', a: 'Advertised online rates are $169 a month for Standard, $209 for Standard Plus and $249 for Premier, before tax. Prices can change without notice.' },
  { c: 'Pricing & joining', q: 'Is there a sign-up fee or a contract?', a: 'The online rates show no initiation fee and no annual fee. Memberships are month-to-month and auto-renew. When you join online you pay the first and last month up front.' },
  { c: 'Pricing & joining', q: 'What do I pay up front to join?', a: 'The first and last month of dues: $338 for Standard, $418 for Standard Plus and $498 for Premier, plus any tax. The prepaid last month is used after you cancel.' },
  { c: 'Pricing & joining', q: 'Is there group or family pricing?', a: 'Standard shows multi-person pricing: 2 people for $318 a month, 3 for $467 and 4 for $616. Multi-person rates for the other tiers are not shown.' },
  { c: 'Pricing & joining', q: 'Are classes included?', a: 'Yes. Memberships include boutique classes, up to five different ones per day, depending on class size and availability.' },
  { c: 'Pricing & joining', q: 'How old do I need to be?', a: 'Members must be at least 16, or 13 with a legal guardian. A guardian 18 or older buys and signs for a minor.' },
  { c: 'Pricing & joining', q: 'How are dues paid?', a: 'By automatic transfer from a checking or savings account, or with an accepted credit card.' },
  { c: 'Pricing & joining', q: 'What is Priority Booking?', a: 'Standard Plus and Premier members can reserve one spot per studio per day up to 10 days ahead, instead of 7. Popular classes can still fill.' },
  { c: 'Booking & classes', q: 'How do I book a class?', a: 'Members book in the Club Studio mobile app or on the Club Studio website. You can also ask FrontDesk AI to pass a request to the team, and staff will confirm it.' },
  { c: 'Booking & classes', q: 'When does booking open for a class?', a: 'A class opens one week ahead, one hour after its start time. For example, a 10:00 AM class next Saturday opens at 11:00 AM this Saturday.' },
  { c: 'Booking & classes', q: 'How many classes can I book per day?', a: 'You can reserve one spot per studio per day online. Unlimited means up to five different boutique classes a day; extra classes in the same studio are walk-in if there is space.' },
  { c: 'Booking & classes', q: 'What if a class is full?', a: 'Join the waitlist. If a spot opens you are enrolled automatically and notified by app and email. Late-cancel and no-show fees still apply once you are in, so leave the waitlist if your plans change.' },
  { c: 'Booking & classes', q: 'What are the cancellation and no-show fees?', a: 'Cancel at least 12 hours before class to avoid a fee. Later than that is a $10 late cancellation, and a no-show is $15.' },
  { c: 'Booking & classes', q: 'Can I give my booking to a friend?', a: 'No. A class booking cannot be shared with or transferred to someone else.' },
  { c: 'Booking & classes', q: 'Is there yoga on Saturday?', a: 'Not at South Windsor. The closest options are Yoga Restore on Sunday at 9:15 AM or Hot Pilates on Saturday at 8:00 AM.' },
  { c: 'Booking & classes', q: 'Which class is best for a beginner?', a: 'Good first classes are Reform, CS4, Ride and Yoga Restore. Box x Lift and Hot HIIT Sculpt are more demanding and better after a few visits.' },
  { c: 'Booking & classes', q: 'What do people call these classes?', a: 'Spin means Ride, reformer means Reform, circuit means CS4, hot yoga or Vinyasa means Yoga Flow, and restorative or Yin means Yoga Restore. There is no kickboxing class; Box x Bags is the closest.' },
  { c: 'Gear & first visit', q: 'What do I need to bring?', a: 'Reform requires grip socks. Box classes require gloves, which rent for $5, and hand wraps are strongly recommended. For Ride, sneakers or SPD/Delta cleats both work. Bring water to heated classes; towel service is available.' },
  { c: 'Gear & first visit', q: 'How early should I arrive?', a: 'About 10 minutes early, or 15 for your first visit. Doors close when class starts, so latecomers may not be let in.' },
  { c: 'Gear & first visit', q: 'How hot are the heated classes?', a: 'Hot Pilates runs up to about 85°F, Hot Pilates X Strength about 90°F and Yoga Flow about 90 to 95°F. Yoga Restore is warm rather than hot.' },
  { c: 'Guest passes & trials', q: 'Can I try the club for free?', a: 'The club advertises a few ways to try it: a one-day guest trial, a free 5-day pass, and a 7-day VIP pass members can send a friend. Which one applies to you is not spelled out, so the club can confirm.' },
  { c: 'Guest passes & trials', q: 'How do guest passes work?', a: 'Standard Plus and Premier include 25 guest passes a year. Standard members can refer friends with a 7-day VIP pass from their online account.' },
  { c: 'Guest passes & trials', q: 'Is there a referral reward?', a: 'When a member refers someone who joins within 90 days, the member gets a $25 Club Studio retail credit about 10 days after enrollment. Short-term memberships are excluded and other restrictions apply.' },
  { c: 'Amenities', q: 'What amenities does South Windsor have?', a: 'Free weights, cardio and strength equipment, locker rooms, a basketball court, an indoor pool, a sauna, a functional training area, a recovery room, cryotherapy, red light therapy, personal training, towel service, Wi-Fi and the Beaming Cafe juice bar. Some recovery services cost extra.' },
  { c: 'Amenities', q: 'Is there a steam room, pickleball or racquetball?', a: 'None of those are listed for South Windsor. They are offered at select Club Studio locations only.' },
  { c: 'Amenities', q: 'Is there personal training?', a: 'Yes. Pricing is not published online.' },
  { c: 'Cancel or freeze', q: 'How do I cancel my membership?', a: 'At the front desk, through your online account, or by mailed written notice to P.O. Box 54170, Irvine, CA 92619. Your signed agreement takes priority over this summary.' },
  { c: 'Cancel or freeze', q: 'Can I freeze my membership?', a: 'Monthly members can freeze for $50 a month per member by contacting the club. If your next billing date is within 10 days, the freeze starts the following month.' },
  { c: 'Not published', q: 'Is there parking, childcare or a mat rental?', a: 'Parking details, childcare and whether yoga mats are provided are not published. Please ask the club at (860) 466-7628.' },
  { c: 'Not published', q: 'What about holiday hours and classes?', a: 'Holiday hours and holiday class schedules (Thanksgiving, Christmas Eve, Christmas Day, New Year’s Eve) are not published. Classes on those days are marked unconfirmed here.' },
  { c: 'Not published', q: 'What does a drop-in cost, and what are add-on prices?', a: 'Non-member drop-in prices, recovery add-ons, personal training rates, taxes and promo codes are not published online. The club can quote them.' }
];

export const DISCLAIMER = 'This website is an independent class project demonstration. It is not affiliated with, endorsed by or sponsored by Club Studio, Club Studio Fitness or Fitness International. Facts were gathered from public pages on November 6, 2026 and may have changed; seat availability is simulated.';
