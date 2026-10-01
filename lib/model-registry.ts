/**
 * model-registry.ts — ML Model Registry برای هوش
 * نسخه‌بندی، tracking، و deployment مدل‌های ML
 */

export type ModelStatus = 'registered' | 'staging' | 'production' | 'archived' | 'deprecated';

export interface ModelVersion {
 version: string;
 status: ModelStatus;
 // artifact
 artifactUri?: string; // مسیر فایل مدل
 modelType: string; // sklearn.linear_model, xgboost, pytorch, tensorflow,...
 framework: string;
 // training
 trainingDataUri?: string;
 trainingMetrics: Record<string, number>;
 validationMetrics: Record<string, number>;
 hyperparameters: Record<string, unknown>;
 features: string[];
 // metadata
 createdBy: string;
 createdAt: number;
 deployedAt?: number;
 // lineage
 parentVersion?: string;
 experimentId?: string;
 // serving
 servingEndpoint?: string;
 servingRuntime?: string;
 sizeBytes?: number;
 tags: string[];
 description?: string;
}

export interface RegisteredModel {
 id: string;
 name: string;
 description?: string;
 taskType: 'classification' | 'regression' | 'clustering' | 'ranking' | 'forecasting' | 'nlp' | 'vision';
 versions: ModelVersion[];
 currentProductionVersion?: string;
 createdAt: number;
 updatedAt: number;
 owner?: string;
 tags: string[];
}

export interface ModelStage {
 stage: 'training' | 'validation' | 'staging' | 'production';
 modelId: string;
 version: string;
 startedAt: number;
 finishedAt?: number;
 status: 'running' | 'success' | 'failed';
 metrics?: Record<string, number>;
 notes?: string;
}

// ---------- state ----------
const models = new Map<string, RegisteredModel>();
const stages: ModelStage[] = [];

let seq = 0;
function nextId(prefix: string): string {
 return `${prefix}_${Date.now()}_${++seq}`;
}

// ---------- model management ----------
export function createModel(model: Omit<RegisteredModel, 'id' | 'createdAt' | 'updatedAt' | 'versions'>): RegisteredModel {
 const m: RegisteredModel = {
...model,
 id: nextId('model'),
 versions: [],
 createdAt: Date.now(),
 updatedAt: Date.now(),
 };
 models.set(m.id, m);
 return m;
}

export function getModel(id: string): RegisteredModel | undefined {
 return models.get(id);
}

export function getModelByName(name: string): RegisteredModel | undefined {
 return Array.from(models.values()).find(m => m.name === name);
}

export function listModels(filter?: { taskType?: RegisteredModel['taskType']; tag?: string }): RegisteredModel[] {
 let result = Array.from(models.values());
 if (filter?.taskType) result = result.filter(m => m.taskType === filter.taskType);
 if (filter?.tag) result = result.filter(m => m.tags.includes(filter.tag!));
 return result;
}

export function deleteModel(id: string): boolean {
 return models.delete(id);
}

// ---------- version management ----------
export function registerVersion(modelId: string, version: Omit<ModelVersion, 'createdAt' | 'status'>): ModelVersion {
 const model = models.get(modelId);
 if (!model) throw new Error(`Model ${modelId} not found`);
 const v: ModelVersion = {
...version,
 version: version.version || nextVersion(model.versions),
 status: 'registered',
 createdAt: Date.now(),
 };
 model.versions.push(v);
 model.updatedAt = Date.now();
 models.set(modelId, model);
 return v;
}

function nextVersion(versions: ModelVersion[]): string {
 const maxMinor = versions
.map(v => parseInt(v.version.split('.').pop() || '0', 10))
.reduce((max, v) => Math.max(max, v), 0);
 return `1.${maxMinor + 1}.0`;
}

export function getVersion(modelId: string, version: string): ModelVersion | undefined {
 const model = models.get(modelId);
 if (!model) return undefined;
 return model.versions.find(v => v.version === version);
}

export function listVersions(modelId: string): ModelVersion[] {
 const model = models.get(modelId);
 if (!model) return [];
 return [...model.versions].sort((a, b) => b.createdAt - a.createdAt);
}

