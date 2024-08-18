CREATE MIGRATION m1bjrd7deh2h45gywbxqqoo4gvhrkrezysqp23e3wowme57itmeloa
    ONTO m13t7soa2zf3tqwoo6jyhpvomdod6wdmxjhqvfz6xbnmdlx36wu5ea
{
  ALTER GLOBAL default::currentUser USING (std::assert_single((SELECT
      default::User
  FILTER
      ((<std::bool>(GLOBAL ext::auth::ClientTokenIdentity IN .identities) ?? false) OR (.id ?= GLOBAL default::currentUserId))
  )));
};
