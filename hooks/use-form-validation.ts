"use client";

import * as React from "react";
import {
 validateField,
 type ValidationRule,
} from "@/lib/form-validation";

/* ============ use-form-validation.ts ============
 *
 * Hook مدیریت وضعیت فرم با اعتبارسنجی real-time.
 *
 * ویژگی‌ها:
 * - اعتبارسنجی on-change (محاسبه‌ی خطاها به‌محض تغییر)
 * - نمایش خطا فقط بعد از blur (تا تجربه‌ی کاربر آزاردهنده نباشد)
 * - validateAll() برای لحظه‌ی submit (همه‌ی فیلدها را touched می‌کند)
 * - isValid — معتبر بودن کل فرم
 * - پشتیبانی از فیلدهای سفارشی با Record<keyof T, ValidationRule>
 *
 * @example
 * const { values, errors, touched, handleChange, handleBlur, validateAll, isValid } =
 * useFormValidation(
 * { name: "", email: "" },
 * { name: { required: true }, email: { required: true, email: true } }
 * );
 */

export interface FormValidationState<T extends Record<string, string>> {
 values: T;
 errors: Partial<Record<keyof T, string[]>>;
 touched: Partial<Record<keyof T, boolean>>;
 valid: Record<keyof T, boolean>;
 isValid: boolean;
 handleChange: <K extends keyof T>(field: K, value: string) => void;
 handleBlur: <K extends keyof T>(field: K) => void;
 setFieldValue: <K extends keyof T>(field: K, value: string) => void;
 setFieldTouched: <K extends keyof T>(field: K, touched?: boolean) => void;
 setValues: (values: Partial<T>) => void;
 validateAll: () => boolean;
 reset: (values?: Partial<T>) => void;
}

export function useFormValidation<T extends Record<string, string>>(
 initialValues: T,
 validationRules: Record<keyof T, ValidationRule>
): FormValidationState<T> {
 const [values, setValuesState] = React.useState<T>(initialValues);
 const [touched, setTouched] = React.useState<
 Partial<Record<keyof T, boolean>>
 >({});

 // محاسبه‌ی خطاها در هر رندر (ارزان‌قیمت)
 const errors = React.useMemo(() => {
 const out: Partial<Record<keyof T, string[]>> = {};
 for (const key in validationRules) {
 if (!Object.prototype.hasOwnProperty.call(validationRules, key)) continue;
 out[key] = validateField(values[key]?? "", validationRules[key]);
 }
 return out;
 }, [values, validationRules]);

 const valid = React.useMemo(() => {
 const out = {} as Record<keyof T, boolean>;
 for (const key in validationRules) {
 if (!Object.prototype.hasOwnProperty.call(validationRules, key)) continue;
 out[key] = (errors[key]?? []).length === 0;
 }
 return out;
 }, [errors, validationRules]);

 const isValid = React.useMemo(() => {
 return Object.keys(validationRules).every(
 (key) => (errors[key as keyof T]?? []).length === 0
 );
 }, [errors, validationRules]);

 const handleChange = React.useCallback(
 <K extends keyof T>(field: K, value: string) => {
 setValuesState((prev) => ({...prev, [field]: value }));
 },
 []
 );

 const handleBlur = React.useCallback(<K extends keyof T>(field: K) => {
 setTouched((prev) => ({...prev, [field]: true }));
 }, []);

 const setFieldValue = React.useCallback(
 <K extends keyof T>(field: K, value: string) => {
 setValuesState((prev) => ({...prev, [field]: value }));
 },
 []
 );

 const setFieldTouched = React.useCallback(
 <K extends keyof T>(field: K, isTouched: boolean = true) => {
 setTouched((prev) => ({...prev, [field]: isTouched }));
 },
 []
 );

 const setValues = React.useCallback((partial: Partial<T>) => {
 setValuesState((prev) => ({...prev,...partial }));
 }, []);

 const validateAll = React.useCallback(() => {
 const allTouched: Partial<Record<keyof T, boolean>> = {};
 for (const key in validationRules) {
 if (!Object.prototype.hasOwnProperty.call(validationRules, key)) continue;
 allTouched[key] = true;
 }
 setTouched(allTouched);
 return isValid;
 }, [isValid, validationRules]);

 const reset = React.useCallback(
 (partial?: Partial<T>) => {
 setValuesState({...initialValues,...partial });
 setTouched({});
 },
 [initialValues]
 );

 return {
 values,
 errors,
 touched,
 valid,
 isValid,
 handleChange,
 handleBlur,
 setFieldValue,
 setFieldTouched,
 setValues,
 validateAll,
 reset,
 };
}

export default useFormValidation;
