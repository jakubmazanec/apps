CREATE MIGRATION m1e4hyktdr2ylx5tsjhotyumd3bnhmwb7zvanpqenaqgufizsp4lvq
    ONTO m14scsosujzzb5rp65xz426sggfmxb3ajzmpw7w7tl2ermy44xgwqq
{
  ALTER TYPE default::User {
      ALTER PROPERTY role {
          SET default := (default::UserRole.Guest);
      };
  };
  ALTER GLOBAL default::currentUser USING (std::assert_single((SELECT
      default::User {
          id,
          role
      }
  FILTER
      ((.identity ?= GLOBAL ext::auth::ClientTokenIdentity) OR (.id ?= GLOBAL default::currentUserId))
  )));
  ALTER TYPE default::Note {
      CREATE ACCESS POLICY adminHasFullAccess
          ALLOW ALL USING (((GLOBAL default::currentUser).role ?= default::UserRole.Admin));
      ALTER ACCESS POLICY authorHasFullAccess USING ((.owner.id ?= (GLOBAL default::currentUser).id));
  };
  ALTER SCALAR TYPE default::UserRole EXTENDING enum<Guest, Member, Admin>;
};
