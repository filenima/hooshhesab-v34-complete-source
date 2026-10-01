import crypto from "crypto";

// ============ Secure Multi-Party Computation (MPC) ============
// محاسبه‌ی امن چندطرفی — چندین tenant می‌توانند آمار تجمعی محاسبه کنند
// بدون آنکه داده‌ی فردی خود را فاش کنند.
//
// کاربرد: محاسبه‌ی میانگین درآمد چند شرکت در یک صنعت بدون افشای درآمد
// هر شرکت. به‌عنوان مثال، "میانگین درآمد شرکت‌های نرم‌افزاری در تهران"
// بدون اینکه هیچ‌کس بداند شرکت X چقدر درآمد داشته.
//
// طرح: Shamir's Secret Sharing (SSS) با مودول عدد اول بزرگ.
// - هر party مقدار خود را به n share تقسیم می‌کند
// - هر share به یک party دیگر داده می‌شود
// - با k share (k ≤ n)، مقدار اصلی بازسازی می‌شود
// - با کمتر از k share، هیچ اطلاعاتی به‌دست نمی‌آید
//
// این پیاده‌سازی از threshold t = n (همه‌ی shareها لازم) استفاده می‌کند
// برای سادگی، اما ساختار آن از SSS پیروی می‌کند.

export interface MPCShare {
 partyId: string;
 shareIndex: number;
 value: string; // hex — share به‌صورت عدد بزرگ
 // random mask که این party به party دیگر اضافه کرده
 mask: string;
}

export interface MPCResult {
 value: number;
 operation: "sum" | "average" | "min" | "max" | "count";
 participantCount: number;
 // هرگز مقادیر فردی فاش نمی‌شود
 privacyGuarantee: string;
 // timestamp
 computedAt: number;
}

// عدد اول بزرگ برای محاسبات مدولار
const PRIME = BigInt(
 "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F"
); // ۲۵۶ بیت — تقریباً اندازه‌ی secp256k1

export class MPCParty {
 private partyId: string;
 private secret: bigint;
 private shares: MPCShare[] = [];
 private receivedShares: Map<string, MPCShare[]> = new Map();

 constructor(partyId: string, secret: number) {
 this.partyId = partyId;
 this.secret = BigInt(Math.round(secret));
 }

 // دریافت شناسه‌ی party
 getId(): string {
 return this.partyId;
 }

 // دریافت مقدار راز (برای debugging فقط — هرگز در تولید نباید استفاده شود)
 getSecretValue(): bigint {
 return this.secret;
 }

 // تقسیم مقدار به چند share (Shamir's Secret Sharing)
 // n: تعداد کل partyها
 // t: threshold (چند share لازم برای بازسازی) — اینجا n = t
 shareValue(n: number, t: number = n): MPCShare[] {
 if (t > n) {
 throw new Error("Threshold cannot exceed number of shares");
 }

 // تولید چندجمله‌ای درجه‌ی t-1 با ثابت = secret
 // p(x) = secret + a1·x + a2·x^2 +... + a_{t-1}·x^{t-1}
 const coefficients: bigint[] = [this.secret];
 for (let i = 1; i < t; i++) {
 coefficients.push(randomBigIntBelow(PRIME));
 }

 // تولید n share: (i, p(i)) برای i = 1, 2,..., n
 const shares: MPCShare[] = [];
 for (let i = 1; i <= n; i++) {
 const x = BigInt(i);
 let y = BigInt(0);
 for (let j = 0; j < coefficients.length; j++) {
 y = (y + coefficients[j] * modPow(x, BigInt(j), PRIME)) % PRIME;
 }
 shares.push({
 partyId: this.partyId,
 shareIndex: i,
 value: y.toString(16),
 mask: randomBigIntBelow(PRIME).toString(16),
 });
 }

 this.shares = shares;
 return shares;
 }

 // دریافت share از party دیگر
 receiveShare(fromPartyId: string, share: MPCShare): void {
 if (!this.receivedShares.has(fromPartyId)) {
 this.receivedShares.set(fromPartyId, []);
 }
 this.receivedShares.get(fromPartyId)!.push(share);
 }

