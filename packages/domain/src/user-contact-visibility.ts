export interface RawUserContact {
  email: string | null;
  emailVisibleToCircle: boolean;
  phone: string | null;
  phoneVisibleToCircle: boolean;
  address: string | null;
  addressVisibleToCircle: boolean;
}

export interface ShapedMemberContact {
  email: string | null;
  phone: string | null;
  address: string | null;
}

/**
 * A member's contact fields are only ever shared with fellow Circle members
 * when that member has explicitly turned on the corresponding visibility
 * flag -- the caller does not need to separately verify that the viewer
 * shares a Circle with this member, since callers only reach this shaping
 * step after already confirming that (e.g. the Circle members list only
 * lists people the viewer is already an active member alongside).
 */
export function shapeMemberContact(raw: RawUserContact): ShapedMemberContact {
  return {
    email: raw.emailVisibleToCircle ? raw.email : null,
    phone: raw.phoneVisibleToCircle ? raw.phone : null,
    address: raw.addressVisibleToCircle ? raw.address : null,
  };
}
