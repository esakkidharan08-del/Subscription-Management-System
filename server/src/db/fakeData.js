// Deterministic fake data for the large seed. A fixed seed means every run
// produces the same people and amounts, so demo timings stay comparable.

export function createRandom(seed = 20261031) {
  let state = seed >>> 0;
  // mulberry32: tiny, fast and good enough for sample data.
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability,
    // Picks by weight, e.g. weighted([['upi', 5], ['cash', 1]]).
    weighted(pairs) {
      const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of pairs) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return pairs[pairs.length - 1][0];
    },
  };
}

const FIRST_NAMES = [
  'Aarav',
  'Aditi',
  'Akash',
  'Ananya',
  'Arjun',
  'Bhavna',
  'Chetan',
  'Deepa',
  'Dev',
  'Divya',
  'Farhan',
  'Gauri',
  'Harish',
  'Isha',
  'Jai',
  'Kavya',
  'Karthik',
  'Lakshmi',
  'Manoj',
  'Meera',
  'Naveen',
  'Neha',
  'Nikhil',
  'Pooja',
  'Pranav',
  'Priya',
  'Rahul',
  'Ramya',
  'Rohan',
  'Sanjana',
  'Sanjay',
  'Shreya',
  'Siddharth',
  'Sneha',
  'Suresh',
  'Tanvi',
  'Tarun',
  'Uma',
  'Varun',
  'Vidya',
  'Vikram',
  'Yamini',
  'Zoya',
  'Abdul',
  'Fatima',
  'Joseph',
  'Mary',
  'Gurpreet',
  'Harpreet',
  'Tenzin',
];

const LAST_NAMES = [
  'Sharma',
  'Iyer',
  'Reddy',
  'Nair',
  'Patel',
  'Gupta',
  'Menon',
  'Rao',
  'Kumar',
  'Singh',
  'Pillai',
  'Das',
  'Banerjee',
  'Mukherjee',
  'Joshi',
  'Kulkarni',
  'Desai',
  'Chopra',
  'Mehta',
  'Bose',
  'Krishnan',
  'Subramanian',
  'Naidu',
  'Shetty',
  'Varma',
  'Khan',
  'Fernandes',
  'DSouza',
  'Gill',
  'Bhat',
];

const COMPANY_WORDS = [
  'Nova',
  'Bright',
  'Lotus',
  'Peak',
  'Silverline',
  'Indigo',
  'Harbor',
  'Summit',
  'Vertex',
  'Cedar',
  'Saffron',
  'Orbit',
  'Maple',
  'Granite',
  'Monsoon',
  'Coral',
  'Falcon',
  'Banyan',
  'Pixel',
  'River',
];

const COMPANY_SUFFIXES = [
  'Traders',
  'Solutions',
  'Foods',
  'Logistics',
  'Clinic',
  'Studios',
  'Labs',
  'Retail',
  'Exports',
  'Academy',
];

const PAYMENT_NOTES = [
  'Paid via net banking',
  'UPI ref noted on receipt',
  'Cheque cleared',
  'Paid at branch counter',
  'Card payment, auto-debit',
  'Settled after reminder call',
];

// Emails use example.com, which is reserved for documentation and never delivers.
export function fakeCustomer(random, index) {
  const first = random.pick(FIRST_NAMES);
  const last = random.pick(LAST_NAMES);
  const company = `${random.pick(COMPANY_WORDS)} ${random.pick(COMPANY_SUFFIXES)}`;
  const name = random.chance(0.35) ? `${first} ${last} (${company})` : `${first} ${last}`;
  const email = `${first}.${last}${index}@example.com`.toLowerCase();
  return { name, email };
}

export function fakePaymentNote(random) {
  return random.chance(0.3) ? random.pick(PAYMENT_NOTES) : null;
}
