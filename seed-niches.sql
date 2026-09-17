-- 50 Niche Categories grouped by sector

-- Home Services (12)
INSERT OR IGNORE INTO niches (id, name, category, search_terms, typical_features) VALUES
  ('plumber', 'Plumber', 'Home Services', '["plumber","plumbing service","plumbing repair","emergency plumber"]', '["Emergency contact","Service areas","Online booking","License badges","Before/after gallery"]'),
  ('electrician', 'Electrician', 'Home Services', '["electrician","electrical service","electrical repair"]', '["Emergency banner","License/certifications","Free estimate form","Service areas"]'),
  ('hvac', 'HVAC / Heating & Cooling', 'Home Services', '["hvac","heating and cooling","air conditioning repair","furnace repair"]', '["Seasonal specials","Maintenance plans","Emergency 24/7","Energy calculator"]'),
  ('roofer', 'Roofer', 'Home Services', '["roofer","roofing contractor","roof repair","roof replacement"]', '["Before/after gallery","Free estimate","Financing options","Storm damage section"]'),
  ('landscaper', 'Landscaper / Lawn Care', 'Home Services', '["landscaper","lawn care","landscaping service","lawn mowing"]', '["Project gallery","Seasonal packages","Instant quote","Before/after slider"]'),
  ('painter', 'House Painter', 'Home Services', '["house painter","painting contractor","interior painting","exterior painting"]', '["Color visualizer","Project gallery","Free estimate","Before/after showcase"]'),
  ('pest_control', 'Pest Control', 'Home Services', '["pest control","exterminator","termite treatment"]', '["Emergency service","Free inspection","Pest guide","Guarantee badge"]'),
  ('cleaning', 'Cleaning Service', 'Home Services', '["cleaning service","house cleaning","maid service","janitorial"]', '["Instant quote","Service packages","Booking calendar","Eco-friendly options"]'),
  ('handyman', 'Handyman', 'Home Services', '["handyman","handyman service","home repair"]', '["Service list","Online booking","Reviews","Service areas map"]'),
  ('garage_door', 'Garage Door Repair', 'Home Services', '["garage door repair","garage door installation","garage door service"]', '["Emergency service","Same-day repair","Brand gallery","Free estimate"]'),
  ('fence', 'Fence Installer', 'Home Services', '["fence installer","fencing contractor","fence repair","fence company"]', '["Material options gallery","Free estimate","Style comparison","Financing"]'),
  ('concrete', 'Concrete / Paving', 'Home Services', '["concrete contractor","paving","driveway","foundation repair"]', '["Project gallery","Free estimate","Process explanation","Certifications"]');

-- Healthcare & Wellness (8)
INSERT OR IGNORE INTO niches (id, name, category, search_terms, typical_features) VALUES
  ('dentist', 'Dentist', 'Healthcare', '["dentist","dental clinic","family dentist","cosmetic dentist"]', '["Online booking","Insurance list","Patient portal","Team bios","New patient specials"]'),
  ('chiropractor', 'Chiropractor', 'Healthcare', '["chiropractor","chiropractic care","back pain treatment"]', '["Online booking","Treatment info","Patient testimonials","Insurance accepted"]'),
  ('physical_therapist', 'Physical Therapist', 'Healthcare', '["physical therapist","physical therapy","PT clinic","rehab center"]', '["Appointment booking","Treatment specialties","Insurance info","Patient resources"]'),
  ('optometrist', 'Optometrist', 'Healthcare', '["optometrist","eye doctor","eye exam","vision care"]', '["Online booking","Frame gallery","Insurance accepted","Eye health resources"]'),
  ('med_spa', 'Medical Spa / Aesthetics', 'Healthcare', '["medical spa","med spa","botox","aesthetics clinic"]', '["Treatment menu","Before/after gallery","Online booking","Pricing","Specials"]'),
  ('mental_health', 'Therapist / Counselor', 'Healthcare', '["therapist","counselor","mental health","psychologist"]', '["Online booking","Telehealth option","Specialties list","Insurance accepted"]'),
  ('veterinarian', 'Veterinarian', 'Healthcare', '["veterinarian","vet clinic","animal hospital","pet care"]', '["Pet portal","Emergency info","Team bios","Services list","Pharmacy"]'),
  ('urgent_care', 'Urgent Care Clinic', 'Healthcare', '["urgent care","walk-in clinic","immediate care"]', '["Wait times","Services offered","Insurance accepted","Hours/location","Online check-in"]');

