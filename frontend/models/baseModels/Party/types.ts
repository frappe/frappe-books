export type PartyRole = 'Both' | 'Supplier' | 'Customer';
export enum PartyRoleEnum {
  'Both' = 'Both',
  'Supplier' = 'Supplier',
  'Customer' = 'Customer',
}

/** A party as bridge docs read it, by Books field name. */
export interface BridgeParty {
  role?: PartyRole;
  defaultAccount?: string;
}
