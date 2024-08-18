CREATE MIGRATION m1mogesvjskata775es2fzkrmhydxe35g5jlgm5z5me5kungrtda5q
    ONTO initial
{
  CREATE EXTENSION pgcrypto VERSION '1.3';
  CREATE EXTENSION auth VERSION '1.0';
  CREATE GLOBAL default::currentUserId -> std::uuid;
  CREATE SCALAR TYPE default::UserRole EXTENDING enum<Guest, Member, Admin>;
  CREATE TYPE default::User {
      CREATE REQUIRED MULTI LINK identities: ext::auth::Identity {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE REQUIRED PROPERTY name: std::str;
      CREATE REQUIRED PROPERTY role: default::UserRole {
          SET default := (default::UserRole.Guest);
      };
  };
  CREATE GLOBAL default::currentUser := (std::assert_single((SELECT
      default::User
  FILTER
      ((<std::bool>(GLOBAL ext::auth::ClientTokenIdentity IN .identities) ?? false) OR (.id ?= GLOBAL default::currentUserId))
  )));
  CREATE TYPE default::Note {
      CREATE ACCESS POLICY adminHasFullAccess
          ALLOW ALL USING (((GLOBAL default::currentUser).role ?= default::UserRole.Admin));
      CREATE REQUIRED LINK owner: default::User {
          SET default := (GLOBAL default::currentUser);
      };
      CREATE ACCESS POLICY authorHasFullAccess
          ALLOW ALL USING ((.owner.id ?= (GLOBAL default::currentUser).id));
      CREATE PROPERTY age: std::int64;
      CREATE PROPERTY balanceRating: std::float64;
      CREATE PROPERTY barCode: std::str;
      CREATE PROPERTY batch: std::str;
      CREATE PROPERTY bottleCode: std::str;
      CREATE PROPERTY bottleId: std::str;
      CREATE PROPERTY bottleNumber: std::str;
      CREATE PROPERTY bottled: std::str;
      CREATE PROPERTY bottler: std::str;
      CREATE PROPERTY bottlesCount: std::int64;
      CREATE PROPERTY boughtAt: cal::local_date;
      CREATE PROPERTY brand: std::str;
      CREATE PROPERTY caskNumber: std::str;
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
