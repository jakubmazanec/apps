CREATE MIGRATION m1iojcap6lzzdfmjbif4rxtird2fgbygqsduxm43b54qtvbk5a663q
    ONTO initial
{
  CREATE EXTENSION pgcrypto VERSION '1.3';
  CREATE EXTENSION auth VERSION '1.0';
  CREATE TYPE default::User {
      CREATE REQUIRED LINK identity: ext::auth::Identity;
      CREATE REQUIRED PROPERTY name: std::str;
  };
  CREATE GLOBAL default::currentUser := (std::assert_single((SELECT
      default::User
  FILTER
      (.identity = GLOBAL ext::auth::ClientTokenIdentity)
  )));
  CREATE TYPE default::Note {
      CREATE PROPERTY age: std::int64;
      CREATE PROPERTY balanceRating: std::float64;
      CREATE PROPERTY barCode: std::str;
      CREATE PROPERTY batch: std::str;
      CREATE PROPERTY bottleCode: std::str;
      CREATE PROPERTY bottleId: std::str;
      CREATE PROPERTY bottleNumber: std::int64;
      CREATE PROPERTY bottled: std::str;
      CREATE PROPERTY bottler: std::str;
      CREATE PROPERTY bottlesCount: std::int64;
      CREATE PROPERTY boughtAt: cal::local_date;
      CREATE PROPERTY brand: std::str;
      CREATE PROPERTY caskNnumber: std::str;
      CREATE PROPERTY caskType: std::str;
      CREATE PROPERTY color: std::str;
      CREATE PROPERTY distillery: std::str;
      CREATE PROPERTY edition: std::str;
      CREATE PROPERTY finish: std::str;
      CREATE PROPERTY finishRating: std::float64;
      CREATE PROPERTY name: std::str;
      CREATE PROPERTY nose: std::str;
      CREATE PROPERTY noseRating: std::float64;
      CREATE REQUIRED PROPERTY order: std::int64 {
          SET readonly := true;
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE PROPERTY rating: std::float64;
      CREATE PROPERTY score: std::float64;
      CREATE PROPERTY size: std::float64;
      CREATE PROPERTY strength: std::float64;
      CREATE PROPERTY taste: std::str;
      CREATE PROPERTY tasteRating: std::float64;
      CREATE PROPERTY tastedAt: cal::local_datetime;
      CREATE PROPERTY tastingLocation: std::str;
      CREATE PROPERTY vintage: std::str;
      CREATE PROPERTY whiskyId: std::str;
      CREATE PROPERTY whiskybaseUrl: std::str;
  };
};
