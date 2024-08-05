CREATE MIGRATION m13t7soa2zf3tqwoo6jyhpvomdod6wdmxjhqvfz6xbnmdlx36wu5ea
    ONTO m1ixm5hskadikrm2xa2mwqkueacx72w4zjc5pq7cfnag2v5hc3xk4a
{
  ALTER GLOBAL default::currentUser USING (std::assert_single((SELECT
      default::User
  FILTER
      ((GLOBAL ext::auth::ClientTokenIdentity IN .identities) OR (.id ?= GLOBAL default::currentUserId))
  )));
};
