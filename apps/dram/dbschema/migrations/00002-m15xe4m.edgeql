CREATE MIGRATION m15xe4mfi2nzj3z2svbmk56g3jq56pf4bhpjgk5ncvz5bo7hepcn5q
    ONTO m1mogesvjskata775es2fzkrmhydxe35g5jlgm5z5me5kungrtda5q
{
  CREATE TYPE default::Bottler {
      CREATE ACCESS POLICY adminHasFullAccess
          ALLOW ALL USING (((GLOBAL default::currentUser).role ?= default::UserRole.Admin));
      CREATE ACCESS POLICY anyoneCanRead
          ALLOW SELECT ;
      CREATE REQUIRED PROPERTY name: std::str;
  };
  CREATE TYPE default::Distillery {
      CREATE ACCESS POLICY adminHasFullAccess
          ALLOW ALL USING (((GLOBAL default::currentUser).role ?= default::UserRole.Admin));
      CREATE ACCESS POLICY anyoneCanRead
          ALLOW SELECT ;
      CREATE REQUIRED PROPERTY name: std::str;
  };
  CREATE SCALAR TYPE default::BottlingType EXTENDING enum<SingleMalt, BlendedMalt, Blended, SinglePotStill, Bourbon, Rye, Grain>;
  CREATE TYPE default::Bottling {
      CREATE PROPERTY bottledParts: array<std::int64>;
      CREATE PROPERTY vintageParts: array<std::int64>;
      CREATE LINK bottler: default::Bottler {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE RESTRICT;
      };
      CREATE ACCESS POLICY adminHasFullAccess
          ALLOW ALL USING (((GLOBAL default::currentUser).role ?= default::UserRole.Admin));
      CREATE ACCESS POLICY anyoneCanRead
          ALLOW SELECT ;
      CREATE MULTI LINK distilleries: default::Distillery {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE RESTRICT;
      };
      CREATE PROPERTY batchName: std::str;
      CREATE PROPERTY batchNumber: std::int64;
      CREATE PROPERTY batchSubtitle: std::str;
      CREATE PROPERTY bottled: std::str;
      CREATE PROPERTY bottledFor: std::str;
      CREATE PROPERTY bottlesCount: std::int64;
      CREATE PROPERTY brand: std::str;
      CREATE PROPERTY caskNumbers: array<std::str>;
      CREATE PROPERTY caskTypes: array<std::str>;
      CREATE PROPERTY computedAge: std::float64;
      CREATE PROPERTY country: std::str;
      CREATE PROPERTY displayNameParts: array<std::str>;
      CREATE PROPERTY isCaskStrength: std::bool;
      CREATE PROPERTY isNonChillFiltered: std::bool;
      CREATE PROPERTY isNonColored: std::bool;
      CREATE PROPERTY isSingleCask: std::bool;
      CREATE PROPERTY label: std::str;
      CREATE PROPERTY links: array<std::str>;
      CREATE PROPERTY name: std::str;
      CREATE PROPERTY region: std::str;
      CREATE PROPERTY seriesEntryName: std::str;
      CREATE PROPERTY seriesEntryNumber: std::int64;
      CREATE PROPERTY seriesName: std::str;
      CREATE PROPERTY statedAge: std::int64;
      CREATE PROPERTY strength: std::float64;
      CREATE PROPERTY subtitle: std::str;
      CREATE PROPERTY type: default::BottlingType;
      CREATE PROPERTY vintage: std::str;
  };
  CREATE TYPE default::Bottle {
      CREATE ACCESS POLICY adminHasFullAccess
          ALLOW ALL USING (((GLOBAL default::currentUser).role ?= default::UserRole.Admin));
      CREATE REQUIRED LINK owner: default::User {
          SET default := (GLOBAL default::currentUser);
      };
      CREATE ACCESS POLICY ownerHasFullAccess
          ALLOW ALL USING ((.owner.id ?= (GLOBAL default::currentUser).id));
      CREATE REQUIRED LINK bottling: default::Bottling {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE DELETE SOURCE;
      };
      CREATE PROPERTY barCode: std::str;
      CREATE PROPERTY bottleCode: std::str;
      CREATE PROPERTY bottleNumber: std::int64;
      CREATE PROPERTY price: tuple<value: std::float64, currency: std::str>;
      CREATE PROPERTY volume: std::float64;
      CREATE PROPERTY whiskybaseId: std::str;
  };
  ALTER TYPE default::Bottling {
      CREATE MULTI LINK bottles := (.<bottling[IS default::Bottle]);
  };
  CREATE TYPE default::Tasting {
      CREATE REQUIRED LINK bottle: default::Bottle {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE DELETE SOURCE;
      };
      CREATE ACCESS POLICY adminHasFullAccess
          ALLOW ALL USING (((GLOBAL default::currentUser).role ?= default::UserRole.Admin));
      CREATE REQUIRED LINK owner: default::User {
          SET default := (GLOBAL default::currentUser);
      };
      CREATE ACCESS POLICY ownerHasFullAccess
          ALLOW ALL USING ((.owner.id ?= (GLOBAL default::currentUser).id));
      CREATE PROPERTY finish: std::str;
      CREATE REQUIRED PROPERTY location: std::str;
      CREATE PROPERTY nose: std::str;
      CREATE PROPERTY price: tuple<value: std::float64, currency: std::str>;
      CREATE PROPERTY rating: tuple<std::float64, std::float64, std::float64, std::float64>;
      CREATE PROPERTY taste: std::str;
      CREATE REQUIRED PROPERTY tastedAt: std::datetime;
      CREATE PROPERTY volume: std::float64;
  };
  ALTER TYPE default::Bottle {
      CREATE MULTI LINK tastings := (.<bottle[IS default::Tasting]);
  };
  ALTER TYPE default::Note {
      ALTER ACCESS POLICY authorHasFullAccess RENAME TO ownerHasFullAccess;
  };
  ALTER TYPE default::User {
      CREATE ACCESS POLICY adminHasFullAccess
          ALLOW ALL USING (((GLOBAL default::currentUser).role ?= default::UserRole.Admin));
      CREATE ACCESS POLICY ownerHasLimitedAccess
          ALLOW SELECT, UPDATE USING ((.id ?= (GLOBAL default::currentUser).id));
  };
};
