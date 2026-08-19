/**
 * Guess a spending category from the merchant name in an SMS.
 *
 * Bank/UPI rules can't carry a category (an HDFC debit could be anything), so
 * without this every imported row lands in "Others". Names here must match
 * DEFAULT_EXPENSE_CATS / DEFAULT_INCOME_CATS exactly, otherwise the picker on
 * the import row has nothing to select.
 *
 * Two kinds of token, because UPI handles arrive with the words glued together
 * ("sriramrestaurant@okhdfcbank", "PHOENIXMALLBLR"):
 *   tokens — matched anywhere inside the letters-and-digits-only text, so
 *            "restaurant" is found inside "sriramrestaurant".
 *   strict — matched as whole words only. For anything short or hiding inside
 *            an unrelated word: "mess" in "message", "atm" in "atmosphere",
 *            "mall" in "small". Tokens under 5 characters are strict anyway.
 */

type Bucket = {
  category: string;
  tokens: string[];
  strict?: string[];
};

/** Ordered: the first bucket that matches wins, so keep specific above generic. */
const EXPENSE_BUCKETS: Bucket[] = [
  {
    // First: an ATM SMS often names a branch or mall in the location, and cash
    // out is never really "shopping".
    category: 'Withdraw',
    tokens: [
      'withdraw', 'withdrawn', 'withdrawal', 'cash withdrawal', 'cash wdl',
      'atm withdrawal', 'atm cash', 'cash at atm', 'cash advance',
      'self withdrawal', 'cardless cash',
    ],
    // Not bare "atm": card purchases are often tagged "ATM/POS", and those are
    // real spending, not cash out.
    strict: ['atw', 'wdl', 'nwd', 'atm wdl'],
  },
  {
    // Above Loans: an SMS naming EMI is the monthly instalment, whatever the
    // underlying loan is. Loans below catches disbursal and lump repayment.
    category: 'EMI',
    tokens: [
      'emi', 'instalment', 'installment', 'monthly instalment',
      'nach debit', 'ecs debit', 'auto debit emi', 'no cost emi',
      'emi debited', 'emi payment', 'bajaj emi',
    ],
    strict: ['emi', 'e m i', 'nach', 'ecs'],
  },
  {
    category: 'Loans',
    tokens: [
      'loan', 'loan account', 'loan repayment', 'loan disbursed',
      'personal loan', 'home loan', 'car loan', 'gold loan', 'education loan',
      'bajaj finserv', 'bajaj finance', 'hdb financial', 'muthoot',
      'manappuram', 'shriram finance', 'tata capital', 'aditya birla finance',
      'moneyview', 'money view', 'kreditbee', 'navi loan', 'fibe loan',
      'credit line', 'overdue amount', 'foreclosure',
    ],
  },
  {
    // Before Recharge: "airtel broadband" must not read as a mobile top-up.
    category: 'Internet Bill',
    tokens: [
      'broadband', 'fibernet', 'fiber net', 'fibre net', 'jiofiber', 'jio fiber',
      'airtel xstream', 'airtel fiber', 'act fibernet', 'act broadband',
      'hathway', 'tikona', 'excitel', 'spectra', 'you broadband', 'wifi bill',
      'internet bill', 'leased line', 'railwire', 'asianet broadband',
      'bsnl broadband', 'internet charges',
    ],
  },
  {
    category: 'Electricity Bill',
    tokens: [
      'electricity', 'electricity bill', 'power bill', 'current bill',
      'bescom', 'tneb', 'tangedco', 'msedcl', 'mahadiscom', 'adani electricity',
      'tata power', 'torrent power', 'kseb', 'wbsedcl', 'uppcl', 'jbvnl',
      'apspdcl', 'tsspdcl', 'pspcl', 'dgvcl', 'mgvcl', 'pgvcl', 'jvvnl',
      'pvvnl', 'mescom', 'hescom', 'gescom', 'cspdcl', 'apepdcl',
      'electricity board', 'power supply', 'energy bill',
    ],
    strict: ['bses', 'cesc', 'eb bill'],
  },
  {
    category: 'Gas Bill',
    tokens: [
      'gas bill', 'indane', 'hp gas', 'bharat gas', 'mahanagar gas', 'gail gas',
      'adani gas', 'indraprastha gas', 'gujarat gas', 'piped gas',
      'cylinder booking', 'gas cylinder', 'gas agency', 'gas refill',
      'gas connection',
    ],
    strict: ['lpg', 'png'],
  },
  {
    category: 'Water Bill',
    tokens: [
      'water bill', 'water board', 'water works', 'bwssb', 'jal board',
      'jal nigam', 'delhi jal', 'water supply', 'hmwssb', 'water can',
      'water tanker', 'bisleri', 'mineral water', 'water charges',
    ],
  },
  {
    category: 'Gym Bill',
    tokens: [
      'cult fit', 'cultfit', 'cure fit', 'curefit', 'fitness first',
      'anytime fitness', 'gold s gym', 'talwalkars', 'fitness centre',
      'fitness center', 'fitness studio', 'crossfit', 'zumba', 'yoga studio',
      'gym membership', 'gym fee', 'fitness club',
    ],
    strict: ['gym'],
  },
  {
    category: 'Recharge',
    tokens: [
      'recharge', 'talktime', 'prepaid plan', 'postpaid bill', 'mobile bill',
      'myjio', 'jio recharge', 'jio prepaid', 'airtel recharge',
      'airtel prepaid', 'airtel postpaid', 'vodafone idea', 'vi recharge',
      'bsnl recharge', 'data pack', 'tata play', 'tatasky', 'tata sky',
      'dish tv', 'sun direct', 'videocon d2h', 'dth recharge',
    ],
    strict: ['jio', 'airtel', 'vodafone', 'bsnl', 'mtnl', 'd2h', 'dth', 'top up', 'topup'],
  },
  {
    // Above Food so "swiggy instamart" doesn't read as a restaurant order, and
    // above everything else so soft drinks and provisions land here.
    category: 'Groceries',
    tokens: [
      'instamart', 'blinkit', 'zepto', 'bigbasket', 'big basket', 'bbdaily',
      'dmart', 'd mart', 'avenue supermart', 'jiomart', 'jio mart', 'grofers',
      'reliance fresh', 'reliance smart', 'spencers', 'nature basket',
      'star bazaar', 'milkbasket', 'country delight', 'licious', 'freshtohome',
      'fresh to home', 'supermarket', 'super market', 'super bazaar', 'kirana',
      'provision store', 'general store', 'grocery', 'groceries', 'departmental',
      'more retail', 'ratnadeep', 'vishal mega mart', 'metro cash', 'zudio mart',
      'nilgiris', 'heritage fresh', 'twenty four seven', 'daily needs',
      // Soft drinks and packaged beverages are a grocery run, not a restaurant.
      'soft drink', 'softdrink', 'cool drink', 'cold drink', 'aerated',
      'beverage', 'beverages', 'coca cola', 'cocacola', 'pepsi', 'thums up',
      'thumsup', 'mountain dew', 'sprite', 'fanta', 'limca', 'maaza', 'frooti',
      'appy fizz', 'bovonto', 'paperboat', 'red bull', 'redbull', 'sting energy',
      'mineral can', 'amul', 'nandini', 'aavin', 'mother dairy', 'heritage milk',
      'dairy', 'egg stall', 'butchery', 'meat shop', 'fish stall', 'chicken shop',
    ],
    // Not bare "oil": "Indian Oil" is fuel, and that bucket sits further down.
    strict: ['milk', 'curd', 'ghee', 'atta', 'rice', 'cola', 'mart'],
  },
  {
    // Above Food: a branded stay is travel even though "hotel" reads as an
    // eatery in most of India.
    category: 'Travel',
    tokens: [
      'makemytrip', 'make my trip', 'goibibo', 'cleartrip', 'ixigo', 'yatra',
      'easemytrip', 'ease my trip', 'happyeasygo', 'booking com', 'agoda',
      'airbnb', 'treebo', 'fabhotels', 'indigo', 'air india', 'akasa air',
      'vistara', 'spicejet', 'goair', 'airlines', 'airways', 'air ticket',
      'flight booking', 'irctc', 'railway', 'redbus', 'red bus', 'abhibus',
      'travels', 'tours', 'tour package', 'holiday package', 'resort',
      'guest house', 'lodge', 'homestay', 'marriott', 'radisson', 'lemon tree',
      'novotel', 'ibis hotel', 'hyatt', 'taj hotel', 'ginger hotel', 'sterling',
      'club mahindra', 'travel agency', 'visa fee', 'passport',
    ],
    strict: ['oyo', '6e air', 'zostel'],
  },
  {
    category: 'Food',
    tokens: [
      'swiggy', 'zomato', 'eatsure', 'faasos', 'behrouz', 'ovenstory', 'box8',
      'eatfit', 'dominos', 'domino s', 'pizza hut', 'mcdonald', 'mcdonalds',
      'burger king', 'subway', 'starbucks', 'chaayos', 'chai point',
      'third wave', 'blue tokai', 'cafe coffee day', 'dunkin', 'wow momo',
      'haldiram', 'barbeque nation', 'bbq nation', 'dineout', 'eazydiner',
      'magicpin', 'thelocal', 'behrouz biryani',
      // Generic words: these are what an unbranded eatery actually looks like
      // on a UPI handle, which is most of them.
      'restaurant', 'restro', 'resto', 'hotel', 'hotels', 'lodge food',
      'dhaba', 'tiffin', 'tiffins', 'bhavan', 'bhawan', 'bhojan', 'bhojanalay',
      'canteen', 'cafeteria', 'kitchen', 'kitchens', 'catering', 'caterers',
      'biryani', 'bakery', 'bakers', 'bake house', 'confectionery',
      'sweets', 'sweet stall', 'sweet house', 'mithai', 'namkeen',
      'pizza', 'burger', 'sandwich', 'noodles', 'momos', 'shawarma', 'kebab',
      'kabab', 'grill', 'barbeque', 'barbecue', 'tandoor', 'curry house',
      'chinese', 'chaat', 'chats', 'panipuri', 'pani puri', 'juice',
      'juice centre', 'juice center', 'ice cream', 'icecream', 'creamstone',
      'naturals ice', 'baskin', 'coffee', 'coffees', 'tea stall', 'chaiwala',
      'chai wala', 'darbar', 'sagar ratna', 'udupi', 'idli', 'dosa', 'parotta',
      'paratha', 'thali', 'meals', 'lunch home', 'dining', 'diner', 'eatery',
      'foods', 'food court', 'food plaza', 'foodie', 'snack', 'snacks',
      'fry', 'fried chicken', 'chicken center', 'family restaurant',
    ],
    strict: ['kfc', 'ccd', 'cafe', 'mess', 'tea', 'wraps'],
  },
  {
    // Above Health: a vet is a clinic too, and the animal words give it away.
    category: 'Pets',
    tokens: [
      'supertails', 'heads up for tails', 'petsy', 'zigly', 'veterinary',
      'pet clinic', 'pet shop', 'pet store', 'pet food', 'aquarium',
      'dog food', 'cat food',
    ],
    strict: ['vet', 'pets'],
  },
  {
    category: 'Health',
    tokens: [
      'pharmeasy', 'netmeds', 'tata 1mg', 'medplus', 'apollo pharmacy',
      'apollo hospital', 'apollo 24', 'wellness forever', 'practo', 'pharmacy',
      'pharma', 'medicals', 'medical store', 'medical shop', 'hospital',
      'hospitals', 'clinic', 'clinics', 'nursing home', 'diagnostics',
      'diagnostic', 'pathology', 'lal path', 'thyrocare', 'metropolis',
      'redcliffe', 'dr lal', 'healthians', 'health care', 'healthcare',
      'dental', 'dentist', 'eye care', 'optical', 'lenskart', 'physiotherapy',
      'ayurveda', 'homeopathy', 'scan centre', 'scan center', 'lab test',
      'chemist', 'druggist', 'surgical', 'polyclinic',
    ],
    // Not bare "dr": UPI reference lines carry "/DR/" for debit.
    strict: ['1mg', 'doctor', 'meds', 'lab'],
  },
  {
    // Unambiguous, and above Gifts so a bouquet doesn't read as a gift card.
    category: 'Flowers',
    tokens: [
      'flower', 'flowers', 'florist', 'floral', 'flower shop', 'flower mart',
      'flower stall', 'bouquet', 'blossom', 'blooms', 'phool',
      'ferns n petals', 'fernsnpetals', 'ferns and petals', 'garland',
      'wedding flowers', 'rose garden', 'jasmine', 'nursery plants',
      'plant nursery',
    ],
    strict: ['fnp'],
  },
  {
    // Below Loans so a gold loan stays a loan, above Clothing and Shopping so a
    // jeweller inside a silk house or a mall isn't read as either.
    category: 'Jewellery',
    tokens: [
      'jewellery', 'jewelry', 'jewellers', 'jewelers', 'jeweller', 'jeweler',
      'jewell', 'jewels', 'jewel mart', 'jewel palace', 'jewellery mart',
      'goldsmith', 'gold palace', 'gold house', 'gold covering', 'gold plated',
      'gold ornaments', 'ornaments', 'bangles', 'bangle store', 'bangle stall',
      'silverware', 'silver articles', 'gold and silver', 'bullion',
      'diamond house', 'diamond jewel', 'thangamaligai',
      'thanga maligai', 'thangamayil', 'gold smith',
      // The chains a card SMS actually names.
      'tanishq', 'kalyan jewel', 'malabar gold', 'joyalukkas', 'jos alukkas',
      'alukkas', 'caratlane', 'carat lane', 'bluestone jewel', 'melorra',
      'candere', 'senco gold', 'pc jeweller', 'reliance jewels', 'kirtilals',
      'vaibhav jewel', 'lalitha jewel', 'khazana jewel', 'prince jewel',
      'bhima jewel', 'grt jewel', 'nac jewel', 'chungath', 'manepally',
      'waman hari pethe', 'p n gadgil', 'tribhovandas', 'krishna pearls',
      'mia by tanishq', 'giva jewel', 'orra jewel', 'zoya jewel',
    ],
    strict: ['tbz', 'grt', 'orra', 'giva'],
  },
  {
    category: 'Entertainment',
    tokens: [
      'netflix', 'hotstar', 'disney', 'prime video', 'primevideo', 'sonyliv',
      'sony liv', 'zee5', 'jiocinema', 'jio cinema', 'jiohotstar', 'aha video',
      'spotify', 'gaana', 'wynk', 'audible', 'bookmyshow', 'book my show',
      'cinepolis', 'cinema', 'cinemas', 'multiplex', 'theatre', 'theater',
      'playstation', 'steam games', 'xbox', 'nintendo', 'google play',
      'youtube premium', 'dream11', 'rummy', 'gaming', 'amusement',
      'water park', 'theme park', 'wonderla', 'snow city', 'bowling',
      'games arcade', 'funcity',
    ],
    strict: ['pvr', 'inox', 'district'],
  },
  {
    category: 'Transportation',
    tokens: [
      'uber', 'ola cabs', 'olacabs', 'ola money', 'rapido', 'blusmart',
      'namma yatri', 'yulu', 'bounce', 'quick ride', 'metro rail',
      'metro card', 'metro recharge', 'city bus', 'bus pass', 'bus ticket',
      'auto rickshaw', 'rickshaw', 'cab service', 'taxi', 'toll plaza',
      'onecard metro',
    ],
    strict: [
      'ola', 'meru', 'vogo', 'dmrc', 'bmrcl', 'bmtc', 'msrtc', 'ksrtc',
      'tsrtc', 'apsrtc', 'best bus', 'auto',
    ],
  },
  {
    category: 'Car',
    tokens: [
      'petrol', 'petroleum', 'diesel', 'fuel', 'fuels', 'filling station',
      'petrol pump', 'petrol bunk', 'service station', 'indian oil',
      'indianoil', 'bharat petroleum', 'hindustan petroleum', 'shell india',
      'nayara', 'reliance petro', 'fastag', 'parking', 'car service',
      'servicing', 'gomechanic', 'go mechanic', 'carwale', 'cardekho',
      'spinny', 'cars24', 'garage', 'motors', 'automobile', 'auto care',
      'car wash', 'tyres', 'tyre', 'puncture', 'battery shop', 'spare parts',
      'insurance premium', 'rto fee', 'driving school', 'lubricants',
    ],
    strict: ['hpcl', 'bpcl', 'iocl', 'hp petrol', 'shell'],
  },
  {
    category: 'Education',
    tokens: [
      'byju', 'unacademy', 'vedantu', 'physics wallah', 'pw skills', 'upgrad',
      'udemy', 'coursera', 'simplilearn', 'great learning', 'scaler',
      'whitehat', 'cuemath', 'toppr', 'school fee', 'school fees', 'college fee',
      'tuition', 'tution', 'university', 'exam fee', 'admission fee', 'coaching',
      'academy', 'institute', 'vidyalaya', 'vidya', 'vidhya', 'school',
      'college', 'classes', 'library', 'hostel fee', 'books', 'stationery',
      'xerox', 'photocopy', 'kindergarten', 'playschool', 'play school',
    ],
  },
  {
    category: 'Kids',
    tokens: [
      'firstcry', 'first cry', 'hopscotch', 'babyhug', 'mothercare',
      'toys r us', 'toy shop', 'toys', 'baby care', 'baby shop', 'diapers',
      'creche', 'day care', 'daycare',
    ],
  },
  {
    category: 'Sports',
    tokens: [
      'decathlon', 'sports club', 'sports goods', 'sportswear', 'sports academy',
      'turf booking', 'badminton', 'cricket kit', 'swimming pool', 'skating',
      'sports shop',
    ],
  },
  {
    category: 'Beauty',
    tokens: [
      'nykaa', 'purplle', 'mamaearth', 'sugar cosmetics', 'salon', 'saloon',
      'unisex salon', 'beauty parlour', 'beauty parlor', 'parlour', 'parlor',
      'lakme', 'looks salon', 'barber', 'hair cut', 'haircut', 'hair studio',
      'cosmetics', 'makeup', 'mehendi', 'tattoo', 'grooming',
    ],
    strict: ['spa'],
  },
  {
    category: 'Electronics',
    tokens: [
      'croma', 'reliance digital', 'vijay sales', 'sangeetha mobiles',
      'poorvika', 'apple store', 'samsung shop', 'oneplus', 'boat lifestyle',
      'mobile shop', 'mobiles', 'electronics', 'computer', 'laptop',
      'accessories shop', 'girias', 'bajaj electronics', 'lot mobiles',
    ],
  },
  {
    category: 'Clothing',
    tokens: [
      'myntra', 'ajio', 'pantaloons', 'westside', 'lifestyle stores',
      'max fashion', 'zudio', 'trends', 'uniqlo', 'levis', 'bata',
      'metro shoes', 'garments', 'textiles', 'readymade', 'boutique',
      'fashion', 'apparels', 'apparel', 'saree', 'sarees', 'silks',
      'clothing', 'footwear', 'shoes', 'tailor', 'dry clean', 'laundry',
      'jockey', 'peter england', 'allen solly', 'van heusen', 'raymond',
    ],
    strict: ['zara', 'h and m', 'h m'],
  },
  {
    // Generic marketplaces and malls last: they sell everything, so they only
    // claim what the specific buckets left behind.
    category: 'Shopping',
    tokens: [
      'amazon', 'flipkart', 'meesho', 'snapdeal', 'tatacliq', 'tata cliq',
      'shopsy', 'indiamart', 'ikea', 'pepperfry', 'urbanladder',
      'urban ladder', 'wakefit', 'sleepwell', 'nilkamal', 'shopclues',
      'firstshop', 'lulu', 'phoenix', 'inorbit', 'ambience', 'forum mall',
      'orion mall', 'nexus mall', 'elante', 'select citywalk', 'express avenue',
      'brookefield', 'marketcity', 'market city', 'city centre', 'city center',
      'shopping complex', 'shopping mall', 'departmental store', 'hypermarket',
      'lifestyle mall', 'mall of', 'gift shop',
    ],
    strict: ['amzn', 'mall', 'malls'],
  },
  {
    category: 'Home',
    tokens: [
      'urban company', 'urbanclap', 'housejoy', 'nobroker', 'no broker',
      'housekeeping', 'pest control', 'carpenter', 'plumber',
      'electrician', 'painter', 'hardware', 'sanitary', 'furniture',
      'interior', 'curtains', 'mattress', 'kitchenware', 'utensils',
      'cleaning service', 'water proofing',
    ],
    strict: ['maid'],
  },
  {
    category: 'Housing',
    tokens: [
      'rent payment', 'house rent', 'monthly rent', 'landlord',
      'maintenance charges', 'society maintenance', 'apartment', 'flat rent',
      'property tax', 'brokerage', 'residency', 'association fee',
      'builders', 'housing society',
    ],
    strict: ['rent'],
  },
  {
    // Last of the bill buckets: only claims what the specific ones didn't.
    category: 'Bill Pay',
    tokens: [
      'bharat billpay', 'billdesk', 'bill payment', 'bill paid',
      'utility bill', 'biller', 'autopay bill', 'municipal', 'corporation tax',
      'panchayat', 'subscription renewal',
    ],
    strict: ['bbps'],
  },
  {
    category: 'Alcohol',
    tokens: [
      'wine shop', 'wines', 'winery', 'liquor', 'brewery', 'brewhouse',
      'tasmac', 'living liquidz', 'beer cafe', 'bar and', 'pub and',
      'spirits', 'distillery', 'permit room',
    ],
    strict: ['bar', 'pub', 'beer', 'tasmac'],
  },
  {
    category: 'Donations',
    tokens: [
      'donation', 'donations', 'temple', 'devasthanam', 'devaswom', 'church',
      'mosque', 'dargah', 'gurudwara', 'trust fund', 'charitable', 'charity',
      'give india', 'giveindia', 'akshaya patra', 'goonj', 'relief fund',
      'hundi', 'seva trust',
    ],
    strict: ['ngo'],
  },
  {
    category: 'Gifts',
    tokens: [
      'gift card', 'giftcard', 'gift voucher', 'igp com', 'gift hamper',
      'gifting', 'archies', 'return gift',
    ],
  },
];