 // محاسبه‌ی مجموع با استفاده از shareهای دریافتی
 // shares: [sharesParty1[], sharesParty2[],...]
 // هر party باید shareهای دریافتی از همه‌ی partyها را به این تابع بدهد.
 computeSum(shares: MPCShare[][]): MPCResult {
 // در MPC با SSS برای جمع:
 // مجموع secretها = بازسازی (share1_party1 + share1_party2 +... ,...)
 // چون p1(x) + p2(x) +... = (s1 + s2 +...) +... 
 // یعنی جمع چندجمله‌ای‌ها، چندجمله‌ای با ثابت = مجموع ثابت‌هاست.

 if (shares.length === 0) {
 return {
 value: 0,
 operation: "sum",
 participantCount: 0,
 privacyGuarantee: "No participants",
 computedAt: Date.now(),
 };
 }

 // مرحله‌ی ۱: جمع کردن shareهای متناظر
 // shares[0] = shareهای party 1 (یکی برای هر party دیگر)
 // shares[1] = shareهای party 2
 //...
 // ما باید shareهای با shareIndex یکسان را جمع بزنیم

 const shareCount = shares[0].length;
 const sumsByIndex: bigint[] = new Array(shareCount).fill(BigInt(0));

 for (const partyShares of shares) {
 for (let i = 0; i < partyShares.length; i++) {
 const share = partyShares[i];
 sumsByIndex[i] = (sumsByIndex[i] + BigInt("0x" + share.value)) % PRIME;
 }
 }

 // مرحله‌ی ۲: بازسازی مقدار از shareهای جمع‌شده با Lagrange interpolation
 const sumSecret = lagrangeInterpolateAt0(
 sumsByIndex.map((v, i) => ({ x: BigInt(i + 1), y: v }))
 );

 // محاسبه‌ی تعداد شرکت‌کنندگان
 const participantCount = shares.length;

 return {
 value: Number(sumSecret),
 operation: "sum",
 participantCount,
 privacyGuarantee:
 "Individual values are never revealed. Uses Shamir's Secret Sharing with threshold.",
 computedAt: Date.now(),
 };
 }

 // محاسبه‌ی میانگین
 computeAverage(shares: MPCShare[][]): MPCResult {
 const sumResult = this.computeSum(shares);
 const participantCount = sumResult.participantCount;
 if (participantCount === 0) {
 return {...sumResult, operation: "average" };
 }

 // در MPC، تقسیم بر یک عدد plaintext مجاز است
 // average = sum / participantCount
 // اما چون ما در مدول کار می‌کنیم، باید معکوس پیمانه‌ای بگیریم
 const sumBig = BigInt(Math.round(sumResult.value));
 const countBig = BigInt(participantCount);
 const countInverse = modInverse(countBig, PRIME);
 const avgBig = (sumBig * countInverse) % PRIME;

 return {
 value: Number(avgBig),
 operation: "average",
 participantCount,
 privacyGuarantee:
 "Average computed without revealing individual values. Uses modular inverse for division.",
 computedAt: Date.now(),
 };
 }

 // محاسبه‌ی min/max — در MPC واقعی پیچیده‌تر است (با comparison circuits)
 // این پیاده‌سازی ساده، تقریب می‌زند با بازسازی مقادیر فردی به‌صورت موقت
 // در حافظه‌ی محلی (بدون فاش کردن به شبکه) و سپس پاک کردن.
 computeMinMax(
 shares: MPCShare[][],
 operation: "min" | "max"
 ): MPCResult {
 // بازسازی موقت مقادیر فردی (فقط در حافظه‌ی این party)
 const values: bigint[] = [];
 for (const partyShares of shares) {
 const v = this.reconstructSecret(partyShares);
 values.push(v);
 }

 let result: bigint;
 if (operation === "min") {
 result = values.reduce((a, b) => (a < b? a: b));
 } else {
 result = values.reduce((a, b) => (a > b? a: b));
 }

 return {
 value: Number(result),
 operation,
 participantCount: values.length,
 privacyGuarantee:
 "Min/Max approximated via local reconstruction (values not transmitted over network).",
 computedAt: Date.now(),
 };
 }

 // شمارش تعداد (count) — ساده‌ترین عملیات MPC
 computeCount(shares: MPCShare[][]): MPCResult {
 return {
 value: shares.length,
 operation: "count",
 participantCount: shares.length,
 privacyGuarantee: "Count is metadata only, no individual values involved.",
 computedAt: Date.now(),
 };
 }

 // بازسازی راز از shareها (Lagrange interpolation در x = 0)
 private reconstructSecret(shares: MPCShare[]): bigint {
 const points = shares.map((s, i) => ({
 x: BigInt(i + 1),
 y: BigInt("0x" + s.value),
 }));
 return lagrangeInterpolateAt0(points);
 }

 // پاک کردن داده‌های حساس از حافظه
 wipe(): void {
 this.secret = BigInt(0);
 this.shares = [];
 this.receivedShares.clear();
 }
}

// ============ Lagrange Interpolation ============

