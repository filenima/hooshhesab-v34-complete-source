/**
 * automl.ts — Automated Machine Learning Pipeline برای هوش
 * انتخاب خودکار feature، مدل، و hyperparameter با cross-validation
 */

export interface DatasetRow {
 features: Record<string, number>;
 label: number;
}

export interface Feature {
 name: string;
 values: number[];
 mean: number;
 std: number;
 min: number;
 max: number;
 missingCount: number;
 importance?: number;
 selected: boolean;
}

export interface ModelCandidate {
 name: string;
 type: 'linear' | 'logistic' | 'ridge' | 'random_forest' | 'gradient_boost' | 'knn' | 'naive_bayes';
 hyperparameters: Record<string, unknown>;
 cvScore: number;
 cvStd: number;
 trainTimeMs: number;
 predictTimeMs: number;
 selected: boolean;
}

export interface AutoMLResult {
 features: Feature[];
 selectedFeatures: string[];
 candidates: ModelCandidate[];
 bestModel: ModelCandidate;
 metrics: {
 taskType: 'regression' | 'classification';
 accuracy?: number;
 mse?: number;
 rmse?: number;
 mae?: number;
 r2?: number;
 };
 durationMs: number;
 iterations: number;
}

// ---------- preprocessing ----------
export function analyzeFeatures(data: DatasetRow[]): Feature[] {
 if (data.length === 0) return [];
 const featureNames = Object.keys(data[0].features);
 return featureNames.map(name => {
 const values = data.map(r => r.features[name]).filter(v => v!== null && v!== undefined &&!isNaN(v));
 const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
 const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length);
 const std = Math.sqrt(variance);
 return {
 name,
 values,
 mean,
 std,
 min: Math.min(...values),
 max: Math.max(...values),
 missingCount: data.length - values.length,
 selected: true,
 };
 });
}

// ---------- feature selection ----------
export function selectFeatures(features: Feature[], labels: number[], method: 'correlation' | 'variance' | 'mutual_info' = 'correlation'): string[] {
 const selected: string[] = [];
 for (const f of features) {
 if (method === 'variance') {
 if (f.std > 0.01) selected.push(f.name);
 } else if (method === 'correlation') {
 // محاسبه‌ی همبستگی Pearson بین feature و label
 const correlation = pearsonCorrelation(f.values, labels.slice(0, f.values.length));
 if (Math.abs(correlation) > 0.05) {
 selected.push(f.name);
 f.importance = Math.abs(correlation);
 }
 } else if (method === 'mutual_info') {
 // تقریب ساده: information gain
 const ig = approximateMutualInfo(f.values, labels.slice(0, f.values.length));
 if (ig > 0.001) {
 selected.push(f.name);
 f.importance = ig;
 }
 }
 }
 // اگر هیچ featureای انتخاب نشد، همه را برگردان
 return selected.length > 0? selected: features.map(f => f.name);
}

function pearsonCorrelation(x: number[], y: number[]): number {
 const n = Math.min(x.length, y.length);
 if (n === 0) return 0;
 const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
 const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
 let num = 0, dx = 0, dy = 0;
 for (let i = 0; i < n; i++) {
 num += (x[i] - mx) * (y[i] - my);
 dx += (x[i] - mx) ** 2;
 dy += (y[i] - my) ** 2;
 }
 const denom = Math.sqrt(dx * dy);
 return denom > 0? num / denom: 0;
}

function approximateMutualInfo(x: number[], y: number[]): number {
 // تقریب ساده با binning
 const n = Math.min(x.length, y.length);
 if (n === 0) return 0;
 const xBins = 5, yBins = 2;
 const xMin = Math.min(...x), xMax = Math.max(...x);
 const xRange = xMax - xMin || 1;
 const yMean = y.reduce((s, v) => s + v, 0) / n;
 const counts: number[][] = Array.from({ length: xBins }, () => Array(yBins).fill(0));
 for (let i = 0; i < n; i++) {
 const xb = Math.min(xBins - 1, Math.floor((x[i] - xMin) / xRange * xBins));
 const yb = y[i] > yMean? 1: 0;
 counts[xb][yb]++;
 }
 let mi = 0;
 for (let xb = 0; xb < xBins; xb++) {
 for (let yb = 0; yb < yBins; yb++) {
 const pxy = counts[xb][yb] / n;
 if (pxy === 0) continue;
 const px = counts[xb].reduce((s, v) => s + v, 0) / n;
 const py = counts.map(row => row[yb]).reduce((s, v) => s + v, 0) / n;
 mi += pxy * Math.log2(pxy / (px * py));
 }
 }
 return Math.max(0, mi);
}

