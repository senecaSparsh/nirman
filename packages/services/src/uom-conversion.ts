import type { Decimal } from "decimal.js";

/**
 * UOM (Unit of Measure) Conversion — pure functions for converting
 * between a material's base unit and its optional secondary unit.
 *
 * baseUnit       = the normalized storage/tracking UOM (e.g. "KG", "M3", "PCS")
 * secondaryUnit  = an optional display/transaction UOM (e.g. "TON", "BAG")
 * uomConversionFactor = multiplier: 1 secondary unit = N base units
 *
 * Example: Cement purchased in BAGs but tracked in KG.
 *   baseUnit = "KG", secondaryUnit = "BAG", conversionFactor = 50
 *   → 1 BAG = 50 KG
 *
 * All stock quantities are stored in the baseUnit. When a user enters
 * a quantity in the secondaryUnit, toBaseUnit() converts it before storage.
 */

export interface UomMaterial {
  baseUnit: string;
  secondaryUnit?: string | null;
  uomConversionFactor?: Decimal | null;
}

/**
 * Converts a quantity from the secondary unit to the base unit.
 * If the material has no secondary unit or conversion factor, the
 * quantity is returned unchanged (already in base units).
 *
 * @param qty   quantity in secondary units (or base units if no conversion)
 * @param material  the material with UOM fields
 * @returns quantity in base units
 */
export function toBaseUnit(qty: number, material: UomMaterial): number {
  if (!material.secondaryUnit || !material.uomConversionFactor) return qty;
  return qty * Number(material.uomConversionFactor);
}

/**
 * Converts a quantity from the base unit to the secondary unit.
 * If the material has no secondary unit or conversion factor, the
 * quantity is returned unchanged.
 *
 * @param qty   quantity in base units
 * @param material  the material with UOM fields
 * @returns quantity in secondary units
 */
export function toSecondaryUnit(qty: number, material: UomMaterial): number {
  if (!material.secondaryUnit || !material.uomConversionFactor) return qty;
  return qty / Number(material.uomConversionFactor);
}

/**
 * Formats a base-unit quantity for display, showing both the secondary
 * and base unit representations when a conversion is configured.
 *
 * Examples:
 *   No conversion:  "150 KG"
 *   With conversion: "3 BAG (150 KG)"
 *
 * @param qty   quantity in base units
 * @param material  the material with UOM fields
 * @returns human-readable display string
 */
export function displayQty(qty: number, material: UomMaterial): string {
  if (!material.secondaryUnit || !material.uomConversionFactor) {
    return `${qty} ${material.baseUnit}`;
  }
  const secondary = toSecondaryUnit(qty, material);
  return `${secondary} ${material.secondaryUnit} (${qty} ${material.baseUnit})`;
}
