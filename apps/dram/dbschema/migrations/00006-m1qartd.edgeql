CREATE MIGRATION m1qartdx6hw2btsfzwcdwzraek4zmlwitmfswt42wbwvp56urbpvpa
    ONTO m1f4yja335dl7aynpukx5x5d6xwth7iikazdddjcrr2caftskvbroa
{
  ALTER TYPE default::Note {
      ALTER LINK owner {
          SET default := (GLOBAL default::currentUser);
      };
  };
};
