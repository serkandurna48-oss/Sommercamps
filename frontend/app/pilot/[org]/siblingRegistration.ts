// Explicit allowlist: never transfer child data, extra answers or consents.
export interface ParentDetails {
  parentName: string
  parentEmail: string
  parentPhone: string
  emergencyPhone: string
  pickupAuthorized: string
}

export function parentDetailsOnly(source: ParentDetails): ParentDetails {
  return {
    parentName: source.parentName,
    parentEmail: source.parentEmail,
    parentPhone: source.parentPhone,
    emergencyPhone: source.emergencyPhone,
    pickupAuthorized: source.pickupAuthorized,
  }
}