// ---------- مدل‌ها ----------
function linearRegression(X: number[][], y: number[]): { weights: number[]; bias: number } {
 const n = X.length;
 const k = X[0]?.length || 0;
 // استانداردسازی features برای پایداری عددی gradient descent
 // (جلوگیری از NaN هنگام مقیاس بزرگ داده‌های حسابداری)
 const colMean: number[] = [];
 const colStd: number[] = [];
 for (let j = 0; j < k; j++) {
 const col = X.map(row => row[j] || 0);
 const m = col.reduce((s, v) => s + v, 0) / n;
 const s = Math.sqrt(col.reduce((acc, v) => acc + (v - m) ** 2, 0) / n) || 1;
 colMean.push(m);
 colStd.push(s);
 }
 const Xn = X.map(row => row.map((x, j) => (x - colMean[j]) / colStd[j]));
 const yMean = y.reduce((s, v) => s + v, 0) / n;
 const yn = y.map(v => v - yMean);
 // gradient descent ساده
 const weights = new Array(k).fill(0);
 let bias = 0;
 const lr = 0.01;
 const iterations = 500;
 for (let iter = 0; iter < iterations; iter++) {
 const grads = new Array(k).fill(0);
 let gradBias = 0;
 for (let i = 0; i < n; i++) {
 const pred = Xn[i].reduce((s, x, j) => s + x * weights[j], 0) + bias;
 const error = pred - yn[i];
 for (let j = 0; j < k; j++) grads[j] += error * Xn[i][j];
 gradBias += error;
 }
 for (let j = 0; j < k; j++) weights[j] -= lr * grads[j] / n;
 bias -= lr * gradBias / n;
 // gradient clipping برای جلوگیری از divergence
 if (!isFinite(weights[0]) ||!isFinite(bias)) {
 for (let j = 0; j < k; j++) weights[j] = isFinite(weights[j])? weights[j]: 0;
 bias = isFinite(bias)? bias: 0;
 break;
 }
 }
 // بازگرداندن weights به مقیاس اصلی (تا predict با X خام کار کند)
 const realWeights = weights.map((w, j) => w / colStd[j]);
 const realBias = bias + yMean - realWeights.reduce((s, w, j) => s + w * colMean[j], 0);
 return { weights: realWeights, bias: realBias };
}

function predictLinear(model: { weights: number[]; bias: number }, X: number[][]): number[] {
 return X.map(row => row.reduce((s, x, j) => s + x * model.weights[j], 0) + model.bias);
}

function knnPredict(XTrain: number[][], yTrain: number[], X: number[][], k = 5): number[] {
 return X.map(x => {
 const distances = XTrain.map((xt, i) => ({ dist: Math.sqrt(xt.reduce((s, v, j) => s + (v - x[j]) ** 2, 0)), label: yTrain[i] }));
 distances.sort((a, b) => a.dist - b.dist);
 const knn = distances.slice(0, Math.min(k, distances.length));
 const mean = knn.reduce((s, n) => s + n.label, 0) / knn.length;
 return mean;
 });
}

function decisionTreePredict(XTrain: number[][], yTrain: number[], X: number[][], maxDepth = 5): number[] {
 // درخت تصمیم ساده
 const tree = buildTree(XTrain, yTrain, maxDepth);
 return X.map(x => predictTree(tree, x));
}

interface TreeNode {
 feature?: number;
 threshold?: number;
 left?: TreeNode;
 right?: TreeNode;
 value?: number;
}

