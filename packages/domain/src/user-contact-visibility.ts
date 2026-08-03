export interface RawUserContact {
  /** Whatever the caller decides is the "effective" email -- e.g. a member's contact-email override, falling back to their login email. */
  email: string | null;
  emailVisibleToCircle: boolean;
  phone: string | null;
  phoneVisibleToCircle: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** Governs `address`, `city`, `state`, and `zip` together as one mailing address. */
  addressVisibleToCircle: boolean;
}

export interface ShapedMemberContact {
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
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
    city: raw.addressVisibleToCircle ? raw.city : null,
    state: raw.addressVisibleToCircle ? raw.state : null,
    zip: raw.addressVisibleToCircle ? raw.zip : null,
  };
}
