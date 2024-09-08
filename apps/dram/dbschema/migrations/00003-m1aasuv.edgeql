CREATE MIGRATION m1aasuvju7ozvjcz4q2swc24x7p35l6ksvposfti2pk7ipgueupm3a
    ONTO m15xe4mfi2nzj3z2svbmk56g3jq56pf4bhpjgk5ncvz5bo7hepcn5q
{
  CREATE GLOBAL default::isAdmin -> std::bool;
  ALTER TYPE default::User {
      ALTER ACCESS POLICY adminHasFullAccess USING ((((GLOBAL default::currentUser).role ?= default::UserRole.Admin) OR (GLOBAL default::isAdmin ?= true)));
  };
};