const INCOME_BUCKETS: Bucket[] = [
  {
    category: 'Salary',
    tokens: [
      'salary', 'sal credit', 'payroll', 'wages', 'monthly pay',
      'salary credited', 'sal cr', 'arrears', 'pension',
    ],
  },
  {
    category: 'Investments',
    tokens: [
      'dividend', 'interest credit', 'maturity', 'redemption',
      'mutual fund', 'zerodha', 'groww', 'upstox', 'angel one', 'angelone',
      'icici direct', 'kotak securities', 'fd closure', 'fd interest',
      'rd maturity', 'sip redemption', 'coin dcx', 'smallcase',
    ],
    strict: ['int cr', 'nsdl', 'cdsl', 'ppf', 'nps'],
  },
  // Refunds and reversals stay out: money back on a purchase isn't a reward,
  // and guessing wrong there quietly inflates income.
  {
    category: 'Cashback',
    tokens: ['cashback', 'cash back', 'reward points credited', 'cashback credited'],
  },
  { category: 'Bonus', tokens: ['bonus', 'incentive', 'reward payout', 'ex gratia'] },
  {
    category: 'Part-Time',
    tokens: ['freelance', 'consulting fee', 'stipend', 'commission', 'honorarium'],
  },
  { category: 'Gift', tokens: ['gift received', 'gift amount', 'shagun'] },
];

