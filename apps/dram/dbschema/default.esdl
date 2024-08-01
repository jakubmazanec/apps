using extension auth;

module default {
  global currentUser := (
    assert_single((
      select User
      filter .identity = global ext::auth::ClientTokenIdentity
    ))
  );

  type User {
    required name: str;
    required identity: ext::auth::Identity;
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
  }
};
