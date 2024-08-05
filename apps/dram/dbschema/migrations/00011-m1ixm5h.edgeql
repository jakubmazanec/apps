CREATE MIGRATION m1ixm5hskadikrm2xa2mwqkueacx72w4zjc5pq7cfnag2v5hc3xk4a
    ONTO m1e4hyktdr2ylx5tsjhotyumd3bnhmwb7zvanpqenaqgufizsp4lvq
{
  ALTER TYPE default::User {
      CREATE REQUIRED MULTI LINK identities: ext::auth::Identity {
          SET REQUIRED USING (<ext::auth::Identity>{.identity});
          CREATE CONSTRAINT std::exclusive;
      };
      ALTER LINK identity {
          DROP CONSTRAINT std::exclusive;
      };
  };
  ALTER GLOBAL default::currentUser USING (std::assert_single((SELECT
      default::User {
          id,
          role
      }
  FILTER
      ((GLOBAL ext::auth::ClientTokenIdentity IN .identities) OR (.id ?= GLOBAL default::currentUserId))
  )));
  ALTER TYPE default::User {
      DROP LINK identity;
  };
};