/** Every category this file can emit. A name not in the user's list is dead weight. */
export const GUESSABLE_CATEGORIES = {
  expense: EXPENSE_BUCKETS.map((b) => b.category),
  income: INCOME_BUCKETS.map((b) => b.category),
};

/** Below this length a token hides inside too many unrelated words to match loosely. */
const MIN_LOOSE_LEN = 5;

type Compiled = { loose: RegExp | null; strict: RegExp | null };
const cache = new Map<string, Compiled>();

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const glue = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function compile(bucket: Bucket): Compiled {
  const hit = cache.get(bucket.category);
  if (hit) return hit;

  const loose: string[] = [];
  const strict: string[] = [...(bucket.strict || [])];
  for (const raw of bucket.tokens) {
    const t = raw.trim();
    if (!t) continue;
    (glue(t).length >= MIN_LOOSE_LEN ? loose : strict).push(t);
  }

  const looseBody = loose.map((t) => esc(glue(t))).filter(Boolean).join('|');
  // Separators vary ("Swiggy*Instamart", "chai.point"), so allow any gap.
  const strictBody = strict
    .map((t) => esc(t.trim()).replace(/\\?\s+/g, '\\s*'))
    .filter(Boolean)
    .join('|');

  const out: Compiled = {
    loose: looseBody ? new RegExp(looseBody, 'i') : null,
    strict: strictBody
      ? new RegExp(`(?:^|[^a-z0-9])(?:${strictBody})(?:$|[^a-z0-9])`, 'i')
      : null,
  };
  cache.set(bucket.category, out);
  return out;
}

