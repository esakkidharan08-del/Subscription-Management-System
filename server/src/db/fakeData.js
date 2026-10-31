// Deterministic sample data for the large seed. A fixed seed gives the same
// people and amounts every run, so demo timings stay comparable.

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
    // weighted([['upi', 5], ['cash', 1]]) picks by weight.
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

// First and last names are drawn from the same community, so a Tamil first
// name gets a Tamil surname. The weights lean south, where the demo is set.
const NAME_GROUPS = [
  {
    weight: 45,
    first: [
      'Arun',
      'Karthikeyan',
      'Senthil',
      'Vignesh',
      'Saravanan',
      'Dhanush',
      'Prakash',
      'Gokul',
      'Bala',
      'Muthu',
      'Ashwin',
      'Sriram',
      'Lakshmi',
      'Meenakshi',
      'Revathi',
      'Divya',
      'Kavitha',
      'Anitha',
      'Sangeetha',
      'Nandhini',
      'Keerthana',
      'Harini',
      'Janani',
      'Gayathri',
      'Pavithra',
    ],
    last: [
      'Iyer',
      'Subramaniam',
      'Raman',
      'Murugan',
      'Krishnan',
      'Natarajan',
      'Venkatesan',
      'Rajendran',
      'Sundaram',
      'Balasubramanian',
      'Chandrasekar',
      'Ganesan',
      'Kannan',
      'Selvam',
    ],
  },
  {
    weight: 20,
    first: [
      'Naveen',
      'Ganesh',
      'Rajesh',
      'Suresh',
      'Hari',
      'Ramesh',
      'Swathi',
      'Sowmya',
      'Deepa',
      'Priya',
      'Anil',
      'Sunitha',
    ],
    last: ['Reddy', 'Naidu', 'Rao', 'Menon', 'Nair', 'Shetty', 'Hegde', 'Pillai', 'Kamath'],
  },
  {
    weight: 20,
    first: [
      'Rahul',
      'Amit',
      'Vikram',
      'Rohan',
      'Aditya',
      'Siddharth',
      'Neha',
      'Pooja',
      'Ananya',
      'Shreya',
      'Kunal',
      'Ritu',
    ],
    last: [
      'Sharma',
      'Gupta',
      'Patel',
      'Mehta',
      'Joshi',
      'Kulkarni',
      'Agarwal',
      'Verma',
      'Banerjee',
      'Das',
    ],
  },
  {
    weight: 7,
    first: ['Farhan', 'Imran', 'Ayesha', 'Fatima', 'Salman', 'Nasreen'],
    last: ['Khan', 'Sheikh', 'Ansari', 'Syed', 'Basha'],
  },
  {
    weight: 5,
    first: ['Joseph', 'Thomas', 'Mary', 'Anto', 'Jenifer', 'Stephen'],
    last: ['Fernandes', 'Thomas', 'DSouza', 'Joseph', 'Xavier'],
  },
  {
    weight: 3,
    first: ['Gurpreet', 'Harpreet', 'Manjeet', 'Simran'],
    last: ['Singh', 'Kaur', 'Gill', 'Sandhu'],
  },
];

const COMPANY_FIRST = [
  'Sri Lakshmi',
  'Murugan',
  'Kaveri',
  'Annapoorna',
  'Tamarai',
  'Velan',
  'Ganga',
  'Sakthi',
  'Thendral',
  'Kovai',
  'Madurai',
  'Marina',
  'Nilgiri',
  'Pearl',
  'Sunrise',
  'Greenfield',
  'Bluewave',
  'Silverline',
  'Lotus',
  'Banyan',
  'Peacock',
  'Royal',
  'Metro',
  'Coastal',
];

const COMPANY_TRADE = [
  'Textiles',
  'Traders',
  'Agencies',
  'Enterprises',
  'Medicals',
  'Hardwares',
  'Foods',
  'Logistics',
  'Motors',
  'Electricals',
  'Constructions',
  'Clinic',
  'Academy',
  'Tech Solutions',
  'Printers',
  'Jewellers',
  'Bakery',
  'Hospitals',
  'Exports',
  'Software',
];

const COMPANY_SUFFIX = ['Pvt Ltd', 'Pvt Ltd', 'LLP', '& Co', '', ''];

// Notes match how the money came in, the way a clerk would write them.
const PAYMENT_NOTES = {
  upi: ['UPI ref on receipt', 'Paid by GPay', 'PhonePe, ref noted'],
  bank_transfer: ['NEFT received', 'RTGS received', 'IMPS from current account'],
  card: ['Card auto-debit', 'Paid by card online'],
  cash: ['Paid at branch counter', 'Cash, receipt issued'],
};

// Only reserved domains (RFC 2606): example.com, .net, .org and the .example
// TLD. None of these can ever deliver mail to a real person.
const PERSONAL_DOMAINS = ['example.com', 'example.net', 'example.org'];

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

function personalEmail(random, first, last) {
  const f = slug(first);
  const l = slug(last);
  const year = random.int(70, 99);
  const pattern = random.weighted([
    [`${f}.${l}`, 5],
    [`${f}${l}`, 3],
    [`${f}.${l}${year}`, 3],
    [`${f[0]}${l}`, 2],
    [`${f}${random.int(1, 999)}`, 2],
    [`${l}.${f}`, 1],
    [`${f}_${l[0]}`, 1],
  ]);
  return `${pattern}@${random.pick(PERSONAL_DOMAINS)}`;
}

function companyEmail(random, company) {
  const box = random.weighted([
    ['accounts', 5],
    ['billing', 3],
    ['finance', 2],
    ['admin', 2],
    ['info', 1],
  ]);
  // The first word of the business and its trade, as a small firm would register it.
  const [name, trade] = company.split(' ');
  return `${box}@${slug(name)}${slug(trade ?? '')}.example`;
}

// About a third of customers are businesses, the rest named individuals.
export function fakeCustomer(random, takenEmails) {
  let name;
  let email;
  if (random.chance(0.35)) {
    const suffix = random.pick(COMPANY_SUFFIX);
    const base = `${random.pick(COMPANY_FIRST)} ${random.pick(COMPANY_TRADE)}`;
    name = suffix ? `${base} ${suffix}` : base;
    email = companyEmail(random, base.replace(/^Sri /, 'Sri'));
  } else {
    const group = random.weighted(NAME_GROUPS.map((g) => [g, g.weight]));
    const first = random.pick(group.first);
    const last = random.pick(group.last);
    name = `${first} ${last}`;
    email = personalEmail(random, first, last);
  }

  // Two people with the same name pick a number, the way a mail provider would ask them to.
  let candidate = email;
  for (let n = 2; takenEmails.has(candidate); n++) {
    candidate = email.replace('@', n < 10 ? `${n}@` : `.${n}@`);
  }
  takenEmails.add(candidate);
  return { name, email: candidate };
}

export function fakePaymentNote(random, method) {
  if (!random.chance(0.3)) return null;
  // A late payer's note is about the chase, whatever the method.
  if (random.chance(0.15)) return 'Paid after reminder call';
  return random.pick(PAYMENT_NOTES[method] ?? PAYMENT_NOTES.upi);
}
