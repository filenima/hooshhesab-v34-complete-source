// ============ Password Policy ============
// سیاست رمز عبور قابل‌پیکربندی + ارزیابی قدرت رمز

export interface PasswordPolicy {
 minLength: number;
 requireUppercase: boolean;
 requireLowercase: boolean;
 requireNumbers: boolean;
 requireSpecialChars: boolean;
}

export const DEFAULT_POLICY: PasswordPolicy = {
 minLength: 8,
 requireUppercase: true,
 requireLowercase: true,
 requireNumbers: true,
 requireSpecialChars: false,
};

// اعتبارسنجی رمز عبور بر اساس سیاست
// بازگشت: { valid, errors } با پیام‌های فارسی
export function validatePassword(
 password: string,
 policy: PasswordPolicy = DEFAULT_POLICY
): { valid: boolean; errors: string[] } {
 const errors: string[] = [];

 if (!password || password.length < policy.minLength) {
 errors.push(`رمز عبور باید حداقل ${policy.minLength} کاراکتر باشد`);
 }

 if (policy.requireUppercase &&!/[A-Z]/.test(password)) {
 errors.push("رمز عبور باید حداقل یک حرف بزرگ انگلیسی داشته باشد");
 }
 if (policy.requireLowercase &&!/[a-z]/.test(password)) {
 errors.push("رمز عبور باید حداقل یک حرف کوچک انگلیسی داشته باشد");
 }
 if (policy.requireNumbers &&!/[0-9]/.test(password)) {
 errors.push("رمز عبور باید حداقل یک عدد داشته باشد");
 }
 if (policy.requireSpecialChars &&!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
 errors.push("رمز عبور باید حداقل یک کاراکتر خاص (!@#$%^&*) داشته باشد");
 }

 // بررسی الگوهای رایج ضعیف
 if (password.length >= 4) {
 const weak = ["1234", "abcd", "password", "qwerty", "asdf", "1111", "0000"];
 const lower = password.toLowerCase();
 if (weak.some((w) => lower.includes(w))) {
 errors.push("رمز عبور شامل الگوی رایج و ضعیف است");
 }
 }

 return {
 valid: errors.length === 0,
 errors,
 };
}

// ارزیابی قدرت رمز عبور — score 0 تا 4
// بازگشت: { score, label, color, percent }
export function passwordStrength(
 password: string
): { score: number; label: string; color: string; percent: number } {
 if (!password) {
 return {
 score: 0,
 label: "خالی",
 color: "bg-muted",
 percent: 0,
 };
 }

 let score = 0;

 // طول
 if (password.length >= 8) score++;
 if (password.length >= 12) score++;
 if (password.length >= 16) score++;

 // تنوع کاراکترها
 const hasLower = /[a-z]/.test(password);
 const hasUpper = /[A-Z]/.test(password);
 const hasNumber = /[0-9]/.test(password);
 const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

 const varietyCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(
 Boolean
 ).length;
 if (varietyCount >= 3) score++;
 if (varietyCount === 4) score++;

 // تنوع بالا + طول خوب = قوی‌تر
 if (password.length >= 10 && varietyCount >= 3) score = Math.max(score, 3);
 if (password.length >= 14 && varietyCount === 4) score = Math.max(score, 4);

 // الگوهای ضعیف
 const weak = ["1234", "abcd", "password", "qwerty"];
 if (weak.some((w) => password.toLowerCase().includes(w))) {
 score = Math.min(score, 1);
 }

 // تکرار کاراکتر
 if (/(.)\1{3,}/.test(password)) {
 score = Math.min(score, 2);
 }

 // محدود به 0-4
 score = Math.max(0, Math.min(4, score));

 const labels = ["بسیار ضعیف", "ضعیف", "متوسط", "قوی", "بسیار قوی"];
 const colors = [
 "bg-red-500",
 "bg-red-400",
 "bg-amber-500",
 "bg-emerald-500",
 "bg-emerald-600",
 ];
 const percents = [10, 25, 50, 75, 100];

 return {
 score,
 label: labels[score],
 color: colors[score],
 percent: percents[score],
 };
}

// تولید پیشنهاد رمز عبور قوی
export function generateStrongPassword(length: number = 16): string {
 const lower = "abcdefghijkmnpqrstuvwxyz";
 const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
 const digits = "23456789";
 const special = "!@#$%^&*-_=+?";
 const all = lower + upper + digits + special;

 const arr = [
 lower[Math.floor(Math.random() * lower.length)],
 upper[Math.floor(Math.random() * upper.length)],
 digits[Math.floor(Math.random() * digits.length)],
 special[Math.floor(Math.random() * special.length)],
 ];

 for (let i = 4; i < length; i++) {
 arr.push(all[Math.floor(Math.random() * all.length)]);
 }

 // shuffle
 for (let i = arr.length - 1; i > 0; i--) {
 const j = Math.floor(Math.random() * (i + 1));
 [arr[i], arr[j]] = [arr[j], arr[i]];
 }

 return arr.join("");
}
