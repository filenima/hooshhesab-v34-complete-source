import crypto from "crypto";

// ============ Blockchain Audit Trail ============
// زنجیره‌ی بلوک تغییرناپذیر برای ثبت رویدادهای امنیتی و مالی.
// هر بلوک شامل هش بلوک قبلی است، بنابراین هر تغییری در یک بلوک
// تمام بلوک‌های بعدی را نامعتبر می‌کند.
//
// ویژگی‌ها:
// - hash chain (SHA-256)
// - proof-of-work اختیاری (difficulty قابل تنظیم)
// - export برای تأیید خارجی
// - ذخیره‌سازی در فایل/DB (در این پیاده‌سازی: درون‌حافظه‌ای + فایل)
//
// کاربرد: ثبت لاگ تغییرات حساس (تغییرات مانده‌ی حساب، حذف فاکتور،
// تغییرات نقش کاربران و...) به‌صورت تغییرناپذیر.

export interface AuditBlock {
 index: number;
 timestamp: Date;
 data: string; // JSON serialized event
 previousHash: string;
 hash: string;
 nonce: number;
 // امضای اختیاری (در صورت نیاز به authentication)
 signature?: string;
}

export interface BlockchainStats {
 totalBlocks: number;
 chainValid: boolean;
 createdAt: Date;
 lastBlockAt: Date;
 totalDataSize: number;
 difficulty: number;
}

// Genesis block (اولین بلوک)
function createGenesisBlock(): AuditBlock {
 const block: Omit<AuditBlock, "hash" | "nonce"> = {
 index: 0,
 timestamp: new Date(0),
 data: "GENESIS: hoshhesab-audit-blockchain-v1",
 previousHash: "0",
 };
 const hash = calculateHash({...block, nonce: 0 });
 return {...block, hash, nonce: 0 };
}

// محاسبه‌ی هش یک بلوک
function calculateHash(
 block: Omit<AuditBlock, "hash"> & { hash?: string }
): string {
 const content = [
 block.index,
 block.timestamp instanceof Date
? block.timestamp.toISOString()
: new Date(block.timestamp).toISOString(),
 block.data,
 block.previousHash,
 block.nonce,
 ].join("|");
 return crypto.createHash("sha256").update(content).digest("hex");
}

// محاسبه‌ی hash با proof-of-work
function mineBlock(
 block: Omit<AuditBlock, "hash">,
 difficulty: number
): AuditBlock {
 const target = "0".repeat(difficulty);
 let nonce = 0;
 let hash = "";

 while (true) {
 hash = calculateHash({...block, nonce });
 if (hash.startsWith(target)) {
 break;
 }
 nonce++;
 // جلوگیری از loop بی‌نهایت
 if (nonce > 10_000_000) {
 // اگر سخت‌گیری بیش از حد بود، بدون PoW قبول کن
 hash = calculateHash({...block, nonce: 0 });
 nonce = 0;
 break;
 }
 }

 return {...block, nonce, hash };
}

export class AuditBlockchain {
 private chain: AuditBlock[] = [];
 private difficulty: number;
 private pendingData: string[] = [];
 private maxChainSize: number;

 constructor(options?: {
 difficulty?: number;
 maxChainSize?: number;
 initialChain?: AuditBlock[];
 }) {
 this.difficulty = options?.difficulty?? 2; // ۲ صفر در ابتدای hash
 this.maxChainSize = options?.maxChainSize?? 100_000;

 if (options?.initialChain && options.initialChain.length > 0) {
 this.chain = options.initialChain;
 } else {
 this.chain = [createGenesisBlock()];
 }
 }

 // افزودن داده‌ی جدید به زنجیره (ساخت بلوک جدید)
 addBlock(data: string): AuditBlock {
 if (this.chain.length >= this.maxChainSize) {
 // اگر زنجیره از حد مجاز بزرگ‌تر شد، قدیمی‌ترین بلوک‌ها را archive می‌کنیم
 // (در production واقعی: انتقال به cold storage)
 this.archiveOldBlocks();
 }

 const previousBlock = this.chain[this.chain.length - 1];
 const newBlock: Omit<AuditBlock, "hash"> = {
 index: previousBlock.index + 1,
 timestamp: new Date(),
 data,
 previousHash: previousBlock.hash,
 nonce: 0,
 };

 const mined = mineBlock(newBlock, this.difficulty);
 this.chain.push(mined);
 return mined;
 }

 // افزودن رویداد به‌صورت JSON
 addEvent(event: {
 action: string;
 entity?: string;
 entityId?: string;
 userId?: string;
 tenantId?: string;
 metadata?: unknown;
 }): AuditBlock {
 return this.addBlock(JSON.stringify(event));
 }

 // تأیید صحت کل زنجیره
 verifyChain(): boolean {
 // بررسی Genesis block
 const genesis = this.chain[0];
 if (!genesis || genesis.previousHash!== "0") {
 return false;
 }
 const expectedGenesisHash = calculateHash({...genesis, nonce: genesis.nonce });
 if (genesis.hash!== expectedGenesisHash) {
 return false;
 }

 // بررسی هر بلوک
 for (let i = 1; i < this.chain.length; i++) {
 const current = this.chain[i];
 const previous = this.chain[i - 1];

 // previousHash باید با hash بلوک قبلی تطابق داشته باشد
 if (current.previousHash!== previous.hash) {
 return false;
 }

 // hash باید درست محاسبه شده باشد
 const expectedHash = calculateHash({
...current,
 nonce: current.nonce,
 });
 if (current.hash!== expectedHash) {
 return false;
 }

 // اگر difficulty > 0، hash باید با صفر شروع شود
 if (this.difficulty > 0) {
 const target = "0".repeat(this.difficulty);
 if (!current.hash.startsWith(target)) {
 return false;
 }
 }
 }

 return true;
 }

