/**
 * Normalizes a phone number to standard E.164 format.
 *
 * @param countryCode The country calling code (e.g. "+234")
 * @param phonePart The user inputted phone number string
 * @returns Normalized phone number starting with + or null if empty
 */
export function formatPhoneNumber(countryCode: string, phonePart: string): string | null {
  const cleaned = phonePart.replace(/\D/g, ''); // strip all non-digits
  if (!cleaned) return null;

  // Get digits of country code (e.g. "+234" -> "234")
  const ccDigits = countryCode.replace(/\D/g, '');

  let localNumber = cleaned;
  // If the input starts with the country code digits, strip them to avoid duplicates
  if (localNumber.startsWith(ccDigits)) {
    localNumber = localNumber.slice(ccDigits.length);
  }

  // Strip any leading zeros from the local number
  while (localNumber.startsWith('0')) {
    localNumber = localNumber.slice(1);
  }

  return countryCode + localNumber;
}