/**
 * Reference numbers, masked account numbers and balances are digits and filler
 * that only create false hits once matching is loose. "Airtel Payments Bank" is
 * the rail, not a recharge, so drop the whole phrase.
 */
function denoise(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(?:airtel|jio|paytm|fino|india\s*post|nsdl)\s+payments?\s+bank\b/gi, ' bank ')
    .replace(/\b(?:upi|imps|neft|rtgs)\s*(?:ref(?:erence)?)?\s*(?:no\.?|id)?\s*:?\s*\d{4,}/gi, ' ')
    .replace(/\bref(?:erence)?\s*(?:no\.?|id)?\s*:?\s*\d{4,}/gi, ' ')
    .replace(/\ba\/?c\s*(?:no\.?)?\s*[xX*\d]{3,}/gi, ' ')
    .replace(/\b(?:avl|avbl|available|closing)\s*(?:bal|balance)\b[^.\n]*/gi, ' ')
    .replace(/\b\d{9,}\b/g, ' ');
}

function haystacks(merchant: string, body: string): { glued: string; spaced: string } {
  const text = denoise(`${merchant} ${body}`).toLowerCase();
  return {
    glued: text.replace(/[^a-z0-9]+/g, ''),
    spaced: text.replace(/[^a-z0-9]+/g, ' '),
  };
}

export function guessImportCategory(
  kind: 'expense' | 'income',
  merchant: string,
  body: string,
): string | null {
  const { glued, spaced } = haystacks(merchant, body);
  if (!glued) return null;
  const buckets = kind === 'income' ? INCOME_BUCKETS : EXPENSE_BUCKETS;
  for (const bucket of buckets) {
    const { loose, strict } = compile(bucket);
    if (loose?.test(glued)) return bucket.category;
    if (strict?.test(spaced)) return bucket.category;
  }
  return null;
}