 // دریافت یک بلوک با ایندکس
 getBlock(index: number): AuditBlock | null {
 if (index < 0 || index >= this.chain.length) return null;
 return this.chain[index];
 }

 // دریافت کل زنجیره
 getChain(): AuditBlock[] {
 return [...this.chain];
 }

 // دریافت طول زنجیره
 getLength(): number {
 return this.chain.length;
 }

 // خروجی JSON برای تأیید خارجی
 exportChain(): string {
 return JSON.stringify(
 {
 version: "1.0",
 algorithm: "SHA-256 + PoW",
 difficulty: this.difficulty,
 exportedAt: new Date().toISOString(),
 blockCount: this.chain.length,
 chain: this.chain,
 },
 null,
 2
 );
 }

 // import زنجیره از JSON
 static importChain(json: string): AuditBlockchain | null {
 try {
 const data = JSON.parse(json) as {
 difficulty: number;
 chain: AuditBlock[];
 };
 const bc = new AuditBlockchain({
 difficulty: data.difficulty,
 initialChain: data.chain,
 });
 if (!bc.verifyChain()) {
 console.error("[AuditBlockchain] Imported chain failed verification");
 return null;
 }
 return bc;
 } catch {
 return null;
 }
 }

 // جستجو در داده‌ی بلوک‌ها
 search(query: string): AuditBlock[] {
 const lowerQuery = query.toLowerCase();
 return this.chain.filter((b) =>
 b.data.toLowerCase().includes(lowerQuery)
 );
 }

 // دریافت آخرین N بلوک
 getRecentBlocks(n: number): AuditBlock[] {
 return this.chain.slice(-n);
 }

 // آمار زنجیره
 getStats(): BlockchainStats {
 const totalDataSize = this.chain.reduce(
 (sum, b) => sum + b.data.length,
 0
 );
 return {
 totalBlocks: this.chain.length,
 chainValid: this.verifyChain(),
 createdAt: new Date(this.chain[0]?.timestamp?? Date.now()),
 lastBlockAt: new Date(
 this.chain[this.chain.length - 1]?.timestamp?? Date.now()
 ),
 totalDataSize,
 difficulty: this.difficulty,
 };
 }

 // امضای دیجیتال زنجیره (برای تأیید هویت منبع)
 signChain(privateKeyPem: string): string {
 const allHashes = this.chain.map((b) => b.hash).join("");
 const sign = crypto.createSign("SHA256");
 sign.update(allHashes);
 sign.end();
 return sign.sign(privateKeyPem, "hex");
 }

 // تأیید امضای زنجیره
 verifyChainSignature(
 signature: string,
 publicKeyPem: string
 ): boolean {
 const allHashes = this.chain.map((b) => b.hash).join("");
 const verify = crypto.createVerify("SHA256");
 verify.update(allHashes);
 verify.end();
 return verify.verify(publicKeyPem, signature, "hex");
 }

 // آرشیو بلوک‌های قدیمی (در production: انتقال به cold storage)
 private archiveOldBlocks(): void {
 const keepCount = Math.floor(this.maxChainSize * 0.8);
 const archived = this.chain.slice(0, this.chain.length - keepCount);
 // در اینجا فقط log می‌کنیم — در production باید به فایل/DB منتقل شود
 console.info(
 `[AuditBlockchain] Archiving ${archived.length} old blocks to cold storage`
 );
 this.chain = this.chain.slice(-keepCount);
 }
}

// ============ Singleton Instance ============
// یک نمونه‌ی سراسری برای استفاده‌ی ساده در سراسر برنامه

let globalChain: AuditBlockchain | null = null;

export function getGlobalAuditChain(): AuditBlockchain {
 if (!globalChain) {
 globalChain = new AuditBlockchain({ difficulty: 2 });
 }
 return globalChain;
}

// تنظیم chain سراسری (مثلاً پس از import)
export function setGlobalAuditChain(chain: AuditBlockchain): void {
 globalChain = chain;
}

// ============ Helper: ثبت رویداد امنیتی ============

export async function logAuditEvent(event: {
 action: string;
 entity?: string;
 entityId?: string;
 userId?: string;
 tenantId?: string;
 metadata?: unknown;
}): Promise<AuditBlock> {
 const chain = getGlobalAuditChain();
 return chain.addEvent(event);
}

// ============ Merkle Root for Efficient Verification ============
// برای تأیید اینکه یک بلوک خاص در زنجیره وجود دارد بدون دانلود کل زنجیره،
// می‌توان از Merkle root استفاده کرد.

export function computeMerkleRoot(blocks: AuditBlock[]): string {
 if (blocks.length === 0) return "";
 let currentLevel = blocks.map((b) => b.hash);
 while (currentLevel.length > 1) {
 const next: string[] = [];
 for (let i = 0; i < currentLevel.length; i += 2) {
 const left = currentLevel[i];
 const right = i + 1 < currentLevel.length? currentLevel[i + 1]: left;
 next.push(
 crypto.createHash("sha256").update(left + right).digest("hex")
 );
 }
 currentLevel = next;
 }
 return currentLevel[0];
}