-- Beauty & Personal Care (5)
INSERT OR IGNORE INTO niches (id, name, category, search_terms, typical_features) VALUES
  ('hair_salon', 'Hair Salon', 'Beauty', '["hair salon","hairstylist","hair coloring","hair cut"]', '["Online booking","Service menu","Stylist profiles","Photo gallery","Pricing"]'),
  ('barber', 'Barber Shop', 'Beauty', '["barber","barbershop","mens haircut","fade haircut"]', '["Online booking","Service menu","Photo gallery","Reviews","Loyalty program"]'),
  ('nail_salon', 'Nail Salon', 'Beauty', '["nail salon","manicure","pedicure","nail art"]', '["Service menu","Pricing","Online booking","Photo gallery","Gift cards"]'),
  ('spa', 'Day Spa / Massage', 'Beauty', '["day spa","massage therapy","spa near me"]', '["Treatment menu","Online booking","Gift cards","Packages","Therapist bios"]'),
  ('tattoo', 'Tattoo & Piercing Studio', 'Beauty', '["tattoo shop","tattoo artist","piercing studio"]', '["Artist portfolios","Booking","Aftercare info","Reviews","Style gallery"]');

-- Automotive (4)
INSERT OR IGNORE INTO niches (id, name, category, search_terms, typical_features) VALUES
  ('auto_mechanic', 'Auto Repair / Mechanic', 'Automotive', '["auto mechanic","car repair","auto repair shop","oil change"]', '["Service menu","Online appointment","ASE certifications","Warranty info","Reviews"]'),
  ('auto_body', 'Auto Body / Collision Repair', 'Automotive', '["auto body shop","collision repair","car dent repair"]', '["Before/after gallery","Insurance claims","Free estimate","Certifications"]'),
  ('auto_detailing', 'Auto Detailing', 'Automotive', '["auto detailing","car detailing","car wash","paint correction"]', '["Service packages","Pricing","Online booking","Before/after gallery"]'),
  ('tire_shop', 'Tire Shop', 'Automotive', '["tire shop","tire service","tire installation","wheel alignment"]', '["Tire finder tool","Service menu","Appointment booking","Brand selection"]');

-- Food & Beverage (5)
INSERT OR IGNORE INTO niches (id, name, category, search_terms, typical_features) VALUES
  ('restaurant', 'Restaurant', 'Food & Beverage', '["restaurant","dining","food near me"]', '["Online menu","Reservations","Hours/location","Photo gallery","Ordering"]'),
  ('cafe', 'Café / Coffee Shop', 'Food & Beverage', '["cafe","coffee shop","espresso bar"]', '["Menu","Hours","Location","Online ordering","Events calendar"]'),
  ('bakery', 'Bakery', 'Food & Beverage', '["bakery","custom cakes","pastry shop"]', '["Product gallery","Custom order form","Menu","Hours","Catering info"]'),
  ('food_truck', 'Food Truck', 'Food & Beverage', '["food truck","street food","mobile food"]', '["Menu","Schedule/locations","Catering info","Social media links"]'),
  ('catering', 'Catering Service', 'Food & Beverage', '["catering service","event catering","wedding catering"]', '["Menu options","Quote request","Event gallery","Testimonials","Packages"]');

