CREATE MIGRATION m1f4yja335dl7aynpukx5x5d6xwth7iikazdddjcrr2caftskvbroa
    ONTO m1yxcp6ibyqos343qaco45sgbnxxp4ptfeocpqfhwc424l2pmdhrhq
{
  ALTER TYPE default::User {
      ALTER PROPERTY role {
          SET default := (default::UserRole.User);
      };
  };
};