function buildTree(X: number[][], y: number[], depth: number): TreeNode {
 if (depth === 0 || X.length < 5) {
 return { value: y.reduce((s, v) => s + v, 0) / Math.max(1, y.length) };
 }
 // یافتن بهترین split
 let bestFeature = 0, bestThreshold = 0, bestGain = 0;
 const k = X[0].length;
 for (let f = 0; f < k; f++) {
 const values = X.map(row => row[f]).sort((a, b) => a - b);
 for (let i = 0; i < values.length - 1; i++) {
 const threshold = (values[i] + values[i + 1]) / 2;
 const leftIdx = X.map((row, idx) => row[f] <= threshold? idx: -1).filter(i => i >= 0);
 const rightIdx = X.map((row, idx) => row[f] > threshold? idx: -1).filter(i => i >= 0);
 if (leftIdx.length === 0 || rightIdx.length === 0) continue;
 const gain = varianceReduction(y, leftIdx.map(i => y[i]), rightIdx.map(i => y[i]));
 if (gain > bestGain) {
 bestGain = gain; bestFeature = f; bestThreshold = threshold;
 }
 }
 }
 if (bestGain === 0) return { value: y.reduce((s, v) => s + v, 0) / y.length };
 const leftIdx = X.map((row, idx) => row[bestFeature] <= bestThreshold? idx: -1).filter(i => i >= 0);
 const rightIdx = X.map((row, idx) => row[bestFeature] > bestThreshold? idx: -1).filter(i => i >= 0);
 return {
 feature: bestFeature,
 threshold: bestThreshold,
 left: buildTree(leftIdx.map(i => X[i]), leftIdx.map(i => y[i]), depth - 1),
 right: buildTree(rightIdx.map(i => X[i]), rightIdx.map(i => y[i]), depth - 1),
 };
}

function varianceReduction(parent: number[], left: number[], right: number[]): number {
 const vp = variance(parent);
 const vl = variance(left);
 const vr = variance(right);
 return vp - (left.length / parent.length) * vl - (right.length / parent.length) * vr;
}

function variance(arr: number[]): number {
 const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
 return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

function predictTree(node: TreeNode, x: number[]): number {
 if (node.value!== undefined) return node.value;
 if (node.feature!== undefined && node.threshold!== undefined) {
 if (x[node.feature] <= node.threshold) return predictTree(node.left!, x);
 return predictTree(node.right!, x);
 }
 return 0;
}

// ---------- cross-validation ----------
function crossValidate(
 X: number[][],
 y: number[],
 modelFn: (X: number[][], y: number[]) => (x: number[]) => number,
 folds = 5
): { mean: number; std: number } {
 const n = X.length;
 const foldSize = Math.floor(n / folds);
 const scores: number[] = [];
 for (let f = 0; f < folds; f++) {
 const start = f * foldSize;
 const end = start + foldSize;
 const XTrain = [...X.slice(0, start),...X.slice(end)];
 const yTrain = [...y.slice(0, start),...y.slice(end)];
 const XTest = X.slice(start, end);
 const yTest = y.slice(start, end);
 const model = modelFn(XTrain, yTrain);
 const preds = XTest.map(model);
 const mse = preds.reduce((s, p, i) => s + (p - yTest[i]) ** 2, 0) / preds.length;
 scores.push(Math.sqrt(mse));
 }
 const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
 const std = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);
 return { mean, std };
}

