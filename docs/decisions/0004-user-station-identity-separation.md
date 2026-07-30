# 4. Separate identity (user) from participation (station)

## Status

Accepted

## Context

A single person might own multiple stations (a home base and a handheld
go-kit), and a single station (an organization's fixed repeater station,
for example) might be operated by a role rather than tied to one person's
identity forever. Radio Circle membership, coordinator assignment, and
message-relay willingness are all properties of a *station's participation*
in a Circle, not properties of a person's account.

## Decision

Model **users** and **stations** as separate entities with a one-to-many
relationship (`stations.ownerId -> users.id`), and make **circle
memberships** reference `stationId`, not `userId`, directly
(`circle_memberships.stationId`). A user's identity (`users`,
`user_identities` for provider-linked identities like Cognito subjects,
`sessions`) is entirely about authentication and account-level settings. A
station's identity (name, type, capabilities, location, goals,
visibility) is entirely about radio participation.

## Consequences

- Adding a second station to your account (e.g. a go-kit alongside your
  home base) doesn't require creating a second user account or duplicating
  Circle memberships -- it's just a new row in `stations`.
- Circle rosters, coordinator counts, and member-role changes all operate
  on stations, which matches how the product frames a Circle ("which
  stations are in this Circle and who's a coordinator") rather than "which
  people are in this Circle."
- Authorization checks (`packages/domain`'s `canEditStation`,
  `canManageMembers`, etc.) take both the acting user's ID and the
  station's `ownerId` as separate inputs, which keeps them straightforward
  to unit test without a database.
- If a future requirement needs a station operated by more than one person
  (e.g. a shared organization station with multiple authorized operators),
  that's an additive change to the stations/users relationship rather than
  a rework of the Circle membership model, since memberships already point
  at stations, not users.
