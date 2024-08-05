CREATE MIGRATION m1qq3mcivhva5zynn4b2oxpukugffpo43xrejoskgsj6wonchhllra
    ONTO m1k26vox6f4j3j46ifxt62nyh4jsch6r6uraoyddi6d6iyjdffl4xa
{
  CREATE GLOBAL default::currentUserId -> std::uuid;
  ALTER GLOBAL default::currentUser USING (std::assert_single((SELECT
      default::User
  FILTER
      ((.identity ?= GLOBAL ext::auth::ClientTokenIdentity) OR (.id ?= GLOBAL default::currentUserId))
  )));
};
