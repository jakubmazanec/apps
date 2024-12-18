using extension auth;
using extension pg_trgm;

module default {
  global currentUserId: uuid;
  global isAdmin: bool;
  global currentUser := (
    assert_single((
      select User
      filter (<bool>(global ext::auth::ClientTokenIdentity in .identities) ?? false) or .id ?= global currentUserId
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

    access policy ownerHasLimitedAccess
      allow select, update
      using (.id ?= global currentUser.id);

    access policy adminHasFullAccess
      allow all
      using (global currentUser.role ?= UserRole.Admin or global isAdmin ?= true);
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

    index ext::pg_trgm::gin on (.brand);
    index ext::pg_trgm::gin on (.distillery);
    index ext::pg_trgm::gin on (.bottler);
    index ext::pg_trgm::gin on (.name);
    index ext::pg_trgm::gin on (.edition);
    index ext::pg_trgm::gin on (.batch);
    index ext::pg_trgm::gin on (to_str(.age));
    index ext::pg_trgm::gin on (.vintage);
    index ext::pg_trgm::gin on (.bottled);
    index ext::pg_trgm::gin on (.caskType);
    index ext::pg_trgm::gin on (.caskNumber);
    index ext::pg_trgm::gin on (to_str(.strength * 100));

    access policy ownerHasFullAccess
      allow all
      using (.owner.id ?= global currentUser.id);

    access policy adminHasFullAccess
      allow all
      using (global currentUser.role ?= UserRole.Admin);
  }

  type Distillery {
    required name: str;

    access policy anyoneCanRead
      allow select;

    access policy adminHasFullAccess
      allow all
      using (global currentUser.role ?= UserRole.Admin);
  }

  type Bottler {
    required name: str;

    access policy anyoneCanRead
      allow select;

    access policy adminHasFullAccess
      allow all
      using (global currentUser.role ?= UserRole.Admin);
  }

  scalar type BottlingType extending enum<SingleMalt, BlendedMalt, Blended, SinglePotStill, Bourbon, Rye, Grain>;

  type Bottling {
    type: BottlingType;
    country: str;
    region: str;
    brand: str; # e.g. "Octomore", "Bruichladdich", or "Ardbeg"
    multi distilleries: Distillery {
      on target delete restrict;
      on source delete allow;
    }
    bottler: Bottler {
      on target delete restrict;
      on source delete allow;
    }

    displayNameParts: array<str>; # used for overriding default naming schema
    name: str; # e.g. "Kelpie" in "Ardbeg Kelpie"
    subtitle: str; # e.g. "Dark & Intense" in "Bowmore 10 yo Dark & Intense"
    batchName: str; # e.g. "batch 063" as is on the label of "Aberlour A’bunadh batch #63"
    batchNumber: int64; # e.g. "63" as in "Aberlour A’bunadh batch #63"
    batchSubtitle: str; # e.g. "Limitied release" or "Small batch"
    seriesName: str; # e.g. Glenfiddich's "Experimental series" or Glenglassaug's "Wood fisnishes"; a series is a collection of different but thematically more or less interconnected whiskies, whereas batches are versions of whisky that do not change much over time, at most varying perhaps in the use of different barrels.
    seriesEntryName: str; # e.g. Glenfiddich's "Winter storm" 21 yo
    seriesEntryNumber: int64; # e.g. "3" as in "Glenfiddich Winter storm 21 yo"

    vintage: str;
    vintageParts: array<int64>;
    bottled: str;
    bottledParts: array<int64>;
    statedAge: int64;
    computedAge: float64;

    caskTypes: array<str>;
    caskNumbers: array<str>;
    bottlesCount: int64;
    strength: float64;

    isNonColored: bool;
    isNonChillFiltered: bool;
    isCaskStrength: bool;
    isSingleCask: bool;

    label: str; # Visual description of the bottling label
    bottledFor: str; # Sometimes bottle is bottled for some organization or a specific person
    links: array<str>;

    multi bottles := .<bottling[is Bottle];

    access policy anyoneCanRead
      allow select;

    access policy adminHasFullAccess
      allow all
      using (global currentUser.role ?= UserRole.Admin);
  }

  type Bottle {
    required bottling: Bottling {
      on target delete delete source;
      on source delete allow;
    };

    bottleNumber: int64;
    bottleCode: str;
    barCode: str;
    whiskybaseId: str;

    volume: float64; # bottle volume in litres
    price: tuple<value: float64, currency: str>;

    multi tastings := .<bottle[is Tasting];

    required owner: User {
      default := global currentUser;
    };

    access policy ownerHasFullAccess
      allow all
      using (.owner.id ?= global currentUser.id);

    access policy adminHasFullAccess
      allow all
      using (global currentUser.role ?= UserRole.Admin);
  }

  type Tasting {
    required bottle: Bottle {
      on target delete delete source;
      on source delete allow;
    }

    nose: str;
    taste: str;
    finish: str;
    rating: tuple<float64, float64, float64, float64>;

    volume: float64; # tasting sample size in litres
    price: tuple<value: float64, currency: str>;
    required tastedAt: datetime;
    required location: str;

    required owner: User {
      default := global currentUser;
    };

    access policy ownerHasFullAccess
      allow all
      using (.owner.id ?= global currentUser.id);

    access policy adminHasFullAccess
      allow all
      using (global currentUser.role ?= UserRole.Admin);
  }
};
