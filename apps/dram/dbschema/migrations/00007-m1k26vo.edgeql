CREATE MIGRATION m1k26vox6f4j3j46ifxt62nyh4jsch6r6uraoyddi6d6iyjdffl4xa
    ONTO m1qartdx6hw2btsfzwcdwzraek4zmlwitmfswt42wbwvp56urbpvpa
{
  ALTER TYPE default::User {
      ALTER LINK identity {
          CREATE CONSTRAINT std::exclusive;
      };
  };
};