// ---------- AutoML اصلی ----------
export function runAutoML(data: DatasetRow[], options?: { taskType?: 'regression' | 'classification'; maxIterations?: number }): AutoMLResult {
 const startTime = Date.now();
 const taskType = options?.taskType || 'regression';
 const labels = data.map(d => d.label);
 // 1. تحلیل features
 const features = analyzeFeatures(data);
 // 2. feature selection
 const selectedFeatureNames = selectFeatures(features, labels, 'correlation');
 // 3. ساخت ماتریس X با features انتخاب‌شده
 const X = data.map(d => selectedFeatureNames.map(fn => d.features[fn] || 0));
 // 4. ارزیابی مدل‌های مختلف
 const candidates: ModelCandidate[] = [];
 // Linear Regression
 const linearResult = crossValidate(X, labels, (Xt, yt) => {
 const m = linearRegression(Xt, yt);
 return (x: number[]) => x.reduce((s, v, j) => s + v * m.weights[j], 0) + m.bias;
 });
 candidates.push({
 name: 'Linear Regression',
 type: 'linear',
 hyperparameters: { learningRate: 0.01, iterations: 500 },
 cvScore: linearResult.mean,
 cvStd: linearResult.std,
 trainTimeMs: 0,
 predictTimeMs: 0,
 selected: false,
 });
 // KNN
 const knnResult = crossValidate(X, labels, (Xt, yt) => (x: number[]) => knnPredict(Xt, yt, [x], 5)[0]);
 candidates.push({
 name: 'KNN (k=5)',
 type: 'knn',
 hyperparameters: { k: 5 },
 cvScore: knnResult.mean,
 cvStd: knnResult.std,
 trainTimeMs: 0,
 predictTimeMs: 0,
 selected: false,
 });
 // Decision Tree
 const treeResult = crossValidate(X, labels, (Xt, yt) => (x: number[]) => decisionTreePredict(Xt, yt, [x], 5)[0]);
 candidates.push({
 name: 'Decision Tree (depth=5)',
 type: 'random_forest',
 hyperparameters: { maxDepth: 5 },
 cvScore: treeResult.mean,
 cvStd: treeResult.std,
 trainTimeMs: 0,
 predictTimeMs: 0,
 selected: false,
 });
 // انتخاب بهترین مدل (کمترین RMSE) — NaNها به انتقال داده می‌شوند تا انتخاب نادرست نشود
 candidates.sort((a, b) => {
 if (isNaN(a.cvScore) && isNaN(b.cvScore)) return 0;
 if (isNaN(a.cvScore)) return 1;
 if (isNaN(b.cvScore)) return -1;
 return a.cvScore - b.cvScore;
 });
 const bestModel = {...candidates[0], selected: true };
 candidates[0].selected = true;
 // محاسبه‌ی metrics نهایی
 const bestModelFn = bestModel.type === 'linear'
? (Xt: number[][], yt: number[]) => { const m = linearRegression(Xt, yt); return (x: number[]) => x.reduce((s, v, j) => s + v * m.weights[j], 0) + m.bias; }
: bestModel.type === 'knn'
? (Xt: number[][], yt: number[]) => (x: number[]) => knnPredict(Xt, yt, [x], 5)[0]
: (Xt: number[][], yt: number[]) => (x: number[]) => decisionTreePredict(Xt, yt, [x], 5)[0];
 const model = bestModelFn(X, labels);
 const preds = X.map(model);
 const mse = preds.reduce((s, p, i) => s + (p - labels[i]) ** 2, 0) / preds.length;
 const rmse = Math.sqrt(mse);
 const mae = preds.reduce((s, p, i) => s + Math.abs(p - labels[i]), 0) / preds.length;
 const yMean = labels.reduce((s, v) => s + v, 0) / labels.length;
 const ssTot = labels.reduce((s, v) => s + (v - yMean) ** 2, 0);
 const ssRes = preds.reduce((s, p, i) => s + (p - labels[i]) ** 2, 0);
 const r2 = ssTot > 0? 1 - ssRes / ssTot: 0;
 return {
 features,
 selectedFeatures: selectedFeatureNames,
 candidates,
 bestModel,
 metrics: { taskType, mse, rmse, mae, r2 },
 durationMs: Date.now() - startTime,
 iterations: candidates.length,
 };
}

// ---------- تولید داده‌ی نمونه ----------
export function generateSampleDataset(n = 100): DatasetRow[] {
 return Array.from({ length: n }, () => {
 const revenue = 100_000_000 + Math.random() * 2_000_000_000;
 const invoices = Math.round(5 + Math.random() * 50);
 const tenure = Math.round(1 + Math.random() * 36);
 const supportTickets = Math.round(Math.random() * 20);
 // LTV = f(revenue, invoices, tenure) - supportTickets
 const label = Math.round(revenue * 0.8 + invoices * 10_000_000 + tenure * 5_000_000 - supportTickets * 2_000_000);
 return {
 features: { revenue, invoices, tenure, supportTickets },
 label,
 };
 });
}
