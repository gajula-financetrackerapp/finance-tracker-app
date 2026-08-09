/**
 * Guess a spending category from the merchant name in an SMS.
 *
 * Bank/UPI rules can't carry a category (an HDFC debit could be anything), so
 * without this every imported row lands in "Others". Names here must match
 * DEFAULT_EXPENSE_CATS / DEFAULT_INCOME_CATS exactly, otherwise the picker on
 * the import row has nothing to select.
 */

type Bucket = { category: string; tokens: string[] };

/** Ordered: the first bucket that matches wins, so keep specific above generic. */
const EXPENSE_BUCKETS: Bucket[] = [
  {
    // Above Food so "swiggy instamart" doesn't read as a restaurant order.
    category: 'Groceries',
    tokens: [
      'instamart', 'blinkit', 'zepto', 'bigbasket', 'big basket', 'bbdaily',
      'dmart', 'd mart', 'avenue supermart', 'jiomart', 'jio mart', 'grofers',
      'reliance fresh', 'reliance smart', 'spencers', 'nature basket',
      'star bazaar', 'milkbasket', 'country delight', 'licious', 'freshtohome',
      'fresh to home', 'supermarket', 'super market', 'kirana', 'provision store',
    ],
  },
  {
    category: 'Food',
    tokens: [
      'swiggy', 'zomato', 'eatsure', 'faasos', 'behrouz', 'ovenstory', 'box8',
      'eatfit', 'dominos', 'domino s', 'pizza hut', 'mcdonald', 'mcdonalds',
      'burger king', 'kfc', 'subway', 'starbucks', 'chaayos', 'chai point',
      'third wave', 'blue tokai', 'cafe coffee day', 'ccd', 'dunkin', 'wow momo',
      'haldiram', 'barbeque nation', 'bbq nation', 'restaurant', 'biryani',
      'bakery', 'hotel food', 'dineout', 'eazydiner',
    ],
  },
  {
    category: 'Health',
    tokens: [
      'pharmeasy', 'netmeds', 'tata 1mg', '1mg', 'medplus', 'apollo pharmacy',
      'apollo hospital', 'apollo 24', 'wellness forever', 'practo', 'pharmacy',
      'medical store', 'hospital', 'clinic', 'diagnostics', 'diagnostic',
      'pathology', 'lal path', 'thyrocare', 'metropolis', 'redcliffe',
      'dr lal', 'healthians',
    ],
  },
  {
    category: 'Entertainment',
    tokens: [
      'netflix', 'hotstar', 'disney', 'prime video', 'primevideo', 'sonyliv',
      'sony liv', 'zee5', 'jiocinema', 'jio cinema', 'jiohotstar', 'aha video',
      'spotify', 'gaana', 'wynk', 'audible', 'bookmyshow', 'book my show',
      'district', 'pvr', 'inox', 'cinepolis', 'cinema', 'multiplex',
      'playstation', 'steam games', 'xbox', 'nintendo', 'google play',
    ],
  },
  {
    category: 'Phone',
    tokens: [
      'airtel', 'jio recharge', 'reliance jio', 'vodafone', 'vodafone idea',
      'bsnl', 'mtnl', 'act fibernet', 'act broadband', 'hathway', 'tikona',
      'excitel', 'mobile recharge', 'prepaid recharge', 'postpaid bill',
      'dth recharge', 'tata play', 'tatasky', 'tata sky',
    ],
  },
  {
    category: 'Travel',
    tokens: [
      'makemytrip', 'make my trip', 'goibibo', 'cleartrip', 'ixigo', 'yatra',
      'easemytrip', 'ease my trip', 'happyeasygo', 'booking com', 'agoda',
      'airbnb', 'oyo', 'treebo', 'fabhotels', 'indigo', '6e air', 'air india',
      'vistara', 'spicejet', 'akasa', 'goair', 'airlines', 'airways',
      'irctc', 'railway', 'redbus', 'red bus', 'abhibus',
    ],
  },
  {
    category: 'Transportation',
    tokens: [
      'uber', 'ola cabs', 'olacabs', 'ola money', 'rapido', 'blusmart',
      'namma yatri', 'meru', 'yulu', 'bounce', 'vogo', 'quick ride',
      'metro rail', 'dmrc', 'bmrcl', 'bmtc', 'msrtc', 'ksrtc', 'tsrtc', 'apsrtc',
      'onecard metro', 'toll plaza',
    ],
  },
  {
    category: 'Car',
    tokens: [
      'petrol', 'petroleum', 'fuel', 'filling station', 'hpcl', 'bpcl', 'iocl',
      'indian oil', 'indianoil', 'bharat petroleum', 'hindustan petroleum',
      'shell india', 'nayara', 'reliance petro', 'fastag', 'parking',
      'car service', 'servicing', 'gomechanic', 'go mechanic', 'carwale',
      'cardekho', 'spinny', 'cars24',
    ],
  },
  {
    category: 'Education',
    tokens: [
      'byju', 'unacademy', 'vedantu', 'physics wallah', 'pw skills', 'upgrad',
      'udemy', 'coursera', 'simplilearn', 'great learning', 'scaler',
      'whitehat', 'cuemath', 'toppr', 'school fee', 'college fee', 'tuition',
      'tution', 'university', 'exam fee', 'admission fee', 'coaching',
    ],
  },
  {
    category: 'Kids',
    tokens: ['firstcry', 'first cry', 'hopscotch', 'babyhug', 'mothercare', 'toys r us'],
  },
  {
    category: 'Pets',
    tokens: ['supertails', 'heads up for tails', 'petsy', 'zigly', 'veterinary', 'pet clinic'],
  },
  {
    category: 'Sports',
    tokens: [
      'decathlon', 'cult fit', 'cultfit', 'cure fit', 'curefit', 'gym',
      'fitness first', 'anytime fitness', 'gold s gym', 'sports club',
    ],
  },
  {
    category: 'Beauty',
    tokens: [
      'nykaa', 'purplle', 'mamaearth', 'sugar cosmetics', 'salon', 'spa',
      'lakme', 'naturals', 'looks salon', 'barber',
    ],
  },
  {
    category: 'Electronics',
    tokens: [
      'croma', 'reliance digital', 'vijay sales', 'sangeetha mobiles',
      'poorvika', 'apple store', 'samsung shop', 'oneplus', 'boat lifestyle',
    ],
  },
  {
    category: 'Clothing',
    tokens: [
      'myntra', 'ajio', 'pantaloons', 'westside', 'lifestyle stores', 'max fashion',
      'zudio', 'trends', 'zara', 'h and m', 'uniqlo', 'levis', 'bata', 'metro shoes',
    ],
  },
  {
    // Generic marketplaces last: they sell everything, so only claim what's left.
    category: 'Shopping',
    tokens: [
      'amazon', 'amzn', 'flipkart', 'meesho', 'snapdeal', 'tatacliq', 'tata cliq',
      'shopsy', 'jiomart shop', 'indiamart', 'ikea', 'pepperfry', 'urbanladder',
      'urban ladder', 'wakefit', 'sleepwell', 'nilkamal',
    ],
  },
  {
    category: 'Home',
    tokens: [
      'urban company', 'urbanclap', 'housejoy', 'nobroker', 'no broker',
      'maid', 'housekeeping', 'pest control', 'carpenter', 'plumber',
      'electrician', 'painter',
    ],
  },
  {
    category: 'Housing',
    tokens: [
      'rent payment', 'house rent', 'monthly rent', 'landlord', 'maintenance charges',
      'society maintenance', 'apartment', 'flat rent', 'electricity bill',
      'bescom', 'tneb', 'tangedco', 'msedcl', 'adani electricity', 'tata power',
      'torrent power', 'kseb', 'wbsedcl', 'uppcl', 'jbvnl', 'water bill',
      'gas bill', 'indane', 'hp gas', 'bharat gas', 'gail gas', 'mahanagar gas',
      'piped gas',
    ],
  },
  {
    category: 'Alcohol',
    tokens: ['wine shop', 'liquor', 'brewery', 'brewhouse', 'tasmac', 'living liquidz'],
  },
  {
    category: 'Donations',
    tokens: ['donation', 'temple', 'trust fund', 'ngo', 'give india', 'giveindia'],
  },
  {
    category: 'Gifts',
    tokens: ['gift card', 'giftcard', 'ferns n petals', 'fnp', 'igp com'],
  },
];

