import {
  clinicTypeToTreatmentCode,
  normalizeClinicType,
  toTreatmentCode,
} from './treatment-code.util';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(toTreatmentCode('Hair Restoration') === 'HAIR_RESTORATION', 'hair restoration code');
assert(toTreatmentCode('hair transplant') === 'HAIR_RESTORATION', 'hair transplant alias');
assert(toTreatmentCode('FUE') === 'HAIR_RESTORATION', 'FUE alias');
assert(toTreatmentCode('IVF') === 'IVF', 'ivf unchanged');
assert(clinicTypeToTreatmentCode('hair-transplant') === 'HAIR_RESTORATION', 'normalized hair transplant');
assert(normalizeClinicType('hair-transplant') === 'hair transplant', 'normalize dashes');

console.log('treatment-code.util.spec.ts: all assertions passed');
