using extension auth;

module default {
  global currentUserId: uuid;
  global currentUser := (
    assert_single((
      select User
      filter global ext::auth::ClientTokenIdentity in .identities or .id ?= global currentUserId
    ))
  );

  scalar type UserRole extending enum<Guest, Member, Admin>;

  type User {
    required name: str;
    required multi identities: ext::auth::Identity {
        constraint exclusive;
    };
    required role: UserRole {
      default := UserRole.Guest;
    };

    # access policy authorHasFullAccess
    #   allow all
    #   using (.id ?= global currentUser.id);

    # access policy adminHasFullAccess
    #   allow all
    #   using (global currentUser.role ?= UserRole.Admin);
  }

  type Note {
    required order: int64 {
      constraint exclusive;
      readonly := true;
    }
    bottleId: str;
    whiskyId: str;
    brand: str;
    distillery: str;
    bottler: str;
    name: str;
    edition: str;
    batch: str;
    age: int64;
    vintage: str;
    bottled: str;
    caskType: str;
    caskNumber: str;
    strength: float64;
    size: float64;
    bottlesCount: int64;
    noseRating: float64;
    tasteRating: float64;
    finishRating: float64;
    balanceRating: float64;
    score: float64;
    rating: float64;
    tastedAt: cal::local_datetime;
    tastingLocation: str;
    color: str;
    nose: str;
    taste: str;
    finish: str;
    bottleNumber: str;
    barCode: str;
    bottleCode: str;
    boughtAt: cal::local_date;
    whiskybaseUrl: str;

    required owner: User {
      default := global currentUser;
    };

    access policy authorHasFullAccess
      allow all
      using (.owner.id ?= global currentUser.id);

    access policy adminHasFullAccess
      allow all
      using (global currentUser.role ?= UserRole.Admin);
  }
};