export function transitionStage(modelId: string, version: string, newStatus: ModelStatus, actor: string): ModelVersion | null {
 const model = models.get(modelId);
 if (!model) return null;
 const v = model.versions.find(ver => ver.version === version);
 if (!v) return null;
 const oldStatus = v.status;
 v.status = newStatus;
 if (newStatus === 'production') {
 v.deployedAt = Date.now();
 model.currentProductionVersion = version;
 // archive نسخه‌های production قبلی
 for (const other of model.versions) {
 if (other.version!== version && other.status === 'production') {
 other.status = 'archived';
 }
 }
 }
 model.updatedAt = Date.now();
 models.set(modelId, model);
 // ثبت stage
 stages.push({
 stage: newStatus === 'production'? 'production': newStatus === 'staging'? 'staging': 'validation',
 modelId,
 version,
 startedAt: Date.now(),
 finishedAt: Date.now(),
 status: 'success',
 notes: `Transitioned from ${oldStatus} to ${newStatus} by ${actor}`,
 });
 return v;
}

export function compareVersions(modelId: string, v1: string, v2: string): {
 v1: ModelVersion;
 v2: ModelVersion;
 metricsDiff: Record<string, number>;
 improvement: boolean;
} | null {
 const ver1 = getVersion(modelId, v1);
 const ver2 = getVersion(modelId, v2);
 if (!ver1 ||!ver2) return null;
 const metricsDiff: Record<string, number> = {};
 const allMetricNames = new Set([...Object.keys(ver1.validationMetrics),...Object.keys(ver2.validationMetrics)]);
 for (const name of allMetricNames) {
 const diff = (ver2.validationMetrics[name] || 0) - (ver1.validationMetrics[name] || 0);
 metricsDiff[name] = diff;
 }
 // برای metric‌هایی که بیشتر بهتر است (accuracy, r2, f1)
 const improvementMetrics = ['accuracy', 'r2', 'f1', 'precision', 'recall', 'auc'];
 const degradationMetrics = ['mse', 'rmse', 'mae', 'loss'];
 let improvement = true;
 for (const [name, diff] of Object.entries(metricsDiff)) {
 if (improvementMetrics.some(m => name.toLowerCase().includes(m)) && diff < 0) improvement = false;
 if (degradationMetrics.some(m => name.toLowerCase().includes(m)) && diff > 0) improvement = false;
 }
 return { v1: ver1, v2: ver2, metricsDiff, improvement };
}

// ---------- stages tracking ----------
export function listStages(filter?: { modelId?: string; status?: ModelStage['status'] }): ModelStage[] {
 let result = [...stages];
 if (filter?.modelId) result = result.filter(s => s.modelId === filter.modelId);
 if (filter?.status) result = result.filter(s => s.status === filter.status);
 return result.sort((a, b) => b.startedAt - a.startedAt);
}

// ---------- production serving ----------
export function getProductionModel(name: string): { model: RegisteredModel; version: ModelVersion } | null {
 const model = getModelByName(name);
 if (!model ||!model.currentProductionVersion) return null;
 const version = model.versions.find(v => v.version === model.currentProductionVersion);
 if (!version) return null;
 return { model, version };
}

export function getServingEndpoint(name: string): string | null {
 const prod = getProductionModel(name);
 if (!prod) return null;
 return prod.version.servingEndpoint || `/api/ml/models/${prod.model.id}/versions/${prod.version.version}/predict`;
}

// ---------- lineage ----------
export interface ModelLineage {
 model: RegisteredModel;
 versions: Array<{ version: ModelVersion; parent?: ModelVersion; children: ModelVersion[] }>;
}

export function getModelLineage(modelId: string): ModelLineage | null {
 const model = models.get(modelId);
 if (!model) return null;
 const versionMap = new Map(model.versions.map(v => [v.version, v]));
 const result = model.versions.map(v => ({
 version: v,
 parent: v.parentVersion? versionMap.get(v.parentVersion): undefined,
 children: model.versions.filter(child => child.parentVersion === v.version),
 }));
 return { model, versions: result };
}