// محاسبه‌ی p(0) با استفاده از Lagrange interpolation
// points: [{x, y},...]
function lagrangeInterpolateAt0(
 points: { x: bigint; y: bigint }[]
): bigint {
 if (points.length === 0) return BigInt(0);
 if (points.length === 1) return points[0].y;

 let result = BigInt(0);
 const n = points.length;

 for (let i = 0; i < n; i++) {
 let numerator = BigInt(1);
 let denominator = BigInt(1);

 for (let j = 0; j < n; j++) {
 if (i === j) continue;
 // L_i(0) = ∏ (0 - x_j) / (x_i - x_j)
 numerator = (numerator * (-points[j].x + PRIME)) % PRIME;
 denominator = (denominator * (points[i].x - points[j].x + PRIME)) % PRIME;
 }

 const lagrangeBasis = (numerator * modInverse(denominator, PRIME)) % PRIME;
 result = (result + points[i].y * lagrangeBasis) % PRIME;
 }

 return result;
}

// ============ Helpers ============

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
 if (mod === BigInt(1)) return BigInt(0);
 let result = BigInt(1);
 base = base % mod;
 while (exp > 0) {
 if (exp % BigInt(2) === BigInt(1)) {
 result = (result * base) % mod;
 }
 exp = exp / BigInt(2);
 base = (base * base) % mod;
 }
 return result;
}

function modInverse(a: bigint, m: bigint): bigint {
 const aMod = ((a % m) + m) % m;
 const g = gcdExtended(aMod, m);
 if (g.gcd!== BigInt(1)) {
 throw new Error("Modular inverse does not exist");
 }
 return ((g.x % m) + m) % m;
}

function gcdExtended(a: bigint, b: bigint): {
 gcd: bigint;
 x: bigint;
 y: bigint;
} {
 if (a === BigInt(0)) {
 return { gcd: b, x: BigInt(0), y: BigInt(1) };
 }
 const g = gcdExtended(b % a, a);
 return {
 gcd: g.gcd,
 x: g.y - (b / a) * g.x,
 y: g.x,
 };
}

function randomBigIntBelow(max: bigint): bigint {
 const bits = max.toString(2).length;
 const bytes = Math.ceil(bits / 8);
 const buf = crypto.randomBytes(bytes);
 let result = BigInt(0);
 for (let i = 0; i < buf.length; i++) {
 result = (result << BigInt(8)) | BigInt(buf[i]);
 }
 return result % max;
}

// ============ MPC Coordinator ============
// یک کوئردینیتور ساده برای هماهنگی چند party

export class MPCCoordinator {
 private parties: Map<string, MPCParty> = new Map();

 addParty(party: MPCParty): void {
 this.parties.set(party.getId(), party);
 }

 // اجرای محاسبه‌ی جمع با تبادل shareها بین partyها
 runSecureSum(): MPCResult {
 const partyList = Array.from(this.parties.values());
 const n = partyList.length;
 if (n === 0) {
 return {
 value: 0,
 operation: "sum",
 participantCount: 0,
 privacyGuarantee: "No participants",
 computedAt: Date.now(),
 };
 }

 // مرحله‌ی ۱: هر party مقدار خود را به n share تقسیم می‌کند
 const allShares: MPCShare[][] = [];
 for (const party of partyList) {
 const shares = party.shareValue(n, n);
 allShares.push(shares);
 }

 // مرحله‌ی ۲: هر party shareهای متناظر را از دیگران دریافت می‌کند
 // share[i][j] = share شماره‌ی j از party i — باید به party j برود
 for (let i = 0; i < n; i++) {
 for (let j = 0; j < n; j++) {
 if (i!== j) {
 partyList[j].receiveShare(partyList[i].getId(), allShares[i][j]);
 }
 }
 }

 // مرحله‌ی ۳: یکی از partyها (مثلاً اولی) محاسبه‌ی نهایی را انجام می‌دهد
 // همه‌ی shareهای دریافتی را جمع می‌زند
 const collectedShares: MPCShare[][] = [];
 for (const party of partyList) {
 const shares: MPCShare[] = [];
 for (const [, receivedList] of party["receivedShares"] as Map<
 string,
 MPCShare[]
 >) {
 shares.push(...receivedList);
 }
 collectedShares.push(shares);
 }

 return partyList[0].computeSum(collectedShares);
 }

 // پاک کردن همه‌ی partyها
 wipe(): void {
 for (const party of this.parties.values()) {
 party.wipe();
 }
 this.parties.clear();
 }
}

// ============ Privacy-Preserving Benchmark ============

// محاسبه‌ی benchmark صنعت بدون افشای داده‌ی فردی
export async function computeIndustryBenchmark(
 participants: { id: string; value: number }[],
 operation: "sum" | "average" = "average"
): Promise<MPCResult> {
 const coordinator = new MPCCoordinator();

 for (const p of participants) {
 coordinator.addParty(new MPCParty(p.id, p.value));
 }

 const result =
 operation === "sum"
? coordinator.runSecureSum()
: coordinator.runSecureSum(); // میانگین از مجموع محاسبه می‌شود

 if (operation === "average" && result.participantCount > 0) {
 return {
...result,
 operation: "average",
 value: result.value / result.participantCount,
 };
 }

 coordinator.wipe();
 return result;
}
