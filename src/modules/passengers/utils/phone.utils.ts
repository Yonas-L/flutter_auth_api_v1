/**
 * Validates Ethiopian phone numbers
 * Accepts formats: 0912345678, 251912345678, +251912345678
 */
export function validateEthiopianPhoneNumber(phone: string): boolean {
    const phoneRegex = /^(\+251|251|0)?[79]\d{8}$/;
    return phoneRegex.test(phone.replace(/\s+/g, ''));
}

/**
 * Normalizes phone number to international format (+251...)
 */
export function normalizePhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\s+/g, '');

    if (cleaned.startsWith('0')) {
        return '+251' + cleaned.substring(1);
    }
    if (cleaned.startsWith('251')) {
        return '+' + cleaned;
    }
    if (cleaned.startsWith('+251')) {
        return cleaned;
    }

    throw new Error('Invalid phone number format. Cannot normalize.');
}