// ---------- stats ----------
export function getRegistryStats(): {
 totalModels: number;
 totalVersions: number;
 byStatus: Record<ModelStatus, number>;
 byTaskType: Record<string, number>;
 productionModels: number;
 recentDeploys: Array<{ modelId: string; version: string; deployedAt: number }>;
} {
 const byStatus = {} as Record<ModelStatus, number>;
 const byTaskType: Record<string, number> = {};
 let totalVersions = 0;
 let productionModels = 0;
 const recentDeploys: Array<{ modelId: string; version: string; deployedAt: number }> = [];
 for (const model of models.values()) {
 byTaskType[model.taskType] = (byTaskType[model.taskType] || 0) + 1;
 totalVersions += model.versions.length;
 if (model.currentProductionVersion) productionModels++;
 for (const v of model.versions) {
 byStatus[v.status] = (byStatus[v.status] || 0) + 1;
 if (v.deployedAt) recentDeploys.push({ modelId: model.id, version: v.version, deployedAt: v.deployedAt });
 }
 }
 recentDeploys.sort((a, b) => b.deployedAt - a.deployedAt);
 return {
 totalModels: models.size,
 totalVersions,
 byStatus,
 byTaskType,
 productionModels,
 recentDeploys: recentDeploys.slice(0, 10),
 };
}

// ---------- defaults ----------
export function registerDefaultModels() {
 const churnModel = createModel({
 name: 'churn_predictor',
 description: 'پیش‌بینی ریزش مشتری',
 taskType: 'classification',
 owner: 'data-team',
 tags: ['churn', 'customer', 'production'],
 });
 registerVersion(churnModel.id, {
 version: '1.0.0',
 modelType: 'xgboost.XGBClassifier',
 framework: 'xgboost',
 trainingDataUri: 's3://hesab-ml/datasets/churn/2024-01.parquet',
 trainingMetrics: { accuracy: 0.82, logloss: 0.41 },
 validationMetrics: { accuracy: 0.81, precision: 0.78, recall: 0.82, f1: 0.80, auc: 0.87 },
 hyperparameters: { max_depth: 6, learning_rate: 0.1, n_estimators: 200, subsample: 0.8 },
 features: ['customer_total_revenue', 'customer_invoice_count', 'customer_tenure_days', 'customer_avg_order_value', 'customer_segment'],
 createdBy: 'auto-pipeline',
 servingEndpoint: '/api/ml/churn/predict',
 servingRuntime: 'onnx',
 sizeBytes: 4_500_000,
 tags: ['baseline'],
 description: 'نسخه‌ی اولیه با XGBoost',
 });
 registerVersion(churnModel.id, {
 version: '1.1.0',
 modelType: 'xgboost.XGBClassifier',
 framework: 'xgboost',
 trainingDataUri: 's3://hesab-ml/datasets/churn/2024-06.parquet',
 trainingMetrics: { accuracy: 0.85, logloss: 0.36 },
 validationMetrics: { accuracy: 0.84, precision: 0.81, recall: 0.85, f1: 0.83, auc: 0.90 },
 hyperparameters: { max_depth: 8, learning_rate: 0.05, n_estimators: 300, subsample: 0.85 },
 features: ['customer_total_revenue', 'customer_invoice_count', 'customer_tenure_days', 'customer_avg_order_value', 'customer_segment', 'customer_support_tickets'],
 createdBy: 'auto-pipeline',
 parentVersion: '1.0.0',
 tags: ['improved'],
 description: 'افزودن feature جدید و بهینه‌سازی hyperparameter',
 });
 transitionStage(churnModel.id, '1.1.0', 'production', 'ml-ops');

 const ltvModel = createModel({
 name: 'ltv_predictor',
 description: 'پیش‌بینی LTV مشتری',
 taskType: 'regression',
 owner: 'data-team',
 tags: ['ltv', 'customer'],
 });
 registerVersion(ltvModel.id, {
 version: '1.0.0',
 modelType: 'sklearn.linear_model.Ridge',
 framework: 'sklearn',
 trainingMetrics: { mse: 8.5e16, r2: 0.72 },
 validationMetrics: { mse: 8.7e16, mae: 95_000_000, r2: 0.71 },
 hyperparameters: { alpha: 1.0 },
 features: ['customer_total_revenue', 'customer_invoice_count', 'customer_tenure_days'],
 createdBy: 'auto-pipeline',
 tags: ['baseline'],
 });
 transitionStage(ltvModel.id, '1.0.0', 'staging', 'ml-ops');
}
