/**
 * Utility to generate Pix "Copia e Cola" payloads and QR Codes.
 * Follows the EMV (BR Code) standard defined by Banco Central do Brasil.
 */

/**
 * Calculate CRC16-CCITT checksum (polynomial 0x1021, init 0xFFFF).
 */
export function calculateCRC16(str: string): string {
  let crc = 0xFFFF;
  const polynomial = 0x1021;

  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      const bit = ((charCode >> (7 - j)) & 1) === 1;
      const c15 = ((crc >> 15) & 1) === 1;
      crc <<= 1;
      if (c15 !== bit) {
        crc ^= polynomial;
      }
    }
  }

  crc &= 0xFFFF;
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function formatEMV(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/**
 * Generate a valid Pix static payload string ("Copia e Cola").
 */
export function generatePixPayload({
  key,
  amount,
  name = "P2P ME",
  city = "SAO PAULO",
  txId = "***",
}: {
  key: string;
  amount: number;
  name?: string;
  city?: string;
  txId?: string;
}): string {
  const cleanKey = key.trim();
  const cleanName = name.replace(/[^\w\s]/g, "").slice(0, 25).trim() || "P2P ME";
  const cleanCity = city.replace(/[^\w\s]/g, "").slice(0, 15).trim() || "SAO PAULO";

  const merchantAccountInfo =
    formatEMV("00", "br.gov.bcb.pix") +
    formatEMV("01", cleanKey);

  const additionalData = formatEMV("05", txId);

  let payload =
    formatEMV("00", "01") + // Payload Format Indicator
    formatEMV("26", merchantAccountInfo) +
    formatEMV("52", "0000") + // Merchant Category Code
    formatEMV("53", "986") + // Transaction Currency (BRL)
    formatEMV("54", amount.toFixed(2)) + // Transaction Amount
    formatEMV("58", "BR") + // Country Code
    formatEMV("59", cleanName) + // Merchant Name
    formatEMV("60", cleanCity) + // Merchant City
    formatEMV("62", additionalData); // Additional Data

  payload += "6304"; // CRC16 Indicator + Length

  const crc = calculateCRC16(payload);
  return payload + crc;
}

/**
 * Get public HTTPS URL for a QR Code image representing the Pix payload.
 */
export function getPixQrCodeUrl(payload: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;
}