const INCOME_BUCKETS: Bucket[] = [
  {
    category: 'Salary',
    tokens: ['salary', 'sal cr', 'sal credit', 'payroll', 'wages', 'monthly pay'],
  },
  {
    category: 'Investments',
    tokens: [
      'dividend', 'interest credit', 'int cr', 'maturity', 'redemption',
      'mutual fund', 'zerodha', 'groww', 'upstox', 'angel one', 'angelone',
      'icici direct', 'kotak securities', 'nsdl', 'cdsl', 'fd closure',
    ],
  },
  { category: 'Bonus', tokens: ['bonus', 'incentive', 'reward payout', 'cashback credit'] },
  { category: 'Part-Time', tokens: ['freelance', 'consulting fee', 'stipend', 'commission'] },
  { category: 'Gift', tokens: ['gift received', 'gift amount'] },
];

const cache = new Map<string, RegExp>();

/** Word-bounded so "ola" can't fire on "chocolate". */
function bucketRegex(bucket: Bucket): RegExp {
  const hit = cache.get(bucket.category);
  if (hit) return hit;
  const body = bucket.tokens
    .map((t) => t.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s.]*'))
    .filter(Boolean)
    .join('|');
  const re = new RegExp(`(?:^|[^a-z0-9])(?:${body})(?:$|[^a-z0-9])`, 'i');
  cache.set(bucket.category, re);
  return re;
}

/** Punctuation between words hides tokens like "Swiggy*Instamart", so flatten it. */
function haystack(merchant: string, body: string): string {
  return `${merchant} ${body}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function guessImportCategory(
  kind: 'expense' | 'income',
  merchant: string,
  body: string,
): string | null {
  const text = haystack(merchant, body);
  if (!text.trim()) return null;
  const buckets = kind === 'income' ? INCOME_BUCKETS : EXPENSE_BUCKETS;
  for (const bucket of buckets) {
    if (bucketRegex(bucket).test(text)) return bucket.category;
  }
  return null;
}