-- Fitness & Recreation (4)
INSERT OR IGNORE INTO niches (id, name, category, search_terms, typical_features) VALUES
  ('personal_trainer', 'Personal Trainer / Gym', 'Fitness', '["personal trainer","gym","fitness studio","workout"]', '["Class schedule","Membership plans","Free trial","Trainer bios","Transformations"]'),
  ('yoga', 'Yoga / Pilates Studio', 'Fitness', '["yoga studio","pilates","yoga classes"]', '["Class schedule","Pricing","Instructor bios","Online booking","Virtual classes"]'),
  ('martial_arts', 'Martial Arts School', 'Fitness', '["martial arts","karate","jiu jitsu","taekwondo"]', '["Class schedule","Free trial","Instructor bios","Belt progression","Kids programs"]'),
  ('dance', 'Dance Studio', 'Fitness', '["dance studio","dance classes","ballroom dance","hip hop dance"]', '["Class schedule","Pricing","Instructor bios","Event calendar","Recital info"]');

-- Professional Services (6)
INSERT OR IGNORE INTO niches (id, name, category, search_terms, typical_features) VALUES
  ('accountant', 'Accountant / Tax Prep', 'Professional', '["accountant","tax preparation","CPA","bookkeeping"]', '["Service list","Client portal","Consultation booking","Credentials","Resources"]'),
  ('insurance', 'Insurance Agency', 'Professional', '["insurance agency","insurance agent","home insurance","auto insurance"]', '["Quote calculator","Coverage types","Claims info","Agent bios"]'),
  ('financial_advisor', 'Financial Advisor', 'Professional', '["financial advisor","financial planner","wealth management"]', '["Service overview","Consultation booking","Credentials","Client resources"]'),
  ('real_estate', 'Real Estate Agent', 'Professional', '["real estate agent","realtor","homes for sale"]', '["Property listings","Market updates","Agent bio","Neighborhood guides","Contact form"]'),
  ('photographer', 'Photographer / Videographer', 'Professional', '["photographer","wedding photographer","portrait photographer"]', '["Portfolio gallery","Packages/pricing","Booking","Testimonials","About"]'),
  ('notary', 'Notary / Legal Document Prep', 'Professional', '["notary public","notary service","legal document preparation"]', '["Services list","Appointment booking","Mobile notary info","Pricing"]');

-- Pet Services (3)
INSERT OR IGNORE INTO niches (id, name, category, search_terms, typical_features) VALUES
  ('pet_groomer', 'Pet Groomer', 'Pet Services', '["pet groomer","dog grooming","cat grooming"]', '["Service menu","Pricing","Online booking","Before/after photos","Reviews"]'),
  ('dog_trainer', 'Dog Trainer', 'Pet Services', '["dog trainer","dog training","puppy training","obedience training"]', '["Program options","Pricing","Trainer bio","Testimonials","Booking"]'),
  ('pet_boarding', 'Pet Boarding / Daycare', 'Pet Services', '["pet boarding","dog boarding","pet daycare","kennel"]', '["Facility tour","Pricing","Reservation form","Webcam access","Requirements"]');

-- Education & Childcare (2)
INSERT OR IGNORE INTO niches (id, name, category, search_terms, typical_features) VALUES
  ('daycare', 'Daycare / Preschool', 'Education', '["daycare","preschool","childcare center","nursery school"]', '["Programs overview","Enrollment form","Facility tour","Staff bios","Parent portal"]'),
  ('tutoring', 'Tutoring / Learning Center', 'Education', '["tutoring","learning center","math tutor","reading tutor"]', '["Subject areas","Tutor profiles","Pricing","Free assessment","Online option"]');

-- Construction & Trade (1)
INSERT OR IGNORE INTO niches (id, name, category, search_terms, typical_features) VALUES
  ('general_contractor', 'General Contractor', 'Construction', '["general contractor","home remodeling","construction company","renovation"]', '["Project gallery","Free estimate","License/insurance","Process overview","Testimonials"]');
