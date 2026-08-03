import { describe, expect, it } from 'vitest';
import { shapeMemberContact, type RawUserContact } from './user-contact-visibility.js';

function raw(overrides: Partial<RawUserContact> = {}): RawUserContact {
  return {
    email: 'ana@example.com',
    emailVisibleToCircle: false,
    phone: '555-0100',
    phoneVisibleToCircle: false,
    address: '123 Maple St',
    city: 'Springfield',
    state: 'IL',
    zip: '62704',
    addressVisibleToCircle: false,
    ...overrides,
  };
}

describe('shapeMemberContact', () => {
  it('hides every field by default', () => {
    expect(shapeMemberContact(raw())).toEqual({
      email: null,
      phone: null,
      address: null,
      city: null,
      state: null,
      zip: null,
    });
  });

  it('reveals only the fields whose visibility flag is on', () => {
    expect(shapeMemberContact(raw({ emailVisibleToCircle: true }))).toEqual({
      email: 'ana@example.com',
      phone: null,
      address: null,
      city: null,
      state: null,
      zip: null,
    });
    expect(shapeMemberContact(raw({ phoneVisibleToCircle: true }))).toEqual({
      email: null,
      phone: '555-0100',
      address: null,
      city: null,
      state: null,
      zip: null,
    });
  });

  it('reveals street, city, state, and zip together under the single address visibility flag', () => {
    expect(shapeMemberContact(raw({ addressVisibleToCircle: true }))).toEqual({
      email: null,
      phone: null,
      address: '123 Maple St',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
    });
  });

  it('reveals all fields when every flag is on', () => {
    expect(
      shapeMemberContact(
        raw({ emailVisibleToCircle: true, phoneVisibleToCircle: true, addressVisibleToCircle: true }),
      ),
    ).toEqual({
      email: 'ana@example.com',
      phone: '555-0100',
      address: '123 Maple St',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
    });
  });

  it('stays null for a visible field with no underlying value', () => {
    expect(shapeMemberContact(raw({ phone: null, phoneVisibleToCircle: true }))).toEqual({
      email: null,
      phone: null,
      address: null,
      city: null,
      state: null,
      zip: null,
    });
    expect(shapeMemberContact(raw({ city: null, state: null, zip: null, addressVisibleToCircle: true }))).toEqual({
      email: null,
      phone: null,
      address: '123 Maple St',
      city: null,
      state: null,
      zip: null,
    });
  });
});
