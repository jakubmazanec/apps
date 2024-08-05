CREATE MIGRATION m1yxcp6ibyqos343qaco45sgbnxxp4ptfeocpqfhwc424l2pmdhrhq
    ONTO m1xhwznq2ycyxhuwfvgp4c64grikzr46gva4waunkupkjwhabv5zcq
{
  ALTER TYPE default::Note {
      CREATE REQUIRED LINK owner: default::User {
          SET REQUIRED USING (<default::User>{});
      };
      CREATE ACCESS POLICY authorHasFullAccess
          ALLOW ALL USING ((.owner ?= GLOBAL default::currentUser));
  };
  CREATE SCALAR TYPE default::UserRole EXTENDING enum<User, Admin>;
  ALTER TYPE default::User {
      CREATE REQUIRED PROPERTY role: default::UserRole {
          SET REQUIRED USING (<default::UserRole>{});
      };
  };
};
