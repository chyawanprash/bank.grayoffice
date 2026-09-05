/**
 * Seeded randomness + synthetic identifier/formatting helpers.
 * Every generator is driven off a single Rng so the same seed always
 * reproduces the same organization, documents, amounts and relationships.
 */

export class Rng {
	private state: number;

	constructor(seed: number) {
		this.state = seed >>> 0 || 1;
	}

	/** mulberry32 */
	next(): number {
		this.state |= 0;
		this.state = (this.state + 0x6d2b79f5) | 0;
		let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	int(min: number, max: number): number {
		return Math.floor(this.next() * (max - min + 1)) + min;
	}

	float(min: number, max: number, decimals = 2): number {
		const v = this.next() * (max - min) + min;
		return Number(v.toFixed(decimals));
	}

	bool(pTrue = 0.5): boolean {
		return this.next() < pTrue;
	}

	pick<T>(arr: readonly T[]): T {
		return arr[this.int(0, arr.length - 1)];
	}

	shuffle<T>(arr: T[]): T[] {
		const copy = [...arr];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = this.int(0, i);
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	}

	/** Derive an independent sub-seed for a named sub-stream (e.g. per document index). */
	fork(label: string): Rng {
		let h = this.state ^ 0x9e3779b9;
		for (let i = 0; i < label.length; i++) {
			h = Math.imul(h ^ label.charCodeAt(i), 0x85ebca6b);
		}
		return new Rng(h >>> 0);
	}
}

export function hashStringToSeed(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

// ---------------------------------------------------------------------------
// Name / address fakers (clearly synthetic — never real entities)
// ---------------------------------------------------------------------------

const IN_COMPANY_PREFIXES = ["Shree", "Sai", "Om", "Raghu", "Vijay", "Bharat", "Nova", "Prime", "Sun", "Metro"];
const IN_COMPANY_SUFFIXES = ["Traders", "Enterprises", "Industries", "Textiles", "Exports", "Solutions", "Technologies", "Logistics", "Foods", "Agro"];
const US_COMPANY_PREFIXES = ["Summit", "Northgate", "BlueRiver", "Cascade", "Ironwood", "Meridian", "Harborlight", "Redwood", "Sterling", "Vantage"];
const US_COMPANY_SUFFIXES = ["Supply Co.", "Industries", "Holdings", "Consulting Group", "Logistics", "Technologies", "Partners", "Manufacturing", "Ventures", "Solutions"];

// Real GST jurisdiction state codes (the first two digits of a GSTIN), per
// the CBIC state-code list - https://www.gst.gov.in - so synthetic GSTINs
// vary the way real ones do (e.g. 07... = Delhi, 06... = Haryana).
const IN_STATES: { name: string; code: string }[] = [
	{ name: "Jammu and Kashmir", code: "01" },
	{ name: "Himachal Pradesh", code: "02" },
	{ name: "Punjab", code: "03" },
	{ name: "Chandigarh", code: "04" },
	{ name: "Uttarakhand", code: "05" },
	{ name: "Haryana", code: "06" },
	{ name: "Delhi", code: "07" },
	{ name: "Rajasthan", code: "08" },
	{ name: "Uttar Pradesh", code: "09" },
	{ name: "Bihar", code: "10" },
	{ name: "Sikkim", code: "11" },
	{ name: "Arunachal Pradesh", code: "12" },
	{ name: "Nagaland", code: "13" },
	{ name: "Manipur", code: "14" },
	{ name: "Mizoram", code: "15" },
	{ name: "Tripura", code: "16" },
	{ name: "Meghalaya", code: "17" },
	{ name: "Assam", code: "18" },
	{ name: "West Bengal", code: "19" },
	{ name: "Jharkhand", code: "20" },
	{ name: "Odisha", code: "21" },
	{ name: "Chhattisgarh", code: "22" },
	{ name: "Madhya Pradesh", code: "23" },
	{ name: "Gujarat", code: "24" },
	{ name: "Dadra and Nagar Haveli and Daman and Diu", code: "26" },
	{ name: "Maharashtra", code: "27" },
	{ name: "Karnataka", code: "29" },
	{ name: "Goa", code: "30" },
	{ name: "Lakshadweep", code: "31" },
	{ name: "Kerala", code: "32" },
	{ name: "Tamil Nadu", code: "33" },
	{ name: "Puducherry", code: "34" },
	{ name: "Andaman and Nicobar Islands", code: "35" },
	{ name: "Telangana", code: "36" },
	{ name: "Andhra Pradesh", code: "37" },
	{ name: "Ladakh", code: "38" },
];

const US_STATES = ["CA", "NY", "TX", "IL", "WA", "GA", "MA", "CO", "NC", "FL"];

const FIRST_NAMES = ["Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Neha", "Arjun", "Kavya", "Jordan", "Casey", "Morgan", "Taylor", "Riley", "Sam", "Alex", "Jamie"];
const LAST_NAMES = ["Sharma", "Patel", "Iyer", "Reddy", "Nair", "Gupta", "Singh", "Rao", "Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Clark", "Lewis"];

export function synthPersonName(rng: Rng): string {
	return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

export function synthCompanyName(rng: Rng, jurisdiction: "IN" | "US"): string {
	if (jurisdiction === "IN") {
		return `${rng.pick(IN_COMPANY_PREFIXES)} ${rng.pick(IN_COMPANY_SUFFIXES)}`;
	}
	return `${rng.pick(US_COMPANY_PREFIXES)} ${rng.pick(US_COMPANY_SUFFIXES)}`;
}

export function synthAddress(rng: Rng, jurisdiction: "IN" | "US"): {
	address: string;
	city: string;
	state: string;
	state_code?: string;
	postal_code: string;
	country: string;
} {
	if (jurisdiction === "IN") {
		const state = rng.pick(IN_STATES);
		const cities: Record<string, string> = {
			"Jammu and Kashmir": "Srinagar",
			"Himachal Pradesh": "Shimla",
			Punjab: "Ludhiana",
			Chandigarh: "Chandigarh",
			Uttarakhand: "Dehradun",
			Haryana: "Gurugram",
			Delhi: "New Delhi",
			Rajasthan: "Jaipur",
			"Uttar Pradesh": "Noida",
			Bihar: "Patna",
			Sikkim: "Gangtok",
			"Arunachal Pradesh": "Itanagar",
			Nagaland: "Kohima",
			Manipur: "Imphal",
			Mizoram: "Aizawl",
			Tripura: "Agartala",
			Meghalaya: "Shillong",
			Assam: "Guwahati",
			"West Bengal": "Kolkata",
			Jharkhand: "Ranchi",
			Odisha: "Bhubaneswar",
			Chhattisgarh: "Raipur",
			"Madhya Pradesh": "Indore",
			Gujarat: "Ahmedabad",
			"Dadra and Nagar Haveli and Daman and Diu": "Daman",
			Maharashtra: "Pune",
			Karnataka: "Bengaluru",
			Goa: "Panaji",
			Lakshadweep: "Kavaratti",
			Kerala: "Kochi",
			"Tamil Nadu": "Chennai",
			Puducherry: "Puducherry",
			"Andaman and Nicobar Islands": "Port Blair",
			Telangana: "Hyderabad",
			"Andhra Pradesh": "Visakhapatnam",
			Ladakh: "Leh",
		};
		return {
			address: `Plot No. ${rng.int(1, 400)}, Industrial Estate Road ${rng.int(1, 20)}`,
			city: cities[state.name] ?? "Pune",
			state: state.name,
			state_code: state.code,
			postal_code: String(rng.int(110001, 743001)),
			country: "India",
		};
	}
	const state = rng.pick(US_STATES);
	const cities: Record<string, string> = {
		CA: "San Jose", NY: "Albany", TX: "Austin", IL: "Springfield", WA: "Tacoma",
		GA: "Savannah", MA: "Worcester", CO: "Boulder", NC: "Raleigh", FL: "Orlando",
	};
	return {
		address: `${rng.int(100, 9999)} ${rng.pick(["Main St", "Industrial Pkwy", "Commerce Dr", "Market Ave", "Harbor Blvd"])}`,
		city: cities[state] ?? "Austin",
		state,
		postal_code: String(rng.int(10000, 99999)),
		country: "United States",
	};
}

/** Synthetic GSTIN-shaped identifier. Never a real, allocable GSTIN. */
export function synthGstin(rng: Rng, stateCode: string): string {
	const pan = synthPan(rng);
	const entityCode = rng.int(1, 9);
	return `${stateCode}${pan}${entityCode}Z${rng.pick(["A", "B", "C", "D", "E"])}`;
}

export function synthPan(rng: Rng): string {
	const letters = () =>
		Array.from({ length: 5 }, () => String.fromCharCode(65 + rng.int(0, 25))).join("");
	return `${letters().slice(0, 3)}${rng.pick(["P", "C", "H", "F"])}${letters().slice(0, 1)}${rng.int(1000, 9999)}${rng.pick(["A", "B", "C", "D", "E"])}`;
}

/** Synthetic EIN-shaped identifier (##-#######), never a real assigned EIN. */
export function synthEin(rng: Rng): string {
	return `${rng.int(10, 99)}-${rng.int(1000000, 9999999)}`;
}

export function synthIfsc(rng: Rng, bankCode: string): string {
	return `${bankCode}0${String(rng.int(100000, 999999)).slice(1)}`;
}

export function synthAccountNumber(rng: Rng, length = 12): string {
	return Array.from({ length }, () => rng.int(0, 9)).join("");
}

export function maskAccountNumber(acct: string): string {
	return `XXXX${acct.slice(-4)}`;
}

export function synthEmail(name: string, domain: string): string {
	return `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${domain}`;
}

export function synthPhone(rng: Rng, jurisdiction: "IN" | "US"): string {
	if (jurisdiction === "IN") return `+91 ${rng.int(70000, 99999)}${rng.int(10000, 99999)}`;
	return `+1 ${rng.int(200, 999)}-${rng.int(200, 999)}-${rng.int(1000, 9999)}`;
}

export function synthDomain(company: string): string {
	return `${company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example.com`;
}

// ---------------------------------------------------------------------------
// Document numbers / dates / money
// ---------------------------------------------------------------------------

export function docNumber(prefix: string, rng: Rng, width = 5): string {
	return `${prefix}-${String(rng.int(1, 10 ** width - 1)).padStart(width, "0")}`;
}

export function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
	const copy = new Date(d);
	copy.setUTCDate(copy.getUTCDate() + days);
	return copy;
}

export function randomRecentDate(rng: Rng, withinDays = 60): Date {
	const now = new Date();
	return addDays(now, -rng.int(0, withinDays));
}

export function round2(n: number): number {
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n: number): string {
	if (n < 20) return ONES[n];
	return `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}

function threeDigitWords(n: number): string {
	const h = Math.floor(n / 100);
	const rest = n % 100;
	return `${h ? ONES[h] + " Hundred " : ""}${twoDigitWords(rest)}`.trim();
}

/** Indian numbering system (crore/lakh/thousand) amount-in-words. */
export function amountInWordsIN(amount: number, currency = "Rupees"): string {
	const whole = Math.floor(amount);
	const paise = Math.round((amount - whole) * 100);
	let n = whole;
	const crore = Math.floor(n / 10000000);
	n %= 10000000;
	const lakh = Math.floor(n / 100000);
	n %= 100000;
	const thousand = Math.floor(n / 1000);
	n %= 1000;
	const hundred = n;
	const parts: string[] = [];
	if (crore) parts.push(`${threeDigitWords(crore)} Crore`);
	if (lakh) parts.push(`${threeDigitWords(lakh)} Lakh`);
	if (thousand) parts.push(`${threeDigitWords(thousand)} Thousand`);
	if (hundred) parts.push(threeDigitWords(hundred));
	const words = parts.length ? parts.join(" ") : "Zero";
	const paiseWords = paise ? ` and ${twoDigitWords(paise)} Paise` : "";
	return `${currency} ${words} Only${paiseWords}`.replace(/\s+/g, " ").trim();
}

/** US-style (thousand/million) amount-in-words. */
export function amountInWordsUS(amount: number, currency = "Dollars"): string {
	const whole = Math.floor(amount);
	const cents = Math.round((amount - whole) * 100);
	let n = whole;
	const million = Math.floor(n / 1000000);
	n %= 1000000;
	const thousand = Math.floor(n / 1000);
	n %= 1000;
	const hundred = n;
	const parts: string[] = [];
	if (million) parts.push(`${threeDigitWords(million)} Million`);
	if (thousand) parts.push(`${threeDigitWords(thousand)} Thousand`);
	if (hundred) parts.push(threeDigitWords(hundred));
	const words = parts.length ? parts.join(" ") : "Zero";
	const centsWords = cents ? ` and ${twoDigitWords(cents)}/100` : "";
	return `${words} ${currency}${centsWords}`.replace(/\s+/g, " ").trim();
}

export function formatCurrency(amount: number, jurisdiction: "IN" | "US"): string {
	if (jurisdiction === "IN") {
		return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}
	return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(d: string, jurisdiction: "IN" | "US"): string {
	const date = new Date(d);
	if (jurisdiction === "IN") {
		return date.toLocaleDateString("en-GB"); // DD/MM/YYYY
	}
	return date.toLocaleDateString("en-US"); // MM/DD/YYYY
}
